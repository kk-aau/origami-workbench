import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {buildDiagramFold} from '../../src/core/geometry';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramPresentation} from '../../src/app/diagramDrawing';
import {buildDiagramSnapReferences,type DiagramSnapPreviewSegment} from '../../src/app/diagramSnapReferences';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {FoldGraph,Point} from '../../src/core/types';
import {materialDoc} from '../fixtures/materialModel';
import {diagramTearWindowContainsPoint,diagramTearWindowOutline} from '../../src/app/diagramTearWindowGeometry';

const view=defaultModelView();
const line=(id:string,a:Point,b:Point,extra:Partial<DiagramLineAnnotation>={}):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'auxiliary',color:'#123456',width:.7,...extra});
const near=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5;
const same=(reference:DiagramLineAnnotation,a:Point,b:Point)=>near(reference.a,a)&&near(reference.b,b)||near(reference.a,b)&&near(reference.b,a);
function fixture(){
  const sourceDoc=blankDoc('吸附参照纸层',100,100);sourceDoc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(sourceDoc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,2);
  result.layers={status:'solved',message:'test order',faceOrder:[0,1]};
  const pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc,result,view};return pose;
}

test('free drawing retains independent lines, removes reversed duplicates and leaves its inputs untouched',()=>{
  const annotations:DiagramAnnotation[]=[line('a',[1,2],[4,8]),line('reverse',[4,8],[1,2]),line('other',[30,20],[40,20]),{id:'symbol',kind:'symbol',symbol:'fold',position:[0,0],size:20,rotation:0,color:'#123456',width:.7}];
  const before=structuredClone(annotations),references=buildDiagramSnapReferences({pose:null,view,annotations});
  assert.deepEqual(references.map(reference=>reference.id),['a','other']);assert.deepEqual(annotations,before);
});

test('linked drawing uses current visible and unknown preview pieces while excluding hidden paper routes and obsolete source coordinates',()=>{
  const pose=fixture();pose.hiddenFaces=[0];
  const annotations=[line('source',[4,15],[42,15],{style:'valley',foldFaces:[1]}),line('cp-existing:old',[4,25],[42,25],{style:'crease',foldFaces:[1]}),line('independent',[4,35],[42,35])];
  const preview:DiagramSnapPreviewSegment[]=[
    {id:'current',a:[4,45],b:[42,45],face:1,style:'valley',visibility:'visible'},
    {id:'unknown',a:[4,55],b:[42,55],face:1,style:'crease',visibility:'unknown'},
    {id:'covered',a:[4,65],b:[42,65],face:1,style:'mountain',visibility:'hidden'},
    {id:'hidden-face',a:[4,75],b:[42,75],face:0,style:'crease',visibility:'visible'},
  ];
  const before=structuredClone({pose,annotations,preview}),references=buildDiagramSnapReferences({pose,view,annotations,foldLinkEnabled:true,foldLinkPreview:preview});
  assert.ok(references.some(reference=>same(reference,[4,45],[42,45])));assert.ok(references.some(reference=>same(reference,[4,55],[42,55])));
  assert.ok(references.some(reference=>reference.id==='independent'));
  for(const y of [15,25,65,75])assert.ok(!references.some(reference=>same(reference,[4,y],[42,y])),`invisible route at y=${y}`);
  assert.deepEqual({pose,annotations,preview},before);
});

test('paper edges are clipped into exposed intervals under opaque upper paper, while transparent artwork retains its edges',()=>{
  const pose=fixture(),graph=buildDiagramFold(pose.sourceDoc).graph;
  graph.vertices_coords.forEach(([x],index)=>{if(x===100)pose.result.geometry.vertices[index][0]=25;});
  const before=structuredClone(pose),references=buildDiagramSnapReferences({pose,view,annotations:[]});
  assert.ok(references.some(reference=>same(reference,[0,0],[25,0])),'exposed half of the lower boundary survives');
  assert.ok(!references.some(reference=>same(reference,[0,0],[50,0])),'covered half cannot remain an endpoint source');
  assert.ok(references.some(reference=>same(reference,[25,0],[50,0])),'upper boundary supplies its own actual endpoints');
  const transparent=buildDiagramSnapReferences({pose,view:{...view,xray:true},annotations:[]});
  assert.ok(transparent.some(reference=>same(reference,[0,0],[50,0])));assert.deepEqual(pose,before);
});

test('coincident paper boundaries use only the upper material occurrence despite projection round-off',()=>{
  const pose=fixture(),references=buildDiagramSnapReferences({pose,view,annotations:[]});
  assert.equal(references.length,4);assert.ok(references.every(reference=>reference.foldFaces?.[0]===1));
});

