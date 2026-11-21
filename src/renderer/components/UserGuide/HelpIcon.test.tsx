import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { HelpIcon } from './HelpIcon';
import { actions } from './actions';

const renderIcon = (props: Partial<React.ComponentProps<typeof HelpIcon>> = {}) => {
    const store = createStore((state: any) => state, {});
    const dispatch = jest.spyOn(store, 'dispatch');
    const view = render(
        <Provider store={store}>
            <HelpIcon storyName="allStories" {...props} />
        </Provider>
    );
    return { ...view, dispatch };
};

describe('UserGuide HelpIcon', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        cleanup();
        jest.restoreAllMocks();
    });

    it('starts the named tour when clicked', () => {
        const { getByRole, dispatch } = renderIcon();

        fireEvent.click(getByRole('button', { name: 'Start guide' }));

        expect(dispatch).toHaveBeenCalledWith(actions.startHelpByStoryName('allStories'));
    });

    it('resumes from the saved step of the same tour', () => {
        window.localStorage.setItem(
            'pl-tour-progress',
            JSON.stringify({ stepId: 'timer.pause', name: 'allStories' })
        );
        const { getByRole, dispatch } = renderIcon({ resume: true });

        fireEvent.click(getByRole('button', { name: 'Help' }));

        expect(dispatch).toHaveBeenCalledWith(actions.resumeByStepId('allStories', 'timer.pause'));
    });

    it('starts from the beginning when no step was saved', () => {
        const { getByRole, dispatch } = renderIcon({ resume: true });

        fireEvent.click(getByRole('button', { name: 'Help' }));

        expect(dispatch).toHaveBeenCalledWith(actions.startHelpByStoryName('allStories'));
    });

    it('ignores a corrupt saved progress entry', () => {
        window.localStorage.setItem('pl-tour-progress', '{ not json');
        const { getByRole, dispatch } = renderIcon({ resume: true });

        fireEvent.click(getByRole('button', { name: 'Help' }));

        expect(dispatch).toHaveBeenCalledWith(actions.startHelpByStoryName('allStories'));
    });
});
