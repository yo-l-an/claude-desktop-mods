// Every word the band draws. The engine does not tell a mod the app's
// language, so it is the `language` option: `system` follows the system locale.
export type Words = {
  session: string
  week: string
  notStarted: string
  refreshing: string
  now: string
  days: string
  minutes: string
  weekdays: readonly string[]
  // The popover's line labels, colon included.
  usage: string
  reset: string
  // The popover's projection, from the usage so far.
  early: string
  reached: (resetAt: string) => string
  hits: (at: string, beforeReset: string) => string
  lasts: (percent: number) => string
  graphAlt: string
  // The line under the graph while its ghost, the last window, is hovered.
  previous: Record<'session' | 'week', string>
}

const EN: Words = {
  session: 'Session',
  week: 'Week',
  notStarted: 'not started',
  refreshing: 'Refreshing usage',
  now: 'now',
  days: 'd',
  minutes: 'm',
  weekdays: ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'],
  usage: 'Usage:',
  reset: 'Reset:',
  early: 'Too early to project.',
  reached: resetAt => `Limit reached until ${resetAt}.`,
  hits: (at, beforeReset) => `Limit hit around ${at}, ${beforeReset} before reset.`,
  lasts: percent => `About ${percent}% used by reset.`,
  graphAlt: 'Usage so far and its projection to the reset',
  previous: { session: 'Previous session', week: 'Previous week' },
}

const FR: Words = {
  session: 'Session',
  week: 'Semaine',
  notStarted: 'non démarrée',
  refreshing: "Actualisation de l'utilisation",
  now: 'maintenant',
  days: 'j',
  minutes: 'min',
  weekdays: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  usage: 'Utilisation :',
  reset: 'Réinitialisation :',
  early: 'Trop tôt pour une projection.',
  reached: resetAt => `Limite atteinte jusqu'à ${resetAt}.`,
  hits: (at, beforeReset) => `Limite atteinte vers ${at}, ${beforeReset} avant la réinitialisation.`,
  lasts: percent => `Environ ${percent} % utilisés à la réinitialisation.`,
  graphAlt: "L'utilisation jusqu'ici et sa projection jusqu'à la réinitialisation",
  previous: { session: 'Session précédente', week: 'Semaine précédente' },
}

const systemLocale = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
}

export const wordsFor = (language: unknown): Words => {
  const locale = language === 'en' || language === 'fr' ? language : systemLocale()

  return locale.toLowerCase().startsWith('fr') ? FR : EN
}
