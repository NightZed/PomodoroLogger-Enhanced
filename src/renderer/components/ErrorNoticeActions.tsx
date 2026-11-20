import * as React from 'react';
import { Button, Tooltip } from 'antd';
import { CheckOutlined, CopyOutlined, FolderOpenOutlined, GithubOutlined } from '@ant-design/icons';
import { t } from '../i18n';
import { copyToClipboard } from '../clipboard';
import { diagnosticsText, DiagnosticsSource } from '../diagnostics';
import { ISSUES_URL } from '../../shared/links';
import type { LogInfo } from '../../main/ipc/type';
import { getPopupContainer } from './popupLayer';
import { LAYER } from './layers';

/** How long a button keeps the "Copied" check mark. */
const COPIED_MS = 2000;

async function readLogInfo(): Promise<LogInfo | undefined> {
    try {
        return await window.api?.logInfo?.();
    } catch {
        // The clipboard block is still worth copying without the log path.
        return undefined;
    }
}

interface Props {
    /** What the copied text describes; the same shape the crash screen uses. */
    source: DiagnosticsSource;
}

/**
 * The actions of an error notice: copy the details, report the issue, open the
 * log folder.
 *
 * The notice is at most a few hundred pixels wide, so the buttons are
 * icon-only. Their labels -- the wording the crash screen uses for the same
 * three actions -- live in the tooltip and in `aria-label`, which also keeps
 * the buttons usable without hover.
 *
 * "Report" copies first: opening the tracker moves focus to the browser, after
 * which `navigator.clipboard` may reject, and an issue filed without the log
 * details is the thing this button exists to prevent.
 */
const ErrorNoticeActions: React.FC<Props> = ({ source }) => {
    const [flashed, setFlashed] = React.useState<'copy' | 'report' | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    React.useEffect(
        () => () => {
            if (timer.current !== undefined) {
                clearTimeout(timer.current);
            }
        },
        []
    );

    const flash = (which: 'copy' | 'report') => {
        setFlashed(which);
        if (timer.current !== undefined) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => setFlashed(null), COPIED_MS);
    };

    const copy = async (which: 'copy' | 'report'): Promise<boolean> => {
        const info = await readLogInfo();
        if (!(await copyToClipboard(diagnosticsText(source, info)))) {
            return false;
        }
        flash(which);
        return true;
    };

    const copyLabel = flashed === 'copy' ? t('crash.copied') : t('crash.copy');
    const reportLabel = flashed === 'report' ? t('crash.copied') : t('crash.feedback');
    const logLabel = t('crash.logFolder');

    return (
        <>
            {/* A notice sits at `LAYER.notice` but its tooltips default to
                `LAYER.popup`, so these would render *behind* the card they
                belong to. Lift only these three above the card instead of
                changing the global layer order. */}
            <Tooltip
                title={copyLabel}
                placement="bottom"
                styles={{ root: { zIndex: LAYER.noticeTooltip } }}
                getPopupContainer={getPopupContainer}
            >
                <Button
                    type="text"
                    size="small"
                    aria-label={copyLabel}
                    icon={flashed === 'copy' ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => void copy('copy')}
                />
            </Tooltip>
            <Tooltip
                title={reportLabel}
                placement="bottom"
                styles={{ root: { zIndex: LAYER.noticeTooltip } }}
                getPopupContainer={getPopupContainer}
            >
                <Button
                    type="text"
                    size="small"
                    aria-label={reportLabel}
                    icon={flashed === 'report' ? <CheckOutlined /> : <GithubOutlined />}
                    onClick={async () => {
                        await copy('report');
                        window.api?.openExternal?.(ISSUES_URL);
                    }}
                />
            </Tooltip>
            <Tooltip
                title={logLabel}
                placement="bottom"
                styles={{ root: { zIndex: LAYER.noticeTooltip } }}
                getPopupContainer={getPopupContainer}
            >
                <Button
                    type="text"
                    size="small"
                    aria-label={logLabel}
                    icon={<FolderOpenOutlined />}
                    onClick={() => window.api?.openLogDir?.()}
                />
            </Tooltip>
        </>
    );
};

export default ErrorNoticeActions;
