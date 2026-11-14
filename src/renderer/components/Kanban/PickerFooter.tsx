import styled from 'styled-components';

/**
 * The button row at the bottom of the pickers.
 *
 * It belongs to the content rather than to `AppModal`'s `footer` prop because
 * the list picker's confirm button reads the list selection that lives inside
 * that content. `12px` and the `8px` gap are what antd puts around a real
 * footer, so a picker with this row and one with `footer` are the same height.
 */
export const PickerFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
`;
