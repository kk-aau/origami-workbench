import {useEffect,useRef,useState} from 'react';
import {ccwTile} from '../app/tileAssembly';
import {alignTileDecoration,effectiveTileArrowDirections,origamicaTileDecorations,ORIGAMICA_TILE_TILING_STYLE,resolvedTileTilingStyle,type TileArrowMark,type TileArrowStyle,type TileDecorations,type TileFill,type TileTilingColorName,type TileTilingStyle} from '../app/tileDecorations';
import {parseTileColorExpression} from '../app/tileColorExpressions';
import {MAX_TILE_LABEL_SOURCE,parseTileLabelExpression} from '../app/tileLabelExpressions';
import type {XY} from '../app/tessellation';
import TileDecorationLayer from './TileDecorationLayer';
import TestTileSourcePreview from './TestTileSourcePreview';
import TileGraphicsSourceEditor from './TileGraphicsSourceEditor';
import './TestTileSourcePreview.css';
import {TessDialog} from './TessellationEditor';
import ColorPicker from '../ui/ColorPicker';

export default function TileDecorationEditor({vertices,faces,value,overlayUnavailableReason,onApply,onClose}:{vertices:XY[];faces:number[][];value?:TileDecorations;overlayUnavailableReason?:string;onApply:(value:TileDecorations)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState<TileDecorations>(()=>structuredClone(value??origamicaTileDecorations(faces))),[selected,setSelected]=useState(0);
  const [labelSources,setLabelSources]=useState(()=>faces.map((_,i)=>value?.tiles[i]?.labelExpression??''));
  const [graphicsEditor,setGraphicsEditor]=useState(false);
  const previewRef=useRef<SVGSVGElement>(null),[previewSize,setPreviewSize]=useState({width:540,height:260});
  useEffect(()=>{
    const svg=previewRef.current;if(!svg)return;
    const observer=new ResizeObserver(()=>setPreviewSize({width:svg.clientWidth,height:svg.clientHeight}));
    observer.observe(svg);return ()=>observer.disconnect();
  },[]);
  const colorNames=['textColor','lineColor','fillColor'] as const;
  const expressionFields=(style:TileTilingStyle):Record<TileTilingColorName,string>=>({
    textColor:style.expressions?.textColor??style.textColor,
    lineColor:style.expressions?.lineColor??style.lineColor,
    fillColor:style.expressions?.fillColor??style.fillColor,
  });
  const [expressions,setExpressions]=useState(()=>expressionFields(resolvedTileTilingStyle(value??origamicaTileDecorations(faces))));
  const polygons=faces.map(face=>ccwTile(face.map(i=>vertices[i]))),points=polygons.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,pad=Math.max(w,h,.1)*.16;
  const previewUnits=Math.max((w+2*pad)/Math.max(1,previewSize.width),(h+2*pad)/Math.max(1,previewSize.height));
  const tiles=polygons.map((poly,i)=>({points:poly,sourceIndex:i,
    ...alignTileDecoration(poly,faces[i].map(index=>vertices[index]),draft.tiles[i])}));
  const change=(patch:Partial<TileDecorations>)=>setDraft(old=>({...old,...patch}));
  const changeTile=(patch:Partial<TileDecorations['tiles'][number]>)=>setDraft(old=>({...old,tiles:old.tiles.map((t,i)=>i===selected?{...t,...patch}:t)}));
  const changePlainLabel=(label:string|null|undefined)=>{
    setLabelSources(old=>old.map((source,i)=>i===selected?'':source));
    changeTile({label,labelExpression:undefined});
  };
  const changeLabelSource=(source:string)=>{
    setLabelSources(old=>old.map((oldSource,i)=>i===selected?source:oldSource));
    if(!source.trim()){changeTile({labelExpression:undefined});return;}
    const parsed=parseTileLabelExpression(source);if(!parsed)return;
    setDraft(old=>({...old,showTileIndices:true,tiles:old.tiles.map((tile,i)=>i===selected?
      {...tile,label:parsed.label,labelExpression:source}:tile)}));
  };
  const changeArrowDirection=(edge:number,direction:-1|1)=>changeTile({arrowDirections:effectiveTileArrowDirections(draft.tiles[selected]).map((old,i)=>i===edge?direction:old)});
  const color=(name:TileTilingColorName,value:string)=>{
    setExpressions(old=>({...old,[name]:value}));
    setDraft(old=>{
      const style=resolvedTileTilingStyle(old),sources={...style.expressions};
      delete sources[name];
      const {expressions:_removed,...rgb}=style;
      return {...old,tilingStyle:{...rgb,[name]:value,...(Object.keys(sources).length?{expressions:sources}:{})}};
    });
  };
  const expression=(name:TileTilingColorName,value:string)=>{
    setExpressions(old=>({...old,[name]:value}));
    const parsed=parseTileColorExpression(value);
    if(!parsed)return;
    setDraft(old=>{
      const style=resolvedTileTilingStyle(old),sources={...style.expressions};
      if(value.trim().startsWith('#'))delete sources[name];else sources[name]=value;
      const {expressions:_removed,...rgb}=style;
      return {...old,tilingStyle:{...rgb,[name]:parsed,...(Object.keys(sources).length?{expressions:sources}:{})}};
    });
  };
  const palette=(style?:TileTilingStyle)=>{
    setDraft(old=>{
      if(style)return {...old,tilingStyle:{...style}};
      const {tilingStyle:_removed,...rest}=old;
      return rest;
    });
    setExpressions(expressionFields(style??resolvedTileTilingStyle({tilingStyle:undefined})));
  };
  const style=resolvedTileTilingStyle(draft);
  const invalidExpression=colorNames.some(name=>parseTileColorExpression(expressions[name])===null);
  const invalidLabelSource=labelSources.some(source=>source.trim()!==''&&!parseTileLabelExpression(source));
  const selectedLabelAtom=labelSources[selected].trim()?parseTileLabelExpression(labelSources[selected]):null;
  return <TessDialog title="拼块装饰与编号" onClose={onClose}>
    <p className="note">装饰只改变二维显示，不修改折痕赋型或平折层序。按拼块设置填充和边箭头；重复拼块沿用同一组装饰。平折叠加仅在拼块相似、可见纸面与拼块交集均已验证时显示实际折后边线、编号和二维绘图。</p>
    <div className="tile-decoration-options">
      <label><input aria-label="显示拼块填充" type="checkbox" checked={draft.showPolys} onChange={e=>change({showPolys:e.target.checked})}/>填充</label>
      <label><input aria-label="显示拼块边" type="checkbox" checked={draft.showEdges} onChange={e=>change({showEdges:e.target.checked})}/>边线</label>
      <label><input aria-label="显示顶点编号" type="checkbox" checked={draft.showVertexIndices} onChange={e=>change({showVertexIndices:e.target.checked})}/>顶点编号</label>
      <label><input aria-label="显示拼块编号" type="checkbox" checked={draft.showTileIndices} onChange={e=>change({showTileIndices:e.target.checked})}/>拼块编号</label>
      <label title={overlayUnavailableReason}><input aria-label="叠加折痕图" type="checkbox" disabled={!!overlayUnavailableReason} checked={draft.overlayCreasePattern} onChange={e=>change({overlayCreasePattern:e.target.checked})}/>叠加折痕图</label>
      <label title={overlayUnavailableReason}><input aria-label="叠加平折图" type="checkbox" disabled={!!overlayUnavailableReason} checked={draft.overlayFoldedForm} onChange={e=>change({overlayFoldedForm:e.target.checked})}/>叠加平折图</label>
      <label>箭头<select aria-label="拼块箭头样式" value={draft.arrowStyle} onChange={e=>change({arrowStyle:e.target.value as TileArrowStyle})}><option value="none">无</option><option value="DH">沿边半箭头</option><option value="CH">穿边半箭头</option><option value="DF">沿边全箭头</option><option value="CF">穿边全箭头</option></select></label>
    </div>
    <div className="tile-decoration-options" aria-label="TilingStyle 颜色">
      <label>文字<ColorPicker aria-label="拼块文字颜色" value={style.textColor} onChange={value=>color('textColor',value)}/></label>
      <label>边线<ColorPicker aria-label="拼块边线颜色" value={style.lineColor} onChange={value=>color('lineColor',value)}/></label>
      <label>填充基色<ColorPicker aria-label="拼块填充基色" value={style.fillColor} onChange={value=>color('fillColor',value)}/></label>
      <button className="text-button" onClick={()=>palette(ORIGAMICA_TILE_TILING_STYLE)}>原版配色</button>
      <button className="text-button" onClick={()=>palette()}>旧版配色</button>
    </div>
    <details className="tile-color-expressions"><summary>Mathematica 颜色公式</summary>
      <div className="tile-color-expression-grid">
        {colorNames.map((name,i)=><label key={name}>{['文字','边线','填充基色'][i]}
          <input aria-label={`${['文字','边线','填充基色'][i]}颜色公式`} type="text" maxLength={160} spellCheck={false}
            value={expressions[name]} aria-invalid={parseTileColorExpression(expressions[name])===null}
            onChange={event=>expression(name,event.target.value)}/>
        </label>)}
      </div>
      {invalidExpression&&<span className="tile-color-expression-error" role="alert">颜色公式无效；仅支持不透明颜色的受限语法，修正后才能保存。</span>}
    </details>
    <TestTileSourcePreview/>
    {overlayUnavailableReason&&<p className="note">折痕图和平折图叠加暂不可用：{overlayUnavailableReason} 已保存的勾选状态会在切回逐块扭转后生效。</p>}
    {draft.overlayFoldedForm&&!overlayUnavailableReason&&<p className="note">实体平折图叠加已验证的折后边线、编号和绘图；透视不叠加装饰。拼块填充与边箭头仍只在展开图显示。</p>}
    <div className="tile-decoration-workspace"><svg ref={previewRef} viewBox={`${minX-pad} ${minY-pad} ${w+2*pad} ${h+2*pad}`} aria-label="拼块装饰预览">
      <TileDecorationLayer tiles={tiles} options={draft} units={previewUnits} part="fill"/>
      {draft.showEdges&&tiles.map((t,i)=><polygon key={i} points={t.points.map(p=>p.join(',')).join(' ')} fill="none" stroke={style.lineColor} strokeWidth={draft.tilingStyle?1:Math.max(w,h)/430} vectorEffect={draft.tilingStyle?'non-scaling-stroke':undefined} strokeLinecap="round" strokeLinejoin="round"/>)}
      <TileDecorationLayer tiles={tiles} options={draft} units={previewUnits} part="marks"/>
    </svg></div>
    <div className="tile-decoration-options"><label>拼块<select aria-label="装饰拼块" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{faces.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label><label>填充<select aria-label="选中拼块填充" value={draft.tiles[selected].fill} onChange={e=>{changeTile({fill:e.target.value as TileFill});if(e.target.value!=='none')change({showPolys:true});}}><option value="none">无</option><option value="M">山 · 红</option><option value="V">谷 · 蓝</option><option value="W">白</option><option value="O">赭</option><option value="light">浅色</option><option value="medium">中间色</option><option value="dark">深色</option></select></label><label>中心标签<input aria-label="选中拼块中心标签" type="text" maxLength={32} value={draft.tiles[selected].label===undefined?String(selected+1):draft.tiles[selected].label??''} placeholder="留空隐藏" onChange={e=>changePlainLabel(e.target.value||null)}/></label><button className="text-button" onClick={()=>changePlainLabel(undefined)}>自动编号</button></div>
    <details className="tile-label-expressions"><summary>原版 TileIndex 标签来源</summary>
      <label>标签字面值<input aria-label="选中拼块标签来源" type="text" maxLength={MAX_TILE_LABEL_SOURCE} spellCheck={false}
        value={labelSources[selected]} placeholder={'a、\\[Alpha]、"a"、12、1.25、None'}
        aria-invalid={labelSources[selected].trim()!==''&&!selectedLabelAtom} onChange={event=>changeLabelSource(event.target.value)}/></label>
      <output data-tile-label-expression-preview>{selectedLabelAtom?selectedLabelAtom.label===null?'隐藏标签':`显示：${selectedLabelAtom.label}`:'例：符号 a、希腊字母、带引号字符串、短数值；None 隐藏。'}</output>
      {invalidLabelSource&&<span className="tile-color-expression-error" role="alert">标签来源无效，请修正对应拼块后保存。</span>}
    </details>
    <div className="tile-decoration-edges" aria-label="逐边装饰方向">{draft.tiles[selected].arrows.map((type,i)=><div className="tile-edge-controls" key={i}>
      <label>边 {i+1}<select aria-label={`装饰边 ${i+1}`} value={type??'none'} onChange={e=>changeTile({arrows:draft.tiles[selected].arrows.map((old,j)=>j===i?(e.target.value==='none'?null:e.target.value as TileArrowMark):old)})}><option value="none">无</option><option value="D">方向箭头</option><option value="M">山 M（旧版）</option><option value="V">谷 V（旧版）</option></select></label>
      <label>方向<select aria-label={`装饰边 ${i+1} 方向`} value={effectiveTileArrowDirections(draft.tiles[selected])[i]} disabled={type===null} onChange={e=>changeArrowDirection(i,e.target.value==='1'?1:-1)}><option value="1">顺边 +1</option><option value="-1">逆边 −1</option></select></label>
    </div>)}</div>
    <button className="text-button" disabled={!draft.tiles[selected].arrowDirections} onClick={()=>changeTile({arrowDirections:undefined})}>箭头方向恢复山谷默认</button>{' '}
    <button className="text-button tile-graphics-entry" onClick={()=>setGraphicsEditor(true)} aria-label="编辑选中拼块二维绘图">二维绘图{draft.tiles[selected].graphics?' · 已设置':''}</button>
    <footer><button onClick={()=>{const reset=origamicaTileDecorations(faces);setDraft(reset);setExpressions(expressionFields(resolvedTileTilingStyle(reset)));setLabelSources(faces.map(()=>''));}}>恢复原版装饰</button><button className="primary" disabled={invalidExpression||invalidLabelSource} onClick={()=>{onApply(draft);onClose();}}>保存拼块装饰</button></footer>
    {graphicsEditor&&<TileGraphicsSourceEditor frame={faces[selected].map(index=>vertices[index])} value={draft.tiles[selected].graphics} palette={style} onApply={graphics=>changeTile({graphics})} onClose={()=>setGraphicsEditor(false)}/>}
  </TessDialog>;
}
