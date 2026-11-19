import * as React from 'react';
import styled from 'styled-components';
import {
    CheckOutlined,
    CopyOutlined,
    FolderOpenOutlined,
    GithubOutlined,
    PoweroffOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import WindowControls from './WindowControls';
import { t } from '../i18n';
import { TITLE_BAR_HEIGHT } from './AppTitleBar/tokens';
import { APP_FONT_FAMILY } from '../theme/tokens';
import { copyToClipboard } from '../clipboard';
import { diagnosticsText, DiagnosticsSource } from '../diagnostics';
import { ISSUES_URL } from '../../shared/links';
import type { LogInfo } from '../../main/ipc/type';

interface Props {
    error: Error;
    componentStack?: string | null;
}

/**
 * Full-window replacement shown by `AppErrorBoundary`.
 *
 * Deliberately built from plain elements and the `--pl-*` custom properties:
 * it renders *outside* `ConfigProvider`, so antd components would fall back to
 * their light theme, and it must survive a React tree that just failed. For the
 * same reason it reads strings through the module-level `t()` instead of
 * `useI18n()`.
 *
 * The window is frameless, so this page has to provide what `AppTitleBar`
 * normally does: a drag region and the caption buttons. Closing still goes to
 * the tray (that is the window's close handler), hence the explicit Quit
 * button.
 */
const Root = styled.div`
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    background-color: var(--pl-bg);
    /* A transparent window otherwise lets clicks through to the desktop. */
    box-shadow: inset 0 0 0 1px var(--pl-border);
    border-radius: 12px;
    color: var(--pl-text);
    font-family: ${APP_FONT_FAMILY};
    font-size: 13px;
`;

const Header = styled.div`
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: ${TITLE_BAR_HEIGHT}px;
    flex: 0 0 auto;
    padding-left: 12px;
    border-bottom: 1px solid var(--pl-border);
    color: var(--pl-text-secondary);
    user-select: none;
`;

const Body = styled.div`
    flex: 1 1 auto;
    padding: 24px 28px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const Title = styled.h1`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--pl-text);
`;

const Text = styled.p`
    margin: 0;
    line-height: 1.6;
    color: var(--pl-text-secondary);
    max-width: 720px;
`;

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
`;

const Button = styled.button<{ $primary?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border-radius: 6px;
    border: 1px solid ${({ $primary }) => ($primary ? 'var(--pl-primary)' : 'var(--pl-border)')};
    background-color: ${({ $primary }) => ($primary ? 'var(--pl-primary)' : 'var(--pl-bg-elevated)')};
    color: ${({ $primary }) => ($primary ? '#fff' : 'var(--pl-text)')};
    font: inherit;
    cursor: pointer;

    &:hover {
        border-color: var(--pl-primary);
        color: ${({ $primary }) => ($primary ? '#fff' : 'var(--pl-primary)')};
    }
`;

const Meta = styled.div`
    color: var(--pl-text-tertiary);
    font-size: 12px;
    line-height: 1.7;
    word-break: break-all;
`;

const Details = styled.details`
    margin-top: 6px;
    color: var(--pl-text-secondary);

    summary {
        cursor: pointer;
        color: var(--pl-text);
    }

    pre {
        margin: 10px 0 0;
        padding: 12px;
        max-height: 38vh;
        overflow: auto;
        background-color: var(--pl-bg-sunken);
        border: 1px solid var(--pl-border);
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        user-select: text;
    }
`;

const ErrorScreen: React.FC<Props> = ({ error, componentStack }) => {
    const [info, setInfo] = React.useState<LogInfo>();
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        window.api
            ?.logInfo?.()
            .then((value) => {
                if (alive) {
                    setInfo(value);
                }
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, []);

    const source = (): DiagnosticsSource => ({
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack,
    });

    const details = () => diagnosticsText(source(), info);

    const restart = () => {
        window.api?.restart?.();
        // In development the main process only logs the restart request, so
        // reload the page instead of leaving the button without feedback.
        if (process.env.NODE_ENV !== 'production') {
            setTimeout(() => window.location.reload(), 300);
        }
    };

    /**
     * Reads the log location at the moment of copying instead of trusting
     * `info` from the mount effect: the lookup may still be in flight when the
     * user clicks, and a report without the log path cannot be matched against
     * the file it refers to.
     */
    const currentInfo = async (): Promise<LogInfo | undefined> => {
        try {
            return await window.api?.logInfo?.();
        } catch {
            return info;
        }
    };

    /**
     * Copies the details and reports whether it worked, so "Report issue" can
     * hand over the same text before opening the tracker. Opening the browser
     * takes focus away from this window, and a clipboard write from an
     * unfocused document can be rejected.
     */
    const copyDetails = async (): Promise<boolean> => {
        if (!(await copyToClipboard(diagnosticsText(source(), await currentInfo())))) {
            return false;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return true;
    };

    const reportIssue = async () => {
        await copyDetails();
        window.api?.openExternal?.(ISSUES_URL);
    };

    return (
        <Root role="alertdialog" aria-label={t('crash.title')}>
            <Header>
                <span>{t('app.title')}</span>
                <WindowControls />
            </Header>
            <Body>
                <Title>{t('crash.title')}</Title>
                <Text>{t('crash.body')}</Text>
                <Text>{t('crash.hint')}</Text>
                <Actions>
                    <Button
                        type="button"
                        $primary
                        aria-label={t('crash.restart')}
                        onClick={restart}
                    >
                        <ReloadOutlined />
                        <span>{t('crash.restart')}</span>
                    </Button>
                    <Button type="button" aria-label={t('crash.feedback')} onClick={reportIssue}>
                        <GithubOutlined />
                        <span>{t('crash.feedback')}</span>
                    </Button>
                </Actions>
                <Actions>
                    <Button
                        type="button"
                        aria-label={copied ? t('crash.copied') : t('crash.copy')}
                        onClick={copyDetails}
                    >
                        {copied ? <CheckOutlined /> : <CopyOutlined />}
                        <span>{copied ? t('crash.copied') : t('crash.copy')}</span>
                    </Button>
                    <Button
                        type="button"
                        aria-label={t('crash.logFolder')}
                        onClick={() => window.api?.openLogDir?.()}
                    >
                        <FolderOpenOutlined />
                        <span>{t('crash.logFolder')}</span>
                    </Button>
                    <Button
                        type="button"
                        aria-label={t('crash.quit')}
                        onClick={() => window.api?.quit?.()}
                    >
                        <PoweroffOutlined />
                        <span>{t('crash.quit')}</span>
                    </Button>
                </Actions>
                {info ? (
                    <Meta>
                        {t('crash.logLocation', info.dir)}
                        <br />
                        {t('crash.session', info.sessionId)}
                    </Meta>
                ) : null}
                <Details>
                    <summary>{t('crash.details')}</summary>
                    <pre>{details()}</pre>
                </Details>
            </Body>
        </Root>
    );
};

export default ErrorScreen;
