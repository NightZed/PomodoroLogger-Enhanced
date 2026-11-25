import React from 'react';
import styled, { css } from 'styled-components';
import { ExportOutlined } from '@ant-design/icons';
import { TITLE_BAR_HEIGHT } from '../AppTitleBar/tokens';

/**
 * The shared geometry of the settings page: one column of inset grouped cards,
 * each row holding its label on the left and its control in a right-hand rail.
 *
 * The column is capped at 880px rather than stretched across the pane: the
 * reference macOS panes keep rows short enough that the eye can travel from a
 * label to its control without scanning half the window, and 880px is the
 * point where the three slider groups and the data button cluster still fit
 * on one line at the default 1440px window.
 */
export const SettingsContent = styled.div<{ $center?: boolean }>`
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
    padding: 28px 0 48px;

    > section:first-of-type > h3 {
        margin-top: 0;
    }

    /*
     * The about pane has no list to scan: a short card floating at the top of
     * an empty pane reads as unfinished. The minimum height matches the pane
     * exactly (the window minus the title bar), so the card sits in the middle
     * of the visible area while a taller card still scrolls normally.
     */
    ${({ $center }) =>
        $center &&
        css`
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-height: calc(100vh - ${TITLE_BAR_HEIGHT}px);
            box-sizing: border-box;
        `}

    @media (max-width: 820px) {
        padding-top: 16px;
    }
`;

export const SettingsSection = styled.section``;

export const GroupTitle = styled.h3`
    margin: 28px 4px 8px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--pl-text-secondary);
`;

/** The inset grouped list: one rounded surface per subject. */
export const Card = styled.div`
    border: 1px solid var(--pl-border);
    border-radius: 10px;
    background-color: var(--pl-bg-elevated);
    overflow: hidden;
`;

/**
 * A hairline between adjacent rows, inset on both sides the way a macOS
 * grouped list draws it. Kept as a pseudo element so the line never takes part
 * in layout (a real border would shift every row by a pixel).
 *
 * Every row — plain, slider, shortcut — renders through `RowShell`, so the
 * `& + &` selector also draws the line between rows of different shapes (a
 * wallpaper action row followed by its opacity slider, for instance).
 */
export const rowSeparator = css`
    position: relative;

    & + &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 16px;
        right: 16px;
        height: 1px;
        background-color: var(--pl-border);
        pointer-events: none;
    }
`;

const RowShell = styled.div`
    ${rowSeparator}
`;

interface RowProps {
    title?: React.ReactNode;
    description?: React.ReactNode;
    control?: React.ReactNode;
    /** Lets a button cluster use the remaining width instead of the 300px rail. */
    wide?: boolean;
}

const RowBody = styled.div`
    display: flex;
    align-items: center;
    gap: 24px;
    min-height: 48px;
    padding: 10px 16px;

    @media (max-width: 820px) {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 14px 16px;
    }
`;

const Label = styled.div`
    flex: 1 1 auto;
    min-width: 0;
`;

const RowTitle = styled.div`
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--pl-text);
`;

const RowDescription = styled.div`
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--pl-text-secondary);
`;

const Control = styled.div<{ $wide: boolean }>`
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: ${({ $wide }) => ($wide ? '0' : '300px')};
    flex-wrap: ${({ $wide }) => ($wide ? 'wrap' : 'nowrap')};
    ${({ $wide }) => ($wide ? 'flex: 0 1 auto;' : '')}

    @media (max-width: 820px) {
        justify-content: flex-start;
        width: 100%;
        min-width: 0;
        flex-wrap: wrap;
    }
`;

/**
 * One option row. `title` and `description` make up the label column; the
 * control column always ends at the card's right padding, so switches,
 * segmented controls and slider readouts line up down the whole page.
 */
export const SettingsRow: React.FunctionComponent<RowProps> = ({
    title,
    description,
    control,
    wide = false,
}) => (
    <RowShell>
        <RowBody>
            {(title || description) && (
                <Label>
                    {title && <RowTitle>{title}</RowTitle>}
                    {description && <RowDescription>{description}</RowDescription>}
                </Label>
            )}
            {control && <Control $wide={wide}>{control}</Control>}
        </RowBody>
    </RowShell>
);

interface SliderRowProps {
    title: React.ReactNode;
    /** Sits on the title's line, to its right. */
    description?: React.ReactNode;
    control: React.ReactNode;
}

const SliderBody = styled.div`
    padding: 11px 16px 13px;
`;

const SliderHeader = styled.div`
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 7px;

    @media (max-width: 820px) {
        flex-direction: column;
        gap: 2px;
    }
`;

const SliderTitle = styled.div`
    flex: 0 0 auto;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--pl-text);
`;

const SliderNote = styled.div`
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--pl-text-secondary);
`;

const SliderControl = styled.div`
    width: 100%;
`;

/**
 * A slider row: title (and its note) on one line, the track underneath it
 * spanning the card. The note is inline with the title rather than under it,
 * so the control starts higher and a stack of sliders stays compact.
 */
export const SliderRow: React.FunctionComponent<SliderRowProps> = ({
    title,
    description,
    control,
}) => (
    <RowShell>
        <SliderBody>
            <SliderHeader>
                <SliderTitle>{title}</SliderTitle>
                {description && <SliderNote>{description}</SliderNote>}
            </SliderHeader>
            <SliderControl>{control}</SliderControl>
        </SliderBody>
    </RowShell>
);

/** A button cluster inside a `wide` row: wraps instead of shrinking. */
export const ControlCluster = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;

    @media (max-width: 820px) {
        justify-content: flex-start;
    }
`;

interface LinkRowProps {
    title: React.ReactNode;
    /** Secondary text before the arrow (the licence name, for instance). */
    value?: React.ReactNode;
    onClick: () => void;
}

const LinkBody = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 10px 16px;
    border: none;
    background: none;
    color: var(--pl-text);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;

    &:hover {
        background-color: var(--pl-bg-hover);
    }

    &:focus-visible {
        outline: 2px solid var(--pl-primary);
        outline-offset: -2px;
    }
`;

const LinkValue = styled.span`
    font-size: 12px;
    font-weight: 400;
    color: var(--pl-text-secondary);
`;

/** Stays on the far right whether or not the row has a value. */
const LinkArrow = styled(ExportOutlined)`
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 12px;
    color: var(--pl-text-tertiary);
`;

/**
 * A whole row that opens something outside the app. The arrow is decorative:
 * the button's name is the title, and the value is already read out as part of
 * the same button, so a screen reader hears "Release notes, link" in one go.
 */
export const LinkRow: React.FunctionComponent<LinkRowProps> = ({ title, value, onClick }) => (
    <RowShell>
        <LinkBody type="button" onClick={onClick}>
            <span>{title}</span>
            {value && <LinkValue>{value}</LinkValue>}
            <LinkArrow aria-hidden="true" />
        </LinkBody>
    </RowShell>
);
