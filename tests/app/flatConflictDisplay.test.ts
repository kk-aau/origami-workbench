import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createElement,type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Doc,FlatFoldConflict,FlatFoldResult,FoldGraph,Point} from '../../src/core/types';
import {flatPresentation} from '../../src/app/flatPresentation';
import {defaultModelView} from '../../src/app/modelViewState';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:nextLoad(url,context);}});
const [{default:FlatView},{default:FlatConflictDetails,FlatConflictOverlay,conflictPoints,conflictView,sourceConflictResult,visibleFlatConflicts}]=await Promise.all([import('../../src/components/FlatView'),import('../../src/components/FlatConflictDetails')]);
cssHook.deregister();
const root:FlatFoldConflict={kind:'transitivity',scope:'root',faces:[0],vertices:[1],edges:[0],message:'这组纸面被要求形成相互上下循环。'};
const branch:FlatFoldConflict={kind:'taco_tortilla',scope:'branch',faces:[1],relations:[{above:1,below:0}],message:'此候选要求纸面穿过折叠夹层。'};
const result:FlatFoldResult={
 geometry:{status:'ready',message:'几何就绪',vertices:[[0,0],[100,0],[100,70],[0,70]],faces:[[0,1,2],[0,2,3]],graph:{vertices_coords:[[0,0],[100,0],[100,70],[0,70]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]],edges_assignment:['B','B','B','B','M'],edges_foldAngle:[0,0,0,0,-180],faces_vertices:[[0,1,2],[0,2,3]]}},
 layers:{status:'no-solution',message:'完整搜索未找到合法层序。',conflicts:[root,branch]},warnings:[],computationTimeMs:12345,
};
const props:ComponentProps<typeof FlatView>={result,busy:false,stale:false,face:null,setFace:()=>{},xray:false,onRun:()=>{},source:null,vertexControls:{selection:{group:[],selected:[]},onSelect:()=>{},onMove:()=>{},disabled:false}};
const render=(patch:Partial<ComponentProps<typeof FlatView>>={})=>renderToStaticMarkup(createElement(FlatView,{...props,...patch}));

test('no-solution keeps the global result and duration while highlighting only the first reported location',()=>{
 const markup=render();
 assert.match(markup,/完整搜索未找到合法层序/);assert.match(markup,/本次用时 12.3 秒/);
 assert.match(markup,/data-flat-conflict-details="true"/);assert.match(markup,/这组纸面被要求形成相互上下循环/);
 assert.match(markup,/data-conflict-face="0"/);assert.doesNotMatch(markup,/data-conflict-face="1"/);
 assert.match(markup,/data-conflict-vertex="1"/);assert.match(markup,/data-conflict-edge="0"/);
 assert.match(markup,/定位冲突/);assert.match(markup,/aria-label="查看冲突原因"/);
});

test('stale, running and non-unsatisfiable results never expose previous conflict evidence',()=>{
 for(const patch of [{busy:true},{stale:true},...(['unknown','cancelled','error','timeout','unsupported','solved'] as const).map(status=>({result:{...result,layers:{...result.layers,status,...(status==='solved'?{faceOrder:[0,1]}:{})}}}))]){
  const markup=render(patch);assert.doesNotMatch(markup,/data-flat-conflict-(?:details|highlight)/);
 }
 assert.doesNotMatch(render({canvasModelId:'model',targeted:false}),/data-flat-conflict-(?:details|highlight)/,'inactive model does not expose a second conflict panel');
});

test('a selected branch witness is identified as an example rather than the sole cause',()=>{
 const markup=renderToStaticMarkup(createElement(FlatConflictDetails,{conflicts:[root,branch],index:1,result,onSelect:()=>{},onLocate:()=>{}}));
 assert.match(markup,/搜索冲突示例/);assert.match(markup,/此候选要求纸面穿过折叠夹层/);
 assert.match(markup,/不能将此处视为唯一原因/);assert.match(markup,/涉及纸面 F2/);
 assert.match(markup,/查看冲突时的上下关系/);assert.match(markup,/F2 在 F1 上方/);assert.match(markup,/并非最终确定的层序/);
 assert.doesNotMatch(markup,/涉及纸面 F1/);
});

