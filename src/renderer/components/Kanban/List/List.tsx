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
import { ConfirmPopover, feedback, FEEDBACK_MESSAGES } from '../../feedback';
import { KanbanActionTypes } from '../action';
import { actions as cardActions, CardActionTypes, CardsState } from '../Card/action';
import { List as ListType } from '../type';
import { mergeRefs } from '../../../utils';
import { throttle, debounce } from 'lodash';

// First page is deliberately small: each Card is a dnd draggable with markdown
// and badges. Subsequent turns add a screenful at a time.
const PROGRESSIVE_INITIAL_CARDS = 6;
const PROGRESSIVE_CARD_BATCH = 12;

// A frame boundary matters here: the point is to let the browser paint the
// first page before mounting the next batch. A plain setTimeout can run
// back-to-back in the same event-loop turn on some platforms.
const scheduleFrame = (callback: () => void) =>
    typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(callback, 0);
const cancelFrame = (handle: number) => {
    if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle);
    } else {
        window.clearTimeout(handle);
    }
};

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

// Using css ::before and ::after will cause dnd component jitter
//
// Both placeholders are sticky overlays that make the cards fade out while they
// scroll underneath the (rounded) top / bottom edge of the list. They are only
// meant to be visible *over a card*, which means their color has to be the
// background color of the list body (`Cards` below) -- with any other color
// (e.g. `--pl-border`) they show up as a stray shadow / glow band on the empty
// area of the list, and that band moves around whenever dnd pushes the
// placeholder element up and down during a drag.
const BeforePlaceHolder = styled.div`
    position: sticky;
    display: block;
    top: -2px;
    width: 100%;
    height: 0.6rem;
    margin-bottom: 10px;
    background: linear-gradient(
        var(--pl-bg-sunken),
        rgba(255, 255, 255, 0.001)
    ); /* transparent keyword is broken in Safari */
    pointer-events: none;
    z-index: 1;
`;

const AfterPlaceHolder = styled.div`
    content: '';
    margin-top: 20px;
    position: sticky;
    display: block;
    bottom: -2px;
    width: 100%;
    height: 0.6rem;
    background: linear-gradient(
        rgba(255, 255, 255, 0.001),
        var(--pl-bg-sunken)
    ); /* transparent keyword is broken in Safari */
    pointer-events: none;
    z-index: 1;
`;

interface CardsProps {
    $displayScrollbar: boolean;
}

// The thumb of `Cards` paints itself with `box-shadow: inset 0 0 0 10px`, i.e.
// with `currentColor`, so `color` *is* the scrollbar color here and has to come
// from the theme: a fixed dark color is invisible on a dark list body.
const displayScrollbarFn = ({ $displayScrollbar }: CardsProps) => {
    if ($displayScrollbar) {
        return `
            color: var(--pl-scrollbar-thumb);
            transition: color 250ms;
        `;
    }

    return `
        color: rgba(0, 0, 0, 0);
        transition: color 250ms;
    `;
};

