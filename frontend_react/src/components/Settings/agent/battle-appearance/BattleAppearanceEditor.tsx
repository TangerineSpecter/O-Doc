import {createPortal} from 'react-dom';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eraser, ImagePlus, Loader2, Redo2, RotateCcw, Sparkles, Upload, Undo2, X} from 'lucide-react';
import type {AgentConfig, AgentBattleAppearance, BattleAppearanceGenerationOptions, BattleAppearanceImageTask, ImageUploadConfig, AIModel} from '@/api/setting';
import {clearAgentBattleAppearance, generateBattleAppearanceImage, getAgentBattleAppearance, getBattleAppearanceGenerationOptions, getBattleAppearanceImageTask, getImageUploadConfig, saveAgentBattleAppearance} from '@/api/setting';
import {downloadResource, uploadResource} from '@/api/resources';
import {getCombatProfile} from '@/api/combat';
import {imageExceedsUploadLimit} from '@/utils/imageUpload';
import {createRequestKey} from '@/utils/requestKey';
import {useToast} from '@/components/common/ToastProvider';
import {SettingsSelect} from '../../SettingsSelect';
import {BattleHeadPreview} from './BattleHeadPreview';
import {independentWeapons} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';
import {DEFAULT_APPEARANCE_OVERLAYS} from '@/components/Combat/animation/playerAppearance/LayeredPlayerActor';
import type {AppearanceOverlayTransform,AppearanceOverlayTransforms} from '@/components/Combat/animation/playerAppearance/LayeredPlayerActor';
import {alphaBounds, applyBrushStroke, autoCharacterTransform, BATTLE_CHARACTER_FRAME, BATTLE_CHARACTER_MIN_SCALE, BATTLE_CHARACTER_MAX_SCALE, removeColorRegion, removeFlatBackground, renderCharacterFrame} from './imageProcessing';
import type {CharacterTransform,CropRect,PixelImage} from './imageProcessing';
import {ACTIVE_HEAD_TASKS, useBattleHeadTask} from './useBattleHeadTask';
import {BattleHeadTaskStatus} from './BattleHeadTaskStatus';
import {createBattlePoseReference} from './bodyStyleReference';
import {useAppearancePackage} from './useAppearancePackage';
import {AppearancePackageControls} from './AppearancePackageControls';
import {outfitArts} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';

