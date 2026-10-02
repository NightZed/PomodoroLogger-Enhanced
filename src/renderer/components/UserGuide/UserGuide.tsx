import { Story } from './type';
import { actions } from './actions';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Pointer } from './Pointer';
import { Spotlight } from './Spotlight';
import { Dialog } from './Dialog';
import { connect } from 'react-redux';
import { RootState } from '../../reducers';
import { Dispatch } from 'redux';
import { Button } from 'antd';
import { TargetRect } from './utils';

const Mask = styled.div`
    top: 0;
    left: 0;
    position: fixed;
    background-color: var(--pl-mask);
    width: 100vw;
    height: 100vh;
    z-index: 100;
`;

export interface UserGuideProps {
    story?: Story;
    stepIndex?: number;
    totalSteps?: number;
    next: () => void;
    prev: () => void;
    exit: () => void;
}

/** Click the real tour target (tab / button / card). Used by dialog OK on cross-page steps. */
const clickTourTarget = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
        return false;
    }
    el.click();
    return true;
};

const _UserGuide: React.FC<UserGuideProps> = (props: UserGuideProps) => {
    const { story, next, prev, exit } = props;
    const [targetReady, setTargetReady] = useState(true);
    const advanceTimer = useRef<number | undefined>(undefined);

    const scheduleNext = useCallback(
        (delayMs: number = 350) => {
            window.clearTimeout(advanceTimer.current);
            advanceTimer.current = window.setTimeout(() => {
                next();
            }, delayMs);
        },
        [next]
    );

    useEffect(() => {
        return () => window.clearTimeout(advanceTimer.current);
    }, []);

    useEffect(() => {
        setTargetReady(story && story.pointerTargetSelector ? false : true);
    }, [story]);

    const onTargetRect = useCallback((rect: TargetRect | null) => {
        setTargetReady(rect != null);
    }, []);

    // Clicking the highlighted target performs its real action AND advances
    // the tour. Listener is on document (capture) so business DOM is never
    // mutated (no zIndex hack, no per-element listener -> no leaks).
    useEffect(() => {
        if (!story || !story.pointerTargetSelector || !story.advanceOnTargetClick) {
            return;
        }
        const selector = story.pointerTargetSelector;
        const onDocClick = (e: MouseEvent) => {
            const t = e.target as Element | null;
            if (
                t &&
                typeof (t as Element).closest === 'function' &&
                (t as Element).closest(selector)
            ) {
                scheduleNext(350);
            }
        };
        document.addEventListener('click', onDocClick, true);
        return () => {
            document.removeEventListener('click', onDocClick, true);
        };
    }, [story, scheduleNext]);

    useEffect(() => {
        if (!story || !story.confirmElementId) {
            return;
        }
        const elem = document.getElementById(story.confirmElementId);
        if (!elem) {
            return;
        }
        const listener = () => scheduleNext(200);
        elem.addEventListener('click', listener);
        return () => {
            elem.removeEventListener('click', listener);
        };
    }, [story, scheduleNext]);

    useEffect(() => {
        if (!story) {
            return;
        }
        try {
            window.localStorage.setItem(
                'pl-tour-progress',
                JSON.stringify({ stepId: story.stepId, name: story.name })
            );
        } catch (e) {
            // ignore
        }
    }, [story]);

    if (!story) {
        return <></>;
    }

    const {
        hint,
        dialogPosition,
        useMask,
        spotlight,
        hasConfirm,
        advanceOnTargetClick,
        pointerDirection,
        pointerTargetSelector,
        targetJumping,
        waitForTargetMs,
        unionChildren,
    } = story;

    const stepLabel =
        props.stepIndex != null && props.totalSteps != null
            ? `Step ${props.stepIndex + 1} / ${props.totalSteps}`
            : undefined;

    const onConfirm = () => {
        if (pointerTargetSelector && advanceOnTargetClick) {
            clickTourTarget(pointerTargetSelector);
        }
        scheduleNext(350);
    };

    const onBack = () => {
        window.clearTimeout(advanceTimer.current);
        prev();
    };

    const waitingHint =
        pointerTargetSelector && !targetReady
            ? 'Waiting for the highlighted area to appear…'
            : undefined;

    const useSpotlight = useMask && spotlight && !!pointerTargetSelector;
    // Navigation steps pass clicks through the hole to the real target;
    // demo steps block the hole so looking never triggers real actions.
    const holeClickThrough = !!advanceOnTargetClick;

    return (
        <>
            {pointerTargetSelector ? (
                <Pointer
                    targetSelector={pointerTargetSelector}
                    direction={pointerDirection}
                    animate={targetJumping}
                    unionChildren={unionChildren}
                    waitForTargetMs={waitForTargetMs}
                    onTargetRect={onTargetRect}
                />
            ) : undefined}
            <Dialog
                text={waitingHint ? `${hint ?? ''} ${waitingHint}` : hint}
                title={stepLabel}
                hasConfirm={hasConfirm}
                confirmText={pointerTargetSelector && advanceOnTargetClick ? 'Take me there' : 'OK'}
                position={dialogPosition}
                onConfirm={onConfirm}
                showBack={(props.stepIndex ?? 0) > 0}
                onBack={onBack}
                showExit={true}
                onExit={exit}
            />

            {useSpotlight ? (
                <Spotlight
                    targetSelector={pointerTargetSelector!}
                    waitForTargetMs={waitForTargetMs}
                    unionChildren={unionChildren}
                    clickThrough={holeClickThrough}
                    onTargetRect={onTargetRect}
                />
            ) : useMask ? (
                <>
                    <Mask />
                    <Button
                        onClick={exit}
                        shape={'circle'}
                        icon={'close'}
                        size={'small'}
                        type={'danger'}
                        style={{
                            position: 'fixed',
                            zIndex: 2000,
                            top: 16,
                            right: 16,
                        }}
                    />
                </>
            ) : undefined}
        </>
    );
};

export const UserGuide = connect(
    ({ story: { name, index, stories } }: RootState) => ({
        story: name == null ? undefined : stories[name][index],
        stepIndex: index,
        totalSteps: name == null ? undefined : stories[name].length,
    }),
    (dispatch: Dispatch) => {
        return {
            next: () => dispatch(actions.nextStory()),
            prev: () => dispatch(actions.preStory()),
            exit: () => dispatch(actions.quit()),
        };
    }
)(_UserGuide);
