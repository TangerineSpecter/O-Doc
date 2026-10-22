import type {ResidentId} from './types';

const lines: Record<string, Record<ResidentId, string[]>> = {
    fire: {
        klee: ['只烤棉花糖，不炸鱼。可莉记住啦！', '再烤三秒！三、二……哎呀，变焦糖啦。', '这个火候，琴团长看了也会夸吧？'],
        anya: ['她心里说的“三秒”，好像有点危险。', '阿尼亚负责吃。分工非常合理。', '棉花糖没有花生味，扣一小分。'],
    },
    bench: {
        klee: ['今天的冒险任务：把晚霞看完！', '可莉可以安静坐一分钟……半分钟也行！'],
        anya: ['坐着也算冒险吗？阿尼亚喜欢这个规则。', '世界和平。还有点心自由。'],
    },
    picnic: {
        klee: ['篮子里的点心，可以分可莉一半吗？', '冒险补给完毕，下一站去哪里呢？'],
        anya: ['花生，花生，阿尼亚的快乐能源！', '这包花生，阿尼亚会用生命……用口袋保护。'],
    },
    pond: {
        klee: ['今天用鱼竿！可莉是专业钓鱼选手！', '小鱼小鱼，快来看看我的新鱼竿。'],
        anya: ['鱼的心声：今天不想加班。', '阿尼亚和鱼都在等对方先动。'],
    },
    rock: {
        klee: ['这块石头像不像一只睡着的嘟嘟可？', '小石头挡路啦，可莉轻轻跳过去！'],
        anya: ['石头的想法……什么都没有。很羡慕。', '阿尼亚宣布：这是花生形状的石头。'],
    },
    tree: {
        klee: ['树洞里会不会有一张藏宝图？', '小松鼠！可莉今天没有带蹦蹦炸弹。'],
        anya: ['松鼠藏花生的地方，阿尼亚想知道。', '侦察结束。发现一只非常忙的松鼠。'],
    },
    cabin: {
        klee: ['有人在家吗？可莉想借两个杯子！', '小屋好暖和，像一块烤好的面包。'],
        anya: ['秘密基地。阿尼亚喜欢这个。', '如果这里有电视，就更完美了。'],
    },
};

export function activityLine(object: string, id: ResidentId, index: number): string {
    const choices = lines[object]?.[id] ?? ['这里真好，想再待一会儿。'];
    return choices[index % choices.length];
}

export const greetings: Record<ResidentId, string[]> = {
    klee: ['你也来营地玩啦！可莉带你去冒险！', '嘘——今天的任务是做一个乖孩子。'],
    anya: ['哇酷哇酷！你在观察阿尼亚吗？', '阿尼亚没有偷吃。只是提前检查点心。'],
};
