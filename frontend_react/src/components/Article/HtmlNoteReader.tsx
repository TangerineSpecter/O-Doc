import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {FileCode2, Loader2} from 'lucide-react';
import {useHtmlNote} from '../../hooks/useHtmlNote';
import {useReadStats} from '../../hooks/useReadStats';
import {convertHtmlNote, downloadHtmlSource} from '../../api/htmlNote';
import {syncArticleToRag} from '../../api/rag';
import {useToast} from '../common/ToastProvider';
import {useAuth} from '../../contexts/AuthContext';
import HtmlNoteMetadataModal from './HtmlNoteMetadataModal';
import type {ArticleProps} from './ArticleReader';

export default function HtmlNoteReader(props: ArticleProps) {
    const {html, error, loading, retry} = useHtmlNote(props.articleId);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [synced, setSynced] = useState(!!props.isRagSynced);
    const navigate = useNavigate();
    const toast = useToast();
    const {isAuthenticated, userInfo} = useAuth();
    const canManage = isAuthenticated && props.canManage && (props.author === userInfo?.userid || (props.author === 'admin' && userInfo?.username === 'admin'));
    useReadStats(props.articleId);
    useEffect(() => {props.onTocAvailabilityChange?.(false); setSynced(!!props.isRagSynced);}, [props.articleId, props.isRagSynced, props.onTocAvailabilityChange]);
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try {await action();} catch (reason) {toast.error(reason instanceof Error ? reason.message : '操作失败');}
        finally {setBusy(false);}
    };
    const buttonClass = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50';
    return <section className="bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            {props.onBack && <button className={buttonClass} onClick={props.onBack}>返回目录</button>}
            <span className="mr-auto inline-flex items-center gap-2 text-xs text-slate-500"><FileCode2 size={14}/><span className="max-w-64 truncate">{props.title}</span> · HTML 原样笔记 · 只读</span>
            {props.downloadUrl && <button disabled={busy} className={buttonClass} onClick={() => void run(() => downloadHtmlSource(props.downloadUrl!, props.title || '笔记'))}>下载原文件</button>}
            {canManage && <>
                <button disabled={busy} className={buttonClass} onClick={() => setEditing(true)}>编辑资料</button>
                <button disabled={busy || !props.content?.trim()} className={buttonClass} onClick={() => void run(async () => {await syncArticleToRag(props.articleId!); setSynced(true); toast.success('正文已同步到知识库');})}>{synced ? '重新同步 RAG' : '同步 RAG'}</button>
                <button disabled={busy || !props.content?.trim()} className={buttonClass} onClick={() => void run(async () => {const copy = await convertHtmlNote(props.articleId!); navigate(`/editor/${copy.articleId}`);})}>转换为可编辑笔记</button>
                {props.onDelete && <button disabled={busy} className={buttonClass} onClick={props.onDelete}>删除</button>}
            </>}
        </div>
        {loading ? <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="animate-spin"/></div> : error ? <div role="alert" className="p-6 text-sm text-red-600">{error}<button className={`${buttonClass} ml-3`} onClick={retry}>重试</button></div> : <iframe title={props.title || 'HTML 笔记'} srcDoc={html} sandbox="" referrerPolicy="no-referrer" className="block h-[calc(100vh-145px)] min-h-[480px] w-full border-0 bg-white"/>}
        {editing && <HtmlNoteMetadataModal note={props} onClose={() => setEditing(false)} onSaved={collId => {setEditing(false); navigate(`/article/${collId}/${props.articleId}`); window.location.reload();}}/>}
    </section>;
}
