import React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { buttonIcon } from '../../antdIcon';
import { useI18n } from '../../../i18n';

interface Props extends ButtonProps {
    showPlay: boolean;
}

/**
 * Round play/pause control. The accessible name is the action the click
 * performs, not the icon that is drawn: without it a screen reader announces
 * "caret-right", which describes neither the control nor what happens next.
 */
export const PlayPauseButton = ({ showPlay, icon, ...restProps }: Props) => {
    const { t } = useI18n();
    return (
        <Button
            type={'default'}
            shape={'circle'}
            icon={icon ?? buttonIcon(showPlay ? 'caret-right' : 'pause')}
            aria-label={showPlay ? t('timer.tray.startFocusing') : t('timer.tray.pause')}
            style={{ marginRight: 6 }}
            {...restProps}
        />
    );
};
