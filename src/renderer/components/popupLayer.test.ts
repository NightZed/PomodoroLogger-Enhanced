import { POPUP_CONTAINER_ID, getPopupContainer, isModalOpen } from './popupLayer';

function mountPopupContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = POPUP_CONTAINER_ID;
    document.body.appendChild(container);
    return container;
}

describe('popup layer mount point', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('mounts overlays inside the container Application renders', () => {
        const container = mountPopupContainer();
        expect(getPopupContainer()).toBe(container);
    });

    it('falls back to <body> while the container does not exist yet', () => {
        expect(document.getElementById(POPUP_CONTAINER_ID)).toBeNull();
        expect(getPopupContainer()).toBe(document.body);
    });
});

describe('isModalOpen', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    /** The DOM rc-dialog renders: a root wrapping the wrap element. */
    const addModal = (style?: string) => {
        const root = document.createElement('div');
        root.className = 'ant-modal-root';
        const wrap = document.createElement('div');
        wrap.className = 'ant-modal-wrap';
        if (style) {
            wrap.setAttribute('style', style);
        }
        root.appendChild(wrap);
        document.body.appendChild(root);
        return { root, wrap };
    };

    it('is false before any dialog has been opened', () => {
        expect(isModalOpen()).toBe(false);
    });

    it('is true while a dialog is on screen', () => {
        addModal();
        expect(isModalOpen()).toBe(true);
    });

    it('is false for the closed dialog antd leaves in the DOM', () => {
        // The regression this exists for: rc-dialog marks a closed dialog with
        // `display: none` on the wrap (Dialog.js `onAnimateLeave`) but keeps
        // the root mounted (no destroyOnClose on the editor), so an existence
        // check stayed true after the first open/close and the Timer's Tab
        // binding went dead until a mini-window roundtrip cleaned the DOM.
        addModal('display: none;');
        expect(isModalOpen()).toBe(false);
    });

    it('is false while Application hides the roots in mini mode', () => {
        const { root } = addModal();
        root.setAttribute('style', 'display: none;');
        expect(isModalOpen()).toBe(false);
    });

    it('is true while any of several stacked dialogs is open', () => {
        addModal('display: none;');
        addModal();
        expect(isModalOpen()).toBe(true);
    });
});
