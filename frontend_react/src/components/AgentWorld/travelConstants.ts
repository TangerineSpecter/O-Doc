export const travelStatus: Record<string, string> = {
    active: '旅行进行中',
    waiting: '等待恢复',
    manual: '需要人工处理',
    paused: '已暂停',
    completed: '已返程',
    skipped: '本次未出行',
};

export const travelPhase: Record<string, string> = {
    preview: '准备目的地资料',
    choose: '选择目的地',
    plan: '准备行程',
    depart: '准备出发',
    food: '当地美食',
    buy: '纪念品购物',
    return: '返程',
    journal: '写旅行日记',
    publish: '发布日记',
    done: '完成',
};
