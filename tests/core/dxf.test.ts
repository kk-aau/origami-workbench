import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportDXF,DXF_LAYERS} from '../../src/core/dxf';
import {blankDoc} from '../../src/app/state';
import {defaultAngle,type Assignment} from '../../src/core/types';

function records(text:string){const lines=text.trimEnd().split('\r\n'),result:Record<string,string>[]=[];let item:Record<string,string>={};for(let i=0;i<lines.length;i+=2){if(lines[i]==='0'){item={};result.push(item);}item[lines[i]]=lines[i+1];}return result;}
test('DXF writes all assignments as typed LINE entities and declares their layers',()=>{
  const doc=blankDoc('DXF',100,100);doc.segments=(Object.keys(DXF_LAYERS) as Assignment[]).map((assignment,i)=>({id:String(i),a:[-10+i,20],b:[30,40+i],assignment,angle:defaultAngle(assignment)}));const before=structuredClone(doc),out=exportDXF(doc),data=records(out.text),lines=data.filter(r=>r['0']==='LINE');
  assert.equal(lines.length,6);doc.segments.forEach((s,i)=>{assert.equal(lines[i]['8'],DXF_LAYERS[s.assignment].name);assert.equal(lines[i]['62'],String(DXF_LAYERS[s.assignment].color));assert.equal(Number(lines[i]['10']),s.a[0]);assert.equal(Number(lines[i]['20']),-s.a[1]);assert.equal(Number(lines[i]['11']),s.b[0]);assert.equal(Number(lines[i]['21']),-s.b[1]);assert.equal(lines[i]['30'],'0');assert.equal(lines[i]['31'],'0');});
  assert.equal(data.filter(r=>r['0']==='LAYER').length,7);assert.ok(out.text.includes('AC1009'));assert.ok(out.text.endsWith('0\r\nEOF\r\n'));assert.deepEqual(doc,before);
});
test('DXF preserves millimetre distances and fractional/off-origin coordinates without integer rounding',()=>{
  const doc=blankDoc('小数',100,100);doc.segments=[{id:'x',a:[-123.456789,0],b:[0.000001,-0.000002],assignment:'M',angle:-45}];const out=exportDXF(doc),line=records(out.text).find(r=>r['0']==='LINE')!;
  assert.equal(line['10'],'-123.456789');assert.equal(line['20'],'0');assert.equal(Number(line['11']),.000001);assert.equal(Number(line['21']),.000002);assert.equal(Math.hypot(Number(line['11'])-Number(line['10']),Number(line['21'])-Number(line['20'])),Math.hypot(123.456790,.000002));assert.ok(out.warnings.some(w=>w.includes('目标折角')));
});
test('DXF loss warnings are explicit and invalid geometry is rejected',()=>{
  const doc=blankDoc('x',100,100);doc.objects=[{id:'circle',kind:'circle',center:[50,50],radius:10,color:'#123456'}];doc.segments[0].displayColor='#123456';const out=exportDXF(doc);assert.ok(out.warnings.some(w=>w.includes('1 个圆')));assert.ok(out.warnings.some(w=>w.includes('自定义')));assert.equal(records(out.text).filter(r=>r['0']==='CIRCLE').length,0);
  doc.segments[0].a[0]=NaN;assert.throws(()=>exportDXF(doc));
});
