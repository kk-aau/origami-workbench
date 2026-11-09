import {test} from 'node:test';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {defaultCreaseDisplay} from '../../src/app/creaseDisplay';
import {creasePatternSVG} from '../../src/app/creasePatternSVG';
import {completeCreasePatternSVG,cpPrintPageSVG,cpPrintHTML,cpPrintSize} from '../../src/app/creasePatternExport';
import {createDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
const parser=new XMLParser({ignoreAttributes:false});
test('whole CP export retains boundary pen widths and vertex markers at every edge',()=>{
 const doc=blankDoc('whole',300,300),display={...defaultCreaseDisplay(),lineWidth:20,pointSize:20};
 const before=structuredClone(doc),svg=parser.parse(completeCreasePatternSVG(doc,display)).svg;
 const [x,y,w,h]=svg['@_viewBox'].split(' ').map(Number),radius=20*25.4/96;
 assert(x< -radius&&y< -radius&&x+w>300+radius&&y+h>300+radius);
 assert.equal(svg['@_width'],`${w}mm`);assert.deepEqual(doc,before);
 const crop={x:15,y:25,width:80,height:90};assert.equal(completeCreasePatternSVG(doc,display,crop),creasePatternSVG(doc,display,crop));
});
test('offset and extreme-aspect CP fits completely inside each allocated printable area',()=>{
 for(const [width,height,x,y] of [[300,300,0,0],[1200,20,-600,-50],[15,1200,450,-600]]){
  const doc=blankDoc('offset',width,height);for(const line of doc.segments)for(const p of [line.a,line.b]){p[0]+=x;p[1]+=y;}
  const artwork=completeCreasePatternSVG(doc,defaultCreaseDisplay());
  for(const paper of ['A4','A3'] as const)for(const orientation of ['portrait','landscape'] as const){
   const root=parser.parse(cpPrintPageSVG(artwork,{paper,orientation})).svg,inner=root.svg;
   const [sx,sy,sw,sh]=inner['@_viewBox'].split(' ').map(Number),bw=Number(inner['@_width']),bh=Number(inner['@_height']),scale=Math.min(bw/sw,bh/sh);
   assert.equal(inner['@_preserveAspectRatio'],'xMidYMid meet');assert(sw*scale<=bw+1e-8&&sh*scale<=bh+1e-8);
   assert(sx<x&&sy<y&&sx+sw>x+width&&sy+sh>y+height);
   const size=cpPrintSize({paper,orientation});assert.equal(Number(root['@_width']),size.width*72/25.4);
   assert(Math.abs(Number(inner['@_x'])-10*72/25.4)<1e-8);
  }
 }
});
test('cover and unfurled step CP use allocated boxes with complete bounds',()=>{
 const project=createDiagramProject(blankDoc('large',900,300)),options={...defaultDiagramPDFOptions(project),cover:'diagram' as const};
 const plan=planDiagramPDF(project,options),svg=diagramPDFPageSVG(project,options,plan,0,defaultDiagramLineDefaults(),true),nested=parser.parse(svg).svg.svg;
 const rows=Array.isArray(nested)?nested:[nested];assert(rows.length>=2);
 for(const item of rows){assert.equal(item['@_preserveAspectRatio'],'xMidYMid meet');const [x,y,w,h]=item['@_viewBox'].split(' ').map(Number);assert(x<0&&y<0&&x+w>900&&y+h>300);}
});
test('browser and native print include a real A4 page and explicit fit instead of original mm oversize',()=>{
 const html=cpPrintHTML(completeCreasePatternSVG(blankDoc('large',300,300),defaultCreaseDisplay()));
 assert.match(html,/@page\{size:A4;margin:0\}/);assert.match(html,/width:210mm;height:297mm/);assert.match(html,/preserveAspectRatio="xMidYMid meet"/);
 assert.throws(()=>cpPrintPageSVG('<svg viewBox="0 0 0 300"></svg>'),/范围无效/);
});
