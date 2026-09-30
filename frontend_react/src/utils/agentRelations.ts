import type {AgentRelationGraph} from '../types/api/setting';

export interface ResidentRelation {
    id: string;
    name: string;
    avatar: string;
    tier: string;
    mine: number | null;
    theirs: number | null;
    isUser: boolean;
}

export const residentRelations = (agentId: string, graph: AgentRelationGraph | null): ResidentRelation[] =>
    (graph?.edges || []).flatMap(edge => {
        const source = edge.sourceId === agentId;
        if (!source && edge.targetId !== agentId) return [];
        const id = source ? edge.targetId : edge.sourceId;
        const node = graph?.nodes.find(n => n.id === id);
        return [{id, name: source ? edge.targetName : edge.sourceName, avatar: node?.avatar || '', tier: edge.tier,
            mine: source ? edge.sourceScore : edge.targetScore, theirs: source ? edge.targetScore : edge.sourceScore,
            isUser: node?.kind === 'user'}];
    });
