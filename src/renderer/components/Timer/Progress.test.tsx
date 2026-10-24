import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import Progress from './Progress';

jest.mock('antd/es/progress/Circle', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: ({ size, children }: { size: number | string; children: React.ReactNode }) =>
            React.createElement(
                'div',
                {
                    className: 'ant-progress-inner',
                    style: {
                        width: typeof size === 'number' ? size : 120,
                        height: typeof size === 'number' ? size : 120,
                    },
                },
                children
            ),
    };
});

describe('Timer Progress', () => {
    it('uses the legacy width prop as the antd v5 circle size', () => {
        const container = document.createElement('div');

        render(
            <Progress type="circle" percent={50} width={300}>
                Timer
            </Progress>,
            { container }
        );

        const circle = container.querySelector('.ant-progress-inner') as HTMLElement;
        expect(circle.style.width).toBe('300px');
        expect(circle.style.height).toBe('300px');

        cleanup();
    });

    it('exposes the classes the global circle layout is pinned to', () => {
        const { container } = render(
            <Progress type="circle" percent={50} width={300}>
                Timer
            </Progress>
        );

        // The circle is rendered without antd's Progress component, so the
        // positioning/line-height of the number and mode label comes from
        // globalStyle. Those rules match the root wrapper (.ant-progress
        // .ant-progress-circle) and the text span (.ant-progress-text); renaming
        // either here silently breaks the timer layout again.
        const root = container.firstElementChild as HTMLElement;
        expect(root.classList.contains('ant-progress')).toBe(true);
        expect(root.classList.contains('ant-progress-circle')).toBe(true);
        expect(container.querySelector('.ant-progress-text')).not.toBeNull();

        cleanup();
    });
});
