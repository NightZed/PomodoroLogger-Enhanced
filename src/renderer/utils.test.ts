import * as utils from './utils';

describe('renderer.utils', () => {
    it('should format time in hour', () => {
        expect(utils.formatTime(6)).toBe('06h 00m');
        expect(utils.formatTime(6.5)).toBe('06h 30m');
        expect(utils.formatTime(16.3333333)).toBe('16h 20m');
        expect(utils.formatTime(0.3333333)).toBe('00h 20m');
        expect(utils.formatTime(0)).toBe('00h 00m');
    });

    it('should format time without leading zero', () => {
        expect(utils.formatTimeWithoutZero(6)).toBe('6h 0m');
        expect(utils.formatTimeWithoutZero(6.5)).toBe('6h 30m');
        expect(utils.formatTimeWithoutZero(0.5)).toBe('0h 30m');
        expect(utils.formatTimeWithoutZero(0)).toBe('0h 0m');
    });

    it('should parse time from string', () => {
        expect(utils.parseTime('10h 30m')).toBe(10.5);
        for (let i = 0; i < 1000; i += 1) {
            const time = Math.floor(Math.random() * 100) + Math.floor(Math.random() * 60) / 60;
            expect(utils.parseTime(utils.formatTimeWithoutZero(time))).toBeCloseTo(time);
            expect(utils.parseTime(utils.formatTime(time))).toBeCloseTo(time);
        }
    });

    it('parse number to 2 digit', () => {
        expect(utils.to2digits(10)).toEqual('10');
        expect(utils.to2digits(2)).toEqual('02');
        expect(utils.to2digits(8)).toEqual('08');
        expect(utils.to2digits(0)).toEqual('00');
        expect(utils.to2digits(4.8)).toEqual('04');
    });

    it('should get rid of application suffix', () => {
        expect(utils.getBetterAppName('Chrome.exe')).toBe('Chrome');
        expect(utils.getBetterAppName('Chrome')).toBe('Chrome');
        expect(utils.getBetterAppName('chrome')).toBe('Chrome');
        expect(utils.getBetterAppName('vs-code.exe')).toBe('Vs-code');
    });

    it('should generate random name', () => {
        // Generate in bulk and check once: calling `expect` inside the loop
        // dominated the runtime of this suite (~10s on a 4-core machine).
        const names = Array.from({ length: 1e5 }, () => utils.generateRandomName());
        expect(new Set(names).size).toBe(names.length);
    });

    it('should map actions dict to dispatch', async () => {
        const actions: any = {};
        for (let i = 0; i < 1000; i += 1) {
            const name = utils.generateRandomName();
            actions[name] = (...args: any) => [name, args];
        }

        const dispatchMap = utils.genMapDispatchToProp(actions);
        for (const key in actions) {
            const args = [Math.random()];
            await new Promise<void>((resolve) => {
                // @ts-ignore
                const dispatchDict = dispatchMap(([_name, _args]) => {
                    expect(_name).toEqual(key);
                    expect(_args).toStrictEqual(args);
                    resolve();
                }) as any;

                expect(Object.prototype.hasOwnProperty.call(dispatchDict, key)).toBeTruthy();
                dispatchDict[key](...args);
            });
        }
    });

    it('reuses the mapped dispatch functions until the dispatch changes', () => {
        const actions = {
            first: (value: number) => ({ type: 'first', value }),
            second: (value: number) => ({ type: 'second', value }),
        };
        const map = utils.genMapDispatchToProp<any>(actions);
        const dispatch = jest.fn();

        const first = map(dispatch);
        const second = map(dispatch);
        expect(second.first).toBe(first.first);
        expect(second.second).toBe(first.second);

        first.first(1);
        expect(dispatch).toHaveBeenCalledWith({ type: 'first', value: 1 });

        const otherDispatch = jest.fn();
        const third = map(otherDispatch);
        expect(third.first).not.toBe(first.first);
    });
});