test('unpainted internal graph marks are not manufactured into paper-boundary references',()=>{
  const sourceDoc=blankDoc('独立已有折痕',100,100);sourceDoc.segments.push({id:'finite-mark',a:[20,50],b:[80,50],assignment:'F',angle:0});
  const result=computeFlatFold(sourceDoc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,1);
  const pose:DiagramPose={sourceStateId:'mark',sourceRevision:0,sourceDoc,result,view},references=buildDiagramSnapReferences({pose,view,annotations:[]});
  assert.ok(!references.some(reference=>same(reference,[20,50],[80,50])));
});

test('an edge owned only by hidden faces is excluded even when both indexed endpoints also belong to shown faces',()=>{
  const sourceDoc=blankDoc('隐藏共享端点',300,300);
  for(const x of [100,200])sourceDoc.segments.push({id:`x${x}`,a:[x,0],b:[x,300],assignment:'F',angle:0});
  for(const y of [100,200])sourceDoc.segments.push({id:`y${y}`,a:[0,y],b:[300,y],assignment:'F',angle:0});
  const result=computeFlatFold(sourceDoc);assert.equal(result.geometry.status,'ready');assert.equal(result.geometry.faces.length,9);
  result.layers={status:'solved',message:'grid',faceOrder:result.geometry.faces.map((_,index)=>index)};
  const pose:DiagramPose={sourceStateId:'grid',sourceRevision:0,sourceDoc,result,view};
  pose.hiddenFaces=result.geometry.faces.flatMap((face,index)=>{const center=face.reduce((sum,vertex)=>[sum[0]+result.geometry.vertices[vertex][0]/face.length,sum[1]+result.geometry.vertices[vertex][1]/face.length] as Point,[0,0] as Point);return center[1]>100&&center[1]<200&&center[0]>100?[index]:[];});
  const references=buildDiagramSnapReferences({pose,view,annotations:[]});
  assert.equal(pose.hiddenFaces.length,2);assert.ok(!references.some(reference=>same(reference,[200,100],[200,200])));
  for(const endpoint of [[200,100],[200,200]] as Point[])assert.ok(references.some(reference=>near(reference.a,endpoint)||near(reference.b,endpoint)));
});

test('hole rims remain paper references and covered background artwork offers no paper-interior endpoints',()=>{
  const graph:FoldGraph={vertices_coords:[[0,0],[100,0],[100,100],[0,100],[30,30],[30,70],[70,70],[70,30]],faces_vertices:[[0,1,2,3]],faces_holes:[[[4,5,6,7]]],faces_edges:[[0,1,2,3]],faces_holeEdges:[[[4,5,6,7]]],faces_faces:[Array(4).fill(null)],faces_holeFaces:[[Array(4).fill(null)]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]],edges_faces:Array.from({length:8},()=>[0]),edges_assignment:Array(8).fill('B'),edges_foldAngle:Array(8).fill(0)};
  const sourceDoc=materialDoc(graph,graph.vertices_coords),pose:DiagramPose={sourceStateId:'hole',sourceRevision:0,sourceDoc,view,result:{geometry:{status:'ready',message:'hole',vertices:graph.vertices_coords,faces:graph.faces_vertices!,graph},layers:{status:'solved',message:'one',faceOrder:[0]},warnings:[]}};
  const background=line('bg:stored',[-20,50],[120,50]),before=structuredClone({pose,background});
  const references=buildDiagramSnapReferences({pose,view,annotations:[background]});
  for(const [a,b] of [[4,5],[5,6],[6,7],[7,4]])assert.ok(references.some(reference=>same(reference,graph.vertices_coords[a],graph.vertices_coords[b])));
  for(const [a,b] of [[[-20,50],[0,50]],[[30,50],[70,50]],[[100,50],[120,50]]] as [Point,Point][])assert.ok(references.some(reference=>same(reference,a,b)),`visible background ${a} to ${b}`);
  assert.ok(!references.some(reference=>same(reference,background.a,background.b)));assert.deepEqual({pose,background},before);
});

test('linked background extensions are cropped by existing paper coverage without bringing back their original source span',()=>{
  const pose=fixture(),source=line('long-fold',[-20,40],[70,40],{style:'valley',foldFaces:[0,1]}),references=buildDiagramSnapReferences({pose,view,annotations:[source],foldLinkEnabled:true});
  assert.ok(references.some(reference=>same(reference,[-20,40],[0,40])));assert.ok(references.some(reference=>same(reference,[50,40],[70,40])));
  assert.ok(!references.some(reference=>same(reference,source.a,source.b)));
});

