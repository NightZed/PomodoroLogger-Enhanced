import { theme } from 'antd';
import { LAYER } from './layers';

/** Behind to front. Equal values are allowed where mount order decides. */
const BEHIND_TO_FRONT: (keyof typeof LAYER)[] = [
    'modal',
    'popup',
    'fullscreenView',
    'sessionMask',
    'picker',
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

    // The antd values are mirrors, not choices. If antd moves its base, the
    // order above silently becomes wrong; this assertion is what notices.
    it('mirrors the antd base the app layers are chosen against', () => {
        expect(theme.getDesignToken().zIndexPopupBase).toBe(LAYER.modal);
    });
});
