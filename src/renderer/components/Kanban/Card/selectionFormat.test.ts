import { findFormatBlock } from './selectionFormat';

describe('findFormatBlock', () => {
    it('returns null for an empty selection', () => {
        expect(findFormatBlock('**bold**', 2, 2, '**', '**')).toBeNull();
    });

    it('unwraps a fully selected bold block (scenario A)', () => {
        expect(findFormatBlock('**bold**', 0, 8, '**', '**')).toEqual({
            blockStart: 0,
            blockEnd: 8,
            content: 'bold',
        });
    });

    it('unwraps a selection tight inside the markers (scenario B)', () => {
        expect(findFormatBlock('**bold**', 2, 6, '**', '**')).toEqual({
            blockStart: 0,
            blockEnd: 8,
            content: 'bold',
        });
    });

    it('does not unwrap a partial selection that is not tight to the markers', () => {
        expect(findFormatBlock('**bold**', 3, 5, '**', '**')).toBeNull();
    });

    it('does not unwrap on a caret-only position inside a block (scenario C removed)', () => {
        expect(findFormatBlock('**bold**', 3, 3, '**', '**')).toBeNull();
    });

    it('does not mistake bold markers for an italic block', () => {
        // 选区紧贴 ** 内部，点斜体按钮不得命中
        expect(findFormatBlock('**bold**', 2, 6, '*', '*')).toBeNull();
        // 选区整体就是 **bold**，点斜体按钮不得命中
        expect(findFormatBlock('**bold**', 0, 8, '*', '*')).toBeNull();
    });

    it('unwraps italic inside single asterisks', () => {
        expect(findFormatBlock('*it*', 1, 3, '*', '*')).toEqual({
            blockStart: 0,
            blockEnd: 4,
            content: 'it',
        });
    });

    it('unwraps strike-through', () => {
        expect(findFormatBlock('~~del~~', 2, 5, '~~', '~~')).toEqual({
            blockStart: 0,
            blockEnd: 7,
            content: 'del',
        });
    });

    it('finds a block that sits after other content', () => {
        const content = 'prefix **bold** suffix';
        // 'bold' 位于索引 9..13，左右紧贴 **：
        expect(findFormatBlock(content, 9, 13, '**', '**')).toEqual({
            blockStart: 7,
            blockEnd: 15,
            content: 'bold',
        });
    });
});
