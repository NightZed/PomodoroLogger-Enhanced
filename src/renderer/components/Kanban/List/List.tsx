import { Draggable, Droppable } from '@hello-pangea/dnd';
import FocusIcon from '../../../../res/Focus.svg';
import DoneIcon from '../../../../res/done.svg';
import React, { FC, useRef, useState } from 'react';
import { ListActionTypes } from './action';
import styled from 'styled-components';
import { Card } from '../Card';
import { Button, Dropdown, Input, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { AntdIcon as Icon, IconComponent } from '../../antdIcon';
import { feedback, FEEDBACK_MESSAGES } from '../../feedback';
import { KanbanActionTypes } from '../action';
import { CardActionTypes, CardsState } from '../Card/action';
import { CardView, List as ListType } from '../type';
import { mergeRefs } from '../../../utils';
import { debounce } from 'lodash';
import { useI18n } from '../../../i18n';
import { dragActivity } from '../dragActivity';

// Windowed rendering: at most WINDOW_SIZE cards are mounted. dnd measures every
// registered draggable on drag start, so a 500-card column mounted all of them
// and cost ~1s per drag; the window is ~50ms. Heights are measured as cards
// render and cached; cards never rendered yet fall back to
// ESTIMATED_CARD_HEIGHT.
const WINDOW_SIZE = 40;
const WINDOW_OVERSCAN = 800;
const ESTIMATED_CARD_HEIGHT = 140;
// First window commit: only these cards parse their markdown synchronously;
// CONTENT_BATCH more join on each following frame.
const CONTENT_INITIAL = 8;
const CONTENT_BATCH = 8;
// Upper bound on measurement passes one chain may run. A pass can move the
// window (the corrected offsets change `start`/`end`), which mounts cards that
// need measuring themselves; normally that settles in one or two passes. A
// layout that keeps reporting a different height on every read would keep the
// chain going, and React aborts the whole tree ("Maximum update depth
// exceeded", error #185) once it reaches 50 synchronous updates. Stop well
// short of that -- the next scroll starts a fresh chain.
const MAX_MEASURE_PASSES = 8;

const Container = styled.div`
    padding: 4px;
    margin: 6px;
    border-radius: 6px;
    background-color: var(--pl-bg-elevated);
`;

const ListHead = styled.div`
    user-select: none;
    height: 4em;
    min-width: 250px;
    padding: 4px 12px;
    background-color: var(--pl-bg-elevated);
    color: var(--pl-text);
    border-radius: 6px;
    position: relative;

    h1 {
        font-size: 18px;
        margin: 0;
    }

    .list-head-text {
        user-select: none;
        position: absolute;
        top: 24px;
        transform: translateY(-50%);
        left: 8px;
    }

    .list-head-icon {
        position: absolute;
        top: 20px;
        transform: translateY(-50%);
        right: 8px;
        cursor: pointer;
    }

    .list-head-icon i:hover {
        color: var(--pl-primary);
    }
`;

// Top fade of the list body.
//
// It must be an overlay, not a mask: mask/filter/transform on an ancestor
// change the containing block of dnd's fixed-position drag clone, which drops
// the dragged card below the list and clips it.
//
// It sits next to the scroll container, inside ListBody, not inside Cards:
// absolutely positioned children of a scroll container scroll with its content.
// Against ListBody the overlay is fixed to the visible top edge, and it takes
// no space in Cards' content box, so dnd's measurement is unaffected.
const BeforePlaceHolder = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    /* Same as one card gap: the fade ends exactly where the first card starts,
       so it never paints over a card when the list is scrolled to the top. */
    height: 8px;
    background: linear-gradient(
        var(--pl-bg-sunken) 0%,
        rgba(255, 255, 255, 0.001) 100%
    ); /* transparent keyword is broken in Safari */
    pointer-events: none;
    z-index: 1;
`;

// Bottom fade, same length and gradient as the top one. It also supplies the
// gap below the last card: there is deliberately no margin above it, so the
// list edge sits one card-gap away from the content instead of 20px further
// down.
const AfterPlaceHolder = styled.div`
    margin-top: 0;
    position: sticky;
    display: block;
    bottom: -2px;
    width: 100%;
    height: 8px;
    background: linear-gradient(
        rgba(255, 255, 255, 0.001),
        var(--pl-bg-sunken)
    ); /* transparent keyword is broken in Safari */
    pointer-events: none;
    z-index: 1;
`;

/**
 * Toggled on the scroll container while it scrolls (and for a moment after).
 *
 * Its job is to reveal the scrollbar thumb.
 *
 * It is a plain DOM class rather than React state because a wheel gesture fires
 * `scroll` up to 60 times a second, and a state update re-rendered this list
 * (re-running every mounted card's memo comparison, then styled-components'
 * class generation for the column) on every throttled tick, even though the flag
 * itself only changes twice per gesture. Toggling the class costs one style
 * invalidation.
 */
const SCROLLING_CLASS = 'pl-list-scrolling';

// Positioning frame for the scroll container and the top fade. It is not a
// scroll container itself, so an absolutely positioned child stays at the top
// while the cards scroll underneath.
//
// 270px is a filled list's width: CardContainer is 262px plus 4px of margin on
// each side. Fixing it here keeps an empty list at the same width when the last
// card leaves, and while a card is dragged over it (the drop placeholder
// carries that width).
const ListBody = styled.div`
    position: relative;
    width: 270px;
`;

const Cards = styled.div`
    position: relative;
    /* No extra gap at the top: CardContainer's 8px margin is both the
       card-to-card spacing and the distance from the list edge, so the content
       starts exactly one card gap below the top. */
    box-sizing: border-box;
    padding: 0;
    background-color: var(--pl-bg-sunken);
    border-radius: 4px;
    max-height: calc(100vh - 230px);
    overflow-y: overlay;
    /* A single-axis scroll container cannot keep "visible" on the other axis:
       the spec computes it to "auto", so any transient overflow (e.g. while a
       drag moves things around) pops a horizontal scrollbar. Cards never
       legitimately overflow horizontally (262px + margins = the 270px body),
       so clip it. */
    overflow-x: hidden;
    min-height: 200px;
    /* The thumb paints itself with box-shadow: inset 0 0 0 10px, i.e. with
       currentColor, so color *is* the scrollbar color here and has to come from
       the theme: a fixed dark color is invisible on a dark list body. It stays on
       this element (not on the thumb) because a transition on the custom
       scrollbar pseudo-element does not run -- it has no layout object -- and
       the 250ms reveal is part of the design. The cards below set their own
       color (see the rule below), so the animated value only reaches the
       scrollbar. */
    color: rgba(0, 0, 0, 0);
    transition: color 250ms;
    & > * {
        color: var(--pl-text);
    }

    &.${SCROLLING_CLASS} {
        color: var(--pl-scrollbar-thumb);
    }

    /* The "&" matters here: styled-components v6 no longer turns a nested
       scrollbar pseudo-element selector into a self selector, so without it
       these rules would style the scrollbars of *descendants* (the card
       bodies) instead of the list column itself. */
    &::-webkit-scrollbar {
        width: 4px;
        height: 4px;
        background-color: rgba(0, 0, 0, 0);
    }

    &::-webkit-scrollbar-track {
        width: 4px;
        background-color: rgba(0, 0, 0, 0);
    }

    &::-webkit-scrollbar-thumb {
        background-color: transparent;
        box-shadow: inset 0 0 0 10px;
        width: 4px;
        border-radius: 4px;
    }
`;

const ButtonWrapper = styled.div`
    margin-top: 4px;
    text-align: center;
    position: sticky;
    left: 50%;
    bottom: 0;
    display: flex;
    justify-content: center;
`;

export interface InputProps {
    listId: string;
    index: number;
    boardId: string;
    focused?: boolean;
    done?: boolean;
    /**
     * The Timer sider's read-only preview of the focused list. It always shows
     * the whole body, ignores the board search and never writes the shared
     * `visibleCards`, so the board view stays the only owner of that filter.
     */
    preview?: boolean;
}

interface Props extends ListType, InputProps, ListActionTypes, KanbanActionTypes {
    searchReg?: string;
    cardsState: CardsState;
    cardView: CardView;
    setContent: CardActionTypes['setContent'];
}

/**
 * Whether two `visibleCards` values describe the same filter result.
 *
 * `visibleCards` is derived by every mounted `List` of a list id but stored in
 * the shared list state. More than one `List` can be mounted for the same id:
 * the board renders the focused list, and so does the Timer sider's
 * focused-list preview (the Timer page stays mounted, see `APP_TABS.forceRender`).
 * Each instance filters into its own array -- same contents, different
 * identity -- so comparing by reference made the two overwrite each other
 * forever while typing in the board search ("Maximum update depth exceeded").
 * The store only needs to learn when the *result* actually changed.
 */
const isSameVisibleCards = (a?: string[], b?: string[]) => {
    if (a === b) {
        return true;
    }

    if (a === undefined || b === undefined || a.length !== b.length) {
        return false;
    }

    return a.every((id, index) => id === b[index]);
};

export const List: FC<Props> = React.memo((props: Props) => {
    const { t } = useI18n();
    const {
        focused = false,
        preview = false,
        searchReg,
        cards,
        cardsState,
        done = false,
        setVisibleCards,
        visibleCards: storedVisibleCards,
        _id,
        boardId,
        deleteList,
    } = props;
    const cardListRef = React.useRef<HTMLElement>(null);
    React.useEffect(() => {
        const cardList = cardListRef.current;
        if (!cardList) {
            return;
        }

        const hideScrollBar = debounce(() => {
            cardList.classList.remove(SCROLLING_CLASS);
        }, 600);

        // Passive: the handler only toggles a class and never prevents
        // scrolling, so the browser can keep scrolling off the main thread
        // instead of waiting for this listener. It writes the class at most
        // once per gesture (`contains` is a plain attribute read and does not
        // invalidate style), so a 60/s event stream costs no more than the
        // boolean check itself.
        const onScroll = () => {
            if (!cardList.classList.contains(SCROLLING_CLASS)) {
                cardList.classList.add(SCROLLING_CLASS);
            }
            hideScrollBar();
        };

        cardList.addEventListener('scroll', onScroll, { passive: true });
        // The bar is visible for a moment after the list appears, as before.
        cardList.classList.add(SCROLLING_CLASS);
        hideScrollBar();
        return () => {
            cardList.removeEventListener('scroll', onScroll);
            // A pending debounced callback would touch a detached node (and
            // leak a timer per mount/unmount cycle), so cancel it explicitly.
            hideScrollBar.cancel();
        };
    }, []);

    const visibleCards = React.useMemo(() => {
        // The preview is not part of the board's search view; it always shows
        // every card of the focused list.
        if (preview) {
            return undefined;
        }

        let reg: RegExp | undefined;
        try {
            reg = searchReg ? new RegExp(searchReg, 'gimsu') : undefined;
        } catch (e) {}

        if (reg == null) {
            return undefined;
        }

        const visibleCards_ = cards.filter((id) => {
            if (!reg) return true;
            const card = cardsState[id];
            // The card may already be gone while this list is still mounted
            // (e.g. its whole board was just deleted); hide it instead of
            // crashing on `.title`.
            if (card === undefined) return false;
            return (
                card.title.match(reg) ||
                card.content.match(reg) ||
                (card.labels ?? []).some((label) => ('#' + label.name).match(reg!))
            );
        });
        return visibleCards_;
    }, [preview, searchReg, cardsState, cards]);

    React.useEffect(() => {
        // Only the board view owns the shared filter. The preview reads and
        // writes nothing here, so a board search can never be overwritten by
        // the Timer sider (and vice versa).
        if (preview) {
            return;
        }

        // Opening a board mounts every list, and this used to dispatch a
        // "visible cards = undefined" action for each one even when the store
        // already held the same value. Each dispatch notified every connected
        // card, so a board with many lists/cards paid that cost on open. Only
        // write when the filter actually changed. The comparison is by content
        // because duplicate List instances for one id derive equal arrays with
        // different identities (see `isSameVisibleCards`).
        if (isSameVisibleCards(visibleCards, storedVisibleCards)) {
            return;
        }
        setVisibleCards(_id, visibleCards);
    }, [_id, preview, visibleCards, storedVisibleCards, setVisibleCards]);

    const filteredCards = React.useMemo(
        () => visibleCards ?? props.cards ?? [],
        [visibleCards, props.cards]
    );

    // Windowed rendering: only the cards around the viewport are mounted, the
    // rest of the column is two spacers. dnd measures every registered
    // draggable on drag start, so mounting all 500 cost ~1s per drag; the
    // window keeps that at WINDOW_SIZE (~50ms measured).
    //
    // Heights are cached per card as the window renders (see the layout effect
    // below) and used to build pixel offsets. Cards that were never rendered
    // fall back to ESTIMATED_CARD_HEIGHT, so scrolling into a new area is
    // approximate for a moment and settles once those cards mount.
    const totalCards = filteredCards.length;
    const [scrollTop, setScrollTop] = React.useState(0);
    const [viewportHeight, setViewportHeight] = React.useState(600);
    const [layoutVersion, setLayoutVersion] = React.useState(0);
    const heightsRef = React.useRef(new Map<string, number>());
    /** Passes the current scroll gesture has already chained, see `MAX_MEASURE_PASSES`. */
    const measurePassesRef = React.useRef(0);

    const { offsets, totalHeight } = React.useMemo(() => {
        const next = new Array<number>(totalCards);
        let sum = 0;
        for (let index = 0; index < totalCards; index += 1) {
            next[index] = sum;
            sum += heightsRef.current.get(filteredCards[index]) ?? ESTIMATED_CARD_HEIGHT;
        }
        return { offsets: next, totalHeight: sum };
        // `layoutVersion` changes when a measurement lands; `filteredCards`
        // changes when the list or the search does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredCards, layoutVersion, totalCards]);

    // First index whose offset is at or past `value`.
    const offsetIndex = (value: number) => {
        let low = 0;
        let high = offsets.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (offsets[middle] < value) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    };

    const firstVisible = offsetIndex(Math.max(0, scrollTop - WINDOW_OVERSCAN));
    const lastVisible = offsetIndex(scrollTop + viewportHeight + WINDOW_OVERSCAN);
    const start = Math.max(0, Math.min(firstVisible, Math.max(0, totalCards - WINDOW_SIZE)));
    const end = Math.min(totalCards, Math.max(start + WINDOW_SIZE, lastVisible));
    const renderedCards = filteredCards.slice(start, end);
    const topSpacer = start > 0 ? offsets[start] : 0;
    const bottomSpacer = end < totalCards ? Math.max(0, totalHeight - offsets[end]) : 0;

    // Parsing the markdown of a whole window in the first commit is what made
    // opening a board pause (40 cards at once). Only the first CONTENT_INITIAL
    // cards render their body synchronously; the rest catch up a frame later,
    // so the board paints first and fills in after. Once the window has been
    // filled, later scrolls render their cards in full immediately.
    const [contentLimit, setContentLimit] = React.useState(CONTENT_INITIAL);
    React.useEffect(() => {
        setContentLimit(CONTENT_INITIAL);
    }, [_id, searchReg]);
    React.useEffect(() => {
        if (contentLimit >= renderedCards.length) {
            return;
        }
        const handle = requestAnimationFrame(() => {
            setContentLimit((current) => Math.min(current + CONTENT_BATCH, renderedCards.length));
        });
        return () => cancelAnimationFrame(handle);
    }, [contentLimit, renderedCards.length]);

    // The window follows the scroll position, except while a drag is running:
    // unmounting the source (or a card pressed for the next drag) makes dnd
    // throw "Cannot find draggable entry".
    const onWindowScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (dragActivity.dragging) {
            return;
        }
        const element = event.currentTarget;
        // A new gesture may chain measurement passes again.
        measurePassesRef.current = 0;
        setScrollTop(element.scrollTop);
        setViewportHeight(element.clientHeight);
    }, []);

    // Measure the cards that just mounted. The threshold keeps this from
    // looping: sub-pixel differences are ignored, and the effect only runs when
    // the window or the data changed.
    React.useLayoutEffect(() => {
        const container = cardListRef.current;
        if (!container) {
            return;
        }

        // Nothing inside is laid out: the page sits behind an inactive tab
        // pane, the window is in mini mode, etc. Every card then reports a 0
        // height, and the 8px margin would be cached as if it were a
        // measurement. That corrupts `offsets` and changes `layoutVersion`,
        // which moves the window onto cards that are equally invisible and
        // asks for one more pass -- the chain that ends at React's
        // nested-update limit. The cache keeps the heights measured while the
        // list was visible, so skipping loses nothing.
        if (container.getBoundingClientRect().height === 0) {
            return;
        }

        let changed = false;
        const nodes = container.querySelectorAll<HTMLElement>('[data-card-id]');
        nodes.forEach((node) => {
            const id = node.dataset.cardId;
            if (!id) {
                return;
            }
            // CardContainer has an 8px top margin; dnd lays cards out by
            // marginBox, so the offset has to include it.
            const height = node.getBoundingClientRect().height + 8;
            const previous = heightsRef.current.get(id);
            if (previous === undefined || Math.abs(previous - height) > 0.5) {
                heightsRef.current.set(id, height);
                changed = true;
            }
        });
        if (changed && measurePassesRef.current < MAX_MEASURE_PASSES) {
            measurePassesRef.current += 1;
            setLayoutVersion((version) => version + 1);
        }
    }, [start, end, filteredCards]);

    const [estimatedTimeSum, actualTimeSum] = React.useMemo(
        () =>
            filteredCards.reduce(
                (l: [number, number], r: string) => {
                    const card = props.cardsState[r];
                    // The card may already be gone while this list is still
                    // mounted (e.g. its whole board was just deleted); skip it
                    // instead of crashing on `.spentTimeInHour`.
                    if (card === undefined) return l;
                    return [
                        l[0] + card.spentTimeInHour.estimated,
                        l[1] + card.spentTimeInHour.actual,
                    ] as [number, number];
                },
                [0, 0] as [number, number]
            ),
        [filteredCards, props.cardsState]
    );
    const overallTimeInfo =
        estimatedTimeSum > 0 ? `${actualTimeSum.toFixed(1)}h/${estimatedTimeSum.toFixed(1)}h` : '';
    // `cards` comes from the store and can be `undefined` while the parent is
    // re-rendering a board/list that has just been deleted.
    const cardCount = props.cards?.length ?? 0;
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState('');
    const inputRef = useRef<any>(null);

    const addCard = () => {
        props.setEditCard(true, props.listId, undefined);
    };

    // The confirmation cannot live inside the Dropdown menu item: the very
    // click that opens it also closes the menu, and the popup it opened is
    // chasing a trigger that is already being hidden. That is why a
    // `Popconfirm` in the item's label only opened "sometimes" -- and why the
    // 2019 fix for the same bug (818ec34) had to open it by hand from the
    // item's `onClick`. Going through the shared modal confirm instead means
    // the menu may close freely: the dialog lives in its own layer.
    const onDelete = React.useCallback(() => {
        if (focused || done) {
            feedback.toast({ kind: 'warning', content: FEEDBACK_MESSAGES.kanban.cannotDeleteList });
            return;
        }

        feedback.confirm({
            kind: 'warning',
            title: FEEDBACK_MESSAGES.kanban.deleteListConfirm(props.title),
            content: FEEDBACK_MESSAGES.kanban.deleteListDetail,
            onOk: () => {
                deleteList(_id, boardId);
            },
        });
    }, [focused, done, _id, boardId, deleteList, props.title]);

    const onSave = () => {
        props.renameList(props._id, value);
        setIsEditing(false);
    };

    const onValueChange = (e: any) => {
        setValue(e.target.value);
    };

    const onEdit = React.useCallback(() => {
        setValue(props.title);
        setIsEditing(true);
        if (!inputRef.current) {
            return;
        }

        inputRef.current.focus();
    }, [props.title]);

    const menu: MenuProps = React.useMemo(
        () =>
            !focused && !done
                ? {
                      items: [
                          {
                              key: '1',
                              icon: <Icon type={'setting'} />,
                              label: t('common.edit'),
                              onClick: onEdit,
                          },
                          { type: 'divider' },
                          {
                              key: '3',
                              icon: <Icon type={'delete'} />,
                              label: t('common.delete'),
                              onClick: onDelete,
                          },
                      ],
                  }
                : {
                      items: [
                          {
                              key: '1',
                              icon: <Icon type={'setting'} />,
                              label: t('common.edit'),
                              onClick: onEdit,
                          },
                      ],
                  },
        [onDelete, focused, done, onEdit, t]
    );

    return (
        <Draggable draggableId={props.listId} index={props.index} isDragDisabled={preview}>
            {(provided, _snapshot) => (
                <div>
                    <Container
                        ref={provided.innerRef}
                        className={'kanban-list'}
                        // The preview must not duplicate the board's tour anchor
                        // (or any other id): only one element may own it.
                        id={
                            props.focused && !preview
                                ? 'focused-list'
                                : props.done
                                  ? 'done-list'
                                  : undefined
                        }
                        // The tour anchor lives on the board's list only: the
                        // Timer sider's preview is a second mounted copy of the
                        // same list id and must never own the same selector.
                        data-tour={props.focused && !preview ? 'focused-list' : undefined}
                        {...provided.draggableProps}
                    >
                        <ListHead {...provided.dragHandleProps}>
                            {isEditing ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <Input maxLength={25} value={value} onChange={onValueChange} />
                                    <Button onClick={onSave}>{t('common.save')}</Button>
                                </div>
                            ) : (
                                <>
                                    <span className="list-head-text">
                                        <h1>{props.title}</h1>
                                        <span>
                                            {searchReg == null ? (
                                                <>{t('kanban.list.cardCount', cardCount)} </>
                                            ) : (
                                                <>
                                                    {filteredCards.length} / {cardCount}
                                                </>
                                            )}
                                            &nbsp; {overallTimeInfo}
                                        </span>
                                    </span>
                                    <div className="list-head-icon">
                                        {focused ? (
                                            <Tooltip title={t('kanban.list.focused')}>
                                                <span style={{ color: 'red', marginRight: 8 }}>
                                                    <IconComponent component={FocusIcon} />
                                                </span>
                                            </Tooltip>
                                        ) : undefined}
                                        {done ? (
                                            <Tooltip title={t('kanban.list.done')}>
                                                <span style={{ color: 'green', marginRight: 8 }}>
                                                    <IconComponent component={DoneIcon} />
                                                </span>
                                            </Tooltip>
                                        ) : undefined}
                                        <Dropdown menu={menu} trigger={['click']}>
                                            <Icon type="menu" aria-label={t('kanban.list.menu')} />
                                        </Dropdown>
                                    </div>
                                </>
                            )}
                        </ListHead>
                        <Droppable droppableId={props._id}>
                            {(provided, { isDraggingOver }) => {
                                const mergedRef = mergeRefs([
                                    provided.innerRef,
                                    cardListRef,
                                ]) as React.RefObject<HTMLDivElement>;
                                return (
                                    <ListBody>
                                        <Cards
                                            ref={mergedRef}
                                            {...provided.droppableProps}
                                            onScroll={onWindowScroll}
                                        >
                                            {topSpacer > 0 ? (
                                                <div style={{ height: topSpacer }} />
                                            ) : null}
                                            {renderedCards.map((cardId, offset) => {
                                                const index = start + offset;
                                                const card = cardsState[cardId];
                                                // The card may already be gone while
                                                // this list is still mounted (e.g.
                                                // its board was just deleted).
                                                if (card === undefined) {
                                                    return null;
                                                }

                                                return (
                                                    <Card
                                                        {...card}
                                                        boardId={props.boardId}
                                                        cardId={cardId}
                                                        index={index}
                                                        key={cardId}
                                                        listId={props.listId}
                                                        isInDoneList={done}
                                                        isDraggingOver={isDraggingOver}
                                                        searchReg={searchReg}
                                                        initiallyVisible={index < 3}
                                                        isDragDisabled={preview}
                                                        // Everything rendered here is
                                                        // inside the mounted window:
                                                        // register it with dnd. The
                                                        // body itself is filled in
                                                        // over the next frames (see
                                                        // contentLimit).
                                                        inWindow={true}
                                                        renderContent={offset < contentLimit}
                                                        // dnd derives the "drop at the
                                                        // end" index from the last
                                                        // draggable it knows about,
                                                        // and only cards near the
                                                        // viewport register (see
                                                        // Card). The first and last
                                                        // card are always registered
                                                        // so both ends stay exact.
                                                        alwaysDraggable={
                                                            index === 0 ||
                                                            index === filteredCards.length - 1
                                                        }
                                                        preview={preview}
                                                        // The first card of each list
                                                        // is a tour candidate; the
                                                        // lookup picks the first
                                                        // visible one. The preview
                                                        // renders its own cards.
                                                        dataTour={
                                                            !preview && index === 0
                                                                ? 'kanban-card'
                                                                : undefined
                                                        }
                                                        cardView={preview ? 'full' : props.cardView}
                                                        setEditCard={props.setEditCard}
                                                        setSearchReg={props.setSearchReg}
                                                        setContent={props.setContent}
                                                    />
                                                );
                                            })}
                                            {bottomSpacer > 0 ? (
                                                <div style={{ height: bottomSpacer }} />
                                            ) : null}
                                            {provided.placeholder}
                                            <AfterPlaceHolder />
                                        </Cards>
                                        <BeforePlaceHolder />
                                    </ListBody>
                                );
                            }}
                        </Droppable>
                        <ButtonWrapper>
                            <Button
                                onClick={addCard}
                                shape={'circle'}
                                icon={<Icon type="plus" />}
                                id={'create-card-button'}
                                aria-label={t('kanban.page.addCard')}
                            />
                        </ButtonWrapper>
                    </Container>
                </div>
            )}
        </Draggable>
    );
});