test('back camera and model rotation produce references in the displayed coordinates',()=>{
  const pose=fixture(),turned={...view,side:'back' as const,rotation:37},shown=diagramPresentation(pose,turned),references=buildDiagramSnapReferences({pose,view:turned,annotations:[]});
  const top=shown.visibleOrder.at(-1)!,ring=pose.result.geometry.faces[top];
  for(let i=0;i<ring.length;i++)assert.ok(references.some(reference=>same(reference,shown.vertices[ring[i]],shown.vertices[ring[(i+1)%ring.length]])));
});

const tear=(id:string,position:Point,faces:number[],radius=10):DiagramSymbolAnnotation=>({id,kind:'symbol',symbol:'tearWindow',position,size:100,rotation:0,color:'#293d35',width:.7,params:{radius},cutawayFaces:faces});
function contains(reference:DiagramLineAnnotation,point:Point){
  const dx=reference.b[0]-reference.a[0],dy=reference.b[1]-reference.a[1],size=Math.hypot(dx,dy),along=(point[0]-reference.a[0])*dx+(point[1]-reference.a[1])*dy;
  return Math.abs((point[0]-reference.a[0])*dy-(point[1]-reference.a[1])*dx)<size*1e-5&&along>=-size*1e-5&&along<=size*size+size*1e-5;
}

test('cutaway paper edges offer only their visible fragments while the exposed lower occurrence supplies its original face',()=>{
  const pose=fixture(),window=tear('paper-edge',[25,0],[1]),before=structuredClone({pose,window});
  const references=buildDiagramSnapReferences({pose,view,annotations:[window]});
  for(const point of [[10,0],[25,0],[40,0]] as Point[]){
    const owner=diagramTearWindowContainsPoint(window,point)?0:1;
    const at=references.filter(reference=>contains(reference,point));
    assert.ok(at.some(reference=>reference.foldFaces?.includes(owner)),`visible original face ${owner} at ${point}`);
    assert.ok(at.every(reference=>!reference.foldFaces?.includes(1-owner)),`covered or removed face cannot attract ${point}`);
  }
  assert.deepEqual({pose,window},before,'paper and annotations remain immutable; these are temporary reference fragments');
});

test('direct face-bound lines are removed only where every visible contributing paper layer is cut away',()=>{
  const pose=fixture(),a=tear('upper',[20,50],[1],12),b=tear('lower',[30,50],[0],12);
  for(const owners of [[1],[0],[0,1],[]]){
    const source=line('source',[0,50],[50,50],{foldFaces:owners});
    const before=structuredClone({pose,a,b,source}),references=buildDiagramSnapReferences({pose,view,annotations:[a,b,source]}).filter(reference=>reference.id==='source'||reference.id.startsWith('source:visible:'));
    for(let x=1.37;x<49;x+=.7){
      const point:Point=[x,50],hidden=owners.length>0&&owners.every(face=>diagramTearWindowContainsPoint(face===1?a:b,point));
      assert.equal(references.some(reference=>contains(reference,point)),!hidden,`original owners ${owners} at ${point}`);
    }
    assert.deepEqual({pose,a,b,source},before);
  }
  const source=line('shared',[0,50],[50,50],{foldFaces:[0,1]}),hidden={...pose,hiddenFaces:[0]};
  const references=buildDiagramSnapReferences({pose:hidden,view,annotations:[a,source]});
  assert.ok(!references.some(reference=>reference.id.startsWith('shared')&&contains(reference,[20,50])),'a globally hidden contributing face cannot restore a locally removed upper line');
});

test('covered linked preview creases become snap references only inside the upper window that genuinely exposes them',()=>{
  const pose=fixture(),window=tear('upper',[25,50],[1]);
  const preview:DiagramSnapPreviewSegment[]=[{id:'covered',a:[0,50],b:[50,50],face:0,style:'crease',visibility:'hidden'}];
  const closed=buildDiagramSnapReferences({pose,view,annotations:[],foldLinkEnabled:true,foldLinkPreview:preview});
  assert.ok(!closed.some(reference=>reference.id.startsWith('snap-preview:covered')));
  const references=buildDiagramSnapReferences({pose,view,annotations:[window],foldLinkEnabled:true,foldLinkPreview:preview});
  const revealed=references.filter(reference=>reference.id.startsWith('snap-preview:covered'));
  assert.ok(revealed.length>0);assert.ok(revealed.every(reference=>reference.foldFaces?.[0]===0));
  for(let x=1.37;x<49;x+=.7)assert.equal(revealed.some(reference=>contains(reference,[x,50])),diagramTearWindowContainsPoint(window,[x,50]),`covered lower preview at ${x}`);
  const both=buildDiagramSnapReferences({pose,view,annotations:[{...window,cutawayFaces:[0,1]}],foldLinkEnabled:true,foldLinkPreview:preview});
  assert.ok(!both.some(reference=>reference.id.startsWith('snap-preview:covered')),'removing the lower paper too cannot leave its crease as a reference');
});

