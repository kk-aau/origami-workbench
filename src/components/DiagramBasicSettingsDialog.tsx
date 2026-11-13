import {useId,useMemo,useState} from 'react';
import AppDialog from './AppDialog';
import ColorPicker from '../ui/ColorPicker';
import {diagramCustomPaperDoc,diagramPolygonPaperDoc,normalizeDiagramBasicSettings,type DiagramBasicSettings} from '../app/diagramBasicSettings';
import type {Doc,Point} from '../core/types';
import {getPaperBounds,paperPath} from '../app/paper';
import {DIAGRAM_LINE_STYLES,DIAGRAM_STROKE_PATTERN_LABELS,type DiagramLineAppearance} from '../app/diagramLineStyles';
import {DIAGRAM_STROKE_PATTERNS} from '../app/diagramAnnotations';
import {LINE_LABELS} from '../app/diagramAnnotationSVG';
import './DiagramBasicSettingsDialog.css';

export default function DiagramBasicSettingsDialog({initial,name,creating=false,paperEditable=true,currentPaper,onSubmit,onClose,busy=false,error=''}:{initial:DiagramBasicSettings;name:string;creating?:boolean;paperEditable?:boolean;currentPaper?:Doc;onSubmit:(name:string,settings:DiagramBasicSettings,customPaper?:Doc)=>Promise<void>|void;onClose:()=>void;busy?:boolean;error?:string}){
 const [draft,setDraft]=useState(()=>structuredClone(initial)),[title,setTitle]=useState(name),[problem,setProblem]=useState(''),id=useId();
 const [ratio,setRatio]=useState(()=>{const base=Math.min(initial.paper.width,initial.paper.height);return {width:String(Number((initial.paper.width/base).toPrecision(12))),height:String(Number((initial.paper.height/base).toPrecision(12)))};});
 const [customMode,setCustomMode]=useState<'editor'|'vertices'>(currentPaper?'editor':'vertices');
 const [vertices,setVertices]=useState(()=>[['0','0'],['1','0'],['1','1'],['0','1']]);
 const customPaper=useMemo(()=>{
  if(!creating||!paperEditable||draft.paper.shape!=='custom')return null;
  try{
   const doc=customMode==='editor'?(currentPaper?diagramCustomPaperDoc('自定义纸张',currentPaper):null):diagramPolygonPaperDoc('自定义纸张',vertices.map(row=>row.map(value=>value.trim()?Number(value):NaN) as Point));
   if(!doc)throw Error('请先在折痕编辑区准备纸张边界，或切换为输入顶点。');
   const bounds=getPaperBounds(doc),pad=Math.max(bounds.width,bounds.height)*.06;
   return {doc,path:paperPath(doc),viewBox:`${bounds.x-pad} ${bounds.y-pad} ${bounds.width+pad*2} ${bounds.height+pad*2}`,error:''};
  }catch(error){return {doc:undefined,path:'',viewBox:'0 0 1 1',error:error instanceof Error?error.message:String(error)};}
 },[creating,paperEditable,draft.paper.shape,customMode,currentPaper,vertices]);
 const setPaper=(patch:Partial<DiagramBasicSettings['paper']>)=>setDraft(previous=>{const next={...previous,paper:{...previous.paper,...patch}};try{return normalizeDiagramBasicSettings(next);}catch{return next;}});
 const setLine=(style:typeof DIAGRAM_LINE_STYLES[number],patch:Partial<DiagramLineAppearance>)=>setDraft(previous=>({...previous,lineDefaults:{...previous.lineDefaults,[style]:{...previous.lineDefaults[style],...patch}}}));
 async function submit(){
  if(!title.trim())throw Error('请填写绘图名称。');
  let settings=structuredClone(draft);
  if(paperEditable&&settings.paper.shape==='rectangle'){
   const width=Number(ratio.width),height=Number(ratio.height);
   if(!ratio.width.trim()||!ratio.height.trim()||![width,height].every(value=>Number.isFinite(value)&&value>0&&value<=100000))throw Error('宽高比例须为大于 0 且不超过 100000 的数值。');
   const sameRatio=initial.paper.shape==='rectangle'&&Math.abs(width/Math.max(width,height)-initial.paper.width/Math.max(initial.paper.width,initial.paper.height))<1e-12&&Math.abs(height/Math.max(width,height)-initial.paper.height/Math.max(initial.paper.width,initial.paper.height))<1e-12;
   if(creating)settings.paper={...settings.paper,width,height};
   else if(sameRatio)settings.paper={...settings.paper,width:initial.paper.width,height:initial.paper.height};
   else{const scale=Math.max(initial.paper.width,initial.paper.height)/Math.max(width,height);settings.paper={...settings.paper,width:width*scale,height:height*scale};}
  }
  if(customPaper){if(!customPaper.doc)throw Error(customPaper.error);settings.paper={...settings.paper,shape:'custom',...customPaper.doc.paper};}
  settings=normalizeDiagramBasicSettings(settings);
  await onSubmit(title.trim(),settings,customPaper?.doc);
 }
 return <AppDialog title={creating?'新建折序绘图':'基本信息'} size="medium" className="diagram-basic-dialog" onClose={onClose} closeDisabled={busy} busy={busy} footer={<><span role="status">{problem||error}</span><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" form={id} className="diagram-primary" disabled={busy}>{busy?'正在创建…':creating?'创建并开始绘图':'应用设置'}</button></>}>
  <form id={id} onSubmit={async e=>{e.preventDefault();setProblem('');try{await submit();}catch(error){setProblem(error instanceof Error?error.message:String(error));}}}>
   <label className="diagram-basic-name">绘图名称<input aria-label="绘图名称" value={title} maxLength={200} required disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
   <fieldset disabled={busy||!paperEditable} className="diagram-basic-paper"><legend>纸张形状与比例</legend><label>形状<select aria-label="纸张形状" value={draft.paper.shape} onChange={e=>{setProblem('');setPaper({shape:e.target.value as DiagramBasicSettings['paper']['shape']});}}><option value="square">正方形</option><option value="rectangle">矩形</option><option value="triangle">等边三角形</option><option value="regular">正多边形</option>{(creating&&paperEditable||draft.paper.shape==='custom')&&<option value="custom">自定义纸张</option>}</select></label>{draft.paper.shape==='rectangle'&&<><label>宽比<input aria-label="纸张宽比" type="number" step="any" min="0.000001" max="100000" required value={ratio.width} onChange={e=>setRatio({...ratio,width:e.target.value})}/></label><label>高比<input aria-label="纸张高比" type="number" step="any" min="0.000001" max="100000" required value={ratio.height} onChange={e=>setRatio({...ratio,height:e.target.value})}/></label></>}{draft.paper.shape==='regular'&&<label>边数<input aria-label="多边形边数" type="number" min={3} max={64} step={1} value={draft.paper.sides} onChange={e=>setPaper({sides:e.currentTarget.valueAsNumber})}/></label>}</fieldset>
   {draft.paper.shape==='rectangle'&&<p className="diagram-basic-note">宽 : 高仅表示比例，例如 100:200 与 1:2 相同。网格始终保持正方格。</p>}
   {customPaper&&<fieldset disabled={busy} className="diagram-basic-custom"><legend>自定义边界</legend><div className="diagram-paper-source" role="group" aria-label="自定义纸张来源"><button type="button" aria-pressed={customMode==='editor'} onClick={()=>{setCustomMode('editor');setProblem('');}}>采用编辑区边界</button><button type="button" aria-pressed={customMode==='vertices'} onClick={()=>{setCustomMode('vertices');setProblem('');}}>输入顶点</button></div>{customMode==='editor'?<p className="diagram-basic-note">采用折痕编辑区「{currentPaper?.name||'当前工程'}」的纸张轮廓，包括孔洞；只提取边界。</p>:<><p className="diagram-basic-note">按轮廓顺序输入顶点，末点自动连接首点。坐标表示相对比例，支持凹多边形。</p><div className="diagram-paper-vertices"><div className="diagram-paper-vertex-head" aria-hidden="true"><span>顶点</span><span>X</span><span>Y</span><span/></div>{vertices.map((row,index)=><div className="diagram-paper-vertex-row" key={index}><span>{index+1}</span>{row.map((value,axis)=><input key={axis} aria-label={`顶点 ${index+1} ${axis===0?'X':'Y'}`} type="number" step="any" required value={value} onChange={e=>setVertices(previous=>previous.map((item,i)=>i===index?item.map((v,j)=>j===axis?e.target.value:v):item))}/>)}<button type="button" aria-label={`删除顶点 ${index+1}`} disabled={vertices.length<=3} onClick={()=>setVertices(previous=>previous.filter((_,i)=>i!==index))}>删除</button></div>)}</div><button type="button" onClick={()=>setVertices(previous=>{const first=previous[0].map(Number),last=previous[previous.length-1].map(Number);return [...previous,first.map((v,i)=>String((v+last[i])/2))];})}>添加顶点</button></>}{customPaper.doc?<svg className="diagram-paper-preview" role="img" aria-label="自定义纸张轮廓预览" viewBox={customPaper.viewBox}><path d={customPaper.path} fillRule="evenodd" vectorEffect="non-scaling-stroke"/></svg>:<p className="diagram-basic-paper-error" role="alert">{customPaper.error}</p>}</fieldset>}
   {!paperEditable&&<p className="diagram-basic-note">保留当前纸张的比例与边界。</p>}
   <fieldset disabled={busy} className="diagram-basic-colors"><legend>纸张配色</legend>{(['front','back','line'] as const).map((key,i)=><label key={key}><span>{['正面','背面','轮廓'][i]}</span><ColorPicker aria-label={['纸张正面颜色','纸张背面颜色','轮廓线颜色'][i]} value={draft.colors[key]} onChange={color=>setDraft(previous=>({...previous,colors:{...previous.colors,[key]:color},...(key==='line'?{lineDefaults:{...previous.lineDefaults,boundary:{...previous.lineDefaults.boundary,color}}}:{})}))}/><small>{draft.colors[key].toUpperCase()}</small></label>)}</fieldset>
   <fieldset disabled={busy} className="diagram-basic-lines"><legend>折线样式</legend><div className="diagram-basic-line-head" aria-hidden="true"><span>类别</span><span>颜色</span><span>线宽 · mm</span><span>线型</span></div>{DIAGRAM_LINE_STYLES.map(style=><div className="diagram-basic-line-row" key={style}><span>{LINE_LABELS[style]}</span><ColorPicker aria-label={`${LINE_LABELS[style]}颜色`} value={draft.lineDefaults[style].color} onChange={color=>{setLine(style,{color});if(style==='boundary')setDraft(previous=>({...previous,colors:{...previous.colors,line:color}}));}}/><input aria-label={`${LINE_LABELS[style]}线宽`} type="number" required min={.01} max={1000} step="any" value={draft.lineDefaults[style].width} onChange={e=>setLine(style,{width:e.currentTarget.valueAsNumber})}/><select aria-label={`${LINE_LABELS[style]}线型`} value={draft.lineDefaults[style].strokePattern} onChange={e=>setLine(style,{strokePattern:e.target.value as DiagramLineAppearance['strokePattern']})}>{DIAGRAM_STROKE_PATTERNS.map(pattern=><option key={pattern} value={pattern}>{DIAGRAM_STROKE_PATTERN_LABELS[pattern]}</option>)}</select></div>)}</fieldset>
   <label className="diagram-basic-adaptive"><input type="checkbox" checked={draft.adaptiveLines} disabled={busy} onChange={e=>setDraft({...draft,adaptiveLines:e.target.checked})}/>短折痕自适应线型</label>
   <p className="diagram-basic-note">随本工程保存，独立于折痕编辑区和其他工程。</p>
  </form>
 </AppDialog>;
}
