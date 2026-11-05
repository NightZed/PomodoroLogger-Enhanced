import { createTranslator, en, zh } from './index';

type Flat = { [key: string]: 'string' | 'function' | Flat };

function flatten(value: unknown, prefix = '', out: Flat = {}): Flat {
    if (typeof value === 'string') {
        out[prefix] = 'string';
        return out;
    }
    if (typeof value === 'function') {
        out[prefix] = 'function';
        return out;
    }
    if (value != null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            flatten(child, prefix ? `${prefix}.${key}` : key, out);
        }
    }
    return out;
}

describe('translation catalogs', () => {
    const english = flatten(en);
    const chinese = flatten(zh);

    it('keeps the same keys in both languages', () => {
        expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    });

    it('keeps the same leaf kind (string vs interpolation) for every key', () => {
        for (const key of Object.keys(english)) {
            expect([key, chinese[key]]).toEqual([key, english[key]]);
        }
    });

    it('has no empty strings', () => {
        const check = (catalog: unknown, language: string) => {
            for (const [key, kind] of Object.entries(flatten(catalog))) {
                if (kind !== 'string') {
                    continue;
                }
                const text = key
                    .split('.')
                    .reduce<any>((node, part) => node[part], catalog) as string;
                // Trailing spaces are legal: some keys are concatenated with a
                // link or a value (see `feedback.update.manualDownloadHint`).
                expect(`${language}:${key}:${text.trim().length > 0}`).toBe(
                    `${language}:${key}:true`
                );
            }
        };

        check(en, 'en');
        check(zh, 'zh');
    });

    it('interpolates and pluralizes in English', () => {
        const t = createTranslator('en');
        expect(t('timer.notify.completedToday', 1)).toContain('1 session today');
        expect(t('timer.notify.completedToday', 2)).toContain('2 sessions today');
    });

    it('interpolates in Chinese without plural forms', () => {
        const t = createTranslator('zh');
        expect(t('timer.notify.completedToday', 2)).toBe('今天已完成 2 个番茄。\n\n');
    });

    it('falls back to the key itself instead of logging', () => {
        const t = createTranslator('en');
        expect(t('does.not.exist' as any)).toBe('does.not.exist');
    });
});
