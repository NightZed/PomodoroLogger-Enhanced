import * as React from 'react';
import Icon, {
    BellOutlined,
    BorderOutlined,
    BulbOutlined,
    CaretRightOutlined,
    CheckOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    DownOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    GithubOutlined,
    HistoryOutlined,
    InfoCircleOutlined,
    LinkOutlined,
    LockOutlined,
    MenuOutlined,
    MinusCircleOutlined,
    MinusOutlined,
    MoreOutlined,
    PauseOutlined,
    PlusOutlined,
    ProjectOutlined,
    PushpinOutlined,
    QuestionCircleOutlined,
    SearchOutlined,
    SettingOutlined,
    SkinOutlined,
    SwapOutlined,
    SwitcherOutlined,
    TagsOutlined,
    UnlockOutlined,
    UpOutlined,
} from '@ant-design/icons';

/**
 * antd v3 -> v5 icon bridge.
 *
 * antd v3's `<Icon type="xxx" />` / `Button icon="xxx"` string API is gone in
 * v5: icons are now explicit components from `@ant-design/icons`. Every call
 * site in this app used to spell names as strings, so instead of touching 30+
 * files with per-icon imports, they all go through this one map.
 *
 * Custom SVG assets (`component={XxxSvg}`) keep working via `IconComponent`,
 * which wraps `@ant-design/icons`' generic `Icon` (same `component` prop API
 * as antd v3's `Icon`).
 */
export { Icon as IconComponent };

const MAP = {
    bell: BellOutlined,
    border: BorderOutlined,
    bulb: BulbOutlined,
    'caret-right': CaretRightOutlined,
    check: CheckOutlined,
    'check-circle': CheckOutlined,
    'clock-circle': ClockCircleOutlined,
    close: CloseOutlined,
    'close-circle': CloseOutlined,
    delete: DeleteOutlined,
    down: DownOutlined,
    'exclamation-circle': InfoCircleOutlined,
    'fullscreen-exit': FullscreenExitOutlined,
    fullscreen: FullscreenOutlined,
    github: GithubOutlined,
    history: HistoryOutlined,
    'info-circle': InfoCircleOutlined,
    link: LinkOutlined,
    lock: LockOutlined,
    menu: MenuOutlined,
    'minus-circle-o': MinusCircleOutlined,
    minus: MinusOutlined,
    more: MoreOutlined,
    pause: PauseOutlined,
    plus: PlusOutlined,
    project: ProjectOutlined,
    pushpin: PushpinOutlined,
    question: QuestionCircleOutlined,
    search: SearchOutlined,
    setting: SettingOutlined,
    skin: SkinOutlined,
    swap: SwapOutlined,
    switcher: SwitcherOutlined,
    tags: TagsOutlined,
    unlock: UnlockOutlined,
    up: UpOutlined,
} as const;

export type AntdIconType = keyof typeof MAP;

interface AntdIconProps {
    type?: AntdIconType | string;
    style?: React.CSSProperties;
    className?: string;
    onClick?: (e: any) => void;
    component?: any;
    title?: string;
}

/** Maps an antd v3 `Button icon="xxx"` string to a v5 icon node. */
export const buttonIcon = (type?: AntdIconType | string): React.ReactNode => {
    if (!type) {
        return undefined;
    }
    if (typeof type !== 'string') {
        return type;
    }
    const C = (MAP as any)[type as string];
    return C ? <C /> : undefined;
};

/** Drop-in for antd v3 `<Icon type=... component=... />`. */
export const AntdIcon = React.forwardRef<HTMLSpanElement, AntdIconProps>(
    ({ type, component, ...rest }, ref) => {
        if (component) {
            return <Icon component={component as any} ref={ref} {...(rest as any)} />;
        }
        const C = type ? (MAP as any)[type as string] : undefined;
        if (!C) {
            return null;
        }
        return <C ref={ref} {...rest} />;
    }
);

AntdIcon.displayName = 'AntdIcon';
