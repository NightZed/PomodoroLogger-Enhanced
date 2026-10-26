import React, { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { KanbanActionTypes } from './action';
import { KanbanState, uiStateNames } from './reducer';
import { BoardActionTypes, getCardView } from './Board/action';
import { Button, Form, Layout, Segmented, Select, Switch, Tooltip } from 'antd';
import { AntdIcon as Icon, IconComponent } from '../antdIcon';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import Board from './Board';
import styled from 'styled-components';
import { Overview } from './Board/Overview';
import { formatTimeYmdHm } from '../Visualization/Timeline';
import { CreatedTime } from './style/CreatedTime';
import { LabelButton } from '../../style/form';
import backIcon from '../../../res/back.svg';
import { Label } from './style/Form';
import Hotkeys from '../Hotkeys';
import { uid } from '../../../utils/uid';
import { TimerActionTypes, TimerManager, tabType } from '../Timer/action';
import { isShallowEqualByKeys } from '../../utils';
import { thinScrollBar } from '../../style/scrollbar';
import { EditKanbanForm } from './BoardEditor';
import { PlayPauseButton } from './Board/PlayPauseButton';
import { Search } from '../../../components/common/Search/Search';
import { getBoardSearchTags } from './boardTags';
import { PomodoroRecord } from '../../monitor/type';
import { CardView } from './type';
import { debounce } from 'lodash';

const { Option } = Select;

/**
 * The board's card display modes. Icons keep the header compact; the per-option
 * `tooltip` names each mode, so the header does not need a "Card view" label.
 */
const CARD_VIEW_OPTIONS: { value: CardView; icon: React.ReactNode; tooltip: string }[] = [
    { value: 'title', icon: <Icon type="align-left" />, tooltip: 'Title only' },
    {
        value: 'preview',
        icon: <Icon type="file-text" />,
        tooltip: 'Preview (limited height)',
    },
    { value: 'full', icon: <Icon type="expand" />, tooltip: 'Full content' },
];

/**
 * antd's Segmented track uses `colorBgLayout`, which this app maps to the page
 * background, so the track disappeared into the board header. Style it as a
 * 32px bordered pill that matches the search bar and the circular icon buttons;
 * the selected segment uses the same elevated surface as those buttons.
 */
const CardViewSwitch = styled.div`
    display: inline-flex;
    flex: none;
    align-items: center;
    height: 32px;
    margin: 0 4px;

    /* Double the wrapper class so the rules beat antd's cssinjs output
       regardless of injection order (see the GlobalStyle specificity notes). */
    && .ant-segmented {
        height: 32px;
        padding: 2px;
        box-sizing: border-box;
        background: var(--pl-bg-sunken);
        border: 1px solid var(--pl-border);
        border-radius: 9999px;
        color: var(--pl-text-secondary);

        .ant-segmented-item {
            border-radius: 9999px;
        }

        .ant-segmented-item-label {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 26px;
            line-height: 26px;
            padding: 0 8px;
        }

        .ant-segmented-item:not(.ant-segmented-item-selected):hover {
            color: var(--pl-text);
        }

        .ant-segmented-item-selected,
        .ant-segmented-thumb {
            background: var(--pl-bg-elevated);
            color: var(--pl-text);
            box-shadow: 0 0 0 1px var(--pl-border);
        }
    }
`;

const Content = styled.main`
    margin: 0;
    overflow: auto;
    &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: var(--pl-bg-sunken);
    }
    &::-webkit-scrollbar-thumb {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-thumb);
    }
    &::-webkit-scrollbar-track {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-track);
    }
`;

export const TextAreaContainer = styled.div`
    textarea {
        ${thinScrollBar}
    }
`;

const Title = styled.h1`
    user-select: none;
    color: var(--pl-text);
    max-width: calc(100vw - 380px);
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    margin: 0;
    font-size: 22px;
    vertical-align: bottom;
`;

const Header = styled.div`
    margin: 0 16px;
    position: relative;

    .header-right {
        position: absolute;
        top: 0;
        right: 0;
    }
`;

interface FormValue {
    name: string;
    description: string;
}

interface Props extends KanbanState, KanbanActionTypes, BoardActionTypes, TimerActionTypes {
    timerManager?: TimerManager;
    isFocusingOnChosenBoard: boolean;
    isTimerRunning: boolean;
    /**
     * The record shown in the fullscreen Sankey overlay, if any. The overlay
     * is app-level (it stays up across tabs) and owns its own Esc, so this
     * page's Esc handler stands down while it is open -- see `onKeyDown`.
     */
    chosenRecord?: PomodoroRecord;
    /**
     * The active page. This component outlives its page (the 10-minute grace
     * of `DestroyOnTimeoutWrapper`) while its pane is only hidden -- and
     * hidden DOM does not stop document-level hotkeys -- so its bindings and
     * the search bar register/unregister with the tab instead of living as
     * long as the component.
     */
    currentTab: tabType;
}

export const Kanban: FunctionComponent<Props> = React.memo(
    (props: Props) => {
        const {
            changeAppTab,
            chosenRecord,
            currentTab,
            fetchBoards,
            focusOn,
            isFocusingOnChosenBoard,
            isTimerRunning,
            setChosenBoardId,
            setCardView,
            setSearchReg,
            setSortDirection,
            timerManager,
        } = props;
        const { chosenBoardId, sortDirection } = props.kanban;
        const [boardForm] = Form.useForm();
        const [visible, setVisible] = useState(false);
        const [showTable, setShowTable] = useState(false);
        const [editingBoardId, setEditingBoardId] = useState<string | undefined>('');
        const getSuggestions = React.useCallback(() => {
            const board = props.kanban.chosenBoardId
                ? props.boards[props.kanban.chosenBoardId]
                : undefined;
            if (!board) {
                return [];
            }

            // One pool of content #tags and card labels, ordered by unified
            // card count with alphabetical ties -- see getBoardSearchTags.
            // Content tags are extracted from the cards' current markdown, so
            // the panel always matches the store: deleting the `#` of a tag
            // or removing a card drops its suggestion immediately. (The old
            // render-time TagManager registry only ever accumulated, so a
            // deleted tag stayed suggested until an app restart.)
            return getBoardSearchTags(board, props.lists, props.cards);
            // Only the chosen id matters here, not every unrelated kanban
            // update; including the whole slice re-created the callback (and
            // the Search bar's tag list) on each tick.
        }, [props.cards, props.lists, props.boards, props.kanban.chosenBoardId]);
        const onShowTableChange = (value: boolean) => {
            setShowTable(value);
        };
        // Recreating the debounced function on every render leaves a pending
        // timer behind each time and never cancels the previous one; keep a
        // single instance and cancel it on unmount instead.
        const search = React.useMemo(() => debounce(setSearchReg, 200), [setSearchReg]);
        useEffect(() => () => search.cancel(), [search]);
        // The search is a transient filter of this page. Leaving it must not
        // keep the board (or the Timer sider's focused-list preview) filtered
        // with no search box in sight. Cancel the pending debounce first: a
        // keystroke from the last 200ms would otherwise write the old query
        // back after the clear. `currentTab` is used instead of `enabled` on
        // the Search bar because this component outlives its page (the
        // DestroyOnTimeoutWrapper grace) and the store must be clean even
        // while it is only hidden.
        useEffect(() => {
            if (currentTab === 'kanban') {
                return;
            }
            search.cancel();
            setSearchReg(undefined);
        }, [currentTab, setSearchReg, search]);
        const valueHandler: (values: FormValue) => void = ({ name, description }: FormValue) => {
            if (editingBoardId === undefined) {
                props.addBoard(uid(), name, description);
            } else {
                // Edit board
                props.editBoard(editingBoardId, name, description);
            }
        };
        const handleSave = (values: FormValue) => {
            valueHandler(values);
            setTimeout(() => boardForm.resetFields(), 200);
            setVisible(false);
        };
        const handleCancel = () => {
            setVisible(false);
        };
        useEffect(() => {
            fetchBoards();
        }, [fetchBoards]);

        // Read the boards through a ref so this callback stays stable: it is
        // passed down to the memoized overview, and a new identity used to
        // re-render every board brief whenever the page rendered.
        const boardsRef = React.useRef(props.boards);
        boardsRef.current = props.boards;
        const showConfigById = useCallback(
            (id?: string) => {
                setEditingBoardId(id);
                setVisible(true);
                if (id === undefined) {
                    boardForm.setFieldsValue({ name: '', description: '' });
                } else {
                    const board = boardsRef.current[id];
                    if (board !== undefined) {
                        boardForm.setFieldsValue({
                            name: board.name,
                            description: board.description,
                        });
                    }
                }
            },
            [boardForm]
        );

        const addBoard = useCallback(() => {
            showConfigById();
        }, [showConfigById]);

        const showBoardSettingMenu = () => {
            showConfigById(props.kanban.chosenBoardId);
        };

        const onDelete = () => {
            if (props.kanban.chosenBoardId) {
                props.deleteBoard(props.kanban.chosenBoardId);
            } else if (props.kanban.configuringBoardId) {
                props.deleteBoard(props.kanban.configuringBoardId);
            }

            setVisible(false);
        };

        const boardNameValidator = (name: string) => {
            return -1 === Object.values(props.boards).findIndex((v) => v.name === name);
        };

        const goBack = React.useCallback(() => {
            setChosenBoardId(undefined);
        }, [setChosenBoardId]);

        const choose = React.useCallback(() => {
            if (!chosenBoardId) {
                return;
            }

            focusOn(chosenBoardId);
            if (!timerManager) {
                return;
            }

            if (isFocusingOnChosenBoard && isTimerRunning) {
                feedback.toast({ kind: 'info', content: FEEDBACK_MESSAGES.kanban.paused });
                timerManager.pause();
            } else {
                feedback.toast({
                    kind: 'success',
                    content: FEEDBACK_MESSAGES.kanban.startFocusing,
                });
                timerManager.start(chosenBoardId);
            }
        }, [chosenBoardId, focusOn, isFocusingOnChosenBoard, isTimerRunning, timerManager]);

        const onKeyDown = React.useCallback(
            (name: string) => {
                switch (name) {
                    case 'esc':
                        // The fullscreen Sankey overlay (opened from the Timer
                        // or History page) stays up across tabs and owns its
                        // own Esc -- handling it here too would close the
                        // overlay AND navigate on one press. While a dialog is
                        // open the shared wrapper blocks this binding, and
                        // while typing the target filter blocks it.
                        if (chosenRecord) {
                            break;
                        }

                        if (chosenBoardId) {
                            goBack();
                        } else {
                            changeAppTab('timer');
                        }
                        break;
                    case 'ctrl+n':
                        if (!chosenBoardId) {
                            addBoard();
                        }
                        break;
                }
            },
            [addBoard, changeAppTab, chosenBoardId, chosenRecord, goBack]
        );

        const onCardViewChange = React.useCallback(
            (v: CardView) => {
                if (chosenBoardId) {
                    setCardView(chosenBoardId, v);
                }
            },
            [chosenBoardId, setCardView]
        );
        const toggleSortDirection = React.useCallback(() => {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        }, [setSortDirection, sortDirection]);

        return (
            <Layout
                style={{
                    padding: 4,
                    height: 'calc(100vh - 45px)',
                    backgroundColor: 'transparent',
                }}
            >
                <Header>
                    {/* Bound only while this pane is the active page; see
                        `Props.currentTab`. The 10-minute grace keeps this
                        component mounted after a tab switch, and bindings
                        firing over another page would be both surprising and
                        a focus trap. Esc is the documented "go back" shortcut;
                        it stands down while the fullscreen Sankey overlay is
                        open (see the handler). */}
                    {props.currentTab === 'kanban' && (
                        <Hotkeys keyName={'ctrl+n,esc'} onKeyDown={onKeyDown} />
                    )}
                    {props.kanban.chosenBoardId ? (
                        <>
                            <Title>{props.boards[props.kanban.chosenBoardId]?.name}</Title>
                            <Button
                                style={{ paddingLeft: 10, paddingRight: 10, marginLeft: 10 }}
                                onClick={goBack}
                            >
                                <IconComponent component={backIcon} />
                            </Button>
                            {props.boards[props.kanban.chosenBoardId]?.createdTime !== undefined ? (
                                <CreatedTime>
                                    Created:{' '}
                                    {formatTimeYmdHm(
                                        props.boards[props.kanban.chosenBoardId]!.createdTime!
                                    )}
                                </CreatedTime>
                            ) : undefined}
                        </>
                    ) : (
                        <>
                            <Title>Kanban Boards Overview</Title>
                            <Button
                                style={{
                                    paddingLeft: 10,
                                    paddingRight: 10,
                                    margin: '0 4px 0 16px',
                                }}
                                onClick={addBoard}
                                id={'create-kanban-button'}
                                data-tour={'create-kanban-button'}
                            >
                                <Icon type={'plus'} />
                            </Button>

                            <Label>Sorted by:</Label>
                            <Select
                                value={props.kanban.sortedBy}
                                onChange={props.setSortedBy}
                                style={{
                                    width: 140,
                                }}
                            >
                                <Option value="recent">Last Visit</Option>
                                <Option value="created">Created Time</Option>
                                <Option value="alpha">Alphabet</Option>
                                {/* TODO: Due time */}
                                {/*<Option value="due">Due Time</Option>*/}
                                <Option value="spent">Spent Time</Option>
                                <Option value="remaining">Remaining Time</Option>
                            </Select>
                            <Tooltip
                                title={
                                    props.kanban.sortDirection === 'asc'
                                        ? 'Ascending'
                                        : 'Descending'
                                }
                            >
                                <Button
                                    style={{ width: 32, padding: 0, margin: '0 4px' }}
                                    onClick={toggleSortDirection}
                                    id={'sort-direction-button'}
                                >
                                    <Icon
                                        type={props.kanban.sortDirection === 'asc' ? 'up' : 'down'}
                                    />
                                </Button>
                            </Tooltip>
                        </>
                    )}
                    <div className="header-right">
                        {props.kanban.chosenBoardId ? (
                            <>
                                <LabelButton>
                                    <Search
                                        enabled={props.currentTab === 'kanban'}
                                        setSearchStr={search}
                                        searchStr={props.kanban.searchReg}
                                        tags={getSuggestions}
                                    />
                                    <CardViewSwitch>
                                        <Segmented
                                            shape="round"
                                            aria-label="Card view"
                                            options={CARD_VIEW_OPTIONS}
                                            value={getCardView(
                                                props.boards[props.kanban.chosenBoardId]
                                            )}
                                            onChange={(value) =>
                                                onCardViewChange(value as CardView)
                                            }
                                        />
                                    </CardViewSwitch>
                                    <PlayPauseButton
                                        showPlay={
                                            !(props.isFocusingOnChosenBoard && props.isTimerRunning)
                                        }
                                        onClick={choose}
                                    />
                                    <Button
                                        shape={'circle'}
                                        icon={<Icon type={'setting'} />}
                                        onClick={showBoardSettingMenu}
                                    />
                                </LabelButton>
                            </>
                        ) : (
                            <LabelButton>
                                <label>Show Table: </label>
                                <Switch onChange={onShowTableChange} checked={showTable} />
                            </LabelButton>
                        )}
                    </div>
                </Header>
                <Content
                    style={{
                        padding: 4,
                        height: 'calc(100vh - 45px)',
                    }}
                >
                    {/* Keep the overview mounted while a board is open. Going
                        back used to remount every brief card (13 boards = a
                        fresh waterfall measurement, one SVG chart per board,
                        antd buttons/badges, ...), which was the visible freeze
                        before the overview appeared. Hiding it keeps the board
                        view itself unchanged and makes "back" a display swap.
                        The grid ignores the 0-width measurements of a hidden
                        pane (see ResponsiveBoardGrid). */}
                    <div
                        style={{
                            display: props.kanban.chosenBoardId === undefined ? undefined : 'none',
                        }}
                    >
                        <Overview showConfigById={showConfigById} showTable={showTable} />
                    </div>
                    {props.kanban.chosenBoardId === undefined ? null : (
                        <Board
                            boardId={props.kanban.chosenBoardId}
                            key={props.kanban.chosenBoardId}
                        />
                    )}
                </Content>
                <EditKanbanForm
                    boardId={editingBoardId || ''}
                    form={boardForm}
                    visible={visible}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    isCreating={!editingBoardId}
                    onDelete={onDelete}
                    nameValidator={boardNameValidator}
                    createdTime={
                        editingBoardId ? props.boards[editingBoardId]?.createdTime : undefined
                    }
                />
            </Layout>
        );
    },
    (prevProps, nextProps) => {
        return isShallowEqualByKeys(
            prevProps,
            nextProps,
            uiStateNames.concat([
                'isFocusingOnChosenBoard',
                'isTimerRunning',
                'currentTab',
                'chosenRecord',
            ])
        );
    }
);
