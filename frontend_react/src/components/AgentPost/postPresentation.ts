export interface PostReference {number: number; url: string; host: string}

// 只拆出服务端管理的完整末尾区段；无法识别的旧正文按原样保留。
export function splitPostReferences(content: string): {body: string; references: PostReference[]} {
    const heading = '\n\n参考来源：\n';
    const position = content.lastIndexOf(heading);
    if (position < 0) return {body: content, references: []};
    const body = content.slice(0, position);
    let fence = '';
    for (const line of body.split('\n')) {
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (!marker) continue;
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
    }
    if (fence) return {body: content, references: []};
    const references: PostReference[] = [];
    const lines = content.slice(position + heading.length).trim().split('\n');
    for (const line of lines) {
        const match = /^- \[(\d+)\]\((https?:\/\/.+)\)$/.exec(line.trim());
        if (!match || Number(match[1]) !== references.length + 1) return {body: content, references: []};
        try {
            const url = new URL(match[2]);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return {body: content, references: []};
            references.push({number: Number(match[1]), url: match[2], host: url.hostname});
        } catch {
            return {body: content, references: []};
        }
    }
    return {body: body.trimEnd(), references};
}

export function postDisplayTitle(title: string): string {
    return title.replace(/[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu, '').trim() || '未命名帖子';
}
