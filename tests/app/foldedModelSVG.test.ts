import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc,exampleDoc} from '../../src/app/state';
import {flatPresentation} from '../../src/app/flatPresentation';

const parse=(text:string)=>new XMLParser({ignoreAttributes:false}).parse(text).svg;
test('model SVG exports real face order, coordinates and side colors, without mutating result',()=>{
  const result=computeFlatFold(exampleDoc()),before=structuredClone(result);
  for(const side of ['front','back'] as const){
    const svg=foldedModelSVG(result,{name:'作品',side}),parsed=parse(svg),display=flatPresentation(result,side);
    assert.equal(XMLValidator.validate(svg),true);
    const polygons=parsed.svg.polygon;assert.deepEqual(polygons.map((p:any)=>Number(p['@_data-face-id'])),display.order);
    polygons.forEach((p:any)=>{const i=Number(p['@_data-face-id']);assert.equal(p['@_points'],result.geometry.faces[i].map(v=>display.vertices[v].join(',')).join(' '));assert.equal(p['@_fill'],display.frontMaterial[i]?'#c5dac2':'#f3e6ce');assert.equal(p['@_fill-opacity'],'1');});
  }
  assert.deepEqual(result,before);
});
test('unknown solid layers export wire geometry; translucency requires explicit xray',()=>{
  const result=computeFlatFold(exampleDoc());result.layers={status:'timeout',message:'超时'};
  const text=foldedModelSVG(result,{name:'超时结果',side:'front'});
  assert.ok(text.includes('层序未确认'));assert.ok(text.includes('<line data-edge-id='));assert.ok(!text.includes('<polygon '));
  const solved=computeFlatFold(exampleDoc());assert.ok(foldedModelSVG(solved,{name:'透视',side:'back',xray:true}).includes('fill-opacity="0.25"'));
});
test('names and engine messages cannot introduce executable SVG elements',()=>{
  const result=computeFlatFold(blankDoc());result.layers.message='<script>alert(1)</script>&';
  const text=foldedModelSVG(result,{name:'<image onload="bad">&\u0000',side:'front'});
  assert.equal(XMLValidator.validate(text),true);assert.ok(!text.includes('<script>'));assert.ok(!text.includes('<image '));assert.ok(!text.includes('\u0000'));assert.ok(text.includes('&lt;image'));
});
test('different real candidates produce distinct paint order but identical face geometry',()=>{
  const doc=blankDoc('五联',100,100);for(let i=1;i<5;i++)doc.segments.push({id:String(i),a:[i*20,0],b:[i*20,100],assignment:'V',angle:180});
  const results=[0,1,2,3].map(solutionIndex=>computeFlatFold(doc,undefined,{solutionIndex}));
  const polygons=results.map(r=>parse(foldedModelSVG(r,{name:'候选',side:'front'})).svg.polygon);
  assert.equal(new Set(polygons.map(ps=>ps.map((p:any)=>p['@_data-face-id']).join(','))).size,4);
  assert.deepEqual(results[0].geometry.vertices,results[3].geometry.vertices);
});
test('missing or invalid model is refused and manual edits remain qualified',()=>{
  const result=computeFlatFold(blankDoc());result.geometry.modified=true;
  assert.ok(foldedModelSVG(result,{name:'编辑',side:'front'}).includes('手工修改的结果几何'));
  result.geometry.vertices[0][0]=Infinity;assert.throws(()=>foldedModelSVG(result,{name:'坏数据',side:'front'}),/坐标/);
  result.geometry.vertices=[];assert.throws(()=>foldedModelSVG(result,{name:'空',side:'front'}),/完整模型/);
});
