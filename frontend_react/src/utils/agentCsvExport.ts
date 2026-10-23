import type {AgentConfig} from '@/types/api/setting';

export const AGENT_CSV_HEADERS = [
    '名字',
    '年龄说明',
    'MBTI',
    '身份与背景',
    '性格与判断倾向',
    '兴趣与生活偏好',
    '表达与相处方式',
    '外貌与服饰',
    '补充提示词',
] as const;

export function escapeCsvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function convertAgentsToCsv(agents: AgentConfig[]): string {
    const headerRow = AGENT_CSV_HEADERS.map(escapeCsvCell).join(',');
    const dataRows = agents.map(agent => {
        const row = [
            agent.name || '',
            agent.roleProfile?.age || '',
            agent.roleProfile?.mbti || '',
            agent.roleProfile?.identity || '',
            agent.roleProfile?.personality || '',
            agent.roleProfile?.preferences || '',
            agent.roleProfile?.expression || '',
            agent.roleProfile?.appearance || '',
            agent.prompt || '',
        ];
        return row.map(escapeCsvCell).join(',');
    });

    // 带有 UTF-8 BOM (\uFEFF)，确保在 Excel 中直接双击打开不会产生中文乱码
    return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
}

export function downloadAgentCsv(agents: AgentConfig[], fileName?: string): boolean {
    if (!agents || agents.length === 0) {
        return false;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const finalName = fileName || `Agent设定_${dateStr}.csv`;
    const csvContent = convertAgentsToCsv(agents);
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', finalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
}
