import React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { buttonIcon } from '../../antdIcon';
import { useI18n } from '../../../i18n';
import { Hint } from '../../../../components/common/Hint/Hint';

interface Props extends ButtonProps {
    showPlay: boolean;
}

/**
 * Round play/pause control. The accessible name and the hint are the action
 * the click performs, not the icon that is drawn: without it a screen reader
 * announces "caret-right", which describes neither the control nor what
 * happens next.
 */
export const PlayPauseButton = ({ showPlay, icon, ...restProps }: Props) => {
    const { t } = useI18n();
    const label = showPlay ? t('common.start') : t('common.pause');
    return (
        <Hint label={label}>
            <Button
                type={'default'}
                shape={'circle'}
                icon={icon ?? buttonIcon(showPlay ? 'caret-right' : 'pause')}
                aria-label={label}
                style={{ marginRight: 6 }}
                {...restProps}
            />
        </Hint>
    );
};