test('a remaining middle sheet still covers lower routes when only the top of three layers is cut away',()=>{
  const sourceDoc=blankDoc('三层开窗吸附',150,100);
  sourceDoc.segments.push({id:'first',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'second',a:[100,0],b:[100,100],assignment:'M',angle:-180});
  const result=computeFlatFold(sourceDoc,undefined,{flatCreases:'marks'});assert.equal(result.geometry.faces.length,3);
  result.layers={status:'solved',message:'three layers',faceOrder:[0,1,2]};
  const pose:DiagramPose={sourceStateId:'three',sourceRevision:0,sourceDoc,result,view};
  const upper=tear('upper',[20,50],[2],12),middle=tear('middle',[30,50],[1],12);
  const preview:DiagramSnapPreviewSegment[]=[{id:'bottom',a:[0,50],b:[50,50],face:0,style:'crease',visibility:'hidden'}];
  const covered=buildDiagramSnapReferences({pose,view,annotations:[upper],foldLinkEnabled:true,foldLinkPreview:preview});assert.ok(!covered.some(reference=>reference.id.startsWith('snap-preview:bottom')));
  const exposed=buildDiagramSnapReferences({pose,view,annotations:[upper,middle],foldLinkEnabled:true,foldLinkPreview:preview}).filter(reference=>reference.id.startsWith('snap-preview:bottom'));
  assert.ok(exposed.length>0);
  for(let x=1.37;x<49;x+=.7)assert.equal(exposed.some(reference=>contains(reference,[x,50])),diagramTearWindowContainsPoint(upper,[x,50])&&diagramTearWindowContainsPoint(middle,[x,50]),`three-layer overlap at ${x}`);
});

test('stored background lines become references through cutaway openings only when all paper covering them is removed',()=>{
  const pose=fixture(),window=tear('all',[25,50],[0,1]),background=line('bg:stored',[-20,50],[70,50]);
  const before=structuredClone({pose,window,background});
  const opened=buildDiagramSnapReferences({pose,view,annotations:[window,background]}).filter(reference=>reference.id.startsWith('bg:stored'));
  assert.ok(opened.some(reference=>contains(reference,[-10,50])));assert.ok(opened.some(reference=>contains(reference,[60,50])));
  for(let x=1.37;x<49;x+=.7)assert.equal(opened.some(reference=>contains(reference,[x,50])),diagramTearWindowContainsPoint(window,[x,50]),`background opening at ${x}`);
  const covered=buildDiagramSnapReferences({pose,view,annotations:[{...window,cutawayFaces:[1]},background]});assert.ok(!covered.some(reference=>reference.id.startsWith('bg:stored')&&contains(reference,[25,50])));
  assert.deepEqual({pose,window,background},before);
});

test('mirrored, rotated and scaled window references use the same exact world outline as the visible mask',()=>{
  const pose=fixture(),turned={...view,side:'back' as const,rotation:37},shown=diagramPresentation(pose,turned),top=shown.visibleOrder.at(-1)!;
  const vertices=shown.vertices,center:Point=[vertices.reduce((sum,p)=>sum+p[0],0)/vertices.length,vertices.reduce((sum,p)=>sum+p[1],0)/vertices.length];
  const window={...tear('transformed',center,[top]),rotation:23,mirrored:true,size:145},outline=diagramTearWindowOutline(window);
  const source=line('transformed-line',[center[0]-30,center[1]],[center[0]+30,center[1]],{foldFaces:[top]}),saved=structuredClone({pose,window,source});
  const references=buildDiagramSnapReferences({pose,view:turned,annotations:[window,source]}).filter(reference=>reference.id.startsWith('transformed-line'));
  for(let x=center[0]-28.63;x<center[0]+29;x+=.7){const point:Point=[x,center[1]];assert.equal(references.some(reference=>contains(reference,point)),!diagramTearWindowContainsPoint(window,point));}
  for(const reference of references)for(const endpoint of [reference.a,reference.b])if(endpoint[0]!==source.a[0]&&endpoint[0]!==source.b[0])assert.ok(outline.some((a,i)=>contains(line('edge',a,outline[(i+1)%outline.length]),endpoint)),'every new display endpoint lies on the rendered irregular tear edge');
  assert.deepEqual({pose,window,source},saved);
});
