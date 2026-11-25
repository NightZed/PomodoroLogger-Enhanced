/**
 * Public links the UI opens in the system browser.
 *
 * Shared because several places hand the user to the tracker (the crash
 * screen, the error notice and Settings > About); keeping one constant means
 * they cannot drift apart.
 */
export const REPOSITORY_URL = 'https://github.com/NightZed/PomodoroLogger-Enhanced';
export const ISSUES_URL = 'https://github.com/NightZed/PomodoroLogger-Enhanced/issues/';
export const RELEASES_URL = 'https://github.com/NightZed/PomodoroLogger-Enhanced/releases/latest';
/** The licence text itself, not the repository copy: it is what "GPL-3.0" names. */
export const GPL3_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
