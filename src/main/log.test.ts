import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createLogger, formatTimestamp } from './log';

/**
 * The logger writes synchronously, so every assertion can read the file right
 * after the call. `now` is injected everywhere time matters (dedupe window,
 * rate-limit window) so the tests never sleep.
 */
function tempDir(): string {
    return mkdtempSync(path.join(tmpdir(), 'pl-log-'));
}

function read(dir: string, file: string): string {
    const target = path.join(dir, file);
    return existsSync(target) ? readFileSync(target, 'utf8') : '';
}

describe('main/log', () => {
    const dirs: string[] = [];

    function makeDir(): string {
        const dir = tempDir();
        dirs.push(dir);
        return dir;
    }

    afterAll(() => {
        for (const dir of dirs) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writes the scope to its own file with time, level and session id', () => {
        const dir = makeDir();
        const logger = createLogger({ dir, level: 'debug' });

        logger.log('app', 'info', 'started');
        logger.log('active-win', 'info', 'initialized: ok');

        const app = read(dir, 'app.log');
        const activeWin = read(dir, 'active-win.log');
        expect(app).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} \[[a-z0-9]{6}\] INFO {2}app: started$/m
        );
        expect(activeWin).toContain('active-win: initialized: ok');
        expect(app).not.toContain('initialized: ok');
    });

    it('stamps lines with local time plus a UTC offset', () => {
        const date = new Date(Date.UTC(2026, 10, 5, 9, 12, 33, 451));
        const text = formatTimestamp(date);

        expect(text).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
        // The wall clock shown is the machine's, not UTC...
        expect(text.slice(0, 10)).toBe(
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
                date.getDate()
            ).padStart(2, '0')}`
        );
        expect(text.slice(11, 19)).toBe(
            [date.getHours(), date.getMinutes(), date.getSeconds()]
                .map((value) => String(value).padStart(2, '0'))
                .join(':')
        );
        // ...and the offset makes it parse back to the same instant.
        expect(new Date(text).getTime()).toBe(date.getTime());
    });

    it('honours the configured level', () => {
        const dir = makeDir();
        const logger = createLogger({ dir, level: 'warn' });

        logger.log('app', 'debug', 'debug line');
        logger.log('app', 'info', 'info line');
        logger.log('app', 'warn', 'warn line');
        logger.log('app', 'error', 'error line');

        const app = read(dir, 'app.log');
        expect(app).not.toContain('debug line');
        expect(app).not.toContain('info line');
        expect(app).toContain('warn line');
        expect(app).toContain('error line');
    });

    it('keeps crash records even when the level is set to error', () => {
        const dir = makeDir();
        const logger = createLogger({ dir, level: 'error' });

        logger.log('crash', 'info', 'a crash notice');

        expect(read(dir, 'crash.log')).toContain('a crash notice');
    });

    it('collapses a repeating message and reports how often it repeated', () => {
        const dir = makeDir();
        let now = 0;
        const logger = createLogger({ dir, level: 'debug', now: () => now });

        logger.log('active-win', 'warn', 'call failed');
        now = 1000;
        logger.log('active-win', 'warn', 'call failed');
        now = 2000;
        logger.log('active-win', 'warn', 'call failed');
        expect(read(dir, 'active-win.log').match(/call failed/g)).toHaveLength(1);

        // Past the dedupe window the next occurrence is written, with a count.
        now = 7000;
        logger.log('active-win', 'warn', 'call failed');
        const content = read(dir, 'active-win.log');
        expect(content.match(/call failed/g)).toHaveLength(2);
        expect(content).toContain('(repeated 2 times)');
    });

    it('drops lines above the per-second cap and says how many were dropped', () => {
        const dir = makeDir();
        let now = 0;
        const logger = createLogger({ dir, level: 'debug', now: () => now });

        for (let index = 0; index < 25; index += 1) {
            logger.log('app', 'info', `line ${index}`);
        }
        now = 1500;
        logger.log('app', 'info', 'after the burst');

        const lines = read(dir, 'app.log').split('\n').filter(Boolean);
        expect(lines.filter((line) => line.includes('line '))).toHaveLength(20);
        expect(lines.some((line) => line.includes('dropped 5 lines'))).toBe(true);
        expect(lines.some((line) => line.includes('after the burst'))).toBe(true);
    });

    it('rotates at the size limit and keeps a bounded number of archives', () => {
        const dir = makeDir();
        const logger = createLogger({ dir, level: 'debug', now: () => 0, maxBytes: 120 });

        for (let index = 0; index < 12; index += 1) {
            logger.log('app', 'info', `message number ${index}`);
        }

        expect(existsSync(path.join(dir, 'app.log'))).toBe(true);
        expect(existsSync(path.join(dir, 'app.log.1'))).toBe(true);
        expect(existsSync(path.join(dir, 'app.log.4'))).toBe(false);
    });

    it('never throws when the log path cannot be written', () => {
        const dir = makeDir();
        const blockingFile = path.join(dir, 'not-a-directory');
        writeFileSync(blockingFile, 'x');
        const logger = createLogger({ dir: blockingFile, level: 'debug' });

        expect(() => logger.log('app', 'error', 'still fine')).not.toThrow();
        expect(() => logger.error('crash', 'still fine', new Error('boom'))).not.toThrow();
    });

    it('appends the stack of an Error detail on its own indented lines', () => {
        const dir = makeDir();
        const logger = createLogger({ dir, level: 'debug' });
        const error = new Error('boom');

        logger.error('crash', 'renderer crash', error);

        const content = read(dir, 'crash.log');
        expect(content).toContain('renderer crash');
        expect(content).toContain('Error: boom');
        expect(content.split('\n')[1]).toMatch(/^ {4}/);
    });
});
