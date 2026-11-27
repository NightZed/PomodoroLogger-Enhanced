import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import {
    board,
    mockKanbanLayout,
    mockUnassignedSessions,
    renderKanban,
    resetKanbanLayout,
} from './Kanban.testSupport';

// Same two boundaries as the page tests (see Kanban.test.tsx): dnd needs a
// real layout, and rc-textarea writes height: NaN under jsdom.
jest.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: any) => <div>{children}</div>,
    Droppable: ({ children }: any) =>
        children(
            {
                innerRef: () => undefined,
                droppableProps: {},
                placeholder: null,
            },
            { isDraggingOver: false }
        ),
    Draggable: ({ children }: any) =>
        children(
            { innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false }
        ),
}));
jest.mock('antd/lib/input/TextArea', () => ({ __esModule: true, default: () => null }));

describe('Kanban overview header', () => {
    beforeAll(mockKanbanLayout);
    afterAll(resetKanbanLayout);
    beforeEach(mockUnassignedSessions);

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.clearAllTimers();
        jest.restoreAllMocks();
    });

    it('switches between the grid and the table, and between visible and hidden boards', () => {
        const hidden = { ...board, _id: 'b2', name: 'Board Two', hidden: true };
        renderKanban({ boards: { b1: board, b2: hidden } });

        expect(screen.queryByRole('table')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
        expect(screen.getByRole('table')).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText('Board One')).toBeTruthy();

        // Regression: the icon-only segments got their name from the icon itself
        // ("eye", "appstore") until each label carried an explicit aria-label, so
        // the control was unusable without sight.
        expect(screen.queryByText('Board Two')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Hidden (1)' }));
        expect(screen.getByText('Board Two')).toBeTruthy();

        fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
        expect(screen.getByText('Board One')).toBeTruthy();
    });

    it('keeps the hidden segment usable when nothing is hidden', () => {
        renderKanban();

        fireEvent.click(screen.getByRole('radio', { name: 'Hidden (0)' }));

        expect(screen.getByText('No hidden boards')).toBeTruthy();
    });
});
