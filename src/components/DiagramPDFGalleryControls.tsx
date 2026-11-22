import {useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {DiagramProject} from '../app/diagramProject';
import {captureGalleryView,galleryAngles,galleryAnglesFor,gallerySources,clampDiagramGalleryPlacement,type DiagramGalleryView,type DiagramGalleryPlace,type DiagramGalleryPlacement,type DiagramGalleryBox} from '../app/diagramPDFGallery';
import {diagramPanelRoute} from '../app/diagramPDFBranchPanels';
import DiagramGalleryViewPicker from './DiagramGalleryViewPicker';
import {PDF_PT_PER_MM,diagramPanelNumber} from '../app/diagramPDFLayout';

export default function DiagramPDFGalleryControls({project,items=[],coverEnabled,onChange,onPreviewResults,selected,place,box,pageSize,onSelect,onMove,children}:{
  project:DiagramProject;items?:DiagramGalleryView[];coverEnabled:boolean;children?:ReactNode;
  onChange:(items:DiagramGalleryView[]|undefined,selection?:number|null,place?:DiagramGalleryPlace)=>void;onPreviewResults:()=>void;
  selected:number|null;place:DiagramGalleryPlace|null;box?:DiagramGalleryBox['box'];pageSize?:{width:number;height:number};
  onSelect:(index:number,place:DiagramGalleryPlace)=>void;
  onMove:(index:number,place:DiagramGalleryPlace,value:DiagramGalleryPlacement|undefined)=>void;
}){
  const [source,setSource]=useState(project.steps.at(-1)!.id);
  const [draftView,setDraftView]=useState<DiagramGalleryView>();
  const [picker,setPicker]=useState<'source'|number|null>(null);
  const sources=gallerySources(project);
  function sourceStep(id:string){
    const ref=sources.get(id)?.ref;
    return ref&&diagramPanelRoute(project,ref).steps[ref.stepIndex];
  }
  const step=sourceStep(source)??project.steps.at(-1)!;
  const draft=draftView?.stepId===step.id?draftView:undefined;
  const canPick=galleryAnglesFor(step).length>1;
  const editingItem=typeof picker==='number'?items[picker]:undefined;
  const pickerStep=picker==='source'?step:editingItem&&sourceStep(editingItem.stepId);
  function editView(index:number,patch:Partial<DiagramGalleryView>){
    const item=items[index];
    const target=place&&item[place]&&(place!=='cover'||coverEnabled)?place:item.result?'result':coverEnabled&&item.cover?'cover':undefined;
    onChange(items.map((old,i)=>i===index?{...old,...patch}:old),index,target);
  }
  function applyView(view:DiagramGalleryView){
    if(picker==='source'){setDraftView(view);return;}
    if(typeof picker==='number'&&editingItem?.stepId===view.stepId){
      editView(picker,{angle:view.angle,side:view.side,rotation:view.rotation,drawingRotation:view.drawingRotation,
        camera:view.camera,simulationView:view.simulationView});
    }
  }
  function change(index:number,patch:Partial<DiagramGalleryView>){
    const next=items.map((item,i)=>i===index?{...item,...patch}:item);
    if(patch.result===true)onChange(next,index,'result');
    else if(patch.result===false&&index===selected)onChange(next,null);
    else onChange(next);
  }
  function add(){
    const view=canPick&&draft?draft:captureGalleryView(step,'saved');
    onChange([...items,view],items.length,'result');
  }
  function editField(key:keyof DiagramGalleryPlacement,mm:number){
    if(selected===null||!place||!box||!pageSize||!Number.isFinite(mm))return;
    const raw={x:box.x/pageSize.width,y:box.y/pageSize.height,width:box.width/pageSize.width};
    raw[key]=mm*PDF_PT_PER_MM/(key==='y'?pageSize.height:pageSize.width);
    onMove(selected,place,clampDiagramGalleryPlacement(raw,box.width/box.height,pageSize));
  }
  return <div className="diagram-export-gallery">
    <h3>多角度成品图</h3>
    <div className="diagram-export-fields diagram-gallery-source">
      <label>来源步骤<select value={step.id} onChange={e=>{setSource(e.target.value);setDraftView(undefined);}}>{Array.from(sources.values(),({step:s,ref})=><option key={s.id} value={s.id}>第 {diagramPanelNumber(ref)} 步 {s.title}</option>)}</select></label>
      <div className="diagram-gallery-angle"><span>成品视角</span><button type="button" aria-label="选择成品视角" aria-haspopup="dialog" disabled={!canPick} title={canPick?'打开视角选择器':'此步骤仅提供当前画面'} onClick={()=>setPicker('source')}>{draft?galleryAngles[draft.angle??'saved']:canPick?'选择视角':'当前视角'}</button></div>
      <button type="button" onClick={add}>添加此视角</button>
    </div>
    {children}
    {items.map((item,i)=>{
      const entry=sources.get(item.stepId);
      const canCover=coverEnabled&&item.cover,canResult=item.result,active=selected===i;
      const angleLabel=galleryAngles[item.angle??'saved'];
      const adjustable=!!entry&&galleryAnglesFor(entry.step).length>1;
      return <fieldset key={i} className={'diagram-gallery-item'+(active?' is-selected':'')}><legend>{i+1} · {entry?'第 '+diagramPanelNumber(entry.ref)+' 步':'来源步骤已删除'} · {angleLabel}</legend>
        <input aria-label={'成品图 '+(i+1)+' 图注'} value={item.caption} placeholder="图注（可选）" maxLength={100} onChange={e=>change(i,{caption:e.target.value})}/>
        <label><input type="checkbox" disabled={!entry} checked={item.result} onChange={e=>change(i,{result:e.target.checked})}/>成品页</label>
        <label><input type="checkbox" disabled={!coverEnabled||!entry} checked={item.cover} onChange={e=>change(i,{cover:e.target.checked})}/>用于封面</label>
        <button type="button" aria-label={'调整成品图 '+(i+1)} aria-pressed={active} disabled={!entry||!canCover&&!canResult}
          onClick={()=>onSelect(i,canResult?'result':'cover')}>调整</button>
        <button type="button" aria-label={'移除成品图 '+(i+1)} onClick={()=>{const next=items.filter((_,j)=>j!==i);onChange(next.length?next:undefined,selected===null||selected===i?null:selected>i?selected-1:selected);}}>移除</button>
        <div role="group" className="diagram-gallery-directions" aria-label={'成品图 '+(i+1)+' 的方向'}>
          <button type="button" aria-haspopup="dialog" aria-label={'修改成品图 '+(i+1)+' 的视角'} disabled={!adjustable} title={adjustable?'打开视角选择器':'此来源仅有当前画面'} onClick={()=>setPicker(i)}>调整视角</button>
          <button type="button" disabled={!entry} aria-pressed={!!item.mirrorX} onClick={()=>editView(i,{mirrorX:!item.mirrorX})}>左右镜像</button>
          <button type="button" disabled={!entry} aria-pressed={!!item.mirrorY} onClick={()=>editView(i,{mirrorY:!item.mirrorY})}>上下镜像</button>
        </div>
        {active&&entry&&(canCover||canResult)&&<div className="diagram-gallery-placement">
          <div role="group" aria-label="成品图调整页面">
            {canCover&&<button type="button" aria-pressed={place==='cover'} onClick={()=>onSelect(i,'cover')}>封面位置</button>}
            {canResult&&<button type="button" aria-pressed={place==='result'} onClick={()=>onSelect(i,'result')}>成品页位置</button>}
          </div>
          {place&&item[place]&&box&&<div className="diagram-gallery-dimensions">
            {([['x','左距'],['y','顶距'],['width','宽度']] as const).map(([key,label])=><label key={key}>{label} (mm)
              <input key={place+'-'+Math.round(box[key]*1000)} type="number" min={key==='width'?0.1:0} step="0.1"
                defaultValue={Number((box[key]/PDF_PT_PER_MM).toFixed(1))} aria-label={'成品图'+label+'（毫米）'}
                onBlur={e=>{
                  const field=e.currentTarget,entered=field.valueAsNumber,previous=Number((box[key]/PDF_PT_PER_MM).toFixed(1));
                  field.value=String(previous);
                  if(Number.isFinite(entered)&&entered>=0&&(key!=='width'||entered>0)&&entered!==previous)editField(key,entered);
                }}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>
            </label>)}
          </div>}
          {place&&item.layout?.[place]&&<button type="button" onClick={()=>onMove(i,place,undefined)}>恢复此图自动排版</button>}
        </div>}
      </fieldset>;
    })}
    {items.some(v=>v.result&&sources.has(v.stepId))&&<button type="button" onClick={onPreviewResults}>预览成品页</button>}
    {picker!==null&&pickerStep&&createPortal(<DiagramGalleryViewPicker step={pickerStep} initialView={picker==='source'?draft:editingItem} onApply={applyView} onClose={()=>setPicker(null)}/>,document.body)}
  </div>;
}

