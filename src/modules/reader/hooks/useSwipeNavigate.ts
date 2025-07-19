/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReadingDirection, ReadingMode, ReaderTransitionPageMode } from '@/modules/reader/types/Reader.types.ts';
import { ReaderControls } from '@/modules/reader/services/ReaderControls.ts';
import { getNextPageIndex, getPage } from '@/modules/reader/utils/ReaderProgressBar.utils.tsx';
import { ReaderStatePages } from '@/modules/reader/types/ReaderProgressBar.types.ts';

interface UseSwipeNavigateProps {
    readingMode: ReadingMode;
    readingDirection: ReadingDirection;
    swipePreviewThreshold: number;
    currentPageIndex: number;
    pages: ReaderStatePages['pages'];
    transitionPageMode: ReaderTransitionPageMode;
    containerRef?: React.RefObject<HTMLElement | null>;
    isSinglePageSwipeEnabled: boolean;
    isSwipeAnimationEnabled: boolean;
    swipeAnimationSpeed: number;
}

const EDGE_SWIPE_THRESHOLD = 30; // iOS边缘返回手势的检测区域

export function useSwipeNavigate({
    readingMode,
    readingDirection,
    swipePreviewThreshold,
    currentPageIndex,
    pages,
    transitionPageMode,
    containerRef,
    isSinglePageSwipeEnabled,
    isSwipeAnimationEnabled,
    swipeAnimationSpeed,
}: UseSwipeNavigateProps) {
    const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
    const [isSwiping, setIsSwiping] = useState(false);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [previewDirection, setPreviewDirection] = useState<'previous' | 'next' | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // 使用ref来避免频繁的状态更新和内存泄漏
    const animationFrameRef = useRef<number | null>(null);
    const currentOffsetRef = useRef(0);
    const touchStartRef = useRef(touchStart);
    const isTransitioningRef = useRef(isTransitioning);

    const openPage = ReaderControls.useOpenPage();

    // 重置滑动状态的通用函数
    const resetSwipeState = useCallback(() => {
        setTouchStart(null);
        setIsSwiping(false);
        setScrollOffset(0);
        setPreviewDirection(null);
        currentOffsetRef.current = 0;
    }, []);

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

        if (readingMode === ReadingMode.SINGLE_PAGE && isSinglePageSwipeEnabled) {
            // 如果提供了containerRef，只在该容器上添加事件监听器
            // 否则回退到document级别（保持向后兼容）
            const targetElement = containerRef?.current || document;
            targetElement.addEventListener('touchmove', handleTouchMove, { passive: false });

            return () => {
                targetElement.removeEventListener('touchmove', handleTouchMove);
            };
        }
        return undefined;
    }, [readingMode, containerRef, isSinglePageSwipeEnabled]);

    // 同步ref与state
    useEffect(() => {
        touchStartRef.current = touchStart;
    }, [touchStart]);

    useEffect(() => {
        isTransitioningRef.current = isTransitioning;
    }, [isTransitioning]);

    // 清理动画帧和事件监听器
    useEffect(
        () => () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        },
        [],
    );

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (isTransitioningRef.current) return;

            if (e.touches.length === 1 && readingMode === ReadingMode.SINGLE_PAGE && isSinglePageSwipeEnabled) {
                const touch = e.touches[0];

                // 检测是否在屏幕左边缘，如果是则不处理，保留iOS的返回手势
                if (touch.clientX <= EDGE_SWIPE_THRESHOLD) {
                    return;
                }

                // 清理之前的动画帧
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                    animationFrameRef.current = null;
                }

                setTouchStart({
                    x: touch.clientX,
                    y: touch.clientY,
                    time: Date.now(),
                });
                // 重置其他状态
                setIsSwiping(false);
                setScrollOffset(0);
                setPreviewDirection(null);
                currentOffsetRef.current = 0;
            }
        },
        [readingMode, isSinglePageSwipeEnabled],
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (
                !touchStartRef.current ||
                e.touches.length !== 1 ||
                readingMode !== ReadingMode.SINGLE_PAGE ||
                !isSinglePageSwipeEnabled ||
                isTransitioningRef.current
            ) {
                return;
            }

            if (isSwipeAnimationEnabled) {
                const touch = e.touches[0];
                const deltaX = touch.clientX - touchStartRef.current.x;
                const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
                const absDeltaX = Math.abs(deltaX);

                // 更新当前偏移量到ref，避免频繁状态更新
                currentOffsetRef.current = deltaX;

                // 使用requestAnimationFrame节流状态更新
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }

                animationFrameRef.current = requestAnimationFrame(() => {
                    setScrollOffset(currentOffsetRef.current);

                    // 只有当水平滑动距离大于垂直滑动距离时才显示预览页面
                    if (absDeltaX > deltaY && absDeltaX > 5) {
                        // 添加最小阈值
                        setIsSwiping(true);
                        const isLeftSwipe = deltaX < 0;
                        let direction: 'next' | 'previous';
                        if (readingDirection === ReadingDirection.LTR) {
                            direction = isLeftSwipe ? 'next' : 'previous';
                        } else {
                            direction = isLeftSwipe ? 'previous' : 'next';
                        }
                        setPreviewDirection(direction);
                    } else {
                        setIsSwiping(false);
                        setPreviewDirection(null);
                    }
                });
            }
        },
        [readingMode, readingDirection, isSinglePageSwipeEnabled, isSwipeAnimationEnabled],
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            // 清理动画帧
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }

            if (!touchStartRef.current || readingMode !== ReadingMode.SINGLE_PAGE || !isSinglePageSwipeEnabled) {
                resetSwipeState();
                return;
            }

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartRef.current.x;
            const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
            const distance = Math.abs(deltaX);
            const triggerThreshold = window.innerWidth * (swipePreviewThreshold / 100);
            const swipeTime = Date.now() - touchStartRef.current.time;

            // 快速滑动（fling）检测或阈值检测
            const isFling = swipeTime < 300 && distance > 50;
            const shouldTrigger = isFling || (distance > triggerThreshold && distance > deltaY);

            if (shouldTrigger) {
                if (isSwipeAnimationEnabled) {
                    setIsTransitioning(true);
                    setTouchStart(null);
                    const targetOffset = deltaX > 0 ? window.innerWidth : -window.innerWidth;
                    setScrollOffset(targetOffset);
                    currentOffsetRef.current = targetOffset;

                    setTimeout(() => {
                        openPage(deltaX < 0 ? 'next' : 'previous');
                        resetSwipeState();
                        setIsTransitioning(false);
                    }, swipeAnimationSpeed);
                    return;
                }
                openPage(deltaX < 0 ? 'next' : 'previous');
            }

            resetSwipeState();
        },
        [
            readingMode,
            readingDirection,
            openPage,
            swipePreviewThreshold,
            isSinglePageSwipeEnabled,
            isSwipeAnimationEnabled,
            swipeAnimationSpeed,
            resetSwipeState,
        ],
    );

    const currentPage = useMemo(() => getPage(currentPageIndex, pages), [currentPageIndex, pages]);

    const previewPageIndex = useMemo(() => {
        if (!previewDirection || transitionPageMode !== ReaderTransitionPageMode.NONE) return null;

        const { pagesIndex } = currentPage;
        const isBoundary =
            (previewDirection === 'previous' && pagesIndex === 0) ||
            (previewDirection === 'next' && pagesIndex === pages.length - 1);

        return isBoundary ? null : getNextPageIndex(previewDirection, pagesIndex, pages);
    }, [previewDirection, currentPage, pages, transitionPageMode]);

    const previewPageUrl = useMemo(() => {
        if (previewPageIndex === null) return null;

        const previewPage = pages.find(
            (page) => page.primary.index === previewPageIndex || page.secondary?.index === previewPageIndex,
        );

        if (!previewPage) return null;
        return previewPage.primary.index === previewPageIndex ? previewPage.primary.url : previewPage.secondary?.url;
    }, [previewPageIndex, pages]);

    return {
        isSwiping,
        scrollOffset,
        isTransitioning,
        previewPageUrl,
        previewDirection,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    };
}
