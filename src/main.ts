import { GlassesController } from './app/glassesController'
import { createProvidersFactory } from './app/providers'
import { ConversationSession } from './app/session'
import { BridgeAudioInput } from './audio/input'
import { connectBridge } from './bridge/connect'
import { persistTrace, startRuntimeWatch, trace } from './diag/trace'
import { EventHub } from './bridge/hub'
import { attachPreviewKeys, previewRenderBridge } from './bridge/preview'
import { BridgeQueue } from './bridge/queue'
import { GlassesRenderer } from './display/renderer'
import { createTranslator, resolveLanguage, type Translate, type UiLanguage } from './i18n'
import { KeyStore } from './settings/keys'
import { BridgeKeyValueStore, LocalKeyValueStore } from './settings/kv'
import type { Settings } from './settings/schema'
import { SettingsStore } from './settings/store'
import { STT_PROVIDERS } from './stt/registry'
import { mountUi } from './ui/app'

async function bootstrap() {
  const root = document.querySelector<HTMLDivElement>('#app')!
  startRuntimeWatch()
  const queue = new BridgeQueue()
  const bridge = await connectBridge()
  const inEvenApp = bridge !== null
  trace('boot', 'bridge', { inEvenApp })

  if (bridge) bridge.onLaunchSource(source => trace('boot', 'launch source', { source }))
  const kv = bridge ? new BridgeKeyValueStore(bridge, queue) : new LocalKeyValueStore()
  const settings = new SettingsStore(kv)
  await settings.load()
  await persistTrace(kv)
  const keys = new KeyStore(kv)
  await keys.load(STT_PROVIDERS.map(p => p.id))

  let translate: Translate = translatorFor(settings.get())
  let uiLanguage = languageFor(settings.get())

  const hub = new EventHub()
  if (bridge) hub.attach(bridge)
  else attachPreviewKeys(hub)

  const audio = bridge ? new BridgeAudioInput(bridge, queue, hub) : null
  const session = new ConversationSession({
    audio,
    settings: () => settings.get(),
    createProviders: createProvidersFactory(keys),
    fallbackLanguage: () => uiLanguage,
  })

  const glassesBridge = bridge ?? previewRenderBridge
  const renderer = new GlassesRenderer(glassesBridge, queue)

  const shutdown = async () => {
    await session.stop()
    await settings.flush()
    hub.detach()
  }

  const controller = new GlassesController({
    bridge: glassesBridge,
    queue,
    hub,
    renderer,
    session,
    translate: () => translate,
    onExit: shutdown,
  })

  // The glasses page must exist before the glasses mic can be opened.
  const pageOk = await renderer.init(controller.view())
  trace('boot', 'glasses page', { ok: pageOk })
  controller.start()

  const ui = mountUi(root, {
    session,
    settings,
    keys,
    t: () => translate,
    glassesView: () => controller.view(),
    inEvenApp,
    audio,
    showOnGlasses: text => {
      if (text === null) controller.refresh()
      else void renderer.render({ ...controller.view(), header: 'DIAGNOSTICS', body: text })
    },
  })

  settings.subscribe(next => {
    translate = translatorFor(next)
    uiLanguage = languageFor(next)
    controller.refresh()
    ui.refresh()
  })

  window.addEventListener('pagehide', () => void shutdown())
}

function languageFor(settings: Settings): UiLanguage {
  return settings.uiLanguage === 'auto' ? resolveLanguage(navigator.languages ?? [navigator.language]) : settings.uiLanguage
}

function translatorFor(settings: Settings): Translate {
  return createTranslator(languageFor(settings))
}

void bootstrap()
