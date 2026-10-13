import {createPortal} from 'react-dom';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eraser, ImagePlus, Loader2, Redo2, RotateCcw, Sparkles, Upload, Undo2, X} from 'lucide-react';
import type {AgentConfig, AgentBattleAppearance, BattleAppearanceGenerationOptions, BattleAppearanceImageTask, ImageUploadConfig, AIModel} from '@/api/setting';
import {clearAgentBattleAppearance, generateBattleAppearanceImage, getAgentBattleAppearance, getBattleAppearanceGenerationOptions, getBattleAppearanceImageTask, getImageUploadConfig, saveAgentBattleAppearance} from '@/api/setting';
import {downloadResource, uploadResource} from '@/api/resources';
import {getCombatProfile} from '@/api/combat';
import {imageExceedsUploadLimit} from '@/utils/imageUpload';
import {useToast} from '@/components/common/ToastProvider';
import {SettingsSelect} from '../../SettingsSelect';
import {BattleHeadPreview} from './BattleHeadPreview';
import {PixelArtSlice} from '@/components/Combat/atlas/PixelArtSlice';
import {identityParts} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';
import {alphaBounds, applyBrushStroke, removeFlatBackground, renderHeadFrame} from './imageProcessing';
import type {CropRect, HeadTransform, PixelImage} from './imageProcessing';

type Tool='crop'|'erase'|'restore';
type BrushStroke={points:{x:number;y:number}[];radius:number;mode:'erase'|'restore'};
const ACTIVE_TASKS=new Set(['submitting','generating','download_pending']);
const ALLOWED_IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const isSupportedImage=(file:File)=>ALLOWED_IMAGE_TYPES.has(file.type)||(!file.type&&/\.(png|jpe?g|webp)$/i.test(file.name));
function useLatestRef<T>(value:T){const ref=useRef(value);useEffect(()=>{ref.current=value;},[value]);return ref;}

const decodeFile = async (file:File) => {
    const bitmap=await createImageBitmap(file);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context){bitmap.close();throw new Error('无法读取图片像素');}
    context.drawImage(bitmap,0,0);bitmap.close();
    return {canvas,pixels:context.getImageData(0,0,canvas.width,canvas.height)};
};

const putPixels = (pixels:PixelImage) => {
    const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('无法初始化图片画布');
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data.buffer as ArrayBuffer,pixels.data.byteOffset,pixels.data.length),pixels.width,pixels.height),0,0);return canvas;
};

const blobFromCanvas = (canvas:HTMLCanvasElement) => new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 导出失败')),'image/png'));
const makeFile=(blob:Blob,name:string)=>new File([blob],name,{type:blob.type||'image/png'});

interface Props {
    agent:AgentConfig;
    imageModels:(AIModel & {providerName?:string;uniqueId?:string})[];
    onClose:()=>void;
    onSaved:(appearance:AgentBattleAppearance|null)=>void;
}

