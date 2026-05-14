export type AppFontId =
    | 'system'
    | 'misans'
    | 'fzPingXianYaSong'
    | 'lxgwWenKai'
    | 'yanWeiCanLiu'
    | 'harmonyOSSans';

export interface AppFontOption {
    value: AppFontId;
    label: string;
    description: string;
    cssValue: string;
}

export const APP_FONT_STORAGE_KEY = 'o-doc-app-font';

export const SYSTEM_FONT_STACK = [
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    '"Noto Sans SC"',
    '"PingFang SC"',
    '"Microsoft YaHei"',
    'ui-sans-serif',
    'system-ui',
    'sans-serif',
].join(', ');

export const APP_FONT_OPTIONS: AppFontOption[] = [
    {
        value: 'system',
        label: '系统默认',
        description: '跟随 macOS / Windows / Linux 的系统字体',
        cssValue: SYSTEM_FONT_STACK,
    },
    {
        value: 'misans',
        label: '小米兰亭 MiSans',
        description: '当前 fonts 目录内的 MiSans-Semibold 字体',
        cssValue: `"MyCustomFont", ${SYSTEM_FONT_STACK}`,
    },
    {
        value: 'fzPingXianYaSong',
        label: '方正屏显雅宋',
        description: '当前 fonts 目录内的方正屏显雅宋简体字体',
        cssValue: `"FZPingXianYaSong", ${SYSTEM_FONT_STACK}`,
    },
    {
        value: 'lxgwWenKai',
        label: '霞鹜文楷',
        description: '当前 fonts 目录内的 LXGW WenKai GB Screen 字体',
        cssValue: `"LXGWWenKaiGBScreen", ${SYSTEM_FONT_STACK}`,
    },
    {
        value: 'yanWeiCanLiu',
        label: '眼尾残留涙的余温',
        description: '当前 fonts 目录内的手写风格字体',
        cssValue: `"YanWeiCanLiuLeiDeYuWen", ${SYSTEM_FONT_STACK}`,
    },
    {
        value: 'harmonyOSSans',
        label: 'HarmonyOS Sans',
        description: '当前 fonts 目录内的 HarmonyOS Sans SC Regular 字体',
        cssValue: `"HarmonyOSSansSC", ${SYSTEM_FONT_STACK}`,
    },
];

export const getAppFontOption = (fontId?: string | null) => (
    APP_FONT_OPTIONS.find(option => option.value === fontId) || APP_FONT_OPTIONS[0]
);

export const getStoredAppFont = (): AppFontId => {
    if (typeof window === 'undefined') return APP_FONT_OPTIONS[0].value;
    return getAppFontOption(window.localStorage.getItem(APP_FONT_STORAGE_KEY)).value;
};

export const applyAppFont = (fontId: AppFontId) => {
    if (typeof document === 'undefined') return;
    const option = getAppFontOption(fontId);
    document.documentElement.style.setProperty('--app-font-family', option.cssValue);
};

export const saveAndApplyAppFont = (fontId: AppFontId) => {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(APP_FONT_STORAGE_KEY, fontId);
    }
    applyAppFont(fontId);
};
