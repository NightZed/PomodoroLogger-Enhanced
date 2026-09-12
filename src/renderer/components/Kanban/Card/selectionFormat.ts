export interface FormatBlock {
    blockStart: number;
    blockEnd: number;
    content: string;
}

const isItalicMarker = (prefix: string) => prefix === '*';

// 斜体 `*` 与粗体 `**` 存在歧义：匹配斜体定界符时需跳过 `**` 边界，
// 避免在 `**粗体**` 中被误判为斜体块。
const couldBeItalicBoundary = (prefix: string, left: string, right: string) =>
    isItalicMarker(prefix) && (left.endsWith('**') || right.startsWith('**'));

/**
 * 从选区出发，判断选中文本是否已是一对 `prefix`/`suffix` 定界符包裹的格式块。
 *
 * 仅支持两种交互（无选区不处理）：
 * - 场景A：选区本身就是完整格式块 `prefix + text + suffix`；
 * - 场景B：选区紧贴在一对定界符内侧 `prefix + |text| + suffix`。
 *
 * 命中时返回完整块（含定界符）的区间与内部纯文本，供解包使用。
 */
export const findFormatBlock = (
    content: string,
    selStart: number,
    selEnd: number,
    prefix: string,
    suffix: string
): FormatBlock | null => {
    if (selStart >= selEnd) {
        return null;
    }

    const selected = content.slice(selStart, selEnd);

    // 场景A：选区本身就是 "prefix + text + suffix"
    if (
        selected.startsWith(prefix) &&
        selected.endsWith(suffix) &&
        !couldBeItalicBoundary(prefix, selected, selected)
    ) {
        return {
            blockStart: selStart,
            blockEnd: selEnd,
            content: selected.slice(prefix.length, selected.length - suffix.length),
        };
    }

    // 场景B：选区紧贴在一对定界符内侧 "…prefix|text|suffix…"
    const left = content.slice(0, selStart);
    const right = content.slice(selEnd);
    if (
        left.endsWith(prefix) &&
        right.startsWith(suffix) &&
        !couldBeItalicBoundary(prefix, left, right)
    ) {
        return {
            blockStart: selStart - prefix.length,
            blockEnd: selEnd + suffix.length,
            content: selected,
        };
    }

    return null;
};
