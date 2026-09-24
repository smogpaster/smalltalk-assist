import { GlassesController } from './app/glassesController'
import { createProviders } from './app/providers'
import { ConversationSession } from './app/session'
import { BridgeAudioInput } from './audio/input'
import { connectBridge } from './bridge/connect'
import { startRuntimeWatch, trace } from './diag/trace'
import { EventHub } from './bridge/hub'
import { attachPreviewKeys, previewRenderBridge } from './bridge/preview'
import { BridgeQueue } from './bridge/queue'
import { GlassesRenderer } from './display/renderer'
import { createTranslator, resolveLanguage, type Translate } from './i18n'
import { BridgeKeyValueStore, LocalKeyValueStore } from './settings/kv'
import type { Settings } from './settings/schema'
import { SettingsStore } from './settings/store'
import { mountUi } from './ui/app'

async function bootstrap() {
  const root = document.querySelector<HTMLDivElement>('#app')!
  startRuntimeWatch()
  const queue = new BridgeQueue()
  const bridge = await connectBridge()
  const inEvenApp = bridge !== null
  trace('boot', 'bridge', { inEvenApp })

  const settings = new SettingsStore(bridge ? new BridgeKeyValueStore(bridge, queue) : new LocalKeyValueStore())
  await settings.load()

  let translate: Translate = translatorFor(settings.get())

  const hub = new EventHub()
  if (bridge) hub.attach(bridge)
  else attachPreviewKeys(hub)

  const audio = bridge ? new BridgeAudioInput(bridge, queue, hub) : null
  const session = new ConversationSession({ audio, settings: () => settings.get(), createProviders })

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
    t: () => translate,
    glassesView: () => controller.view(),
    inEvenApp,
    audio,
    showOnGlasses: text => {
      if (text === null) controller.refresh()
      else void renderer.render({ header: 'DIAGNOSTICS', body: text })
    },
  })

  settings.subscribe(next => {
    translate = translatorFor(next)
    controller.refresh()
    ui.refresh()
  })

  window.addEventListener('pagehide', () => void shutdown())
}

function translatorFor(settings: Settings): Translate {
  const language = settings.uiLanguage === 'auto' ? resolveLanguage(navigator.languages ?? [navigator.language]) : settings.uiLanguage
  return createTranslator(language)
}

void bootstrap()
