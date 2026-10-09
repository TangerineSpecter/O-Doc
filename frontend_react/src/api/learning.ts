import request from '../utils/request';
import type {Attempt, CourseData, Exercise, LearningConfig, LearningModel, LearningRequest, Stage, GoalProposal, LearningSubject} from '../types/api/learning';
type AttemptWire = Omit<Attempt, 'answers'> & {answerItems: {questionId: string; answer: string}[]};
type ExerciseWire = Omit<Exercise, 'attempt' | 'attempts'> & {attempt: AttemptWire | null; attempts: AttemptWire[]};
const normalizeAttempt = (value: AttemptWire): Attempt => ({...value, answers: Object.fromEntries(value.answerItems.map(v => [v.questionId, v.answer]))});
const normalizeExercise = (value: ExerciseWire): Exercise => ({...value, attempt: value.attempt ? normalizeAttempt(value.attempt) : null, attempts: value.attempts.map(normalizeAttempt)});
const base = (id: string) => `/learning/${encodeURIComponent(id)}/`;
export const learningApi = {
    course: (id: string, signal?: AbortSignal) => request.get<unknown, CourseData>(base(id), {signal}),
    catalog: (signal?: AbortSignal) => request.get<unknown, {subjects: LearningSubject[]}>('/learning/catalog/', {signal}),
    models: () => request.get<unknown, LearningModel[]>('/learning/models/'),
    configure: (id: string, config: LearningConfig, autoEnabled: boolean, goalProposalId?: string) => request.put<unknown, CourseData>(base(id), {...config, autoEnabled, goalProposalId}),
    goal: (id: string, proposalId?: string, signal?: AbortSignal) => request.get<unknown, GoalProposal | null>(`${base(id)}goals/`, {params: proposalId ? {proposal_id: proposalId} : {}, signal}),
    prepareGoal: (id: string, selected: string[], supplement: string, modelId: string, style: string, requestKey: string, subject: string) => request.post<unknown, GoalProposal>(`${base(id)}goals/`, {selected, supplement, modelId, style, requestKey, subject}),
    generate: (id: string, requestKey: string) => request.post<unknown, {request: LearningRequest | null; created: boolean; course: CourseData}>(`${base(id)}generate/`, {requestKey}),
    exercise: (id: string, ex: string, signal?: AbortSignal) => request.get<unknown, ExerciseWire>(`${base(id)}exercises/${ex}/`, {signal}).then(normalizeExercise),
    exerciseAction: (id: string, ex: string, action: 'start' | 'end') => request.post<unknown, ExerciseWire>(`${base(id)}exercises/${ex}/`, {action}).then(normalizeExercise),
    save: (id: string, attempt: string, revision: number, answers: Record<string, string>) => request.put<unknown, AttemptWire>(`${base(id)}attempts/${attempt}/`, {revision, answerItems: Object.entries(answers).map(([questionId, answer]) => ({questionId, answer}))}).then(normalizeAttempt),
    submit: (id: string, attempt: string, action: 'submit' | 'retry' | 'review', requestKey: string, confirmSkips = false) => request.post<unknown, LearningRequest>(`${base(id)}attempts/${attempt}/`, {action, requestKey, confirmSkips}),
    answer: (id: string, attempt: string, questionId: string) => request.post<unknown, {referenceAnswer: string; explanation: string; attempt: AttemptWire}>(`${base(id)}attempts/${attempt}/`, {action: 'answer', questionId}).then(value => ({...value, attempt: normalizeAttempt(value.attempt)})),
    plan: (id: string, planId: string, stages: Stage[], stage: number) => request.post<unknown, CourseData>(`${base(id)}plan/`, {planId, stages, stage}),
    chat: (id: string, content: string, requestKey: string, attemptId?: string, questionId?: string) => request.post<unknown, LearningRequest>(`${base(id)}chat/`, {content, requestKey, attemptId, questionId}),
    evaluate: (id: string, requestKey: string) => request.post<unknown, CourseData>(`${base(id)}profile/`, {requestKey}),
    correct: (id: string, content: string) => request.post<unknown, CourseData>(`${base(id)}profile/`, {action: 'correct', content}),
};