describe('renderer.utils formatting and equality helpers', () => {
    it('formats every magnitude branch of formatTime', () => {
        expect(utils.formatTime(0.5)).toBe('00h 30m');
        expect(utils.formatTime(100)).toBe('100.0h');
        expect(utils.formatTime(1000)).toBe('1.00kh');
        expect(utils.formatTime(10_000)).toBe('10.0kh');
        expect(utils.formatTime(100_000)).toBe('100kh');
        expect(utils.formatTime(1_000_000)).toBe('1.00mh');
    });

    it('rejects strings that do not contain both hours and minutes', () => {
        expect(() => utils.parseTime('10h')).toThrow();
        expect(() => utils.parseTime('30m')).toThrow();
    });

    it('compares shallow objects in both directions', () => {
        expect(utils.isShallowEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
        expect(utils.isShallowEqual({ a: 1 }, { a: 2 })).toBe(false);
        expect(utils.isShallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(utils.isShallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
        expect(utils.isShallowEqual({ nested: { a: 1 } }, { nested: { a: 1 } })).toBe(false);
    });

    it('compares only the requested shallow keys, including dotted paths', () => {
        const previous = { a: 1, b: 2, nested: { c: 3, ignored: 'one' } };
        const next = { a: 1, b: 99, nested: { c: 3, ignored: 'two' } };

        expect(utils.isShallowEqualByKeys(previous, next, ['a', 'nested.c'])).toBe(true);
        expect(utils.isShallowEqualByKeys(previous, next, ['b'])).toBe(false);
        expect(utils.isShallowEqualByKeys(previous, next, ['missing'])).toBe(true);
        expect(utils.isShallowEqualByKeys({ a: 1 }, {}, ['a'])).toBe(false);
    });

    it('merges object and callback refs', () => {
        const objectRef = { current: null as HTMLElement | null };
        const callbackRef = jest.fn();
        const ref = utils.mergeRefs([objectRef as any, callbackRef]);
        const node = document.createElement('div');

        (ref as (node: HTMLElement | null) => void)(node);

        expect(objectRef.current).toBe(node);
        expect(callbackRef).toHaveBeenCalledWith(node);
    });

    it('finds the closest ancestor matching a selector', () => {
        const parent = document.createElement('div');
        parent.className = 'parent';
        const child = document.createElement('span');
        parent.appendChild(child);

        expect(utils.matchParent(child, '.parent')).toBe(parent);
        expect(utils.matchParent(child, '.missing')).toBeUndefined();
        expect(utils.matchParent(null, '.parent')).toBeUndefined();
    });

    it('memoizes a function until one of its cache keys changes', () => {
        const memorize = utils.getMemorizedFunc<(value: number) => number>();
        const first = (value: number) => value + 1;
        const second = (value: number) => value + 2;

        expect(memorize(first, [1])).toBe(first);
        expect(memorize(second, [1])).toBe(first);
        expect(memorize(second, [2])).toBe(second);
        expect(memorize(first, [2])).toBe(second);
    });

    it('rebuilds mem dispatching only when a cache key changes', () => {
        const build = jest.fn((dispatch: any, props: { value: number }) => ({
            set: (value: number) => dispatch({ type: 'set', value, from: props.value }),
        }));
        const map = utils.memorizeDispatchToProps(build, (props) => ({
            set: [props.value],
        })) as unknown as (
            dispatch: any,
            props: { value: number }
        ) => { set: (value: number) => void };
        const dispatch = jest.fn();

        const first = map(dispatch, { value: 1 });
        const second = map(dispatch, { value: 1 });
        expect(build).toHaveBeenCalledTimes(1);
        expect(second.set).toBe(first.set);

        const third = map(dispatch, { value: 2 });
        expect(build).toHaveBeenCalledTimes(2);
        expect(third.set).not.toBe(first.set);
    });
});
