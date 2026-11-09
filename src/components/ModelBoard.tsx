import {useEffect,useRef,useState} from 'react';
import type {FoldedModelCollection,FoldedModelEntry} from '../app/foldedModelCollection';
import {copyModelView,type ModelBoardPlacement,type ModelViewState} from '../app/modelViewState';
import {defaultBoardPlacement,transformBoardPlacement} from '../app/modelBoard';
import {defaultModelColors} from '../app/modelColors';
import {modelViewPanes} from '../app/modelViewPanes';
import ModelComparisonPane from './ModelComparisonPane';
import ModelBoardExport from './ModelBoardExport';
import ModelRotationControl from './ModelRotationControl';
import './ModelBoard.css';

interface Props {models:FoldedModelCollection;onSelect:(id:string)=>void;onDetail:()=>void;onPlace:(id:string,p:ModelBoardPlacement)=>void;onView:(id:string,v:ModelViewState)=>void}
export default function ModelBoard({models,onSelect,onDetail,onPlace,onView}:Props){
 const visible=models.entries.filter(e=>e.view?.board?.visible!==false);
 const positions=models.entries.map((e,i)=>e.view?.board??defaultBoardPlacement(i));
 return <section className="model-board" aria-label="多个模型同屏">
  <header className="model-board-toolbar"><strong>模型陈列台</strong><span>{visible.length} / {models.entries.length} 个可见</span><ModelBoardExport models={models}/><button onClick={onDetail}>返回单模型</button></header>
  <p className="model-board-help">拖动标题移动模型，右下角调整尺寸；右键或 Esc 取消拖动。各模型可独立显示单面、正背双面或四视图；滚轮缩放当前小视图，中键平移。不修改折痕与几何。</p>
  <div className="model-board-visibility" aria-label="同屏可见模型">{models.entries.map((e,i)=><label key={e.id}><input type="checkbox" checked={positions[i].visible} onChange={ev=>onPlace(e.id,{...positions[i],visible:ev.target.checked})}/>{e.name}</label>)}</div>
  <div className="model-board-scroll"><div className="model-board-surface" style={{width:Math.max(752,...positions.filter(p=>p.visible).map(p=>p.x+p.width+16)),height:Math.max(480,...positions.filter(p=>p.visible).map(p=>p.y+p.height+16))}}>
   {!visible.length&&<p className="model-board-empty">没有可见模型。勾选上方模型名称以恢复显示。</p>}
   {models.entries.map((entry,i)=>positions[i].visible&&entry.history.present?.geometry.status==='ready'?<ModelCard key={entry.id} entry={entry} placement={positions[i]} active={entry.id===models.activeId} onSelect={()=>onSelect(entry.id)} onDetail={()=>{onSelect(entry.id);onDetail();}} onPlace={p=>onPlace(entry.id,p)} onView={v=>onView(entry.id,v)}/>:null)}
  </div></div>
 </section>;
}
function ModelCard({entry,placement,active,onSelect,onDetail,onPlace,onView}:{entry:FoldedModelEntry;placement:ModelBoardPlacement;active:boolean;onSelect:()=>void;onDetail:()=>void;onPlace:(p:ModelBoardPlacement)=>void;onView:(v:ModelViewState)=>void}){
 const [draft,setDraft]=useState<ModelBoardPlacement|null>(null),gesture=useRef<{id:number;x:number;y:number;start:ModelBoardPlacement;resize:boolean}|null>(null);
 const cancel=()=>{gesture.current=null;setDraft(null);};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&gesture.current){e.preventDefault();cancel();}};window.addEventListener('keydown',key);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);};},[]);
 const p=draft??placement,view=copyModelView(entry.view),wire=view.displayStyle==='wire',panes=modelViewPanes(view);
 const currentView=useRef(view);currentView.current=view;
 const dragProps=(resize:boolean)=>({
  onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{if(e.button!==0)return;e.preventDefault();onSelect();e.currentTarget.focus({preventScroll:true});gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,start:placement,resize};e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(!(e.buttons&1)||(e.buttons&2)){cancel();return;}setDraft(transformBoardPlacement(g.start,e.clientX-g.x,e.clientY-g.y,g.resize));},
  onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=null;setDraft(null);onPlace(transformBoardPlacement(g.start,e.clientX-g.x,e.clientY-g.y,g.resize));if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);},
  onPointerCancel:cancel,onLostPointerCapture:cancel,
  onContextMenu:(e:React.MouseEvent)=>{e.preventDefault();cancel();},
  onKeyDown:(e:React.KeyboardEvent)=>{if(gesture.current)return;const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const delta=direction[e.key];if(delta){e.preventDefault();onSelect();onPlace(transformBoardPlacement(placement,delta[0]*(e.shiftKey?20:5),delta[1]*(e.shiftKey?20:5),resize));}}
 });
 return <article className={`model-board-card${active?' active':''}`} data-board-model={entry.id} style={{left:p.x,top:p.y,width:p.width,height:p.height,zIndex:active?2:1}} onPointerDownCapture={onSelect}>
  <header><button className="model-board-handle" aria-label={`移动模型 ${entry.name}`} title="拖动或方向键移动；Shift 加速" {...dragProps(false)}>{entry.name}</button><button onClick={onDetail}>编辑</button></header>
  <label className="model-board-layout">视图<select aria-label={`模型组合显示 ${entry.name}`} value={view.layout??'single'} onChange={e=>{cancel();onView({...currentView.current,layout:e.target.value as ModelViewState['layout']});}}><option value="single">单面</option><option value="both">正背双面</option><option value="four">实体＋X 光四视图</option></select></label>
  <div className="model-board-view-tools" aria-label={`模型显示控制 ${entry.name}`}>
   <div className="model-board-side" role="group" aria-label={`模型面向 ${entry.name}`}>
    <span>面向</span><button className={view.side==='front'?'active':''} aria-pressed={view.side==='front'} onClick={()=>{cancel();onView({...currentView.current,side:'front'});}}>正面</button><button className={view.side==='back'?'active':''} aria-pressed={view.side==='back'} onClick={()=>{cancel();onView({...currentView.current,side:'back'});}}>背面</button>
   </div>
   <label className="model-board-check"><input aria-label={`模型 X 光 ${entry.name}`} type="checkbox" checked={view.xray} onChange={e=>{cancel();onView({...currentView.current,xray:e.target.checked});}}/>X 光</label>
   <label className="model-board-check"><input aria-label={`模型阴影 ${entry.name}`} type="checkbox" checked={view.shadows??false} onChange={e=>{cancel();onView({...currentView.current,shadows:e.target.checked});}}/>阴影</label>
   <label className="model-board-style">显示<select aria-label={`模型显示样式 ${entry.name}`} value={view.displayStyle??'paper'} onChange={e=>{cancel();onView({...currentView.current,displayStyle:e.target.value as ModelViewState['displayStyle']});}}><option value="paper">纸面</option><option value="wire">线框</option></select></label>
   <ModelRotationControl rotation={view.rotation} onChange={angle=>{cancel();onView({...currentView.current,rotation:angle});}}/>
  </div>
  <div className="model-board-panes" style={{gridTemplateColumns:panes.length===1?'minmax(0,1fr)':'repeat(2,minmax(0,1fr))',gridTemplateRows:panes.length===4?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)'}}>
   {panes.map(pane=><ModelComparisonPane key={`${pane.key}:${view.rotation}:${view.displayStyle}:${view.layout}`} result={entry.history.present!} pane={pane} rotation={view.rotation} colors={view.colors??defaultModelColors()} shadows={view.shadows??false} antiAlias={view.antiAlias??true} displayNumbers={view.displayNumbers??false} stale={false} wireMode={wire} camera={view.cameras[pane.key]} onCamera={camera=>onView({...currentView.current,cameras:{...currentView.current.cameras,[pane.key]:camera}})} face={null} setFace={()=>onSelect()} moving={false} editing={false} vertexControls={{selection:{group:[],selected:[]},onSelect:()=>{},onMove:()=>{},disabled:true}} onHint={()=>{}}/>)}
  </div>
  <footer><span>{wire?'线框不表达纸层遮挡':entry.history.present!.layers.status==='solved'?'已求得层序':'层序未确认 · 半透明显示'}</span><button aria-label={`调整模型尺寸 ${entry.name}`} title="拖动或方向键调整尺寸" {...dragProps(true)}>↘</button></footer>
 </article>;
}
