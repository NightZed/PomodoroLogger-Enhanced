import React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { buttonIcon } from '../../antdIcon';

interface Props extends ButtonProps {
    showPlay: boolean;
}

export const PlayPauseButton = ({ showPlay, icon, ...restProps }: Props) => {
    return (
        <Button
            type={'default'}
            shape={'circle'}
            icon={icon ?? buttonIcon(showPlay ? 'caret-right' : 'pause')}
            style={{ marginRight: 6 }}
            {...restProps}
        />
    );
};
