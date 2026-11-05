import { isLogLevel, LOG_LEVELS, shouldLog } from './log';

describe('shared/log', () => {
    it('accepts exactly the four known levels', () => {
        expect(LOG_LEVELS).toEqual(['debug', 'info', 'warn', 'error']);
        for (const level of LOG_LEVELS) {
            expect(isLogLevel(level)).toBe(true);
        }
    });

    it('rejects anything else, including values from a corrupted database', () => {
        expect(isLogLevel(undefined)).toBe(false);
        expect(isLogLevel(null)).toBe(false);
        expect(isLogLevel('')).toBe(false);
        expect(isLogLevel('verbose')).toBe(false);
        expect(isLogLevel(30)).toBe(false);
        expect(isLogLevel({ level: 'info' })).toBe(false);
    });

    it('writes a level only when it is at least as severe as the configured one', () => {
        expect(shouldLog('debug', 'debug')).toBe(true);
        expect(shouldLog('debug', 'error')).toBe(true);
        expect(shouldLog('info', 'debug')).toBe(false);
        expect(shouldLog('info', 'info')).toBe(true);
        expect(shouldLog('warn', 'info')).toBe(false);
        expect(shouldLog('warn', 'error')).toBe(true);
        expect(shouldLog('error', 'warn')).toBe(false);
        expect(shouldLog('error', 'error')).toBe(true);
    });
});
