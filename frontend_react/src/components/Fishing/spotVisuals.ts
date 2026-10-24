/** 内置钓点的展示元数据；解锁和结算以服务端规则为准。 */
export const fishingSpots = {
    pond: {name: '青苇池塘', level: 1, description: '苇叶轻摇，等一圈水纹'},
    river: {name: '流光河湾', level: 10, description: '顺着流水，等一尾银光'},
    lake: {name: '镜月湖畔', level: 20, description: '树影落在湖心，浮漂轻轻摇晃'},
    stream: {name: '松影溪涧', level: 30, description: '松根卧在石间，溪水带着银光'},
    wetland: {name: '雾苇湿地', level: 40, description: '薄雾漫过芦苇，枯木下藏着鱼影'},
    bay: {name: '咸风海湾', level: 50, description: '咸风吹过栈桥，潮水拍着沙岸'},
    reef: {name: '珊瑚浅礁', level: 60, description: '珊瑚映在清水里，白沙间游过斑斓'},
    frost_lake: {name: '霜镜寒湖', level: 70, description: '碎冰轻碰湖岸，雪松守着深蓝'},
    hot_spring: {name: '赤岩温泉', level: 80, description: '温暖支流穿过赤岩，水汽拂过浮漂'},
    trench: {name: '幽蓝海沟', level: 90, description: '从断崖抛向深水，等一盏幽蓝星灯'},
} as const;
export type FishingSpot = keyof typeof fishingSpots;

export const fishingSpotOptions = (Object.keys(fishingSpots) as FishingSpot[]).map(value => ({
    value, label: `${fishingSpots[value].name} · Lv.${fishingSpots[value].level}`,
}));
