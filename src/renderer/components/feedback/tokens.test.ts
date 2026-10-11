import { FEEDBACK_ICON_COLORS, FEEDBACK_ICONS, TOAST_DURATION, feedbackKindClass } from './tokens';
import { FEEDBACK_MESSAGES } from './messages';
import { FeedbackKind } from './type';

const KINDS: FeedbackKind[] = ['info', 'success', 'warning', 'error'];

describe('feedback tokens', () => {
    it('gives every kind an icon and a color', () => {
        for (const kind of KINDS) {
            expect(FEEDBACK_ICONS[kind]).toBeTruthy();
            expect(FEEDBACK_ICON_COLORS[kind]).toBeTruthy();
        }
    });

    it('keeps toasts on screen a little longer than the antd default of 3 SECONDS', () => {
        // antd 3 takes seconds (rc-notification multiplies by 1000). Regression:
        // 4500 (milliseconds) kept a toast on screen for 75 minutes.
        expect(TOAST_DURATION).toBeGreaterThan(0);
        expect(TOAST_DURATION).toBeLessThan(60);
    });

    it('marks a dialog with its kind only when a kind is given', () => {
        expect(feedbackKindClass('warning')).toBe('pl-feedback-warning');
        expect(feedbackKindClass(undefined)).toBeUndefined();
    });
});

describe('feedback messages', () => {
    it('names the failing update phase', () => {
        expect(FEEDBACK_MESSAGES.update.failed(FEEDBACK_MESSAGES.update.phase.download)).toBe(
            'Update Download Failed'
        );
    });

    it('keeps the detail of a failed update check', () => {
        expect(FEEDBACK_MESSAGES.update.checkFailed('connection reset')).toContain(
            'connection reset'
        );
    });

    it('names the configured minimum when a focus session is finished too early', () => {
        // The number comes from `Setting.minFinishDuration`, so the copy has to
        // travel with it instead of hard coding the old 10 minutes.
        expect(FEEDBACK_MESSAGES.timer.finishTooEarly(10)).toBe(
            'Focus at least for 10 minutes to finish'
        );
        expect(FEEDBACK_MESSAGES.timer.finishTooEarly(1)).toBe(
            'Focus at least for 1 minute to finish'
        );
    });
});
