import type {DiagramSimulationSurface} from './diagramSimulationSurface';
import {renderDiagramSimulationSurface,diagramSimulationSurfaceBounds} from './diagramSimulationSurfaceRender';
import type {Point} from '../core/types';
import {resolveDiagramPaperBindings} from './diagramPaperBinding';
import type {DiagramPose} from './diagramProject';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramLineStyle} from './diagramAnnotations';
import {isDiagramCPExistingLine,isDiagramCPLine} from './diagramAnnotations';
import type {DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import {annotationBounds,diagramAnnotationMarkup} from './diagramAnnotationSVG';
import {flatPresentation} from './flatPresentation';
import {defaultModelColors} from './modelColors';
import {defaultModelView,type ModelCamera,type ModelViewState} from './modelViewState';
import {epsilonFor} from '../core/geometry';
import {polygonArea} from '../core/geometry';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {modelProjection} from './modelProjection';
import {diagramTearWindowRender} from './diagramTearWindowRender';
import {diagramImageBounds,diagramImageSVG,isDiagramImageAnnotationVisible,type DiagramImage} from './diagramImages';
import {applyDiagramLineAppearance,readDiagramLineDefaults,type DiagramLineDefaults} from './diagramLineStyles';
import {diagramCalloutDrawingBounds,type DiagramCallout} from './diagramCallouts';
import {diagramCalloutsSVG} from './diagramCalloutSVG';
import {readAdaptiveLineStyle} from './adaptiveLineStyle';
import {diagramZoomRegionBounds,diagramZoomRegionPath,type DiagramZoomRegion,type DiagramZoomBounds} from './diagramZoomGeometry';
import {diagramZoomPaperBounds,tryMapDiagramZoomArea} from './diagramStepZoom';
import {diagramLocalSurfaceMarkup,diagramLocalSurfaceClips} from './diagramLocalSurface';
import {diagramDrawingRotationFrame,diagramDrawingRotationMarkup} from './diagramDrawingRotation';
import {diagramSpatialFaceColor} from './diagramSpatialAppearance';
import {diagramSpatialEdgeMarkup} from './diagramSpatialEdges';
import {diagramBoundaryOverlay} from './diagramBoundaryOverlay';
import {diagramDepthActive} from './diagramDepth';

export const diagramPoseView=(pose:DiagramPose):ModelViewState=>pose.view??defaultModelView();
export const diagramFaceVisible=(pose:DiagramPose,face:number)=>!pose.hiddenFaces?.includes(face);
export function diagramPresentation(pose:DiagramPose,view=diagramPoseView(pose)) {
  const presentation=flatPresentation(pose.result,view.side,view.rotation,view.projectionCenter);
  if(pose.paperDeformation?.nodes.length||diagramDepthActive({...pose,view})){const projection=modelProjection(pose.result.geometry.vertices,view.side==='back',view.rotation,view?.projectionCenter);presentation.vertices=diagramIllustrationMesh({...pose,view}).vertices.map(projection.project);}
  const manual=!presentation.hasOrder&&!!pose.displayOrder?.length;
  const order=manual?(view.side==='back'?[...pose.displayOrder!].reverse():pose.displayOrder!):presentation.order;
  return {...presentation,order,visibleOrder:order.filter(face=>diagramFaceVisible(pose,face)),solid:(presentation.hasOrder||manual)&&!view.xray,manual};
}
function facePath(outer:number[],holes:number[][],vertices:Point[]) {
  return [outer,...holes].map(r=>r.map((v,i)=>`${i?'L':'M'} ${vertices[v].join(' ')}`).join(' ')+' Z').join(' ');
}
export function diagramModelMarkup(pose:DiagramPose,view=diagramPoseView(pose),omitFlatCreases=false,annotations:readonly DiagramAnnotation[]=[],lineDefaults:DiagramLineDefaults=readDiagramLineDefaults()) {
  omitFlatCreases=omitFlatCreases||view.showExistingCreases===false;
  const p=diagramPresentation(pose,view),baseColors=view.colors??defaultModelColors();
  // The category picker controls actual paper outlines as well as authored
  // boundary annotations. Keep legacy per-pose paint until a global color is set.
  const colors=lineDefaults.boundary.globalFields?.includes('color')?{...baseColors,line:lineDefaults.boundary.color}:baseColors;
  const shade=diagramSpatialFaceColor(pose,view),fillFor=(face:number,front:boolean)=>{const color=front?colors.front:colors.back;return shade?.(face,color)??color;};
  const cutaway=diagramTearWindowRender(pose,annotations,view);
  // A valid cyclic global relation can still have a unique top paper in every
  // local overlap. Paint those regions instead of exposing all buried faces.
  // Per-face cutaways and pulled illustrations keep their established fallback.
  if(!p.solid&&!p.manual&&!view.xray&&!cutaway.definitions){
    const local=diagramLocalSurfaceMarkup(pose,view,colors,omitFlatCreases);if(local!==null)return local+diagramSpatialEdgeMarkup(pose,view,colors.line);
  }
  const graph=pose.result.geometry.graph,flatEdges=new Set<string>(),mesh=diagramIllustrationMesh({...pose,view}),depth=diagramDepthActive({...pose,view});
  const spatialEdges=pose.spatial&&!view.xray&&!pose.paperDeformation?.nodes.length&&!cutaway.definitions?new Set(graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined):null;
  if(omitFlatCreases&&graph)graph.edges_vertices.forEach(([a,b],index)=>{if(graph.edges_assignment[index]==='F'||['M','V'].includes(graph.edges_assignment[index])&&pose.spatial&&typeof pose.spatial.measuredAngles[index]==='number'&&Math.abs(pose.spatial.measuredAngles[index]!)<=1e-5)flatEdges.add([Math.min(a,b),Math.max(a,b)].join('-'));});
  const faces=p.visibleOrder.map(index=>{
    if(spatialEdges?.has(index))return ''; // The dedicated depth-clipped silhouette paints zero-area faces.
    const rings=mesh.rings[index],path=facePath(rings[0],rings.slice(1),p.vertices);
    const attributes=`stroke="${colors.line}" stroke-width="${shade?1.35:1.2}" vector-effect="non-scaling-stroke" stroke-linejoin="round"`;
    const cells=pose.paperDeformation?.nodes.length||depth||graph?.zhezhi_flatCreases==='marks'&&graph.edges_assignment.includes('F')?mesh.triangles[index]:null;
    if(!flatEdges.size&&!cells)return cutaway.wrapFaces([index],`<path d="${path}" fill="${fillFor(index,p.frontMaterial[index])}" fill-opacity="${p.solid?1:.09}" fill-rule="evenodd" ${attributes} data-diagram-paper-face="${index}"/>`);
    // F subdivides the material topology but leaves the paper flat. Paint its
    // crease once through the layer-aware preview, rather than as a solid face edge.
    const flatBoundary=(a:number,b:number)=>{
      if(flatEdges.has([Math.min(a,b),Math.max(a,b)].join('-')))return true;
      if(!flatEdges.size||a<pose.result.geometry.vertices.length&&b<pose.result.geometry.vertices.length)return false;
      const eps=epsilonFor(pose.sourceDoc),points=[mesh.graph.vertices_coords[a],mesh.graph.vertices_coords[b]];
      return graph!.edges_vertices.some(([u,v],edge)=>{
        if(graph!.edges_assignment[edge]!=='F')return false;
        const start=mesh.graph.vertices_coords[u],end=mesh.graph.vertices_coords[v],dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
        return length>eps&&points.every(point=>{const x=point[0]-start[0],y=point[1]-start[1],along=(x*dx+y*dy)/length;return Math.abs(x*dy-y*dx)<=eps*length&&along>=-eps&&along<=length+eps;});
      });
    };
    const outline=rings.flatMap(ring=>ring.flatMap((a,i)=>{const b=ring[(i+1)%ring.length];return flatBoundary(a,b)?[]:[`M ${p.vertices[a].join(' ')} L ${p.vertices[b].join(' ')}`];})).join(' ');
    const fills:{front:boolean;first:number;paths:string[];vertices:string[]}[]=[];
    cells?.forEach((cell,part)=>{
      const front=(polygonArea(cell.map(v=>mesh.vertices[v]))>0)===(view.side==='front');
      // Rasterizing adjacent opaque triangles separately leaks the paper below
      // through their antialiased edges. Paint a continuous same-side run once,
      // without reordering real front/back folds or translucent overlap.
      let group=fills.at(-1);
      if(!p.solid||!group||group.front!==front){group={front,first:part,paths:[],vertices:[]};fills.push(group);}
      group.paths.push(facePath(cell,[],p.vertices));group.vertices.push(cell.join(','));
    });
    const fill=cells?fills.map(group=>`<path data-diagram-cell="${index}:${group.first}" data-diagram-cell-count="${group.paths.length}" data-diagram-cell-vertices="${group.vertices.join(' ')}" d="${group.paths.join(' ')}" fill="${fillFor(index,group.front)}" fill-opacity="${p.solid?1:.09}" fill-rule="nonzero" stroke="none"/>`).join(''):`<path d="${path}" fill="${fillFor(index,p.frontMaterial[index])}" fill-opacity="${p.solid?1:.09}" fill-rule="evenodd" stroke="none"/>`;
    return cutaway.wrapFaces([index],`<g data-diagram-paper-face="${index}">${fill}<path d="${outline}" fill="none" ${attributes}/></g>`);
  }).join('');
  return (cutaway.definitions?`<defs>${cutaway.definitions}</defs>`:'')+faces+(cutaway.definitions?'':diagramSpatialEdgeMarkup(pose,view,colors.line));
}
export function diagramDrawingFrame(pose:DiagramPose|null,annotations:DiagramAnnotation[],view?:ModelViewState,images:readonly DiagramImage[]=[],paperVisible=true,callouts:readonly DiagramCallout[]=[],zoom?:DiagramZoomRegion|null,surface?:DiagramSimulationSurface):Omit<ModelCamera,'rotation'> {
  annotations=resolveDiagramPaperBindings(pose&&view?{...pose,view}:pose,annotations);
  if(zoom){
    // Paper and crease ink are cropped, while action symbols remain usable in
    // the surrounding drawing area. Tight focus margins make even a half-sheet
    // wave selection larger, rather than merely hiding the other half.
    const bounds=diagramZoomRegionBounds(zoom),symbols=annotationBounds(annotations.filter(annotation=>annotation.kind==='symbol'));
    const x=Math.min(bounds.x,symbols?.x??bounds.x),y=Math.min(bounds.y,symbols?.y??bounds.y);
    const width=Math.max(bounds.x+bounds.width,symbols?symbols.x+symbols.width:-Infinity)-x,height=Math.max(bounds.y+bounds.height,symbols?symbols.y+symbols.height:-Infinity)-y,pad=Math.max(width,height)*.04;
    return {x:x-pad,y:y-pad,width:width+2*pad,height:height+2*pad};
  }
  const vertices=pose&&paperVisible?diagramPresentation(pose,view).vertices:[],bounds=annotationBounds(paperVisible?annotations:annotations.filter(isDiagramImageAnnotationVisible));
  if(surface&&paperVisible){const b=diagramSimulationSurfaceBounds(surface);vertices.push([b.x,b.y],[b.x+b.width,b.y+b.height]);}
  if(bounds)vertices.push([bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height]);
  const detailBounds=diagramCalloutDrawingBounds(callouts);if(detailBounds)vertices.push([detailBounds.x,detailBounds.y],[detailBounds.x+detailBounds.width,detailBounds.y+detailBounds.height]);
  for(const image of images){const box=diagramImageBounds(image);vertices.push([box.minX,box.minY],[box.maxX,box.maxY]);}
  if(!vertices.length)return {x:-20,y:-20,width:240,height:240};
  const xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y),pad=Math.max(w,h)*.16;
  return {x:x-pad,y:y-pad,width:w+pad*2,height:h+pad*2};
}
/** The standalone artwork also reserves space for its title and description. */
export function diagramDrawingSVGFrame(frame:Omit<ModelCamera,'rotation'>,withCaptions=true):Omit<ModelCamera,'rotation'> {
  if(!withCaptions)return {...frame};
  const pad=frame.width*.06;
  return {x:frame.x-pad,y:frame.y-pad,width:frame.width+pad*2,height:frame.height+pad*3};
}
const escapeXML=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Crop only the presented drawing. Source geometry and callout samples remain
 * in their saved world coordinates, so entering/leaving zoom is reversible. */
