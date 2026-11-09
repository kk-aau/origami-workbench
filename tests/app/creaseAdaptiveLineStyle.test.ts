import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {creaseLineStyle,creaseLineStroke,creaseLineSourceSpan,creaseShortLineTitle} from '../../src/app/creaseLineStyle';
import {adaptiveLineStroke,ADAPTIVE_LINE_STYLE_KEY} from '../../src/app/adaptiveLineStyle';
import {creasePatternSVG,DISPLAY_PIXEL_MM} from '../../src/app/creasePatternSVG';
import {defaultCreaseDisplay,previewOrieditaDisplay} from '../../src/app/creaseDisplay';
import {buildDiagramFold} from '../../src/core/geometry';
import {blankDoc,line} from '../../src/app/state';
import type {Segment} from '../../src/core/types';

const segment=(length:number,assignment:Segment['assignment']='M'):Segment=>({id:'source',a:[10,10],b:[10+length,10],assignment,angle:assignment==='M'?-180:180});
const pattern=(dash:string|undefined)=>dash?.split(/\s+/).map(Number);
const svg=(doc:ReturnType<typeof blankDoc>,enabled:boolean,units?:number)=>new XMLParser({ignoreAttributes:false}).parse(creasePatternSVG(doc,defaultCreaseDisplay(),undefined,undefined,{enabled,units})).svg;

test('CP adapter disabled preserves exact original styles, width and auxiliary colour',()=>{
 for(const assignment of ['M','V','A','U','B','F'] as const)for(const style of ['WORKBENCH','COLOR','BLACK_TWO_DOT','COLOR_AND_SHAPE'] as const){
  const source={...segment(.1,assignment),...(assignment==='A'?{displayColor:'#abcdef'}:{})},base=creaseLineStyle(source,style,.25),stroke=creaseLineStroke(source,style,4,.25,false,true);
  assert.deepEqual(stroke,{color:base.color,...(base.dash===undefined?{}:{dash:base.dash}),width:1,limited:false});
 }
});

test('short source strokes retain complete distinct mountain and valley patterns',()=>{
 const m=creaseLineStroke(segment(8),'WORKBENCH',1.6,1,true),v=creaseLineStroke(segment(8,'V'),'WORKBENCH',1.6,1,true);
 assert.equal(m.limited,false);assert.equal(v.limited,false);
 assert.equal(pattern(m.dash)!.length,4);assert.equal(pattern(v.dash)!.length,2);
 assert.ok(pattern(m.dash)![0]>pattern(m.dash)![2]*3);
 assert.ok(pattern(m.dash)!.reduce((a,b)=>a+b,0)<=8+1e-9);
 assert.ok(pattern(v.dash)!.reduce((a,b)=>a+b,0)<=8+1e-9);
 assert.notDeepEqual(m.dash,v.dash);assert.ok(m.dashOffset!>0);
});

test('round CP endpoints retain a visible gap; solid styles remain authored solid widths',()=>{
 const stroke=creaseLineStroke(segment(12),'WORKBENCH',4,1,true,true),parts=pattern(stroke.dash)!;
 assert.equal(stroke.limited,false);assert.ok(stroke.width<4);
 for(const gap of parts.filter((_,i)=>i%2===1))assert.ok(gap-stroke.width>=.7-1e-10);
 assert.deepEqual(creaseLineStroke(segment(.1),'COLOR',4,1,true,true),{color:creaseLineStyle(segment(.1),'COLOR',1).color,width:4,limited:false});
});

test('unresolvable CP strokes expose their semantic type and zoom guidance without changing geometry',()=>{
 for(const assignment of ['M','V'] as const){
  const source=segment(.1,assignment),before=structuredClone(source),stroke=creaseLineStroke(source,'WORKBENCH',2,1,true);
  assert.equal(stroke.limited,true);assert.equal(stroke.dash,undefined);assert.equal(stroke.width,.65);
  assert.match(creaseShortLineTitle(source,stroke.limited)!,assignment==='M'?/峰折（山折）.*放大/:/谷折.*放大/);
  assert.deepEqual(source,before);
 }
 assert.equal(creaseShortLineTitle(segment(100),false),undefined);
});

