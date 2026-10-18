import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { AntdIcon } from './antdIcon';

describe('AntdIcon', () => {
    it('renders the bulb icon used by the timer theme toggle', () => {
        const container = document.createElement('div');

        act(() => {
            ReactDOM.render(<AntdIcon type="bulb" />, container);
        });

        expect(container.querySelector('svg')).not.toBeNull();

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
    });

    it('forwards refs to the icon element for antd overlay triggers', () => {
        const container = document.createElement('div');
        const iconRef = React.createRef<HTMLSpanElement>();

        act(() => {
            ReactDOM.render(<AntdIcon ref={iconRef} type="setting" />, container);
        });

        expect(iconRef.current).toBe(container.firstElementChild);
        expect(iconRef.current?.tagName).toBe('SPAN');

        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
    });
});
