import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { IdTrend, ProjectTrend } from './ProjectTrend';
import { workers } from '../../workers';

jest.mock('../../workers', () => ({
    workers: {
        dbWorkers: {
            sessionDB: {
                find: jest.fn().mockResolvedValue([]),
            },
        },
    },
}));

const mockSessionFind = workers.dbWorkers.sessionDB.find as jest.Mock;

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

    it('queries only start times inside the trend window', async () => {
        mockSessionFind.mockClear();
        const view = render(<IdTrend boardId="b1" />);

        await waitFor(() => expect(mockSessionFind).toHaveBeenCalledTimes(1));
        const [query, projection] = mockSessionFind.mock.calls[0];
        expect(query.boardId).toBe('b1');
        expect(typeof query.startTime.$gte).toBe('number');
        expect(projection).toEqual({ startTime: 1 });
        view.unmount();
    });
});
