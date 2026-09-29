import React, { FC, useCallback, useEffect, useState } from 'react';
import { TargetRect, getTargetRectBySelector, waitForTargetBySelector } from './utils';

export interface SpotlightProps {
    targetSelector: string;
    padding?: number;
    waitForTargetMs?: number;
    /**
     * Measure the union of the target's visible children instead of the target
     * box itself. Needed when visible content lives in absolutely-positioned
     * children (WorkRestIcon FadeEffects) and the target box is a long strip.
     */
    unionChildren?: boolean;
    /**
     * When true, the hole is click-through: clicks reach the real target
     * (navigation steps). When false (default), the hole intercepts clicks so
     * demo steps never trigger real actions (e.g. starting the timer).
     */
    clickThrough?: boolean;
    /** Clicking the hole lets the event pass to the real target; clicking dim area blocks it. */
    onTargetClick?: () => void;
    onTargetRect?: (rect: TargetRect | null) => void;
}

/**
 * Hollow spotlight overlay. Unlike the legacy full-screen Mask + `zIndex: 2008` hack,
 * this never mutates business DOM, so it works inside transformed ancestors
 * (StackGrid) and overflow containers (Kanban overview).
 */
export const Spotlight: FC<SpotlightProps> = (props: SpotlightProps) => {
    const {
        targetSelector,
        padding = 6,
        waitForTargetMs = 8000,
        unionChildren = false,
        clickThrough = false,
        onTargetClick,
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

    if (!rect) {
        // Target not ready: block interaction with a plain dim layer rather than
        // pointing at a wrong place.
        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: 'var(--pl-mask)',
                    zIndex: 2000,
                }}
            />
        );
    }

    const x = Math.max(0, rect.x - padding);
    const y = Math.max(0, rect.y - padding);
    const w = rect.w + padding * 2;
    const h = rect.h + padding * 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const holeStyle: React.CSSProperties = {
        position: 'fixed',
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: 2002,
        backgroundColor: 'transparent',
        // Demo steps (clickThrough=false): intercept clicks so the tour never
        // triggers the real action behind the hole (timer start, mode switch...).
        // Navigation steps (clickThrough=true): let clicks reach the real target.
        pointerEvents: clickThrough ? 'none' : 'auto',
        cursor: clickThrough ? undefined : 'not-allowed',
        borderRadius: 6,
        boxShadow: '0 0 0 2px rgba(255,255,255,0.9), 0 0 12px rgba(0,0,0,0.35)',
    };

    // Four dim panels around the hole: target itself stays clickable.
    const panel = (style: React.CSSProperties): React.CSSProperties => ({
        position: 'fixed',
        backgroundColor: 'var(--pl-mask)',
        zIndex: 2000,
        ...style,
    });

    return (
        <>
            <div style={panel({ left: 0, top: 0, width: '100vw', height: y })} />
            <div
                style={panel({
                    left: 0,
                    top: y + h,
                    width: '100vw',
                    height: Math.max(0, vh - (y + h)),
                })}
            />
            <div style={panel({ left: 0, top: y, width: x, height: h })} />
            <div
                style={panel({
                    left: x + w,
                    top: y,
                    width: Math.max(0, vw - (x + w)),
                    height: h,
                })}
            />
            <div style={holeStyle} onClick={onTargetClick} data-tour-hole={targetSelector} />
        </>
    );
};
