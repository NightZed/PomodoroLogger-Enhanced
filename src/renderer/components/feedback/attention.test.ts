import { planWindowAttention, WindowAttentionFlags } from './attention';
import type { AttentionKind } from './attention';

const NORMAL: WindowAttentionFlags = { inTray: false, minimize: false, compact: false };
const MINI: WindowAttentionFlags = { inTray: false, minimize: true, compact: false };
const COMPACT: WindowAttentionFlags = { inTray: false, minimize: false, compact: true };
const TRAY_NORMAL: WindowAttentionFlags = { inTray: true, minimize: false, compact: false };
const TRAY_COMPACT: WindowAttentionFlags = { inTray: true, minimize: false, compact: true };
const TRAY_MINI: WindowAttentionFlags = { inTray: true, minimize: true, compact: false };

const CASES: Array<{
    flags: WindowAttentionFlags;
    kind: AttentionKind;
    expected: 'normal' | 'focus' | 'none';
    why: string;
}> = [
    {
        flags: NORMAL,
        kind: 'confirm',
        expected: 'none',
        why: '普通窗口能显示确认框，不动窗口',
    },
    {
        flags: NORMAL,
        kind: 'error',
        expected: 'none',
        why: '普通窗口能显示错误通知，不动窗口',
    },
    {
        flags: NORMAL,
        kind: 'fullscreen',
        expected: 'focus',
        why: '普通窗口的全屏报错只聚焦，不缩回 1440x960',
    },
    {
        flags: COMPACT,
        kind: 'confirm',
        expected: 'none',
        why: '紧凑窗口放得下确认框',
    },
    {
        flags: COMPACT,
        kind: 'error',
        expected: 'none',
        why: '紧凑窗口放得下错误通知',
    },
    {
        flags: COMPACT,
        kind: 'fullscreen',
        expected: 'normal',
        why: '紧凑窗口放不下全屏报错，要恢复 1440x960',
    },
    {
        flags: MINI,
        kind: 'confirm',
        expected: 'normal',
        why: '迷你窗口隐藏了弹窗根节点，确认框必须恢复普通窗口',
    },
    {
        flags: MINI,
        kind: 'error',
        expected: 'normal',
        why: '错误通知比迷你窗口宽，必须恢复普通窗口',
    },
    {
        flags: MINI,
        kind: 'fullscreen',
        expected: 'normal',
        why: '迷你窗口放不下报错页',
    },
    {
        flags: TRAY_NORMAL,
        kind: 'confirm',
        expected: 'focus',
        why: '从普通窗口收进托盘的，恢复原尺寸并聚焦',
    },
    {
        flags: TRAY_NORMAL,
        kind: 'error',
        expected: 'focus',
        why: '同上，错误通知也要把窗口带回来',
    },
    {
        flags: TRAY_NORMAL,
        kind: 'fullscreen',
        expected: 'focus',
        why: '托盘里的普通尺寸窗口够显示报错页',
    },
    {
        flags: TRAY_COMPACT,
        kind: 'confirm',
        expected: 'focus',
        why: '从紧凑窗口收进托盘的，保持 370x490，放得下确认框',
    },
    {
        flags: TRAY_COMPACT,
        kind: 'error',
        expected: 'focus',
        why: '紧凑尺寸放得下错误通知',
    },
    {
        flags: TRAY_COMPACT,
        kind: 'fullscreen',
        expected: 'normal',
        why: '紧凑尺寸放不下报错页，恢复 1440x960',
    },
    {
        flags: TRAY_MINI,
        kind: 'confirm',
        expected: 'normal',
        why: '从迷你条收进托盘的，先恢复普通窗口再弹确认框',
    },
    {
        flags: TRAY_MINI,
        kind: 'error',
        expected: 'normal',
        why: '迷你条恢复后仍放不下通知，要恢复普通窗口',
    },
    {
        flags: TRAY_MINI,
        kind: 'fullscreen',
        expected: 'normal',
        why: '迷你条放不下报错页',
    },
];

describe('planWindowAttention', () => {
    it.each(CASES)('$why', ({ flags, kind, expected }) => {
        expect({ flags, kind, action: planWindowAttention(flags, kind) }).toEqual({
            flags,
            kind,
            action: expected,
        });
    });
});
