/**
 * 中文日记现代排版与阅读美化引擎
 * 1. 规范段首缩进：普通段落自动缩进两个全角空格（\u3000\u3000），已有的不规则缩进自动规范
 * 2. 智能识别特殊块：引用（>）、列表项（-、*、1.、①）、分割线自动跳过缩进
 * 3. 规范中英文间距（盘古之白）：中文字符与英文字母/数字之间自动插入空格
 * 4. 规范中文标点：中文语境下的半角逗号、句号、问号、感叹号、冒号转换为全角标点
 * 5. 规范段间空行：压缩连续多余的空行，去除行末尾多余空格
 */

function polishText(text: string): string {
    return text
        .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2')
        .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2')
        .replace(/([\u4e00-\u9fa5]),/g, '$1，')
        .replace(/([\u4e00-\u9fa5])\.(?!\d)/g, '$1。')
        .replace(/([\u4e00-\u9fa5])\?/g, '$1？')
        .replace(/([\u4e00-\u9fa5])!/g, '$1！')
        .replace(/([\u4e00-\u9fa5]):/g, '$1：')
        .replace(/([\u4e00-\u9fa5]);/g, '$1；');
}

/** URLs and inline code are literal text: normalize around them, never inside them. */
function polishLine(line: string): string {
    const parts = line.split(/((?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`]+|`[^`\n]*`)/gi);
    let result = '';
    parts.forEach((part, index) => {
        const value = index % 2 ? part : polishText(part);
        if ((/[\u4e00-\u9fa5]$/.test(result) && /^[a-zA-Z0-9]/.test(value)) ||
            (/[a-zA-Z0-9]$/.test(result) && /^[\u4e00-\u9fa5]/.test(value))) result += ' ';
        result += value;
    });
    return result;
}

export function formatDiaryProse(content: string): string {
    if (!content || !content.trim()) return content;

    const lines = content.split('\n');
    const formattedLines: string[] = [];

    for (const rawLine of lines) {
        // 去除行末尾多余空格
        const line = rawLine.trimEnd();

        // 空行直接保留
        if (!line.trim()) {
            formattedLines.push('');
            continue;
        }

        // 去除行首既有的所有空格（全角和半角）
        const trimmed = line.replace(/^[\s\u3000]+/, '');

        // 识别特殊行（不应强制首行缩进）
        const isBlockquote = trimmed.startsWith('>');
        const isListItem =
            /^([-*+•]|\d+[.、]|\([0-9a-zA-Z]\)|[①-⑩])\s+/.test(trimmed) ||
            /^[一二三四五六七八九十]+[、.]\s*/.test(trimmed);
        const isDivider = /^([-*_~])\1{2,}$/.test(trimmed);

        // 中西文与标点规范只作用于普通文字，避免改写链接和行内代码。
        const polishedLine = polishLine(trimmed);

        // 3. 段首缩进：普通自然段落开头空两个全角汉字空格
        if (isBlockquote) {
            // 规范引用格式：保持 > 后有一个空格
            formattedLines.push(`> ${polishedLine.replace(/^>\s*/, '')}`);
        } else if (isListItem || isDivider) {
            formattedLines.push(polishedLine);
        } else {
            // 普通段落缩进两格
            formattedLines.push(`\u3000\u3000${polishedLine}`);
        }
    }

    // 4. 压缩连续多余的空行（最多连续保留一个空行）
    const result = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n');

    return result.trimEnd();
}
