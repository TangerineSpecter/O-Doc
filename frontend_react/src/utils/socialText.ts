/** 保留正文换行，移除空白段落，兼容已有动态。 */
export const compactMomentText = (value: string) => value.split(/\r?\n/).filter(line => line.trim()).join('\n').trim();
