import React, { FC, useEffect, useState, KeyboardEvent, useRef } from 'react';
import { connect } from 'react-redux';
import { actions, CardActionTypes } from './action';
import { actions as kanbanActions } from '../action';
import { RootState } from '../../../reducers';
import ReactHotkeys from 'react-hot-keys';
import { genMapDispatchToProp } from '../../../utils';
import { Button, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Tabs, Tooltip } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import shortid from 'shortid';
import { Card, CardLabel } from '../type';
import { Markdown } from '../style/Markdown';
import formatMarkdown from './formatMarkdown';
import { EditorContainer } from '../style/editorStyle';
import { LabelEditor } from './LabelEditor';
const { TabPane } = Tabs;

interface Props extends CardActionTypes {
    visible: boolean;
    onCancel: () => void;
    card?: Card;
    form: any;
    listId: string;
    labelSuggestions?: { name: string; color: string }[];
    boardCards?: { _id: string; labels?: CardLabel[] }[];
}

interface FormData {
    title: string;
    content: string;
    estimatedTime?: number;
    actualTime?: number;
}

const _CardInDetail: FC<Props> = React.memo((props: Props) => {
    const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);
    const [cardContent, setCardContent] = useState('');
    const [cardLabels, setCardLabels] = useState<CardLabel[]>([]);
    const { card, visible, form, onCancel, listId, labelSuggestions, boardCards } = props;
    const isCreating = !card;
    const lastIsCreating = React.useRef<boolean | null>(null);
    const thisIsCreating = visible ? isCreating : lastIsCreating.current ?? isCreating;
    const { getFieldDecorator, setFieldsValue, validateFields, resetFields } = form;
    useEffect(() => {
        lastIsCreating.current = isCreating;
    }, [isCreating]);
    useEffect(() => {
        if (!visible) {
            return;
        }

        setIsEditingActualTime(false);
        if (card) {
            setShowMarkdownPreview(true);
            const time = card.spentTimeInHour.estimated;
            const actual = card.spentTimeInHour.actual;
            setCardContent(card.content);
            setCardLabels(card.labels ? card.labels : []);
            setFieldsValue({
                title: card.title,
                content: card.content,
                estimatedTime: time ? time : undefined,
                actualTime: actual ? actual : undefined,
            } as FormData);
        } else {
            setCardContent('');
            setCardLabels([]);
            setShowMarkdownPreview(false);
            setFieldsValue({
                title: '',
                content: '',
                estimatedTime: undefined,
                actualTime: undefined,
            } as FormData);
        }
    }, [card, visible]);

    const onDelete = React.useCallback(() => {
        if (!card) {
            return;
        }

        props.deleteCard(card._id, listId);
        onCancel();
    }, [card?._id, listId, onCancel]);

    const [isEditingActualTime, setIsEditingActualTime] = useState(false);
    const contentRef = useRef<any>(null);

    const insertCheckbox = React.useCallback(() => {
        validateFields((err: Error, values: FormData) => {
            if (err) {
                return;
            }

            const current = values.content || '';
            const textarea = contentRef.current?.resizableTextArea?.textArea ?? contentRef.current;
            const pos = textarea?.selectionStart ?? current.length;
            const atLineStart = pos === 0 || current[pos - 1] === '\n';
            const insert = (atLineStart ? '' : '\n') + '[ ] ';
            const next = current.slice(0, pos) + insert + current.slice(pos);
            setFieldsValue({ content: next });
            setCardContent(next);
            if (textarea) {
                const caret = pos + insert.length;
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(caret, caret);
                }, 0);
            }
        });
    }, [validateFields, setFieldsValue]);

    const onSwitchIsEditing = () => {
        setIsEditingActualTime(!isEditingActualTime);
    };

    const saveValues = async ({ title, content, estimatedTime, actualTime }: FormData) => {
        const time = estimatedTime || 0;
        setCardContent(content || '');
        if (!card) {
            // Creating
            const _id = shortid.generate();
            // Await the insert before the follow-up updates: nedb `update`
            // without upsert is a no-op for a not-yet-inserted doc, so firing
            // setEstimatedTime/setLabels concurrently with addCard could lose
            // them after a restart.
            await props.addCard(_id, listId, title, content);
            props.setEstimatedTime(_id, time);
            if (cardLabels.length > 0) {
                props.setLabels(_id, cardLabels);
            }
        } else {
            // Edit
            props.renameCard(card._id, title);
            props.setContent(card._id, content);
            props.setEstimatedTime(card._id, time);
            props.setLabels(card._id, cardLabels);

            if (actualTime !== undefined) {
                props.setActualTime(card._id, actualTime);
            }
        }
        // Label colors are board-wide by name: sync same-named labels on the
        // other cards of this board to the colors being saved (covers labels
        // both edited here and newly added to this card).
        const newColorByName = new Map(cardLabels.map((label) => [label.name, label.color]));
        for (const boardCard of boardCards ?? []) {
            if (card && boardCard._id === card._id) {
                continue;
            }

            let changed = false;
            const nextLabels = (boardCard.labels ?? []).map((label) => {
                const nextColor = newColorByName.get(label.name);
                if (nextColor !== undefined && nextColor !== label.color) {
                    changed = true;
                    return { ...label, color: nextColor };
                }
                return label;
            });
            if (changed) {
                props.setLabels(boardCard._id, nextLabels);
            }
        }
    };

    const onSave = () => {
        validateFields((err: Error, values: FormData) => {
            if (err) {
                throw err;
            }

            saveValues(values);
            setTimeout(resetFields, 200);
            onCancel();
        });
    };

    const keydownEventHandler = React.useCallback(
        (event: KeyboardEvent<any>) => {
            if (
                (event.ctrlKey || event.altKey || event.shiftKey) &&
                (event.which === 13 || event.keyCode === 13)
            ) {
                onSave();
            } else if (event.keyCode === 27) {
                onCancel();
                event.stopPropagation();
            }
        },
        [onSave, onCancel]
    );

    const onContentKeyDown = React.useCallback(
        (event: KeyboardEvent<any>) => {
            if ((event.ctrlKey || event.metaKey) && (event.which === 76 || event.keyCode === 76)) {
                event.preventDefault();
                insertCheckbox();
                return;
            }
            keydownEventHandler(event);
        },
        [insertCheckbox, keydownEventHandler]
    );

    const onTabChange = React.useCallback((name: string) => {
        if (name === 'edit') {
            setShowMarkdownPreview(false);
        } else {
            validateFields((err: Error, values: FormData) => {
                setCardContent(values.content || '');
                setShowMarkdownPreview(true);
            });
        }
    }, []);

    return (
        <Modal
            visible={visible}
            title={thisIsCreating ? 'Create a new card' : 'Edit'}
            okText={thisIsCreating ? 'Create' : 'Save'}
            onCancel={onCancel}
            cancelButtonProps={{ style: { display: 'none' } }}
            style={{ minWidth: 300 }}
            width={'60vw'}
            onOk={onSave}
        >
            <EditorContainer>
                <Form layout="vertical" onKeyDown={keydownEventHandler}>
                    <Form.Item label="Title">
                        {getFieldDecorator('title', {
                            rules: [{ required: true, message: 'Please input the name of board!' }],
                        })(<Input placeholder={'Title'} onKeyDown={keydownEventHandler} />)}
                    </Form.Item>
                    <Tabs
                        onChange={onTabChange}
                        type="card"
                        activeKey={showMarkdownPreview ? 'preview' : 'edit'}
                        style={{ marginBottom: 10, minHeight: 120 }}
                    >
                        <TabPane tab="Edit" key="edit">
                            <Tooltip title={'插入任务复选框 [ ]（快捷键 Ctrl+L）'}>
                                <Button
                                    size={'small'}
                                    style={{ marginBottom: 4 }}
                                    onClick={insertCheckbox}
                                >
                                    ☐
                                </Button>
                            </Tooltip>
                            {getFieldDecorator('content')(
                                <TextArea
                                    ref={contentRef}
                                    autoSize={{ minRows: 6 }}
                                    placeholder={'Description'}
                                    onKeyDown={onContentKeyDown}
                                />
                            )}
                        </TabPane>
                        <TabPane tab="Preview" key="preview">
                            <Markdown
                                style={{
                                    padding: '0px 10px',
                                    border: '1px solid rgb(220, 220, 220)',
                                    borderRadius: 4,
                                    maxHeight: 'calc(100vh - 600px)',
                                    minHeight: 120,
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: formatMarkdown(cardContent || ''),
                                }}
                            />
                        </TabPane>
                    </Tabs>
                    <Row>
                        <Col span={12}>
                            <Form.Item label="Estimated Time In Hour">
                                {getFieldDecorator('estimatedTime')(
                                    <InputNumber
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        precision={1}
                                        placeholder={'Estimated Time In Hour'}
                                    />
                                )}
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            {thisIsCreating ? undefined : (
                                <Form.Item label="Actual Spent Time In Hour">
                                    {getFieldDecorator('actualTime')(
                                        <InputNumber
                                            disabled={!isEditingActualTime}
                                            precision={2}
                                            min={0}
                                            step={0.2}
                                            placeholder={'Actual Time In Hour'}
                                        />
                                    )}
                                    <Button
                                        style={{ marginLeft: 4 }}
                                        icon={isEditingActualTime ? 'unlock' : 'lock'}
                                        shape={'circle-outline'}
                                        onClick={onSwitchIsEditing}
                                    />
                                </Form.Item>
                            )}
                        </Col>
                    </Row>
                    <Form.Item label="Labels">
                        <LabelEditor
                            labels={cardLabels}
                            onChange={setCardLabels}
                            suggestions={labelSuggestions}
                        />
                    </Form.Item>
                    {thisIsCreating ? undefined : (
                        <Row>
                            <Popconfirm title={'Are you sure?'} onConfirm={onDelete}>
                                <Button type={'danger'} icon={'delete'}>
                                    Delete
                                </Button>
                            </Popconfirm>
                        </Row>
                    )}
                </Form>
            </EditorContainer>
        </Modal>
    );
});