test('trusted source spans preserve pattern and phase across graph intersection splits',()=>{
 const doc=blankDoc('split source',100,100),source=line([0,50],[100,50],'M');
 doc.segments.push(source,line([.1,0],[.1,100],'V'),line([50,0],[50,100],'V'));
 const before=structuredClone(doc),built=buildDiagramFold(doc),rows=built.edgeSourceIds.flatMap((ids,edge)=>ids.length===1&&ids[0]===source.id?[edge]:[]);
 assert.equal(rows.length,3);
 const strokes=rows.map(edge=>{
  const [a,b]=built.graph.edges_vertices[edge],p=built.graph.vertices_coords[a],q=built.graph.vertices_coords[b],sourceSpan=creaseLineSourceSpan(source,p,q)!;
  assert.ok(sourceSpan);assert.equal(sourceSpan.span.length,100);
  return adaptiveLineStroke(Math.hypot(p[0]-q[0],p[1]-q[1]),1.6,'10 3 2 3',{enabled:true,units:1,span:sourceSpan.span});
 });
 assert.ok(strokes.every(s=>s.dash==='10 3 2 3'&&!s.limited));
 assert.equal(strokes[0].dashOffset,undefined);assert.ok(Math.abs(strokes[1].dashOffset!-.1)<1e-10);assert.equal(strokes[2].dashOffset,14);
 assert.deepEqual(doc,before);
});

test('source spans retain material direction and reject geometry outside the identified source',()=>{
 const source=segment(100);
 assert.deepEqual(creaseLineSourceSpan(source,[60,10],[10,10],2),{span:{length:200,offset:0},reverse:true});
 assert.equal(creaseLineSourceSpan(source,[10,11],[60,11]),undefined);
 assert.equal(creaseLineSourceSpan(source,[0,10],[60,10]),undefined);
 assert.equal(creaseLineSourceSpan(source,[10,10],[60,10],NaN),undefined);
});

test('CP image export adapts physical short lines, keeps all coordinates and document data',()=>{
 const doc=blankDoc('short physical CP',50,50);doc.segments.push(segment(2),{...segment(2,'V'),id:'valley'});
 const before=structuredClone(doc),enabled=svg(doc,true),disabled=svg(doc,false),m=enabled.line.at(-2),v=enabled.line.at(-1);
 assert.equal(enabled['@_viewBox'],disabled['@_viewBox']);assert.equal(enabled['@_width'],'50mm');
 for(let i=0;i<doc.segments.length;i++)for(const attr of ['x1','y1','x2','y2'])assert.equal(enabled.line[i]['@_'+attr],disabled.line[i]['@_'+attr]);
 assert.notEqual(m['@_stroke-dasharray'],disabled.line.at(-2)['@_stroke-dasharray']);
 assert.equal(pattern(m['@_stroke-dasharray'])!.length,4);assert.equal(pattern(v['@_stroke-dasharray'])!.length,2);
 assert.ok(m['@_stroke-dashoffset']!==undefined);assert.deepEqual(doc,before);
});

test('CP export explicit stroke units allow magnification to recover detail without a camera or new CP flag',()=>{
 const doc=blankDoc();doc.segments.push(segment(2));
 const ordinary=svg(doc,true),magnified=svg(doc,true,DISPLAY_PIXEL_MM/10);
 assert.notEqual(ordinary.line.at(-1)['@_stroke-dasharray'],magnified.line.at(-1)['@_stroke-dasharray']);
 assert.equal(Number(magnified.line.at(-1)['@_stroke-width']),defaultCreaseDisplay().lineWidth*DISPLAY_PIXEL_MM/10);
 assert.equal(magnified['@_viewBox'],ordinary['@_viewBox']);assert.equal(Object.hasOwn(doc,'adaptiveLineStyle'),false);
 for(const units of [0,-1,NaN,Infinity])assert.throws(()=>svg(doc,true,units),/线型显示参数/);
 assert.equal(previewOrieditaDisplay({adaptiveLineStyle:false},defaultCreaseDisplay()).settings?.lineStyle,'WORKBENCH');
 assert.deepEqual(previewOrieditaDisplay({adaptiveLineStyle:false},defaultCreaseDisplay()).ignored,['adaptiveLineStyle']);
 assert.equal(ADAPTIVE_LINE_STYLE_KEY,'zhezhi.adaptive-line-style.v1');
});
