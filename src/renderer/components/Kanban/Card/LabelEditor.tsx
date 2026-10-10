import React, { FC, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { AutoComplete, Button, Icon, Input } from 'antd';
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

const LabelChip = styled.span<{ color: string }>`
    display: inline-block;
    border-radius: 1em;
    padding: 2px 0.7em;
    font-size: 0.9em;
    color: #fff;
    background-color: ${(props) => props.color};
    margin-right: 8px;
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ColorDot = styled.span<{ color: string; selected: boolean }>`
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: ${(props) => props.color};
    cursor: pointer;
    margin-right: 4px;
    border: ${(props) => (props.selected ? '2px solid #333' : '2px solid transparent')};
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

interface Props {
    labels: CardLabel[];
    onChange: (labels: CardLabel[]) => void;
    suggestions?: { name: string; color: string }[];
}

export const LabelEditor: FC<Props> = ({ labels, onChange, suggestions }) => {
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
    const [editingIndex, setEditingIndex] = useState<number | undefined>(undefined);
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

    const removeLabel = (index: number) => {
        onChange(labels.filter((_, i) => i !== index));
    };

    const startEdit = (index: number) => {
        setEditingIndex(index);
        setEditName(labels[index].name);
        setEditColor(labels[index].color);
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
        setEditingIndex(undefined);
        setEditColorTouched(false);
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

    return (
        <div>
            <LabelSuggestDropdownStyle />
            {labels.map((label, index) =>
                editingIndex === index ? (
                    <LabelRow key={index}>
                        <AutoComplete
                            size="small"
                            style={{ width: 280, marginRight: 8 }}
                            value={editName}
                            dataSource={suggestionOptions(
                                editName,
                                labels.filter((_, i) => i !== editingIndex)
                            )}
                            dropdownClassName="pl-label-suggest-dropdown"
                            notFoundContent="No matching labels"
                            // Without this the dropdown portals to <body> and
                            // escapes Application's Content layer (opacity:
                            // contentOpacity), staying fully opaque while the
                            // page fades. Mount it in the shared popup layer
                            // like every other overlay (popupLayer.ts).
                            getPopupContainer={getPopupContainer}
                            // AutoComplete's default `optionLabelProp` is
                            // 'children', but our Option children are colored
                            // <SuggestionChip> elements. rc-select then uses
                            // that element as the combobox's inputValue,
                            // rendering "[object Object]" in the input and
                            // warning that inputValue must be a string. The
                            // plain label lives in `value` (the name), so
                            // read it from there.
                            optionLabelProp="value"
                            onSelect={onEditNameSelect}
                            onChange={(value: any) => setEditName(value)}
                            filterOption={false}
                        >
                            <Input size="small" onPressEnter={saveEdit} />
                        </AutoComplete>
                        <Button size="small" type="primary" onClick={saveEdit}>
                            OK
                        </Button>
                        <ColorGroup>
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
                        </ColorGroup>
                    </LabelRow>
                ) : (
                    <LabelRow key={index}>
                        <LabelChip color={label.color} onClick={() => startEdit(index)}>
                            {label.name}
                        </LabelChip>
                        <Icon
                            type="edit"
                            style={{ marginRight: 8, cursor: 'pointer' }}
                            onClick={() => startEdit(index)}
                        />
                        <Icon
                            type="delete"
                            style={{ cursor: 'pointer' }}
                            onClick={() => removeLabel(index)}
                        />
                    </LabelRow>
                )
            )}
            <LabelRow>
                <AutoComplete
                    style={{ width: 280 }}
                    value={newName}
                    dataSource={suggestionOptions(newName, labels)}
                    dropdownClassName="pl-label-suggest-dropdown"
                    notFoundContent="No matching labels"
                    // Portals into the opacity layer, see the edit row above.
                    getPopupContainer={getPopupContainer}
                    // See the edit row above: optionLabelProp must be 'value'
                    // or the chip element leaks into inputValue as
                    // "[object Object]".
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
