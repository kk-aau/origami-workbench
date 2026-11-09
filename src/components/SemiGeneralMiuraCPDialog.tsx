import {useEffect,useMemo,useRef,useState} from 'react';
import {openAppDialog} from './AppDialog';
import type {Doc,Point} from '../core/types';
import {semiGeneralMiuraPreset,validateSemiGeneralMiuraRecipe,generateSemiGeneralMiuraDocument,evaluateSemiGeneralMiuraSource,type SemiGeneralMiuraRecipe} from '../app/semigeneralMiuraCP';
import './SemiGeneralMiuraCPDialog.css';
import CPConstructionPlot from './CPConstructionPlot';

type Mode=SemiGeneralMiuraRecipe['mode'];
type Draft={mode:Mode;stripWidthMm:string;repeatPairs:string;minorFoldAngleDeg:string;designMinorFoldAngleDeg:string;beta0Deg:string;horizontalHalfLengthMm:string;diagonalLengthMm:string;lengthRepeats:string;firstBendAngleDeg:string;lastBendAngleDeg:string;angles:string[];distances:string[];points:[string,string][]};
const labels:Record<Mode,string>={path:'沿路径波纹',tachi:'Tachi–Miura 纸面',angles:'扇区角列表',bends:'转角列表'};
const value=(s:string)=>{if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim())||!Number.isFinite(Number(s)))throw Error('请填写有限数字；空值不会自动替换。');return Number(s);};
function draftFor(p:SemiGeneralMiuraRecipe):Draft{
 const d:Draft={mode:p.mode,stripWidthMm:String(p.stripWidthMm),repeatPairs:String(p.repeatPairs),minorFoldAngleDeg:String(p.minorFoldAngleDeg),designMinorFoldAngleDeg:'90',beta0Deg:'60',horizontalHalfLengthMm:'1',diagonalLengthMm:'1',lengthRepeats:'2',firstBendAngleDeg:'180',lastBendAngleDeg:'180',angles:[],distances:[],points:[]};
 if(p.mode==='path'){d.points=p.pathMm.map(([x,y])=>[String(x),String(y)]);for(const k of ['designMinorFoldAngleDeg','firstBendAngleDeg','lastBendAngleDeg'] as const)d[k]=String(p[k]);}
 if(p.mode==='angles'||p.mode==='bends'){d.angles=(p.mode==='angles'?p.sectorAnglesDeg:p.bendAnglesDeg).map(String);d.distances=p.distancesMm.map(String);}
 if(p.mode==='tachi')for(const k of ['designMinorFoldAngleDeg','beta0Deg','horizontalHalfLengthMm','diagonalLengthMm','lengthRepeats'] as const)d[k]=String(p[k]);
 return d;
}
function parse(d:Draft):SemiGeneralMiuraRecipe{
 const common={mode:d.mode,stripWidthMm:value(d.stripWidthMm),repeatPairs:value(d.repeatPairs),minorFoldAngleDeg:value(d.minorFoldAngleDeg)};
 if(d.mode==='path')return validateSemiGeneralMiuraRecipe({...common,pathMm:d.points.map(p=>p.map(value)),designMinorFoldAngleDeg:value(d.designMinorFoldAngleDeg),firstBendAngleDeg:value(d.firstBendAngleDeg),lastBendAngleDeg:value(d.lastBendAngleDeg)});
 if(d.mode==='angles'||d.mode==='bends')return validateSemiGeneralMiuraRecipe({...common,[d.mode==='angles'?'sectorAnglesDeg':'bendAnglesDeg']:d.angles.map(value),distancesMm:d.distances.map(value)});
 return validateSemiGeneralMiuraRecipe({...common,designMinorFoldAngleDeg:value(d.designMinorFoldAngleDeg),beta0Deg:value(d.beta0Deg),horizontalHalfLengthMm:value(d.horizontalHalfLengthMm),diagonalLengthMm:value(d.diagonalLengthMm),lengthRepeats:value(d.lengthRepeats)});
}


