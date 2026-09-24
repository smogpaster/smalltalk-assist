import type { GlassesMenuItem } from '../display/layout'
import type { Translate } from '../i18n'

/** Stable ids for the OS contextual menu (non-zero, unique). */
export const MenuId = {
  toggleSession: 1,
  quiet: 2,
  /** Does nothing – selecting any item closes the overlay. */
  back: 3,
} as const

/**
 * Items shown in the contextual menu. Labels are stable per language (no
 * start/stop state in the label) so the page is only rebuilt on a language
 * change. Optional features (milestone 7) add their items here.
 *
 * "Back" is last on purpose: the OS appends its own "Close <app>" item right
 * below our items, which exits the app. Users read that as "close the menu",
 * so an explicit back item sits directly above it.
 */
export function buildMenu(t: Translate): GlassesMenuItem[] {
  return [
    { id: MenuId.toggleSession, label: t('menu.toggleSession') },
    { id: MenuId.quiet, label: t('menu.quiet') },
    { id: MenuId.back, label: t('menu.back') },
  ]
}
