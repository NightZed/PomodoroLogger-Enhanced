import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { AntdIcon } from './antdIcon';

describe('AntdIcon', () => {
    it('renders the bulb icon used by the timer theme toggle', () => {
        const container = document.createElement('div');

        render(<AntdIcon type="bulb" />, { container });

        expect(container.querySelector('svg')).not.toBeNull();

        cleanup();
    });

    it('forwards refs to the icon element for antd overlay triggers', () => {
        const container = document.createElement('div');
        const iconRef = React.createRef<HTMLSpanElement>();

        render(<AntdIcon ref={iconRef} type="setting" />, { container });

        expect(iconRef.current).toBe(container.firstElementChild);
        expect(iconRef.current?.tagName).toBe('SPAN');

        cleanup();
    });
});
