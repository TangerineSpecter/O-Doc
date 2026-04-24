export const getPreviewShortcutLabel = () => {
    if (typeof navigator !== 'undefined' && navigator.platform.includes('Mac')) {
        return 'Cmd + E';
    }
    return 'Ctrl + E';
};