export const CardInDetail = connect(
    (state: RootState) => {
        const { isEditing, _id, listId } = state.kanban.kanban.editCard;
        const labelMap = new Map<string, string>();
        const boardCards: { _id: string; labels?: CardLabel[] }[] = [];
        let boardId: string | undefined = undefined;
        for (const id of Object.keys(state.kanban.boards)) {
            if (state.kanban.boards[id].lists.includes(listId)) {
                boardId = id;
                break;
            }
        }

        if (boardId !== undefined) {
            for (const lId of state.kanban.boards[boardId].lists) {
                for (const cardId of state.kanban.lists[lId]?.cards ?? []) {
                    const labels = state.kanban.cards[cardId]?.labels;
                    boardCards.push({ labels, _id: cardId });
                    for (const label of labels ?? []) {
                        if (!labelMap.has(label.name)) {
                            labelMap.set(label.name, label.color);
                        }
                    }
                }
            }
        }

        const suggestions = Array.from(labelMap).map(([name, color]) => ({ name, color }));
        return {
            listId,
            boardCards,
            card: _id === undefined ? undefined : state.kanban.cards[_id],
            visible: isEditing,
            labelSuggestions: suggestions,
        };
    },
    genMapDispatchToProp<CardActionTypes>({
        ...actions,
        onCancel: () => (dispatch: any) =>
            dispatch(kanbanActions.setEditCard(false, '', undefined)),
    })
)(Form.create({})(_CardInDetail));
