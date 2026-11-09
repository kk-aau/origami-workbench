import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {apiWhenIdle} from '../app/api';
import {applyNestedMother,initialNestedMother,nestedMotherFamilies,nestedMotherPreviewRequest,
  readNestedMother,type NestedMotherParent} from '../app/nestedMotherParams';
import {prepareTessResult,tessConstructionKey,type TessParams,type TessResult,type TessResponse} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';
import WovenGraphCanvas from './WovenGraphCanvas';
import './NestedMotherEditorDialog.css';

export type MotherControlsProps={params:TessParams;onChange:(p:TessParams)=>void;
  onPreview:(p:TessParams)=>void;onCancelPreview:()=>void;result:TessResult|null;
  busy:boolean;stale:boolean;generationError:string;families:ReturnType<typeof nestedMotherFamilies>;hidePaper:boolean};

export default function NestedMotherEditorDialog({parent,onApply,onClose,renderControls}:{
  parent:NestedMotherParent;onApply:(p:NestedMotherParent)=>void;onClose:()=>void;
  renderControls:(props:MotherControlsProps)=>ReactNode}){
  const [draft,setDraft]=useState<TessParams>(()=>initialNestedMother(parent)),[transient,setTransient]=useState<TessParams|null>(null);
  const [preview,setPreview]=useState<{key:string;result:TessResult}|null>(null),[busy,setBusy]=useState(false),[requestError,setRequestError]=useState('');
  const fields=useRef<HTMLDivElement>(null),[invalidFields,setInvalidFields]=useState(false);
  const checkFields=()=>setInvalidFields(!!fields.current&&[...fields.current.querySelectorAll<HTMLInputElement>('input[type=number]')]
    .some(input=>input.value.trim()===''||!input.validity.valid));
  const effective=transient??draft,key=tessConstructionKey(effective);
  const validation=useMemo(()=>{try{return {mother:readNestedMother(parent,effective),error:''};}
    catch(cause){return {mother:null,error:(cause as Error).message};}},[key]);
  useEffect(()=>{
    setRequestError('');
    if(!validation.mother){setBusy(false);return;}
    const controller=new AbortController();setBusy(true);
    // Coalesce typing/dragging, retain the last graph, and reject stale responses.
    const timer=window.setTimeout(()=>{
      const query=nestedMotherPreviewRequest(parent,effective);
      void apiWhenIdle<TessResponse>('tessellate',query,controller.signal).then(response=>{
        if(controller.signal.aborted)return;
        const result=prepareTessResult(response,query);
        if(!result.mother?.faces_vertices.length)throw Error('当前参数未生成可用母结构，请调整参数。');
        setPreview({key,result});setBusy(false);
      }).catch(cause=>{if(!controller.signal.aborted){setBusy(false);setRequestError((cause as Error).message);}});
    },130);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[key,validation.error]);
  const current=preview?.key===key&&!busy&&!requestError&&!validation.error;
  useEffect(()=>{const frame=requestAnimationFrame(checkFields);return()=>cancelAnimationFrame(frame);},[draft.family,key]);
  const mother=preview?.result.mother,problem=validation.error||requestError;
  const geometryKey=JSON.stringify(mother?.vertices_coords??[]),focusToken=useRef(0);
  const focus=useMemo(()=>({key:++focusToken.current,vertices:mother?.vertices_coords.map((_,i)=>i)??[]}),[geometryKey]);
  const title=parent.family==='flagstone'?'可视编辑铺石母参数':'可视编辑原始—对偶母参数';
  const commit=()=>{if(!current||transient||invalidFields)return;onApply(applyNestedMother(parent,draft));onClose();};
  return <TessDialog title={title} onClose={onClose} className="nested-mother-editor">
    <div className="nested-mother-body">
      <div className="nested-mother-controls" ref={fields} onInputCapture={checkFields}>{renderControls({params:draft,
        onChange:p=>{setDraft(p);setTransient(null);},onPreview:setTransient,onCancelPreview:()=>setTransient(null),
        result:preview?.result??null,busy,stale:!current,generationError:problem,
        families:nestedMotherFamilies(parent),hidePaper:parent.family==='primal-dual'})}</div>
      <div className="nested-mother-preview">
        <div className="nested-mother-legend"><span>黑色：母结构</span><span>源坐标 · 滚轮缩放／平移</span></div>
        {mother?<WovenGraphCanvas points={mother.vertices_coords} edges={mother.edges_vertices}
          kinds={mother.edges_vertices.map(()=> 'B')} label="嵌套母结构草稿预览" minimumLabelPixels={12.1} focus={focus}
          numbers={false} onEdgePick={()=>{}}/>
          :<div className="nested-mother-empty">正在生成母结构预览…</div>}
        <div className="nested-mother-status" role="status" data-error={!!problem}>
          {problem||(invalidFields?'请补全有效数值，上一预览暂不可采用':!current?'参数更新中，上一预览暂不可采用':`母结构 ${mother?.vertices_coords.length??0} 点 · ${mother?.faces_vertices.length??0} 面`)}
        </div>
      </div>
    </div>
    <footer><span>{parent.family==='primal-dual'?'母结构改变后清除旧对偶目标、面选择与外层纸张；按新母图重算。':'母结构改变后清除旧对偶目标；原铺石参数和纸张保留。'}</span>
      <button onClick={onClose}>取消</button><button className="primary" disabled={!current||!!transient||invalidFields} onClick={commit}>采用母结构参数</button>
    </footer>
  </TessDialog>;
}
