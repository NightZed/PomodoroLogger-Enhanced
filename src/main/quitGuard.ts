/**
 * Whether a quit request has to be refused because a finished pomodoro is
 * still waiting for its confirmation.
 *
 * The staged record is only written on confirmation (see `onSessionConfirmed`
 * in the Timer), so quitting before that throws away the session the user just
 * earned. The tray icon already announces it; the guard is what makes sure the
 * user cannot walk away from it by accident.
 *
 * The window has to be alive as well. `InstallUpdate` drops the reference
 * before handing over to electron-updater, and refusing a quit there would
 * leave the process running with no window to bring back -- a stuck app
 * instead of a blocked one.
 */
export function shouldBlockQuit(hasUnconfirmedSession: boolean, windowAlive: boolean): boolean {
    return hasUnconfirmedSession && windowAlive;
}
