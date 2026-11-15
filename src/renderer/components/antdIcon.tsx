import * as React from 'react';
import Icon, {
    AlignLeftOutlined,
    AppstoreOutlined,
    BarChartOutlined,
    BellOutlined,
    BorderOutlined,
    BulbOutlined,
    CaretRightOutlined,
    CheckOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    DownOutlined,
    ExpandOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    FileTextOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    GithubOutlined,
    HistoryOutlined,
    InboxOutlined,
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
    TableOutlined,
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
    'align-left': AlignLeftOutlined,
    /** Board cards laid out in a grid, the counterpart of `table`. */
    appstore: AppstoreOutlined,
    'bar-chart': BarChartOutlined,
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
    expand: ExpandOutlined,
    'exclamation-circle': InfoCircleOutlined,
    /**
     * A board's visibility toggle shows the icon of the *action*, not of the
     * current state: a shown board offers "hide" (crossed eye), a hidden one
     * offers "show" (open eye).
     */
    'eye-invisible': EyeInvisibleOutlined,
    eye: EyeOutlined,
    'file-text': FileTextOutlined,
    'fullscreen-exit': FullscreenExitOutlined,
    fullscreen: FullscreenOutlined,
    github: GithubOutlined,
    history: HistoryOutlined,
    /** Sessions that no card counts: the "inbox" of a board. */
    inbox: InboxOutlined,
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
    /** Rows and columns: the table view of the overview. */
    table: TableOutlined,
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
    /** Accessible name for an icon that acts as a control (e.g. a menu trigger). */
    'aria-label'?: string;
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
