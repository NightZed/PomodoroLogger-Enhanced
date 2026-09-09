import React, { FC, useState } from 'react';
import styled from 'styled-components';
import { Button, Input, Icon } from 'antd';
import { CardLabel } from '../type';

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

interface Props {
    labels: CardLabel[];
    onChange: (labels: CardLabel[]) => void;
}

export const LabelEditor: FC<Props> = ({ labels, onChange }) => {
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
    const [editingIndex, setEditingIndex] = useState<number | undefined>(undefined);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState(LABEL_COLORS[0]);

    const addLabel = () => {
        const name = newName.trim();
        if (!name) {
            return;
        }

        onChange([...labels, { name, color: newColor }]);
        setNewName('');
        setNewColor(LABEL_COLORS[0]);
    };

    const removeLabel = (index: number) => {
        onChange(labels.filter((_, i) => i !== index));
    };

    const startEdit = (index: number) => {
        setEditingIndex(index);
        setEditName(labels[index].name);
        setEditColor(labels[index].color);
    };

    const saveEdit = () => {
        if (editingIndex === undefined) {
            return;
        }

        const name = editName.trim();
        if (!name) {
            return;
        }

        const next = labels.slice();
        next[editingIndex] = { name, color: editColor };
        onChange(next);
        setEditingIndex(undefined);
    };

    return (
        <div>
            {labels.map((label, index) =>
                editingIndex === index ? (
                    <LabelRow key={index}>
                        <Input
                            size="small"
                            style={{ width: 120, marginRight: 8 }}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onPressEnter={saveEdit}
                        />
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
                                    onClick={() => setEditColor(c)}
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
                <Input
                    size="small"
                    style={{ width: 160 }}
                    placeholder={'Label name'}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onPressEnter={addLabel}
                />
                <Button
                    size="small"
                    type="primary"
                    icon="plus"
                    style={{ marginLeft: 8 }}
                    disabled={!newName.trim()}
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
                            onClick={() => setNewColor(c)}
                        />
                    ))}
                </ColorGroup>
            </LabelRow>
        </div>
    );
};

export default LabelEditor;
