import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLValidator} from 'fast-xml-parser';
import {foldedModelComparisonSVG} from '../../src/app/foldedModelComparisonSVG';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {defaultModelView} from '../../src/app/modelViewState';
import {modelShadowBoundaries} from '../../src/app/modelShadowBoundaries';
import type {FlatFoldResult} from '../../src/core/types';
function model():FlatFoldResult{return {geometry:{status:'ready',message:'',vertices:[[0,0],[100,0],[100,100],[0,100],[50,0],[150,0],[150,100],[50,100]],faces:[[0,1,2,3],[4,5,6,7]]},layers:{status:'solved',message:'ok',faceOrder:[0,1],faceOrders:[[0,1,1]]},warnings:[]};}
const embedded=(svg:string)=>[...svg.matchAll(/href="data:image\/svg\+xml;charset=utf-8,([^"]+)"/g)].map(m=>decodeURIComponent(m[1]));
test('legacy single view exports unchanged full model without camera cropping',()=>{
 const result=model(),view=defaultModelView();
 assert.equal(foldedModelComparisonSVG(result,'单图',view),foldedModelSVG(result,{name:'单图',side:'front',rotation:0,xray:false}));
 view.cameras['front-solid']={rotation:0,x:999,y:999,width:2,height:2};
 assert.equal(foldedModelComparisonSVG(result,'单图',view),foldedModelSVG(result,{name:'单图',side:'front',rotation:0,xray:false}));
});
test('four-view sheet embeds isolated SVGs with per-side gradients and two X ray panes',()=>{
 const result=model(),before=structuredClone(result),rotation=22.5,view={...defaultModelView(),layout:'four' as const,rotation,shadows:true};
 const svg=foldedModelComparisonSVG(result,'名称<&"',view,{'front-solid':modelShadowBoundaries(result,'front',rotation),'back-solid':modelShadowBoundaries(result,'back',rotation)}),parts=embedded(svg);
 assert.equal(XMLValidator.validate(svg),true);assert.equal(parts.length,4);assert.match(svg,/width="2048" height="1640"/);
 for(const [index,part] of parts.entries()){
  assert.equal(XMLValidator.validate(part),true);assert.ok(part.includes('名称&lt;&amp;&quot;'));
  assert.equal(part.includes('linearGradient'),index<2);assert.equal(part.includes('X 光显示'),index>=2);
  assert.ok(part.includes(index%2===0?'正面':'背面'));
 }
 assert.deepEqual(result,before);
});
test('both-view sheet follows X ray preference and needs no shadow jobs for transparent panes',()=>{
 const svg=foldedModelComparisonSVG(model(),'双图',{...defaultModelView(),layout:'both',xray:true,shadows:true}),parts=embedded(svg);
 assert.equal(parts.length,2);assert.match(svg,/width="2048" height="820"/);assert.ok(parts.every(p=>p.includes('X 光显示')&&!p.includes('linearGradient')));
});
test('comparison export rejects missing solid shadows, but unverified layers remain transparent',()=>{
 const result=model(),view={...defaultModelView(),layout:'four' as const,shadows:true};
 assert.throws(()=>foldedModelComparisonSVG(result,'未完成',view),/阴影/);
 assert.throws(()=>foldedModelComparisonSVG(result,'缺背面',view,{'front-solid':modelShadowBoundaries(result,'front')}),/背面/);
 result.layers.status='unknown';assert.equal(embedded(foldedModelComparisonSVG(result,'未知',view)).length,4);
});
