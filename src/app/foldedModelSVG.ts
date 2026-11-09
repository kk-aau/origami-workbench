import {modelFacePath} from './modelRings';
import type {FlatFoldResult} from '../core/types';
import {pointBounds} from '../core/pointBounds';
import {flatPresentation,type FlatSide} from './flatPresentation';
import {defaultModelColors,validateModelColors,type ModelColors} from './modelColors';
import type {ModelShadowBoundaries} from './modelShadowBoundaries';
import {modelWireframe} from './modelWireframe';
import {modelRenderMode,hasCompleteModelSurface} from './modelRenderMode';
import {validateModelView,type ModelDisplayStyle,type ModelCamera} from './modelViewState';

import {modelRegionSVG,type ModelSurfaceData} from './modelRegionSVG';
import {exactVisibleFaceLabels} from './exactVisibleTileRegions';
import {modelProjection} from './modelProjection';

const xml=(text:string)=>text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));

/** Full model, not a screenshot: preserves candidate paint order and original face IDs. */
export function foldedModelSVG(result:FlatFoldResult,options:{name:string;side:FlatSide;xray?:boolean;rotation?:number;colors?:ModelColors;shadows?:ModelShadowBoundaries;displayStyle?:ModelDisplayStyle;antiAlias?:boolean;displayNumbers?:boolean;camera?:ModelCamera;regions?:ModelSurfaceData}):string{
  if(options.camera){
    validateModelView({side:options.side,rotation:options.rotation??0,xray:false,cameras:{'front-solid':options.camera}});
    if(options.camera.rotation!==(options.rotation??0))throw new Error('导出相机与模型角度不一致。');
  }
  if(options.displayStyle!==undefined&&!['paper','wire'].includes(options.displayStyle))throw new Error('模型显示样式无效。');
  if(options.antiAlias!==undefined&&typeof options.antiAlias!=='boolean')throw new Error('模型抗锯齿设置必须为布尔值。');
  if(options.displayNumbers!==undefined&&typeof options.displayNumbers!=='boolean')throw new Error('模型编号设置必须为布尔值。');
  const colors=options.colors??defaultModelColors();validateModelColors(colors);
  const {vertices,faces,status}=result.geometry;
  if(status!=='ready'||!vertices.length||!faces.length)throw new Error('没有可导出的完整模型几何。');
  if(vertices.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw new Error('模型坐标超出可导出范围。');
  const presentation=flatPresentation(result,options.side,options.rotation),points=presentation.vertices;
  const renderMode=modelRenderMode(result,presentation.hasOrder,{wire:options.displayStyle==='wire',xray:options.xray,regionsReady:hasCompleteModelSurface(options.regions)});
  const wire=renderMode==='wire'?modelWireframe(result,options.side,options.rotation):null;
  const {minX:x,minY:y,maxX,maxY}=pointBounds(points),w=Math.max(1,maxX-x),h=Math.max(1,maxY-y),pad=Math.max(w,h)*.06;
  const viewport=options.camera??{x:x-pad,y:y-pad,width:w+2*pad,height:h+2*pad};
  const regions=renderMode==='regions'?options.regions:undefined;
  const regionSurface=regions?modelRegionSVG(result,regions,options.side,options.rotation??0,colors):'';
  const labelProjection=modelProjection(vertices,options.side==='back',options.rotation??0).project;
  const exactNumbers=options.displayNumbers&&regions&&'exact' in regions?exactVisibleFaceLabels(regions.exact).map(({face,point})=>{const [x,y]=labelProjection(point);return `<text data-face-number="${face+1}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="4" fill="#294536" stroke="#fffefb" stroke-width="1" paint-order="stroke">F${face+1}</text>`;}).join(''):'';
  const translucent=renderMode==='xray';
  const shadowGroups=new Map<number,string[]>();
  if(renderMode==='ordered'&&options.shadows){
    if(options.shadows.status!=='ready')throw new Error('纸层阴影尚未确认，不能导出阴影。');
    const rank=new Map(presentation.order.map((face,index)=>[face,index]));
    options.shadows.boundaries.forEach((s,index)=>{
      if(![s.upperFace,s.lowerFace].every(f=>Number.isInteger(f)&&f>=0&&f<faces.length)||rank.get(s.upperFace)!<=rank.get(s.lowerFace)!||![s.a,s.b,s.inward].every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=2e6))||Math.abs(Math.hypot(...s.inward)-1)>1e-6)throw new Error('纸层阴影边界无效。');
      const id=`model-shadow-${index}`,end=[s.a[0]+s.inward[0]*10,s.a[1]+s.inward[1]*10],corners=[s.a,s.b,[s.b[0]+s.inward[0]*10,s.b[1]+s.inward[1]*10],end];
      const fragment=`<g data-shadow-upper="${s.upperFace}" data-shadow-lower="${s.lowerFace}" pointer-events="none"><defs><clipPath id="${id}-clip">${result.geometry.graph?.faces_holes?.[s.lowerFace]?.length?`<path fill-rule="evenodd" clip-rule="evenodd" d="${modelFacePath(result,s.lowerFace,points)}"/>`:`<polygon points="${faces[s.lowerFace].map(v=>points[v].join(',')).join(' ')}"/>`}</clipPath><linearGradient id="${id}-gradient" gradientUnits="userSpaceOnUse" x1="${s.a[0]}" y1="${s.a[1]}" x2="${end[0]}" y2="${end[1]}"><stop offset="0" stop-color="#000" stop-opacity="${50/255}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><polygon points="${corners.map(p=>p.join(',')).join(' ')}" clip-path="url(#${id}-clip)" fill="url(#${id}-gradient)"/></g>`;
      const group=shadowGroups.get(s.lowerFace)??[];group.push(fragment);shadowGroups.set(s.lowerFace,group);
    });
  }
  const candidate=result.layers.status==='solved'?(result.layers.solutionIndex!==undefined?`第 ${result.layers.solutionIndex+1} 解`:'已确认候选 · 尚未编号'):'未确认候选';
  const state=regions&&'exact' in regions?`精确纸面显示 · ${regions.exactAnalysis.verifiedCells} 个区域已确认 · ${regions.exact.shadows?'含局部阴影':'不含局部阴影'}`:regions?`局部层序显示 · ${regions.regions.filter(r=>r.layers.status==='ordered').length} 已确认 / ${regions.regions.filter(r=>r.layers.status==='unconfirmed').length} 未确认 / ${regions.regions.filter(r=>r.layers.status==='conflict').length} 冲突${regions.omittedThinRegions?' · 有过窄区域未绘制':''}${regions.boundaries?.ambiguousEdges?' · '+regions.boundaries.ambiguousEdges+' 条边未确认':''}${regions.shadows?' · 局部阴影 '+regions.shadows.strips.length+' 处':' · 不含局部阴影'}`:wire?(options.displayStyle==='wire'?wire.message:result.layers.status==='solved'?'局部遮挡未就绪 · 仅显示几何线框':result.layers.status==='no-solution'?'当前山谷无层序解 · 仅显示几何线框':'层序未确认 · 仅显示几何线框'):presentation.hasOrder?'已求得当前引擎层序':result.layers.status==='solved'?'层序关系无统一绘制顺序，半透明预览':'层序未确认，半透明预览';
  const caption=`${options.side==='front'?'正面':'背面'} · ${candidate} · ${faces.length} 个面${wire?' · 线框':options.xray?' · X 光显示':''}`;
  const name=Array.from(options.name).slice(0,40).join('');
  const polygons=wire?wire.edges.map(e=>`<line data-edge-id="${e.index}" data-assignment="${e.assignment}" x1="${e.a[0]}" y1="${e.a[1]}" x2="${e.b[0]}" y2="${e.b[1]}" stroke="${e.color}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`).join(''):regions?'':presentation.order.map(i=>{const face=faces[i],facePoints=face.map(v=>points[v]),cx=facePoints.reduce((sum,p)=>sum+p[0],0)/facePoints.length,cy=facePoints.reduce((sum,p)=>sum+p[1],0)/facePoints.length;return `${result.geometry.graph?.faces_holes?.[i]?.length?`<path data-face-holes="${result.geometry.graph.faces_holes[i].length}" fill-rule="evenodd" d="${modelFacePath(result,i,points)}"`:`<polygon points="${facePoints.map(v=>v.join(',')).join(' ')}"`} data-face-id="${i}" fill="${presentation.frontMaterial[i]?colors.front:colors.back}" fill-opacity="${translucent?.25:1}" stroke="${colors.line}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`+(options.displayNumbers?`<text data-face-number="${i+1}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="4" fill="#294536" stroke="#fffefb" stroke-width="1" paint-order="stroke">F${i+1}</text>`:'')+(shadowGroups.get(i)?.join('')??'');}).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="820" viewBox="0 0 1024 820" role="img" aria-labelledby="model-title model-description">
