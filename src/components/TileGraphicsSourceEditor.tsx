import {useMemo,useRef,useState} from 'react';
import {MAX_TILE_GRAPHICS_SOURCE,parseTileGraphicsSource,supportsTileGraphicsPlacement,tileGraphicsPlacement,tileGraphicsSourceToComplex,type GraphicsPalette,type GraphicsPoint,type TileGraphicsSpec} from '../app/tileGraphicsSource';
import {TessDialog} from './TessellationEditor';
import {TileGraphicsPrimitives,useSvgScreenUnits} from './TileGraphicsPrimitives';
import './TileGraphicsSourceEditor.css';

export default function TileGraphicsSourceEditor({frame,value,palette,onApply,onClose}:{frame:GraphicsPoint[];value?:TileGraphicsSpec;palette:GraphicsPalette;onApply:(value:TileGraphicsSpec|undefined)=>void;onClose:()=>void}){
  const [source,setSource]=useState(value?.source??''),original=value?.frame??frame;
  const primitives=useMemo(()=>source.trim()?parseTileGraphicsSource(source,palette):[],[source,palette]);
  const placement=tileGraphicsPlacement(original,frame,frame.map((_,i)=>i+1));
  const ref=useRef<SVGGElement>(null),units=useSvgScreenUnits(ref);
  const xs=frame.map(p=>p[0]),ys=frame.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
  const span=Math.max(width,height),pad=span*.1,point=(p:GraphicsPoint)=>`{${p.join(',')}}`,points=`{${original.map(point).join(',')}}`;
  const center:GraphicsPoint=[original.reduce((s,p)=>s+p[0],0)/original.length,original.reduce((s,p)=>s+p[1],0)/original.length];
  const example=(kind:string)=>setSource(kind==='line'?`{Style[Line[${points}],TilingLine]}`:kind==='polygon'?`{Style[Polygon[${points}],TilingLightFill]}`:kind==='point'?`{Purple,AbsolutePointSize[5],Point[${point(center)}]}`:`{Style[Text["A",${point(center)}],TilingText,FontSize->12]}`);
  const supported=!!primitives&&supportsTileGraphicsPlacement(primitives),valid=!!primitives&&supported&&(!source.trim()||!!placement);
  const conversion=primitives?.some(primitive=>primitive.placementMode==='rows')?tileGraphicsSourceToComplex(source):null;
  return <TessDialog title="拼块二维绘图" onClose={onClose}>
    <div className="tile-graphics-editor">
      <div className="tile-graphics-toolbar"><span>插入示例</span><button onClick={()=>example('line')}>线</button><button onClick={()=>example('polygon')}>面</button><button onClick={()=>example('point')}>点</button><button onClick={()=>example('text')}>文字</button>{conversion&&<button onClick={()=>setSource(conversion)}>转为共享顶点</button>}<button onClick={()=>setSource('')}>清空</button></div>
      <div className="tile-graphics-body">
        <textarea aria-label="拼块二维绘图来源" maxLength={MAX_TILE_GRAPHICS_SOURCE} spellCheck={false} value={source} aria-invalid={!valid} placeholder="{Style[Line[{{0,0},{1,1}}],TilingLine]}" onChange={event=>setSource(event.target.value)}/>
        <svg aria-label="拼块二维绘图预览" viewBox={`${minX-pad} ${minY-pad} ${width+2*pad} ${height+2*pad}`}>
          <polygon points={frame.map(p=>p.join(',')).join(' ')} fill="none" stroke="#70867b" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          <g ref={ref}>{primitives&&placement&&<TileGraphicsPrimitives primitives={primitives} standalone={!supported} map={supported?placement:p=>p} units={units}/>}</g>
        </svg>
      </div>
      <output className="tile-graphics-status" role={!valid?'alert':undefined}>{!primitives?'绘图来源无效；仅支持下方列出的数值语法。':!supported?conversion?'独立来源预览；此多列表需转为共享顶点后放置。':'独立来源预览；请改用共享顶点表示此多列表。':!valid?'原坐标框架与当前拼块不相似，请清空后重新绘图。':`${primitives.length} 个图元 · 母片坐标 · 绝对线宽与字号`}</output>
      <p className="tile-graphics-help">Point、Line、Polygon、Text（可选对齐、方向）；列表、Style、Directive、GraphicsComplex（一基编号）、MatrixTransform（2×2 数值矩阵）。多列表可转为共享顶点。折后绘图只显示层序已验证的可见纸面。</p>
      <footer><button onClick={onClose}>取消</button><button className="primary" disabled={!valid} onClick={()=>{onApply(source.trim()?{source,frame:original.map(p=>[...p])}:undefined);onClose();}}>保存二维绘图</button></footer>
    </div>
  </TessDialog>;
}
