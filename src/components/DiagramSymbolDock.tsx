import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {DiagramSymbolKind} from '../app/diagramAnnotations';
import {diagramSymbolPreview} from '../app/diagramAnnotationSVG';
import {DIAGRAM_SYMBOL_GROUPS,SYMBOL_CATALOG} from '../app/diagramSymbolCatalog';
import {DIAGRAM_GRIP_STYLES} from '../app/diagramSymbolGrips';
import {CALLOUT_MIME,DIAGRAM_CALLOUT_SYMBOLS,diagramCalloutSymbolPreview,type DiagramCalloutSymbolType} from '../app/diagramCalloutSymbols';
import {SYMBOL_MIME} from './DiagramDrawingCanvas';
import './DiagramSymbolDock.css';

interface DiagramSymbolDockProps {
  symbolStyles?:import('../app/diagramSymbolStyles').DiagramSymbolStyles;
  forceExpanded?:boolean;
  selectedSymbol:DiagramSymbolKind;
  placing:boolean;
  symbolSelected:boolean;
  disabled:boolean;
  onChoose:(kind:DiagramSymbolKind)=>void;
  onChooseCallout:(type:DiagramCalloutSymbolType)=>void;
  onGenerateArrow?:()=>void;
  autoArrowUnavailable?:string;
}

const SHORT_LABELS:Partial<Record<DiagramSymbolKind,string>>={
  foldSmall:'简式谷折',swivelDouble:'双向段折',unfoldDouble:'双线预折',
  paperFront:'正面指示',paperBack:'背面指示',equalAngle:'角平分',filledReferencePoint:'实心点',
  rotate:'顺时针',rotateCCW:'逆时针',hold:'按住拉动',flapFront:'向外翻折',flapBack:'向内翻折',
};
function paletteItems(symbolStyles?:DiagramSymbolDockProps['symbolStyles']){return [
  ...SYMBOL_CATALOG.map(item=>({...item,key:item.kind,caption:SHORT_LABELS[item.kind]??item.label,keywords:item.cadName,
    mime:SYMBOL_MIME,preview:diagramSymbolPreview(item.kind,symbolStyles),kind:'symbol' as const,value:item.kind})),
  ...DIAGRAM_CALLOUT_SYMBOLS.map(item=>({...item,key:item.type,caption:item.type==='cp'?'CP 放大':'局部圆框',
    mime:CALLOUT_MIME,preview:diagramCalloutSymbolPreview(item.type,symbolStyles),kind:'callout' as const,value:item.type})),
];}

export default function DiagramSymbolDock({symbolStyles,forceExpanded,selectedSymbol,placing,symbolSelected,disabled,onChoose,onChooseCallout,onGenerateArrow,autoArrowUnavailable}:DiagramSymbolDockProps) {
  const [group,setGroup]=useState(()=>SYMBOL_CATALOG.find(item=>item.kind===selectedSymbol)?.group??DIAGRAM_SYMBOL_GROUPS[0]);
  const [expanded,setExpanded]=useState(true),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState('');
  const contentId=useId(),searchRef=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(forceExpanded)setExpanded(true);},[forceExpanded]);
  useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
  const query=search.trim().toLowerCase();
  const catalog=useMemo(()=>paletteItems(symbolStyles),[symbolStyles]);
  const items=catalog.filter(item=>item.group===group&&(!query||(item.label+' '+item.caption+' '+item.keywords).toLowerCase().includes(query)));
  const showAutoArrow=onGenerateArrow&&group==='折叠动作'&&'生成主箭头'.includes(query);
  function toggleSearch(){
    setExpanded(true);setSearchOpen(!searchOpen);setSearch('');
  }
  return <section className="diagram-symbol-dock" aria-label="折纸符号库">
    <header className="diagram-symbol-heading">
      <button type="button" className="diagram-symbol-heading-toggle" aria-label="折纸符号" aria-expanded={expanded} aria-controls={contentId} onClick={()=>setExpanded(!expanded)}>折纸符号</button>
      <button ref={searchButton} type="button" className="diagram-symbol-search-toggle" title="搜索当前分类的折纸符号" aria-label="搜索符号" aria-expanded={expanded&&searchOpen} disabled={disabled} onClick={toggleSearch}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
      </button>
    </header>
    <div id={contentId} hidden={!expanded}>
      <div className="diagram-symbol-categories" role="group" aria-label="折纸符号分类">
        {DIAGRAM_SYMBOL_GROUPS.map(name=><button key={name} type="button" disabled={disabled}
          aria-pressed={name===group} onClick={()=>setGroup(name)}>{name}</button>)}
      </div>
      {searchOpen&&<input type="search" className="diagram-symbol-dock-search" aria-label="搜索当前分类的折纸符号" placeholder="搜索当前分类" ref={searchRef} value={search} disabled={disabled} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();toggleSearch();searchButton.current?.focus();}}}/>}
      <div className="diagram-tool-group" role="group" aria-label={group+'符号'}>
        {items.map(item=>{
          const callout=item.kind==='callout',hint=callout?'拖入主图或点击，选择圆形区域后放置':'拖入主图，或点击后在主图放置';
          return <button key={item.key} type="button" className="diagram-symbol-dock-item" draggable={!disabled} disabled={disabled}
            data-callout-symbol={callout?item.value:undefined} aria-label={(callout?'创建':'放置')+item.label+'符号'} aria-pressed={callout?undefined:placing&&selectedSymbol===item.value}
            title={item.label+'：'+hint} onClick={()=>{if(item.kind==='callout')onChooseCallout(item.value);else onChoose(item.value);}}
            onDragStart={event=>{if(disabled){event.preventDefault();return;}event.dataTransfer.setData(item.mime,item.value);event.dataTransfer.effectAllowed='copy';}}>
            <svg className="icon diagram-symbol-mark" viewBox="-50 -50 100 100" aria-hidden="true" dangerouslySetInnerHTML={{__html:item.preview}}/>
            <span>{item.caption}</span>
          </button>;
        })}
        {showAutoArrow&&<button type="button" aria-label="生成主箭头" title={autoArrowUnavailable??'根据本步折痕生成主箭头'} disabled={disabled||!!autoArrowUnavailable} onClick={onGenerateArrow}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17c4 3 9 1 8-5-.8-5 2-7 8-7m-4-3 4 3-4 3M18 13v6m-3-3h6"/></svg><span>生成箭头</span>
        </button>}
      </div>
      {!items.length&&!showAutoArrow&&<p className="diagram-symbol-empty" role="status">没有匹配的符号</p>}
      {(placing||symbolSelected)&&<div className="diagram-symbol-grip-legend" aria-label="符号夹点功能图例">{Object.entries(DIAGRAM_GRIP_STYLES).map(([key,style])=><span key={key}><i className={'is-'+style.shape} style={{background:style.color}} aria-hidden="true"/>{style.label}</span>)}</div>}
    </div>
  </section>;
}
