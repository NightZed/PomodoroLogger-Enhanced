import { theme } from 'antd';
import { LAYER } from './layers';

/** Behind to front. Equal values are allowed where mount order decides. */
const BEHIND_TO_FRONT: (keyof typeof LAYER)[] = [
    'modal',
    'popup',
    'fullscreenView',
    'tooltip',
    'sessionMask',
    'picker',
    'sessionMaskTooltip',
    'guide',
    'guideDialog',
    'guideHole',
    'guidePointer',
    'notice',
    'noticeTooltip',
];

describe('LAYER', () => {
    // Regression: these numbers used to live next to their components, and
    // f7077c8 raised the session mask to 1100 without noticing antd's popups
    // at 1050 -- the project picker's menu painted underneath the mask.
    it('is ordered behind to front', () => {
        const ordered = BEHIND_TO_FRONT.map((name) => ({ name, z: LAYER[name] }));
        const byValue = [...ordered].sort((a, b) => a.z - b.z);

        // The diff names the layer whose value broke the order.
        expect(ordered).toEqual(byValue);
    });

    // Regression: the mirrors used to be plain numbers inside each component,
    // so nothing noticed when antd moved its base -- the order above would then
    // be chosen against a stale value. Only the base is mirrored here: the
    // offsets each antd component adds (Select +50, tooltip +70, notification
    // +1000+50) are not, so a change to those will not fail this test.
    it('mirrors the antd base the app layers are chosen against', () => {
        const base = theme.getDesignToken().zIndexPopupBase;

        // Both sides are in the asserted value, so the diff names the one that
        // moved instead of only printing two numbers.
        expect({ antd: base, layer: LAYER.modal }).toEqual({
            antd: LAYER.modal,
            layer: LAYER.modal,
        });
    });
});
