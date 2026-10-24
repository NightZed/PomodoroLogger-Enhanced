import React from 'react';
import { render } from '@testing-library/react';
import { ProjectTrend } from './ProjectTrend';

jest.mock('../../workers', () => ({
    workers: {
        dbWorkers: {
            sessionDB: {
                find: jest.fn().mockResolvedValue([]),
            },
        },
    },
}));

describe('ProjectTrend sparkline', () => {
    it('renders a responsive SVG path with the gradient stops', () => {
        const view = render(<ProjectTrend data={[1, 4, 2]} width={120} height={30} />);
        const svg = view.container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('viewBox')).toBe('0 0 120 30');
        expect(svg?.getAttribute('width')).toBe('120');
        expect(svg?.getAttribute('height')).toBe('30');
        expect(svg?.querySelector('path')?.getAttribute('d')).toContain('M ');
        expect(svg?.querySelectorAll('linearGradient stop')).toHaveLength(3);
        view.unmount();
    });

    it('uses the parent width when no width is supplied', () => {
        const view = render(<ProjectTrend data={[1, 2]} />);
        expect(view.container.querySelector('svg')?.getAttribute('width')).toBe('100%');
        view.unmount();
    });

    it('renders nothing for empty data and keeps the hover label for non-empty data', () => {
        const empty = render(<ProjectTrend data={[]} hoverEffect={true} />);
        expect(empty.container.querySelector('svg')).toBeNull();
        expect(empty.container.textContent).not.toContain('TREND');
        empty.unmount();

        const hover = render(<ProjectTrend data={[1, 2, 3]} hoverEffect={true} />);
        expect(hover.container.textContent).toContain('TREND');
        expect(hover.container.querySelector('svg')).not.toBeNull();
        hover.unmount();
    });
});
