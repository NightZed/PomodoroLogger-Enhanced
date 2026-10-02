import React from 'react';
import { Button } from 'antd';
import { ButtonProps } from 'antd/lib/button/button';

interface Props extends ButtonProps {
    showPlay: boolean;
}

export const PlayPauseButton = ({ showPlay, ...restProps }: Props) => {
    return (
        <Button
            type={'default'}
            shape={'circle'}
            icon={showPlay ? 'caret-right' : 'pause'}
            style={{ marginRight: 6 }}
            {...restProps}
        />
    );
};
