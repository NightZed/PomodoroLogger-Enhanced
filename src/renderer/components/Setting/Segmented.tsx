import React from 'react';
import styled from 'styled-components';

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
}

interface Props<T extends string> {
    options: SegmentedOption<T>[];
    value: T | undefined;
    onChange: (value: T) => void;
    /** Accessible name of the group; the page has several of these. */
    ariaLabel: string;
}

const Track = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background-color: var(--pl-bg-sunken);
`;

const Segment = styled.button<{ $active: boolean }>`
    padding: 3px 10px;
    border: none;
    border-radius: 6px;
    background-color: ${({ $active }) => ($active ? 'var(--pl-bg-elevated)' : 'transparent')};
    box-shadow: ${({ $active }) => ($active ? '0 0 0 1px var(--pl-border)' : 'none')};
    color: ${({ $active }) => ($active ? 'var(--pl-text)' : 'var(--pl-text-secondary)')};
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    cursor: pointer;
    transition:
        background-color 0.15s,
        color 0.15s;

    &:hover {
        color: var(--pl-text);
    }

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: 1px;
    }
`;

/**
 * A macOS-style segmented control.
 *
 * Built from plain buttons instead of antd's `Segmented` for the same reason
 * `SettingNav` is: the antd component brings its own palette and selected-item
 * styling, which would all have to be overridden here, while these options only
 * need a label and a pressed state. `aria-pressed` keeps the buttons the
 * control's accessible interface, so keyboard users get each option as a
 * toggle and nothing here needs a roving tabindex.
 */
const Segmented = <T extends string>({ options, value, onChange, ariaLabel }: Props<T>) => (
    <Track role="group" aria-label={ariaLabel}>
        {options.map((option) => (
            <Segment
                key={option.value}
                type="button"
                $active={value === option.value}
                aria-pressed={value === option.value}
                onClick={() => onChange(option.value)}
            >
                {option.label}
            </Segment>
        ))}
    </Track>
);

export default Segmented;
