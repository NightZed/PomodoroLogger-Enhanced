import { createAction, createReducer } from 'deox';
import { Story } from './type';
import { timerStories, kanbanStories, allStories } from './stories';

export interface StoryState {
    stories: { [name: string]: Story[] };
    index: number;
    name?: string;
}

const defaultState: StoryState = {
    stories: {
        timerStories,
        kanbanStories,
        allStories,
    },
    index: 0,
};

const nextStory = createAction('[Guide]NEXT_STORY');

const preStory = createAction('[Guide]PRE_STORY');

const quit = createAction('[Guide]QUIT');

const startHelpByStoryName = createAction(
    '[Guide]HELP_BY_NAME',
    (resolve) =>
        (name: string = 'all') =>
            resolve({ name })
);

const resumeByStepId = createAction(
    '[Guide]RESUME_BY_STEP',
    (resolve) => (tourName: string, stepId: string) => resolve({ tourName, stepId })
);

export const actions = {
    nextStory,
    preStory,
    quit,
    startHelpByStoryName,
    resumeByStepId,
};

const indexOfStepId = (stories: Story[] | undefined, stepId: string): number => {
    if (!stories) {
        return 0;
    }
    const byStepId = stories.findIndex((s) => s.stepId === stepId);
    if (byStepId >= 0) {
        return byStepId;
    }
    const byName = stories.findIndex((s) => s.name === stepId);
    return byName >= 0 ? byName : 0;
};

export const storyReducer = createReducer(defaultState, (handle) => [
    handle(nextStory, (state) => {
        if (state.name == null) {
            return state;
        }

        if (state.index + 1 >= state.stories[state.name].length) {
            // Tour finished: quit instead of looping back to step 0.
            try {
                window.localStorage.removeItem('pl-tour-progress');
            } catch (e) {
                // ignore
            }
            return {
                stories: state.stories,
                index: 0,
                name: undefined,
            };
        }
        return {
            ...state,
            index: state.index + 1,
        };
    }),
    handle(preStory, (state) => {
        if (state.index - 1 < 0) {
            return {
                stories: state.stories,
                index: 0,
            };
        }
        return {
            ...state,
            index: state.index - 1,
        };
    }),
    handle(quit, (state) => ({
        ...state,
        name: undefined,
    })),
    handle(startHelpByStoryName, (state, { payload: { name } }) => ({
        ...state,
        name,
        index: 0,
    })),
    handle(resumeByStepId, (state, { payload: { tourName, stepId } }) => ({
        ...state,
        name: tourName,
        index: indexOfStepId(state.stories[tourName], stepId),
    })),
]);
