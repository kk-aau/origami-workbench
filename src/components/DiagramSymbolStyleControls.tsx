import {useMemo,useState} from 'react';
import type {DiagramSymbolKind} from '../app/diagramAnnotations';
import type {DiagramProject} from '../app/diagramProject';
import {DIAGRAM_SYMBOL_GROUPS,SYMBOL_CATALOG} from '../app/diagramSymbolCatalog';
import {diagramSymbolPreview} from '../app/diagramAnnotationSVG';
import {DIAGRAM_CALLOUT_SYMBOLS,diagramCalloutSymbolPreview} from '../app/diagramCalloutSymbols';
import {DEFAULT_DIAGRAM_SYMBOL_PEN,diagramSymbolGeometryFields,supportsDiagramSymbolFill,type DiagramSymbolStyle,type DiagramSymbolStyleKind,type DiagramSymbolStyles} from '../app/diagramSymbolStyles';
import ColorPicker from '../ui/ColorPicker';

const entries:{kind:DiagramSymbolStyleKind;label:string;group:string}[]=[
  ...SYMBOL_CATALOG,
  ...DIAGRAM_CALLOUT_SYMBOLS.map(item=>({...item,kind:item.type==='paper'?'paperCallout' as const:'cpCallout' as const})),
];
type SymbolMode='cad'|'legacy';
const sourceOnly=new Set(SYMBOL_CATALOG.filter(item=>item.sourceOnly).map(item=>item.kind));
function projectSymbolModes(project?:DiagramProject){
  const cad=new Set<DiagramSymbolKind>(),legacy=new Set<DiagramSymbolKind>();
  const pending=project?[project]:[];
  while(pending.length){
    const owner=pending.pop()!;
    for(const step of owner.steps){
      for(const mark of step.annotations??[]){
        if(mark.kind!=='symbol'||mark.symbol==='tearWindow')continue;
        (mark.cadProperties!==undefined||sourceOnly.has(mark.symbol)?cad:legacy).add(mark.symbol);
      }
      if(step.processFigures)pending.push(...step.processFigures);
    }
  }
  return {cad,legacy};
}

function stylePreview(kind:DiagramSymbolStyleKind,styles:DiagramSymbolStyles,fixedScale=false,mode?:SymbolMode){
  // Keep the sample drawable while the numeric input is temporarily empty.
  const pen=styles[kind];
  if(pen?.width!==undefined&&!(Number.isFinite(pen.width)&&pen.width>0)){
    styles={...styles,[kind]:{...pen,width:undefined}};
  }
  if(kind==='paperCallout'||kind==='cpCallout')return diagramCalloutSymbolPreview(kind==='cpCallout'?'cp':'paper',styles);
  return diagramSymbolPreview(kind,styles,fixedScale,mode);
}

