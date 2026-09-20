export const thinScrollBar = `
    ::-webkit-scrollbar {
        width: 4px;
        height: 4px;
        background-color: transparent;
    }
    ::-webkit-scrollbar-track {
        width: 4px;
        background-color: transparent;
    }
    ::-webkit-scrollbar-thumb {
        width: 4px;
        background-color: var(--pl-scrollbar-thumb);
        border-radius: 4px;
    }
`;

export const fatScrollBar = `
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
        background-color: var(--pl-bg-sunken);
    }
    ::-webkit-scrollbar-thumb {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-thumb);
    }
    ::-webkit-scrollbar-track {
        border-radius: 8px;
        background-color: var(--pl-scrollbar-track);
    }
`;

export const tabMaxHeight = ` 
    max-height: calc(100vh - 45px);
`;
