import React, { FC, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { AutoComplete, Button, Input, Popover } from 'antd';
import { feedback, FEEDBACK_MESSAGES } from '../../feedback';
import { getPopupContainer } from '../../popupLayer';
import { CardLabel } from '../type';
import { getLabelSuggestions } from './labelSuggestion';

const { Option } = AutoComplete;

export const LABEL_COLORS = [
    '#61bd4f',
    '#f2d600',
    '#ff9f1a',
    '#eb5a46',
    '#c377e0',
    '#0079bf',
    '#00c2e0',
    '#51e898',
    '#f78eb3',
    '#344563',
];

const LabelRow = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 6px;
`;

/**
 * The label list is a wrapping chip cloud (the same layout the suggestion
 * dropdown below and the card face already use), not one row per label: N
 * labels on N rows used to stretch the card editor dialog by N * rowHeight.
 *
 * Deliberately NO max-height cap: the cloud is expected to stay short, and a
 * cap would only hide labels behind an inner scrollbar.
 */
const LabelCloud = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin-bottom: 6px;
`;

/**
 * A chip is one clickable pill: the name opens the edit popover, the embedded
 * cross removes it (no separate edit/delete icons anymore). `max-width` +
 * ellipsis keep long names from blowing up a cloud row; the cross lives in
 * its own flex child so it stays visible regardless of the name length.
 */
const LabelChip = styled.span<{ color: string }>`
    display: inline-flex;
    align-items: stretch;
    border-radius: 1em;
    font-size: 0.9em;
    line-height: 1.7;
    color: #fff;
    background-color: ${(props) => props.color};
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
`;

/**
 * Hover feedback differs per zone on purpose (edit vs delete must read as two
 * different affordances): hovering the name brightens the whole pill, hovering
 * the cross paints a local dark segment with the cross at full opacity.
 *
 * The name's right padding is deliberately tight (0.35em): together with the
 * cross's own 0.15em left padding it leaves only ~6px between text and cross
 * -- the old 0.7em/0.5em pair read as a gap that was far too wide.
 */
const ChipName = styled.span`
    min-width: 0;
    padding: 2px 0.35em 2px 0.7em;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: filter 0.15s ease;

    &:hover {
        filter: brightness(1.15);
    }
`;

/**
 * The cross is a plain `×` text glyph, not an antd `Icon`: `.anticon` ships
 * `line-height: 0` + `vertical-align: -0.125em`, which collapses its box in a
 * flex container and leaves the glyph off the text baseline. As text it
 * inherits the pill's font-size and line-height, so its line box is identical
 * to the name's and the two sit exactly level.
 */
const ChipRemove = styled.span`
    flex: none;
    display: inline-flex;
    align-items: center;
    padding: 2px 0.6em 2px 0.15em;
    opacity: 0.75;
    transition: background-color 0.15s ease, opacity 0.15s ease;

    &:hover {
        background-color: rgba(0, 0, 0, 0.3);
        opacity: 1;
    }
`;

const ColorDot = styled.span<{ color: string; selected: boolean }>`
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: ${(props) => props.color};
    cursor: pointer;
    margin-right: 4px;
    /* Selection ring follows the theme: the old hard-coded #333 was invisible
       on the night theme (#1f1f1f) popover surface. The --pl-text token keeps
       the old dark look in the day theme (rgba(0,0,0,0.85)) and turns it into
       a light ring at night (rgba(255,255,255,0.85)). */
    border: ${(props) => (props.selected ? '2px solid var(--pl-text)' : '2px solid transparent')};
    box-sizing: border-box;
`;

const ColorGroup = styled.div`
    display: flex;
    align-items: center;
    margin-left: 8px;
    padding-left: 8px;
    border-left: 1px solid rgba(0, 0, 0, 0.1);
`;

const ColorGroupLabel = styled.span`
    user-select: none;
    color: var(--pl-text-secondary);
    font-size: 0.8rem;
    margin-right: 4px;
`;

/** Layout box of the edit popover: name field + palette + save. */
const EditPanelBox = styled.div`
    width: 260px;
`;

/**
 * The popover body: name field + palette + save. It focuses its name field
 * from a MOUNT effect -- that runs in the popup's own commit, after every ref
 * in that tree is attached -- unlike the Input's `autoFocus` prop, which fires
 * during the child's commitMount, before rc-select's root ref exists, and
 * makes rc-select's unguarded `classes(rootRef)` throw "A DOM element
 * reference is required" on every open.
 *
 * The element is keyed by the edit session (see `editSession` in LabelEditor):
 * rc-trigger caches the popup after the first open, so the key is what makes
 * every open remount -- and therefore refocus -- the panel.
 */
const EditPanel: FC<{ onKeyDown: (event: React.KeyboardEvent) => void }> = ({
    onKeyDown,
    children,
}) => {
    const panelRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const input = panelRef.current ? panelRef.current.querySelector('input') : null;
        if (input) {
            input.focus();
        }
    }, []);
    return (
        <EditPanelBox ref={panelRef} onKeyDown={onKeyDown}>
            {children}
        </EditPanelBox>
    );
};

const EditColorRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 8px;
`;

const EditActions = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
`;

const SuggestionChip = styled.span<{ color: string }>`
    display: inline-block;
    border-radius: 1em;
    padding: 1px 0.6em;
    font-size: 0.85em;
    color: #fff;
    background-color: ${(props) => props.color};
    margin-right: 8px;
    white-space: nowrap;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
`;

/**
 * The suggestion dropdown is portaled outside this component's subtree, so a
 * scoped styled-component cannot reach it -- restyle it through the
 * `dropdownClassName` with these global rules instead.
 *
 * Layout goal: the same wrapping chip cloud the search panel uses
 * (SearchPanel's Group), instead of antd's vertical list. antd.css is injected
 * by style-loader in an order we cannot rely on (see theme/globalStyle.ts), so
 * the rules that fight antd's own `:not(.…-disabled)` hover/active selectors
 * carry the `html` prefix to stay specific enough to win.
 */
const LabelSuggestDropdownStyle = createGlobalStyle`
    html .pl-label-suggest-dropdown .ant-select-dropdown-menu {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 2px;
        padding: 6px;
        max-height: 240px;
    }

    html .pl-label-suggest-dropdown .ant-select-dropdown-menu-item {
        display: inline-flex;
        align-items: center;
        padding: 0;
        overflow: visible;
        height: auto;
        line-height: 1.6;
        background-color: transparent;
    }

    /* antd's hover/active/selected highlights would paint blue/grey blocks
       behind the chips; keep the list background clean and mark the focused
       item on the chip itself instead. */
    html .pl-label-suggest-dropdown
        .ant-select-dropdown-menu-item:hover:not(.ant-select-dropdown-menu-item-disabled),
    html .pl-label-suggest-dropdown
        .ant-select-dropdown-menu-item-active:not(.ant-select-dropdown-menu-item-disabled),
    html .pl-label-suggest-dropdown .ant-select-dropdown-menu-item-selected {
        background-color: transparent;
    }

    html .pl-label-suggest-dropdown
        .ant-select-dropdown-menu-item-active:not(.ant-select-dropdown-menu-item-disabled)
        .pl-suggest-chip {
        outline: 2px solid var(--pl-primary);
        outline-offset: 1px;
    }

    html .pl-label-suggest-dropdown
        .ant-select-dropdown-menu-item:hover:not(.ant-select-dropdown-menu-item-disabled)
        .pl-suggest-chip {
        filter: brightness(1.1);
    }
`;

/**
 * Container for the edit popover's name dropdown.
 *
 * The AutoComplete dropdown normally portals into the shared popup layer
 * (popupLayer.ts) so it fades with the page. Inside the edit popover that
 * would put the dropdown OUTSIDE the popover's popup node, and rc-trigger
 * closes a click-triggered popover on any mousedown outside it -- pressing a
 * suggestion would collapse the popover before the click landed and the pick
 * would be lost. Mount the dropdown inside the popover element instead; the
 * popover itself already lives in the popup layer, so the dropdown stays in
 * the opacity layer too.
 *
 * `node` is whatever rc-select hands to getPopupContainer (a DOM node in
 * practice; the antd typing says React.ReactNode). The activeElement fallback
 * covers a non-DOM argument: the popover input is focused while its dropdown
 * opens.
 */
const getEditDropdownContainer = (node: any): HTMLElement => {
    const fromNode: Element | null =
        node && typeof node.closest === 'function' ? (node as Element) : null;
    const active = document.activeElement;
    const fromActive: Element | null =
        active && typeof active.closest === 'function' ? active : null;
    const start = fromNode || fromActive;
    const popover = start ? start.closest('.ant-popover') : null;
    return popover ? (popover as HTMLElement) : getPopupContainer();
};

interface Props {
    labels: CardLabel[];
    onChange: (labels: CardLabel[]) => void;
    suggestions?: { name: string; color: string }[];
}

