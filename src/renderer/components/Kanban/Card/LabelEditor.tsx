import React, { FC, useState } from 'react';
import styled from 'styled-components';
import { AutoComplete, Button, Icon, Input, message } from 'antd';
import { CardLabel } from '../type';

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
    color: #777;
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
            message.warning('标签已存在 / Label already exists');
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
            message.warning('标签已存在 / Label already exists');
            return;
        }

        const color = editColor;
        const next = labels.slice();
        next[editingIndex] = { name, color };
        onChange(next);
        setEditingIndex(undefined);
        setEditColorTouched(false);
    };

    const suggestionOptions = (exclude: string) =>
        Array.from(nameColorMap.entries())
            .filter(
                ([name]) => name !== exclude && name.toLowerCase().includes(exclude.toLowerCase())
            )
            .slice(0, 8)
            .map(([name, color]) => (
                <Option key={name} value={name}>
                    <SuggestionChip color={color}>{name}</SuggestionChip>
                </Option>
            ));

    return (
        <div>
            {labels.map((label, index) =>
                editingIndex === index ? (
                    <LabelRow key={index}>
                        <AutoComplete
                            size="small"
                            style={{ width: 160, marginRight: 8 }}
                            value={editName}
                            dataSource={suggestionOptions(editName)}
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
                    style={{ width: 160 }}
                    value={newName}
                    dataSource={suggestionOptions(newName)}
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
