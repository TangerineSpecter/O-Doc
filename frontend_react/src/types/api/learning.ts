export interface LearningConfig {
    learningMode: 'classic' | 'scenario';
    goal: string; subject: string; scenarios: string[]; level: string; minutes: number;
    questionCount: number; pendingLimit: number; teacherName: string; modelId: string;
    style: string; scheduleTime: string; timezone: string;
}
export interface LearningRequest {id: string; kind: string; targetId: string; status: string; error: string}
export interface Stage {title: string; focus: string}
export interface LearningPlan {id: string; stages: Stage[]; stage: number; confirmed: boolean}
export interface Evidence {attemptId: string; exerciseId: string; score: number; assisted: boolean; date: string; review: boolean}
export interface Knowledge {id: string; name: string; status: string; evidence: Evidence[]; dueAt: string | null; lastScore: number | null}
export interface ExerciseSummary {id: string; title: string; kind: string; format: 'classic' | 'scenario'; status: string; createdAt: string; questionCount: number}
export interface ChatMessage {id: string; role: string; content: string; attemptId: string | null; questionId: string; createdAt: string}
export interface Evaluation {id: string; result: {summary: string; recommendation: string; nextFocus: string}; evidence: string[]; createdAt: string}
export interface CourseData {
    skills?: KnowledgeSkills[]; items?: LearningItem[]; growth?: LearningGrowth;
    title: string; config: LearningConfig | null; autoEnabled?: boolean; modelAvailable?: boolean;
    pendingCount?: number; completedCount?: number; plan?: LearningPlan | null; stageCompleted?: number; stageEvaluationDue?: boolean;
    assessment?: {status: string; evidenceCount: number; points: {id: string; name: string; guidance: string; reason: string}[]};
    knowledge?: Knowledge[]; evaluations?: Evaluation[]; corrections?: {id: string; content: string; createdAt: string}[];
    exercises?: ExerciseSummary[]; requests?: LearningRequest[]; messages?: ChatMessage[];
}
export interface Question {id: string; type: 'choice' | 'fill' | 'short' | 'translation'; prompt: string; options: string[]; knowledgeId: string; knowledgeName: string; review: boolean; referenceAnswer?: string; explanation?: string}
export interface GradeItem {questionId: string; skipped: boolean; score: number | null; feedback: string; naturalExpression: string; dimensions: {score: number; maxScore: number; reason: string; verdict: string}[]}
export interface GradeResult {items: GradeItem[]; score: number | null; answered: number; total: number; completion: number}
export interface Attempt {id: string; answers: Record<string, string>; assisted: string[]; revision: number; status: string; reviewRequested: boolean; submittedAt: string | null; grade: GradeResult | null; grades: {id: string; version: number; result: GradeResult; createdAt: string}[]; revisions: AnswerRevision[]}
export interface Exercise extends ExerciseSummary {introduction: string; questions: Question[]; attempt: Attempt | null; attempts: Attempt[]; requests: LearningRequest[]; teaching: LessonTeaching | Record<string, never>; session: LearningSession | null; sessionHistory: LearningSession[]}
export interface LearningModel {id: string; name: string; displayName: string | null}

export interface GoalProposal {subject: string; id: string; status: string; selected: string[]; supplement: string; error: string; result: {goal?: string; scenarios?: string[]; note?: string}}

export interface LearningSubject {id: string; name: string; directions: {id: string; label: string; description: string}[]; legacyDirections: Record<string, string>}

export interface SkillEvidence extends Evidence {example: string; feedback: string}
export interface SkillState {status: string; dueAt: string | null; lastScore: number | null; evidence: SkillEvidence[]}
export interface KnowledgeSkills {id: string; name: string; recognition: SkillState; expression: SkillState}
export interface LearningGrowth {expressionCount: number; nextFocus: string[]; independentExamples: (SkillEvidence & {knowledgeName: string})[]; repeatedDifficulties: {knowledgeName: string; count: number; feedback: string}[]}
export interface LearningItemInput {kind: 'word' | 'chunk' | 'frame'; text: string; meaning: string; example: string; usage: string; sourceExerciseId?: string | null}
export interface LearningItem extends LearningItemInput {id: string; knowledgeId: string; sourceExerciseId: string | null; createdAt: string; recognition: SkillState; expression: SkillState}
export interface LessonExpression extends Omit<LearningItemInput, 'sourceExerciseId'> {knowledgeId: string; knowledgeName: string}
export interface LessonTeaching {task: string; role: string; opening: string; understanding: string; dialogue: {speaker: string; text: string; meaning: string}[]; expressions: LessonExpression[]; substitutions: {prompt: string; frame: string}[]}
export type LessonPhase = 'demo' | 'expressions' | 'substitution' | 'conversation' | 'verification' | 'completed' | 'ended';
export interface LessonTurn {id: string; kind: string; position: number; content: string; status: string; result: {reply?: string; feedback?: string; corrections?: string[]}}
export interface LearningSession {id: string; phase: LessonPhase; revision: number; draftText: string; attemptId: string | null; pending: boolean; feedback: LessonTurn['result']; turns: LessonTurn[]}
export interface AnswerRevision {id: string; questionId: string; originalAnswer: string; content: string; feedback: string; status: string; createdAt: string}
