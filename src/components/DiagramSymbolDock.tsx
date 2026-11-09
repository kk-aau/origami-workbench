import {useMemo,useState} from 'react';
import type {DiagramSymbolKind} from '../app/diagramAnnotations';
import {diagramSymbolPreview} from '../app/diagramAnnotationSVG';
import {SYMBOL_CATALOG} from '../app/diagramSymbolCatalog';
import {DIAGRAM_GRIP_STYLES} from '../app/diagramSymbolGrips';
import {CALLOUT_MIME,DIAGRAM_CALLOUT_SYMBOLS,type DiagramCalloutSymbolType} from '../app/diagramCalloutSymbols';
import {SYMBOL_MIME} from './DiagramDrawingCanvas';
import './DiagramSymbolDock.css';

interface DiagramSymbolDockProps {
  selectedSymbol:DiagramSymbolKind;
  placing:boolean;
  disabled:boolean;
  onChoose:(kind:DiagramSymbolKind)=>void;
  onChooseCallout:(type:DiagramCalloutSymbolType)=>void;
  onGenerateArrow?:()=>void;
  autoArrowUnavailable?:string;
}

const GROUPS=[
  {name:'折叠动作',label:'折叠动作'},
  {name:'开层与塑形',label:'开层塑形'},
  {name:'视图与方向',label:'视图方向'},
  {name:'指示与标记',label:'指示标记'},
  {name:'步骤与保持',label:'步骤保持'},
  {name:'纸层与其他',label:'纸层其他'},
];
const PREVIEWS=new Map(SYMBOL_CATALOG.map(item=>[item.kind,diagramSymbolPreview(item.kind)]));

/** A permanent category rail beside the drawing, with the same source geometry
 * used by placed symbols. It has no effect on selected-object properties. */
export default function DiagramSymbolDock({selectedSymbol,placing,disabled,onChoose,onChooseCallout,onGenerateArrow,autoArrowUnavailable}:DiagramSymbolDockProps) {
  const [group,setGroup]=useState(()=>SYMBOL_CATALOG.find(item=>item.kind===selectedSymbol)?.group??'折叠动作');
  const [search,setSearch]=useState('');
  const symbols=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return SYMBOL_CATALOG.filter(item=>item.group===group&&(!query||`${item.label} ${item.cadName}`.toLocaleLowerCase().includes(query)));
  },[group,search]);
  const callouts=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return DIAGRAM_CALLOUT_SYMBOLS.filter(item=>item.group===group&&(!query||`${item.label} ${item.keywords}`.toLocaleLowerCase().includes(query)));
  },[group,search]);

  return <aside className="diagram-symbol-dock" aria-label="折纸符号库">
    <header><strong>折纸符号</strong><small>{SYMBOL_CATALOG.length+DIAGRAM_CALLOUT_SYMBOLS.length} 种</small></header>
    <input type="search" className="diagram-symbol-dock-search" aria-label="搜索当前分类的折纸符号" placeholder="搜索符号…" value={search} disabled={disabled} onChange={event=>setSearch(event.target.value)}/>
    {onGenerateArrow&&<div className="diagram-symbol-auto-arrow"><button type="button" disabled={disabled||!!autoArrowUnavailable} title={autoArrowUnavailable??'根据本步单轴动作生成可编辑、绑定纸面的主箭头'} onClick={onGenerateArrow}>生成主箭头</button>{autoArrowUnavailable&&<small>{autoArrowUnavailable}</small>}</div>}
    <div className="diagram-symbol-dock-body">
      <div className="diagram-symbol-dock-symbols" aria-label={`${group}符号`}>
        {symbols.map(item=><button key={item.kind} type="button" className="diagram-symbol-dock-item" draggable={!disabled} disabled={disabled} aria-label={`放置${item.label}符号`} aria-pressed={placing&&selectedSymbol===item.kind} title={`${item.label}：拖入主图，或点击后在主图放置`} onClick={()=>onChoose(item.kind)} onDragStart={event=>{
          if(disabled){event.preventDefault();return;}
          event.dataTransfer.setData(SYMBOL_MIME,item.kind);
          event.dataTransfer.effectAllowed='copy';
        }}>
          <svg viewBox="-50 -50 100 100" aria-hidden="true" dangerouslySetInnerHTML={{__html:PREVIEWS.get(item.kind)!}}/>
          <span>{item.label}</span>
        </button>)}
        {callouts.map(item=><button key={`callout-${item.type}`} type="button" className="diagram-symbol-dock-item" data-callout-symbol={item.type} draggable={!disabled} disabled={disabled} aria-label={`创建${item.label}符号`} title={`${item.label}：拖入主图或点击，选择圆形区域后放置`} onClick={()=>onChooseCallout(item.type)} onDragStart={event=>{
          if(disabled){event.preventDefault();return;}
          event.dataTransfer.setData(CALLOUT_MIME,item.type);event.dataTransfer.effectAllowed='copy';
        }}><svg viewBox="-50 -50 100 100" aria-hidden="true" dangerouslySetInnerHTML={{__html:item.preview}}/><span>{item.label}</span></button>)}
        {!symbols.length&&!callouts.length&&<p className="diagram-symbol-dock-empty" role="status">没有匹配的符号</p>}
      </div>
      <nav className="diagram-symbol-dock-categories" aria-label="折纸符号分类">
        {GROUPS.map(item=><button key={item.name} type="button" disabled={disabled} aria-label={item.name} aria-pressed={group===item.name} title={item.name} onClick={()=>setGroup(item.name)}>{item.label}</button>)}
      </nav>
    </div>
    <footer>拖入主图 · 点击放置<div className="diagram-symbol-grip-legend" aria-label="符号夹点功能图例">{Object.entries(DIAGRAM_GRIP_STYLES).map(([key,style])=><span key={key}><i className={`is-${style.shape}`} style={{background:style.color}} aria-hidden="true"/>{style.label}</span>)}</div></footer>
  </aside>;
}
