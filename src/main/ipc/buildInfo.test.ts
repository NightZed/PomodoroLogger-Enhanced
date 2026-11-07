import { encodeBuildInfo, parseBuildInfo, PACKAGED_ARGUMENT } from './buildInfo';

describe('ipc/buildInfo', () => {
    it('encodes both states as one self-contained argv entry', () => {
        expect(encodeBuildInfo(true)).toBe(`${PACKAGED_ARGUMENT}1`);
        expect(encodeBuildInfo(false)).toBe(`${PACKAGED_ARGUMENT}0`);
    });

    it('round-trips through the argv array', () => {
        expect(parseBuildInfo(['electron', '.', encodeBuildInfo(true)])).toBe(true);
        expect(parseBuildInfo(['electron', '.', encodeBuildInfo(false)])).toBe(false);
    });

    it('treats a missing or malformed argument as a development build', () => {
        expect(parseBuildInfo([])).toBe(false);
        expect(parseBuildInfo([PACKAGED_ARGUMENT])).toBe(false);
    });
});
