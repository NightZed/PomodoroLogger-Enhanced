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
    const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
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
            setShowMarkdownPreview(false);
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

    const [linkModalVisible, setLinkModalVisible] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const pendingLinkRef = useRef<{ start: number; end: number; text: string } | null>(null);

    const getTextarea = () => contentRef.current?.resizableTextArea?.textArea ?? contentRef.current;

    const applyMarkdown = React.useCallback(
        (
            wrap: (
                selected: string,
                context: { current: string; start: number; end: number }
            ) => { text: string; caretOffset?: number }
        ) => {
            validateFields((err: Error, values: FormData) => {
                if (err) {
                    return;
                }

                const current = values.content || '';
                const textarea = getTextarea();
                const start = textarea?.selectionStart ?? current.length;
                const end = textarea?.selectionEnd ?? start;
                const selected = current.slice(start, end);
                const { text, caretOffset } = wrap(selected, { current, start, end });
                const next = current.slice(0, start) + text + current.slice(end);
                setFieldsValue({ content: next });
                setCardContent(next);
                if (textarea) {
                    const caret = start + (caretOffset ?? text.length);
                    setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(caret, caret);
                    }, 0);
                }
            });
        },
        [validateFields, setFieldsValue]
    );

    const wrapSelection = React.useCallback(
        (prefix: string, suffix: string, placeholder: string) => {
            applyMarkdown((selected) => {
                const inner = selected || placeholder;
                return {
                    text: prefix + inner + suffix,
                    caretOffset: selected ? undefined : prefix.length + inner.length,
                };
            });
        },
        [applyMarkdown]
    );

    const insertCheckbox = React.useCallback(() => {
        applyMarkdown((_selected, { current, start }) => {
            const atLineStart = start === 0 || current[start - 1] === '\n';
            return { text: (atLineStart ? '' : '\n') + '[ ] ' };
        });
    }, [applyMarkdown]);

    const insertBold = React.useCallback(() => {
        wrapSelection('**', '**', '粗体文本');
    }, [wrapSelection]);

    const insertStrikethrough = React.useCallback(() => {
        wrapSelection('~~', '~~', '删除线文本');
    }, [wrapSelection]);

    const openLinkModal = React.useCallback(() => {
        validateFields((err: Error, values: FormData) => {
            if (err) {
                return;
            }

            const current = values.content || '';
            const textarea = getTextarea();
            const start = textarea?.selectionStart ?? current.length;
            const end = textarea?.selectionEnd ?? start;
            pendingLinkRef.current = {
                start,
                end,
                text: current.slice(start, end) || '链接文本',
            };
            setLinkUrl('');
            setLinkModalVisible(true);
        });
    }, [validateFields]);

    const closeLinkModal = React.useCallback(() => {
        setLinkModalVisible(false);
        pendingLinkRef.current = null;
    }, []);

    const confirmLink = React.useCallback(() => {
        const url = linkUrl.trim();
        const pending = pendingLinkRef.current;
        if (!url || !pending) {
            return;
        }

        const text = `[${pending.text}](${url})`;
        validateFields((err: Error, values: FormData) => {
            if (err) {
                return;
            }

            const current = values.content || '';
            const next = current.slice(0, pending.start) + text + current.slice(pending.end);
            setFieldsValue({ content: next });
            setCardContent(next);
            const textarea = getTextarea();
            if (textarea) {
                const caret = pending.start + text.length;
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(caret, caret);
                }, 0);
            }
        });
        closeLinkModal();
    }, [linkUrl, validateFields, setFieldsValue, closeLinkModal]);

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
            const mod = event.ctrlKey || event.metaKey;
            if (mod && (event.which === 76 || event.keyCode === 76)) {
                event.preventDefault();
                insertCheckbox();
                return;
            }
            if (mod && (event.which === 66 || event.keyCode === 66)) {
                event.preventDefault();
                insertBold();
                return;
            }
            if (mod && event.shiftKey && (event.which === 88 || event.keyCode === 88)) {
                event.preventDefault();
                insertStrikethrough();
                return;
            }
            if (mod && (event.which === 75 || event.keyCode === 75)) {
                event.preventDefault();
                openLinkModal();
                return;
            }
            keydownEventHandler(event);
        },
        [insertCheckbox, insertBold, insertStrikethrough, openLinkModal, keydownEventHandler]
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
                            <div style={{ marginBottom: 4 }}>
                                <Tooltip title={'插入任务复选框 [ ]（快捷键 Ctrl+L）'}>
                                    <Button size={'small'} onClick={insertCheckbox}>
                                        ☐
                                    </Button>
                                </Tooltip>
                                <Tooltip title={'加粗 **文本**（快捷键 Ctrl+B）'}>
                                    <Button
                                        size={'small'}
                                        style={{ marginLeft: 4 }}
                                        onClick={insertBold}
                                    >
                                        <b>B</b>
                                    </Button>
                                </Tooltip>
                                <Tooltip title={'删除线 ~~文本~~（快捷键 Ctrl+Shift+X）'}>
                                    <Button
                                        size={'small'}
                                        style={{ marginLeft: 4, textDecoration: 'line-through' }}
                                        onClick={insertStrikethrough}
                                    >
                                        S
                                    </Button>
                                </Tooltip>
                                <Tooltip title={'插入链接 [文本](URL)（快捷键 Ctrl+K）'}>
                                    <Button
                                        size={'small'}
                                        style={{ marginLeft: 4 }}
                                        icon={'link'}
                                        onClick={openLinkModal}
                                    />
                                </Tooltip>
                            </div>
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
            <Modal
                title={'插入链接'}
                visible={linkModalVisible}
                okText={'插入'}
                cancelText={'取消'}
                width={360}
                onOk={confirmLink}
                onCancel={closeLinkModal}
                destroyOnClose={true}
            >
                <Input
                    autoFocus={true}
                    placeholder={'https://example.com'}
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onPressEnter={confirmLink}
                />
            </Modal>
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
