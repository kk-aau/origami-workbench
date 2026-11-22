import {useLayoutEffect,useRef,useState} from 'react';
import {placeTileGraphicsPrimitive,type GraphicsPoint,type TileGraphicsPrimitive} from '../app/tileGraphicsSource';

function GraphicsText({primitive,point,units,index}:{primitive:TileGraphicsPrimitive;point:GraphicsPoint;units:number;index:number}){
  const ref=useRef<SVGTextElement>(null),[bounds,setBounds]=useState({width:0,height:0,centerX:0,centerY:0});
  const offset=primitive.offset??[0,0],size=primitive.fontSize*units;
  const dx=-offset[0]*bounds.width/2+bounds.centerX,dy=offset[1]*bounds.height/2+bounds.centerY;
  useLayoutEffect(()=>{
    if(!primitive.offset||!ref.current)return;
    const box=ref.current.getBBox(),next={width:box.width,height:box.height,centerX:point[0]-(box.x+box.width/2)+dx,centerY:point[1]-(box.y+box.height/2)+dy};
    if(Object.values(next).every(Number.isFinite))setBounds(old=>Object.keys(next).every(key=>Math.abs(next[key as keyof typeof next]-old[key as keyof typeof next])<1e-10)?old:next);
  },[primitive.text,size,point[0],point[1],primitive.offset?.join(',')]);
  const angle=primitive.direction?-Math.atan2(primitive.direction[1],primitive.direction[0])*180/Math.PI:0;
  return <text ref={ref} data-tile-graphics-primitive="text" data-tile-graphics-order={index}
    data-text-offset={primitive.offset?.join(',')} data-text-direction={primitive.direction?.join(',')}
    x={point[0]} y={point[1]} dx={primitive.offset?dx:undefined} dy={primitive.offset?dy:undefined}
    transform={angle?`rotate(${angle} ${point[0]} ${point[1]})`:undefined}
    textAnchor="middle" dominantBaseline="middle" fontSize={size} fill={primitive.color}>{primitive.text}</text>;
}

export function TileGraphicsPrimitives({primitives,map,placement,standalone=false,units}:{primitives:TileGraphicsPrimitive[];map:(point:GraphicsPoint)=>GraphicsPoint;placement?:(point:GraphicsPoint)=>GraphicsPoint;standalone?:boolean;units:number}){
  return <g data-tile-graphics-source="numeric">{primitives.map((primitive,index)=>{
    const placed=standalone?{points:primitive.points.map(map),paths:primitive.paths?.map(path=>path.map(map))}:placeTileGraphicsPrimitive(primitive,placement??map);
    if(!placed)return null;
    const post=placement&&!standalone?map:(point:GraphicsPoint)=>point;
    const points=placed.points.map(post),paths=placed.paths?.map(path=>path.map(post));if(points.some(p=>!p.every(Number.isFinite)))return null;
    const stroke=primitive.stroke?{stroke:primitive.stroke.color,strokeWidth:primitive.stroke.width,strokeLinecap:primitive.stroke.cap,strokeLinejoin:primitive.stroke.join,strokeDasharray:primitive.stroke.dash?.join(' '),vectorEffect:'non-scaling-stroke' as const}:{};
    const attrs={'data-tile-graphics-primitive':primitive.kind,'data-tile-graphics-order':index};
    if(primitive.kind==='line'||primitive.kind==='polygon'){
      const renderPath=(path:GraphicsPoint[],part:number)=>primitive.kind==='line'?<polyline key={part} {...(paths?{'data-tile-graphics-path':part}:attrs)} points={path.map(p=>p.join(',')).join(' ')} fill="none" {...stroke}/>:<polygon key={part} {...(paths?{'data-tile-graphics-path':part}:attrs)} points={path.map(p=>p.join(',')).join(' ')} fill={primitive.color} {...stroke}/>;
      return paths?<g key={index} {...attrs}>{paths.map(renderPath)}</g>:renderPath(points,index);
    }
    if(primitive.kind==='point')return <g key={index} {...attrs}>{points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={primitive.pointSize*units/2} fill={primitive.color}/>)}</g>;
    return <GraphicsText key={index} primitive={primitive} point={points[0]} units={units} index={index}/>;
  })}</g>;
}

