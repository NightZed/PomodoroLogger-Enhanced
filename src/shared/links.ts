/**
 * Public links the UI opens in the system browser.
 *
 * Shared because three places hand the user to the tracker (the crash screen,
 * the error notice and Settings > About); keeping one constant means they
 * cannot drift apart.
 */
export const ISSUES_URL = 'https://github.com/NightZed/PomodoroLogger-Enhanced/issues/';
