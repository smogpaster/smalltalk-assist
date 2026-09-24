import type { ConversationSession } from '../app/session'
import type { AudioInput } from '../audio/input'
import type { GlassesView } from '../display/layout'
import type { Translate } from '../i18n'
import type { KeyStore } from '../settings/keys'
import type { SettingsStore } from '../settings/store'

/** Everything the phone UI needs; built in main.ts. */
export interface UiContext {
  session: ConversationSession
  settings: SettingsStore
  keys: KeyStore
  t(): Translate
  glassesView(): GlassesView
  /** False in a plain desktop browser (no Even bridge). */
  inEvenApp: boolean
  audio: AudioInput | null
  /** Temporarily shows raw text on the glasses; null restores the app view. */
  showOnGlasses(text: string | null): void
}
