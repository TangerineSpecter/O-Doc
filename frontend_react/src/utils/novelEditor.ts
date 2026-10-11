/** Backend indices are Unicode code points; DOM selections use UTF-16 units. */
export function codePointSelection(text: string, start: number, end: number) {
    return {start: Array.from(text.slice(0, start)).length, end: Array.from(text.slice(0, end)).length};
}
export function candidateCanReplace(base: string, current: string, saved: string, editor: string) {
    return base === current && saved === editor;
}
export function downloadNovel(title: string, content: string, format: string) {
    const url = URL.createObjectURL(new Blob([content], {type: 'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}.${format}`; a.click();
    URL.revokeObjectURL(url);
}
