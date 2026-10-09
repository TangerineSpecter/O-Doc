export interface LearningConfig {
    goal: string; subject: string; scenarios: string[]; level: string; minutes: number;
    questionCount: number; pendingLimit: number; teacherName: string; modelId: string;
    style: string; scheduleTime: string; timezone: string;
}
export interface LearningRequest {id: string; kind: string; targetId: string; status: string; error: string}
export interface Stage {title: string; focus: string}
export interface LearningPlan {id: string; stages: Stage[]; stage: number; confirmed: boolean}
export interface Evidence {attemptId: string; exerciseId: string; score: number; assisted: boolean; date: string; review: boolean}
export interface Knowledge {id: string; name: string; status: string; evidence: Evidence[]; dueAt: string | null; lastScore: number | null}
export interface ExerciseSummary {id: string; title: string; kind: string; status: string; createdAt: string; questionCount: number}
export interface ChatMessage {id: string; role: string; content: string; attemptId: string | null; questionId: string; createdAt: string}
export interface Evaluation {id: string; result: {summary: string; recommendation: string; nextFocus: string}; evidence: string[]; createdAt: string}
export interface CourseData {
    title: string; config: LearningConfig | null; autoEnabled?: boolean; modelAvailable?: boolean;
    pendingCount?: number; completedCount?: number; plan?: LearningPlan | null; stageCompleted?: number; stageEvaluationDue?: boolean;
    assessment?: {status: string; evidenceCount: number; points: {id: string; name: string; guidance: string; reason: string}[]};
    knowledge?: Knowledge[]; evaluations?: Evaluation[]; corrections?: {id: string; content: string; createdAt: string}[];
    exercises?: ExerciseSummary[]; requests?: LearningRequest[]; messages?: ChatMessage[];
}
export interface Question {id: string; type: 'choice' | 'fill' | 'short' | 'translation'; prompt: string; options: string[]; knowledgeId: string; knowledgeName: string; review: boolean; referenceAnswer?: string; explanation?: string}
export interface GradeItem {questionId: string; skipped: boolean; score: number | null; feedback: string; naturalExpression: string; dimensions: {score: number; maxScore: number; reason: string; verdict: string}[]}
export interface GradeResult {items: GradeItem[]; score: number | null; answered: number; total: number; completion: number}
export interface Attempt {id: string; answers: Record<string, string>; assisted: string[]; revision: number; status: string; reviewRequested: boolean; submittedAt: string | null; grade: GradeResult | null; grades: {id: string; version: number; result: GradeResult; createdAt: string}[]}
export interface Exercise extends ExerciseSummary {introduction: string; questions: Question[]; attempt: Attempt | null; attempts: Attempt[]; requests: LearningRequest[]}
export interface LearningModel {id: string; name: string; displayName: string | null}

export interface GoalProposal {subject: string; id: string; status: string; selected: string[]; supplement: string; error: string; result: {goal?: string; scenarios?: string[]; note?: string}}

export interface LearningSubject {id: string; name: string; directions: {id: string; label: string; description: string}[]; legacyDirections: Record<string, string>}
