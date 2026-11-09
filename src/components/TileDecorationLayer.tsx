import {lighterTileColor,originalTileArrowPolygon,resolvedTileTilingStyle,tileArrowSegments,type DecoratedTile,type TileDecorations,type TileFill} from '../app/tileDecorations';
import {parseTileGraphicsSource,tileGraphicsPlacement,type TileGraphicsPrimitive} from '../app/tileGraphicsSource';
import {TileGraphicsPrimitives} from './TileGraphicsPrimitives';

const originalFillColor:Record<Exclude<TileFill,'light'|'medium'|'dark'>,string>={none:'none',M:'#efb3b3',V:'#abc4f5',W:'#fffefb',O:'#f6d49f'};
const center=(points:[number,number][]):[number,number]=>[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];

export default function TileDecorationLayer({tiles,options,units,part}:{tiles:DecoratedTile[];options:TileDecorations;units:number;part:'fill'|'edges'|'marks'}){
  const style=resolvedTileTilingStyle(options);
  const graphicsCache=new Map<string,TileGraphicsPrimitive[]|null>();
  const fillColor=(fill:TileFill):string=>fill==='light'?lighterTileColor(style.fillColor,.70):fill==='medium'?lighterTileColor(style.fillColor,.50):fill==='dark'?style.fillColor:originalFillColor[fill];
  return <g data-tile-decoration={part} pointerEvents="none">{tiles.map(({points,decoration,vertexIndices},i)=>{
    if(part==='fill')return options.showPolys&&decoration.fill!=='none'?<polygon key={i} data-decorated-face={i} points={points.map(p=>p.join(',')).join(' ')} fill={fillColor(decoration.fill)}/>:null;
    if(part==='edges')return options.showEdges?<polygon key={i} data-decorated-outline={i} points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke={style.lineColor} strokeWidth={options.tilingStyle?1:1.2*units} vectorEffect={options.tilingStyle?'non-scaling-stroke':undefined} strokeLinecap="round" strokeLinejoin="round"/>:null;
    const label=center(points);
    const n=points.length,sourceStep:1|-1=vertexIndices?.length===n&&n>1&&
      (vertexIndices[1]-vertexIndices[0]+n)%n===n-1?-1:1;
    const graphics=decoration.graphics,placement=graphics?tileGraphicsPlacement(graphics.frame,points,vertexIndices):null;
    if(graphics&&!graphicsCache.has(graphics.source))graphicsCache.set(graphics.source,parseTileGraphicsSource(graphics.source,style));
    const primitives=graphics?graphicsCache.get(graphics.source):null;
    return <g key={i} data-decorated-face={i}>
      {options.showTileIndices&&decoration.label!==null&&<text data-tile-index={i+1} data-tile-label={decoration.label??String(i+1)} x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle" fontSize={12*units} fill={style.textColor} stroke={options.tilingStyle?undefined:'#fff'} strokeWidth={options.tilingStyle?undefined:3*units} paintOrder={options.tilingStyle?undefined:'stroke'}>{decoration.label??i+1}</text>}
      {options.showVertexIndices&&points.map(([x,y],j)=>{
        const number=vertexIndices?.[j]??(vertexIndices?null:j+1);
        return number===null?null:<text key={j} data-tile-vertex-index={number} x={x*.8+label[0]*.2} y={y*.8+label[1]*.2} textAnchor="middle" dominantBaseline="middle" fontSize={(options.tilingStyle?12:10)*units} fill={style.textColor} stroke={options.tilingStyle?undefined:'#fff'} strokeWidth={options.tilingStyle?undefined:3*units} paintOrder={options.tilingStyle?undefined:'stroke'}>{number}</text>;
      })}
      {options.arrowStyle!=='none'&&decoration.arrows.map((type,j)=>type&&<g key={j} data-tile-arrow={`${i+1}:${j+1}:${type}`}>
        {options.tilingStyle||type==='D'?<polygon points={originalTileArrowPolygon(points[j],points[(j+1)%n],options.arrowStyle,decoration.arrowDirections?.[j]??(type==='V'?-1:1),sourceStep).map(p=>p.join(',')).join(' ')} fill={style.lineColor}/>:
          <g stroke={type==='M'?'#b23d42':'#315dce'} strokeWidth={1.7*units} strokeLinecap="round" fill="none">{tileArrowSegments(points[j],points[(j+1)%n],type,options.arrowStyle,14*units,decoration.arrowDirections?.[j]).map(([a,b],k)=><line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>)}</g>}
      </g>)}
      {primitives&&placement&&<TileGraphicsPrimitives primitives={primitives} map={placement} units={units}/>}
    </g>;
  })}</g>;
}
