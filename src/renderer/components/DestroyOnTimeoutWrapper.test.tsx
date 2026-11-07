/**
 * The wrapper is what lets a page be released without paying the remount cost
 * on every tab hop. These cases pin the three moments that matter: the grace
 * expiring, coming back after the drop, and coming back during the grace.
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { DestroyOnTimeoutWrapper } from './DestroyOnTimeoutWrapper';

const TIMEOUT = 1000;

const Page = () => <div data-testid="page">page</div>;

const tree = (isVisible: boolean) => (
    <DestroyOnTimeoutWrapper isVisible={isVisible} timeout={TIMEOUT}>
        <Page />
    </DestroyOnTimeoutWrapper>
);

const advance = (ms: number) => {
    act(() => {
        jest.advanceTimersByTime(ms);
    });
};

describe('DestroyOnTimeoutWrapper', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(cleanup);

    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders the page while it is visible', () => {
        const { queryByTestId } = render(tree(true));

        expect(queryByTestId('page')).not.toBeNull();
    });

    it('drops the page only once the whole grace period has passed', () => {
        const { queryByTestId, rerender } = render(tree(true));

        rerender(tree(false));
        advance(TIMEOUT - 1);
        expect(queryByTestId('page')).not.toBeNull();

        advance(1);
        expect(queryByTestId('page')).toBeNull();
    });

    it('restores a dropped page immediately, without waiting for the timeout', () => {
        const { queryByTestId, rerender } = render(tree(true));

        rerender(tree(false));
        advance(TIMEOUT);
        expect(queryByTestId('page')).toBeNull();

        rerender(tree(true));
        expect(queryByTestId('page')).not.toBeNull();
    });

    it('starts a fresh grace period after coming back mid-grace', () => {
        const { queryByTestId, rerender } = render(tree(true));

        rerender(tree(false));
        advance(TIMEOUT - 100);

        // Back before the drop: the pending timer must be cancelled.
        rerender(tree(true));
        advance(200);
        expect(queryByTestId('page')).not.toBeNull();

        // Leaving again schedules a new, full grace period.
        rerender(tree(false));
        advance(TIMEOUT - 1);
        expect(queryByTestId('page')).not.toBeNull();

        advance(1);
        expect(queryByTestId('page')).toBeNull();
    });
});