const Cards = styled.div<CardsProps>`
    position: relative;
    padding: 0;
    background-color: var(--pl-bg-sunken);
    border-radius: 4px;
    max-height: calc(100vh - 230px);
    overflow-y: overlay;
    overflow-x: visible;
    min-height: 200px;
    max-width: 270px;
    & > * {
        color: var(--pl-text);
    }

    /* The "&" matters here: styled-components v6 no longer turns a nested
       scrollbar pseudo-element selector into a self selector, so without it
       these rules would style the scrollbars of *descendants* (the card
       bodies) instead of the list column itself. */
    ${displayScrollbarFn} &::-webkit-scrollbar {
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
}

interface Props extends ListType, InputProps, ListActionTypes, KanbanActionTypes {
    searchReg?: string;
    cardsState: CardsState;
    collapsed: boolean;
    setContent: CardActionTypes['setContent'];
}

export const List: FC<Props> = React.memo((props: Props) => {
    const { focused = false, searchReg, cards, cardsState, done = false } = props;
    const cardListRef = React.useRef<HTMLElement>(null);
    const [showScrollBar, setShowScrollBar] = useState(true);
    React.useEffect(() => {
        if (!cardListRef.current) {
            return;
        }

        const hideScrollBar = debounce(() => {
            setShowScrollBar(false);
        }, 600);

        const onScroll = throttle(() => {
            setShowScrollBar(true);
            hideScrollBar();
        }, 30);

        // Passive: the handler only toggles the scrollbar visibility and never
        // prevents scrolling, so the browser can keep scrolling off the main
        // thread instead of waiting for this listener.
        cardListRef.current.addEventListener('scroll', onScroll, { passive: true });
        hideScrollBar();
        return () => {
            cardListRef.current?.removeEventListener('scroll', onScroll);
            // Pending debounced/throttled callbacks would still call
            // `setShowScrollBar` after unmount ("state update on an unmounted
            // component" warning + a leaked timer per mount/unmount cycle),
            // so cancel them explicitly here.
            hideScrollBar.cancel();
            onScroll.cancel();
        };
    }, []);

    const visibleCards = React.useMemo(() => {
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
    }, [props._id, searchReg, props.cardsState, cards]);

    React.useEffect(() => {
        // Opening a board mounts every list, and this used to dispatch a
        // "visible cards = undefined" action for each one even when the store
        // already held the same value. Each dispatch notified every connected
        // card, so a board with many lists/cards paid that cost on open. Only
        // write when the filter actually changed.
        if (visibleCards === props.visibleCards) {
            return;
        }
        props.setVisibleCards(props._id, visibleCards);
    }, [props._id, visibleCards, props.visibleCards]);

    const filteredCards = visibleCards || props.cards || [];

    // Opening a board used to mount every card in one commit. With a long list
    // (100+ cards) that blocks the first paint even though only the first few
    // cards are on screen. Mount a small first page synchronously, then append
    // the rest in short timer turns so the board opens and remains scrollable.
    // The cap resets on list/search changes, not on reorder, so dragging does
    // not collapse an already fully rendered list back to the first page.
    const [renderLimit, setRenderLimit] = React.useState(() =>
        Math.min(PROGRESSIVE_INITIAL_CARDS, filteredCards.length)
    );
    React.useEffect(() => {
        setRenderLimit(Math.min(PROGRESSIVE_INITIAL_CARDS, filteredCards.length));
    }, [props._id, searchReg]);
    React.useEffect(() => {
        if (renderLimit >= filteredCards.length) {
            return;
        }

        const handle = scheduleFrame(() => {
            setRenderLimit((current) =>
                Math.min(current + PROGRESSIVE_CARD_BATCH, filteredCards.length)
            );
        });
        return () => cancelFrame(handle);
    }, [renderLimit, filteredCards.length]);

    const renderedCards = filteredCards.slice(0, renderLimit);
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

    const onDelete = () => {
        if (focused || done) {
            feedback.toast({ kind: 'warning', content: FEEDBACK_MESSAGES.kanban.cannotDeleteList });
            return;
        }

        props.deleteList(props._id, props.boardId);
    };

    const onSave = () => {
        props.renameList(props._id, value);
        setIsEditing(false);
    };

    const onValueChange = (e: any) => {
        setValue(e.target.value);
    };

    const onEdit = () => {
        setValue(props.title);
        setIsEditing(true);
        if (!inputRef.current) {
            return;
        }

        inputRef.current.focus();
    };

    /** The shared popover forwards the antd instance, so the menu can open it. */
    const popConfirmRef = useRef<{ setVisible: (visible: boolean) => void } | null>(null);
    const onPreDelete = React.useCallback(() => {
        if (popConfirmRef.current) {
            popConfirmRef.current.setVisible(true);
        }
    }, []);

    const menu: MenuProps = React.useMemo(
        () =>
            !focused && !done
                ? {
                      items: [
                          {
                              key: '1',
                              icon: <Icon type={'setting'} />,
                              label: 'Edit',
                              onClick: onEdit,
                          },
                          { type: 'divider' },
                          {
                              key: '3',
                              icon: <Icon type={'delete'} />,
                              label: (
                                  <ConfirmPopover onConfirm={onDelete} ref={popConfirmRef as any}>
                                      Delete
                                  </ConfirmPopover>
                              ),
                          },
                      ],
                  }
                : {
                      items: [
                          {
                              key: '1',
                              icon: <Icon type={'setting'} />,
                              label: 'Edit',
                              onClick: onEdit,
                          },
                      ],
                  },
        [onDelete, focused, done, onPreDelete, onEdit]
    );

    return (
        <Draggable draggableId={props.listId} index={props.index}>
            {(provided, _snapshot) => (
                <div>
                    <Container
                        ref={provided.innerRef}
                        className={'kanban-list'}
                        id={props.focused ? 'focused-list' : props.done ? 'done-list' : undefined}
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
                                    <Button onClick={onSave}>Save</Button>
                                </div>
                            ) : (
                                <>
                                    <span className="list-head-text">
                                        <h1>{props.title}</h1>
                                        <span>
                                            {searchReg == null ? (
                                                <>
                                                    {cardCount} Card
                                                    {cardCount > 1 ? 's ' : ' '}
                                                </>
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
                                            <Tooltip title={'Focused List'}>
                                                <span style={{ color: 'red', marginRight: 8 }}>
                                                    <IconComponent component={FocusIcon} />
                                                </span>
                                            </Tooltip>
                                        ) : undefined}
                                        {done ? (
                                            <Tooltip title={'Done List'}>
                                                <span style={{ color: 'green', marginRight: 8 }}>
                                                    <IconComponent component={DoneIcon} />
                                                </span>
                                            </Tooltip>
                                        ) : undefined}
                                        <Dropdown menu={menu} trigger={['click']}>
                                            <Icon type="menu" />
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
                                    <Cards
                                        ref={mergedRef}
                                        $displayScrollbar={showScrollBar}
                                        {...provided.droppableProps}
                                    >
                                        <BeforePlaceHolder />
                                        {renderedCards.map((cardId, index) => {
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
                                                    isDragDisabled={
                                                        renderLimit < filteredCards.length
                                                    }
                                                    collapsed={props.collapsed}
                                                    setEditCard={props.setEditCard}
                                                    setSearchReg={props.setSearchReg}
                                                    setContent={props.setContent}
                                                />
                                            );
                                        })}
                                        {provided.placeholder}
                                        <AfterPlaceHolder />
                                    </Cards>
                                );
                            }}
                        </Droppable>
                        <ButtonWrapper>
                            <Button
                                onClick={addCard}
                                shape={'circle'}
                                icon={<Icon type="plus" />}
                                id={'create-card-button'}
                            />
                        </ButtonWrapper>
                    </Container>
                </div>
            )}
        </Draggable>
    );
});
