export const DIARY_TAG_ERROR = '最多 10 个标签，每个不超过 30 字';

/** Resolve pending input with the same rules for blur, Enter and save. */
export function mergeDiaryTags(tags: string[], input: string): {tags: string[]; error: string} {
    const values = input.split(/[,，、\n]/).map(value => value.trim().replace(/^#/, '').trim()).filter(Boolean);
    const next = [...new Set([...tags, ...values])];
    if (next.length > 10 || next.some(tag => tag.length > 30)) return {tags, error: DIARY_TAG_ERROR};
    return {tags: next, error: ''};
}
