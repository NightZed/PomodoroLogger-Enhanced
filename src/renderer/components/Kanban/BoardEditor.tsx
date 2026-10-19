import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Tabs } from 'antd';
import type { RuleObject } from 'antd/es/form';
import { ConfirmPopover } from '../feedback';
import { getPopupContainer } from '../popupLayer';
import TextArea from 'antd/es/input/TextArea';
import { DistractingListModalButton } from '../Setting/DistractingList';
import { EditorContainer } from './style/editorStyle';
import { CreatedTime } from './style/CreatedTime';
import { formatTimeYmdHm } from '../Visualization/Timeline';
import formatMarkdown from './Card/formatMarkdown';
import { Markdown } from './style/Markdown';
import { AntdIcon as Icon } from '../antdIcon';

interface FormProps {
    boardId: string;
    onSave?: (values: { name: string; description: string }) => void;
    onCancel?: any;
    form: any;
    visible: boolean;
    isCreating: boolean;
    onDelete: () => void;
    nameValidator: (name: string) => boolean;
    createdTime?: number;
}

export const EditKanbanForm = (props: FormProps) => {
    const [internalForm] = Form.useForm();
    const form = props.form ?? internalForm;
    const { onSave, isCreating, nameValidator } = props;
    const [showMarkdownPreview, setShowMarkdownPreview] = useState(true);
    const [description, setDescription] = useState('');

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

    useEffect(() => {
        if (!isCreating) {
            setShowMarkdownPreview(false);
        }
    }, [isCreating]);

    const validator = useCallback(
        (_rule: RuleObject, name: unknown) => {
            if (!isCreating || typeof name !== 'string' || !name || nameValidator(name)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error(`Board "${name}" already exists`));
        },
        [isCreating, nameValidator]
    );

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

    const { visible, onDelete, boardId, onCancel, createdTime } = props;

    return (
        <Modal
            open={visible}
            title={isCreating ? 'Create a new board' : 'Edit'}
            okText={isCreating ? 'Create' : 'Save'}
            onCancel={onCancel}
            cancelButtonProps={{ style: { display: 'none' } }}
            onOk={() => form.submit()}
            style={{ minWidth: 300 }}
            width={'60vw'}
            getContainer={getPopupContainer}
            forceRender
        >
            <EditorContainer>
                <Form form={form} layout="vertical" onKeyDown={onKeydown} onFinish={onSave}>
                    <Form.Item
                        label="Name"
                        name="name"
                        rules={[
                            { required: true, message: 'Please input the name of board!' },
                            { max: 48, message: 'Max length of name is 48' },
                            { validator },
                        ]}
                    >
                        <Input onKeyDown={onKeydown} />
                    </Form.Item>
                    {!isCreating && createdTime !== undefined ? (
                        <CreatedTime style={{ marginTop: 4 }}>
                            Created: {formatTimeYmdHm(createdTime)}
                        </CreatedTime>
                    ) : undefined}
                    {/* Avoid leaving Tabs' resize observers active inside a closed modal. */}
                    {visible ? (
                        <Tabs
                            onChange={onTabChange}
                            type="card"
                            activeKey={showMarkdownPreview ? 'preview' : 'edit'}
                            style={{ marginBottom: 10, minHeight: 120 }}
                            items={[
                                {
                                    key: 'edit',
                                    label: 'Edit',
                                    children: (
                                        <Form.Item name="description">
                                            <TextArea
                                                autoSize={{ minRows: 3, maxRows: 5 }}
                                                onKeyDown={onKeydown}
                                            />
                                        </Form.Item>
                                    ),
                                },
                                {
                                    key: 'preview',
                                    label: 'Preview',
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
                                                __html: formatMarkdown(description),
                                            }}
                                        />
                                    ),
                                },
                            ]}
                        />
                    ) : null}
                    {!isCreating ? (
                        <>
                            <Form.Item>
                                <ConfirmPopover onConfirm={onDelete}>
                                    <Button type="primary" danger icon={<Icon type={'delete'} />}>
                                        Delete
                                    </Button>
                                </ConfirmPopover>
                            </Form.Item>
                            <DistractingListModalButton boardId={boardId} />
                        </>
                    ) : undefined}
                </Form>
            </EditorContainer>
        </Modal>
    );
};
