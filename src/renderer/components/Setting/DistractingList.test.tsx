import * as React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createStore } from 'redux';
import { Provider } from 'react-redux';

jest.mock('../../dbs', () => ({
    __esModule: true,
    default: { settingDB: {} },
    dbs: { settingDB: {} },
}));
jest.mock('../../workers', () => ({
    workers: {
        dbWorkers: {
            kanbanDB: {},
            listsDB: {},
            cardsDB: {},
            sessionDB: {},
            moveDB: {},
        },
        tokenizer: {},
    },
}));

import { DistractingList } from './DistractingList';

describe('DistractingList', () => {
    it('renders inputs without Ant Design form warnings', () => {
        const container = document.createElement('div');
        const store = createStore(
            (
                state = {
                    timer: { distractingList: [{ app: '', title: '' }] },
                    kanban: { boards: {} },
                }
            ) => state
        );
        const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const warnings = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            render(
                <Provider store={store}>
                    <DistractingList registerSubmit={() => undefined} onSaved={() => undefined} />
                </Provider>,
                { container }
            );

            expect(container.querySelector('[placeholder="App RegExp"]')).not.toBeNull();
            expect(container.querySelector('[placeholder="Title RegExp"]')).not.toBeNull();
            expect(
                [...errors.mock.calls, ...warnings.mock.calls]
                    .map((call) => String(call[0]))
                    .filter((message) =>
                        /cannot be given refs|addonBefore is deprecated|Form\.Item.*single child/i.test(
                            message
                        )
                    )
            ).toEqual([]);
        } finally {
            cleanup();
            errors.mockRestore();
            warnings.mockRestore();
        }
    });

    it('re-renders rows after adding and removing a rule', async () => {
        const container = document.createElement('div');
        const store = createStore(
            (
                state = {
                    timer: { distractingList: [{ app: 'Chrome', title: 'YouTube' }] },
                    kanban: { boards: {} },
                }
            ) => state
        );
        const appInputs = () => container.querySelectorAll('[placeholder="App RegExp"]');

        try {
            render(
                <Provider store={store}>
                    <DistractingList registerSubmit={() => undefined} onSaved={() => undefined} />
                </Provider>,
                { container }
            );

            await waitFor(() => expect(appInputs()).toHaveLength(1));

            const addButton = Array.from(container.querySelectorAll('button')).find((button) =>
                button.textContent?.includes('Add field')
            );
            expect(addButton).not.toBeUndefined();
            fireEvent.click(addButton!);
            await waitFor(() => expect(appInputs()).toHaveLength(2));

            const removeButton = container.querySelector('.dynamic-delete-button');
            expect(removeButton).not.toBeNull();
            fireEvent.click(removeButton!);
            await waitFor(() => expect(appInputs()).toHaveLength(1));
            expect(container.querySelector('.dynamic-delete-button')).toBeNull();
        } finally {
            cleanup();
        }
    });
});
