import * as React from 'react';
import { DistractingRow, actions } from '../Timer/action';
import { actions as boardActions } from '../Kanban/Board/action';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../reducers';
import { Dispatch } from 'redux';
import { Form, Input, Button, Modal } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { getPopupContainer } from '../popupLayer';
import styled from 'styled-components';

const { useForm } = Form;

const Container = styled.div`
    max-height: calc(100vh - 300px);
    overflow-y: auto;
    ::-webkit-scrollbar {
        width: 4px;
        height: 4px;
        background-color: rgba(0, 0, 0, 0);
    }
    ::-webkit-scrollbar-track {
        width: 4px;
        background-color: rgba(0, 0, 0, 0);
    }
    ::-webkit-scrollbar-thumb {
        width: 4px;
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
    }
`;

const InputGroup = styled.div`
    display: flex;
    width: 85%;
    margin-right: 8px;

    .ant-form-item {
        flex: 1;
        min-width: 0;
        margin-bottom: 0;
    }

    > .ant-input {
        flex: 1;
        min-width: 0;
        border-left: 0;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }
`;

const InputAddon = styled.span`
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 11px;
    color: var(--pl-text);
    font-size: 14px;
    white-space: nowrap;
    background: var(--pl-bg-sunken);
    border: 1px solid var(--pl-border);
    border-right: 1px solid var(--pl-border);
    border-radius: 6px 0 0 6px;
`;

interface DynamicFieldSetProps {
    onSubmit: (ans: DistractingRow[]) => void;
    initialApps: string[];
    initialTitles: string[];
    registerSubmit: (submit: () => void) => void;
}

const DynamicFieldSet: React.FC<DynamicFieldSetProps> = ({
    onSubmit,
    initialApps,
    initialTitles,
    registerSubmit,
}) => {
    const [form] = useForm();
    const [idCounter, setIdCounter] = React.useState(0);

    React.useEffect(() => {
        const keys = initialApps.map((_, i) => i);
        form.setFieldsValue({ keys, apps: initialApps, titles: initialTitles });
        setIdCounter(Math.max(-1, ...keys) + 1);
        registerSubmit(() => form.submit());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const remove = (k: number) => {
        const keys = form.getFieldValue('keys');
        if (keys.length === 1) {
            return;
        }
        form.setFieldsValue({
            keys: keys.filter((key: number) => key !== k),
        });
    };

    const add = () => {
        const keys = form.getFieldValue('keys');
        const nextKeys = keys.concat(idCounter);
        setIdCounter(idCounter + 1);
        form.setFieldsValue({
            keys: nextKeys,
        });
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const { apps, titles } = values;
            let { keys } = values;
            keys = keys.filter((key: any) => apps[key] || titles[key]);
            form.setFieldsValue({ keys });

            const ans: any[] = [];
            for (const key of keys) {
                ans.push({
                    app: apps[key],
                    title: titles[key],
                });
            }
            onSubmit(ans);
        } catch {
            // validation failed
        }
    };

    const keys = form.getFieldValue('keys') ?? [];
    const formItemLayout = {
        labelCol: { xs: { span: 24 }, sm: { span: 4 } },
        wrapperCol: { xs: { span: 24 }, sm: { span: 20 } },
    };
    const formItemLayoutWithOutLabel = {
        wrapperCol: { xs: { span: 24, offset: 0 }, sm: { span: 20, offset: 4 } },
    };

    const formItems = keys.map((k: number, index: number) => (
        <React.Fragment key={k}>
            <Form.Item
                {...(index === 0 ? formItemLayout : formItemLayoutWithOutLabel)}
                label={index === 0 ? 'RegExp' : ''}
                required={false}
                style={{ marginBottom: 4 }}
            >
                <InputGroup>
                    <InputAddon>App</InputAddon>
                    <Form.Item name={['apps', k]} noStyle>
                        <Input placeholder="App RegExp" />
                    </Form.Item>
                </InputGroup>
            </Form.Item>
            <Form.Item {...formItemLayoutWithOutLabel} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <InputGroup>
                        <InputAddon>Title</InputAddon>
                        <Form.Item name={['titles', k]} noStyle>
                            <Input placeholder="Title RegExp" />
                        </Form.Item>
                    </InputGroup>
                    {keys.length > 1 ? (
                        <Button
                            type="text"
                            className="dynamic-delete-button"
                            onClick={() => remove(k)}
                            icon={<MinusCircleOutlined />}
                            aria-label="Remove rule"
                        />
                    ) : null}
                </div>
            </Form.Item>
        </React.Fragment>
    ));

    return (
        <Container>
            <Form form={form} onFinish={handleSubmit}>
                {formItems}
                <Form.Item {...formItemLayoutWithOutLabel}>
                    <Button
                        type="dashed"
                        onClick={add}
                        style={{ width: '85%' }}
                        icon={<PlusOutlined />}
                    >
                        Add field
                    </Button>
                </Form.Item>
            </Form>
        </Container>
    );
};

interface DistractingListProps extends InputProps {
    registerSubmit: (submit: () => void) => void;
    onSaved: () => void;
}

interface InputProps {
    boardId?: string;
}

export const DistractingList: React.FC<DistractingListProps> = ({
    boardId,
    registerSubmit,
    onSaved,
}) => {
    const dispatch = useDispatch<Dispatch>();
    const distractingList = useSelector((state: RootState) =>
        boardId == null
            ? state.timer.distractingList
            : state.kanban.boards[boardId].distractionList || []
    );

    const onSubmit = (rows: DistractingRow[]) => {
        if (boardId == null) {
            actions.setDistractingList(rows)(dispatch);
        } else {
            boardActions.setDistractionList(boardId, rows)(dispatch);
        }
        onSaved();
    };

    return (
        <DynamicFieldSet
            initialApps={distractingList.map((v: DistractingRow) => v.app ?? '')}
            initialTitles={distractingList.map((v: DistractingRow) => v.title ?? '')}
            onSubmit={onSubmit}
            registerSubmit={registerSubmit}
        />
    );
};

export const DistractingListModalButton = (props: InputProps) => {
    const [editingDistracting, setEditingDistracting] = React.useState(false);
    const submitForm = React.useRef<(() => void) | null>(null);
    const onOk = () => {
        submitForm.current?.();
    };

    return (
        <>
            {/* tslint:disable-next-line:jsx-no-lambda */}
            <Button onClick={() => setEditingDistracting(true)}>Distracting App Setting</Button>
            <Modal
                title={'Distracting App Setting'}
                open={editingDistracting}
                /* tslint:disable-next-line:jsx-no-lambda */
                onCancel={() => setEditingDistracting(false)}
                onOk={onOk}
                destroyOnHidden={true}
                okText={'Save'}
                getContainer={getPopupContainer}
            >
                <DistractingList
                    {...props}
                    registerSubmit={(submit) => {
                        submitForm.current = submit;
                    }}
                    onSaved={() => setEditingDistracting(false)}
                />
            </Modal>
        </>
    );
};
