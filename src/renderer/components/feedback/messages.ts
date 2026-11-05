import { feedbackMessages } from '../../../shared/i18n';
import { liveMessages } from '../../i18n/live';
import { getActiveLanguage } from '../../i18n/runtime';

/**
 * User facing feedback copy.
 *
 * Only the strings that are shared between files, or that describe one flow in
 * several steps (the update pipeline), live here: keeping them together is what
 * makes "same situation -> same wording" enforceable. Whole-screen copy stays
 * next to its screen.
 *
 * The catalog itself lives in `src/shared/i18n` because the main process shows
 * the same wording in native dialogs. This export is a live view: every read
 * resolves against the language active at that moment, so all call sites keep
 * their `FEEDBACK_MESSAGES.x.y` shape without being frozen in one language.
 */
export const FEEDBACK_MESSAGES = liveMessages(() => feedbackMessages(getActiveLanguage()));
