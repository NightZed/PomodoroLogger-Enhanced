import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { Spotlight } from './Spotlight';
import { Pointer } from './Pointer';

const addTarget = (id: string, rect = { left: 10, top: 20, width: 30, height: 40 }) => {
    const element = document.createElement('div');
    element.id = id;
    element.getBoundingClientRect = () =>
        ({
            ...rect,
            right: rect.left + rect.width,
            bottom: rect.top + rect.height,
        }) as DOMRect;
    document.body.appendChild(element);
    return element;
};

const renderInAct = async (ui: React.ReactElement) => {
    let view: ReturnType<typeof render>;
    await act(async () => {
        view = render(ui);
    });
    return view!;
};

describe('UserGuide Spotlight', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.useRealTimers();
    });

    it('renders four dim panels and a padded hole around a visible target', async () => {
        addTarget('spot');
        const onTargetRect = jest.fn();
        const { container } = await renderInAct(
            <Spotlight targetSelector="#spot" padding={6} onTargetRect={onTargetRect} />
        );

        const hole = container.querySelector<HTMLElement>('[data-tour-hole]')!;
        expect(hole.getAttribute('data-tour-hole')).toBe('#spot');
        expect(hole.style.left).toBe('4px');
        expect(hole.style.top).toBe('14px');
        expect(hole.style.width).toBe('42px');
        expect(hole.style.height).toBe('52px');
        expect(hole.style.pointerEvents).toBe('auto');
        expect(container.querySelectorAll('div')).toHaveLength(5);
        expect(onTargetRect).toHaveBeenCalledWith({ x: 10, y: 20, w: 30, h: 40 });
    });

    it('makes the hole click-through for navigation steps', async () => {
        addTarget('spot');
        const onClick = jest.fn();
        const { container } = await renderInAct(
            <Spotlight targetSelector="#spot" clickThrough onTargetClick={onClick} />
        );

        const hole = container.querySelector<HTMLElement>('[data-tour-hole]')!;
        expect(hole.style.pointerEvents).toBe('none');
        expect(hole.style.cursor).toBe('');

        hole.click();
        expect(onClick).toHaveBeenCalled();
    });

    it('shows a blocking dim layer while the target is missing', async () => {
        const onTargetRect = jest.fn();
        const { container } = await renderInAct(
            <Spotlight targetSelector="#missing" onTargetRect={onTargetRect} />
        );

        expect(container.querySelector('[data-tour-hole]')).toBeNull();
        const mask = container.firstElementChild as HTMLElement;
        expect(mask.style.backgroundColor).toBe('var(--pl-mask)');
        expect(mask.style.zIndex).toBe('2000');
        expect(onTargetRect).toHaveBeenLastCalledWith(null);
    });
});

describe('UserGuide Pointer', () => {
    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
    });

    it('renders nothing until the target exists', () => {
        const { container } = render(<Pointer targetSelector="#missing" waitForTargetMs={1} />);

        expect(container.innerHTML).toBe('');
    });

    it('points at the centre of the target with the requested rotation', async () => {
        addTarget('spot');
        const onTargetRect = jest.fn();
        const { container } = await renderInAct(
            <Pointer targetSelector="#spot" direction={Math.PI / 2} onTargetRect={onTargetRect} />
        );

        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.style.left).toBe('25px');
        expect(wrapper.style.top).toBe('40px');
        expect(wrapper.style.transform).toBe('rotate(1.5707963267948966rad)');
        expect(wrapper.style.pointerEvents).toBe('none');
        expect(onTargetRect).toHaveBeenCalled();
    });

    it('hides the pointer without unmounting it', async () => {
        addTarget('spot');
        const { container } = await renderInAct(
            <Pointer targetSelector="#spot" show={false} animate={false} />
        );

        expect((container.firstElementChild as HTMLElement).style.display).toBe('none');
    });
});
