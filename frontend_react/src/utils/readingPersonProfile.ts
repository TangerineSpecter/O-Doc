import type {ReadingFact, ReadingNode} from '../types/bookAnalysis';

export interface PersonAttribute {value: string; fact: ReadingFact}
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ageText = '(?:[0-9]{1,3}|[零〇一二两三四五六七八九十百]{1,5})\\s*岁';
const professions = ['当铺老板', '当铺店主', '银行职员', '公司职员', '房地产经纪人', '警察', '刑警', '警官', '侦探', '医生', '护士', '教师', '老师', '教授', '律师', '记者', '作家', '学生', '店主', '老板', '职员', '工程师', '程序员', '会计', '司机', '工人', '主妇'];
const professionPattern = [...professions].sort((a, b) => b.length - a.length).map(escapePattern).join('|');
const compact = (value: string) => value.replace(/[\s的]/g, '');

function ageNumber(value: string) {
    const text = value.replace(/[\s岁]/g, '');
    if (/^[0-9]+$/.test(text)) return Number(text);
    const digits: Record<string, number> = {零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
    if (!/[十百]/.test(text)) return Number([...text].map(char => digits[char]).join(''));
    let number = 0;
    let digit = 0;
    for (const char of text) {
        if (char === '十' || char === '百') {number += (digit || 1) * (char === '十' ? 10 : 100); digit = 0;}
        else digit = digits[char];
    }
    return number + digit;
}

/** Conservative presentation of existing scoped facts, never new AI guesses.
 * Unknown attributes stay unknown; differing ages retain chapter provenance. */
export function readingPersonProfile(node: ReadingNode) {
    const named = [node.name, ...node.aliases].filter(Boolean).map(escapePattern).join('|');
    const names = named ? `(?:${named})` : '(?!)';
    const separators = '[，,、：:（(\\s]*';
    const ageCue = '(?:时年|当时|年仅|今年|年龄[：:为\\s]*|年纪[：:为\\s]*|死时|案发时|约|只有)?';
    const agePattern = new RegExp(`^(?:${names}${separators})?(?:(?:${professionPattern}|男性|女性|男|女)${separators})?${ageCue}(${ageText})|${names}${separators}(?:是|为)?(?:(?:${professionPattern})${separators})?${ageCue}(${ageText})|^(?:年龄|年纪)[：:为\\s]*(${ageText})`);
    const ages: PersonAttribute[] = [];
    const occupations: PersonAttribute[] = [];
    const facts = node.facts.filter(fact => fact.status === 'user' || fact.status === 'explicit' && fact.evidence);
    for (const fact of facts) {
        const evidence = fact.evidence?.quote || (fact.status === 'user' ? fact.description : '');
        const match = fact.description.trim().match(agePattern);
        const age = match?.slice(1).find(Boolean);
        const supported = age && [...evidence.matchAll(new RegExp(ageText, 'g'))].some(item => ageNumber(item[0]) === ageNumber(age));
        if (age && supported && !ages.some(item => ageNumber(item.value) === ageNumber(age) && item.fact.evidence?.chapterId === fact.evidence?.chapterId)) ages.push({value: age, fact});
        const labeled = fact.description.match(/(?:职业|职务|职位)[：:为\s]+([^，。；\n]{1,24})/)?.[1];
        const scoped = fact.description.trim().replace(new RegExp(`^${names}${separators}(?:是|为|曾是|曾任)?`), '');
        const compound = scoped.match(new RegExp(`^(?:是|为|曾是|担任)?([\\u4e00-\\u9fffA-Za-z]{0,10}(?:${professionPattern}))(?!的(?:儿子|女儿|妻子|丈夫|父亲|母亲))`))?.[1];
        const candidates = [labeled, compound, ...[...professions].sort((a, b) => b.length - a.length)].filter((value): value is string => !!value);
        const occupation = candidates.find(title => compact(fact.description).includes(compact(title)) && compact(evidence).includes(compact(title)) && !fact.description.includes(`${title}的儿子`) && !fact.description.includes(`${title}的女儿`));
        if (occupation && !occupations.some(item => item.value.endsWith(occupation))) {
            // A later complete title supersedes its generic suffix, but does
            // not erase unrelated professions or the source of the full title.
            for (let i = occupations.length - 1; i >= 0; i--) {
                if (occupation.endsWith(occupations[i].value)) occupations.splice(i, 1);
            }
            occupations.push({value: occupation, fact});
        }
    }
    return {ages, occupations, introduction: [...new Set(facts.map(fact => fact.description).filter(Boolean))].slice(0, 3)};
}
