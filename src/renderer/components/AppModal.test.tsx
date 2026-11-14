import * as React from 'react';
import { render } from '@testing-library/react';

const mockModalProps: Record<string, unknown>[] = [];

jest.mock('antd', () => ({
    Modal: (props: Record<string, unknown>) => {
        mockModalProps.push(props);
        return null;
    },
}));

// The import sits after `jest.mock` on purpose: the factory has to be
// registered before `AppModal` pulls in `antd`.
import { AppModal, dialogMotionProps } from './AppModal';

const lastProps = () => mockModalProps[mockModalProps.length - 1];

describe('AppModal', () => {
    beforeEach(() => {
        mockModalProps.length = 0;
    });

    it('opens and closes with the shared motion by default', () => {
        render(<AppModal open />);

        expect(lastProps()).toMatchObject(dialogMotionProps);
    });

    it('empties both transition names when instant', () => {
        // An empty name makes rc-motion skip its state machine and unmount the
        // mask in the same commit. Handing over from one dialog to another
        // relies on it: two masks left overlapping read as a flicker.
        render(<AppModal open instant />);

        expect(lastProps()).toMatchObject({ transitionName: '', maskTransitionName: '' });
    });
});