export function diagramZoomArtwork(markup:string,zoom?:DiagramZoomRegion|null,idPrefix='drawing'):string {
  if(!zoom)return markup;
  const id=`diagram-zoom-${Array.from(idPrefix,c=>c.codePointAt(0)!.toString(16)).join('-')}`;
  return `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${diagramZoomRegionPath(zoom)}" clip-rule="evenodd"/></clipPath></defs><g data-diagram-zoom="${zoom.kind}" clip-path="url(#${id})">${markup}</g>`;
}
/** The instruction range is visible in the source step, while the crop itself
 * begins in the following step. The range never becomes editable CP geometry. */
export function diagramZoomInstructionMarkup(annotations:readonly DiagramAnnotation[],bounds:DiagramZoomBounds):string {
  return annotations.flatMap(annotation=>{
    if(annotation.kind!=='symbol'||annotation.symbol!=='zoom'||!annotation.zoomArea)return [];
    const region=tryMapDiagramZoomArea(annotation.zoomArea,bounds);if(!region)return [];
    const path=region.kind==='circle'?diagramZoomRegionPath(region):region.points.map((p,index)=>`${index?'L':'M'} ${p.join(' ')}`).join(' ');
    return `<path data-diagram-zoom-instruction="${escapeXML(annotation.id)}" d="${path}" fill="none" stroke="${escapeXML(annotation.color)}" stroke-width="${annotation.width}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
  }).join('');
}
/** CP normalization can merge overlapping same-assignment strokes. Split only
 * their displayed ink at authored endpoints so a partial overpaint stays local. */
export function diagramFoldPreviewAppearanceSegments<T extends Pick<DiagramFoldPreviewSegment,'face'|'a'|'b'|'strokeSpan'>&{style?:DiagramLineStyle;assignment?:DiagramFoldPreviewSegment['assignment'];id?:string}>(preview:readonly T[],annotations:readonly DiagramAnnotation[]):T[] {
  const styles={M:'mountain',V:'valley',F:'crease',U:'auxiliary'} as const,eps=1e-7;
  return preview.flatMap(segment=>{
    const style=segment.style??(segment.assignment?styles[segment.assignment]:undefined),dx=segment.b[0]-segment.a[0],dy=segment.b[1]-segment.a[1],length=Math.hypot(dx,dy);
    if(!style||length<=eps)return [segment];
    const along=(point:Point)=>((point[0]-segment.a[0])*dx+(point[1]-segment.a[1])*dy)/length,stops=[0,length];
    for(const annotation of annotations){
      if(annotation.kind!=='line'||annotation.style!==style||annotation.foldFaces&&!annotation.foldFaces.includes(segment.face))continue;
      if([annotation.a,annotation.b].some(point=>Math.abs((point[0]-segment.a[0])*dy-(point[1]-segment.a[1])*dx)/length>eps))continue;
      const values=[along(annotation.a),along(annotation.b)].sort((a,b)=>a-b);
      if(Math.min(length,values[1])-Math.max(0,values[0])<=eps)continue;
      for(const value of values)if(value>eps&&value<length-eps)stops.push(value);
    }
    if(stops.length===2)return [segment];
    const cuts=stops.sort((a,b)=>a-b).filter((value,index,values)=>!index||value-values[index-1]>eps),point=(distance:number):Point=>[segment.a[0]+dx*distance/length,segment.a[1]+dy*distance/length];
    return cuts.slice(1).map((end,index)=>({...segment,a:point(cuts[index]),b:point(end),strokeSpan:{length:segment.strokeSpan?.length??length,offset:(segment.strokeSpan?.offset??0)+cuts[index]},...(segment.id?{id:`${segment.id}:paint:${index}`}:{})}));
  });
}
/** Styling belongs to the source drawing object, and occlusion belongs to the
 * material face. Coincident lines on distinct paper layers keep distinct styles. */
export function diagramFoldPreviewAttributes(segment:DiagramFoldPreviewSegment,annotations:DiagramAnnotation[],lineColor:string,lineDefaults:DiagramLineDefaults=readDiagramLineDefaults()) {
  const styles={M:'mountain',V:'valley',F:'crease',U:'auxiliary'} as const,style=segment.style??styles[segment.assignment];
  const matches=annotations.filter((annotation):annotation is DiagramLineAnnotation=>{
    if(annotation.kind!=='line'||annotation.style!==style||annotation.foldFaces&&!annotation.foldFaces.includes(segment.face))return false;
    const dx=annotation.b[0]-annotation.a[0],dy=annotation.b[1]-annotation.a[1],length=Math.hypot(dx,dy);
    if(length<1e-8)return false;
    return [segment.a,segment.b].every(point=>{
      const x=point[0]-annotation.a[0],y=point[1]-annotation.a[1],along=(x*dx+y*dy)/length;
      return Math.abs(x*dy-y*dx)/length<1e-7&&along>=-1e-7&&along<=length+1e-7;
    });
  });
  // On the same material face the last authored stroke paints over older ones.
  // An explicit material owner still takes precedence over unbound annotations.
  const bound=matches.filter(annotation=>annotation.foldFaces?.includes(segment.face));
  const source=bound.at(-1)??matches.at(-1),paint=diagramFoldPreviewPaint(segment,lineColor);
  const shown=applyDiagramLineAppearance<DiagramLineAnnotation>(source??{id:'preview',kind:'line',a:segment.a,b:segment.b,style,color:paint.color,width:segment.existing?.45:.7},lineDefaults);
  const generatedUnfold=segment.unfolding&&source&&isDiagramCPExistingLine(source);
  return {...paint,color:generatedUnfold&&!source.appearanceOverrides?.includes('color')?paint.color:shown.color,
    width:generatedUnfold&&!source.appearanceOverrides?.includes('width')?Math.max(shown.width,.7):shown.width,
    ...(shown.strokePattern?{strokePattern:shown.strokePattern}:{}),...(source?.appearanceOverrides?{appearanceOverrides:[...source.appearanceOverrides]}:{})};
}
/** Linked fold instructions may extend into the background. Only their paper
 * portions are replaced by CP projection; the remainder stays on the bottom
 * drawing layer and keeps its original style. Overlapping faces count once. */
export const isDiagramBackgroundLine=(a:DiagramAnnotation):a is DiagramLineAnnotation&{id:`bg:${string}`}=>a.kind==='line'&&a.id.startsWith('bg:');
export function diagramFoldBackgroundLines(pose:DiagramPose|null,annotations:DiagramAnnotation[],view=pose?diagramPoseView(pose):undefined):DiagramLineAnnotation[] {
  const lines=annotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&!isDiagramCPLine(a)&&!isDiagramBackgroundLine(a)&&(a.style==='valley'||a.style==='mountain')&&a.foldFaces?.length!==0);
  if(!pose)return lines;
  const vertices=diagramPresentation(pose,view).vertices,graph=pose.result.geometry.graph,eps=epsilonFor(pose.sourceDoc);
  const faces=pose.result.geometry.faces.map((face,index)=>{
    const rings=[face,...(graph?.faces_holes?.[index]??[])].map(ring=>ring.map(v=>vertices[v])),outer=rings[0];
    return {rings,minX:Math.min(...outer.map(p=>p[0])),maxX:Math.max(...outer.map(p=>p[0])),minY:Math.min(...outer.map(p=>p[1])),maxY:Math.max(...outer.map(p=>p[1]))};
  });
  const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0],sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
  const inRing=(p:Point,ring:Point[],strict=false)=>{
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[j],b=ring[i],d=sub(b,a),q=sub(p,a),length=Math.hypot(...d),along=q[0]*d[0]+q[1]*d[1];
      if(length>eps&&Math.abs(cross(q,d))<=eps*length&&along>=-eps*length&&along<=length*length+eps*length)return !strict;
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  return lines.flatMap(line=>{
    const d=sub(line.b,line.a),length=Math.hypot(...d);if(length<=eps)return [];
    const candidates=faces.filter(face=>Math.max(line.a[0],line.b[0])+eps>=face.minX&&Math.min(line.a[0],line.b[0])-eps<=face.maxX&&Math.max(line.a[1],line.b[1])+eps>=face.minY&&Math.min(line.a[1],line.b[1])-eps<=face.maxY);
    const cuts=[0,1],at=(t:number):Point=>[line.a[0]+d[0]*t,line.a[1]+d[1]*t];
    for(const {rings} of candidates)for(const ring of rings)for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],e=sub(b,a),q=sub(a,line.a),den=cross(d,e),edgeLength=Math.hypot(...e);
      if(Math.abs(den)>eps*Math.max(length,edgeLength)){
        const t=cross(q,e)/den,u=cross(q,d)/den;if(t>0&&t<1&&u>=-eps/Math.max(eps,edgeLength)&&u<=1+eps/Math.max(eps,edgeLength))cuts.push(t);
      }else if(Math.abs(cross(q,d))<=eps*length){for(const p of [a,b]){const v=sub(p,line.a),t=(v[0]*d[0]+v[1]*d[1])/(length*length);if(t>0&&t<1)cuts.push(t);}}
    }
    const stops=cuts.sort((a,b)=>a-b).filter((t,i,list)=>!i||(t-list[i-1])*length>eps),outside:[number,number][]=[];
    for(let i=1;i<stops.length;i++){
      const lo=stops[i-1],hi=stops[i];if((hi-lo)*length<=eps)continue;
      const mid=at((lo+hi)/2),covered=candidates.some(({rings:[outer,...holes]})=>inRing(mid,outer)&&!holes.some(hole=>inRing(mid,hole,true)));
      if(covered)continue;
      const last=outside.at(-1);if(last&&Math.abs(last[1]-lo)*length<=eps)last[1]=hi;else outside.push([lo,hi]);
    }
    let hash=2166136261;for(let i=0;i<line.id.length;i++)hash=Math.imul(hash^line.id.charCodeAt(i),16777619);
    return outside.map(([lo,hi],index)=>({...line,id:`bg:${(hash>>>0).toString(36)}:${index}`,a:at(lo),b:at(hi),foldFaces:[]}));
  });
}
/** Stored background fragments retain their bottom drawing layer even after a
 * CP edit or a camera change places paper over their old screen coordinates. */
export function diagramAnnotationCreaseVisible(annotation:DiagramAnnotation,view?:ModelViewState):boolean {
  return view?.showExistingCreases!==false||annotation.kind!=='line'||(!isDiagramCPExistingLine(annotation)&&annotation.style!=='crease');
}
export function diagramBackgroundLinesForDrawing(pose:DiagramPose|null,annotations:DiagramAnnotation[],linked=false,view=pose?diagramPoseView(pose):undefined):DiagramLineAnnotation[] {
  if(view?.showExistingCreases===false)return [];
  return [...annotations.filter(isDiagramBackgroundLine),...(linked?diagramFoldBackgroundLines(pose,annotations,view):[])];
}
/** Older previews omit existing; retain their artwork and opacity unchanged. */
export function diagramFoldPreviewPaint(segment:Pick<DiagramFoldPreviewSegment,'visibility'|'existing'|'unfolding'>,lineColor:string) {
  return {color:segment.existing&&!segment.unfolding?'#8d9b92':segment.visibility==='unknown'?'#809389':lineColor,
    opacity:segment.existing&&!segment.unfolding?(segment.visibility==='hidden'?.16:segment.visibility==='unknown'?.32:.55):(segment.visibility==='hidden'?.24:segment.visibility==='unknown'?.5:1)};
}
/** Paint ghosted lower creases before visible upper creases, independent of CP
 * face numbering, so an opaque current instruction keeps its selected color. */
export function diagramFoldPreviewDrawingOrder<T extends Pick<DiagramFoldPreviewSegment,'visibility'|'existing'|'unfolding'> & {assignment?:string;style?:string}>(preview:readonly T[],options:{xray?:boolean;cutaway?:boolean;clipped?:boolean;showExistingCreases?:boolean}={}):T[] {
  const rank={hidden:0,unknown:1,visible:2};
  // Old physical creases are part of their paper, not instructions on top of
  // the stack. Only explicit X-ray / cutaway views reveal buried old ink.
  return preview.filter(segment=>options.showExistingCreases!==false||segment.unfolding||!segment.existing&&segment.assignment!=='F'&&segment.style!=='crease').filter(segment=>!segment.existing||segment.unfolding||segment.visibility!=='hidden'||options.xray||options.cutaway||options.clipped).sort((a,b)=>rank[a.visibility]-rank[b.visibility]);
}
/** Preview points already use the same presented paper coordinates as the pose.
 * Supplying an empty preview deliberately removes original mountain/valley paint;
 * omitting it preserves the independent drawing export used by older projects. */
export function drawingSVG(pose:DiagramPose|null,annotations:DiagramAnnotation[],title:string,description:string,preview?:DiagramFoldPreviewSegment[],images:readonly DiagramImage[]=[],paperVisible=true,lineDefaults:DiagramLineDefaults=readDiagramLineDefaults(),callouts:readonly DiagramCallout[]=[],cpMarkup?:(stateId:string,sourceUnits?:number,hideExistingCreases?:boolean)=>string,lineDisplay?:{enabled?:boolean;units?:number;outputSize?:{width:number;height:number}},zoom?:DiagramZoomRegion|null,drawingRotation=0,surface?:DiagramSimulationSurface) {
  annotations=resolveDiagramPaperBindings(pose,annotations).filter(a=>diagramAnnotationCreaseVisible(a,pose?.view));
  if(!paperVisible){pose=null;preview=undefined;annotations=annotations.filter(isDiagramImageAnnotationVisible);}
  const cutaway=diagramTearWindowRender(pose,annotations);
  const localClips=pose&&!cutaway.definitions?diagramLocalSurfaceClips(pose,diagramPoseView(pose)):null;
  const independent=annotations.filter(annotation=>(!pose||annotation.kind==='symbol'||!annotation.foldFaces?.length||annotation.foldFaces.some(face=>diagramFaceVisible(pose,face)))&&(!paperVisible||!isDiagramBackgroundLine(annotation))&&(preview===undefined||!isDiagramCPLine(annotation)&&(annotation.kind!=='line'||(annotation.style!=='valley'&&annotation.style!=='mountain')||annotation.foldFaces?.length===0)));
  const background=paperVisible?diagramBackgroundLinesForDrawing(pose,annotations,preview!==undefined):[];
  const styles:Record<DiagramFoldPreviewSegment['assignment'],DiagramLineAnnotation['style']>={M:'mountain',V:'valley',F:'crease',U:'auxiliary'};
  const orderedPreview=diagramFoldPreviewDrawingOrder(diagramFoldPreviewAppearanceSegments((preview??[]).filter(segment=>!pose||diagramFaceVisible(pose,segment.face)),annotations),{showExistingCreases:pose?.view?.showExistingCreases,xray:pose?.view?.xray,cutaway:!!cutaway.definitions,clipped:!!localClips});
  const linked:DiagramLineAnnotation[]=orderedPreview.map((segment,index)=>{const attributes=diagramFoldPreviewAttributes(segment,annotations,pose?.view?.colors?.line??defaultModelColors().line,lineDefaults);return {id:`linked-fold-${index}`,kind:'line',a:segment.a,b:segment.b,style:segment.style??styles[segment.assignment],color:attributes.color,width:attributes.width,...(attributes.strokePattern?{strokePattern:attributes.strokePattern}:{})};});
  const paint=(annotation:DiagramAnnotation)=>annotation.kind==='line'?applyDiagramLineAppearance(annotation,lineDefaults):annotation;
  const shownBackground=background.map(paint),shownIndependent=independent.map(paint);
  const sourceFrame=diagramDrawingFrame(pose,[...shownBackground,...shownIndependent,...linked],undefined,images,paperVisible,callouts,zoom,surface),frame=diagramDrawingRotationFrame(sourceFrame,drawingRotation),pad=frame.width*.06,svgFrame=diagramDrawingSVGFrame(frame,!!(title||description));
  const outputWidth=lineDisplay?.outputSize?.width??1200,outputHeight=lineDisplay?.outputSize?.height??900;
  if(!Number.isFinite(outputWidth)||!Number.isFinite(outputHeight)||outputWidth<=0||outputHeight<=0)throw new Error('折图输出像素尺寸无效。');
  const renderStyle={enabled:lineDisplay?.enabled??readAdaptiveLineStyle(),units:lineDisplay?.units??Math.max(svgFrame.width/outputWidth,svgFrame.height/outputHeight)};
  const definitions=cutaway.definitions||localClips?`<defs>${cutaway.definitions}${localClips?.definitions??''}</defs>`:'';
  const paperArtwork=(surface&&paperVisible?renderDiagramSimulationSurface(surface).markup:'')+(pose?diagramModelMarkup(pose,undefined,preview!==undefined,annotations,lineDefaults):'')+diagramImageSVG(images);
  const boundaryOverlay=pose&&!cutaway.definitions&&(linked.length||shownIndependent.some(annotation=>annotation.kind==='line'))?diagramBoundaryOverlay(pose,diagramPoseView(pose),lineDefaults,preview!==undefined):'';
  const artworkFor=(units:number,includeSymbols=true)=>{
    const options={...renderStyle,units};
    const linkedMarkup=linked.map((line,index)=>{const ink=`<g opacity="${diagramFoldPreviewPaint(orderedPreview[index],line.color).opacity}">${diagramAnnotationMarkup(line,{...options,span:orderedPreview[index].strokeSpan})}</g>`;return cutaway.wrapFaces([orderedPreview[index].face],localClips?`<g data-diagram-local-ink-face="${orderedPreview[index].face}" clip-path="${localClips.clipForFace(orderedPreview[index].face)}">${ink}</g>`:ink);}).join('');
    const independentLines=shownIndependent.filter(annotation=>annotation.kind==='line').map(annotation=>cutaway.wrapFaces(annotation.foldFaces,diagramAnnotationMarkup(annotation,options))).join('');
    const independentSymbols=includeSymbols?shownIndependent.filter(annotation=>annotation.kind==='symbol').map(annotation=>diagramAnnotationMarkup(annotation)).join(''):'';
    return definitions+shownBackground.map(annotation=>diagramAnnotationMarkup(annotation,options)).join('')+paperArtwork+linkedMarkup+independentLines+boundaryOverlay+independentSymbols;
  };
  const artwork=artworkFor(renderStyle.units,!zoom),symbols=zoom?shownIndependent.filter(annotation=>annotation.kind==='symbol').map(annotation=>diagramAnnotationMarkup(annotation)).join(''):'';
  const details=diagramCalloutsSVG(callouts,{paperMarkup:(_callout,sourceUnits)=>artworkFor(sourceUnits),cpMarkup:cpMarkup??(()=>''),units:renderStyle.units,stroke:pose?.view?.colors?.line??defaultModelColors().line,strokeWidth:.7,idPrefix:'drawing-detail'});
  const sourceArea=annotations.find((a):a is Extract<DiagramAnnotation,{kind:'symbol'}>=>a.kind==='symbol'&&a.symbol==='zoom'&&!!a.zoomArea)?.zoomArea;
  const instructionBounds=!pose&&!surface&&!images.length&&sourceArea?sourceArea.basis:diagramZoomPaperBounds(pose,images,paperVisible,undefined,surface),instructions=diagramZoomInstructionMarkup(annotations,instructionBounds);
  const presented=diagramDrawingRotationMarkup(diagramZoomArtwork(artwork+details,zoom)+symbols+instructions,sourceFrame,drawingRotation);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="${svgFrame.x} ${svgFrame.y} ${svgFrame.width} ${svgFrame.height}"><rect x="${svgFrame.x}" y="${svgFrame.y}" width="${svgFrame.width}" height="${svgFrame.height}" fill="white"/>${presented}${title?`<text x="${frame.x}" y="${frame.y+frame.height+pad*.6}" font-family="Microsoft YaHei,sans-serif" font-size="${pad*.35}" fill="#293d35">${escapeXML(title)}</text>`:''}${description?`<text x="${frame.x}" y="${frame.y+frame.height+pad*1.2}" font-family="Microsoft YaHei,sans-serif" font-size="${pad*.24}" fill="#68796e">${escapeXML(description)}</text>`:''}</svg>`;
}
