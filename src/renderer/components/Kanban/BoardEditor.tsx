import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Button, Form, Input, Tabs, Tooltip } from 'antd';
import type { RuleObject } from 'antd/es/form';
import styled from 'styled-components';
import { feedback, FEEDBACK_MESSAGES } from '../feedback';
import { AppModal } from '../AppModal';
import { getPopupContainer } from '../popupLayer';
import { DistractingListModalButton } from '../Setting/DistractingList';
import { EditorContainer } from './style/editorStyle';
import { CreatedTime } from './style/CreatedTime';
import { formatTimeYmdHm } from '../Visualization/Timeline';
import formatMarkdown from './Card/formatMarkdown';
import { Markdown } from './style/Markdown';
import { AntdIcon as Icon } from '../antdIcon';
import { useI18n } from '../../i18n';

/**
 * Delete and the visibility toggle share the bottom row of the form. Hiding is
 * a draft exactly like the name and the description: the button flips right
 * away, but only Save writes `hidden`, so Cancel keeps the board as it was.
 */
const ActionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

interface FormProps {
    boardId: string;
    /** Shown in the delete confirmation so the dialog names its target. */
    boardName?: string;
    /** Whether the board is currently hidden; the toggle edits a draft of it. */
    hidden?: boolean;
    onSave?: (values: { name: string; description: string; hidden?: boolean }) => void;
    onCancel?: any;
    form: any;
    visible: boolean;
    isCreating: boolean;
    onDelete: () => void;
    nameValidator: (name: string) => boolean;
    createdTime?: number;
}