test('the diagnostic panel distinguishes hard origins, guessed origins and partial derivations',()=>{
 const conflict:FlatFoldConflict={...branch,trace:{origins:[{above:1,below:0,source:'initial'},{above:0,below:1,source:'search'}],steps:[{relation:{above:1,below:0},kind:'transitivity',requires:[{above:1,below:0}]}],truncated:true}};
 const markup=renderToStaticMarkup(createElement(FlatConflictDetails,{conflicts:[conflict],index:0,result,onSelect:()=>{},onLocate:()=>{}}));
 assert.match(markup,/追溯关系来源/);assert.match(markup,/初始关系/);assert.match(markup,/搜索试排/);
 assert.match(markup,/以下仅展示部分来源/);assert.match(markup,/求解过程未因此截断/);
 assert.match(markup,/上下关系传递/);assert.match(markup,/不代表唯一或最小修改方案/);
 assert.match(markup,/tabindex="0" role="region" aria-label="冲突关系推导来源"/);
 const legacy=renderToStaticMarkup(createElement(FlatConflictDetails,{conflicts:[branch],index:0,result,onSelect:()=>{},onLocate:()=>{}}));
 assert.doesNotMatch(legacy,/追溯关系来源/,'older saved diagnostics remain valid');
});

test('unlocalized and out-of-range evidence does not color the paper or offer a fake locate action',()=>{
 const global:FlatFoldConflict={kind:'global',scope:'constraint',faces:[],message:'当前没有可定位的冲突区域。'};
 for(const conflict of [global,{...global,faces:[-1,2,1.5],vertices:[99],edges:[-2]}]){
  const details=renderToStaticMarkup(createElement(FlatConflictDetails,{conflicts:[conflict],index:0,result,onSelect:()=>{},onLocate:()=>{}}));
  const overlay=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict,result,coords:result.geometry.vertices,viewWidth:100}));
  assert.doesNotMatch(details,/定位冲突|画布已高亮/);assert.equal(overlay,'');
 }
 assert.equal(conflictView([], {width:100,height:70},100),null);
});

test('highlighting and location use the projected camera coordinates, including the back side and rotation',()=>{
 const display=flatPresentation(result,'back',90),points=conflictPoints(root,result,display.vertices);
 const markup=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict:root,result,coords:display.vertices,viewWidth:100}));
 assert.match(markup,new RegExp(`points="${result.geometry.faces[0].map(v=>display.vertices[v].join(',')).join(' ')}"`.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const camera=conflictView(points,{width:300,height:100},100)!;
 assert.ok(points.every(([x,y])=>x>=camera.x&&x<=camera.x+camera.width&&y>=camera.y&&y<=camera.y+camera.height));
 assert.ok(Math.abs(camera.width/camera.height-3)<1e-9);
});

test('comparison views share the chosen conflict and render both projected overlays',()=>{
 const markup=render({controlledView:{...defaultModelView(),layout:'both'}});
 assert.equal((markup.match(/data-flat-conflict-highlight="true"/g)??[]).length,2);
 assert.equal((markup.match(/data-conflict-face="0"/g)??[]).length,2);
 assert.equal((markup.match(/data-flat-conflict-details="true"/g)??[]).length,2);
});

// A selected CP can be far from the origin; its original camera and material
// hole must not inherit the folded model's position or back-side projection.
const originalGraph:FoldGraph={
 vertices_coords:[[300,-200],[400,-200],[400,-130],[300,-130],[315,-170],[315,-160],[325,-160]],
 edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2],[4,5],[5,6],[6,4]],
 edges_assignment:['B','B','B','B','M','B','B','B'],edges_foldAngle:[0,0,0,0,-180,0,0,0],
 faces_vertices:[[0,1,2],[0,2,3]],faces_holes:[[],[[4,5,6]]],
};
const foldedVertices:Point[]=[[0,0],[100,0],[100,70],[0,70],[15,30],[15,40],[25,40]];
const holedResult:FlatFoldResult={...result,geometry:{...result.geometry,vertices:foldedVertices,graph:{...originalGraph,vertices_coords:foldedVertices}}};
const originalDoc:Doc={schemaVersion:2,name:'offset-selected-cp',paper:{width:100,height:70},segments:originalGraph.edges_vertices.map(([a,b],i)=>({id:`offset-edge-${i}`,a:originalGraph.vertices_coords[a],b:originalGraph.vertices_coords[b],assignment:originalGraph.edges_assignment[i],angle:originalGraph.edges_foldAngle[i]}))};

