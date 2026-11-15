import styled from 'styled-components';

/**
 * The button row at the bottom of this group of dialogs: the History day
 * editor, the board's unassigned panel, and every picker opened from them.
 *
 * It belongs to the content rather than to `AppModal`'s `footer` prop for two
 * reasons. The list picker's confirm button reads a selection that lives
 * inside the content, and a row inside the fixed-height body is what keeps
 * these dialogs exactly the same height: the editor used to put its buttons in
 * antd's footer while the pickers kept theirs in the body, which left the
 * picker one row shorter and exposed a band of the editor underneath.
 *
 * `12px` above and the `8px` gap are what antd puts around a real footer.
 */
export const PickerFooter = styled.div`
    display: flex;
    flex: none;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
`;
