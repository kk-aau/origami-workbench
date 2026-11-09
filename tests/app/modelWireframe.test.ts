import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelWireframe} from '../../src/app/modelWireframe';
import {flatPresentation} from '../../src/app/flatPresentation';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {defaultModelView,copyModelView,validateModelView} from '../../src/app/modelViewState';
import {modelViewPanes} from '../../src/app/modelViewPanes';
import {startModelComparisonExport} from '../../src/app/modelComparisonExportTask';
function fixture(){const doc=blankDoc('线框',100,100);doc.segments.push({id:'crease',a:[40,0],b:[40,100],assignment:'M',angle:-180});return computeFlatFold(doc);}
test('wireframe preserves actual graph edges and mountain assignment independent of layers and camera',()=>{
 const result=fixture(),before=structuredClone(result),graph=result.geometry.graph!;
 for(const side of ['front','back'] as const){
  const wire=modelWireframe(result,side,22.5),display=flatPresentation(result,side,22.5);
  assert.equal(wire.assignmentsKnown,true);assert.equal(wire.edges.length,graph.edges_vertices.length);
  wire.edges.forEach((edge,index)=>{
   assert.equal(edge.assignment,graph.edges_assignment[index]);assert.deepEqual(edge.a,display.vertices[graph.edges_vertices[index][0]]);assert.deepEqual(edge.b,display.vertices[graph.edges_vertices[index][1]]);
  });
  assert.ok(wire.edges.some(e=>e.assignment==='M'&&e.color==='#c9363c'));assert.ok(wire.edges.some(e=>e.assignment==='B'&&e.color==='#202820'));
 }
 assert.deepEqual(result,before);const solved=modelWireframe(result,'front');result.layers={status:'unknown',message:'未确认'};assert.deepEqual(modelWireframe(result,'front'),solved);
});
test('wireframe uses edited geometry positions instead of stale graph coordinate values',()=>{
 const result=fixture();result.geometry.graph!.vertices_coords=structuredClone(result.geometry.graph!.vertices_coords);result.geometry.vertices[0][0]+=7;
 const wire=modelWireframe(result,'front');for(const e of wire.edges){const edge=result.geometry.graph!.edges_vertices[e.index];if(edge[0]===0)assert.equal(e.a[0],result.geometry.vertices[0][0]);if(edge[1]===0)assert.equal(e.b[0],result.geometry.vertices[0][0]);}
});
test('missing graph deduplicates shared face edges without inventing crease assignments',()=>{
 const result=fixture();delete result.geometry.graph;
 const wire=modelWireframe(result,'front');assert.equal(wire.assignmentsKnown,false);assert.match(wire.message,/未知类型/);assert.ok(wire.edges.every(e=>e.assignment==='U'));
 assert.equal(wire.edges.length,7);
});
test('wireframe rejects malformed graph topology and unsupported assignments',()=>{
 for(const mutate of [(r:any)=>r.geometry.graph.edges_vertices[0]=[0,999],(r:any)=>r.geometry.graph.edges_vertices[0]=[0,0],(r:any)=>r.geometry.graph.edges_assignment.pop(),(r:any)=>r.geometry.graph.edges_assignment[0]='bad',(r:any)=>r.geometry.graph.vertices_coords=r.geometry.graph.vertices_coords.slice(1)]){
  const result=fixture();mutate(result);assert.throws(()=>modelWireframe(result,'front'),/线网/);
 }
});

test('wire view state validates, copies and maps four layout to front/back only',()=>{
 const view={...defaultModelView(),layout:'four' as const,displayStyle:'wire' as const,xray:true,shadows:true};
 assert.deepEqual(copyModelView(view),view);const panes=modelViewPanes(view);
 assert.deepEqual(panes.map(p=>[p.key,p.xray,p.label]),[['front-solid',false,'正面 · 线框'],['back-solid',false,'背面 · 线框']]);
 assert.equal(modelViewPanes({...view,layout:'single',side:'back'})[0].key,'back-solid');
 for(const displayStyle of [undefined,null,'transparent',0,{}])assert.throws(()=>validateModelView({...view,displayStyle}),/样式/);
 validateModelView(defaultModelView());
});

test('wire SVG exports original colored lines without filled faces or shadows, even for unknown layers',()=>{
 const result=fixture(),wire=modelWireframe(result,'back',22.5);result.layers.status='unknown';
 const svg=foldedModelSVG(result,{name:'线框',side:'back',rotation:22.5,displayStyle:'wire',xray:true,shadows:{status:'unconfirmed',boundaries:[],ambiguousEdges:0}});
 assert.equal((svg.match(/<line /g)||[]).length,wire.edges.length);assert.ok(!svg.includes('<polygon'));assert.ok(!svg.includes('linearGradient'));assert.ok(!svg.includes('X 光显示'));
 for(const edge of wire.edges)assert.ok(svg.includes(`data-edge-id="${edge.index}" data-assignment="${edge.assignment}" x1="${edge.a[0]}" y1="${edge.a[1]}"`));
 delete result.geometry.graph;assert.match(foldedModelSVG(result,{name:'回退',side:'front',displayStyle:'wire'}),/未知类型/);
 assert.throws(()=>foldedModelSVG(result,{name:'错',side:'front',displayStyle:'bad' as 'wire'}),/样式/);
});

test('folded model SVG carries the model anti-alias preference without changing geometry',()=>{
 const result=fixture(),smooth=foldedModelSVG(result,{name:'平滑',side:'front',antiAlias:true}),crisp=foldedModelSVG(result,{name:'锐利',side:'front',antiAlias:false});
 assert.match(smooth,/shape-rendering="geometricPrecision"/);assert.match(crisp,/shape-rendering="crispEdges"/);
 assert.throws(()=>foldedModelSVG(result,{name:'无效',side:'front',antiAlias:'yes' as unknown as boolean}),/抗锯齿/);
 const numbered=foldedModelSVG(result,{name:'编号',side:'front',displayNumbers:true});assert.match(numbered,/data-face-number="1"/);assert.match(numbered,/>F1<\/text>/);
 assert.throws(()=>foldedModelSVG(result,{name:'无效编号',side:'front',displayNumbers:'yes' as unknown as boolean}),/编号/);
});

test('wire comparison never starts shadow workers and exports only two vector panes',async()=>{
 const reply=await startModelComparisonExport(fixture(),'线框双图',{...defaultModelView(),layout:'four',displayStyle:'wire',shadows:true,xray:true},1000,()=>{throw Error('must not start');}).promise;
 assert.equal(reply.status,'complete');if(reply.status!=='complete')return;
 assert.equal((reply.svg.match(/data-pane=/g)||[]).length,2);assert.match(reply.svg,/width="2048" height="820"/);
 const parts=[...reply.svg.matchAll(/href="data:image\/svg\+xml;charset=utf-8,([^"]+)"/g)].map(m=>decodeURIComponent(m[1]));
 assert.ok(parts.every(svg=>svg.includes('<line ')&&!svg.includes('<polygon')&&!svg.includes('linearGradient')));
});
