import * as React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Button, ConfigProvider } from 'antd';

describe('session ending start button', () => {
    it('keeps the start action working without creating a wave ResizeObserver', () => {
        const container = document.createElement('div');
        const onClick = jest.fn();
        const observers: unknown[] = [];

        class TestResizeObserver {
            observe = jest.fn();
            disconnect = jest.fn();

            constructor() {
                observers.push(this);
            }
        }

        const previousResizeObserver = window.ResizeObserver;
        Object.defineProperty(window, 'ResizeObserver', {
            configurable: true,
            value: TestResizeObserver,
        });

        try {
            render(
                <ConfigProvider wave={{ disabled: true }}>
                    <Button onClick={onClick}>Start Focusing</Button>
                </ConfigProvider>,
                { container }
            );
            fireEvent.click(container.querySelector('button')!);

            expect(onClick).toHaveBeenCalledTimes(1);
            expect(observers).toHaveLength(0);
        } finally {
            cleanup();
            Object.defineProperty(window, 'ResizeObserver', {
                configurable: true,
                value: previousResizeObserver,
            });
        }
    });
});
