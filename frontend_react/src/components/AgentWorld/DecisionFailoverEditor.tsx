import {closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {ChevronDown, ChevronUp, GripHorizontal, Plus, X} from 'lucide-react';
import {useState} from 'react';
import type {DecisionConnection, DecisionFailoverState} from '../../types/api/decision';
import {Select} from '../common/Select';
import {formatStickyUntil, MAX_DECISION_FAILOVER, STICKY_TTL_OPTIONS} from './decisionFailover';

interface DecisionFailoverEditorProps {
    connections: DecisionConnection[];
    order: string[];
    ttlSeconds: string;
    failover: DecisionFailoverState | null;
    disabled?: boolean;
    onOrderChange: (ids: string[]) => void;
    onTtlChange: (seconds: string) => void;
}

function connectionName(connections: DecisionConnection[], id: string) {
    return connections.find(connection => connection.id === id)?.name || `不可用连接（${id}）`;
}

function ChainRow({
    id, index, total, name, disabled, onMove, onRemove,
}: {
    id: string;
    index: number;
    total: number;
    name: string;
    disabled: boolean;
    onMove: (index: number, delta: number) => void;
    onRemove: (id: string) => void;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id, disabled});
    const first = index === 0;
    return (
        <li
            ref={setNodeRef}
            style={{
                transform: CSS.Translate.toString(transform),
                transition: isDragging ? undefined : transition,
                zIndex: isDragging ? 20 : undefined,
                position: 'relative',
            }}
            className={`flex flex-wrap items-center gap-2 rounded-xl border px-2 py-2 ${isDragging ? 'shadow-lg ring-2 ring-orange-300' : ''} ${first ? 'border-orange-100 bg-orange-50/70' : 'border-slate-200 bg-white'}`}
        >
            <button
                type="button"
                aria-label={`拖动调整${name}的顺序`}
                disabled={disabled}
                className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-orange-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                style={{touchAction: 'none'}}
                {...attributes}
                {...listeners}
            >
                <GripHorizontal className="h-4 w-4"/>
            </button>
            <span className={`w-4 text-xs font-semibold ${first ? 'text-orange-700' : 'text-slate-400'}`}>{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{name}</span>
            {first && <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">先用</span>}
            <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-label={`上移${name}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:text-orange-600 disabled:opacity-40"><ChevronUp className="h-3.5 w-3.5"/>上移</button>
                <button type="button" aria-label={`下移${name}`} disabled={disabled || index === total - 1} onClick={() => onMove(index, 1)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:text-orange-600 disabled:opacity-40"><ChevronDown className="h-3.5 w-3.5"/>下移</button>
                <button type="button" aria-label={`移出顺序${name}`} disabled={disabled || total <= 1} onClick={() => onRemove(id)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-100 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"><X className="h-3.5 w-3.5"/>移出</button>
            </div>
        </li>
    );
}

export function DecisionFailoverEditor({
    connections, order, ttlSeconds, failover, disabled = false, onOrderChange, onTtlChange,
}: DecisionFailoverEditorProps) {
    const [pending, setPending] = useState('');
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );
    const used = new Set(order);
    const available = connections.filter(connection => !used.has(connection.id));
    const pendingValue = available.some(connection => connection.id === pending) ? pending : (available[0]?.id || '');
    const stickyName = failover?.stickyConnectionId ? connectionName(connections, failover.stickyConnectionId) : '';
    const atLimit = order.length >= MAX_DECISION_FAILOVER;

    const move = (index: number, delta: number) => {
        const next = index + delta;
        if (next < 0 || next >= order.length) return;
        onOrderChange(arrayMove(order, index, next));
    };

    const onDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;
        const from = order.indexOf(String(active.id));
        const to = order.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onOrderChange(arrayMove(order, from, to));
    };

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
                <p className="text-xs font-semibold text-slate-700">决策顺序</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                    选择哪些决策模型加入这条链，再拖动或用上移、下移排列。可以只放一个，也可以放两个、三个或更多，最多 {MAX_DECISION_FAILOVER} 个。平时从第一位开始；它挂起、超时或返回无效结果时，按顺序试后面的模型。觉得第一位不稳定时，把已经稳定的模型拖到第一位。每个模型单独最多等 60 秒，不占用后面的模型，也不占用普通文本回退的 60 秒。
                </p>
            </div>
            <p role="status" className={`rounded-lg border px-3 py-2 text-xs leading-5 ${failover?.stickyConnectionId ? 'border-lime-200 bg-lime-50 text-lime-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                {failover?.stickyConnectionId && failover.stickyUntil
                    ? `当前暂时沿用「${stickyName}」，${formatStickyUntil(failover.stickyUntil)} 后重新从顺序第一位开始。这个状态只在本机，不随 WebDAV 同步。保存新的顺序后，会按新的第一位重新开始。`
                    : '平时从顺序第一位开始。后面的模型成功后才会暂时沿用，到期再回到当时的第一位。'}
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                    <ol className="space-y-2">
                        {order.map((id, index) => (
                            <ChainRow
                                key={id}
                                id={id}
                                index={index}
                                total={order.length}
                                name={connectionName(connections, id)}
                                disabled={disabled}
                                onMove={move}
                                onRemove={removed => onOrderChange(order.filter(item => item !== removed))}
                            />
                        ))}
                    </ol>
                </SortableContext>
            </DndContext>
            {order.length <= 1 && <p className="text-xs leading-5 text-slate-500">至少保留一个。要换掉它，先把另一个模型加入顺序，再移出这一个。</p>}
            {available.length > 0 && !atLimit ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                        <Select menuPortal value={pendingValue} options={available.map(connection => ({value: connection.id, label: connection.name, description: connection.modelId}))} onChange={setPending} placeholder="选择要加入顺序的决策模型" disabled={disabled}/>
                    </div>
                    <button type="button" disabled={disabled || !pendingValue} onClick={() => onOrderChange([...order, pendingValue])} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"><Plus className="h-3.5 w-3.5"/>加入顺序</button>
                </div>
            ) : (
                <p className="text-xs leading-5 text-slate-500">{atLimit ? `这条顺序最多 ${MAX_DECISION_FAILOVER} 个决策模型。` : '在 AI 模型接入 → 决策模型连接中再添加一个模型，就可以排进这条顺序。'}</p>
            )}
            <label className="block space-y-2 text-sm font-semibold text-slate-700">
                <span>暂时沿用时间</span>
                <Select menuPortal value={ttlSeconds} options={STICKY_TTL_OPTIONS.map(option => ({value: option.value, label: option.label, description: option.description}))} onChange={onTtlChange} disabled={disabled}/>
            </label>
        </div>
    );
}
