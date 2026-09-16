import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, X} from 'lucide-react';
import {getReadingNode, readingError} from '../../api/bookAnalysis';
import type {ReadingGraph, ReadingNode, SourceEvidence} from '../../types/bookAnalysis';
import {nodeColors, nodeLabels} from '../../utils/readingGraph';
import NodeCorrections from './NodeCorrections';
import ReadingNodeDetails from './ReadingNodeDetails';

interface Props {throughChapter?: number; bookId: string; revisionId: string; nodeId: string; graph: ReadingGraph; canManage: boolean; refreshKey: string; canGoBack: boolean; onSelect: (id: string) => void; onBack: () => void; onClose: () => void; onRead: (source: SourceEvidence) => void; onSaved: () => void}
export default function ReadingNodePanel({bookId, revisionId, nodeId, graph, canManage, refreshKey, throughChapter, canGoBack, onSelect, onBack, onClose, onRead, onSaved}: Props) {
    const [data, setData] = useState<{node: ReadingNode; neighbors: ReadingGraph} | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const body = useRef<HTMLDivElement>(null);
    useEffect(() => {setPage(1); if (body.current) body.current.scrollTop = 0;}, [nodeId]);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError(''); setData(null);
        getReadingNode(bookId, nodeId, page, controller.signal, revisionId, throughChapter).then(value => {if (!controller.signal.aborted) setData(value);}).catch(err => {if (!controller.signal.aborted) setError(readingError(err));}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [bookId, revisionId, nodeId, page, refreshKey, throughChapter]);
    const node = data?.node;
    return <aside aria-label="阅读对象详情" className="fixed inset-0 z-40 flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white sm:sticky sm:inset-auto sm:top-20 sm:z-auto sm:h-[calc(100dvh-7rem)] sm:max-h-[780px] sm:w-[310px] sm:shrink-0 sm:rounded-xl sm:border sm:border-slate-200 xl:w-[340px]">
        <header className="relative shrink-0 border-b border-slate-100 px-4 py-4">
            <div className="absolute right-3 top-3 flex items-center gap-1">
                {canGoBack && <button type="button" onClick={onBack} aria-label="返回上一个卡片" className="inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs text-orange-700 hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"><ArrowLeft className="h-3.5 w-3.5"/>返回</button>}
                <button type="button" aria-label="关闭节点详情" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4"/></button>
            </div>
            {node ? <><span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><i className="h-2 w-2 rounded-full" style={{background: nodeColors[node.kind]}}/>{nodeLabels[node.kind]}</span><h2 className="mr-6 mt-2 break-words font-serif text-xl font-bold text-slate-800">{node.name}</h2></> : <p className="mr-6 text-xs text-slate-500">对象详情</p>}
        </header>
        <div ref={body} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
            {loading && <p className="py-8 text-center text-xs text-slate-400">正在加载原文和关联…</p>}{error && <p role="alert" className="py-8 text-sm text-red-600">{error}</p>}
            {node && data && <><ReadingNodeDetails node={node} neighbors={data.neighbors} page={page} onPage={setPage} onSelect={onSelect} onRead={onRead}/>{canManage && <NodeCorrections key={node.id} bookId={bookId} node={node} nodes={[...graph.nodes, ...data.neighbors.nodes]} edges={data.neighbors.edges} onSaved={onSaved}/>}</>}
        </div>
    </aside>;
}
