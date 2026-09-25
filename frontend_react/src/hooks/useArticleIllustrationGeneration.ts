import {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {generateArticleIllustration, getArticleIllustrationGenerationSettings, getArticleIllustrationResult} from '../api/prompt';
import type {ArticleIllustrationAsset, ArticleIllustrationResponse, ImageGenerationRequestOptions, ImageGenerationSettings} from '../types/api/prompt';
import {useToast} from '../components/common/ToastProvider';

export type ArticleIllustrationGenerationStatus = 'idle' | 'starting' | 'polling';
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const MAX_TRANSIENT_FAILURES = 5;

const waitForNextPoll = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
    };
    timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
    }, 3000);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
});

const isTransientGenerationError = (error: unknown) => {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return !status || status >= 500 || status === 429;
};

export function useArticleIllustrationGeneration() {
    const toast = useToast();
    const [status, setStatus] = useState<ArticleIllustrationGenerationStatus>('idle');
    const [settings, setSettings] = useState<ImageGenerationSettings | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const selectedTextRef = useRef('');
    const settingsRequestRef = useRef(0);
    const activeControllerRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const mountedRef = useRef(false);
    const toastRef = useRef(toast);
    toastRef.current = toast;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            settingsRequestRef.current += 1;
            activeControllerRef.current?.abort();
        };
    }, []);

    const openSettings = async (selectedText: string) => {
        if (busyRef.current || !selectedText.trim()) return false;
        selectedTextRef.current = selectedText;
        const requestId = ++settingsRequestRef.current;
        setSettings(null);
        setIsSettingsOpen(true);
        setIsLoadingSettings(true);
        try {
            const result = await getArticleIllustrationGenerationSettings();
            if (settingsRequestRef.current === requestId) {
                setSettings(result);
                return true;
            }
            return false;
        } catch (error) {
            if (settingsRequestRef.current === requestId) {
                selectedTextRef.current = '';
                setIsSettingsOpen(false);
                toastRef.current.error((error as Error).message || '读取文章配图设置失败');
            }
            return false;
        } finally {
            if (settingsRequestRef.current === requestId) setIsLoadingSettings(false);
        }
    };

    const closeSettings = () => {
        if (busyRef.current) return;
        settingsRequestRef.current += 1;
        selectedTextRef.current = '';
        setSettings(null);
        setIsLoadingSettings(false);
        setIsSettingsOpen(false);
    };

    const stopPolling = () => {
        if (status !== 'polling' || !activeControllerRef.current) return;
        activeControllerRef.current.abort();
        toastRef.current.info('任务已保存在资源库，可稍后查询结果');
    };

    const generate = async (options: ImageGenerationRequestOptions): Promise<ArticleIllustrationAsset | null> => {
        if (busyRef.current) return null;
        const selectedText = selectedTextRef.current;
        if (!selectedText) return null;
        busyRef.current = true;
        const controller = new AbortController();
        activeControllerRef.current = controller;
        setStatus('starting');
        toastRef.current.info('正在根据选中内容生成文章配图…');

        try {
            let result: ArticleIllustrationResponse = await generateArticleIllustration(selectedText, options, controller.signal);
            let transientFailures = 0;
            const pollDeadline = Date.now() + MAX_POLL_DURATION_MS;

            while (result.status === 'pending') {
                if (!result.taskToken) throw new Error('文章配图任务返回不完整');
                if (Date.now() >= pollDeadline) {
                    toastRef.current.info('任务仍在生成，已保存到资源库，可稍后查询结果');
                    return null;
                }
                if (mountedRef.current) setStatus('polling');
                await waitForNextPoll(controller.signal);

                try {
                    result = await getArticleIllustrationResult(result.taskToken, controller.signal);
                    transientFailures = 0;
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    if (!isTransientGenerationError(error)) throw error;
                    transientFailures += 1;
                    if (transientFailures === 3) toastRef.current.info('文章配图结果查询暂时失败，正在继续重试');
                    if (transientFailures >= MAX_TRANSIENT_FAILURES) {
                        toastRef.current.info('查询暂时不可用，任务已保存在资源库，可稍后继续查询');
                        return null;
                    }
                }
            }

            if (result.status === 'download_pending') {
                toastRef.current.info('图片已生成，原图地址已保存在资源库「待下载」区，可重试入库');
                return null;
            }

            if (!result.asset?.id || !result.asset.imageUrl) throw new Error('文章配图生成结果不完整');
            toastRef.current.success('文章配图已生成，已插入正文草稿');
            return result.asset;
        } catch (error) {
            if (!controller.signal.aborted) {
                toastRef.current.error((error as Error).message || '生成文章配图失败');
            }
            return null;
        } finally {
            if (activeControllerRef.current === controller) activeControllerRef.current = null;
            busyRef.current = false;
            selectedTextRef.current = '';
            if (mountedRef.current) {
                setIsSettingsOpen(false);
                setSettings(null);
                setStatus('idle');
            }
        }
    };

    return {status, settings, isSettingsOpen, isLoadingSettings, openSettings, closeSettings, stopPolling, generate};
}
