'use strict';

/**
 * Fail a test when it writes to `console.error` / `console.warn`.
 *
 * The migration batches have a "no new console noise" gate: a deprecation or a
 * React warning must not reach the default test output unnoticed. The baseline
 * is zero, so anything captured here is either a regression or an intentional
 * error path that has not been declared.
 *
 * A test that really exercises an error path opts in at the narrowest scope:
 *
 *     const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
 *     // ...assert the behaviour...
 *     spy.mockRestore();
 *
 * Spying replaces this wrapper, so the captured output is explicitly owned by
 * that test. `console.log` is deliberately not gated: it is not part of the
 * warning/error baseline.
 */

const { inspect } = require('util');

const format = (args) =>
    args
        .map((arg) => {
            if (typeof arg === 'string') {
                return arg;
            }
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            return inspect(arg, { depth: 5, breakLength: 120 });
        })
        .join(' ');

const captured = [];

const record = (level, args) => {
    const stack = new Error().stack || '';
    const caller = stack
        .split('\n')
        .slice(2, 5)
        .map((line) => line.trim())
        .filter((line) => line && !line.includes('test/console-gate.js'))
        .join('\n');
    captured.push({ level, text: format(args), caller });
};

console.error = (...args) => record('error', args);
console.warn = (...args) => record('warn', args);

beforeEach(() => {
    captured.length = 0;
});

afterEach(() => {
    if (captured.length === 0) {
        return;
    }

    const output = captured
        .splice(0)
        .map(
            ({ level, text, caller }) =>
                `[console.${level}] ${text}${caller ? `\n    at ${caller}` : ''}`
        )
        .join('\n\n');

    throw new Error(
        `Unexpected console output during this test:\n\n${output}\n\n` +
            'Fix the code, or spy on console.error/warn in the narrowest scope ' +
            'when the output is an intentional error path.'
    );
});
