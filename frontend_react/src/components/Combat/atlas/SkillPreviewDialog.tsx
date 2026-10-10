import {lazy,Suspense,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {useEscapeDismissal} from '../../../hooks/useEscapeDismissal';
import type {AtlasSkillProfile} from '../animation/skillPreview/atlasSkillProfiles';
const AtlasSkillDemo=lazy(()=>import('../animation/skillPreview/AtlasSkillDemo'));

export function SkillPreviewDialog({jobId,jobName,skill,onClose}:{jobId:string;jobName:string;skill:AtlasSkillProfile;onClose:()=>void}) {
    const dialog=useRef<HTMLElement>(null);
    useEscapeDismissal(true,onClose);
    useEffect(()=>{
        const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
        dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
        return()=>{if(previous?.isConnected)previous.focus();};
    },[]);
    return createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm" onClick={onClose}>
        <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="atlas-skill-title"
            onClick={e=>e.stopPropagation()} onKeyDown={e=>{
                if(e.key!=='Tab')return;
                const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
                if(!controls?.length)return;
                const first=controls[0],last=controls[controls.length-1];
                if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
                else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
            }} className="scrollbar-hide max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <header className="mb-4 flex items-center justify-between gap-3">
                <div><p className="mb-1 text-xs text-slate-400">{jobName} · 主动技能</p><h2 id="atlas-skill-title" className="text-lg font-bold text-slate-800">{skill.name}</h2></div>
                <button type="button" aria-label="关闭技能预览" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5"/></button>
            </header>
            <Suspense fallback={<p className="py-20 text-center text-sm text-slate-500" role="status">正在加载技能预览…</p>}>
                <AtlasSkillDemo key={`${jobId}:${skill.id}`} jobId={jobId} jobName={jobName} skill={skill}/>
            </Suspense>
        </section>
    </div>,document.body);
}
