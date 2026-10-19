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
});
