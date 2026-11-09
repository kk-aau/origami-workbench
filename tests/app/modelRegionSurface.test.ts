import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {XMLParser} from 'fast-xml-parser';
import ModelRegionSurface from '../../src/components/ModelRegionSurface';
import {modelRegionStatus} from '../../src/components/useModelRegions';
import type {FlatFoldResult} from '../../src/core/types';
import type {ModelLayerRegion} from '../../src/app/modelRegionLayers';
import {modelProjection} from '../../src/app/modelProjection';
import {modelRegionSVG} from '../../src/app/modelRegionSVG';
const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:[[0,0],[10,0],[10,10],[0,10]],faces:[[0,1,2,3],[3,2,1,0]]},layers:{status:'solved',message:''},warnings:[]};
const polygon=result.geometry.vertices;
const regions:ModelLayerRegion[]=[{polygon,faces:[0,1],area:100,layers:{status:'ordered',topToBottom:[0,1]}},{polygon,faces:[0,1],area:100,layers:{status:'unconfirmed',message:'缺关系'}},{polygon,faces:[0,1],area:100,layers:{status:'conflict',message:'循环'}}];
const props={result,regions,side:'front' as const,rotation:0,colors:{front:'#112233',back:'#445566',line:'#778899'},face:null,onSelect:()=>{},interactive:true};
test('region surface renders top material and separates unknown/conflict with non-selectable patterns',()=>{
 const svg=renderToStaticMarkup(createElement(ModelRegionSurface,props)),parsed=new XMLParser({ignoreAttributes:false}).parse(svg).g;
 assert.equal(parsed.polygon[0]['@_fill'],'#112233');assert.equal(parsed.polygon[0]['@_data-region-top'],'0');assert.equal(parsed.polygon[0]['@_tabindex'],'0');
 assert.match(parsed.polygon[1]['@_fill'],/unknown/);assert.match(parsed.polygon[2]['@_fill'],/conflict/);for(const p of parsed.polygon.slice(1)){assert.equal(p['@_role'],'img');assert.equal(p['@_tabindex'],'-1');assert.equal(p['@_data-region-top'],undefined);}
 assert.equal(parsed.defs.pattern.length,2);
 assert.equal(parsed.path.length,3);for(const p of parsed.path){assert.equal(p['@_fill-rule'],'nonzero');assert.equal(p['@_pointer-events'],'none');}
 for(const p of parsed.polygon)assert.equal(p['@_fill-opacity'],'0','cells must only be hit targets, never independently antialiased fills');
});
test('back and rotated regions project the original cells and use back material without mutation',()=>{
 const before=structuredClone(regions),svg=renderToStaticMarkup(createElement(ModelRegionSurface,{...props,side:'back',rotation:22.5,interactive:false})),parsed=new XMLParser({ignoreAttributes:false}).parse(svg).g;
 assert.equal(parsed.polygon[0]['@_fill'],'#445566');assert.equal(parsed.polygon[0]['@_tabindex'],'-1');assert.equal(parsed.polygon[0]['@_points'],polygon.map(p=>modelProjection(result.geometry.vertices,true,22.5).project(p).join(',')).join(' '));assert.deepEqual(regions,before);
});
test('region status reports partial certainty, omitted regions and worker failure honestly',()=>{
 assert.match(modelRegionStatus(null),/正在/);assert.match(modelRegionStatus({status:'timeout',message:'超时'}),/超时/);
 const status=modelRegionStatus({status:'complete',analysis:{cells:regions,maxDepth:2,epsilon:1e-8,omittedThinRegions:1},regions});
 assert.match(status,/1 已确认 \/ 1 未确认 \/ 1 冲突/);assert.match(status,/细小区域/);assert.match(status,/纸面未完整确认/);assert.match(status,/保留线框/);assert.doesNotMatch(status,/局部阴影/);
 assert.match(modelRegionStatus({status:'complete',analysis:{cells:regions,maxDepth:2,epsilon:1e-8,omittedThinRegions:0},regions},true),/局部阴影结果缺失/);
});

test('screen and export visible lines share back rotation, color and pointer transparency',()=>{
 const boundaries={edges:[{a:[0,0] as [number,number],b:[10,0] as [number,number],leftRegion:0,rightRegion:null}],ambiguousEdges:2};
 const screen=new XMLParser({ignoreAttributes:false}).parse(renderToStaticMarkup(createElement(ModelRegionSurface,{...props,side:'back',rotation:22.5,boundaries}))).g.line;
 const exported=new XMLParser({ignoreAttributes:false}).parse(modelRegionSVG(result,{regions,boundaries,omittedThinRegions:0},'back',22.5,props.colors)).g.line;
 assert.deepEqual(screen,exported);assert.equal(screen['@_stroke'],'#778899');assert.equal(screen['@_pointer-events'],'none');
 assert.match(modelRegionStatus({status:'complete',analysis:{cells:regions,maxDepth:2,epsilon:1e-8,omittedThinRegions:0},regions,boundaries}),/2 段边界的可见性待确认/);
});
