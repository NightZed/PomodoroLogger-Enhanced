import { actions, storyReducer, StoryState } from './actions';
import { Story } from './type';

const story = (stepId: string, name = 'step'): Story => ({
    stepId,
    name,
    hint: name,
    useMask: false,
});

const stateWith = (stories: Story[], index = 0, name?: string): StoryState => ({
    stories: { test: stories },
    index,
    name,
});

describe('UserGuide story reducer', () => {
    it('advances to the next step and quits at the end', () => {
        const stories = [story('one'), story('two')];

        const next = storyReducer(stateWith(stories, 0, 'test'), actions.nextStory());

        expect(next.index).toBe(1);
        expect(next.name).toBe('test');

        const last = storyReducer(next, actions.nextStory());

        expect(last).toEqual({ stories: { test: stories }, index: 0, name: undefined });
    });

    it('removes the saved tour progress when the tour finishes', () => {
        const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
        const stories = [story('one')];

        storyReducer(stateWith(stories, 0, 'test'), actions.nextStory());

        expect(removeItem).toHaveBeenCalledWith('pl-tour-progress');
    });

    it('does not advance while no tour is running', () => {
        const state = stateWith([story('one')], 0, undefined);

        expect(storyReducer(state, actions.nextStory())).toBe(state);
    });

    it('goes back one step but never before the first', () => {
        const stories = [story('one'), story('two')];

        expect(storyReducer(stateWith(stories, 1, 'test'), actions.preStory()).index).toBe(0);
        expect(storyReducer(stateWith(stories, 0, 'test'), actions.preStory()).index).toBe(0);
    });

    it('starts a tour at its first step and clears the name on quit', () => {
        const started = storyReducer(
            { stories: { test: [story('one')] }, index: 3 },
            actions.startHelpByStoryName('test')
        );

        expect(started).toMatchObject({ name: 'test', index: 0 });

        const quit = storyReducer(started, actions.quit());
        expect(quit.name).toBeUndefined();
        expect(quit.index).toBe(0);
    });

    it('resumes a tour at the step id, then by step name, then at the start', () => {
        const stories = [story('one', 'first'), story('two', 'second'), story('three')];

        expect(
            storyReducer(
                { stories: { test: stories }, index: 0 },
                actions.resumeByStepId('test', 'three')
            )
        ).toMatchObject({ name: 'test', index: 2 });

        expect(
            storyReducer(
                { stories: { test: stories }, index: 0 },
                actions.resumeByStepId('test', 'second')
            )
        ).toMatchObject({ name: 'test', index: 1 });

        expect(
            storyReducer(
                { stories: { test: stories }, index: 0 },
                actions.resumeByStepId('test', 'missing')
            )
        ).toMatchObject({ name: 'test', index: 0 });

        expect(
            storyReducer({ stories: {}, index: 0 }, actions.resumeByStepId('missing', 'one'))
        ).toMatchObject({ name: 'missing', index: 0 });
    });
});
