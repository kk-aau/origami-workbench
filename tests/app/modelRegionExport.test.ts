import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {computeFlatFold} from '../../src/core/flatFold';
import {exampleDoc} from '../../src/app/state';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {modelRegionShadows} from '../../src/app/modelRegionShadows';
import {modelProjection} from '../../src/app/modelProjection';
import {flatPresentation,type FlatSide} from '../../src/app/flatPresentation';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {modelRegionSVG} from '../../src/app/modelRegionSVG';
import {defaultModelColors} from '../../src/app/modelColors';
import {startModelComparisonExport} from '../../src/app/modelComparisonExportTask';
import {defaultModelView} from '../../src/app/modelViewState';
import type {startModelOverlapAnalysis,ModelOverlapReply} from '../../src/app/modelOverlapTask';
const parse=(s:string)=>new XMLParser({ignoreAttributes:false}).parse(s).svg;
function model(){const r=computeFlatFold(exampleDoc());assert.equal(r.layers.status,'solved');delete r.layers.faceOrder;return r;}
const analyze:typeof startModelOverlapAnalysis=(r,_budget,side)=>{const analysis=modelOverlapRegions(r),regions=modelRegionLayers(r,analysis,side!);return {promise:Promise.resolve({status:'complete',analysis,regions,boundaries:modelRegionBoundaries(r,regions)}),cancel(){}};};
test('local shadow export requires complete analysis and respects the saved shadow switch',async()=>{
 const r=model(),view={...defaultModelView(),shadows:true};
 const missing=await startModelComparisonExport(r,'缺失',view,1000,undefined,'full',analyze).promise;assert.equal(missing.status,'error');assert.ok(!('svg'in missing));
 const complete:typeof startModelOverlapAnalysis=(source,_budget,side)=>{const analysis=modelOverlapRegions(source),regions=modelRegionLayers(source,analysis,side!),boundaries=modelRegionBoundaries(source,regions);return {promise:Promise.resolve({status:'complete',analysis,regions,boundaries,shadows:modelRegionShadows(regions,boundaries)}),cancel(){}};};
 const task=startModelComparisonExport(r,'完整',view,1000,undefined,'full',complete);view.shadows=false;const reply=await task.promise;assert.equal(reply.status,'complete');if(reply.status==='complete')assert.match(reply.svg,/局部阴影 0 处/);
 const off=await startModelComparisonExport(r,'关闭',view,1000,undefined,'full',complete).promise;assert.equal(off.status,'complete');if(off.status==='complete')assert.match(off.svg,/不含局部阴影/);
});
test('local SVG projects exact region polygons and front/back materials without invented whole-face order',()=>{
 const result=model(),before=structuredClone(result),analysis=modelOverlapRegions(result);
 for(const side of ['front','back'] as FlatSide[]){
  const regions=modelRegionLayers(result,analysis,side),display=flatPresentation(result,side,22.5),projection=modelProjection(result.geometry.vertices,side==='back',22.5);
  const svg=foldedModelSVG(result,{name:'局部',side,rotation:22.5,regions:{regions,boundaries:modelRegionBoundaries(result,regions),omittedThinRegions:analysis.omittedThinRegions}});
  assert.equal(XMLValidator.validate(svg),true);const group=parse(svg).svg.g,paths=[group.path].flat();assert.equal(group['@_data-model-region-surface'],'true');assert.ok(paths.length<=2);
  const covered:number[]=[];
  paths.forEach((p:any)=>{assert.equal(p['@_fill-rule'],'nonzero');const indices=String(p['@_data-region-indices']).split(' ').map(Number);covered.push(...indices);const subpaths=p['@_d'].match(/M[^Z]+Z/g),expected=indices.flatMap(i=>regions[i].polygon.map(p=>projection.project(p)));
   for(const path of subpaths)for(const pair of path.slice(1,-1).split('L')){const point=pair.split(',').map(Number);assert.ok(expected.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-7),'outline preserves projected region boundary coordinates');}
   indices.forEach((i:number)=>{const region=regions[i];assert.equal(region.layers.status,'ordered');if(region.layers.status==='ordered')assert.equal(p['@_fill'],display.frontMaterial[region.layers.topToBottom[0]]?'#c5dac2':'#f3e6ce');});
  });
  assert.deepEqual(covered.sort((a,b)=>a-b),regions.map((_,i)=>i));
  assert.match(svg,/不含局部阴影/);assert.doesNotMatch(svg,/无统一绘制顺序，半透明预览/);
 }
 assert.deepEqual(result,before);
});
test('unknown and conflicting cells remain available for diagnostics but never publish partial paper exports',()=>{
 const r=model(),analysis=modelOverlapRegions(r),regions=modelRegionLayers(r,analysis,'front');
 for(const status of ['unconfirmed','conflict'] as const){
  regions[0].layers={status,message:'test'};
  const data={regions,boundaries:modelRegionBoundaries(r,regions),omittedThinRegions:2},svg=foldedModelSVG(r,{name:'未确认',side:'front',regions:data});
  assert.match(svg,/局部遮挡未就绪/);assert.match(svg,/data-edge-id=/);assert.doesNotMatch(svg,/data-model-region-surface/);
  const diagnostic=modelRegionSVG(r,data,'front',0,defaultModelColors());
  assert.match(diagnostic,new RegExp(`data-region-status="${status}"`));assert.match(diagnostic,new RegExp(`fill="url\\(#model-region-${status==='conflict'?'conflict':'unknown'}\\)"`));
  for(const opts of [{xray:true},{displayStyle:'wire' as const}])assert.doesNotMatch(foldedModelSVG(r,{name:'透明',side:'front',regions:data,...opts}),/data-model-region-surface/);
 }
 regions[0].polygon[0][0]=NaN;assert.throws(()=>modelRegionSVG(r,{regions,boundaries:{edges:[],ambiguousEdges:0},omittedThinRegions:0},'front',0,defaultModelColors()),/几何/);
});
test('comparison and camera exports compute only solid regions from frozen input and isolate embedded IDs',async()=>{
 const r=model(),before=structuredClone(r),view={...defaultModelView(),layout:'four' as const,rotation:22.5},sides:FlatSide[]=[];
 const task=startModelComparisonExport(r,'冻结',view,1200,()=>{throw Error('must not invent shadows');},'camera',(source,budget,side)=>{assert.deepEqual(source,before);assert.equal(budget,1200);sides.push(side!);return analyze(source,budget,side);});
 r.geometry.vertices[0][0]=999;view.rotation=180;const reply=await task.promise;assert.equal(reply.status,'complete');assert.deepEqual(sides,['front','back']);
 if(reply.status==='complete'){const images=parse(reply.svg).image;assert.equal(images.length,4);images.forEach((im:any,i:number)=>{const svg=decodeURIComponent(im['@_href'].split(',')[1]);assert.equal(svg.includes('data-model-region-surface'),String(im['@_data-pane']).endsWith('-solid'));assert.match(svg,/model-camera-clip/);assert.equal(XMLValidator.validate(svg),true);});}
});
test('region export cancellation, timeout and incomplete replies never publish partial images',async()=>{
 const r=model(),view={...defaultModelView(),layout:'four' as const};let resolve!:(r:ModelOverlapReply)=>void,entered!:()=>void,cancelled=0;
 const started=new Promise<void>(r=>entered=r),task=startModelComparisonExport(r,'取消',view,1200,undefined,'full',()=>{entered();return {promise:new Promise<ModelOverlapReply>(r=>resolve=r),cancel(){cancelled++;resolve({status:'cancelled',message:'cancel'});}};});
 await started;task.cancel();assert.equal((await task.promise).status,'cancelled');assert.equal(cancelled,1);
 const analysis=modelOverlapRegions(r);
 for(const answer of [{status:'timeout',message:'test'} as const,{status:'complete',analysis} as const,{status:'complete',analysis,regions:modelRegionLayers(r,analysis,'front')} as const]){const reply=await startModelComparisonExport(r,'失败',view,1200,undefined,'full',()=>({promise:Promise.resolve(answer),cancel(){}})).promise;assert.equal(reply.status,answer.status==='timeout'?'timeout':'error');assert.ok(!('svg'in reply));}
});
