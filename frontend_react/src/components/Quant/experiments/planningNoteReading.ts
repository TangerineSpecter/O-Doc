import {planningNoteParagraphs, planningNoteSections, type PlanningNoteSection} from './planningNoteSections';

const titles: Record<string, string> = {
    综合: '研究结论', 结论: '研究结论', 待补充内容: '需要补齐',
    后续建议: '下一步', 下一步: '下一步', 源码事实: '来源与计算',
    参数默认值方面: '参数说明', 参数默认值: '参数说明',
    平台语义未知: '平台待核对', 平台语义: '平台待核对', 时点方面: '信号时点',
};

/** Only remove source locations from the reading copy. Original evidence remains available verbatim. */
export function planningReadingText(text: string): string {
    return text
        .replace(/[（(]第?\s*\d+(?:\s*[、，,–—~\-至]\s*\d+)*\s*行[）)]/g, '')
        .replace(/第\s*\d+(?:\s*[、，,–—~\-至]\s*\d+)*\s*行/g, '')
        .trim();
}

/** Split an explicit missing-input enumeration, preserving nested expressions and quoted lists. */
export function planningMissingItems(text: string): string[] {
    const pairs: Record<string, string> = {'（': '）', '(': ')', '[': ']', '“': '”', '「': '」', '`': '`', '"': '"'};
    const stack: string[] = [];
    const items: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (stack[stack.length - 1] === char) stack.pop();
        else if (pairs[char]) stack.push(pairs[char]);
        if (!stack.length && /[、；;。\n]/.test(char)) {
            if (text.slice(start, i).trim()) items.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (text.slice(start).trim()) items.push(text.slice(start).trim());
    return items.map(item => item.replace(/^(?:以及|及)[，,\s]*/, ''));
}

export function planningNoteReading(note: string) {
    const sections = planningNoteSections(note);
    const primary: PlanningNoteSection[] = [];
    const evidence: PlanningNoteSection[] = [];
    for (const section of sections) {
        const title = titles[section.title] || section.title;
        // Preamble is not a topic. For an unstructured note preserve its useful content as a fallback.
        if (section.title === '说明与边界' && sections.length > 1) continue;
        if (/^(综合|结论|待补充内容|后续建议|下一步)$/.test(section.title)) {
            // Internal execution-control instructions belong in original evidence, not the reading summary.
            const text = planningReadingText(section.text.split(/initial_proposal\s*(?:置|为|=)/)[0]).replace(/[；;，,]\s*$/, '');
            if (text && title === '需要补齐') {
                const [requirements, ...followup] = text.split(/。\s*(?=请)/);
                primary.push({title, text: requirements});
                if (followup.length) primary.push({title: '下一步', text: followup.join('。')});
            } else if (text) primary.push({title, text});
        } else {
            evidence.push({title: title === '说明与边界' ? '研究说明' : title, text: section.text});
        }
    }
    if (!primary.length && evidence.length === 1 && !/^本次只做设计/.test(evidence[0].text)) {
        primary.push({...evidence[0], text: planningReadingText(evidence[0].text)});
        evidence.length = 0;
    }
    return {primary, evidence};
}

export {planningNoteParagraphs};
