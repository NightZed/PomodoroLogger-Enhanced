import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { FocusSelector } from './FocusSelector';
import { actions } from './action';

const boards = {
    oldest: { _id: 'oldest', name: 'Oldest Project', createdTime: 1 },
    legacy: { _id: 'legacy', name: 'Legacy Project' },
    newest: { _id: 'newest', name: 'Newest Project', createdTime: 30 },
    middle: { _id: 'middle', name: 'Middle Project', createdTime: 10 },
};

const renderSelector = (boardId?: string, width?: number) => {
    const store = createStore((state: any) => state, {
        timer: { boardId },
        kanban: { boards },
    });
    const dispatch = jest.spyOn(store, 'dispatch');
    const view = render(
        <Provider store={store}>
            <FocusSelector width={width} />
        </Provider>
    );
    return { ...view, dispatch };
};

const openOptions = (container: HTMLElement) => {
    const selector = container.querySelector('.ant-select');
    expect(selector).not.toBeNull();
    fireEvent.mouseDown(selector!);
    return Array.from(document.body.querySelectorAll('.ant-select-item-option')).map((option) =>
        option.textContent?.trim()
    );
};

describe('Timer FocusSelector', () => {
    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.restoreAllMocks();
    });

    it('lists boards newest first and legacy boards last', () => {
        const { container } = renderSelector();

        expect(openOptions(container)).toEqual([
            'Newest Project',
            'Middle Project',
            'Oldest Project',
            'Legacy Project',
            'No Focusing Project',
        ]);
    });

    it('selects a project', () => {
        const { container, dispatch } = renderSelector();

        openOptions(container);
        fireEvent.click(
            Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
                (option) => option.textContent?.trim() === 'Middle Project'
            )!
        );

        expect(dispatch).toHaveBeenCalledWith(actions.setBoardId('middle'));
    });

    it('clears the selection through the empty option', () => {
        const { container, dispatch } = renderSelector('middle');

        openOptions(container);
        fireEvent.click(
            Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
                (option) => option.textContent?.trim() === 'No Focusing Project'
            )!
        );

        expect(dispatch).toHaveBeenCalledWith(actions.setBoardId(undefined));
    });

    it('shows the current selection and supports a fixed width', () => {
        const { container } = renderSelector('middle', 200);

        expect(container.textContent).toContain('Middle Project');
        const select = container.querySelector('.ant-select') as HTMLElement;
        expect(select.style.width).toBe('200px');
    });
});
