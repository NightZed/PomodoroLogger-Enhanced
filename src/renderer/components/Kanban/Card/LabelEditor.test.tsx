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
import { cleanup, fireEvent, render } from '@testing-library/react';

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

        render(<LabelEditor labels={[]} onChange={onChange} suggestions={SUGGESTIONS} />, {
            container,
        });
    });

    afterEach(() => {
        cleanup();
        container.remove();
        document.body.innerHTML = '';
        (console.error as jest.Mock).mockRestore();
    });

    const nameInput = () =>
        container.querySelector('input[placeholder="Label name"]') as HTMLInputElement;

    const type = (value: string) => {
        fireEvent.change(nameInput(), { target: { value } });
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

    it('commits the picked suggestion as a plain name and clears the input', () => {
        // A pick is a direct commit now (see "direct commit on suggestion
        // pick" below): the regression this test guards -- the SuggestionChip
        // element leaking into the input as "[object Object]" -- now shows up
        // in the committed label instead, so assert on the onChange payload.
        type('bu');
        const option = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
            (item) => item.textContent === 'bug'
        );
        expect(option).toBeDefined();

        fireEvent.click(option as Element);

        expect(onChange).toHaveBeenCalledWith([{ name: 'bug', color: '#eb5a46' }]);
        expect(inputValueWarnings()).toEqual([]);
        // Committed, not just filled: the input starts over empty.
        expect(nameInput().value).toBe('');
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

    it('renders the option list in the container the chip-cloud CSS targets', () => {
        // The wrapping chip cloud (LabelSuggestDropdownStyle) turns antd's
        // vertical option list into a flex-wrap cloud by overriding
        // `flex-direction` on the virtual list's inner container. antd 6
        // renamed that container from `.rc-virtual-list-holder-inner` to
        // `.ant-select-dropdown-list-holder-inner`, which silently broke the
        // layout: the selectors kept matching nothing and every chip went back
        // to its own row. Pin the class names the CSS depends on so the next
        // antd bump cannot regress it unnoticed.
        type('bu');
        expect(
            document.querySelector(
                '.pl-label-suggest-dropdown .ant-select-dropdown-list-holder-inner'
            )
        ).not.toBeNull();
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

        render(<LabelEditor labels={LABELS} onChange={onChange} suggestions={SUGGESTIONS} />, {
            container,
        });
    });

    afterEach(() => {
        cleanup();
        container.remove();
        document.body.innerHTML = '';
    });

    const chipName = () => container.querySelector('span[title="bug"]');
    const chipRemove = () => container.querySelector('span[title="Remove label"]');

    it('opens the edit popover from the chip, prefilled with the label', () => {
        fireEvent.click(chipName() as Element);

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
        fireEvent.click(chipRemove() as Element);

        expect(onChange).toHaveBeenCalledWith([]);
        // The cross stops propagation, so the Popover trigger's own click
        // (which would open the editor) must not have fired: rc-trigger only
        // renders the popup after its first open, so no .ant-popover exists.
        expect(document.querySelector('.ant-popover')).toBeNull();
    });

    it('saves an edited name through the popover OK button', () => {
        fireEvent.click(chipName() as Element);
        const editInput = document.querySelector('.ant-popover input') as HTMLInputElement;
        fireEvent.change(editInput, { target: { value: 'defect' } });

        const ok = Array.from(document.querySelectorAll('.ant-popover button')).find(
            (button) => button.textContent === 'OK'
        );
        expect(ok).toBeDefined();
        fireEvent.click(ok as Element);

        expect(onChange).toHaveBeenCalledWith([{ name: 'defect', color: '#eb5a46' }]);
    });
});

/**
 * A suggestion pick (click, or Enter while its chip is highlighted) commits
 * the label directly -- it no longer only fills the input. The Enter path
 * needs the guard in hasHighlightedSuggestion: antd Input's onPressEnter runs
 * BEFORE rc-select's own keydown, so without the guard one keypress would
 * commit the half-typed text AND the picked suggestion.
 */
describe('LabelEditor direct commit on suggestion pick', () => {
    let container: HTMLDivElement;
    let onChange: jest.Mock;

    const SUGGESTIONS = [
        { name: 'bug', color: '#eb5a46' },
        { name: 'feature', color: '#61bd4f' },
    ];

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        const popupLayer = document.createElement('div');
        popupLayer.id = POPUP_CONTAINER_ID;
        document.body.appendChild(popupLayer);
        onChange = jest.fn();

        render(<LabelEditor labels={[]} onChange={onChange} suggestions={SUGGESTIONS} />, {
            container,
        });
    });

    afterEach(() => {
        cleanup();
        container.remove();
        document.body.innerHTML = '';
    });

    const nameInput = () =>
        container.querySelector('input[placeholder="Label name"]') as HTMLInputElement;

    const type = (value: string) => {
        fireEvent.change(nameInput(), { target: { value } });
    };

    const suggestionItem = () =>
        document.querySelector(
            '.pl-label-suggest-dropdown:not(.ant-select-dropdown-hidden) ' +
                '.ant-select-item-option'
        ) as HTMLElement;

    it('Enter on a hovered suggestion adds it once, not the half-typed text', () => {
        type('bu');
        const item = suggestionItem();
        // Hover is what highlights a chip (rc-select clears the active key on
        // every input change) -- the same state as the user's "hover a
        // suggestion and press Enter".
        fireEvent.mouseEnter(item);
        expect(item).not.toBeNull();

        fireEvent.keyDown(nameInput(), { key: 'Enter', keyCode: 13, which: 13 });

        // Exactly one commit, and it is the full suggestion -- not 'bu'.
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith([{ name: 'bug', color: '#eb5a46' }]);
    });

    it('bare Enter with no highlighted suggestion still commits the typed text', () => {
        // 'brand-new' matches no suggestion: nothing can be highlighted, so
        // the typed name goes through the regular add path.
        type('brand-new');

        fireEvent.keyDown(nameInput(), { key: 'Enter', keyCode: 13, which: 13 });

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith([{ name: 'brand-new', color: '#61bd4f' }]);
    });

    it('picking a suggestion in the edit popover saves the rename immediately', () => {
        render(
            <LabelEditor
                labels={[{ name: 'bug', color: '#eb5a46' }]}
                onChange={onChange}
                suggestions={SUGGESTIONS}
            />,
            { container }
        );
        fireEvent.click(container.querySelector('span[title="bug"]') as Element);

        const editInput = document.querySelector('.ant-popover input') as HTMLInputElement;
        fireEvent.change(editInput, { target: { value: 'feature' } });
        expect(suggestionItem()).not.toBeNull();

        fireEvent.click(suggestionItem());

        // The picked name replaces the edited label with the board color --
        // no OK press needed.
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith([{ name: 'feature', color: '#61bd4f' }]);
    });
});
