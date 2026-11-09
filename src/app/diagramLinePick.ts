import type {Point} from '../core/types';
import {epsilonFor} from '../core/geometry';
import type {DiagramAnnotation,DiagramLineAnnotation} from './diagramAnnotations';
import {isDiagramCPLine,isDiagramCPExistingLine} from './diagramAnnotations';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramPresentation,isDiagramBackgroundLine,diagramFaceVisible} from './diagramDrawing';
import {pointHitsDiagramAnnotation,diagramAnnotationsInBox} from './diagramDrawingTools';
import {diagramViewportAnnotations,rotateDiagramViewportPoint} from './diagramViewport';
import {diagramTearWindowHidesFace} from './diagramTearWindowGeometry';
import {applyDiagramLineAppearance,type DiagramLineDefaults} from './diagramLineStyles';
import {diagramPiecesStrictlyCoverPoint} from './diagramFoldOcclusion';

/** This is transient selection state, never an alteration of the saved line's
 * material range. Missing keys mean an explicit whole-object selection. */
export type DiagramLineFaceSelection=Record<string,number[]>;
export interface DiagramAnnotationPick {
  annotation:DiagramAnnotation;
  /** null identifies the drawing's bottom background; undefined is independent. */
  face?:number|null;
}
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function linePoint(line:DiagramLineAnnotation,point:Point):Point {
  const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((point[0]-line.a[0])*dx+(point[1]-line.a[1])*dy)/den)):0;
  return [line.a[0]+dx*t,line.a[1]+dy*t];
}

/** Paper containment follows the same indexed illustration cells as rendering
 * and dragging. Holes, hidden layers, pulled corners and back views retain
 * their actual local coverage rather than using a face bounding box. */
function diagramFacePicker(pose:DiagramPose,view?:ModelViewState,annotations:readonly DiagramAnnotation[]=[]):(point:Point,allowed?:readonly number[])=>number|undefined {
  const shown=diagramPresentation(pose,view),mesh=diagramIllustrationMesh(pose),eps=epsilonFor(pose.sourceDoc);
  const triangles=[...shown.visibleOrder].reverse().flatMap(face=>(mesh.triangles[face]??[]).map(ids=>({face,points:ids.map(v=>shown.vertices[v])}))).flatMap(({face,points})=>{
    if(points.some(p=>!p))return [];
    const orientation=cross(points[0],points[1],points[2]),sign=Math.sign(orientation);
    if(!sign||Math.abs(orientation)<=eps*eps)return [];
    const tolerances=points.map((a,i)=>eps*Math.max(eps,Math.hypot(a[0]-points[(i+1)%3][0],a[1]-points[(i+1)%3][1])));
    return [{face,points,sign,tolerances}];
  });
  const byFace=new Map<number,typeof triangles>();for(const triangle of triangles){const row=byFace.get(triangle.face);if(row)row.push(triangle);else byFace.set(triangle.face,[triangle]);}
  const rows=[...byFace].map(([face,triangles])=>({face,triangles}));
  return (point,allowed)=>{
    for(const row of rows){
      if(diagramTearWindowHidesFace(annotations,row.face,point)||!row.triangles.some(({points,sign,tolerances})=>points.every((a,i)=>sign*cross(a,points[(i+1)%3],point)>=-tolerances[i])))continue;
      if(!allowed||allowed.includes(row.face))return row.face;
      // Coincident outlines leave lower ink visible. Shared triangulation
      // seams are still interior coverage and must not permit click-through.
      if(diagramPiecesStrictlyCoverPoint(row.triangles.map(triangle=>({shown:triangle.points})),point,eps))return undefined;
    }
    return undefined;
  };
}
export function topDiagramFaceAtPoint(pose:DiagramPose,point:Point,view?:ModelViewState,annotations:readonly DiagramAnnotation[]=[]):number|undefined {
  return diagramFacePicker(pose,view,annotations)(point);
}

/** A normal click chooses one material face at the pointer's line position.
 * Linked lines can represent several coincident CP routes; their saved range
 * is deliberately left intact until the selected face is edited. Independent
 * objects retain their paint order above linked creases and bottom drawings. */
