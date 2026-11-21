import styled from 'styled-components';

export const BadgeHolder = styled.div`
    /* One row, never wrapping: the board brief card puts the accuracy readout
       at the far right of the same line as the pomodoro dot and time badge.
       They used to be inline SVGs, which wrapped as soon as the row was full. */
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    min-height: 20px;

    & > svg {
        flex: none;
        /* The 2px bottom margin on the SVGs nudges their inline baseline; with
           flex centering it would move the whole row up by 1px instead. */
        margin-bottom: 0 !important;
    }

    &.collapsed {
        transform-origin: 0 50%;
        transform: scale(0.93, 0.93);
        min-height: 0;

        & > .pomodoro-dot {
            transform-origin: 50% 50%;
            transform: scale(0.9, 0.9);
        }

        & > svg:first-child:not(.pomodoro-dot) {
            margin-left: 0 !important;
        }
    }
`;
