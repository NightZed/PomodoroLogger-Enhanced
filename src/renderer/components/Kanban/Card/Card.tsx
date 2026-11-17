import { Draggable } from '@hello-pangea/dnd';
import React, { FC } from 'react';
import { CardActionTypes } from './action';
import { KanbanActionTypes } from '../action';
import styled from 'styled-components';
import { Divider } from 'antd';
import formatMarkdown from './formatMarkdown';
import { getCheckboxIndex, toggleNthCheckbox } from './toggleCheckbox';
import { TimeBadge } from '../../../../components/Visualization/Badge/Badge';
import { BadgeHolder } from '../style/Badge';
import { Markdown } from '../style/Markdown';
import { PomodoroDot } from '../../Visualization/PomodoroDot';
import { Card as CardType, CardView } from '../type';
import { matchParent } from '../../../utils';
import { formatTimeYmdHm } from '../../Visualization/Timeline';
import { CreatedTime } from '../style/CreatedTime';
import { CompletedTime } from './CompletedTime';
import { t } from '../../../i18n';
import { dragActivity } from '../dragActivity';

const CardContainer = styled.div<{
    $preview?: boolean;
    $static?: boolean;
    $hovered?: boolean;
}>`
    width: 262px;
    word-break: break-word;
    background-color: var(--pl-bg-elevated);
    margin: 8px 4px 0 4px;
    border-radius: 6px;
    /* The preview and a card that is not currently registered with dnd (see
       the body of Card) must not advertise a drag they cannot start. */
    cursor: ${({ $preview, $static }) => ($preview || $static ? 'default' : 'grab')};

    /* Hover highlight: a translucent wash over the card's own colour.
       background-image keeps the theme colour underneath, so the card still
       reads as elevated instead of being repainted. The colour is
       --pl-card-hover (theme/globalStyle.ts); tune the alpha there. */
    background-image: ${({ $hovered }) =>
        $hovered ? 'linear-gradient(var(--pl-card-hover), var(--pl-card-hover))' : 'none'};
`;

const CardContent = styled.div`
    padding: 4px 12px 4px 12px;
    font-size: 14px;

    .card-icon {
        float: right;
        cursor: pointer;
    }
`;

/**
 * Lightweight stand-in for cards outside the list viewport. The full markdown
 * body is what makes opening a 100-card board expensive: every card mounts its
 * rendered HTML, badges and dnd measurements at once. Keeping the metadata and
 * a clipped text preview preserves the card's shape while the real markdown is
 * only produced when the card gets near the visible area.
 */
const CardPreview = styled.div`
    margin: 6px 0;
    max-height: 180px;
    overflow: hidden;
    white-space: pre-wrap;
    opacity: 0.55;
    font-size: 13px;
    line-height: 1.4;
`;

const CardLabels = styled.div`
    display: flex;
    flex-wrap: wrap;
    margin: 4px 0 2px 0;

    .card-label {
        font-size: 0.85em;
        border-radius: 1em;
        padding: 1px 0.6em;
        color: #fff;
        margin: 1px 4px 1px 0;
        line-height: 1.5;
        white-space: nowrap;
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
    }
`;

const renderLabels = (labels?: CardType['labels']) => {
    if (!labels || labels.length === 0) {
        return undefined;
    }

    return (
        <CardLabels>
            {labels.map((label, index) => (
                <span
                    key={`${label.name}-${index}`}
                    className="card-label"
                    style={{ backgroundColor: label.color }}
                >
                    {label.name}
                </span>
            ))}
        </CardLabels>
    );
};

