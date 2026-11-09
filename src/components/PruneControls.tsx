import {useEffect,useMemo,useState} from 'react';
import {api} from '../app/api';
import {changeTessParams,type TessGraph,type TessParams,type TessResponse,type TessResult,type XY} from '../app/tessellation';
import {defaultPruneBoundary,previewPrune,pruneBoundaryError,pruneMotherPreviewParams,pruneParamsForBoundary,rectangularPruneBoundary,type PrunePaperMode} from '../app/prunePreview';
import TessellationEditor from './TessellationEditor';

type PruneSession={params:TessParams;mother:TessGraph|null;initial:XY[]};

export default function PruneControls({params,result,onChange,onPreview,onCancelPreview}:{params:TessParams;result:TessResult|null;onChange:(p:TessParams)=>void;onPreview?:(p:TessParams)=>void;onCancelPreview?:()=>void}){
  const [session,setSession]=useState<PruneSession|null>(null),[mother,setMother]=useState<TessGraph|null>(null),
    [draft,setDraft]=useState<XY[]>([]),[complete,setComplete]=useState(false),[loading,setLoading]=useState(false),
    [sourceNote,setSourceNote]=useState(''),[advanced,setAdvanced]=useState(false),[text,setText]=useState(''),
    [jsonError,setJsonError]=useState(''),[paperMode,setPaperMode]=useState<PrunePaperMode>('inscribed'),
    [command,setCommand]=useState<{id:number;points:XY[]}>({id:0,points:[]});

  useEffect(()=>{
    if(!session)return;
    const needsOriginal=!!session.params.pruneBoundary||!!session.params.paper||!session.mother;
    setMother(session.mother);setComplete(!needsOriginal);setSourceNote('');setLoading(needsOriginal);
    if(!needsOriginal)return;
    const query=pruneMotherPreviewParams(session.params),controller=new AbortController();
    if(!query){setLoading(false);setSourceNote('完整母图参数无法预览；当前颜色仅对应已生成拼块，采用后按原参数重新筛选。');return;}
    const load=async()=>{
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]);let response:TessResponse;
        for(let attempt=0;;attempt++){
          try{response=await api<TessResponse>('tessellate',query,signal);break;}
          catch(cause){
            if(signal.aborted||attempt>=24||!(cause instanceof Error)||!cause.message.includes('已有镶嵌计算正在进行'))throw cause;
            await new Promise(resolve=>setTimeout(resolve,200));
          }
        }
        if(controller.signal.aborted)return;
        if(!response.mother?.faces_vertices.length)throw Error('未返回完整母结构。');
        setMother(response.mother);setComplete(true);setLoading(false);
      }catch(cause){
        if(controller.signal.aborted)return;
        setLoading(false);setComplete(false);
        setSourceNote(`完整母图预览未就绪：${(cause as Error).message} 当前只显示已生成拼块；采用后由主计算确认完整结果。`);
      }
    };
    void load();return ()=>controller.abort();
  },[session]);

  const preview=useMemo(()=>previewPrune(mother,draft),[mother,draft]);
  const replace=(points:XY[])=>{setDraft(points);setCommand(old=>({id:old.id+1,points:structuredClone(points)}));setJsonError('');};
  const close=()=>{onCancelPreview?.();setSession(null);};
  const open=()=>{
    const initial=structuredClone(params.pruneBoundary??defaultPruneBoundary(result?.mother));
    setDraft(initial);setText(JSON.stringify(initial));setAdvanced(false);setJsonError('');setMother(result?.mother??null);setComplete(false);setPaperMode('inscribed');
    setLoading(!!params.pruneBoundary||!!params.paper||!result?.mother);
    setCommand(old=>({id:old.id+1,points:initial}));
    setSession({params:structuredClone(params),mother:result?.mother??null,initial});
  };
  const validate=(points:XY[])=>pruneBoundaryError(points)||(loading?'完整母图正在载入，请稍后采用修剪范围。':complete?previewPrune(mother,points).problem:'');
  const previewPoints=(points:XY[],mode=paperMode)=>{
    setDraft(points);
    if(!session||loading||!complete)return;
    const problem=pruneBoundaryError(points)||(complete?previewPrune(mother,points).problem:'');
    if(problem){onCancelPreview?.();return;}
    const next=pruneParamsForBoundary(session.params,points,mode);
    if(JSON.stringify(next)===JSON.stringify(session.params)){onCancelPreview?.();return;}
    onPreview?.(next);
  };
  useEffect(()=>{if(session&&complete&&!loading)previewPoints(draft);},[complete,loading]);
  const importJson=()=>{
    try{
      const value:unknown=JSON.parse(text);
      if(!Array.isArray(value)||value.some(point=>!Array.isArray(point)||point.length!==2||point.some(n=>typeof n!=='number'||!Number.isFinite(n))))throw Error('请输入 [X,Y] 点数组。');
      const points=value as XY[],problem=pruneBoundaryError(points);
      if(problem)throw Error(problem);
      replace(structuredClone(points));
    }catch(cause){setJsonError((cause as Error).message);}
  };
  return <>
    <button className="text-button" onClick={open}>修剪范围{params.pruneBoundary?' · 已启用':''}</button>
    {session&&<TessellationEditor title="修剪母结构" initial={session.initial} pointsCommand={command}
      min={-10} max={10} minPoints={3} maxPoints={32} mother={mother} orderedPath="closed" editablePoints
      xLabel="轮廓 X" yLabel="轮廓 Y" invertY onPreview={previewPoints} validateGeometry={validate}
      backgroundFaces={mother?.faces_vertices.map((face,i)=>({points:face.map(index=>mother.vertices_coords[index]),
        fill:preview.states[i]==='keep'?'#00a4b733':'#b16b5930',status:preview.states[i]}))}
      previewSummary={<div className="prune-preview-summary" role="status" style={{display:'flex',flexWrap:'wrap',gap:'3px 12px',fontSize:11}}>
        <span style={{color:'#087b86'}}>● 保留相交整块 {preview.kept}</span><span style={{color:'#985541'}}>● 删除完全外部 {preview.removed}</span>
        <span>接触边或顶点也保留；拼块边界保持完整。</span>
        {loading&&<span>正在载入完整母图…</span>}
        {!loading&&complete&&preview.problem&&<span style={{color:'#a34735'}}>{preview.problem}</span>}
        {sourceNote&&<span>{sourceNote}</span>}
      </div>}
      extraControls={<div className="prune-extra-controls" style={{display:'flex',flexDirection:'column',gap:4}}>
        <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:5}}>
          <button onClick={()=>replace(rectangularPruneBoundary(draft))}>改为矩形</button>
          <span className="note">凸多边形 · 沿边插点，右击删点</span>
          {session.params.paper&&<label style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>纸张适配
            <select aria-label="修剪纸张适配" title="先按相交保留整块；内切纸张随后将生成折痕裁到独立纸边。" value={paperMode} onChange={e=>{const mode=e.target.value as PrunePaperMode;setPaperMode(mode);previewPoints(draft,mode);}}>
              <option value="inscribed">按原纸形内切 · 内缩 {Math.min(.45,session.params.paper.margin)}</option>
              <option value="mother">使用母结构外轮廓</option>
            </select>
          </label>}
          <button disabled={!session.params.pruneBoundary} onClick={()=>{onChange(changeTessParams(session.params,{pruneBoundary:undefined}));close();}}>清除修剪</button>
          <button aria-expanded={advanced} onClick={()=>{setText(JSON.stringify(draft));setAdvanced(value=>!value);setJsonError('');}}>高级坐标</button>
        </div>
        {session.params.paper&&paperMode==='inscribed'&&<span className="note" style={{fontSize:10}}>先保留相交整块，再将生成折痕内切到原纸形。</span>}
        {advanced&&<div style={{display:'flex',gap:5,alignItems:'center'}}>
          <textarea aria-label="修剪轮廓坐标" value={text} onChange={e=>{setText(e.target.value);setJsonError('');}}
            rows={2} spellCheck={false} style={{flex:1,minWidth:0,resize:'none',height:48,fontSize:11,margin:0}}/>
          <button onClick={importJson}>载入坐标</button>
        </div>}
        {jsonError&&<span role="alert" style={{color:'#a34735',fontSize:11}}>{jsonError}</span>}
      </div>}
      applyLabel="采用修剪范围" onApply={points=>onChange(pruneParamsForBoundary(session.params,points,paperMode))} onClose={close}/>} 
  </>;
}
