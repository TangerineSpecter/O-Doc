export interface PostReference {number: number; url: string; host: string}

// 只拆出服务端管理的完整末尾区段；无法识别的旧正文按原样保留。
export function splitPostReferences(content: string): {body: string; references: PostReference[]} {
    const heading = '\n\n参考来源：\n';
    const position = content.lastIndexOf(heading);
    let rawBody = content;
    let references: PostReference[] = [];

    if (position >= 0) {
        const potentialBody = content.slice(0, position);
        let fence = '';
        for (const line of potentialBody.split('\n')) {
            const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
            if (!marker) continue;
            if (!fence) fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
        }
        if (!fence) {
            const lines = content.slice(position + heading.length).trim().split('\n');
            const parsedRefs: PostReference[] = [];
            let valid = true;
            for (const line of lines) {
                const match = /^- \[(\d+)\]\((https?:\/\/.+)\)$/.exec(line.trim());
                if (!match || Number(match[1]) !== parsedRefs.length + 1) {
                    valid = false;
                    break;
                }
                try {
                    const url = new URL(match[2]);
                    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
                        valid = false;
                        break;
                    }
                    parsedRefs.push({number: Number(match[1]), url: match[2], host: url.hostname});
                } catch {
                    valid = false;
                    break;
                }
            }
            if (valid && parsedRefs.length > 0) {
                rawBody = potentialBody;
                references = parsedRefs;
            }
        }
    }

    let cleanBody = rawBody.trimEnd();
    // 1. 清除末尾残留的脚注定义块与参考资料标题
    cleanBody = cleanBody.replace(/(?:\n\s*---\s*)?\n+\s*(?:(?:\*\*|#{1,6}\s*)(?:参考[资料来源]+|参考文献)[:：]?(?:\*\*|\s*)?)?\s*(?:\n+\[\^\w+\]:[^\n]+)+\s*$/g, '').trimEnd();
    cleanBody = cleanBody.replace(/(?:\n\s*---\s*)?\n+\s*(?:\*\*(?:参考[资料来源]+|参考文献)[:：]?\*\*|#{1,6}\s*(?:参考[资料来源]+|参考文献)[:：]?)\s*$/g, '').trimEnd();
    // 2. 清除正文中残留的脚注标记（如 [^1], [^2], [^10]）
    cleanBody = cleanBody.replace(/\s*\[\^\w+\]/g, '');
    // 3. 清除金句卡片中多余的“核心金句/核心结论”等冗余前缀
    cleanBody = cleanBody.replace(/^(\s*>\s*(?:!|\[!takeaway\])\s*)(?:核心(?:金句|结论|观点|提要)|金句|结论|观点|KEY\s*TAKEAWAY|TAKEAWAY)[:：\s\-·]*/gmi, '$1');

    return {body: cleanBody, references};
}

export function postDisplayTitle(title: string): string {
    return title.replace(/[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu, '').trim() || '未命名帖子';
}
