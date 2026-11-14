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
