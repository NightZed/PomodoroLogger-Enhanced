import React from 'react';
import styled from 'styled-components';

interface Props {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Required: the switch has no visible label of its own. */
    label: string;
    disabled?: boolean;
}

const Track = styled.button<{ $checked: boolean; $disabled: boolean }>`
    position: relative;
    flex: 0 0 auto;
    width: 38px;
    height: 22px;
    padding: 0;
    border: 1px solid ${({ $checked }) => ($checked ? 'var(--pl-accent)' : 'var(--pl-border)')};
    border-radius: 11px;
    background-color: ${({ $checked }) => ($checked ? 'var(--pl-accent)' : 'var(--pl-bg-sunken)')};
    cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
    opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
    transition:
        background-color 0.16s,
        border-color 0.16s;
    -webkit-app-region: no-drag;

    &::after {
        content: '';
        position: absolute;
        top: 1px;
        left: 1px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: #fff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transform: translateX(${({ $checked }) => ($checked ? '16px' : '0')});
        transition: transform 0.16s ease;
    }

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: 2px;
    }
`;

/**
 * The settings page's switch: a 38x22 track with an 18px white knob and the
 * accent colour for "on", styled after the macOS switch.
 *
 * A real `<button role="switch">` rather than antd's `Switch`: the switch only
 * appears on this page, and owning the DOM keeps the track height, knob travel
 * and focus ring under our own control instead of a specificity fight with
 * antd's generated styles. Enter and Space already toggle a button, so nothing
 * has to forward keys here.
 */
const SettingSwitch: React.FunctionComponent<Props> = ({ checked, onChange, label, disabled }) => (
    <Track
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        $checked={checked}
        $disabled={!!disabled}
        onClick={() => onChange(!checked)}
    />
);

export default SettingSwitch;
