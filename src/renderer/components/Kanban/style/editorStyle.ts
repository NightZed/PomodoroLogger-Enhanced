import styled from 'styled-components';
import { thinScrollBar } from '../../../style/scrollbar';

export const EditorContainer = styled.div`
    .ant-form-item {
        margin-bottom: 8px;
    }

    textarea {
        ${thinScrollBar}
    }
`;