<title id="model-title">${xml(options.name)} · ${xml(caption)}</title>
<desc id="model-description">${xml(result.layers.message)}。结果图不证明连续无碰撞路径或实际可折性。</desc>
<rect width="1024" height="820" fill="#fffefb"/>
<g font-family="sans-serif" fill="#294536"><text x="24" y="32" font-size="20">${xml(name)}</text><text x="24" y="56" font-size="14">${xml(caption)}</text></g>
<svg x="24" y="76" width="976" height="620" viewBox="${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}" overflow="hidden" preserveAspectRatio="xMidYMid meet" shape-rendering="${options.antiAlias===false?'crispEdges':'geometricPrecision'}">${options.camera?`<defs><clipPath id="model-camera-clip"><rect x="${viewport.x}" y="${viewport.y}" width="${viewport.width}" height="${viewport.height}"/></clipPath></defs><g clip-path="url(#model-camera-clip)">${polygons}${regionSurface}${exactNumbers}</g>`:polygons+regionSurface+exactNumbers}</svg>
<g font-family="sans-serif" font-size="14" fill="#5d655b"><text x="24" y="736">${xml(state)}</text><text x="24" y="762">${result.geometry.modified?'手工修改的结果几何，不证明原折痕能等距折成该形状。':'仅为完全平折结果，不证明连续无碰撞路径或纸张可制造性。'}</text><text x="24" y="788">折纸工坊 · 模型结果图（不是原始折痕图；不含撤销历史）</text></g>
</svg>`;
}