export const EditKanbanForm = (props: FormProps) => {
    const { t } = useI18n();
    const [internalForm] = Form.useForm();
    const form = props.form ?? internalForm;
    const {
        onSave,
        isCreating,
        nameValidator,
        visible,
        onDelete,
        boardId,
        boardName,
        onCancel,
        createdTime,
        hidden: savedHidden,
    } = props;
    const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
    const [description, setDescription] = useState('');
    /**
     * Draft of the board's visibility, seeded when the dialog opens. It is not
     * a `Form.Item`: the toggle is a button at the bottom of the form, and a
     * field the form does not render would never reach `onFinish`. The draft is
     * merged back into the values in `onFinish` instead.
     */
    const [hidden, setHidden] = useState(!!savedHidden);
    /** The button names the action, so its label flips with the draft. */
    const visibilityLabel = hidden ? t('kanban.boardEditor.show') : t('kanban.boardEditor.hide');

    const onKeydown = useCallback(
        (e: React.KeyboardEvent<any>) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                if (e.ctrlKey || e.shiftKey || e.altKey) {
                    e.stopPropagation();
                    e.preventDefault();
                    form.submit();
                }
            }
        },
        [form]
    );

    useEffect(() => {
        setDescription(form.getFieldValue('description') || '');
    }, [form]);

    // Every time the dialog opens (for a new or an existing board) it has to
    // start on the Edit tab, even if the previous visit ended on Preview. The
    // visibility draft is re-seeded here too, so reopening a board never shows
    // the toggle of whatever was edited before.
    useLayoutEffect(() => {
        if (visible) {
            setShowMarkdownPreview(false);
            setHidden(!!savedHidden);
        }
    }, [visible, isCreating, savedHidden]);

    const validator = useCallback(
        (_rule: RuleObject, name: unknown) => {
            if (!isCreating || typeof name !== 'string' || !name || nameValidator(name)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error(t('kanban.boardEditor.duplicate', name)));
        },
        [isCreating, nameValidator, t]
    );

    const onDeleteClick = useCallback(() => {
        feedback.confirm({
            kind: 'warning',
            title: FEEDBACK_MESSAGES.kanban.deleteBoardConfirm(boardName ?? ''),
            content: FEEDBACK_MESSAGES.kanban.deleteBoardDetail,
            onOk: onDelete,
        });
    }, [boardName, onDelete]);

    const onTabChange = useCallback(
        (key: string) => {
            const toPreview = key === 'preview';
            if (toPreview) {
                setDescription(form.getFieldValue('description') || '');
            }
            setShowMarkdownPreview(toPreview);
        },
        [form]
    );

    const descriptionHtml = React.useMemo(() => formatMarkdown(description), [description]);

    return (
        <AppModal
            open={visible}
            title={
                isCreating ? t('kanban.boardEditor.createTitle') : t('kanban.boardEditor.editTitle')
            }
            okText={isCreating ? t('kanban.boardEditor.create') : t('common.save')}
            onCancel={onCancel}
            cancelButtonProps={{ style: { display: 'none' } }}
            onOk={() => form.submit()}
            style={{ minWidth: 300 }}
            width={'60vw'}
            getContainer={getPopupContainer}
            forceRender
        >
            <EditorContainer>
                <Form
                    form={form}
                    layout="vertical"
                    onKeyDown={onKeydown}
                    onFinish={(values) => onSave?.({ ...values, hidden })}
                >
                    <Form.Item
                        label={t('kanban.boardEditor.name')}
                        name="name"
                        rules={[
                            {
                                required: true,
                                message: t('kanban.boardEditor.nameRequired'),
                            },
                            { max: 48, message: t('kanban.boardEditor.nameTooLong') },
                            { validator },
                        ]}
                    >
                        <Input onKeyDown={onKeydown} />
                    </Form.Item>
                    {!isCreating && createdTime !== undefined ? (
                        <CreatedTime style={{ marginTop: -4, marginBottom: 8 }}>
                            {t('kanban.page.created')}: {formatTimeYmdHm(createdTime)}
                        </CreatedTime>
                    ) : undefined}
                    {/* Mounted with the (force-rendered) dialog so opening the
                        editor only has to show the already-mounted form:
                        mounting Tabs and the auto-sizing textarea inside the
                        click handler made the first click on a board feel
                        frozen. */}
                    {
                        <Tabs
                            onChange={onTabChange}
                            type="card"
                            activeKey={showMarkdownPreview ? 'preview' : 'edit'}
                            style={{ marginBottom: 10, minHeight: 120 }}
                            items={[
                                {
                                    key: 'edit',
                                    label: t('kanban.boardEditor.edit'),
                                    children: (
                                        <Form.Item name="description">
                                            <Input.TextArea
                                                autoSize={{ minRows: 3, maxRows: 5 }}
                                                onKeyDown={onKeydown}
                                            />
                                        </Form.Item>
                                    ),
                                },
                                {
                                    key: 'preview',
                                    label: t('kanban.boardEditor.preview'),
                                    children: (
                                        <Markdown
                                            style={{
                                                padding: '0px 10px',
                                                border: '1px solid var(--pl-border)',
                                                borderRadius: 4,
                                                maxHeight: 'calc(100vh - 600px)',
                                                minHeight: 120,
                                            }}
                                            dangerouslySetInnerHTML={{
                                                __html: descriptionHtml,
                                            }}
                                        />
                                    ),
                                },
                            ]}
                        />
                    }
                    {!isCreating ? (
                        <>
                            <Form.Item>
                                <ActionRow>
                                    <Button
                                        type="primary"
                                        danger
                                        icon={<Icon type={'delete'} />}
                                        onClick={onDeleteClick}
                                    >
                                        {t('common.delete')}
                                    </Button>
                                    {/* The label names the action, so it flips with
                                        the pending value: a visible board offers
                                        "hide", a hidden one offers "show". The
                                        explicit `aria-label` keeps the icon's own
                                        name ("eye-invisible") out of it. */}
                                    <Tooltip title={t('kanban.boardEditor.hiddenHint')}>
                                        <Button
                                            icon={<Icon type={hidden ? 'eye' : 'eye-invisible'} />}
                                            aria-label={visibilityLabel}
                                            onClick={() => setHidden((value) => !value)}
                                        >
                                            {visibilityLabel}
                                        </Button>
                                    </Tooltip>
                                </ActionRow>
                            </Form.Item>
                            <DistractingListModalButton boardId={boardId} />
                        </>
                    ) : undefined}
                </Form>
            </EditorContainer>
        </AppModal>
    );
};