export const LabelEditor: FC<Props> = ({ labels, onChange, suggestions }) => {
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
    const [editingIndex, setEditingIndex] = useState<number | undefined>(undefined);
    // Monotonic open counter: keys the edit panel so every open remounts it
    // (rc-trigger caches the popup subtree after the first open).
    const [editSession, setEditSession] = useState(0);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState(LABEL_COLORS[0]);
    // Explicit palette clicks should win over the auto-matched suggestion color.
    // One flag per row: the "new label" row and the "edit label" row otherwise
    // suppress each other's auto-color sync (WYSIWYG bug).
    const [colorTouched, setColorTouched] = useState(false);
    const [editColorTouched, setEditColorTouched] = useState(false);
    const nameColorMap = new Map<string, string>();
    for (const suggestion of suggestions ?? []) {
        nameColorMap.set(suggestion.name, suggestion.color);
    }

    const onNewNameSelect = (value: any) => {
        setNewName(value);
        const matchedColor = nameColorMap.get(value);
        if (matchedColor) {
            setNewColor(matchedColor);
            setColorTouched(false);
        }
    };

    // Keep the palette highlight in sync with the color that will actually be
    // adopted, so the shown color always matches the applied one (WYSIWYG).
    React.useEffect(() => {
        if (colorTouched) {
            return;
        }
        const matchedColor = nameColorMap.get(newName.trim());
        if (matchedColor && matchedColor !== newColor) {
            setNewColor(matchedColor);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newName, suggestions]);

    const addLabel = () => {
        const name = newName.trim();
        if (!name) {
            return;
        }

        if (labels.some((label) => label.name === name)) {
            feedback.toast({ kind: 'warning', content: FEEDBACK_MESSAGES.kanban.labelExists });
            return;
        }

        const color = newColor;
        onChange([...labels, { name, color }]);
        setNewName('');
        setNewColor(LABEL_COLORS[0]);
        setColorTouched(false);
    };

    // Closing the edit popover. Also clears the "user picked a color" flag so
    // the next edit session starts from the WYSIWYG auto-color sync again
    // (previously only saveEdit could close the editor, so it alone reset it).
    const cancelEdit = () => {
        setEditingIndex(undefined);
        setEditColorTouched(false);
    };

    const removeLabel = (index: number) => {
        // A removal shifts every later index: leaving an open edit popover in
        // place would make it edit a different label (or nothing at all).
        cancelEdit();
        onChange(labels.filter((_, i) => i !== index));
    };

    const startEdit = (index: number) => {
        setEditingIndex(index);
        setEditName(labels[index].name);
        setEditColor(labels[index].color);
        setEditColorTouched(false);
        // Bump the session so the panel remounts (rc-trigger caches the popup
        // after the first open) and takes focus again -- see EditPanel.
        setEditSession((session) => session + 1);
    };

    const onEditNameSelect = (value: any) => {
        setEditName(value);
        const matchedColor = nameColorMap.get(value);
        if (matchedColor) {
            setEditColor(matchedColor);
            setEditColorTouched(false);
        }
    };

    // Same WYSIWYG sync for the edit row palette highlight.
    React.useEffect(() => {
        if (editColorTouched || editingIndex === undefined) {
            return;
        }
        const matchedColor = nameColorMap.get(editName.trim());
        if (matchedColor && matchedColor !== editColor) {
            setEditColor(matchedColor);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editName, editingIndex, suggestions]);

    const saveEdit = () => {
        if (editingIndex === undefined) {
            return;
        }

        const name = editName.trim();
        if (!name) {
            return;
        }

        if (labels.some((label, i) => i !== editingIndex && label.name === name)) {
            feedback.toast({ kind: 'warning', content: FEEDBACK_MESSAGES.kanban.labelExists });
            return;
        }

        const color = editColor;
        const next = labels.slice();
        next[editingIndex] = { name, color };
        onChange(next);
        cancelEdit();
    };

    // All board labels not yet on this card, filtered by the typed text and
    // ordered alphabetically (see labelSuggestion.ts). No 8-item cap: an empty
    // input lists the whole board palette, rendered as a wrapping chip cloud
    // (LabelSuggestDropdownStyle) like the search panel's #TAGS group.
    const suggestionOptions = (input: string, excludeLabels: CardLabel[]) =>
        getLabelSuggestions(suggestions ?? [], excludeLabels, input).map(({ name, color }) => (
            <Option key={name} value={name}>
                <SuggestionChip className="pl-suggest-chip" color={color}>
                    {name}
                </SuggestionChip>
            </Option>
        ));

    // Esc cancels just the label edit. The card editor's document-level
    // Ctrl+Enter/Esc listener deliberately ignores keys originating inside
    // `.ant-popover` (it must not close the whole dialog from a nested
    // popup), so the popover owns its own Escape.
    const onEditPanelKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape' || event.keyCode === 27) {
            cancelEdit();
        }
    };

    return (
        <div>
            <LabelSuggestDropdownStyle />
            <LabelCloud>
                {labels.map((label, index) => (
                    <Popover
                        key={index}
                        // Controlled: the popover is open exactly while this
                        // chip is being edited. rc-trigger only reports the
                        // transitions here -- opening = startEdit, any close
                        // (toggle, click outside, save) = cancelEdit.
                        visible={editingIndex === index}
                        trigger="click"
                        placement="bottom"
                        onVisibleChange={(visible) => (visible ? startEdit(index) : cancelEdit())}
                        getPopupContainer={getPopupContainer}
                        content={
                            <EditPanel key={editSession} onKeyDown={onEditPanelKeyDown}>
                                <AutoComplete
                                    style={{ width: '100%' }}
                                    value={editName}
                                    dataSource={suggestionOptions(
                                        editName,
                                        labels.filter((_, i) => i !== editingIndex)
                                    )}
                                    dropdownClassName="pl-label-suggest-dropdown"
                                    notFoundContent="No matching labels"
                                    // NOT the bare popup layer here: see
                                    // getEditDropdownContainer -- inside the
                                    // popover the dropdown must live in the
                                    // popover node or a suggestion press
                                    // closes the popover before its click.
                                    getPopupContainer={getEditDropdownContainer}
                                    // Same pin as the add-row below: optionLabelProp
                                    // must be 'value' or the chip element leaks into
                                    // inputValue as "[object Object]".
                                    optionLabelProp="value"
                                    onSelect={onEditNameSelect}
                                    onChange={(value: any) => setEditName(value)}
                                    filterOption={false}
                                >
                                    <Input size="small" onPressEnter={saveEdit} />
                                </AutoComplete>
                                <EditColorRow>
                                    <ColorGroupLabel>Color:</ColorGroupLabel>
                                    {LABEL_COLORS.map((c) => (
                                        <ColorDot
                                            key={c}
                                            color={c}
                                            selected={c === editColor}
                                            onClick={() => {
                                                setEditColor(c);
                                                setEditColorTouched(true);
                                            }}
                                        />
                                    ))}
                                </EditColorRow>
                                <EditActions>
                                    <Button size="small" type="primary" onClick={saveEdit}>
                                        OK
                                    </Button>
                                </EditActions>
                            </EditPanel>
                        }
                    >
                        <LabelChip color={label.color}>
                            <ChipName title={label.name}>{label.name}</ChipName>
                            <ChipRemove
                                title="Remove label"
                                onClick={(event) => {
                                    // Keep the press from reaching the Popover
                                    // trigger: it would reopen the editor this
                                    // removal is about to close.
                                    event.stopPropagation();
                                    removeLabel(index);
                                }}
                            >
                                &times;
                            </ChipRemove>
                        </LabelChip>
                    </Popover>
                ))}
            </LabelCloud>
            <LabelRow>
                <AutoComplete
                    style={{ width: 280 }}
                    value={newName}
                    dataSource={suggestionOptions(newName, labels)}
                    dropdownClassName="pl-label-suggest-dropdown"
                    notFoundContent="No matching labels"
                    // Portals into the opacity layer (popupLayer.ts).
                    getPopupContainer={getPopupContainer}
                    // optionLabelProp must be 'value' or the chip element
                    // leaks into inputValue as "[object Object]" (regression
                    // covered by LabelEditor.test.tsx).
                    optionLabelProp="value"
                    onSelect={onNewNameSelect}
                    onChange={(value: any) => setNewName(value)}
                    filterOption={false}
                >
                    <Input size="small" placeholder={'Label name'} onPressEnter={addLabel} />
                </AutoComplete>
                <Button
                    size="small"
                    type="primary"
                    icon="plus"
                    style={{ marginLeft: 8 }}
                    disabled={
                        !newName.trim() || labels.some((label) => label.name === newName.trim())
                    }
                    onClick={addLabel}
                >
                    Add
                </Button>
                <ColorGroup>
                    <ColorGroupLabel>Color:</ColorGroupLabel>
                    {LABEL_COLORS.map((c) => (
                        <ColorDot
                            key={c}
                            color={c}
                            selected={c === newColor}
                            onClick={() => {
                                setNewColor(c);
                                setColorTouched(true);
                            }}
                        />
                    ))}
                </ColorGroup>
            </LabelRow>
        </div>
    );
};

export default LabelEditor;
