import * as React from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import type { RootState } from '../reducers';
import type { Language } from '../../shared/i18n';
import { applyDocumentLanguage } from './documentLanguage';
import { resolveLanguage, SYSTEM_LANGUAGE } from './runtime';

interface Props {
    language: Language;
}

/**
 * The language counterpart of `ThemeController`: it renders nothing and owns
 * only the side effects that cannot live in the module level store.
 *
 * The active language itself is pushed by `store/index.ts` (see `syncLanguage`)
 * because `t()` has to be right during render, not after an effect.
 */
const LanguageControllerBase: React.FC<Props> = ({ language }) => {
    React.useEffect(() => {
        // antd's DatePicker and CardEditor's `dayjs(...)` share this instance.
        dayjs.locale(language === 'zh' ? 'zh-cn' : 'en');
        applyDocumentLanguage();
        // Tray "Open"/"Quit", native dialogs and the updater copy belong to the
        // main process; this is the single place that tells it about a switch.
        window.api?.setLanguage?.(language);
    }, [language]);

    return null;
};

export const LanguageController = connect((state: RootState) => ({
    language: resolveLanguage(state.timer.language, SYSTEM_LANGUAGE),
}))(LanguageControllerBase);
