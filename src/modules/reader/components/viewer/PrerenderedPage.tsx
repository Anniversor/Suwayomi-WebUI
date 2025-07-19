/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React from 'react';
import Box from '@mui/material/Box';
import { ReadingDirection } from '@/modules/reader/types/Reader.types';
import { SpinnerImage } from '@/modules/core/components/SpinnerImage';
import { Priority } from '@/lib/Queue';

interface PrerenderedPageProps {
    src: string;
    alt: string;
    position: 'previous' | 'next';
    readingDirection: ReadingDirection;
    previewDirection: 'previous' | 'next' | null;
    isSwiping: boolean;
    isTransitioning: boolean;
    previewPageStyles: { transform: string } | null;
    transitionStyle: string;
}

export const PrerenderedPage: React.FC<PrerenderedPageProps> = ({
    src,
    alt,
    position,
    readingDirection,
    previewDirection,
    isSwiping,
    isTransitioning,
    previewPageStyles,
    transitionStyle,
}) => {
    const isLtr = readingDirection === ReadingDirection.LTR;
    let left: string;
    if (position === 'previous') {
        left = isLtr ? '-100%' : '100%';
    } else {
        left = isLtr ? '100%' : '-100%';
    }

    const opacity = previewDirection === position && (isSwiping || isTransitioning) ? 1 : 0;
    const transform =
        previewDirection === position && previewPageStyles ? previewPageStyles.transform : 'translateX(0)';

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 0,
                left,
                width: '100%',
                height: '100%',
                opacity,
                pointerEvents: 'none',
                zIndex: 0,
                overflow: 'hidden',
                transform,
                transition: transitionStyle,
            }}
        >
            <SpinnerImage
                src={src}
                alt={alt}
                priority={Priority.HIGH}
                shouldLoad
                imgStyle={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    objectPosition: 'center',
                }}
                spinnerStyle={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent',
                }}
            />
        </Box>
    );
};
