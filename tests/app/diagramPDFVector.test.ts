import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {embedDiagramPDFSVG,diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {createDiagramProject,duplicateDiagramStep} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';

test('panel-local masks, clips and patterns cannot bind to another step',()=>{
  const svg='<svg viewBox="0 0 100 100"><defs><mask id="cut"><circle cx="50" cy="50" r="20" fill="white"/></mask></defs><g mask="url(#cut)" data-owner-id="cut"><path d="M0 0H100V100Z"/></g></svg>',box={x:0,y:0,width:100,height:100};
  const combined=`<svg>${embedDiagramPDFSVG(svg,box,'first-')}${embedDiagramPDFSVG(svg,{...box,x:120},'second-')}</svg>`;
  assert.equal(XMLValidator.validate(combined),true);
  const ids=[...combined.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,2);
  const refs=[...combined.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);assert.deepEqual(refs,ids);
  assert.equal((combined.match(/data-owner-id="cut"/g)??[]).length,2);
});

test('vector pages keep Chinese captions as escaped text and paper as geometry',()=>{
  let p=createDiagramProject(blankDoc('中文 <作品> & 测试',100,100));p=duplicateDiagramStep(p,p.activeStepId);
  p.steps[0].description='纸面 <script>不可执行</script> & 保留中文';
  const options={...defaultDiagramPDFOptions(p),cover:'none' as const},plan=planDiagramPDF(p,options),before=structuredClone(p);
  const svg=diagramPDFPageSVG(p,options,plan,0,defaultDiagramLineDefaults(),true);
  assert.equal(XMLValidator.validate(svg),true);assert.doesNotMatch(svg,/<script|<image/);
  assert.match(svg,/<line|<path/);assert.match(svg,/&lt;script&gt;不可执行&lt;\/script&gt;/);
  assert.match(svg,/待计算折图/);
  const parsed=new XMLParser().parse(svg);assert.ok(parsed.svg);assert.deepEqual(p,before);
});

test('custom cover CP replaces only the cover vector, preserving project states',()=>{
 const p=createDiagramProject(blankDoc('project',100,100)),before=structuredClone(p),custom=blankDoc('chosen',123,45);
 const options={...defaultDiagramPDFOptions(p),cover:'standard' as const,coverImage:'none' as const,coverCPDoc:custom,coverCPLabel:'CP · file <x>'};
 const plan=planDiagramPDF(p,options),svg=diagramPDFPageSVG(p,options,plan,0,defaultDiagramLineDefaults(),false);
 assert.equal(XMLValidator.validate(svg),true);assert(svg.includes('CP · file &lt;x&gt;'));assert.notEqual(svg,diagramPDFPageSVG(p,{...options,coverCPDoc:undefined},plan,0,defaultDiagramLineDefaults(),false));assert.deepEqual(p,before);
});
