import {useState} from 'react';
import {diagramPDFPageFurniture,type DiagramPDFOptions,type DiagramPDFPlan,type PDFMarginBand,type PDFPageFurnitureStyle} from '../app/diagramPDFLayout';

type PageGroup='common'|'odd'|'even';
type Band=keyof PDFPageFurnitureStyle;
const groupNames={common:'全部页',odd:'奇数页',even:'偶数页'};
const bandNames={header:'页眉',footer:'页脚'};
const contentOptions=[['showTitle','作品标题'],['showDesigner','设计者'],['showAuthor','制图作者'],['showPageNumber','页码']] as const;
const alignments=[['left','靠左'],['center','居中'],['right','靠右']] as const;

function PaperEdgeOffset({band,value,onChange}:{band:Band;value?:number;onChange:(value:number|undefined)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  const label=band==='header'?'距纸张上边':'距纸张下边';
  return <label>{label}（mm）<input type="number" min={0} max={40} step="any" aria-label={label+'（mm）'} placeholder="默认" value={draft??value??''}
    onChange={e=>{
      const raw=e.currentTarget.value;setDraft(raw);
      if(!e.currentTarget.validity.valid)return;
      onChange(raw===''?undefined:Number(raw));
    }} onBlur={e=>{if(!e.currentTarget.validity.valid&&Number.isFinite(e.currentTarget.valueAsNumber))onChange(Math.min(40,Math.max(0,e.currentTarget.valueAsNumber)));setDraft(null);}}/></label>;
}

export default function DiagramPDFPageFurnitureControls({options,plan,pageIndex,onPage,onChange}:{options:DiagramPDFOptions;plan:DiagramPDFPlan|null;pageIndex:number;onPage:(page:number)=>void;onChange:(patch:Partial<DiagramPDFOptions>)=>void}){
  const [expanded,setExpanded]=useState(false),[parity,setParity]=useState<'odd'|'even'>('odd'),[band,setBand]=useState<Band>('header');
  const furniture=diagramPDFPageFurniture(options),group:PageGroup=furniture.differentOddEven?parity:'common';
  const style=furniture[group]??furniture.common,selected=style[band];
  function matchesPage(index:number,scope:PageGroup,region:Band){
    const page=plan?.pages[index];if(!page)return false;
    return (scope==='common'||(scope==='odd')===(index%2===0))&&(region==='footer'||page.kind!=='cover'&&page.kind!=='intro');
  }
  function showExample(scope:PageGroup,region:Band){
    if(matchesPage(pageIndex,scope,region))return;
    const index=plan?.pages.findIndex((_,i)=>matchesPage(i,scope,region))??-1;
    if(index>=0)onPage(index);
  }
  function setDifferent(value:boolean){
    const initialParity=pageIndex%2===0?'odd':'even';setParity(initialParity);setExpanded(true);
    onChange({pageFurniture:{...furniture,differentOddEven:value,...(value?{odd:furniture.odd??furniture.common,even:furniture.even??furniture.common}:{})}});
    showExample(value?initialParity:'common',band);
  }
  function edit(patch:Partial<PDFMarginBand>){
    onChange({pageFurniture:{...furniture,[group]:{...style,[band]:{...selected,...patch}}}});
  }
  const hasExample=plan?.pages.some((_,i)=>matchesPage(i,group,band));
  return <div className="diagram-page-furniture">
    <div className="diagram-page-furniture-heading">
      <button type="button" className="diagram-page-furniture-disclosure" aria-expanded={expanded} aria-controls="diagram-page-furniture-body" onClick={()=>{
        if(!expanded)showExample(group,band);setExpanded(!expanded);
      }}>页眉与页脚</button>
      <label className="diagram-pdf-check"><input type="checkbox" checked={furniture.differentOddEven} onChange={e=>setDifferent(e.currentTarget.checked)}/>奇偶页分别设置</label>
    </div>
    {expanded&&<div id="diagram-page-furniture-body" className="diagram-page-furniture-body">
      <div className="diagram-page-furniture-switches">
        {furniture.differentOddEven&&<div role="group" aria-label="编辑页的奇偶性">
          {(['odd','even'] as const).map(value=><button key={value} type="button" aria-pressed={group===value} onClick={()=>{setParity(value);showExample(value,band);}}>{groupNames[value]}</button>)}
        </div>}
        <div role="group" aria-label="编辑区域">{(['header','footer'] as const).map(value=><button key={value} type="button" aria-pressed={band===value} onClick={()=>{setBand(value);showExample(group,value);}}>{bandNames[value]}</button>)}</div>
      </div>
      <div className="diagram-page-furniture-checks" role="group" aria-label={groupNames[group]+bandNames[band]+'内容'}>
        {contentOptions.map(([key,label])=><label className="diagram-pdf-check" key={key}><input type="checkbox" checked={!!selected[key]} onChange={e=>edit({[key]:e.currentTarget.checked})}/>{label}</label>)}
      </div>
      <div className="diagram-export-fields">
        {selected.showDesigner&&<label>设计者姓名<input maxLength={120} value={options.designer??''} onChange={e=>onChange({designer:e.target.value})}/></label>}
        {selected.showAuthor&&<label>制图作者姓名<input maxLength={120} value={options.author} onChange={e=>onChange({author:e.target.value})}/></label>}
        <label className="diagram-export-wide">自定义文字<input maxLength={160} value={selected.text??''} onChange={e=>edit({text:e.target.value})}/></label>
        <div className="diagram-export-alignment"><span>对齐方式</span><div role="group" aria-label={bandNames[band]+'对齐方式'}>{alignments.map(([value,label])=><button type="button" key={value} aria-pressed={selected.alignment===value} onClick={()=>edit({alignment:value})}>{label}</button>)}</div></div>
        <PaperEdgeOffset key={group+band} band={band} value={selected.offsetMm} onChange={offsetMm=>edit({offsetMm})}/>
      </div>
      {plan&&!hasExample&&<p className="diagram-pdf-hint" role="status">{band==='header'?'当前导出没有适用此页眉的正文页。':'当前导出没有'+groupNames[group]+'。'}</p>}
    </div>}
  </div>;
}