export interface InputProps {
    cardId: string;
    index: number;
    listId: string;
    boardId: string;
    isDraggingOver: boolean;
    searchReg?: string;
    /** Render the markdown body immediately instead of waiting for visibility. */
    initiallyVisible?: boolean;
    /** The list is still mounting its progressive first pages. */
    isDragDisabled?: boolean;
    /**
     * The Timer sider's read-only preview: no drag, no search-triggering
     * clicks, and a class that keeps the board's `.kanban-card` selectors
     * unambiguous.
     */
    preview?: boolean;
    /** Optional `data-tour` anchor (the board's first card). */
    dataTour?: string;
    /**
     * This card is inside the mounted window of its list (see List.tsx), so it
     * is the part of the list the user is looking at: register it with dnd
     * right away instead of waiting for the lazy visibility observers.
     */
    inWindow?: boolean;
    /**
     * Render the markdown body now. The list fills a large window over a few
     * frames (`contentLimit`) so opening a board does not parse every body in
     * one commit.
     */
    renderContent?: boolean;
    /**
     * Keep this card registered with dnd. The first and last card of a list use
     * it as a sentinel: dnd derives "drop at the end" from the last draggable
     * it knows about, so when the window contains either end the reported index
     * stays the real one. A window sitting between the two ends has no DOM for
     * them, so the sentinel cannot help there.
     */
    alwaysDraggable?: boolean;
}

const canObserve = () => typeof IntersectionObserver !== 'undefined';

/**
 * Wait until the card is close to the viewport before parsing/committing its
 * markdown. `initiallyVisible` keeps the first few cards of each list (the ones
 * normally on screen when a board opens) synchronous, so a board never flashes
 * blank content at the top.
 */
function useNearViewport(
    ref: React.RefObject<HTMLDivElement | null>,
    initiallyVisible: boolean
): boolean {
    const [visible, setVisible] = React.useState(initiallyVisible || !canObserve());

    React.useEffect(() => {
        if (visible) {
            return;
        }
        const element = ref.current;
        if (!element || !canObserve()) {
            setVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '400px 0px 400px 0px' }
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, visible]);

    return visible;
}

interface CardDispatchProps {
    setContent: CardActionTypes['setContent'];
    setEditCard: KanbanActionTypes['setEditCard'];
    setSearchReg: KanbanActionTypes['setSearchReg'];
}

interface Props extends CardType, InputProps, CardDispatchProps {
    cardView?: CardView;
    // whether this card currently lives in the done list of its board
    isInDoneList?: boolean;
}