type GeometryField=ReturnType<typeof diagramSymbolGeometryFields>[number];
function GeometryControl({field,value,onChange}:{field:GeometryField;value:number;onChange:(n:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  if(field.type==='boolean')return <label title={field.description}><input type="checkbox" checked={value===1} onChange={e=>onChange(Number(e.target.checked))}/>{field.label}</label>;
  if(field.type==='choice')return <label title={field.description}>{field.label}<select aria-label={field.label} value={value} onChange={e=>onChange(Number(e.target.value))}>
    {field.values?.map(n=><option key={n} value={n}>{n}{field.unit}</option>)}
  </select></label>;
  return <label title={field.description}>{field.label}<input type="number" aria-label={field.label} min={field.min} max={field.max} step={field.key==='count'?1:'any'} required
    value={draft??Number(value.toPrecision(7))} onChange={e=>{
      setDraft(e.currentTarget.value);
      if(e.currentTarget.validity.valid)onChange(e.currentTarget.valueAsNumber);
    }} onBlur={e=>{if(e.currentTarget.validity.valid)setDraft(null);}}/>{field.unit}</label>;
}

export default function DiagramSymbolStyleControls({value={},onChange,disabled,project}:{value?:DiagramSymbolStyles;onChange:(styles:DiagramSymbolStyles)=>void;disabled:boolean;project?:DiagramProject}){
  const [kind,setKind]=useState<DiagramSymbolStyleKind>('fold'),[all,setAll]=useState(false);
  const selected=entries.find(entry=>entry.kind===kind)!;
  const modes=useMemo(()=>projectSymbolModes(project),[project]);
  const [choice,setChoice]=useState<{kind:DiagramSymbolStyleKind;mode:SymbolMode}|null>(null);
  function modeFor(item:DiagramSymbolStyleKind):SymbolMode|undefined{
    if(item==='paperCallout'||item==='cpCallout'||!modes.legacy.has(item))return undefined;
    return choice?.kind===item?choice.mode:modes.cad.has(item)?'cad':'legacy';
  }
  const mode=modeFor(kind);
  const groupEntries=entries.filter(entry=>entry.group===selected.group);
  const targets=all?entries.map(entry=>entry.kind):[kind];
  const callout=kind==='paperCallout'||kind==='cpCallout';
  const shapeFields=all||callout?[]:diagramSymbolGeometryFields(kind,mode);
  const pens=targets.map(target=>value[target]??{});
  const colors=new Set(pens.map(style=>style.color??DEFAULT_DIAGRAM_SYMBOL_PEN.color));
  const widths=new Set(pens.map(style=>style.width??DEFAULT_DIAGRAM_SYMBOL_PEN.width));
  const fills=new Set(targets.filter(supportsDiagramSymbolFill).map(target=>value[target]?.fill??'original'));
  const fillLabel=all?'填充':['referencePoint','filledReferencePoint','angleMarker','equalAngle'].includes(kind)?'标记点':kind==='star'?'星形':'箭头';
  function update(patch:DiagramSymbolStyle){
    const next={...value};
    for(const target of targets){
      if('fill' in patch&&!supportsDiagramSymbolFill(target))continue;
      const style={...next[target],...patch};
      if(style.fill===undefined)delete style.fill;
      if(Object.keys(style).length)next[target]=style;
      else delete next[target];
    }
    onChange(next);
  }
  function reset(){
    const next={...value};
    for(const target of targets)delete next[target];
    onChange(next);
  }
  const width=pens[0].width??DEFAULT_DIAGRAM_SYMBOL_PEN.width;
  return <fieldset disabled={disabled} className="diagram-basic-symbols">
    <legend>折纸符号样式</legend>
    <div className="diagram-style-groups" role="group" aria-label="符号分类">
      {DIAGRAM_SYMBOL_GROUPS.map(group=><button type="button" key={group} aria-pressed={group===selected.group}
        onClick={()=>{if(group!==selected.group)setKind(entries.find(entry=>entry.group===group)!.kind);}}>{group}</button>)}
    </div>
    <div className="diagram-style-gallery" role="group" aria-label={selected.group+'符号'}>
      {groupEntries.map(entry=><button type="button" key={entry.kind} aria-label={entry.label} title={entry.label} aria-pressed={entry.kind===kind} onClick={()=>setKind(entry.kind)}>
        <svg className="diagram-symbol-mark" viewBox="-50 -50 100 100" aria-hidden="true" dangerouslySetInnerHTML={{__html:stylePreview(entry.kind,value,false,modeFor(entry.kind))}}/>
        <span>{entry.label}</span>
      </button>)}
    </div>
    <div className="diagram-style-inspector">
      <svg className="diagram-style-sample" viewBox="-50 -50 100 100" role="img" aria-label={selected.label+'样式预览'} dangerouslySetInnerHTML={{__html:stylePreview(kind,value,true,mode)}}/>
      <div className="diagram-style-edit">
        <div className="diagram-style-selection">
          <strong>{selected.label}</strong>
          <label><input type="checkbox" checked={all} onChange={event=>setAll(event.target.checked)}/>统一设置所有符号</label>
          <button type="button" disabled={!targets.some(target=>value[target])} onClick={reset}>{all?'恢复全部原样':'恢复原样'}</button>
        </div>
        <div className="diagram-basic-symbol-fields">
          <div><span>{colors.size>1?'颜色（多种）':'颜色'}</span><ColorPicker aria-label="符号颜色" value={pens[0].color??DEFAULT_DIAGRAM_SYMBOL_PEN.color} onChange={color=>update({color})} disabled={disabled}/></div>
          <label>线宽 · mm<input aria-label="符号线宽" type="number" required={widths.size===1} min={.000001} max={1000} step="any" placeholder="多种" value={widths.size>1||!Number.isFinite(width)?'':width} onChange={event=>update({width:event.currentTarget.valueAsNumber})}/></label>
          {fills.size>0&&<div className="diagram-style-fill" role="group" aria-label="符号填充"><span>{fillLabel}</span>{(['original','outline','solid'] as const).map((fill,index)=>
            <button type="button" key={fill} aria-pressed={fills.size===1&&fills.has(fill)} onClick={()=>update({fill:fill==='original'?undefined:fill})}>{['原样','空心','实心'][index]}</button>)}</div>}
        </div>
      </div>
    </div>
    {!all&&(callout||mode||shapeFields.length>0)&&<div className="diagram-style-geometry" role="group" aria-label={selected.label+'形状'}>
      {mode&&<div role="group" aria-label="图形版本" className="diagram-style-fill">
        {(['legacy','cad'] as const).map(option=><button type="button" key={option} aria-pressed={option===mode} onClick={()=>setChoice({kind,mode:option})}>{option==='cad'?'标准图形':'旧版图形'}</button>)}
      </div>}
      {shapeFields.map(field=>{
        const saved:Readonly<Record<string,number|undefined>>=value[kind]?.[field.group]??{};
        return <GeometryControl key={kind+field.group+field.key} field={field} value={saved[field.key]??field.defaultValue}
          onChange={n=>update({[field.group]:{...saved,[field.key]:n}})}/>;
      })}
      {callout&&<label><input type="checkbox" checked={value[kind]?.calloutConnectors??(kind==='paperCallout')} onChange={e=>update({calloutConnectors:e.target.checked})}/>显示连接线</label>}
    </div>}
  </fieldset>;
}
