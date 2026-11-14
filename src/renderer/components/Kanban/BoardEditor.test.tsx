import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form, FormInstance } from 'antd';
import { EditKanbanForm } from './BoardEditor';
import { feedback } from '../feedback';

jest.mock('antd/lib/input/TextArea', () => ({ __esModule: true, default: () => null }));
jest.mock('../feedback', () => ({
    ...jest.requireActual('../feedback'),
    feedback: { confirm: jest.fn(), toast: jest.fn() },
}));

const createBoardForm = (
    container: HTMLDivElement,
    nameValidator: (name: string) => boolean,
    onSave: jest.Mock
) => {
    const formRef = React.createRef<FormInstance>();
    const FormHarness = () => {
        const [form] = Form.useForm();
        React.useImperativeHandle(formRef, () => form, [form]);
        return (
            <EditKanbanForm
                boardId=""
                form={form}
                visible={true}
                isCreating={true}
                onSave={onSave}
                onCancel={jest.fn()}
                onDelete={jest.fn()}
                nameValidator={nameValidator}
            />
        );
    };

    render(<FormHarness />, { container });
    return formRef.current!;
};

describe('EditKanbanForm board editor tab', () => {
    const EditorHarness = (props: { visible: boolean; isCreating: boolean }) => {
        const [form] = Form.useForm();
        return (
            <EditKanbanForm
                boardId=""
                form={form}
                visible={props.visible}
                isCreating={props.isCreating}
                onSave={jest.fn()}
                onCancel={jest.fn()}
                onDelete={jest.fn()}
                nameValidator={() => true}
            />
        );
    };

    const activeTabLabel = () =>
        document.body.querySelector('.ant-tabs-tab-active')?.textContent?.trim();

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
    });

    it.each([true, false])(
        'reopens on the Edit tab instead of Preview (isCreating=%s)',
        (isCreating) => {
            const { rerender } = render(<EditorHarness visible={true} isCreating={isCreating} />);

            const previewTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(
                (tab) => tab.textContent?.trim() === 'Preview'
            );
            expect(previewTab).toBeDefined();
            fireEvent.click(previewTab!);
            expect(activeTabLabel()).toBe('Preview');

            rerender(<EditorHarness visible={false} isCreating={isCreating} />);
            rerender(<EditorHarness visible={true} isCreating={isCreating} />);
            expect(activeTabLabel()).toBe('Edit');
        }
    );
});

describe('EditKanbanForm board name validation', () => {
    let container: HTMLDivElement;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        container = document.createElement('div');
        warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        warn.mockRestore();
    });

    it.each([
        ['empty', '', 'Please input the name of board!'],
        ['duplicate', 'Existing board', 'Board "Existing board" already exists'],
    ])(
        'keeps the modal open and reports an %s name without an unhandled rejection',
        async (_caseName, name, errorMessage) => {
            const onSave = jest.fn();
            const form = createBoardForm(
                container,
                (candidate) => candidate !== 'Existing board',
                onSave
            );

            act(() => {
                form.setFieldsValue({ name });
            });
            const createButton = screen.getByRole('button', { name: /Create/ });
            await act(async () => {
                fireEvent.click(createButton);
            });

            expect(onSave).not.toHaveBeenCalled();
            await waitFor(() => expect(document.body.textContent).toContain(errorMessage));
            expect(warn.mock.calls.flat().join(' ')).not.toContain('`callback` is deprecated');
        }
    );
});

describe('EditKanbanForm delete', () => {
    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('names the board in a modal confirm and deletes only after it is accepted', async () => {
        // Deleting used to be an in-place Popconfirm. It sits on a plain button
        // here, but the three delete paths share one confirmation now so the
        // dialog says which board is about to disappear.
        const onDelete = jest.fn();
        const Harness = () => {
            const [form] = Form.useForm();
            return (
                <EditKanbanForm
                    boardId="board-1"
                    boardName="Work"
                    form={form}
                    visible={true}
                    isCreating={false}
                    onSave={jest.fn()}
                    onCancel={jest.fn()}
                    onDelete={onDelete}
                    nameValidator={() => true}
                />
            );
        };

        render(<Harness />);

        const deleteButton = screen.getByRole('button', { name: /Delete/ });

        await act(async () => {
            fireEvent.click(deleteButton);
        });

        expect(feedback.confirm).toHaveBeenCalledTimes(1);
        expect(feedback.confirm).toHaveBeenCalledWith(
            expect.objectContaining({
                title: expect.stringContaining('Work'),
                onOk: expect.any(Function),
            })
        );
        expect(onDelete).not.toHaveBeenCalled();

        const { onOk } = (feedback.confirm as jest.Mock).mock.calls[0][0];
        await act(async () => {
            onOk();
        });
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});
