/**
 * Regression: the suggestion dropdown builds each Option with a colored
 * `<SuggestionChip>` element as its children, while antd's AutoComplete
 * defaults `optionLabelProp` to `'children'` (antd auto-complete/index.js
 * defaultProps). rc-select then resolves the combobox's `inputValue` from that
 * prop in two places -- `getInputValueForCombobox` on every controlled-value
 * update (Select.js getDerivedStateFromProps) and `getPropValue(item,
 * optionLabelProp)` right after a selection (Select.js onMenuSelect) -- so the
 * React element itself landed in the input, rendering "[object Object]" and
 * making SelectTrigger/DropdownMenu warn that `inputValue` must be a string.
 *
 * The editor pins `optionLabelProp="value"` (the plain label name) on both
 * AutoComplete rows. antd's own combobox fallback would do the same
 * (`optionLabelProp = optionLabelProp || 'value'` in select/index.js, with the
 * comment "children 带 dom 结构时，无法填入输入框") if the AutoComplete default
 * did not shadow it.
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';

import { POPUP_CONTAINER_ID } from '../../popupLayer';
import { LabelEditor } from './LabelEditor';

describe('LabelEditor suggestion input value', () => {
    let container: HTMLDivElement;
    let errors: string[];
    let onChange: jest.Mock;

    const SUGGESTIONS = [
        { name: 'bug', color: '#eb5a46' },
        { name: 'feature', color: '#61bd4f' },
    ];

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        // Application renders this layer inside the Content div (opacity:
        // contentOpacity); every overlay that should fade with the page mounts
        // here (popupLayer.ts). LabelEditor must resolve it too.
        const popupLayer = document.createElement('div');
        popupLayer.id = POPUP_CONTAINER_ID;
        document.body.appendChild(popupLayer);

        errors = [];
        jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors.push(args.map(String).join(' '));
        });
        onChange = jest.fn();

        act(() => {
            ReactDOM.render(
                <LabelEditor labels={[]} onChange={onChange} suggestions={SUGGESTIONS} />,
                container
            );
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document.body.innerHTML = '';
        (console.error as jest.Mock).mockRestore();
    });

    const nameInput = () =>
        container.querySelector('input[placeholder="Label name"]') as HTMLInputElement;

    const type = (value: string) => {
        act(() => {
            // `target` is typed as plain EventTarget; the override mirrors what
            // every DOM-testing helper does to feed a value into onChange.
            Simulate.change(nameInput(), { target: { value } as unknown as EventTarget });
        });
    };

    /** The propType warnings this fix targets name `inputValue` explicitly. */
    const inputValueWarnings = () => errors.filter((message) => message.includes('inputValue'));

    it('keeps the plain label name in the input when the text matches a suggestion exactly', () => {
        // Typing the full name fires the controlled-value path: rc-select's
        // getDerivedStateFromProps resolves inputValue from the matching
        // option's label.
        type('bug');
        expect(nameInput().value).toBe('bug');
        expect(inputValueWarnings()).toEqual([]);
    });

    it('keeps the plain label name in the input after picking a suggestion', () => {
        type('bu');
        const option = Array.from(document.querySelectorAll('.ant-select-dropdown-menu-item')).find(
            (item) => item.textContent === 'bug'
        );
        expect(option).toBeDefined();

        act(() => {
            Simulate.click(option as Element);
        });

        expect(nameInput().value).toBe('bug');
        expect(inputValueWarnings()).toEqual([]);
        expect(nameInput().value).not.toContain('[object Object]');
    });

    it('mounts the dropdown in the shared popup layer, not on <body>', () => {
        // rc-trigger's default container is document.body, which sits outside
        // the Content layer's opacity -- the dropdown would stay fully opaque
        // while the page fades.
        type('bu');
        const dropdown = document.querySelector('.ant-select-dropdown');
        expect(dropdown).not.toBeNull();
        expect(document.getElementById(POPUP_CONTAINER_ID)!.contains(dropdown)).toBe(true);
    });
});

describe('LabelEditor chip editing', () => {
    let container: HTMLDivElement;
    let onChange: jest.Mock;

    const LABELS = [{ name: 'bug', color: '#eb5a46' }];
    const SUGGESTIONS = [{ name: 'bug', color: '#eb5a46' }];

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const popupLayer = document.createElement('div');
        popupLayer.id = POPUP_CONTAINER_ID;
        document.body.appendChild(popupLayer);
        onChange = jest.fn();

        act(() => {
            ReactDOM.render(
                <LabelEditor labels={LABELS} onChange={onChange} suggestions={SUGGESTIONS} />,
                container
            );
        });
    });

    afterEach(() => {
        act(() => {
            ReactDOM.unmountComponentAtNode(container);
        });
        container.remove();
        document.body.innerHTML = '';
    });

    const chipName = () => container.querySelector('span[title="bug"]');
    const chipRemove = () => container.querySelector('span[title="Remove label"]');

    it('opens the edit popover from the chip, prefilled with the label', () => {
        act(() => {
            Simulate.click(chipName() as Element);
        });

        // The popup renders into the shared popup layer (getPopupContainer);
        // the first input inside it is the prefilled name field.
        const editInput = document.querySelector('.ant-popover input') as HTMLInputElement;
        expect(editInput).not.toBeNull();
        expect(editInput.value).toBe('bug');
        // The field takes focus after commit (see the editPanelRef effect):
        // typing can start right away.
        expect(document.activeElement).toBe(editInput);
    });

    it('removes the label from the cross without opening the popover', () => {
        act(() => {
            Simulate.click(chipRemove() as Element);
        });

        expect(onChange).toHaveBeenCalledWith([]);
        // The cross stops propagation, so the Popover trigger's own click
        // (which would open the editor) must not have fired: rc-trigger only
        // renders the popup after its first open, so no .ant-popover exists.
        expect(document.querySelector('.ant-popover')).toBeNull();
    });

    it('saves an edited name through the popover OK button', () => {
        act(() => {
            Simulate.click(chipName() as Element);
        });
        const editInput = document.querySelector('.ant-popover input') as HTMLInputElement;
        act(() => {
            Simulate.change(editInput, { target: { value: 'defect' } as unknown as EventTarget });
        });

        const ok = Array.from(document.querySelectorAll('.ant-popover button')).find(
            (button) => button.textContent === 'OK'
        );
        expect(ok).toBeDefined();
        act(() => {
            Simulate.click(ok as Element);
        });

        expect(onChange).toHaveBeenCalledWith([{ name: 'defect', color: '#eb5a46' }]);
    });
});
