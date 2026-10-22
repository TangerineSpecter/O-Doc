export interface LotteryRules {
    version: number; ticketPrice: string; ticketLimit: number; subsidy: string;
    secondPrize: string; thirdPrize: string;
}
export interface LotteryConfig {enabled: boolean; firstDrawAt: string | null; rules: LotteryRules}
export interface LotteryAward {actorId: string; actorName: string; tier: number; winningTickets: number; amount: string}
export interface LotteryResult {
    winningNumbers?: number[]; ticketCount?: number; sales?: string; subsidy?: string;
    carryIn?: string; pool?: string; carryOut?: string; awards?: LotteryAward[];
}
export interface LotteryRound {
    id: string; sequence: number; status: 'open' | 'settled'; opensAt: string; closesAt: string;
    drawsAt: string; rules: LotteryRules; pool: string; ticketCount: number; result: LotteryResult; settledAt: string | null;
}
export interface LotteryOverview {config: LotteryConfig; round: LotteryRound | null}
export interface LotteryTicket {
    id: string; actorId: string; actorName: string; numbers: number[]; createdAt: string; matches: number | null;
}
export interface LotteryPage<T> {items: T[]; total: number; page: number}
