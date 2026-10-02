import { POPUP_CONTAINER_ID, getPopupContainer } from './popupLayer';

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
