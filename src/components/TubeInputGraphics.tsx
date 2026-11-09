import {useMemo} from 'react';
import {buildTubeInputGraphics} from '../app/tubeInputGraphics';
import type {JoinedTubeParams,TubePoint} from '../app/joinedTubeParams';

/** Top-view input preview. This is separate from the computed CP and spatial mesh. */
export default function TubeInputGraphics({params,height=230}:{params:JoinedTubeParams;height?:number}){
  const drawing=useMemo(()=>buildTubeInputGraphics(params),[params]);
  const points=[...drawing.bottomOutline,...drawing.topOutline];
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,.01),pad=span*.08;
  const viewBox=`${minX-pad} ${-maxY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`;
  const polyline=(vertices:TubePoint[])=>vertices.map(([x,y])=>`${x},${-y}`).join(' ');
  const links=(pairs:[TubePoint,TubePoint][],stroke:string,name:string)=>pairs.map((pair,index)=><polyline
    key={`${name}-${index}`} data-line={`${name}-${index}`} points={polyline(pair)}
    fill="none" stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>);
  const marker=(point:TubePoint,fill:string,name:string)=><circle data-point={name}
    cx={point[0]} cy={-point[1]} r={span*.01} fill={fill}/>;
  return <svg data-testid="tube-input-graphics" data-source-function={drawing.sourceFunction}
    role="img" aria-label="原版管状构造上下截面俯视预览"
    viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
    style={{display:'block',width:'100%',height,background:'#fff',border:'1px solid #d5ded6',borderRadius:6}}>
    <polyline points={polyline(drawing.bottomOutline)} fill="none" stroke="#e23f45"
      strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
    {drawing.pleatTriangles.map((vertices,index)=><polygon key={index} data-pleat={index}
      points={polyline(vertices)} fill="#404b51" fillOpacity={drawing.pleatOpacity}/>)}
    <polyline points={polyline(drawing.topOutline)} fill="none" stroke="#238a53"
      strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
    {links(drawing.blueLinks,'#245ad0','blue')}
    {links(drawing.cyanLinks,'#00a9c3','cyan')}
    {links(drawing.darkCyanLinks,'#007d8b','dark-cyan')}
    {marker(drawing.bottomStart,'#a52129','bottom-start')}
    {marker(drawing.topStart,'#176036','top-start')}
  </svg>;
}
