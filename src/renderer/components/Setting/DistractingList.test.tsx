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
        knn: {},
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
            expect(container.querySelector('form')?.classList).not.toContain('ant-form-vertical');
            expect(container.querySelector('.ant-form-item-label')).not.toBeNull();
            expect(container.querySelector('.ant-form-item-label')?.className).toContain(
                'ant-col-sm-4'
            );
            expect(
                container
                    .querySelectorAll('.ant-form-item-row')[1]
                    .querySelector('.ant-col-sm-offset-4')
            ).not.toBeNull();
            const removeButton = container.querySelector('.dynamic-delete-button');
            expect(removeButton?.parentElement?.querySelector('.ant-input-group')).toBeFalsy();
            const appAddon = Array.from(container.querySelectorAll('span')).find(
                (element) => element.textContent === 'App'
            );
            expect(appAddon).not.toBeUndefined();
            const appAddonStyle = window.getComputedStyle(appAddon!);
            expect(appAddonStyle.borderRadius).toBe('6px 0 0 6px');
            expect(appAddonStyle.padding).toBe('0px 11px');
            const addonStyles = Array.from(document.querySelectorAll('style'))
                .map((style) => style.textContent)
                .join('');
            expect(addonStyles).toContain('background:var(--pl-bg-sunken)');
            expect(addonStyles).toContain('border-right:1px solid var(--pl-border)');
            const inputAfterAddon = appAddon!.nextElementSibling;
            expect(
                inputAfterAddon?.matches('.ant-input') ||
                    inputAfterAddon?.querySelector('.ant-input') != null
            ).toBe(true);
            expect(container.querySelectorAll('.ant-form-item')[0].getAttribute('style')).toContain(
                'margin-bottom: 4px'
            );
            expect(container.querySelectorAll('.ant-form-item')[1].getAttribute('style')).toContain(
                'margin-bottom: 24px'
            );
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
