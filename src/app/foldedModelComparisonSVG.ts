import type {FlatFoldResult} from '../core/types';
import {foldedModelSVG} from './foldedModelSVG';
import {modelViewPanes} from './modelViewPanes';
import type {ModelCameraKey,ModelViewState} from './modelViewState';
import type {ModelShadowBoundaries} from './modelShadowBoundaries';
import {flatPresentation} from './flatPresentation';
import {fittedModelCamera} from './modelCamera';
import type {ModelSurfaceData} from './modelRegionSVG';
export type ModelPaneRegions=Partial<Record<ModelCameraKey,ModelSurfaceData>>;
export type ModelExportFraming='full'|'camera';

export type ModelPaneShadows=Partial<Record<ModelCameraKey,ModelShadowBoundaries>>;
/** Comparison sheet; optional camera framing clips each pane to its current camera rectangle.
 * Each pane is an embedded SVG image, so its title/gradient/clip IDs stay isolated.
 * Supplied shadow analyses must match this result, direction and rotation.
 */
export function foldedModelComparisonSVG(result:FlatFoldResult,name:string,view:ModelViewState,shadows:ModelPaneShadows={},framing:ModelExportFraming='full',regions:ModelPaneRegions={}):string{
 if(framing!=='full'&&framing!=='camera')throw new Error('模型导出范围无效。');
 const panes=modelViewPanes(view);
 const images=panes.map(pane=>{
  const needsShadows=view.displayStyle!=='wire'&&view.shadows&&!pane.xray&&flatPresentation(result,pane.side,view.rotation).hasOrder;
  const analysis=needsShadows?shadows[pane.key]:undefined;
  if(needsShadows&&analysis?.status!=='ready')throw new Error(`${pane.label}的阴影尚未完成，不能导出组合图。`);
  const savedCamera=view.cameras[pane.key],camera=framing==='camera'?(savedCamera?.rotation===view.rotation?savedCamera:fittedModelCamera(flatPresentation(result,pane.side,view.rotation).vertices,view.rotation)):undefined;
  return foldedModelSVG(result,{name,side:pane.side,xray:pane.xray,rotation:view.rotation,colors:view.colors,shadows:analysis,displayStyle:view.displayStyle,antiAlias:view.antiAlias,displayNumbers:view.displayNumbers,camera,regions:regions[pane.key]});
 });
 if(images.length===1)return images[0];
 const width=2048,height=images.length===4?1640:820;
 // The data attribute is percent encoded, never interpolated as XML markup.
 const content=images.map((svg,index)=>`<image data-pane="${panes[index].key}" x="${(index%2)*1024}" y="${Math.floor(index/2)*820}" width="1024" height="820" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g,'%27')}"/>`).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="comparison-title">
<title id="comparison-title">折纸工坊 · ${images.length===4?'实体与 X 光四视图':'正背双视图'}结果图</title>
<rect width="${width}" height="${height}" fill="#fffefb"/>
${content}
</svg>`;
}
