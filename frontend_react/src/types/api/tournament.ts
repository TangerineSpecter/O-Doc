export type TournamentStatus = 'active' | 'completed' | 'skipped';
export interface TournamentResult {podium?: Record<string, string>; bronzeCandidates?: string[]}
export interface TournamentSummary {
    id: string; week: string; status: TournamentStatus; participantCount: number;
    roster: {id: string; name: string; avatar?: string}[]; result: TournamentResult;
    createdAt: string; endedAt: string | null; nextRoundAt: string | null;
}
export interface MatchResult {winnerId?: string; loserId?: string; reason?: string}
export interface TournamentMatch {
    id: string; number: number; kind: 'main' | 'bronze'; leftId: string; rightId: string;
    status: 'pending' | 'done'; result: MatchResult; playedAt: string | null;
}
export interface TournamentRound {
    id: string; number: number; phase: 'preliminary' | 'main' | 'final'; entrantCount: number;
    status: 'pending' | 'done'; scheduledAt: string; completedAt: string | null; matches: TournamentMatch[];
}
export interface TournamentEquipment {
    name: string; level: number; quality: 'gold' | 'blue'; slot: string; value: string;
    stats: Record<string, number>; affixes: {id: string; stat: string; value: number}[];
}
export interface TournamentPotion {recipeId: string; name: string; price: string; stars: number; quantity: number}
export interface TournamentReward {
    id: string; place: number; actorId: string; status: 'pending' | 'rolled' | 'granted' | 'forfeited'; grantedAt: string | null;
    result: {item?: TournamentEquipment; slot?: string; source?: string; potions?: TournamentPotion[]};
}
export interface TournamentDetail extends TournamentSummary {rounds: TournamentRound[]; rewards: TournamentReward[]}
export interface TournamentOverview {event: TournamentDetail | null; autoEnabled: boolean; nextDrawAt: string}
export interface TournamentHistory {items: TournamentSummary[]; total: number; page: number}
export interface DuelParticipant {
    actorId: string;
    name: string;
    profession: string;
    level: number;
    avatar?: string;
    stats: Record<string, number | string>;
    skills: Record<string, number>;
}
export interface DuelEvent {
    actor: string; target?: string; action: string; kind: string;
    damage?: number; absorbed?: number; healing?: number; restored?: number; hit?: boolean; critical?: boolean;
}
export interface DuelRound {
    number: number; overtime: boolean; order: string[]; events: DuelEvent[];
    resources: {actorId: string; hp: number; mp: number}[];
}
export interface TournamentMatchDetail extends TournamentMatch {
    report: {participants?: DuelParticipant[]; rounds?: DuelRound[]};
}
