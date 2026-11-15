import styled from 'styled-components';

/**
 * The bordered badge used across the settings page: the key combinations of
 * the read-only shortcut table and the live value readout of every slider
 * (see `PreviewSlider`).
 */
export const KeyBadge = styled.kbd`
    display: inline-block;
    min-width: 20px;
    padding: 1px 6px;
    border: 1px solid var(--pl-border);
    border-radius: 4px;
    background-color: var(--pl-bg-elevated);
    color: var(--pl-text);
    font-family: inherit;
    font-size: 12px;
    text-align: center;
    white-space: nowrap;
`;
