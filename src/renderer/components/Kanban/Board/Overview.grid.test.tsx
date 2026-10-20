import * as React from 'react';
import { render } from '@testing-library/react';
import { ResponsiveBoardGrid } from './Overview';

jest.mock('../../Visualization/ProjectTrend', () => ({ IdTrend: () => null }));
jest.mock('./BoardBrief', () => ({ BoardBrief: () => null }));

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

const card = (key: string, height: number) => (
    <div key={key} data-board-height={height}>
        {key}
    </div>
);

const positions = (container: HTMLElement) => {
    const result: { [key: string]: { left: number; top: number } } = {};
    container.querySelectorAll<HTMLElement>('div[style*="translate3d"]').forEach((item) => {
        const match = /translate3d\((-?\d+)px, (-?\d+)px/.exec(item.style.transform);
        result[item.textContent ?? ''] = {
            left: Number(match?.[1]),
            top: Number(match?.[2]),
        };
    });
    return result;
};

describe('ResponsiveBoardGrid', () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return 810;
            },
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() {
                const content = this.firstElementChild?.firstElementChild as HTMLElement | null;
                return Number(content?.dataset.boardHeight ?? 0);
            },
        });
    });

    afterAll(() => {
        if (originalClientWidth) {
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
        if (originalOffsetHeight) {
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
        }
    });

    it('recomputes row-first positions with each card height after a reorder', () => {
        const { container, rerender } = render(
            <ResponsiveBoardGrid>
                {[card('a', 100), card('b', 150), card('c', 120), card('d', 90)]}
            </ResponsiveBoardGrid>
        );

        expect(positions(container)).toEqual({
            a: { left: 3, top: 0 },
            b: { left: 273, top: 0 },
            c: { left: 543, top: 0 },
            d: { left: 3, top: 100 },
        });

        rerender(
            <ResponsiveBoardGrid>
                {[card('d', 90), card('c', 120), card('b', 150), card('a', 100)]}
            </ResponsiveBoardGrid>
        );

        expect(positions(container)).toEqual({
            d: { left: 3, top: 0 },
            c: { left: 273, top: 0 },
            b: { left: 543, top: 0 },
            a: { left: 3, top: 90 },
        });
    });
});
