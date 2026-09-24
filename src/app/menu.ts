import type { GlassesMenuItem } from '../display/layout'
import type { Translate } from '../i18n'
import type { Extras } from '../settings/schema'

/** Stable ids for the OS contextual menu (non-zero, unique). */
export const MenuId = {
  toggleSession: 1,
  quiet: 2,
  /** Does nothing – selecting any item closes the overlay. */
  back: 3,
  topic: 4,
  exitLine: 5,
  recap: 6,
  names: 7,
} as const

/**
 * Items shown in the contextual menu (tap, then long press). Labels are stable
 * per language, so the page is only rebuilt when the language or the enabled
 * extras change. Max 10 items, 32 UTF-8 bytes each.
 *
 * "Back" is last on purpose: the OS appends its own "Close <app>" item right
 * below our items, which exits the app. Users read that as "close the menu",
 * so an explicit back item sits directly above it.
 */
export function buildMenu(t: Translate, extras?: Extras): GlassesMenuItem[] {
  return [
    { id: MenuId.toggleSession, label: t('menu.toggleSession') },
    { id: MenuId.quiet, label: t('menu.quiet') },
    ...(extras?.topicChange ? [{ id: MenuId.topic, label: t('menu.topic') }] : []),
    ...(extras?.exitLine ? [{ id: MenuId.exitLine, label: t('menu.exitLine') }] : []),
    ...(extras?.recap ? [{ id: MenuId.recap, label: t('menu.recap') }] : []),
    ...(extras?.names ? [{ id: MenuId.names, label: t('menu.names') }] : []),
    { id: MenuId.back, label: t('menu.back') },
  ]
}
