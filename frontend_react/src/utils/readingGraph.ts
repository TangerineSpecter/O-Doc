import type {ReadingGraph, ReadingNode} from '../types/bookAnalysis';

export const nodeLabels: Record<string, string> = {event: '情节', person: '人物', place: '地点', time: '时间', clue: '线索 / 物品', concept: '概念', claim: '观点', method: '方法', example: '案例'};
export const nodeColors: Record<string, string> = {event: '#f97316', person: '#e76b72', place: '#84b847', time: '#4689b7', clue: '#ad72b1', concept: '#438f92', claim: '#dba34d', method: '#7493cc', example: '#8faa68'};
export const relationLabels: Record<string, string> = {participates: '参与', located_at: '发生于', at_time: '发生时间', clue_in: '线索出现', reveals: '揭示', related_to: '关联', family: '亲属', ally: '盟友', enemy: '敌对', mentor: '师徒', next: '顺序', causes: '导致', depends_on: '依赖', contrasts: '对比', applies_to: '应用', illustrates: '例证', contains: '包含', method_step: '步骤'};
export interface ReadingTree {name: string; id?: string; children?: ReadingTree[]}
export function buildReadingTree(graph: ReadingGraph, title: string): ReadingTree {
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const parents = new Map<string, string>();
    for (const edge of graph.edges) {
        const parent = edge.kind === 'contains' ? edge.source : edge.kind === 'depends_on' ? edge.target : '';
        const child = edge.kind === 'contains' ? edge.target : edge.source;
        if (parent && parent !== child && nodes.has(parent) && nodes.has(child) && !parents.has(child)) parents.set(child, parent);
    }
    const visited = new Set<string>();
    const branch = (node: ReadingNode): ReadingTree => {
        visited.add(node.id);
        return {name: node.name, id: node.id, children: graph.nodes.filter(n => parents.get(n.id) === node.id && !visited.has(n.id)).map(branch)};
    };
    const children = graph.nodes.filter(node => !parents.has(node.id)).map(branch);
    for (const node of graph.nodes) if (!visited.has(node.id)) children.push(branch(node));
    return {name: title, children};
}
