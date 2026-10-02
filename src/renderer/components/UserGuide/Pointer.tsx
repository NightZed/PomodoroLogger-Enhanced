import React, { FC, useCallback, useEffect, useState } from 'react';
import PointerIcon from '../../../res/pointer-left.svg';
import styled, { keyframes } from 'styled-components';
import { TargetRect, getTargetRectBySelector, waitForTargetBySelector } from './utils';

const animation = keyframes`
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(1rem);
  }
  100% {
    transform: translateX(0);
  }
`;

const Animation = styled.div`
    animation: ${animation} 1s infinite;
`;

const Normal = styled.div``;
export interface PointerProps {
    direction?: number; // radian
    show?: boolean;
    animate?: boolean;
    targetSelector: string;
    /** Measure union of visible children (see SpotlightProps.unionChildren). */
    unionChildren?: boolean;
    /** How long to wait for the target to appear before hiding the pointer. */
    waitForTargetMs?: number;
    onTargetRect?: (rect: TargetRect | null) => void;
}

export const Pointer: FC<PointerProps> = (props: PointerProps) => {
    const {
        direction = 0,
        show = true,
        animate = true,
        targetSelector,
        unionChildren = false,
        waitForTargetMs = 8000,
        onTargetRect,
    } = props;
    const [rect, setRect] = useState<TargetRect | null>(() =>
        getTargetRectBySelector(targetSelector, unionChildren)
    );

    const refresh = useCallback(() => {
        setRect(getTargetRectBySelector(targetSelector, unionChildren));
    }, [targetSelector, unionChildren]);

    useEffect(() => {
        let cancelled = false;
        setRect(getTargetRectBySelector(targetSelector, unionChildren));
        // Target may mount late (tab switch animation, async board list, modal).
        // Wait for it instead of pointing at a stale position (e.g. Pomodoro tab).
        waitForTargetBySelector(targetSelector, waitForTargetMs, unionChildren)
            .then((r) => {
                if (!cancelled) {
                    setRect(r);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRect(null);
                }
            });
        window.addEventListener('resize', refresh);
        window.addEventListener('scroll', refresh, true);
        const observer = new MutationObserver(refresh);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });
        // Tab switch / StackGrid layout settles a few frames later.
        const raf = requestAnimationFrame(refresh);
        return () => {
            cancelled = true;
            window.removeEventListener('resize', refresh);
            window.removeEventListener('scroll', refresh, true);
            observer.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [targetSelector, waitForTargetMs, unionChildren, refresh]);

    useEffect(() => {
        if (onTargetRect) {
            onTargetRect(rect);
        }
    }, [rect, onTargetRect]);

    const Wrapper = animate ? Animation : Normal;
    if (!rect) {
        return <></>;
    }
    const x = rect.x + rect.w / 2;
    const y = rect.y + rect.h / 2;
    return (
        <div
            style={{
                position: 'fixed',
                left: x,
                top: y,
                display: show ? undefined : 'none',
                zIndex: 2003,
                transform: `rotate(${direction}rad)`,
                transition: 'transform 0.3s',
                pointerEvents: 'none',
            }}
        >
            <Wrapper>
                <PointerIcon
                    style={{
                        fontSize: 48,
                        fill: 'white',
                        transform: `translate(16px, ${Math.cos(direction * 2) * -16}px)`,
                        transition: 'transform 0.3s',
                    }}
                />
            </Wrapper>
        </div>
    );
};
