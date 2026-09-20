import styled from 'styled-components';

// Shared style for the "Created: ..." timestamp shown under board/card titles
// and inside their editors, keeping all four places visually consistent.
export const CreatedTime = styled.div`
    color: var(--pl-text-tertiary);
    font-size: 11px;
    line-height: 1.2;
`;

// Same visual treatment as CreatedTime, reused for the completed timestamp of
// cards that sit in (or have visited) the board's done list.
export const CompletedTime = styled(CreatedTime)``;
