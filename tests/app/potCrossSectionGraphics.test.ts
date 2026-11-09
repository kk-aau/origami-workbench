import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
import {potCrossSectionReference,potCrossSectionSVG,potGraphicsView,readPotCrossSectionQuery,readPotCrossSectionResult} from '../../src/app/potCrossSectionGraphics';
import {potProfileError,readPotProfile} from '../../src/app/potProfile';
import {rectangularPotSavedParams} from '../../src/app/rectangularPotSaved';

const fixture=JSON.parse(readFileSync(new URL('../fixtures/pot-cross-section-graphics-20261010.json',import.meta.url),'utf8'));
const xml=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseAttributeValue:false});

test('all original finite point lists preserve two complete ordered Lines and input origin',()=>{
  for(const entry of fixture.cases){
    const q=readPotCrossSectionQuery(entry.query);assert.ok(q);
    const result=readPotCrossSectionResult(entry.response,q),origin=q.points[0];
    assert.deepEqual(result.data.primitives.map(p=>p.head),['Line','Line']);
    assert.deepEqual(result.data.primitives.map(p=>p.points.length),[q.points.length,q.points.length]);
    q.points.forEach(([x,y],i)=>{
      assert.deepEqual(result.data.primitives[0].points[i],[x-origin[0],y-origin[1]]);
      assert.ok(result.data.primitives[1].points[i][0]===origin[0]-x);
      assert.ok(result.data.primitives[1].points[i][1]===y-origin[1]);
    });
    assert.deepEqual(result.source.referenceOrigin,origin);
    const view=potGraphicsView(result);assert.ok(Number.isFinite(view.width)&&view.width>0&&Number.isFinite(view.height)&&view.height>0);
  }
});

test('seven original Graphics options are consumed, with unchanged unclipped export coordinates',()=>{
  const row=fixture.cases.find((c:any)=>c.name==='all-seven'),q=readPotCrossSectionQuery(row.query)!;
  const r=readPotCrossSectionResult(row.response,q),v=potGraphicsView(r),document=xml.parse(potCrossSectionSVG(r)).svg;
  assert.deepEqual(r.source.forwardedGraphicsRules.map(rule=>rule.option),Object.keys(q.graphicsOptions));
  assert.deepEqual(v.range,[[-.5,.5],[.5,1.5]]);
  assert.deepEqual(v.axes,[false,true]);assert.deepEqual(v.axesOrigin,[.1,1]);assert.equal(v.frame,true);
  assert.equal(v.aspectRatio,1);assert.deepEqual([v.width,v.height],[320,160]);
  assert.deepEqual(v.content,{x:80,y:0,width:160,height:160});assert.equal(v.background,'rgb(51,127.5,178.5)');
  assert.equal(document['@_width'],'320pt');assert.equal(document['@_height'],'160pt');
  assert.equal(document.svg['@_viewBox'],'-0.5 -1.5 1 1');assert.equal(document.svg['@_overflow'],'hidden');
  assert.equal(document.svg.g['@_transform'],'scale(1,-1)');
  assert.equal(document.svg.g.line['@_data-graphics-option'],'Axes-y');assert.equal(document.svg.g.line['@_x1'],'0.1');
  assert.equal(document.rect['@_data-graphics-option'],'Frame');
  const lines=document.svg.g.polyline;assert.equal(lines.length,2);
  lines.forEach((line:any,i:number)=>assert.equal(line['@_points'],r.data.primitives[i].points.map(p=>p.join(',')).join(' ')));
  assert.ok(lines[0]['@_points'].includes('1.7,4')); // Outside PlotRange, still exported.
  assert.equal(r.source.fullOptionsGraphicsReproduced,false);assert.equal(r.source.mathematicaDefaultRenderingReproduced,false);
});

test('singletons, repetitions and translated negative profiles keep their atoms after source JSON roundtrip',()=>{
  for(const name of ['singleton','duplicate-negative','translated-nonmonotone']){
    const row=fixture.cases.find((c:any)=>c.name===name),q=readPotCrossSectionQuery(JSON.parse(JSON.stringify(row.query)))!;
    const r=readPotCrossSectionResult(JSON.parse(JSON.stringify(row.response)),q);
    assert.equal(r.data.primitives.length,2);assert.equal(r.data.primitives[0].points.length,q.points.length);
    assert.equal(xml.parse(potCrossSectionSVG(r)).svg.svg.g.polyline.length,2);
  }
});

test('original symmetric help never edits constructor raw radii, profile points or nonprofile options',()=>{
  const parent=rectangularPotSavedParams(3489),original=structuredClone(parent);
  assert.equal(parent.crossSection[0][0],.3);
  const q=readPotCrossSectionQuery({family:'pot-cross-section-native',points:parent.crossSection})!;
  const help=potCrossSectionReference(q);assert.deepEqual(help.data.primitives[0].points[0],[0,0]);
  assert.equal(help.data.primitives[0].points[1][0],.7);
  help.query.points[0][0]=9;help.data.primitives[0].points[1][0]=-99;
  assert.deepEqual(parent,original);assert.deepEqual(readPotProfile(parent,parent.crossSection),parent);
  const freelyNegative=[[-4,9],[2,-1],[2,-1]] as [number,number][];
  assert.ok(readPotCrossSectionQuery({family:'pot-cross-section-native',points:freelyNegative}));
  assert.notEqual(potProfileError(parent,freelyNegative),'');
});

test('unsafe/unknown rules and malformed source results are strictly refused',()=>{
  const base={family:'pot-cross-section-native',points:[[0,0],[1,1]]};
  for(const bad of [{points:[]},{points:[[true,0]]},{points:[[0,Infinity]]},{points:[[0,0,0]]},
    {points:Array.from({length:513},()=>[0,0])},{sectors:5},{graphicsOptions:{Epilog:'Run[]'}},
    {graphicsOptions:{ImageSize:'Automatic'}},{graphicsOptions:{ImageSize:[320,0]}},
    {graphicsOptions:{PlotRange:[[0,1e-10],[0,1]]}},{graphicsOptions:{AxesOrigin:[0,NaN]}},
    {graphicsOptions:{Background:'url(javascript:alert(1))'}},{graphicsOptions:{Background:{RGBColor:[0,0,2]}}},
    {graphicsOptions:{AspectRatio:true}},{graphicsOptions:{Axes:[true,0]}}])assert.equal(readPotCrossSectionQuery({...base,...bad}),null);
  const q=readPotCrossSectionQuery(base)!,original=potCrossSectionReference(q);
  for(const mutate of [(r:any)=>r.data.primitives.reverse(),(r:any)=>r.data.primitives[1].points.pop(),
    (r:any)=>r.data.primitives.push(r.data.primitives[0]),(r:any)=>r.source.wolframExecuted=true,
    (r:any)=>r.data.options.Epilog='foreign',(r:any)=>r.query.points[0][0]=2]){
    const changed=structuredClone(original);mutate(changed);assert.throws(()=>readPotCrossSectionResult(changed,q));
  }
});
