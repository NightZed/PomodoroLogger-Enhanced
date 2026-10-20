import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Form, FormInstance } from 'antd';
import { EditKanbanForm } from './BoardEditor';

jest.mock('antd/es/input/TextArea', () => ({ __esModule: true, default: () => null }));

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
            const createButton = Array.from(document.body.querySelectorAll('button')).find(
                (button) => button.textContent?.trim() === 'Create'
            );
            expect(createButton).toBeDefined();
            await act(async () => {
                fireEvent.click(createButton!);
                await new Promise((resolve) => setTimeout(resolve, 0));
            });

            expect(onSave).not.toHaveBeenCalled();
            expect(document.body.textContent).toContain(errorMessage);
            expect(warn.mock.calls.flat().join(' ')).not.toContain('`callback` is deprecated');
        }
    );
});