export function BattleAppearanceEditor({agent,imageModels,onClose,onSaved}:Props) {
    const toast=useToast();
    const fileInput=useRef<HTMLInputElement>(null);const referenceInput=useRef<HTMLInputElement>(null);
    const stageCanvas=useRef<HTMLCanvasElement>(null);const frameCanvas=useRef<HTMLCanvasElement>(null);
    const sourceFileRef=useRef<File|null>(null);
    const sourcePixelsRef=useRef<PixelImage|null>(null);const baseCutoutRef=useRef<PixelImage|null>(null);
    const urls=useRef(new Set<string>());const drawing=useRef(false);const lastPoint=useRef<{x:number;y:number}|null>(null);
    const dragFrame=useRef<{x:number;y:number;originX:number;originY:number}|null>(null);
    const [sourcePixels,setSourcePixels]=useState<PixelImage|null>(null);const [baseCutout,setBaseCutout]=useState<PixelImage|null>(null);
    const [pixels,setPixels]=useState<PixelImage|null>(null);const [crop,setCrop]=useState<CropRect|null>(null);const [selection,setSelection]=useState<CropRect|null>(null);
    const [transform,setTransform]=useState<HeadTransform>({x:0,y:0,scale:1});const [tool,setTool]=useState<Tool>('crop');const [brushRadius,setBrushRadius]=useState(8);
    const [tolerance,setTolerance]=useState(24);const [backgroundColor,setBackgroundColor]=useState<'checker'|'light'|'dark'>('checker');
    const [sourceAssetId,setSourceAssetId]=useState('');const [sourceFile,setSourceFile]=useState<File|null>(null);const [sourceName,setSourceName]=useState('');
    const [headUrl,setHeadUrl]=useState('');
    const [brushStrokes,setBrushStrokes]=useState<BrushStroke[]>([]);const [redoStrokes,setRedoStrokes]=useState<BrushStroke[]>([]);
    const [modelId,setModelId]=useState('');const [options,setOptions]=useState<BattleAppearanceGenerationOptions|null>(null);const [description,setDescription]=useState('');
    const [referenceImageIds,setReferenceImageIds]=useState<string[]>([]);const [referenceFile,setReferenceFile]=useState<File|null>(null);const [useAgentAvatar,setUseAgentAvatar]=useState(true);
    const [task,setTask]=useState<BattleAppearanceImageTask|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);
    const [jobId,setJobId]=useState('job.novice');const [uploadLimits,setUploadLimits]=useState<ImageUploadConfig>({maxLongEdge:4096,maxFileSizeMb:15});
    const uploadLimitsRef=useLatestRef(uploadLimits);
    const toleranceRef=useLatestRef(tolerance);
    const toastRef=useLatestRef(toast);

    const modelOptions=useMemo(()=>imageModels.map(model=>({value:model.id,label:model.displayName||model.name,description:model.providerName})),[imageModels]);
    const [ratio,setRatio]=useState('1:1');const [size,setSize]=useState('1K');
    const ratioOptions=useMemo(()=>options?.aspectRatioOptions||[],[options]);
    const sizeOptions=useMemo(()=>options?.imageSizeOptionsByAspectRatio?.[ratio]||options?.imageSizeOptions||[],[options,ratio]);
    const selectedSize=sizeOptions.some(option=>option.value===size)?size:(sizeOptions[0]?.value||size);
    const modelsRef=useLatestRef(imageModels);
    const previewUrl=(blob:Blob)=>{const url=URL.createObjectURL(blob);urls.current.add(url);return url;};

    const installImage=useCallback(async(file:File,assetId='',restored?:{cutout:PixelImage;transform:AgentBattleAppearance['transform']})=>{
        if(!isSupportedImage(file))throw new Error('只支持静态 PNG、JPEG 或 WebP 图片');
        const limits=uploadLimitsRef.current;
        if(file.size>limits.maxFileSizeMb*1024*1024)throw new Error(`图片不能超过 ${limits.maxFileSizeMb} MB`);
        const decoded=await decodeFile(file);
        if(imageExceedsUploadLimit({width:decoded.canvas.width,height:decoded.canvas.height,fileSize:file.size},limits)){
            throw new Error(`图片长边需在 ${limits.maxLongEdge} 像素内，文件不超过 ${limits.maxFileSizeMb} MB`);
        }
        if(decoded.canvas.width*decoded.canvas.height>12_000_000)throw new Error('图片像素过多，请先缩小到 1200 万像素以内');
        const original:PixelImage={width:decoded.canvas.width,height:decoded.canvas.height,data:decoded.pixels.data};
        let cutout=restored?.cutout;
        if(!cutout){
            const result=removeFlatBackground(original,toleranceRef.current);
            cutout=result.image;
            if(result.alreadyTransparent)toastRef.current.success('检测到透明像素，已保留原有透明背景');
            else toastRef.current.success(`已移除边缘纯色背景（${result.removed.toLocaleString()} 个像素）`);
        }
        sourceFileRef.current=file;
        sourcePixelsRef.current=original;baseCutoutRef.current=cutout;
        setSourcePixels(original);setBaseCutout(cutout);setPixels(cutout);setSourceFile(assetId?null:file);setSourceAssetId(assetId);setSourceName(file.name);
        const bounds=restored?.transform.crop||alphaBounds(cutout);
        setCrop(bounds);setSelection(null);setBrushStrokes([]);setRedoStrokes([]);
        if(restored?.transform){setTransform({x:restored.transform.x,y:restored.transform.y,scale:restored.transform.scale});}
        else if(bounds){setTransform({x:0,y:0,scale:Math.min(374/bounds.width,310/bounds.height)*.88});}
        else setTransform({x:0,y:0,scale:1});
        setMessage('');
    },[toastRef,toleranceRef,uploadLimitsRef]);

    useEffect(()=>{
        let alive=true;
        void (async()=>{
            try{
                const [saved,limits,profile,taskList]=await Promise.all([
                    getAgentBattleAppearance(agent.id),getImageUploadConfig(),getCombatProfile(agent.id).catch(()=>null),getBattleAppearanceImageTask(agent.id).catch(()=>[]),
                ]);
                if(!alive)return;
                if(limits)setUploadLimits(limits);
                setJobId(profile?.progression?.job||'job.novice');
                if('sourceAssetId'in saved){
                    const [sourceBlob,cutoutBlob]=await Promise.all([downloadResource(saved.sourceAssetId),downloadResource(saved.cutoutAssetId)]);
                    if(!alive)return;
                    const file=makeFile(sourceBlob,`battle-source-${saved.sourceAssetId}.${sourceBlob.type==='image/jpeg'?'jpg':sourceBlob.type==='image/webp'?'webp':'png'}`);
                    const decoded=await decodeFile(file);const cutDecoded=await decodeFile(makeFile(cutoutBlob,'battle-cutout.png'));
                    const original:PixelImage={width:decoded.canvas.width,height:decoded.canvas.height,data:decoded.pixels.data};
                    const cut:PixelImage={width:cutDecoded.canvas.width,height:cutDecoded.canvas.height,data:cutDecoded.pixels.data};
                    sourceFileRef.current=file;sourcePixelsRef.current=original;baseCutoutRef.current=cut;
                    setSourceFile(null);setSourceAssetId(saved.sourceAssetId);setSourceName(file.name);setSourcePixels(original);setBaseCutout(cut);setPixels(cut);
                    const savedTransform=saved.transform||{x:0,y:0,scale:1};setTransform({x:savedTransform.x,y:savedTransform.y,scale:savedTransform.scale});
                    setCrop(savedTransform.crop||alphaBounds(cut));
                }
                const tasks=Array.isArray(taskList)?taskList:[taskList];
                const current=tasks.find(item=>ACTIVE_TASKS.has(item.status))||tasks[0];
                if(current){setTask(current);if(!('sourceAssetId'in saved)&&current.status==='succeeded'&&current.assetId){const blob=await downloadResource(current.assetId);if(alive)await installImage(makeFile(blob,'generated-battle-head.png'),current.assetId);}}
            }catch(error){if(alive)setMessage(error instanceof Error?error.message:'战斗形象读取失败');}
        })();
        void getBattleAppearanceGenerationOptions(agent.id).then(value=>{
            if(!alive)return;setOptions(value);
            if(value.modelId)setModelId(value.modelId);else if(modelsRef.current.length)setModelId(modelsRef.current[0].id);
            if(value.defaultAspectRatio)setRatio(value.defaultAspectRatio);
            if(value.defaultImageSize)setSize(value.defaultImageSize);
            if(value.agentReferenceImages?.avatar)setReferenceImageIds([value.agentReferenceImages.avatar]);
        }).catch(error=>{if(alive)setMessage(error instanceof Error?error.message:'无法读取生图配置');});
        void getImageUploadConfig().then(value=>{if(alive&&value)setUploadLimits(value);}).catch(()=>{});
        const ownedUrls=urls.current;
        return()=>{alive=false;for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();};
    },[agent.id,installImage,modelsRef]);

    useEffect(()=>{
        if(!modelId)return;
        let alive=true;
        void getBattleAppearanceGenerationOptions(agent.id,modelId).then(value=>{if(!alive)return;setOptions(value);setRatio(value.defaultAspectRatio||'1:1');setSize(value.defaultImageSize||'1K');})
            .catch(error=>{if(alive)setMessage(error instanceof Error?error.message:'模型参数读取失败');});
        return()=>{alive=false;};
    },[agent.id,modelId]);

    const loadTaskAsset=useCallback(async(value:BattleAppearanceImageTask)=>{
        setTask(value);
        if(value.status==='succeeded'&&value.assetId){
            try{const blob=await downloadResource(value.assetId);await installImage(makeFile(blob,'generated-battle-head.png'),value.assetId);}
            catch(error){setMessage(error instanceof Error?error.message:'生成图下载失败');}
        }else if(value.status==='failed'||value.status==='submission_unknown')setMessage(value.message||'生图没有完成，可重新提交一次生成');
    },[installImage]);

    const taskId=task?.taskId;const taskStatus=task?.status;
    useEffect(()=>{
        if(!taskId||!taskStatus||!ACTIVE_TASKS.has(taskStatus))return;
        let alive=true;let timer:ReturnType<typeof setTimeout>;
        const poll=async()=>{
            try{const result=await getBattleAppearanceImageTask(agent.id,taskId);if(!alive||Array.isArray(result))return;await loadTaskAsset(result);if(alive&&ACTIVE_TASKS.has(result.status))timer=setTimeout(poll,Math.max(3000,(result.retryAfterSeconds||5)*1000));}
            catch(error){if(alive){setMessage(error instanceof Error?error.message:'生图进度查询失败，将继续使用同一任务重试');timer=setTimeout(poll,8000);}}
        };
        timer=setTimeout(poll,2500);return()=>{alive=false;clearTimeout(timer);};
    },[agent.id,taskId,taskStatus,loadTaskAsset]);

    useEffect(()=>{
        if(!pixels||!stageCanvas.current)return;
        const canvas=stageCanvas.current;canvas.width=pixels.width;canvas.height=pixels.height;
        const context=canvas.getContext('2d');if(!context)return;
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data.buffer as ArrayBuffer,pixels.data.byteOffset,pixels.data.length),pixels.width,pixels.height),0,0);
        if(selection){context.strokeStyle='#f97316';context.lineWidth=Math.max(1,Math.ceil(pixels.width/500));context.setLineDash([4,3]);context.strokeRect(selection.x,selection.y,selection.width,selection.height);context.setLineDash([]);}
    },[pixels,selection]);

    const frameResult=useMemo(()=>pixels&&crop?renderHeadFrame(putPixels(pixels),crop,transform):null,[pixels,crop,transform]);
    const frame=frameResult?.canvas||null;const clipped=frameResult?.clipped||false;
    useEffect(()=>{
        if(!frame||!frameCanvas.current)return;
        const canvas=frameCanvas.current;const context=canvas.getContext('2d');if(!context)return;
        canvas.width=374;canvas.height=310;context.imageSmoothingEnabled=false;context.clearRect(0,0,374,310);context.drawImage(frame,0,0);
    },[frame]);
    useEffect(()=>{
        if(!frame)return;
        let alive=true;
        void blobFromCanvas(frame).then(blob=>{if(alive)setHeadUrl(previewUrl(blob));}).catch(()=>{});
        return()=>{alive=false;};
    },[frame]);

    const updatePixels=(next:PixelImage)=>setPixels(next);
    const redrawStrokes=(base:PixelImage,strokes:BrushStroke[])=>strokes.reduce((current,stroke)=>applyBrushStroke(current,sourcePixelsRef.current||base,stroke.points,stroke.radius,stroke.mode),base);

    const handleFile=async(file?:File)=>{
        if(!file)return;
        if(!isSupportedImage(file)){toast.warning('只支持静态 PNG、JPEG 或 WebP 图片');return;}
        try{await installImage(file);toast.success('素材已载入，可以继续修边和对齐');}
        catch(error){toast.error(error instanceof Error?error.message:'图片读取失败');}
        if(fileInput.current)fileInput.current.value='';
    };

    const removeBackground=()=>{
        if(!sourcePixels)return;
        const result=removeFlatBackground(sourcePixels,tolerance);const bounds=alphaBounds(result.image);
        baseCutoutRef.current=result.image;setBaseCutout(result.image);setPixels(result.image);setBrushStrokes([]);setRedoStrokes([]);setCrop(bounds);
        if(bounds)setTransform({x:0,y:0,scale:Math.min(374/bounds.width,310/bounds.height)*.88});
        toast.success(result.alreadyTransparent?'图片已有透明背景，已保留透明像素':`已抠除边缘背景，容差 ${tolerance}`);
    };

    const autoAlign=()=>{if(!pixels)return;const bounds=alphaBounds(pixels);if(!bounds){toast.warning('当前没有可见头部像素');return;}setCrop(bounds);setTransform({x:0,y:0,scale:Math.min(374/bounds.width,310/bounds.height)*.88});};

    const pointerPoint=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        const rect=event.currentTarget.getBoundingClientRect();const canvas=event.currentTarget;
        return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
    };
    const sourcePointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!pixels)return;event.currentTarget.setPointerCapture(event.pointerId);const point=pointerPoint(event);drawing.current=true;lastPoint.current=point;
        if(tool==='crop'){setSelection({x:point.x,y:point.y,width:1,height:1});return;}
        const stroke:BrushStroke={points:[point],radius:brushRadius,mode:tool};
        setPixels(current=>current?applyBrushStroke(current,sourcePixelsRef.current||current,stroke.points,stroke.radius,stroke.mode):current);
        setBrushStrokes(current=>[...current,stroke]);setRedoStrokes([]);
    };
    const sourcePointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!drawing.current||!pixels||!lastPoint.current)return;const point=pointerPoint(event);
        if(tool==='crop'){
            const start=lastPoint.current;setSelection({x:Math.max(0,Math.min(start.x,point.x)),y:Math.max(0,Math.min(start.y,point.y)),width:Math.max(1,Math.min(pixels.width,Math.abs(point.x-start.x))),height:Math.max(1,Math.min(pixels.height,Math.abs(point.y-start.y)))});return;
        }
        const stroke:BrushStroke={points:[lastPoint.current,point],radius:brushRadius,mode:tool};
        setPixels(current=>current?applyBrushStroke(current,sourcePixelsRef.current||current,stroke.points,stroke.radius,stroke.mode):current);
        setBrushStrokes(current=>[...current,stroke]);setRedoStrokes([]);lastPoint.current=point;
    };
    const sourcePointerUp=()=>{
        if(!drawing.current)return;drawing.current=false;lastPoint.current=null;
        if(tool==='crop'&&selection&&selection.width>4&&selection.height>4){setCrop({x:Math.round(selection.x),y:Math.round(selection.y),width:Math.round(selection.width),height:Math.round(selection.height)});setTransform(current=>({...current,x:0,y:0}));}
        setSelection(null);
    };
    const undo=()=>{if(!baseCutout||!brushStrokes.length)return;const next=brushStrokes.slice(0,-1);setRedoStrokes(current=>[brushStrokes[brushStrokes.length-1],...current]);setBrushStrokes(next);updatePixels(redrawStrokes(baseCutout,next));};
    const redo=()=>{if(!baseCutout||!redoStrokes.length)return;const stroke=redoStrokes[0];const next=[...brushStrokes,stroke];setRedoStrokes(redoStrokes.slice(1));setBrushStrokes(next);updatePixels(redrawStrokes(baseCutout,next));};

    const framePointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!frameCanvas.current)return;event.currentTarget.setPointerCapture(event.pointerId);const point=pointerPoint(event);dragFrame.current={x:point.x,y:point.y,originX:transform.x,originY:transform.y};
    };
    const framePointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!dragFrame.current)return;const point=pointerPoint(event);
        setTransform(current=>({...current,x:Math.round(dragFrame.current!.originX+point.x-dragFrame.current!.x),y:Math.round(dragFrame.current!.originY+point.y-dragFrame.current!.y)}));
    };
    const framePointerUp=()=>{dragFrame.current=null;};

    const generate=async()=>{
        if(busy)return;setBusy(true);setMessage('');
        try{
            const refs=useAgentAvatar&&options?.supportsReferenceImages?referenceImageIds:[];
            const data=await generateBattleAppearanceImage(agent.id,{prompt:description.trim(),modelId:modelId||undefined,requestId:crypto.randomUUID(),aspectRatio:ratio||'1:1',imageSize:selectedSize||'1K',referenceImageIds:refs,useAgentAvatar});
            await loadTaskAsset(data);toast.success(ACTIVE_TASKS.has(data.status)?'生图任务已提交；关闭编辑器后可再次打开继续查询':'图片已生成');
        }catch(error){const text=error instanceof Error?error.message:'生图请求失败';setMessage(text);toast.error(text);}
        finally{setBusy(false);}
    };

    const uploadReference=async(file?:File)=>{
        if(!file)return;if(!isSupportedImage(file)){toast.warning('参考图只支持 PNG、JPEG 或 WebP');return;}
        if(file.size>uploadLimits.maxFileSizeMb*1024*1024){toast.warning(`参考图不能超过 ${uploadLimits.maxFileSizeMb} MB`);return;}
        try{const uploaded=await uploadResource(file,'agent_art');setReferenceImageIds([uploaded.id]);setReferenceFile(file);setUseAgentAvatar(true);toast.success('参考图已上传');}
        catch(error){toast.error(error instanceof Error?error.message:'参考图上传失败');}
        if(referenceInput.current)referenceInput.current.value='';
    };

    const save=async()=>{
        if(!pixels||!crop||saving)return;
        setSaving(true);setMessage('');
        try{
            const finalRender=renderHeadFrame(putPixels(pixels),crop,transform);
            let sourceId=sourceAssetId;
            if(!sourceId){const file=sourceFile||sourceFileRef.current;if(!file)throw new Error('请重新载入原图素材');sourceId=(await uploadResource(file,'agent_art')).id;}
            const cutoutFile=makeFile(await blobFromCanvas(putPixels(pixels)),`${agent.name}-战斗去背景.png`);
            const headFile=makeFile(await blobFromCanvas(finalRender.canvas),`${agent.name}-战斗头部.png`);
            const cutoutId=(await uploadResource(cutoutFile,'agent_art')).id;const headId=(await uploadResource(headFile,'agent_art')).id;
            const saved=await saveAgentBattleAppearance(agent.id,{version:1,sourceAssetId:sourceId,cutoutAssetId:cutoutId,headAssetId:headId,
                transform:{x:transform.x,y:transform.y,scale:transform.scale,crop}});
            onSaved(saved);toast.success('战斗形象已保存，当前探索和历史记录会使用新形象');onClose();
        }catch(error){const text=error instanceof Error?error.message:'保存战斗形象失败';setMessage(text);toast.error(text);}
        finally{setSaving(false);}
    };

    const restoreDefault=async()=>{
        if(saving)return;setSaving(true);
        try{await clearAgentBattleAppearance(agent.id);onSaved(null);toast.success('已恢复默认战斗形象');onClose();}
        catch(error){toast.error(error instanceof Error?error.message:'恢复默认形象失败');}
        finally{setSaving(false);}
    };

    useEffect(()=>{
        const onPaste=(event:ClipboardEvent)=>{const file=Array.from(event.clipboardData?.files||[]).find(item=>ALLOWED_IMAGE_TYPES.has(item.type));if(file)void handleFile(file);};
        const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
        window.addEventListener('paste',onPaste);window.addEventListener('keydown',onKey);
        return()=>{window.removeEventListener('paste',onPaste);window.removeEventListener('keydown',onKey);};
    });

    const isTaskActive=task?.status==='generating'||task?.status==='submitting'||task?.status==='download_pending';
    const checker=backgroundColor==='checker'?'bg-[conic-gradient(#e2e8f0_25%,white_0_50%,#e2e8f0_0_75%,white_0)] [background-size:16px_16px]':backgroundColor==='dark'?'bg-slate-800':'bg-slate-100';
    const nudge=(x:number,y:number)=>setTransform(value=>({...value,x:value.x+x,y:value.y+y}));

    return createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/55 p-0 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
        <section role="dialog" aria-modal="true" aria-labelledby="battle-appearance-title" className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-slate-200 bg-slate-50 shadow-2xl sm:h-[min(92vh,900px)] sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><Sparkles className="h-5 w-5"/></div><div className="min-w-0"><h2 id="battle-appearance-title" className="truncate text-base font-bold text-slate-900">{agent.name} · 战斗形象</h2><p className="text-xs text-slate-500">独立于日常头像保存 · 最近邻像素导出 374×310</p></div></div>
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭"><X className="h-5 w-5"/></button>
            </header>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
                    <div className="space-y-4">
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">1. 上传或生成素材</h3><p className="mt-1 text-xs leading-5 text-slate-500">支持 PNG、JPEG、WebP；拖入、粘贴或点击选择。透明 PNG 会保留透明通道。</p></div><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event=>void handleFile(event.target.files?.[0])}/><button type="button" onClick={()=>fileInput.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"><Upload className="h-4 w-4"/>上传</button></div>
                            <div onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDrop={event=>{event.preventDefault();void handleFile(event.dataTransfer.files?.[0]);}} className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">{sourceName||'也可以把图片拖到这里，或先复制图片再粘贴'}</div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">生图模型</label><SettingsSelect value={modelId} options={modelOptions} onChange={setModelId} placeholder="选择生图模型" menuPortal/></div>
                                <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">外观描述</label><input value={description} onChange={event=>setDescription(event.target.value.slice(0,180))} placeholder="例如：银白短发、蓝色发夹、琥珀色眼睛" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></div>
                                {ratioOptions.length>0&&<div><label className="mb-1.5 block text-xs font-semibold text-slate-600">画面比例</label><SettingsSelect value={ratio} options={ratioOptions} onChange={setRatio} menuPortal/></div>}
                                {sizeOptions.length>0&&<div><label className="mb-1.5 block text-xs font-semibold text-slate-600">分辨率</label><SettingsSelect value={selectedSize} options={sizeOptions} onChange={setSize} menuPortal/></div>}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet-50/70 px-3 py-2.5">
                                <div className="min-w-0"><p className="text-xs font-semibold text-violet-900">像素风参考</p><p className="mt-0.5 text-[11px] leading-4 text-violet-800/80">{options?.supportsReferenceImages?'默认用 Agent 头像，可上传替换；提示词固定保留发饰、去掉身体和场景。':'当前模型不支持参考图，将按文字描述生成。'}</p></div>
                                <div className="flex shrink-0 items-center gap-2"><input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event=>void uploadReference(event.target.files?.[0])}/>
                                    {options?.supportsReferenceImages&&<><button type="button" onClick={()=>setUseAgentAvatar(value=>!value)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${useAgentAvatar?'bg-white text-violet-800 shadow-sm':'text-slate-500 hover:bg-white'}`}>{useAgentAvatar?(referenceFile?'自定义参考图 · 开':'Agent 头像 · 开'):'不使用参考图'}</button><button type="button" onClick={()=>referenceInput.current?.click()} className="rounded-lg p-2 text-violet-700 hover:bg-white" title="替换参考图"><ImagePlus className="h-4 w-4"/></button></>}
                                </div>
                            </div>
                            {options?.mode==='automatic'&&<p className="mt-2 text-[11px] text-amber-700">此模型自动决定画幅和分辨率，生成参数由模型服务处理。</p>}
                            {options?.configured===false&&<p className="mt-2 text-xs text-rose-600">{options.message||'尚未配置生图模型，可以先上传图片。'}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy||!options?.configured||imageModels.length===0} onClick={()=>void generate()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{busy||isTaskActive?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{isTaskActive?'生成任务进行中':'生成战斗头部'}</button><span className="text-[11px] text-slate-400">默认 1:1 · 1K · 纯色背景便于抠除</span></div>
                            {task&&<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${isTaskActive?'animate-pulse bg-violet-500':task.status==='succeeded'?'bg-emerald-500':'bg-slate-300'}`}/>{isTaskActive?'任务已保存，正在查询同一生成任务':task.status==='succeeded'?'生成素材已载入':task.message||task.status}{task.status==='succeeded'&&task.assetId&&task.assetId!==sourceAssetId&&<button type="button" onClick={()=>void loadTaskAsset(task)} className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2">载入上次生成结果</button>}</div>}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">2. 去背景和修边</h3><p className="mt-1 text-xs text-slate-500">只抠除与边缘相连的纯色区域；眼睛等内部同色像素会保留。</p></div><div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[10px]">{(['checker','light','dark'] as const).map((value,index)=><button key={value} onClick={()=>setBackgroundColor(value)} className={`rounded-full px-2 py-1 ${backgroundColor===value?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>{['棋盘','浅色','深色'][index]}</button>)}</div></div>
                            {pixels?<><div className={`flex h-[210px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 ${checker}`}><canvas ref={stageCanvas} className="max-h-[200px] max-w-full touch-none object-contain [image-rendering:pixelated]" onPointerDown={sourcePointerDown} onPointerMove={sourcePointerMove} onPointerUp={sourcePointerUp} onPointerCancel={sourcePointerUp} aria-label="头部素材修边画布"/></div>
                                <div className="mt-3 flex flex-wrap items-center gap-1.5"><button type="button" onClick={()=>setTool('crop')} className={`rounded-lg px-3 py-2 text-xs ${tool==='crop'?'bg-orange-100 font-semibold text-orange-800':'bg-slate-100 text-slate-600'}`}>框选头部范围</button><button type="button" onClick={removeBackground} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 hover:bg-slate-200">重新去背景</button><button type="button" onClick={()=>setTool('erase')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs ${tool==='erase'?'bg-orange-100 text-orange-800':'bg-slate-100 text-slate-600'}`}><Eraser className="h-3.5 w-3.5"/>擦除</button><button type="button" onClick={()=>setTool('restore')} className={`rounded-lg px-3 py-2 text-xs ${tool==='restore'?'bg-orange-100 text-orange-800':'bg-slate-100 text-slate-600'}`}>恢复原图</button><button type="button" disabled={!brushStrokes.length} onClick={undo} className="rounded-lg bg-slate-100 p-2 text-slate-600 disabled:opacity-40" title="撤销修补"><Undo2 className="h-4 w-4"/></button><button type="button" disabled={!redoStrokes.length} onClick={redo} className="rounded-lg bg-slate-100 p-2 text-slate-600 disabled:opacity-40" title="重做修补"><Redo2 className="h-4 w-4"/></button><button type="button" onClick={autoAlign} className="ml-auto rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">自动对齐</button></div>
                                {tool==='crop'&&<div className="mt-2 flex items-center gap-2"><span className="text-[11px] text-slate-500">在图上拖框排除肩膀衣服；选区直接裁入 374×310 输出框</span>{selection&&<button type="button" onClick={()=>{setCrop({x:Math.round(selection.x),y:Math.round(selection.y),width:Math.round(selection.width),height:Math.round(selection.height)});setSelection(null);}} className="text-[11px] font-semibold text-orange-700">应用选区</button>}</div>}
                                {(tool==='erase'||tool==='restore')&&<div className="mt-2 flex items-center gap-2"><label className="text-[11px] text-slate-500">画笔 {brushRadius}px</label><input type="range" min="1" max="64" value={brushRadius} onChange={event=>setBrushRadius(Number(event.target.value))} className="w-32 accent-orange-500"/><label className="ml-2 text-[11px] text-slate-500">边缘容差 {tolerance}</label><input type="range" min="0" max="96" step="2" value={tolerance} onChange={event=>setTolerance(Number(event.target.value))} className="w-28 accent-orange-500"/></div>}
                            </>:<button type="button" onClick={()=>fileInput.current?.click()} className="flex h-[210px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 hover:border-orange-300 hover:bg-orange-50/40"><Upload className="h-6 w-6 text-slate-400"/>上传或生成一张头部素材</button>}
                        </section>

                        {pixels&&<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3"><h3 className="text-sm font-bold text-slate-800">3. 放到角色头部框</h3><p className="mt-1 text-xs text-slate-500">拖动预览框中的头部，或用方向键微调；缩放按整数像素最近邻导出。</p></div>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                                <div className={`flex min-h-[190px] items-center justify-center rounded-xl border border-slate-200 ${checker}`}><div className="relative aspect-[374/310] w-full max-w-[253px] overflow-hidden"><div className="pointer-events-none absolute inset-0 opacity-30"><PixelArtSlice region={identityParts.head}/></div><div className="pointer-events-none absolute bottom-[2%] left-1/2 z-[1] h-[9%] w-px -translate-x-1/2 bg-orange-400/65"/><canvas ref={frameCanvas} tabIndex={0} className="absolute inset-0 h-full w-full touch-none outline-none [image-rendering:pixelated] focus:ring-2 focus:ring-orange-300" onPointerDown={framePointerDown} onPointerMove={framePointerMove} onPointerUp={framePointerUp} onPointerCancel={framePointerUp} onKeyDown={event=>{const step=event.shiftKey?4:1;if(event.key==='ArrowLeft'){event.preventDefault();nudge(-step,0);}if(event.key==='ArrowRight'){event.preventDefault();nudge(step,0);}if(event.key==='ArrowUp'){event.preventDefault();nudge(0,-step);}if(event.key==='ArrowDown'){event.preventDefault();nudge(0,step);}}} aria-label="拖动头部到输出框中的合适位置"/></div></div>
                                <div className="space-y-3"><div><label className="mb-1 block text-[11px] font-semibold text-slate-600">等比缩放 {transform.scale.toFixed(2)}×</label><input type="range" min="0.1" max="3" step="0.02" value={transform.scale} onChange={event=>setTransform(value=>({...value,scale:Number(event.target.value)}))} className="w-full accent-orange-500"/></div><div className="flex items-center justify-center gap-1"><button onClick={()=>nudge(-1,0)} className="rounded-lg bg-slate-100 p-2" title="左移一像素"><ArrowLeft className="h-4 w-4"/></button><div className="flex flex-col gap-1"><button onClick={()=>nudge(0,-1)} className="rounded-lg bg-slate-100 p-2" title="上移一像素"><ArrowUp className="h-4 w-4"/></button><button onClick={()=>nudge(0,1)} className="rounded-lg bg-slate-100 p-2" title="下移一像素"><ArrowDown className="h-4 w-4"/></button></div><button onClick={()=>nudge(1,0)} className="rounded-lg bg-slate-100 p-2" title="右移一像素"><ArrowRight className="h-4 w-4"/></button></div>{clipped&&<p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">头部超出导出框，会被裁切；请缩小或移动回框内。</p>}<p className="text-[10px] leading-4 text-slate-400">输出区域：374×310 px<br/>位置 ({transform.x}, {transform.y})</p></div>
                            </div>
                        </section>}
                    </div>

                    <div className="space-y-4"><BattleHeadPreview jobId={jobId} headUrl={headUrl}/><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Check className="h-4 w-4"/></div><div><h3 className="text-sm font-bold text-slate-800">成品预览</h3><p className="text-[11px] text-slate-500">透明头部会替换原战斗头纹理；失败时仍显示默认头部</p></div></div><div className={`mt-3 flex h-[160px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 ${checker}`}>{frame&&<img src={headUrl} alt="374×310 战斗头部成品预览" className="max-h-full max-w-full object-contain [image-rendering:pixelated]"/>}</div></section></div>
                </div>
                {message&&<p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">{message}</p>}
            </div>
            <footer className="fixed inset-x-0 bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:px-6">
                <div className="flex gap-2"><button type="button" disabled={saving||!sourcePixels} onClick={restoreDefault} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4"/>恢复默认</button><button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">取消</button></div>
                <button type="button" disabled={saving||!pixels||!crop} onClick={()=>void save()} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{saving?'保存中…':'保存战斗形象'}</button>
            </footer>
        </section>
    </div>,document.body);
}