test('source conflict overlay preserves offset CP coordinates and the actual hole independently of folded geometry',()=>{
 const originalResult=sourceConflictResult(holedResult,originalGraph);
 const markup=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict:branch,result:originalResult,coords:originalResult.geometry.vertices,viewWidth:150}));
 assert.match(markup,/data-conflict-face="1"/);assert.doesNotMatch(markup,/data-conflict-face="0"/);
 assert.match(markup,/data-face-holes="1"/);assert.match(markup,/fill-rule="evenodd"/);
 assert.match(markup,/d="M300,-200 L400,-130 L300,-130 Z M315,-170 L315,-160 L325,-160 Z"/);
 assert.doesNotMatch(markup,/M0,0|M15,30/);
 const edgeAndVertex=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict:root,result:originalResult,coords:originalResult.geometry.vertices,viewWidth:150}));
 assert.match(edgeAndVertex,/data-conflict-edge="0" x1="300" y1="-200" x2="400" y2="-200"/);
 assert.match(edgeAndVertex,/data-conflict-vertex="1" cx="400" cy="-200"/);
 assert.deepEqual(holedResult.geometry.vertices,foldedVertices,'displaying source evidence does not change the folded model');
});

test('controlled second conflict identifies the same evidence in the CP, folded view and source thumbnail',()=>{
 const originalResult=sourceConflictResult(holedResult,originalGraph),selection={index:1,onSelect:()=>{}};
 const cp=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict:visibleFlatConflicts(holedResult,false,false)[selection.index],result:originalResult,coords:originalResult.geometry.vertices,viewWidth:150}));
 const folded=render({result:holedResult,source:{doc:originalDoc,graph:originalGraph},face:1,conflictControl:selection,controlledView:{...defaultModelView(),side:'back',rotation:90}});
 assert.match(cp,/data-conflict-face="1"/);assert.doesNotMatch(cp,/data-conflict-face="0"/);
 assert.equal((folded.match(/data-conflict-face="1"/g)??[]).length,2,'both the folded view and its source thumbnail use the controlled conflict');
 assert.doesNotMatch(folded,/data-conflict-face="0"/);
 assert.match(folded,/此候选要求纸面穿过折叠夹层/);assert.doesNotMatch(folded,/这组纸面被要求形成相互上下循环/);
 assert.match(folded,/d="M300,-200 L400,-130 L300,-130 Z M315,-170 L315,-160 L325,-160 Z"/,'thumbnail retains source coordinates after model rotation and side change');
});

test('invalid controlled conflict indices safely fall back to the first available conflict',()=>{
 for(const index of [-1,2,.5,NaN,Infinity]){
  const markup=render({conflictControl:{index,onSelect:()=>{}}});
  assert.match(markup,/data-conflict-face="0"/);assert.doesNotMatch(markup,/data-conflict-face="1"/);
  assert.match(markup,/这组纸面被要求形成相互上下循环/);
 }
});

test('the shared source overlay visibility guard removes stale, running and non-unsatisfiable evidence',()=>{
 assert.deepEqual(visibleFlatConflicts(null,false,false),[]);assert.deepEqual(visibleFlatConflicts(undefined,false,false),[]);
 for(const state of [{result,busy:true,stale:false},{result,busy:false,stale:true},...(['unknown','cancelled','error','timeout','unsupported','solved'] as const).map(status=>({result:{...result,layers:{...result.layers,status,...(status==='solved'?{faceOrder:[0,1]}:{})}},busy:false,stale:false}))]){
  const conflicts=visibleFlatConflicts(state.result,state.busy,state.stale);
  const originalResult=sourceConflictResult(state.result,originalGraph);
  const cp=renderToStaticMarkup(createElement(FlatConflictOverlay,{conflict:conflicts[0],result:originalResult,coords:originalResult.geometry.vertices,viewWidth:150}));
  assert.equal(cp,'');
  assert.doesNotMatch(render({...state,conflictControl:{index:1,onSelect:()=>{}}}),/data-flat-conflict-(?:details|highlight)/);
 }
});
