/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReadingDirection, ReadingMode } from '@/modules/reader/types/Reader.types.ts';
import { ReaderControls } from '@/modules/reader/services/ReaderControls.ts';
import { getNextPageIndex, getPage } from '@/modules/reader/utils/ReaderProgressBar.utils.tsx';
import { ReaderStatePages } from '@/modules/reader/types/ReaderProgressBar.types.ts';

interface UseSwipeNavigateProps {
    readingMode: ReadingMode;
    readingDirection: ReadingDirection;
    swipePreviewThreshold: number;
    currentPageIndex: number;
    pages: ReaderStatePages['pages'];
    containerRef?: React.RefObject<HTMLElement | null>;
}

const SWIPE_THRESHOLD = 30;
const ANIMATION_DURATION = 200;
const EDGE_SWIPE_THRESHOLD = 30; // iOS边缘返回手势的检测区域

export function useSwipeNavigate({
    readingMode,
    readingDirection,
    swipePreviewThreshold,
    currentPageIndex,
    pages,
    containerRef,
}: UseSwipeNavigateProps) {
    const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
    const [isSwiping, setIsSwiping] = useState(false);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [previewDirection, setPreviewDirection] = useState<'next' | 'previous' | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const openPage = ReaderControls.useOpenPage();

    useEffect(() => {
        const handleTouchMove = (e: Event) => {
            const touchEvent = e as TouchEvent;
            // 只在单指触摸且处于单页模式时阻止默认行为
            // 允许多指触摸（如双指缩放）正常工作
            // 同时保留iOS左边缘的返回手势
            if (readingMode === ReadingMode.SINGLE_PAGE && touchEvent.touches.length === 1) {
                const touch = touchEvent.touches[0];
                // 如果触摸在左边缘，不阻止默认行为，保留系统返回手势
                if (touch.clientX <= EDGE_SWIPE_THRESHOLD) {
                    return undefined;
                }
                e.preventDefault();
            }
            return undefined;
        };

        if (readingMode === ReadingMode.SINGLE_PAGE) {
            // 如果提供了containerRef，只在该容器上添加事件监听器
            // 否则回退到document级别（保持向后兼容）
            const targetElement = containerRef?.current || document;
            targetElement.addEventListener('touchmove', handleTouchMove, { passive: false });

            return () => {
                targetElement.removeEventListener('touchmove', handleTouchMove);
            };
        }
        return undefined;
    }, [readingMode, containerRef]);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1 && readingMode === ReadingMode.SINGLE_PAGE) {
                const touch = e.touches[0];

                // 检测是否在屏幕左边缘，如果是则不处理，保留iOS的返回手势
                if (touch.clientX <= EDGE_SWIPE_THRESHOLD) {
                    return;
                }

                setTouchStart({
                    x: touch.clientX,
                    y: touch.clientY,
                    time: Date.now(),
                });
                setIsSwiping(false);
                setSwipeOffset(0);
                setPreviewDirection(null);
            }
        },
        [readingMode],
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStart || e.touches.length !== 1 || readingMode !== ReadingMode.SINGLE_PAGE) {
                return;
            }

            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStart.x;
            const deltaY = Math.abs(touch.clientY - touchStart.y);
            const absDeltaX = Math.abs(deltaX);

            // 始终跟随手指移动，让滑动更跟手
            setSwipeOffset(deltaX);

            // 只有当水平滑动距离大于垂直滑动距离且超过阈值时才显示预览页面
            if (absDeltaX > deltaY && absDeltaX > SWIPE_THRESHOLD) {
                setIsSwiping(true);
                const isLeftSwipe = deltaX < 0;
                if (readingDirection === ReadingDirection.LTR) {
                    setPreviewDirection(isLeftSwipe ? 'next' : 'previous');
                } else {
                    setPreviewDirection(isLeftSwipe ? 'previous' : 'next');
                }
            } else {
                // 如果不满足预览条件，清除预览状态但保持滑动跟手
                setIsSwiping(false);
                setPreviewDirection(null);
            }
        },
        [touchStart, readingMode, readingDirection],
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStart || readingMode !== ReadingMode.SINGLE_PAGE) {
                setTouchStart(null);
                setIsSwiping(false);
                setSwipeOffset(0);
                setPreviewDirection(null);
                return;
            }

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStart.x;
            const deltaY = Math.abs(touch.clientY - touchStart.y);
            const distance = Math.abs(deltaX);
            const triggerThreshold = window.innerWidth * (swipePreviewThreshold / 100);

            // 只要水平滑动距离达到阈值且水平滑动距离大于垂直滑动距离就可以翻页
            if (distance > triggerThreshold && distance > deltaY) {
                setIsTransitioning(true);
                setTouchStart(null);
                const targetOffset = deltaX > 0 ? window.innerWidth : -window.innerWidth;
                setSwipeOffset(targetOffset);

                setTimeout(() => {
                    setSwipeOffset(0);
                    const shouldGoNext = deltaX < 0;
                    const direction = shouldGoNext ? 'next' : 'previous';
                    openPage(direction);
                    setPreviewDirection(null);
                    setIsSwiping(false);
                    setIsTransitioning(false);
                }, ANIMATION_DURATION);
                return;
            }

            setTouchStart(null);
            setIsSwiping(false);
            setSwipeOffset(0);
            setPreviewDirection(null);
        },
        [touchStart, readingMode, readingDirection, openPage, swipePreviewThreshold],
    );

    const currentPage = useMemo(() => getPage(currentPageIndex, pages), [currentPageIndex, pages]);
    const previewPageIndex = useMemo(() => {
        if (!previewDirection) return null;
        try {
            return getNextPageIndex(previewDirection, currentPage.pagesIndex, pages);
        } catch {
            return null;
        }
    }, [previewDirection, currentPage.pagesIndex, pages]);

    const previewPageUrl = useMemo(() => {
        if (previewPageIndex === null) return null;
        const previewPage = pages.find(
            (page) => page.primary.index === previewPageIndex || page.secondary?.index === previewPageIndex,
        );
        return previewPage?.primary.index === previewPageIndex
            ? previewPage.primary.url
            : previewPage?.secondary?.url || null;
    }, [previewPageIndex, pages]);

    return {
        isSwiping,
        swipeOffset,
        isTransitioning,
        previewPageUrl,
        previewDirection,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    };
}
