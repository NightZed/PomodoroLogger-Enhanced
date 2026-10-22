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
import { Card as CardType } from '../type';
import { matchParent } from '../../../utils';
import { formatTimeYmdHm } from '../../Visualization/Timeline';
import { CreatedTime } from '../style/CreatedTime';
import { CompletedTime } from './CompletedTime';

/**
 * If you're using z-index, make sure the element has a defined position attribute or it won't work.
 * Wherever you use z-index in your css, define the position of that element. (Absolute, relative, inherit...)
 * https://stackoverflow.com/a/23067835/8169341
 */
const CardContainer = styled.div`
    position: relative;
    width: 262px;
    word-break: break-word;
    background-color: var(--pl-bg-elevated);
    margin: 8px 4px 0 4px;
    border-radius: 6px;
    cursor: grab;
    box-shadow: 0 0 rgba(0, 0, 0, 0);
    transition: box-shadow 200ms;
    z-index: 0;
    &.is-dragging {
        z-index: 1;
        box-shadow: 0 0 18px 8px var(--pl-shadow);
    }
    &:hover {
        z-index: 5;
        box-shadow: 0 0 18px 8px var(--pl-shadow);
    }
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
    collapsed?: boolean;
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
    const { index, _id, isDraggingOver, listId } = props;
    const shouldRenderContent = useNearViewport(cardRef, props.initiallyVisible === true);
    const onClick = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const target = e.nativeEvent.target as HTMLElement;
            const tag = matchParent(target, '.pl-tag');
            const cardLabel = matchParent(target, '.card-label');
            const checkbox = matchParent(target, '[type="checkbox"]');
            const link = matchParent(target, 'a');
            if (cardLabel && cardLabel.textContent) {
                props.setSearchReg('#' + cardLabel.textContent);
                e.stopPropagation();
            } else if (tag && tag.textContent) {
                props.setSearchReg(tag.textContent);
                e.stopPropagation();
            } else if (checkbox) {
                if (!markdownRef.current) {
                    return;
                }

                const checkboxIndex = getCheckboxIndex(markdownRef.current, checkbox);
                const nextContent = toggleNthCheckbox(props.content, checkboxIndex);
                if (nextContent !== undefined) {
                    props.setContent(_id, nextContent);
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
                props.setEditCard(true, props.listId, props._id);
            }
        },
        [listId, _id, props.content, props.setSearchReg]
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

    return (
        <>
            <Draggable draggableId={_id} index={index} isDragDisabled={props.isDragDisabled}>
                {(provided, snapshot) => {
                    providedInnerRef.current = provided.innerRef;
                    return (
                        <>
                            <CardContainer
                                ref={setCardRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={onClick}
                                className={
                                    'kanban-card ' +
                                    (snapshot.isDragging ? 'is-dragging' : undefined)
                                }
                            >
                                {props.collapsed ? (
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
                                                Created: {formatTimeYmdHm(props.createdTime)}
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
                                            {props.spentTimeInHour.estimated ||
                                            props.spentTimeInHour.actual ? (
                                                <TimeBadge
                                                    spentTime={props.spentTimeInHour.actual}
                                                    leftTime={
                                                        props.spentTimeInHour.estimated -
                                                        props.spentTimeInHour.actual
                                                    }
                                                    collapsed={true}
                                                />
                                            ) : undefined}
                                        </BadgeHolder>
                                    </CardContent>
                                ) : (
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
                                                Created: {formatTimeYmdHm(props.createdTime)}
                                            </CreatedTime>
                                        ) : undefined}
                                        <CompletedTime
                                            completedTime={props.completedTime}
                                            isInDoneList={props.isInDoneList === true}
                                        />
                                        {renderLabels(props.labels)}
                                        {shouldRenderContent ? (
                                            <Markdown
                                                dangerouslySetInnerHTML={{
                                                    __html: renderedMarkdown,
                                                }}
                                                style={{ maxHeight: 250 }}
                                                ref={markdownRef}
                                            />
                                        ) : (
                                            <CardPreview>
                                                {(props.content ?? '').slice(0, 600)}
                                            </CardPreview>
                                        )}
                                        <Divider style={{ margin: '0 0 4px 0' }} />
                                        <BadgeHolder>
                                            {props.sessionIds.length > 0 ? (
                                                <PomodoroDot num={props.sessionIds.length} />
                                            ) : undefined}
                                            {props.spentTimeInHour.estimated ||
                                            props.spentTimeInHour.actual ? (
                                                <TimeBadge
                                                    spentTime={props.spentTimeInHour.actual}
                                                    leftTime={
                                                        props.spentTimeInHour.estimated === 0
                                                            ? undefined
                                                            : props.spentTimeInHour.estimated -
                                                              props.spentTimeInHour.actual
                                                    }
                                                />
                                            ) : undefined}
                                        </BadgeHolder>
                                    </CardContent>
                                )}
                            </CardContainer>
                        </>
                    );
                }}
            </Draggable>
        </>
    );
});
