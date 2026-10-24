/**
 * `&` before every pseudo-element is required: styled-components v5 (stylis 3)
 * silently prepended it to nested selectors starting with `:`, v6 (stylis 4)
 * does not. Without it `::-webkit-scrollbar` compiles to a *descendant*
 * selector (`.card ::-webkit-scrollbar`) and stops styling the scroll container
 * itself.
 */
export const thinScrollBar = `
    &::-webkit-scrollbar {
        width: 4px;
        height: 4px;
        background-color: transparent;
    }
    &::-webkit-scrollbar-track {
        width: 4px;
        background-color: transparent;
    }
    &::-webkit-scrollbar-thumb {
        width: 4px;
        background-color: var(--pl-scrollbar-thumb);
        border-radius: 4px;
    }
`;

export const fatScrollBar = `
    &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: var(--pl-bg-sunken);
    }
    &::-webkit-scrollbar-thumb {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-thumb);
    }
    &::-webkit-scrollbar-track {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-track);
    }
`;

export const tabMaxHeight = ` 
    max-height: calc(100vh - 45px);
`;
