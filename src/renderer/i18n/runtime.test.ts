import { getActiveLanguage, setActiveLanguage, subscribeLanguage, t } from './runtime';
import { resolveLanguage } from '../../shared/i18n';

describe('i18n runtime', () => {
    afterEach(() => setActiveLanguage('en'));

    it('notifies subscribers only when the language really changes', () => {
        const listener = jest.fn();
        const unsubscribe = subscribeLanguage(listener);

        setActiveLanguage('en');
        expect(listener).not.toHaveBeenCalled();

        setActiveLanguage('zh');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(getActiveLanguage()).toBe('zh');

        setActiveLanguage('zh');
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        setActiveLanguage('en');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('translates through the active language at call time', () => {
        expect(t('common.ok')).toBe('OK');
        setActiveLanguage('zh');
        expect(t('common.ok')).toBe('确定');
        expect(t('timer.notify.completedToday', 3)).toBe('今天已完成 3 个番茄。\n\n');
    });

    it('resolves the system preference against the OS language', () => {
        expect(resolveLanguage('system', 'zh')).toBe('zh');
        expect(resolveLanguage('system', 'en')).toBe('en');
        expect(resolveLanguage('zh', 'en')).toBe('zh');
        expect(resolveLanguage('en', 'zh')).toBe('en');
    });
});