export const Card: FC<Props> = React.memo((props: Props) => {
    const markdownRef = React.useRef<HTMLDivElement>(null);
    const cardRef = React.useRef<HTMLDivElement>(null);
    const providedInnerRef = React.useRef<any>(null);
    const setCardRef = React.useCallback((element: HTMLDivElement | null) => {
        cardRef.current = element;
        const ref = providedInnerRef.current;
        if (typeof ref === 'function') {
            ref(element);
        } else if (ref != null) {
            ref.current = element;
        }
    }, []);
    const { index, _id, listId, setContent, setEditCard, setSearchReg } = props;
    const cardView = props.cardView ?? 'full';
    const isTitleOnly = cardView === 'title';
    const isFull = cardView === 'full';
    // The list hands out `renderContent` in small batches when a window first
    // mounts, so opening a board paints before all markdown is parsed. The
    // observer remains the fallback for cards outside that batch.
    const inWindow = props.inWindow === true;
    const renderContent = props.renderContent === true;
    const nearViewport = useNearViewport(cardRef, renderContent || props.initiallyVisible === true);
    const shouldRenderContent = renderContent || nearViewport;

    // dnd measures every registered draggable on drag start and re-renders all
    // of them when the drop animation ends, so a 500-card column costs ~1s per
    // drag. Only the mounted window registers; the DOM outside it does not
    // exist at all (see the window in List.tsx).
    const dragEnabled =
        !props.preview && !props.isDragDisabled && (props.alwaysDraggable === true || inWindow);

    // Hover highlight.
    //
    // Tracked in state instead of a `:hover` rule because dnd moves the card
    // under the pointer during the drop animation: the browser can drop
    // `:hover` for those ~100ms and only restore it on the next mouse move,
    // which reads as "the highlight goes away and comes back". `data-hover-lock`
    // (set below from the draggable snapshot) makes pointerleave a no-op for as
    // long as the drag and the drop animation last, so the card stays lit when
    // the pointer never really left it.
    const [hovered, setHovered] = React.useState(false);
    const handlePointerEnter = React.useCallback(() => {
        setHovered(true);
    }, []);
    const handlePointerLeave = React.useCallback(() => {
        if (cardRef.current?.getAttribute('data-hover-lock') === 'true') {
            return;
        }
        setHovered(false);
    }, []);

    // `pointerleave` is ignored for the whole drag, so a card that was dragged
    // out of the list and dropped over empty space keeps the highlight forever
    // -- nothing will ever send it another leave, because the pointer never
    // entered it again. Re-check once after the drop animation: the pointer
    // position is still the one recorded at release.
    const hoveredRef = React.useRef(hovered);
    React.useEffect(() => {
        hoveredRef.current = hovered;
    }, [hovered]);

    // The browser mirrors hover through its own hit-test, and during dnd's drop
    // animation the source card's fixed clone sits over the pointer -- the
    // destination card never enters the hover chain. A manually lit card then
    // never receives pointerleave, so hovering it briefly and moving away left
    // the shadow on (staying longer worked, because by then the clone was gone
    // and the browser had picked the card up). Watch the pointer geometry while
    // the card is lit instead of trusting `pointerleave`.
    React.useEffect(() => {
        if (!hovered) {
            return;
        }
        const onPointerMove = (event: PointerEvent) => {
            const element = cardRef.current;
            if (!element || element.getAttribute('data-hover-lock') === 'true') {
                return;
            }
            const rect = element.getBoundingClientRect();
            const inside =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;
            if (!inside) {
                setHovered(false);
            }
        };
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        return () => window.removeEventListener('pointermove', onPointerMove);
    }, [hovered]);

    React.useEffect(() => {
        const onPointerUp = () => {
            if (!hoveredRef.current) {
                return;
            }
            // 150ms covers dnd's 0.1s drop animation plus a frame; the check
            // has to run after the card is back in its layout position.
            window.setTimeout(() => {
                if (performance.now() - dragActivity.lastDropAt > 500) {
                    return;
                }
                const element = cardRef.current;
                const pointer = dragActivity.pointer;
                if (!element || !pointer || typeof document.elementsFromPoint !== 'function') {
                    return;
                }
                const stack = document.elementsFromPoint(pointer.x, pointer.y);
                if (!stack.some((node) => node === element || element.contains(node))) {
                    setHovered(false);
                }
            }, 150);
        };
        window.addEventListener('pointerup', onPointerUp);
        return () => window.removeEventListener('pointerup', onPointerUp);
    }, []);

    // A card dragged into another list is a brand-new component: the drag source
    // was the old instance. Nothing ever sent it a pointerenter, and the browser
    // only does that once the pointer moves -- so the highlight blinked off and
    // came back a moment later. Right after a drop, ask the document whether the
    // pointer is already over this card and light it up without waiting for the
    // mouse.
    React.useLayoutEffect(() => {
        if (performance.now() - dragActivity.lastDropAt > 500) {
            return;
        }
        const element = cardRef.current;
        const pointer = dragActivity.pointer;
        if (!element || !pointer || typeof document.elementsFromPoint !== 'function') {
            return;
        }
        // elementsFromPoint, not elementFromPoint: during the drop animation
        // dnd's fixed-position card can still sit on top of the pointer and
        // hide the freshly mounted one.
        const stack = document.elementsFromPoint(pointer.x, pointer.y);
        if (stack.some((node) => node === element || element.contains(node))) {
            setHovered(true);
        }
        // Mount-only: this exists for the instance that has no hover history.
    }, []);

    const onClick = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const target = e.nativeEvent.target as HTMLElement;
            const tag = matchParent(target, '.pl-tag');
            const cardLabel = matchParent(target, '.card-label');
            const checkbox = matchParent(target, '[type="checkbox"]');
            const link = matchParent(target, 'a');
            if (cardLabel && cardLabel.textContent) {
                // The preview is not part of the board search, so a label/tag
                // click there must neither set the global filter nor fall
                // through to the card editor.
                if (!props.preview) {
                    setSearchReg('#' + cardLabel.textContent);
                }
                e.stopPropagation();
            } else if (tag && tag.textContent) {
                if (!props.preview) {
                    setSearchReg(tag.textContent);
                }
                e.stopPropagation();
            } else if (checkbox) {
                if (!markdownRef.current) {
                    return;
                }

                // The state is derived from the markdown source and re-rendered
                // after `setContent`. Letting the browser flip the input first
                // would show the wrong state for one frame (the old markup also
                // used an inline onclick for this; DOMPurify/CSP forbid that).
                e.preventDefault();
                const checkboxIndex = getCheckboxIndex(markdownRef.current, checkbox);
                const nextContent = toggleNthCheckbox(props.content, checkboxIndex);
                if (nextContent !== undefined) {
                    setContent(_id, nextContent);
                }
            } else if (link) {
                // Opening the link is entirely the anchor's default action:
                // formatMarkdown gives every <a> a target="_blank", and the
                // main process hands that new-window request to the default
                // browser (setWindowOpenHandler -> shell.openExternal). The
                // click used to fall through to setEditCard below, so the
                // external browser opened AND the card editor popped up on
                // top of it. Swallow only the editor navigation here --
                // no preventDefault, so the browser keeps opening the URL.
                e.stopPropagation();
            } else {
                setEditCard(true, listId, _id);
            }
        },
        [listId, _id, props.content, props.preview, setSearchReg, setContent, setEditCard]
    );
    const content = React.useMemo(() => {
        if (!props.searchReg) {
            return props.content;
        }

        let reg: undefined | RegExp;
        try {
            reg = new RegExp(props.searchReg, 'gimsu');
        } catch (e) {}
        if (!reg) {
            return props.content;
        }

        const oldContent = props.content;
        let newContent = '';
        let lastEnd = 0;
        let matched = reg.exec(oldContent);
        while (matched) {
            if (!matched.length) {
                break;
            }

            newContent += oldContent.slice(lastEnd, matched.index);
            newContent += `<span class="search-highlight">${matched[0]}</span>`;
            lastEnd = matched.index + matched[0].length;
            matched = reg.exec(oldContent);
        }

        newContent += oldContent.slice(lastEnd);
        return newContent;
    }, [props.content, props.searchReg]);

    // Parsing markdown on every render is expensive, and with a frequently
    // updating store (e.g. the Timer's 500ms tick) every dispatch used to
    // re-parse the markdown of every mounted card. Memoize the parse so it
    // only re-runs when the (highlighted) content changes. Off-screen cards
    // skip the parse entirely until they approach the viewport. (Content tags
    // for the search panel are no longer registered here: they are extracted on
    // demand from the store -- see extractTags / getBoardSearchTags.)
    const renderedMarkdown = React.useMemo(
        () => (shouldRenderContent ? formatMarkdown(content) : ''),
        [content, shouldRenderContent]
    );

    // dnd re-renders every Draggable between the placeholder and the end of the
    // list when a drag starts, and it cannot know that most of them did not
    // change. With 185 cards that is 185 full card renders inside the lift, so
    // the card does not start following the pointer until they all finish.
    // Keeping the body as one memoized element makes that render diff only the
    // container: React receives the exact same child element and skips the
    // subtree (markdown, badges, dates) entirely.
    const cardContent = React.useMemo(() => {
        if (isTitleOnly) {
            return (
                <CardContent>
                    <h3
                        style={{
                            margin: 0,
                            fontSize: 16,
                            lineHeight: '1.3rem',
                        }}
                    >
                        {props.title}
                    </h3>
                    {props.createdTime !== undefined ? (
                        <CreatedTime>
                            {t('kanban.card.created')}: {formatTimeYmdHm(props.createdTime)}
                        </CreatedTime>
                    ) : undefined}
                    <CompletedTime
                        completedTime={props.completedTime}
                        isInDoneList={props.isInDoneList === true}
                    />
                    {renderLabels(props.labels)}
                    <BadgeHolder className="collapsed">
                        {props.sessionIds.length > 0 ? (
                            <PomodoroDot num={props.sessionIds.length} />
                        ) : undefined}
                        {props.spentTimeInHour.estimated || props.spentTimeInHour.actual ? (
                            <TimeBadge
                                spentTime={props.spentTimeInHour.actual}
                                leftTime={
                                    props.spentTimeInHour.estimated - props.spentTimeInHour.actual
                                }
                                collapsed={true}
                            />
                        ) : undefined}
                    </BadgeHolder>
                </CardContent>
            );
        }

        return (
            <CardContent>
                <h1
                    style={{
                        margin: 0,
                        fontSize: '1.1rem',
                        lineHeight: '1.3em',
                    }}
                >
                    {props.title}
                </h1>
                {props.createdTime !== undefined ? (
                    <CreatedTime>
                        {t('kanban.card.created')}: {formatTimeYmdHm(props.createdTime)}
                    </CreatedTime>
                ) : undefined}
                <CompletedTime
                    completedTime={props.completedTime}
                    isInDoneList={props.isInDoneList === true}
                />
                {renderLabels(props.labels)}
                {shouldRenderContent ? (
                    <Markdown
                        $full={isFull}
                        dangerouslySetInnerHTML={{
                            __html: renderedMarkdown,
                        }}
                        style={isFull ? undefined : { maxHeight: 250 }}
                        ref={markdownRef}
                    />
                ) : (
                    <CardPreview>{(props.content ?? '').slice(0, 600)}</CardPreview>
                )}
                <Divider style={{ margin: '0 0 4px 0' }} />
                <BadgeHolder>
                    {props.sessionIds.length > 0 ? (
                        <PomodoroDot num={props.sessionIds.length} />
                    ) : undefined}
                    {props.spentTimeInHour.estimated || props.spentTimeInHour.actual ? (
                        <TimeBadge
                            spentTime={props.spentTimeInHour.actual}
                            leftTime={
                                props.spentTimeInHour.estimated === 0
                                    ? undefined
                                    : props.spentTimeInHour.estimated - props.spentTimeInHour.actual
                            }
                        />
                    ) : undefined}
                </BadgeHolder>
            </CardContent>
        );
    }, [
        isFull,
        isTitleOnly,
        props.completedTime,
        props.content,
        props.createdTime,
        props.isInDoneList,
        props.labels,
        props.sessionIds,
        props.spentTimeInHour,
        props.title,
        renderedMarkdown,
        shouldRenderContent,
    ]);

    const renderCard = (dragProps?: {
        draggableProps?: Record<string, any>;
        dragHandleProps?: Record<string, any> | null;
        style?: React.CSSProperties;
        hoverLock?: boolean;
    }) => (
        <CardContainer
            ref={setCardRef}
            $preview={props.preview}
            $static={!dragEnabled}
            $hovered={hovered || dragProps?.hoverLock === true}
            data-tour={props.dataTour}
            data-card-id={_id}
            data-hover-lock={dragProps?.hoverLock ? 'true' : undefined}
            {...(dragProps?.draggableProps ?? {})}
            style={dragProps?.style}
            {...(dragProps?.dragHandleProps ?? {})}
            onClick={onClick}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            className={props.preview ? 'kanban-card-preview' : 'kanban-card'}
        >
            {cardContent}
        </CardContainer>
    );

    if (!dragEnabled) {
        return renderCard();
    }

    return (
        <Draggable draggableId={_id} index={index} isDragDisabled={props.isDragDisabled}>
            {(provided, snapshot) => {
                providedInnerRef.current = provided.innerRef;
                // dnd animates the drop for 330-550ms and only leaves
                // DROP_ANIMATING when the `transform` transition ends. 0.1s
                // keeps that event (0s fires none, which leaves the state
                // machine stuck) while making the card arrive almost at once.
                const dragStyle = snapshot.isDropAnimating
                    ? { ...provided.draggableProps.style, transitionDuration: '0.1s' }
                    : provided.draggableProps.style;
                return renderCard({
                    draggableProps: provided.draggableProps,
                    dragHandleProps: provided.dragHandleProps,
                    style: dragStyle,
                    // dnd keeps moving the card under the pointer until the
                    // drop animation ends. Any pointerleave fired during that
                    // movement must not switch the highlight off, otherwise it
                    // stays dark until the mouse moves again.
                    hoverLock: snapshot.isDragging || snapshot.isDropAnimating,
                });
            }}
        </Draggable>
    );
});
