import {validateDoc,type Doc,type FoldGraph,type Point,type Assignment} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';

export type MiuraHuffmanRecipe={model:'miura'|'mars'|'huffman';columns:number;rows:number;length1:number;length2:number;sectorAngleDeg:number;minorFoldAngleDeg:number};
const keys=['model','columns','rows','length1','length2','sectorAngleDeg','minorFoldAngleDeg'],namespace='originalMiuraHuffman',schema='original-in2482-in2468-finite-quad-cp-v1';
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,lo:number,hi:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
function same(a:unknown,b:unknown):boolean{if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v));if(record(b))return record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&same(a[k],b[k]));return typeof a===typeof b&&a===b;}
function near(a:unknown,b:number){return typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=Math.max(1e-13,16*Number.EPSILON*Math.max(1,Math.abs(b)));}
export function validateMiuraHuffmanRecipe(v:unknown):MiuraHuffmanRecipe{
 if(!record(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||!['miura','mars','huffman'].includes(v.model))throw Error('原版网格参数或来源类型不完整。');
 if(!num(v.columns,1,12)||!Number.isInteger(v.columns)||!num(v.rows,1,12)||!Number.isInteger(v.rows))throw Error('行列须为 1–12 整数（本地有限网格预算）。');
 if(!num(v.length1,.1,200)||!num(v.length2,.1,200))throw Error('用户边长须为 0.1–200 mm。');
 if(!num(v.sectorAngleDeg,5,175)||v.sectorAngleDeg===90)throw Error('种子角须为 5–175°，90°为原 straight-major 拒绝分支。');
 if(!num(v.minorFoldAngleDeg,-175,175)||Math.abs(v.minorFoldAngleDeg)<1)throw Error('当前有限入口采用绝对值 1–175° 的非零原 minor 折角。');
 return Object.fromEntries(keys.map(k=>[k,v[k]])) as MiuraHuffmanRecipe;
}
export function miuraHuffmanPreset(model:MiuraHuffmanRecipe['model']='miura'):MiuraHuffmanRecipe{return {model,columns:4,rows:model==='huffman'?7:model==='mars'?4:6,length1:20,length2:model==='mars'?40:20,sectorAngleDeg:model==='huffman'?120:model==='mars'?70:60,minorFoldAngleDeg:model==='mars'?-30:30};}
function sourceSeed(p:MiuraHuffmanRecipe){
 const a=p.sectorAngleDeg*Math.PI/180,a2=p.model==='mars'?Math.PI/2:Math.PI-a,c=Math.cos(a),s=Math.sin(a),mu=Math.sin((a+a2)/2)/Math.sin((a-a2)/2),major=2*Math.atan(mu*Math.tan(p.minorFoldAngleDeg*Math.PI/360))*180/Math.PI;
 const sectors=p.model==='mars'?[p.sectorAngleDeg,90,180-p.sectorAngleDeg,90]:[p.sectorAngleDeg,180-p.sectorAngleDeg,180-p.sectorAngleDeg,p.sectorAngleDeg];
 const rays:Point[]=p.model==='mars'?[[1,0],[c,s],[-s,c],[0,-1]]:[[1,0],[c,s],[-1,0],[c,-s]],dihedrals=[p.minorFoldAngleDeg,major,-p.minorFoldAngleDeg,major];
 if(!Number.isFinite(mu)||!Number.isFinite(major))throw Error('原种子折角分支在当前 binary64 中不有限。');
 return {sectorsDeg:sectors,creaseVectors:rays,dihedralsDeg:dihedrals,minorFirst:true,formulaCell:'In[2301]',selectedBranch:'flat-foldable, original minor-first'};
}
function construction(p:MiuraHuffmanRecipe){
 const seed=sourceSeed(p),cv=seed.creaseVectors,da=seed.dihedralsDeg,nh=p.columns,nv=p.rows;let lengths=[p.length1,p.length2,p.length1,p.length2];
 if(p.model==='huffman'){
  // Original Solve: d3 cv3 - d4 cv4 = -d1 cv1 + d2 cv2.
  const a=cv[2],b=cv[3],rhs:Point=[-p.length1*cv[0][0]+p.length2*cv[1][0],-p.length1*cv[0][1]+p.length2*cv[1][1]],det=a[0]*(-b[1])-a[1]*(-b[0]);
  const d3=(rhs[0]*(-b[1])-rhs[1]*(-b[0]))/det,d4=(a[0]*rhs[1]-a[1]*rhs[0])/det;
  if(!Number.isFinite(d3)||!Number.isFinite(d4)||d3<=0||d4<=0)throw Error('原 Huffman badlens：解出的 d3 或 d4 非正，不能构造纸面。');
  lengths=[p.length1,p.length2,d3,d4];
 }
 const point=(i:number,j:number):Point=>{
  if(p.model==='huffman'){const [d1,d2,d3,d4]=lengths,offset:Point=i%2===0&&j%2===0?[0,0]:i%2===1&&j%2===0?cv[0].map(v=>d1*v) as Point:i%2===0&&j%2===1?cv[1].map(v=>d2*v) as Point:cv[0].map((v,k)=>d1*v-d4*cv[3][k]) as Point;return [0,1].map(k=>Math.floor(i/2)*(d1*cv[0][k]-d3*cv[2][k])+Math.floor(j/2)*(d2*cv[1][k]-d4*cv[3][k])+offset[k]) as Point;}
  const out:Point=[0,0];for(let k=1;k<=i;k++){const ray=k%2?cv[0]:cv[2];for(let axis=0;axis<2;axis++)out[axis]+=p.length1*(k%2?1:-1)*ray[axis];}for(let k=1;k<=j;k++){const ray=k%2?cv[1]:cv[3];for(let axis=0;axis<2;axis++)out[axis]+=p.length2*(k%2?1:-1)*ray[axis];}return out;
 };
 const vertices_coords=Array.from({length:(nh+1)*(nv+1)},(_,v)=>point(v%(nh+1),Math.floor(v/(nh+1)))),edges_vertices:number[][]=[],edges_assignment:Assignment[]=[],edges_foldAngle:(number|null)[]=[],faces_vertices:number[][]=[];
 const id=(i:number,j:number)=>j*(nh+1)+i;
 const edge=(a:number,b:number,border:boolean,angle:number)=>{edges_vertices.push([a,b]);edges_assignment.push(border?'B':angle<0?'M':angle>0?'V':'U');edges_foldAngle.push(border?0:angle);};
 for(let j=0;j<=nv;j++)for(let i=1;i<=nh;i++){const angle=p.model==='huffman'?da[(i+j)%2?0:2]:(j%2?-1:1)*da[i%2?0:2];edge(id(i-1,j),id(i,j),j===0||j===nv,angle);}
 for(let j=1;j<=nv;j++)for(let i=0;i<=nh;i++){const angle=p.model==='huffman'?da[(i+j)%2?1:3]:(i%2?-1:1)*da[j%2?1:3];edge(id(i,j-1),id(i,j),i===0||i===nh,angle);}
 for(let j=0;j<nv;j++)for(let i=0;i<nh;i++)faces_vertices.push([id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1)]);
 // Indexed cell sides follow [bottom,right,top,left]; no coordinate welding.
 const verticalOffset=nh*(nv+1),faces_edges=faces_vertices.map((_,f)=>{const i=f%nh,j=Math.floor(f/nh);return [j*nh+i,verticalOffset+j*(nh+1)+i+1,(j+1)*nh+i,verticalOffset+j*(nh+1)+i];}),
  edges_faces=edges_vertices.map(()=>[] as number[]);
 faces_edges.forEach((es,f)=>es.forEach(e=>edges_faces[e].push(f)));
 const faces_faces=faces_edges.map((es,f)=>es.map(e=>edges_faces[e].find(owner=>owner!==f)??null)) as unknown as number[][];
 return {seed,lengths,graph:{vertices_coords,edges_vertices,edges_assignment,edges_foldAngle,faces_vertices,faces_edges,edges_faces,faces_faces} as FoldGraph};
}
function sourceInfo(p:MiuraHuffmanRecipe,seed:ReturnType<typeof sourceSeed>,lengths:number[]){return {schema,recipe:structuredClone(p),seed,foldLengths:lengths,source:{constructor:p.model==='huffman'?'MakeTHuffmanGrid':'MakeTMiuraMarsOri',definitionCell:p.model==='huffman'?'In[2468]':'In[2482]',uniformOverload:p.model==='huffman'?null:'In[2484]',notebookSHA256:'19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',vertexOrigin:[0,0],vertexOrder:'bottom row left-to-right, rows upward',edgeOrder:'all horizontal, then all vertical',borderOverride:true,lengthUnitConvention:'1 original parameter unit = 1 mm; original coordinates unchanged',minimumLengthOptimizationUsed:false,sourceModel:'finite binary64 from original direct vertex formulas'},evidence:{finiteMaterialValidated:true,CPOnly:true,original3DConstructionReproduced:false,staticGlobalIsometryChecked:false,wholeSheetLayerOrderChecked:false,continuousRigidPathChecked:false,selfCollisionChecked:false,wolframExecuted:false}};}
export function generateMiuraHuffmanDocument(raw:MiuraHuffmanRecipe):Doc{
 const p=validateMiuraHuffmanRecipe(raw),{seed,lengths,graph}=construction(p),v=graph.vertices_coords,x=v.map(a=>a[0]),y=v.map(a=>a[1]),name=p.model==='huffman'?'原 Huffman 有限网格 CP':p.model==='mars'?'原 Mars 有限网格 CP':'原 Miura-ori 有限网格 CP';
 const doc:Doc={schemaVersion:2,name,paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:graph.edges_vertices.map(([a,b],i)=>({id:'original-grid-'+i,a:[...v[a]],b:[...v[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle?.[i]??null})),metadata:{[namespace]:sourceInfo(p,seed,lengths)}};
 validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,graph,doc.segments.map(s=>s.id));return doc;
}
export function readMiuraHuffmanRecipe(doc:Doc):MiuraHuffmanRecipe|null{try{const saved=doc.metadata?.[namespace];if(!record(saved)||saved.schema!==schema)return null;return validateMiuraHuffmanRecipe(saved.recipe);}catch{return null;}}
export function miuraHuffmanSourceMatches(doc:Doc):boolean{
 try{
  validateDoc(doc);const p=readMiuraHuffmanRecipe(doc);if(!p)return false;const own=doc.metadata![namespace];if(!record(own))return false;const {seed,lengths,graph}=construction(p),expected=sourceInfo(p,seed,lengths),material=inspectMaterialTopology(doc);if(!material.ok||material.foldedVertices!==undefined||material.startingFace!==undefined)return false;
  if(!same(Object.keys(own).sort(),Object.keys(expected).sort())||!same(own.schema,expected.schema)||!same(own.recipe,p)||!same(own.source,expected.source)||!same(own.evidence,expected.evidence))return false;
  if(!record(own.seed)||!same(Object.keys(own.seed).sort(),Object.keys(seed).sort())||!same(own.seed.sectorsDeg,seed.sectorsDeg)||!same(own.seed.minorFirst,true)||!same(own.seed.formulaCell,seed.formulaCell)||!same(own.seed.selectedBranch,seed.selectedBranch))return false;
  const rays=own.seed.creaseVectors,dihedrals=own.seed.dihedralsDeg;if(!Array.isArray(rays)||rays.length!==4||!Array.isArray(dihedrals)||dihedrals.length!==4||!same(rays[0],[1,0])||!same(p.model==='mars'?rays[3]:rays[2],p.model==='mars'?[0,-1]:[-1,0]))return false;
  if(seed.creaseVectors.some((r,i)=>!Array.isArray(rays[i])||rays[i].length!==2||r.some((v,k)=>!near(rays[i][k],v)))||dihedrals[0]!==p.minorFoldAngleDeg||dihedrals[2]!==-p.minorFoldAngleDeg||dihedrals[1]!==dihedrals[3]||![1,3].every(i=>near(dihedrals[i],seed.dihedralsDeg[i])))return false;
  if(!Array.isArray(own.foldLengths)||own.foldLengths.length!==4||own.foldLengths[0]!==p.length1||own.foldLengths[1]!==p.length2||p.model!=='huffman'&&(own.foldLengths[2]!==p.length1||own.foldLengths[3]!==p.length2)||own.foldLengths.some((v,i)=>!near(v,lengths[i])))return false;
  const saved=material.graph;if(saved.vertices_coords.length!==graph.vertices_coords.length||!same(saved.edges_vertices,graph.edges_vertices)||!same(saved.faces_vertices,graph.faces_vertices)||!same(saved.faces_edges,graph.faces_edges)||!same(saved.edges_faces,graph.edges_faces)||!same(saved.faces_faces,graph.faces_faces)||!same(saved.edges_assignment,graph.edges_assignment)||!Array.isArray(saved.edges_foldAngle)||saved.edges_foldAngle.length!==graph.edges_vertices.length)return false;
  if(saved.vertices_coords.some((r,i)=>!Array.isArray(r)||r.length!==2||r.some((v,k)=>i===0||i===1? v!==graph.vertices_coords[i][k]:!near(v,graph.vertices_coords[i][k]))))return false;
  const horizontalCount=p.columns*(p.rows+1),savedAngle=(e:number)=>{if(graph.edges_assignment[e]==='B')return 0;if(e<horizontalCount){const i=e%p.columns+1,j=Math.floor(e/p.columns);return p.model==='huffman'?dihedrals[(i+j)%2?0:2]:(j%2?-1:1)*dihedrals[i%2?0:2];}const k=e-horizontalCount,i=k%(p.columns+1),j=Math.floor(k/(p.columns+1))+1;return p.model==='huffman'?dihedrals[(i+j)%2?1:3]:(i%2?-1:1)*dihedrals[j%2?1:3];};
  if(saved.edges_foldAngle.some((v,i)=>v!==savedAngle(i)))return false;
  if(doc.segments.length!==graph.edges_vertices.length||!same(material.edgeSegmentIds,doc.segments.map(s=>s.id)))return false;
  if(doc.segments.some((s,i)=>s.id!=='original-grid-'+i||s.assignment!==graph.edges_assignment[i]||!same(s.angle,saved.edges_foldAngle![i])||!same(s.a,saved.vertices_coords[graph.edges_vertices[i][0]])||!same(s.b,saved.vertices_coords[graph.edges_vertices[i][1]])))return false;
  const x=graph.vertices_coords.map(v=>v[0]),y=graph.vertices_coords.map(v=>v[1]);return near(doc.paper.width,Math.max(...x)-Math.min(...x))&&near(doc.paper.height,Math.max(...y)-Math.min(...y));
 }catch{return false;}
}