export default function SemiGeneralMiuraCPDialog({initial,onAdoptCP,onClose}:{initial?:SemiGeneralMiuraRecipe;onAdoptCP:(doc:Doc)=>boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[draft,setDraft]=useState(()=>draftFor(initial??semiGeneralMiuraPreset('path'))),[selected,setSelected]=useState(0),[prepared,setPrepared]=useState<{key:string;doc:Doc;source:ReturnType<typeof evaluateSemiGeneralMiuraSource>}|null>(null),[busy,setBusy]=useState(false),[buildError,setBuildError]=useState(''),[adoptError,setAdoptError]=useState('');
 const input=useMemo(()=>{try{return {recipe:parse(draft),error:''};}catch(e){return {recipe:null,error:(e as Error).message};}},[draft]),key=JSON.stringify(input.recipe??draft);
 useEffect(()=>openAppDialog(dialog.current),[]);
 useEffect(()=>{let cancelled=false;setBuildError('');setAdoptError('');if(!input.recipe){setBusy(false);return;}setBusy(true);const recipe=input.recipe,frame=requestAnimationFrame(()=>{try{const source=evaluateSemiGeneralMiuraSource(recipe),doc=generateSemiGeneralMiuraDocument(recipe);if(!cancelled){setPrepared({key,doc,source});setBusy(false);}}catch(e){if(!cancelled){setBuildError((e as Error).message);setBusy(false);}}});return()=>{cancelled=true;cancelAnimationFrame(frame);};},[key]);
 const current=prepared?.key===key?prepared:null,rawPath=useMemo(()=>{try{return draft.points.map(p=>p.map(value) as Point);}catch{return null;}},[draft.points]),shownPath=draft.mode==='path'?rawPath??prepared?.source.pathMm:draft.mode==='tachi'?prepared?.source.pathMm:undefined,
  error=input.error||buildError||adoptError,edit=(field:Exclude<keyof Draft,'mode'|'angles'|'distances'|'points'>,v:string)=>{setDraft(d=>({...d,[field]:v}));setAdoptError('');},
  coordinate=(i:number,k:number,v:string)=>setDraft(d=>({...d,points:d.points.map((p,j)=>j===i?p.map((n,a)=>a===k?v:n) as [string,string]:p)})),
  move=(i:number,p:Point)=>setDraft(d=>({...d,points:d.points.map((q,j)=>j===i?p.map(n=>String(n)) as [string,string]:q)})),
  field=(k:Exclude<keyof Draft,'mode'|'angles'|'distances'|'points'>,text:string,step='any')=><label key={k}><span>{text}</span><input type="number" aria-label={text} step={step} value={draft[k]} onChange={e=>edit(k,e.target.value)}/></label>;
 const add=()=>{if(draft.mode==='path'){if(!rawPath||rawPath.length<2)return;const a=rawPath.at(-2)!,b=rawPath.at(-1)!,p:Point=[b[0]-(b[1]-a[1]),b[1]+b[0]-a[0]];setDraft(d=>({...d,points:[...d.points,p.map(String) as [string,string]]}));setSelected(draft.points.length);}else{setDraft(d=>({...d,angles:[...d.angles.slice(0,-1),d.angles.at(-2)??'60',d.angles.at(-1)!],distances:[...d.distances,d.distances.at(-1)??'1']}));setSelected(draft.angles.length-1);}};
 const remove=()=>{if(draft.mode==='path'){if(draft.points.length<=2)return;setDraft(d=>({...d,points:d.points.filter((_,i)=>i!==selected)}));setSelected(Math.max(0,Math.min(selected,draft.points.length-2)));}else{if(draft.angles.length<=2)return;setDraft(d=>({...d,angles:d.angles.filter((_,i)=>i!==selected),distances:d.distances.filter((_,i)=>i!==Math.max(0,selected-1))}));setSelected(Math.max(0,Math.min(selected,draft.angles.length-2)));}};
 return <dialog ref={dialog} className="sgm-dialog ui-dialog" aria-label="路径波纹与 Tachi–Miura 构造" onCancel={e=>{e.preventDefault();onClose();}}><header><div><span>ORIGINAL PATH TO PAPER</span><h2>路径波纹与 Tachi–Miura</h2></div><button aria-label="关闭路径波纹构造" onClick={onClose}>×</button></header>
 <div className="sgm-workspace"><aside><label className="sgm-mode"><span>构造方式</span><select aria-label="路径波纹构造方式" value={draft.mode} onChange={e=>{setDraft(draftFor(semiGeneralMiuraPreset(e.target.value as Mode)));setSelected(0);}}>{Object.entries(labels).map(([m,l])=><option key={m} value={m}>{l}</option>)}</select></label>
  <div className="sgm-fields">{field('stripWidthMm','半条带宽 / mm')}{field('repeatPairs','横向重复对数','1')}{field('minorFoldAngleDeg','当前小折角 / °')}
   {(draft.mode==='path'||draft.mode==='tachi')&&field('designMinorFoldAngleDeg','设计小折角 / °')}{draft.mode==='tachi'&&<>{field('beta0Deg','首个设计转角 / °')}{field('horizontalHalfLengthMm','水平半段长 / mm')}{field('diagonalLengthMm','斜段长 / mm')}{field('lengthRepeats','纵向重复数','1')}</>}
   {draft.mode==='path'&&<>{field('firstBendAngleDeg','首端转角 / °')}{field('lastBendAngleDeg','末端转角 / °')}</>}
  </div>
  {draft.mode!=='tachi'&&<section className="sgm-source-editor"><div className="sgm-editor-head"><strong>{draft.mode==='path'?'目标中线路径':draft.mode==='angles'?'原扇区角和间距':'原转角和间距'}</strong><span>选中 {selected+1}</span></div><div className="sgm-list" aria-label="路径波纹有序源参数">
   <div className="sgm-row sgm-row-head"><span>#</span><span>{draft.mode==='path'?'X / mm':draft.mode==='angles'?'扇区 / °':'转角 / °'}</span><span>{draft.mode==='path'?'Y / mm':'下一间距 / mm'}</span></div>
   {draft.mode==='path'?draft.points.map((p,i)=><div className="sgm-row" key={i} data-selected={i===selected}><button aria-label={`选择路径点 ${i+1}`} onClick={()=>setSelected(i)}>{i+1}</button>{p.map((n,k)=><input key={k} type="number" step="any" aria-label={`路径点 ${i+1} ${k===0?'X':'Y'} / mm`} value={n} onFocus={()=>setSelected(i)} onChange={e=>coordinate(i,k,e.target.value)}/>)}</div>):draft.angles.map((a,i)=><div className="sgm-row" key={i} data-selected={i===selected}><button aria-label={`选择参数列 ${i+1}`} onClick={()=>setSelected(i)}>{i+1}</button><input type="number" step="any" aria-label={`第 ${i+1} 列${draft.mode==='angles'?'扇区角':'转角'} / °`} value={a} onFocus={()=>setSelected(i)} onChange={e=>setDraft(d=>({...d,angles:d.angles.map((s,j)=>j===i?e.target.value:s)}))}/>{i<draft.distances.length?<input type="number" step="any" aria-label={`第 ${i+1} 间距 / mm`} value={draft.distances[i]} onChange={e=>setDraft(d=>({...d,distances:d.distances.map((s,j)=>j===i?e.target.value:s)}))}/>:<span className="sgm-last">末端</span>}</div>)}
  </div><div className="sgm-list-actions"><button onClick={add} disabled={draft.mode==='path'&&!rawPath}>增加{draft.mode==='path'?'点':'列'}</button><button onClick={remove} disabled={(draft.mode==='path'?draft.points.length:draft.angles.length)<=2}>删除选中{draft.mode==='path'?'点':'列'}</button></div></section>}
  <button className="sgm-restore" onClick={()=>{setDraft(draftFor(semiGeneralMiuraPreset(draft.mode)));setSelected(0);}}>恢复原版示例</button><p className="sgm-hint">紫色是输入路径，青色是生成折痕。纸边与原毫米坐标保留。</p>
 </aside><main data-preview-current={!!current} data-source-key={current?key:undefined}><div className={`sgm-plots ${shownPath?'paired':''}`}>{shownPath&&<CPConstructionPlot key={'source-'+draft.mode} points={shownPath} selected={selected} onSelect={setSelected} onMove={draft.mode==='path'?move:undefined} label="目标中线路径"/>}{prepared?<CPConstructionPlot key={'cp-'+draft.mode} doc={prepared.doc} label="生成 CP 纸面"/>:<div className="sgm-empty">等待有效原参数…</div>}</div>
  <div className="sgm-state" data-state={current?'ready':error?'error':'checking'} role={error?'alert':'status'}>{error||(current?`有限纸面已核验 · ${current.doc.segments.length} 条原边`:'正在构造并检查纸面…')}{!current&&prepared?'；当前图为上一次有效纸面，不能采用。':''}</div>
  <p className="sgm-scope">采用保存原参数、山谷、目标角及实际材料图。三维运动、碰撞与平折层序未认证。</p>
 </main></div><footer><span>{labels[draft.mode]} · 原版 A / B / P / Tachi</span><button onClick={onClose}>取消</button><button className="primary" disabled={!current||busy} onClick={()=>{if(!current)return;try{setAdoptError('');if(onAdoptCP(structuredClone(current.doc)))onClose();}catch(e){setAdoptError((e as Error).message);}}}>采用路径波纹 CP →</button></footer></dialog>;
}
