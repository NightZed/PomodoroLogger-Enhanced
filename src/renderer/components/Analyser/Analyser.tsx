import React from 'react';
import styled from 'styled-components';
import { RootState } from '../../reducers';
import { HistoryActionCreatorTypes } from '../History/action';
import { fatScrollBar, tabMaxHeight } from '../../style/scrollbar';
import { SearchBar } from '../Kanban/SearchBar';

const Container = styled.div`
    position: relative;
    max-width: 800px;
    color: var(--pl-text);
    margin: 0 auto;
    padding: 2em;
    overflow: auto;
    ${tabMaxHeight}
    ${fatScrollBar}
`;

interface Props extends RootState, HistoryActionCreatorTypes {}
export const Analyser: React.FC<Props> = React.memo(() => {
    return (
        <Container>
            <SearchBar />
        </Container>
    );
});