export function pickTopDiagramAnnotation(annotations:readonly DiagramAnnotation[],point:Point,tolerance:number,pose:DiagramPose|null,view?:ModelViewState,linked=false,lineDefaults?:DiagramLineDefaults):DiagramAnnotationPick|null {
  const independent:DiagramAnnotationPick[]=[],paper:DiagramAnnotationPick[]=[],boundaryPaper:DiagramAnnotationPick[]=[],background:DiagramAnnotationPick[]=[];
  let findTop:((point:Point,allowed?:readonly number[])=>number|undefined)|undefined;
  for(const original of annotations){
    const annotation=original.kind==='line'&&lineDefaults?applyDiagramLineAppearance(original,lineDefaults):original;
    if(!pointHitsDiagramAnnotation(point,annotation,tolerance))continue;
    if(annotation.kind==='symbol'||!pose){independent.push({annotation:original});continue;}
    if(annotation.foldFaces?.length&&!annotation.foldFaces.some(face=>diagramFaceVisible(pose,face)))continue;
    const onLine=linePoint(annotation,point);
    if(annotation.foldFaces?.length&&annotation.foldFaces.every(face=>!diagramFaceVisible(pose,face)||diagramTearWindowHidesFace(annotations,face,onLine)))continue;
    findTop??=diagramFacePicker(pose,view,annotations);const top=findTop(onLine);
    const bottom=isDiagramBackgroundLine(annotation)||annotation.foldFaces?.length===0;
    if(bottom){if(top===undefined)background.push({annotation:original,face:null});continue;}
    const paperOwned=isDiagramCPLine(annotation)||!!annotation.foldFaces?.length||linked&&(annotation.style==='valley'||annotation.style==='mountain');
    if(!paperOwned){independent.push({annotation:original,face:top});continue;}
    if(top===undefined){if(!isDiagramCPLine(annotation))background.push({annotation:original,face:null});continue;}
    if(annotation.foldFaces&&!annotation.foldFaces.includes(top)){
      const lower=findTop(onLine,annotation.foldFaces);if(lower!==undefined)boundaryPaper.push({annotation:original,face:lower});
      continue;
    }
    paper.push({annotation:original,face:top});
  }
  return independent.at(-1)??paper.at(-1)??boundaryPaper.at(-1)??background.at(-1)??null;
}

export function selectedDiagramLineRange(line:DiagramLineAnnotation,selection:DiagramLineFaceSelection):DiagramLineAnnotation {
  return Object.hasOwn(selection,line.id)?{...line,foldFaces:[...selection[line.id]]}:line;
}

/** Shift toggles individual material occurrences even when their shape has
 * been coalesced into one line ID. Unrelated selected objects keep their range. */
export function diagramPickedSelection(ids:readonly string[],ranges:DiagramLineFaceSelection,pick:DiagramAnnotationPick,extend=false):{ids:string[];lineFaces:DiagramLineFaceSelection} {
  const {annotation,face}=pick,id=annotation.id,one=annotation.kind==='line'&&face!==undefined?(face===null?[]:[face]):undefined;
  if(!extend)return {ids:[id],lineFaces:one?{[id]:one}:{}};
  const nextIds=[...ids];let nextRanges:DiagramLineFaceSelection=Object.fromEntries(Object.entries(ranges).filter(([key])=>ids.includes(key)).map(([key,value])=>[key,[...value]]));
  if(!nextIds.includes(id)){nextIds.push(id);if(one)nextRanges={...nextRanges,[id]:one};return {ids:nextIds,lineFaces:nextRanges};}
  if(annotation.kind==='line'&&face!==undefined&&face!==null){
    const previous=(Object.hasOwn(nextRanges,id)?nextRanges[id]:undefined)??annotation.foldFaces??[];
    const faces=previous.includes(face)?previous.filter(value=>value!==face):[...previous,face];
    if(faces.length){nextRanges={...nextRanges,[id]:faces};return {ids:nextIds,lineFaces:nextRanges};}
  }
  delete nextRanges[id];return {ids:nextIds.filter(value=>value!==id),lineFaces:nextRanges};
}

/** The delete rectangle is an explicit object-range operation, independent of
 * any previously selected layer. Imported CP marks and locked paper survive. */
export function diagramDeleteBoxIds(annotations:readonly DiagramAnnotation[],a:Point,b:Point,pose:DiagramPose|null,paperLocked=false,rotation=0,center:Point=[0,0]):string[] {
  const visible=annotations.filter(item=>!isDiagramCPExistingLine(item)&&(!paperLocked||item.kind==='symbol')&&(!pose||item.kind==='symbol'||!item.foldFaces?.length||item.foldFaces.some(face=>diagramFaceVisible(pose,face))));
  const projected=rotation?diagramViewportAnnotations(visible,center,rotation):visible;
  return diagramAnnotationsInBox(projected,rotateDiagramViewportPoint(a,center,rotation),rotateDiagramViewportPoint(b,center,rotation));
}