type Tool='crop'|'erase'|'restore'|'fill';
type OverlayTarget='leftHand'|'rightHand'|'weapon'|'none';
type BrushStroke={points:{x:number;y:number}[];radius:number;mode:'erase'|'restore'|'fill';tolerance?:number};
const ACTIVE_TASKS=ACTIVE_HEAD_TASKS;
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
    const urls=useRef(new Set<string>());const drawing=useRef(false);const lastPoint=useRef<{x:number;y:number}|null>(null);const drawingStroke=useRef<BrushStroke|null>(null);
    const dragFrame=useRef<{x:number;y:number;originX:number;originY:number}|null>(null);
    const generationSubmission=useRef(false);
    const poseReference=useRef<{key:string;assetId:string}|null>(null);
    const [sourcePixels,setSourcePixels]=useState<PixelImage|null>(null);const [baseCutout,setBaseCutout]=useState<PixelImage|null>(null);
    const [pixels,setPixels]=useState<PixelImage|null>(null);const [crop,setCrop]=useState<CropRect|null>(null);const [selection,setSelection]=useState<CropRect|null>(null);
    const [transform,setTransform]=useState<CharacterTransform>({x:0,y:0,scale:1});const [tool,setTool]=useState<Tool>('crop');const [brushRadius,setBrushRadius]=useState(8);
    const [tolerance,setTolerance]=useState(24);const [backgroundColor,setBackgroundColor]=useState<'checker'|'light'|'dark'>('checker');
    const [sourceAssetId,setSourceAssetId]=useState('');const [sourceFile,setSourceFile]=useState<File|null>(null);const [sourceName,setSourceName]=useState('');
    const [characterUrl,setCharacterUrl]=useState('');const [legacyHeadUrl,setLegacyHeadUrl]=useState('');
    const [brushStrokes,setBrushStrokes]=useState<BrushStroke[]>([]);const [redoStrokes,setRedoStrokes]=useState<BrushStroke[]>([]);
    const [modelId,setModelId]=useState('');const [options,setOptions]=useState<BattleAppearanceGenerationOptions|null>(null);const [extraRequirements,setExtraRequirements]=useState('');
    const [appearanceReferenceImageId,setAppearanceReferenceImageId]=useState('');const [referenceFile,setReferenceFile]=useState<File|null>(null);
    const [overlays,setOverlays]=useState<AppearanceOverlayTransforms>(()=>structuredClone(DEFAULT_APPEARANCE_OVERLAYS));const [activeOverlay,setActiveOverlay]=useState<OverlayTarget>('none');
    const [task,setTask]=useState<BattleAppearanceImageTask|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [saving,setSaving]=useState(false);
    const [restoreDefaultPending,setRestoreDefaultPending]=useState(false);
    const [initializing,setInitializing]=useState(true);
    const isTaskActive=ACTIVE_TASKS.has(task?.status||'');
    const [jobId,setJobId]=useState('job.novice');const [weaponId,setWeaponId]=useState('equip.sword');const [uploadLimits,setUploadLimits]=useState<ImageUploadConfig>({maxLongEdge:4096,maxFileSizeMb:15});
    const uploadLimitsRef=useLatestRef(uploadLimits);
    const toleranceRef=useLatestRef(tolerance);
    const toastRef=useLatestRef(toast);

    const modelOptions=useMemo(()=>imageModels.map(model=>({value:model.id,label:model.displayName||model.name,description:model.providerName})),[imageModels]);
    const [generationBackground,setGenerationBackground]=useState<'flat'|'transparent'>('flat');
    const [equippedWeapon,setEquippedWeapon]=useState('none');
    const [ratio,setRatio]=useState('3:4');const [size,setSize]=useState('1K');
    const ratioOptions=useMemo(()=>options?.aspectRatioOptions||[],[options]);
    const sizeOptions=useMemo(()=>options?.imageSizeOptionsByAspectRatio?.[ratio]||options?.imageSizeOptions||[],[options,ratio]);
    const selectedSize=sizeOptions.some(option=>option.value===size)?size:(sizeOptions[0]?.value||size);
    const modelsRef=useLatestRef(imageModels);
    const previewUrl=(blob:Blob)=>{
        while(urls.current.size>=12){const oldest=urls.current.values().next().value as string|undefined;if(!oldest)break;URL.revokeObjectURL(oldest);urls.current.delete(oldest);}
        const url=URL.createObjectURL(blob);urls.current.add(url);return url;
    };

    const installImage=useCallback(async(file:File,assetId='',restored?:{cutout:PixelImage;transform:AgentBattleAppearance['transform']},isCurrent:()=>boolean=()=>true)=>{
        if(!isSupportedImage(file))throw new Error('只支持静态 PNG、JPEG 或 WebP 图片');
        const limits=uploadLimitsRef.current;
        if(file.size>limits.maxFileSizeMb*1024*1024)throw new Error(`图片不能超过 ${limits.maxFileSizeMb} MB`);
        const decoded=await decodeFile(file);
        if(!isCurrent())return;
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
        setRestoreDefaultPending(false);
        setSourcePixels(original);setBaseCutout(cutout);setPixels(cutout);setSourceFile(assetId?null:file);setSourceAssetId(assetId);setSourceName(file.name);
        const bounds=restored?.transform.crop||alphaBounds(cutout);
        setCrop(bounds);setSelection(null);setBrushStrokes([]);setRedoStrokes([]);
        if(restored?.transform){setTransform({...restored.transform});}
        else if(bounds){setTransform(autoCharacterTransform(bounds));}
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
                const hasSavedAppearance='version'in saved;
                    setJobId(profile?.progression?.job||'job.novice');
                    const equippedWeaponId=profile?.loadout?.weapon;
                    const equippedWeapon=profile?.equipment?.find(item=>item.id===equippedWeaponId);
                    const templateId=equippedWeapon?.templateId||equippedWeapon?.snapshot?.templateId;
                    const actualWeapon=independentWeapons.some(item=>item.id===templateId)?templateId!:'none';
                    setEquippedWeapon(actualWeapon);setWeaponId(actualWeapon==='none'?'equip.sword':actualWeapon);
                if(hasSavedAppearance&&saved.version===3){
                    const [sourceBlob,cutoutBlob]=await Promise.all([downloadResource(saved.sourceAssetId),downloadResource(saved.cutoutAssetId)]);
                    if(!alive)return;
                    const file=makeFile(sourceBlob,`battle-source-${saved.sourceAssetId}.${sourceBlob.type==='image/jpeg'?'jpg':sourceBlob.type==='image/webp'?'webp':'png'}`);
                    const decoded=await decodeFile(file);const cutDecoded=await decodeFile(makeFile(cutoutBlob,'battle-cutout.png'));
                    const original:PixelImage={width:decoded.canvas.width,height:decoded.canvas.height,data:decoded.pixels.data};
                    const cut:PixelImage={width:cutDecoded.canvas.width,height:cutDecoded.canvas.height,data:cutDecoded.pixels.data};
                    sourceFileRef.current=file;sourcePixelsRef.current=original;baseCutoutRef.current=cut;
                    setSourceFile(null);setSourceAssetId(saved.sourceAssetId);setSourceName(file.name);setSourcePixels(original);setBaseCutout(cut);setPixels(cut);
                    const savedTransform=saved.transform||{x:0,y:0,scale:1};setTransform({...savedTransform});
                    setCrop(savedTransform.crop||alphaBounds(cut));
                    if(saved.characterImageUrl)setCharacterUrl(saved.characterImageUrl);
                    setOverlays(saved.overlays||structuredClone(DEFAULT_APPEARANCE_OVERLAYS));
                }else if(hasSavedAppearance){
                    setLegacyHeadUrl(saved.headImageUrl||'');
                    setMessage('当前保存的是旧版头部形象；上传或生成一张全身图后即可切换为完整角色形象。');
                }
                const tasks=Array.isArray(taskList)?taskList:[taskList];
                const current=tasks.find(item=>ACTIVE_TASKS.has(item.status))||tasks[0];
                if(current){setTask(current);if((!hasSavedAppearance||saved.version!==3)&&current.status==='succeeded'&&current.assetId){const blob=await downloadResource(current.assetId);if(alive)await installImage(makeFile(blob,'generated-battle-character.png'),current.assetId);}}
            }catch(error){if(alive)setMessage(error instanceof Error?error.message:'战斗形象读取失败');}
            finally{if(alive)setInitializing(false);}
        })();
        void getBattleAppearanceGenerationOptions(agent.id).then(value=>{
            if(!alive)return;setOptions(value);
            if(value.modelId)setModelId(value.modelId);else if(modelsRef.current.length)setModelId(modelsRef.current[0].id);
            if(value.defaultAspectRatio)setRatio(value.defaultAspectRatio);
            if(value.defaultImageSize)setSize(value.defaultImageSize);
        }).catch(error=>{if(alive)setMessage(error instanceof Error?error.message:'无法读取生图配置');});
        void getImageUploadConfig().then(value=>{if(alive&&value)setUploadLimits(value);}).catch(()=>{});
        const ownedUrls=urls.current;
        return()=>{alive=false;for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();};
    },[agent.id,installImage,modelsRef]);

    useEffect(()=>{
        if(!modelId)return;
        let alive=true;
        void getBattleAppearanceGenerationOptions(agent.id,modelId).then(value=>{if(!alive)return;setOptions(value);setRatio(value.defaultAspectRatio||'3:4');setSize(value.defaultImageSize||'1K');})
            .catch(error=>{if(alive)setMessage(error instanceof Error?error.message:'模型参数读取失败');});
        return()=>{alive=false;};
    },[agent.id,modelId]);

    const loadTaskAsset=useCallback(async(value:BattleAppearanceImageTask,isCurrent:()=>boolean=()=>true)=>{
        if(!isCurrent())return;
        if(value.status==='succeeded'&&value.assetId){
            try{const blob=await downloadResource(value.assetId);if(isCurrent())await installImage(makeFile(blob,'generated-battle-character.png'),value.assetId,undefined,isCurrent);}
            catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:'生成图下载失败');}
        }else if(value.status==='failed'||value.status==='submission_unknown')setMessage(value.message||'生图没有完成，可重新提交一次生成');
        if(isCurrent())setTask(value);
    },[installImage]);

    const generationTask=useBattleHeadTask({agentId:agent.id,task,onResult:loadTaskAsset});

    useEffect(()=>{
        if(!pixels||!stageCanvas.current)return;
        const canvas=stageCanvas.current;canvas.width=pixels.width;canvas.height=pixels.height;
        const context=canvas.getContext('2d');if(!context)return;
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data.buffer as ArrayBuffer,pixels.data.byteOffset,pixels.data.length),pixels.width,pixels.height),0,0);
        if(selection){context.strokeStyle='#f97316';context.lineWidth=Math.max(1,Math.ceil(pixels.width/500));context.setLineDash([4,3]);context.strokeRect(selection.x,selection.y,selection.width,selection.height);context.setLineDash([]);}
    },[pixels,selection]);

    const frameResult=useMemo(()=>pixels&&crop?renderCharacterFrame(putPixels(pixels),crop,transform):null,[pixels,crop,transform]);
    const frame=frameResult?.canvas||null;const clipped=frameResult?.clipped||false;
    useEffect(()=>{
        if(!frame||!frameCanvas.current)return;
        const canvas=frameCanvas.current;const context=canvas.getContext('2d');if(!context)return;
        canvas.width=BATTLE_CHARACTER_FRAME.width;canvas.height=BATTLE_CHARACTER_FRAME.height;context.imageSmoothingEnabled=false;context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(frame,0,0);
    },[frame]);
    useEffect(()=>{
        if(!frame)return;
        let alive=true;
        void blobFromCanvas(frame).then(blob=>{if(alive)setCharacterUrl(previewUrl(blob));}).catch(()=>{});
        return()=>{alive=false;};
    },[frame]);

    const updatePixels=(next:PixelImage)=>setPixels(next);
    const redrawStrokes=(base:PixelImage,strokes:BrushStroke[])=>strokes.reduce((current,stroke)=>stroke.mode==='fill'?removeColorRegion(current,stroke.points[0],stroke.tolerance):applyBrushStroke(current,sourcePixelsRef.current||base,stroke.points,stroke.radius,stroke.mode),base);

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
        if(bounds)setTransform(autoCharacterTransform(bounds));
        toast.success(result.alreadyTransparent?'图片已有透明背景，已保留透明像素':`已抠除边缘背景，容差 ${tolerance}`);
    };

    const autoAlign=()=>{if(!pixels)return;const bounds=alphaBounds(pixels);if(!bounds){toast.warning('当前没有可见角色像素');return;}setCrop(bounds);setTransform(autoCharacterTransform(bounds));};

    const pointerPoint=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        const rect=event.currentTarget.getBoundingClientRect();const canvas=event.currentTarget;
        return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
    };
    const sourcePointerDown=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!pixels)return;
        event.currentTarget.setPointerCapture(event.pointerId);const point=pointerPoint(event);drawing.current=true;lastPoint.current=point;
        if(tool==='fill'){const stroke:BrushStroke={points:[point],radius:0,mode:'fill',tolerance};setPixels(current=>current?removeColorRegion(current,point,tolerance):current);setBrushStrokes(current=>[...current,stroke]);setRedoStrokes([]);drawing.current=false;lastPoint.current=null;return;}
        if(tool==='crop'){setSelection({x:point.x,y:point.y,width:1,height:1});return;}
        const mode=tool;const stroke:BrushStroke={points:[point],radius:brushRadius,mode};drawingStroke.current=stroke;
        setPixels(current=>current?applyBrushStroke(current,sourcePixelsRef.current||current,stroke.points,stroke.radius,mode):current);
    };
    const sourcePointerMove=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
        if(!drawing.current||!pixels||!lastPoint.current)return;const point=pointerPoint(event);
        if(tool==='crop'){
            const start=lastPoint.current;setSelection({x:Math.max(0,Math.min(start.x,point.x)),y:Math.max(0,Math.min(start.y,point.y)),width:Math.max(1,Math.min(pixels.width,Math.abs(point.x-start.x))),height:Math.max(1,Math.min(pixels.height,Math.abs(point.y-start.y)))});return;
        }
        const stroke=drawingStroke.current;
        if(stroke&&stroke.mode!=='fill'){const segment=[lastPoint.current,point],mode=stroke.mode;stroke.points.push(point);setPixels(current=>current?applyBrushStroke(current,sourcePixelsRef.current||current,segment,stroke.radius,mode):current);}
        lastPoint.current=point;
    };
    const sourcePointerUp=()=>{
        if(!drawing.current)return;drawing.current=false;lastPoint.current=null;
        if(drawingStroke.current){const completed=drawingStroke.current;drawingStroke.current=null;setBrushStrokes(current=>[...current,completed]);setRedoStrokes([]);}
        if(tool==='crop'&&selection&&selection.width>4&&selection.height>4){const next={x:Math.round(selection.x),y:Math.round(selection.y),width:Math.round(selection.width),height:Math.round(selection.height)};setCrop(next);setTransform(autoCharacterTransform(next));}
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

    const updateOverlay=(key:Exclude<OverlayTarget,'none'>,value:AppearanceOverlayTransform)=>setOverlays(current=>({...current,[key]:value}));
    const generate=async()=>{
        if(busy||generationSubmission.current||isTaskActive||generationTask.isRecovering())return;
        generationSubmission.current=true;setBusy(true);setMessage('');
        try{
            let poseReferenceImageId:string|undefined;
            if(options?.supportsReferenceImages&&(options.maxReferenceImages||0)>0){
                const key=`${jobId}:${weaponId}`;
                if(poseReference.current?.key!==key){const uploaded=await uploadResource(await createBattlePoseReference(jobId,weaponId),'agent_art');poseReference.current={key,assetId:uploaded.id};}
                poseReferenceImageId=poseReference.current.assetId;
            }
            const data=await generateBattleAppearanceImage(agent.id,{prompt:extraRequirements.trim(),modelId:modelId||undefined,requestId:createRequestKey(),aspectRatio:ratio||'3:4',imageSize:selectedSize||'1K',poseReferenceImageId,appearanceReferenceImageId:appearanceReferenceImageId||undefined,useAgentAvatar:true,backgroundMode:generationBackground});
            await loadTaskAsset(data);toast.success(ACTIVE_TASKS.has(data.status)?'生图任务已提交；关闭编辑器后可再次打开继续查询':'图片已生成');
        }catch(error){const text=error instanceof Error?error.message:'生图请求失败';setMessage(text);toast.error(text);}
        finally{generationSubmission.current=false;setBusy(false);}
    };

    const uploadReference=async(file?:File)=>{
        if(!file)return;if(!isSupportedImage(file)){toast.warning('参考图只支持 PNG、JPEG 或 WebP');return;}
        if(file.size>uploadLimits.maxFileSizeMb*1024*1024){toast.warning(`参考图不能超过 ${uploadLimits.maxFileSizeMb} MB`);return;}
        try{const bitmap=await createImageBitmap(file);const dimensions={width:bitmap.width,height:bitmap.height,fileSize:file.size};bitmap.close();if(imageExceedsUploadLimit(dimensions,uploadLimits)||dimensions.width*dimensions.height>12_000_000)throw new Error(`参考图长边不能超过 ${uploadLimits.maxLongEdge} 像素，像素总数不能超过 1200 万`);const uploaded=await uploadResource(file,'agent_art');setAppearanceReferenceImageId(uploaded.id);setReferenceFile(file);toast.success('外观参考图已上传');}
        catch(error){toast.error(error instanceof Error?error.message:'参考图上传失败');}
        if(referenceInput.current)referenceInput.current.value='';
    };

    const transfer=useAppearancePackage(agent.name,async()=>{
        const original=sourceFile||sourceFileRef.current;
        if(!original||!pixels||!crop||clipped)throw new Error('请先完成角色素材和位置调整');
        return {source:original,cutout:await blobFromCanvas(putPixels(pixels)),
            character:await blobFromCanvas(renderCharacterFrame(putPixels(pixels),crop,transform).canvas),
            transform:{x:transform.x,y:transform.y,scale:transform.scale,crop},overlays:structuredClone(overlays),preview:{jobId,weaponId}};
    },async(draft,isCurrent)=>{
        if(!outfitArts.some(item=>item.id===draft.preview.jobId)||!(draft.preview.weaponId==='none'||independentWeapons.some(item=>item.id===draft.preview.weaponId)))throw new Error('当前版本不支持包中的职业或武器，请更新到导出环境的版本');
        const [cutout,character]=await Promise.all([decodeFile(makeFile(draft.cutout,'cutout.png')),decodeFile(makeFile(draft.character,'character.png'))]);
        const restoredFrame=renderCharacterFrame(cutout.canvas,draft.transform.crop!,draft.transform);
        const actual=restoredFrame.canvas.getContext('2d')!.getImageData(0,0,374,528).data;
        if(restoredFrame.clipped||actual.some((pixel,index)=>pixel!==character.pixels.data[index])||!alphaBounds({width:374,height:528,data:actual})||!actual.some((pixel,index)=>index%4===3&&pixel<255))throw new Error('形象包的成品与编辑参数不一致、缺少透明背景或超出画布，请重新导出');
        if(!isCurrent())return;
        await installImage(draft.source,'',{cutout:{width:cutout.canvas.width,height:cutout.canvas.height,data:cutout.pixels.data},transform:draft.transform},isCurrent);
        if(!isCurrent())return;
        setOverlays(draft.overlays);setJobId(draft.preview.jobId);setWeaponId(draft.preview.weaponId);
        setLegacyHeadUrl('');setActiveOverlay('none');
        setMessage('形象包已导入。预览已还原；实际战斗使用目标 Agent 的职业和装备，职业、武器一致时布局一致。检查后点击保存战斗形象。');
    });

    const save=async()=>{
        if(saving||(!restoreDefaultPending&&(!pixels||!crop)))return;
        if(!restoreDefaultPending&&clipped){toast.warning('头发超出完整画布，请缩小或调整位置后保存');return;}
        setSaving(true);setMessage('');
        try{
            if(restoreDefaultPending){
                await clearAgentBattleAppearance(agent.id);onSaved(null);toast.success('已恢复默认战斗形象');onClose();return;
            }
            if(!pixels||!crop)return;
            const finalRender=renderCharacterFrame(putPixels(pixels),crop,transform);
            let sourceId=sourceAssetId;
            if(!sourceId){const file=sourceFile||sourceFileRef.current;if(!file)throw new Error('请重新载入原图素材');sourceId=(await uploadResource(file,'agent_art')).id;}
            const cutoutFile=makeFile(await blobFromCanvas(putPixels(pixels)),`${agent.name}-战斗去背景.png`);
            const characterFile=makeFile(await blobFromCanvas(finalRender.canvas),`${agent.name}-战斗全身形象.png`);
            const cutoutId=(await uploadResource(cutoutFile,'agent_art')).id;const characterId=(await uploadResource(characterFile,'agent_art')).id;
            const saved=await saveAgentBattleAppearance(agent.id,{version:3,sourceAssetId:sourceId,cutoutAssetId:cutoutId,characterAssetId:characterId,
                transform:{x:transform.x,y:transform.y,scale:transform.scale,crop},overlays});
            onSaved(saved);toast.success('战斗形象已保存，当前探索和历史记录会使用新形象');onClose();
        }catch(error){const text=error instanceof Error?error.message:'保存战斗形象失败';setMessage(text);toast.error(text);}
        finally{setSaving(false);}
    };

    const restoreDefault=()=>{
        if(saving||initializing)return;
        sourceFileRef.current=null;sourcePixelsRef.current=null;baseCutoutRef.current=null;
        setRestoreDefaultPending(true);setSourcePixels(null);setBaseCutout(null);setPixels(null);setCrop(null);setSelection(null);
        setSourceFile(null);setSourceAssetId('');setSourceName('');setTransform({x:0,y:0,scale:1});
        setCharacterUrl('');setLegacyHeadUrl('');setBrushStrokes([]);setRedoStrokes([]);
        setOverlays(structuredClone(DEFAULT_APPEARANCE_OVERLAYS));setActiveOverlay('none');setMessage('');
        toast.success('已在预览中恢复默认；点击“保存战斗形象”后生效');
    };

    useEffect(()=>{
        const onPaste=(event:ClipboardEvent)=>{const file=Array.from(event.clipboardData?.files||[]).find(item=>ALLOWED_IMAGE_TYPES.has(item.type));if(file)void handleFile(file);};
        const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
        window.addEventListener('paste',onPaste);window.addEventListener('keydown',onKey);
        return()=>{window.removeEventListener('paste',onPaste);window.removeEventListener('keydown',onKey);};
    });

    const checker=backgroundColor==='checker'?'bg-[conic-gradient(#e2e8f0_25%,white_0_50%,#e2e8f0_0_75%,white_0)] [background-size:16px_16px]':backgroundColor==='dark'?'bg-slate-800':'bg-slate-100';
    const nudge=(x:number,y:number)=>setTransform(value=>({...value,x:value.x+x,y:value.y+y}));

    return createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/55 p-0 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
        <section role="dialog" aria-modal="true" aria-labelledby="battle-appearance-title" className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-slate-200 bg-slate-50 shadow-2xl sm:h-[min(92vh,900px)] sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><Sparkles className="h-5 w-5"/></div><div className="min-w-0"><h2 id="battle-appearance-title" className="truncate text-base font-bold text-slate-900">{agent.name} · 战斗形象</h2><p className="text-xs text-slate-500">独立于日常头像保存 · 全身像素角色导出 374×528</p></div></div>
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭"><X className="h-5 w-5"/></button>
            </header>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-5">
                <AppearancePackageControls disabled={initializing||saving||busy||isTaskActive||transfer.transferring} canExport={!!pixels&&!!crop&&!clipped} onExport={()=>void transfer.exportPackage()} onImport={file=>void transfer.importPackage(file)}/>
                <div className="space-y-4" inert={transfer.transferring}>
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">1. 上传或生成素材</h3><p className="mt-1 text-xs leading-5 text-slate-500">支持 PNG、JPEG、WebP；拖入、粘贴或点击选择。透明 PNG 会保留透明通道。</p></div><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event=>void handleFile(event.target.files?.[0])}/><button type="button" onClick={()=>fileInput.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"><Upload className="h-4 w-4"/>上传</button></div>
                            <div onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDrop={event=>{event.preventDefault();void handleFile(event.dataTransfer.files?.[0]);}} className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-xs text-slate-500">{sourceName||'也可以把图片拖到这里，或先复制图片再粘贴'}</div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">生图模型</label><SettingsSelect value={modelId} options={modelOptions} onChange={setModelId} placeholder="选择生图模型" menuPortal/></div>
                                <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">外观补充要求（可选）</label><input value={extraRequirements} onChange={event=>setExtraRequirements(event.target.value.slice(0,180))} placeholder="可留空；例如：保留斗篷颜色，减少胸前装饰" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/><p className="mt-1 text-[11px] leading-4 text-slate-500">留空也会按优先级参考图生成。头像提供身份外观，不复制头像表情；站姿、战斗表情和手腕位置始终跟随战斗模板。</p></div>
                                <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">生成背景</label><SettingsSelect value={generationBackground} options={[{value:'flat',label:'纯色背景 · 便于去背景'},{value:'transparent',label:'请求透明 PNG · 模型尽力输出'}]} onChange={value=>setGenerationBackground(value==='transparent'?'transparent':'flat')} menuPortal/><p className="mt-1 text-[11px] leading-4 text-slate-500">{generationBackground==='transparent'?'当前接口无法保证透明通道；收到有色背景时仍需去背景。最终保存始终是透明 PNG。':'使用纯品红背景，导入后自动抠除；封闭空隙可用点选去背景清理。'}</p></div>
                                {ratioOptions.length>0&&<div><label className="mb-1.5 block text-xs font-semibold text-slate-600">画面比例</label><SettingsSelect value={ratio} options={ratioOptions} onChange={setRatio} menuPortal/></div>}
                                {sizeOptions.length>0&&<div><label className="mb-1.5 block text-xs font-semibold text-slate-600">分辨率</label><SettingsSelect value={selectedSize} options={sizeOptions} onChange={setSize} menuPortal/></div>}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50/80 px-3 py-2.5">
                                <div className="min-w-0"><p className="text-xs font-semibold text-orange-900">角色外观参考</p><p className="mt-0.5 text-[11px] leading-4 text-orange-900/75">{options?.supportsReferenceImages?(referenceFile?`这张临时图片优先决定服装与外观。${(options.maxReferenceImages||0)>=3&&options.agentReferenceImages?.avatar?'模型容量允许时，还会用 Agent 头像补充身份。':''}`:options.agentReferenceImages?.fullBody?`默认优先 Agent 全身参考图。${(options.maxReferenceImages||0)>=3&&options.agentReferenceImages?.avatar?'模型容量允许时，再用头像补充身份。':''}可上传图片临时覆盖服装外观。`:options.agentReferenceImages?.avatar?'未配置全身照，将用 Agent 头像作身份参考并按战斗职业补全服装。':'没有 Agent 形象参考；仍会按战斗模板生成，可上传一张角色图提高辨识度。'):options?.configured?'此模型不支持图生图，生成结果无法读取 Agent 图片。请选择支持参考图的模型，或直接上传完整角色图。':options?.message||'正在读取模型能力。'} 战斗模板单独控制像素风格、正视战斗姿势、睁眼表情、手腕和持握姿势。</p></div>
                                <div className="flex shrink-0 items-center gap-2"><input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event=>void uploadReference(event.target.files?.[0])}/>
                                    {options?.supportsReferenceImages&&<><button type="button" onClick={()=>referenceInput.current?.click()} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-orange-800 shadow-sm hover:bg-orange-100">{appearanceReferenceImageId?'替换外观参考图':'上传外观参考图'} <ImagePlus className="ml-1 inline h-3.5 w-3.5"/></button>{appearanceReferenceImageId&&<button type="button" onClick={()=>{setAppearanceReferenceImageId('');setReferenceFile(null);}} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm hover:bg-slate-100">恢复 Agent 默认参考</button>}</>}
                                </div>
                            </div>
                            {options?.mode==='automatic'&&<p className="mt-2 text-[11px] text-amber-700">此模型自动决定画幅和分辨率，生成参数由模型服务处理。</p>}
                            {options?.configured===false&&<p className="mt-2 text-xs text-rose-600">{options.message||'尚未配置生图模型，可以先上传图片。'}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy||isTaskActive||generationTask.recovering||!options?.configured||imageModels.length===0} onClick={()=>void generate()} title={isTaskActive?'当前任务完成后才能重新生成':''} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{busy||isTaskActive?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}{isTaskActive?'生成任务进行中':'生成完整战斗角色'}</button><span className="text-[11px] text-slate-400">默认 3:4 · 1K · {generationBackground==='transparent'?'请求透明 PNG':'纯色背景便于抠除'}</span></div>
                            {task&&<BattleHeadTaskStatus task={task} {...generationTask} onCancel={()=>void generationTask.cancel()} onRecover={()=>void generationTask.recover()} onLoad={()=>void loadTaskAsset(task)} loadedAssetId={sourceAssetId}/>}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">2. 去背景和修边</h3><p className="mt-1 text-xs text-slate-500">只抠除与边缘相连的纯色区域；眼睛等内部同色像素会保留。</p></div><div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[10px]">{(['checker','light','dark'] as const).map((value,index)=><button key={value} onClick={()=>setBackgroundColor(value)} className={`rounded-full px-2 py-1 ${backgroundColor===value?'bg-white text-slate-800 shadow-sm':'text-slate-500'}`}>{['棋盘','浅色','深色'][index]}</button>)}</div></div>
                            {pixels?<><div className={`flex h-[360px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 ${checker}`}><canvas ref={stageCanvas} className="max-h-[350px] max-w-full touch-none object-contain [image-rendering:pixelated]" onPointerDown={sourcePointerDown} onPointerMove={sourcePointerMove} onPointerUp={sourcePointerUp} onPointerCancel={sourcePointerUp} aria-label="完整角色素材修边画布"/></div>
                                <div className="mt-3 flex flex-wrap items-center gap-1.5"><button type="button" onClick={()=>setTool('crop')} className={`rounded-lg px-3 py-2 text-xs ${tool==='crop'?'bg-orange-100 font-semibold text-orange-800':'bg-slate-100 text-slate-600'}`}>框选完整角色</button><button type="button" onClick={removeBackground} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 hover:bg-slate-200">重新去背景</button><button type="button" onClick={()=>setTool('fill')} className={`rounded-lg px-3 py-2 text-xs ${tool==='fill'?'bg-orange-100 font-semibold text-orange-800':'bg-slate-100 text-slate-600'}`}>点选去背景</button><button type="button" onClick={()=>setTool('erase')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs ${tool==='erase'?'bg-orange-100 text-orange-800':'bg-slate-100 text-slate-600'}`}><Eraser className="h-3.5 w-3.5"/>擦除</button><button type="button" onClick={()=>setTool('restore')} className={`rounded-lg px-3 py-2 text-xs ${tool==='restore'?'bg-orange-100 text-orange-800':'bg-slate-100 text-slate-600'}`}>恢复原图</button><button type="button" disabled={!brushStrokes.length} onClick={undo} className="rounded-lg bg-slate-100 p-2 text-slate-600 disabled:opacity-40" title="撤销修补"><Undo2 className="h-4 w-4"/></button><button type="button" disabled={!redoStrokes.length} onClick={redo} className="rounded-lg bg-slate-100 p-2 text-slate-600 disabled:opacity-40" title="重做修补"><Redo2 className="h-4 w-4"/></button><button type="button" onClick={autoAlign} className="ml-auto rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">自动适配画布</button></div>
                                {tool==='crop'&&<div className="mt-2 flex items-center gap-2"><span className="text-[11px] text-slate-500">框选从头发到鞋底的完整角色；别裁掉长发、披风或手臂</span>{selection&&<button type="button" onClick={()=>{const next={x:Math.round(selection.x),y:Math.round(selection.y),width:Math.round(selection.width),height:Math.round(selection.height)};setCrop(next);setTransform(autoCharacterTransform(next));setSelection(null);}} className="text-[11px] font-semibold text-orange-700">应用选区</button>}</div>}
                                {tool==='fill'&&<p className="mt-2 text-[11px] leading-5 text-orange-700">点击头发或手臂之间残留的背景色块，只清除这块相连区域；误删可撤销。边缘有色边时适当提高容差。</p>}
                                <div className="mt-2 flex items-center gap-2"><label className="text-[11px] text-slate-500">去背景容差 {tolerance}</label><input type="range" min="0" max="128" step="2" value={tolerance} onChange={event=>setTolerance(Number(event.target.value))} className="w-36 accent-orange-500"/></div>
                                {(tool==='erase'||tool==='restore')&&<div className="mt-2 flex items-center gap-2"><label className="text-[11px] text-slate-500">画笔 {brushRadius}px</label><input type="range" min="1" max="64" value={brushRadius} onChange={event=>setBrushRadius(Number(event.target.value))} className="w-32 accent-orange-500"/></div>}
                            </>:<button type="button" onClick={()=>fileInput.current?.click()} className="flex h-[210px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 hover:border-orange-300 hover:bg-orange-50/40"><Upload className="h-6 w-6 text-slate-400"/>上传或生成一张完整角色图</button>}
                        </section>

                    <div className={`grid items-start gap-4 ${pixels?'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]':''}`}>
                        {pixels&&<section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3"><h3 className="text-sm font-bold text-slate-800">3. 调整完整角色在战斗画布中的位置</h3><p className="mt-1 text-xs text-slate-500">拖动整个人物或用方向键微调；自动适配会保留头发、衣服和鞋子。</p></div>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                                <div className={`flex min-h-[190px] items-center justify-center rounded-xl border border-slate-200 ${checker}`}><div className="relative aspect-[374/528] w-full max-w-[253px] overflow-hidden"><canvas ref={frameCanvas} tabIndex={0} className="absolute inset-0 h-full w-full touch-none outline-none [image-rendering:pixelated] focus:ring-2 focus:ring-orange-300" onPointerDown={framePointerDown} onPointerMove={framePointerMove} onPointerUp={framePointerUp} onPointerCancel={framePointerUp} onKeyDown={event=>{const step=event.shiftKey?4:1;if(event.key==='ArrowLeft'){event.preventDefault();nudge(-step,0);}if(event.key==='ArrowRight'){event.preventDefault();nudge(step,0);}if(event.key==='ArrowUp'){event.preventDefault();nudge(0,-step);}if(event.key==='ArrowDown'){event.preventDefault();nudge(0,step);}}} aria-label="拖动完整角色到战斗画布中的合适位置"/></div></div>
                                <div className="space-y-3"><div><label className="mb-1 block text-[11px] font-semibold text-slate-600">等比缩放 {transform.scale.toFixed(2)}×</label><input type="range" min={BATTLE_CHARACTER_MIN_SCALE} max={BATTLE_CHARACTER_MAX_SCALE} step="0.001" value={transform.scale} onChange={event=>setTransform(value=>({...value,scale:Number(event.target.value)}))} className="w-full accent-orange-500"/></div><div className="flex items-center justify-center gap-1"><button onClick={()=>nudge(-1,0)} className="rounded-lg bg-slate-100 p-2" title="左移一像素"><ArrowLeft className="h-4 w-4"/></button><div className="flex flex-col gap-1"><button onClick={()=>nudge(0,-1)} className="rounded-lg bg-slate-100 p-2" title="上移一像素"><ArrowUp className="h-4 w-4"/></button><button onClick={()=>nudge(0,1)} className="rounded-lg bg-slate-100 p-2" title="下移一像素"><ArrowDown className="h-4 w-4"/></button></div><button onClick={()=>nudge(1,0)} className="rounded-lg bg-slate-100 p-2" title="右移一像素"><ArrowRight className="h-4 w-4"/></button></div>{clipped&&<p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">角色素材超出导出画布；请缩小或移回画布内，保留头发与鞋子。</p>}<p className="text-[10px] leading-4 text-slate-400">完整画布：374×528 px<br/>位置 ({transform.x}, {transform.y})</p></div>
                            </div>
                        </section>}
                        <BattleHeadPreview jobId={jobId} weaponId={weaponId} headUrl={legacyHeadUrl} characterUrl={characterUrl} onWeaponChange={setWeaponId} previewWeaponOnly={weaponId!==equippedWeapon} overlays={overlays} activeOverlay={activeOverlay} onActiveOverlayChange={setActiveOverlay} onOverlayChange={updateOverlay}/>
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Check className="h-4 w-4"/></div><div><h3 className="text-sm font-bold text-slate-800">成品预览</h3><p className="text-[11px] text-slate-500">透明全身角色替代默认身体；战斗职业特效、武器和校准后的双手继续独立显示</p></div></div><div className={`mt-3 flex h-[200px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 ${checker}`}>{characterUrl&&<img src={characterUrl} alt="374×528 完整战斗角色" className="max-h-full max-w-full object-contain [image-rendering:pixelated]"/>}</div></section>
                </div>
                {restoreDefaultPending&&<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">已切换为默认战斗形象预览，尚未保存。点击“保存战斗形象”提交；取消则保留原设置。</p>}
                {message&&<p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">{message}</p>}
            </div>
            <footer className="fixed inset-x-0 bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:px-6">
                <div className="flex gap-2"><button type="button" disabled={saving||transfer.transferring||initializing} onClick={restoreDefault} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4"/>恢复默认</button><button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">取消</button></div>
                <button type="button" disabled={saving||transfer.transferring||initializing||(!restoreDefaultPending&&(!pixels||!crop||clipped))} onClick={()=>void save()} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{saving?'保存中…':'保存战斗形象'}</button>
            </footer>
        </section>
    </div>,document.body);
}
