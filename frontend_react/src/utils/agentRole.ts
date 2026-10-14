import type {RoleProfile} from '@/types/api/agentPrompt';

export const roleFields = [
    ['identity', '身份与背景', '身份、背景与人物所处阶段'],
    ['personality', '性格与判断倾向', '在意什么，如何判断，发生分歧时怎样取舍'],
    ['preferences', '兴趣与生活偏好', '喜好、厌恶、关注的话题与生活节奏'],
    ['expression', '表达与相处方式', '说话、关心、情绪表达，以及熟悉后的变化'],
    ['appearance', '外貌与服饰', '发型、五官、衣着；绘制风格请放在生图配置中'],
] as const;
export const emptyRoleProfile: RoleProfile = {age: '', mbti: '', identity: '', personality: '', preferences: '', expression: '', appearance: ''};
export const fullRoleText = (name: string, profile: Partial<RoleProfile>, prompt: string) => [
    `姓名：${name}`, profile.age && `年龄：${profile.age}`, profile.mbti && `人格参考：${profile.mbti}`,
    ...roleFields.map(([key, label]) => profile[key] && `## ${label}\n${profile[key]}`),
    prompt && `## 补充提示词\n${prompt}`,
].filter(Boolean).join('\n\n');
