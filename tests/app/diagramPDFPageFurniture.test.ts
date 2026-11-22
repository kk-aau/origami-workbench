import assert from 'node:assert/strict';
import test from 'node:test';
import {XMLParser} from 'fast-xml-parser';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,duplicateDiagramStep,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {defaultDiagramPDFOptions,PDF_PT_PER_MM,planDiagramPDF,type DiagramPDFOptions,type PDFPageFurniture} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';

function fixture(){
  let project=createDiagramProject(blankDoc('纸船原稿',100,100));
  while(project.steps.length<3)project=duplicateDiagramStep(project,project.activeStepId);
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),layout:'1x1',introLayout:'1x1',cover:'standard',
    title:'纸船图解',author:'制图人',designer:'设计人'};
  return {project,options};
}

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseTagValue:false});
function svgText(svg:string){
  return Array.from(svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g),([match])=>{
    const element=parser.parse(match).text;
    return {value:String(element['#text']),x:Number(element.x),y:Number(element.y),
      size:Number(element['font-size']),anchor:(element['text-anchor']??'start') as string};
  });
}
function near(actual:number,wanted:number){assert.ok(Math.abs(actual-wanted)<1e-7,`expected ${wanted}, received ${actual}`);}

function render(project:ReturnType<typeof fixture>['project'],options:DiagramPDFOptions){
  const plan=planDiagramPDF(project,options);
  return {plan,page:(index:number)=>svgText(diagramPDFPageSVG(project,options,plan,index,defaultDiagramLineDefaults(),true))};
}
const doubleSided:PDFPageFurniture={
  differentOddEven:true,
  common:{header:{alignment:'center',text:'共用页眉'},footer:{alignment:'center',text:'共用页脚'}},
  odd:{header:{alignment:'left',text:'奇数页眉',showTitle:true,offsetMm:12},footer:{alignment:'right',showPageNumber:true,showDesigner:true,text:'奇数页脚',offsetMm:18}},
  even:{header:{alignment:'right',showAuthor:true,text:'偶数页眉',offsetMm:21},footer:{alignment:'left',text:'偶数页脚',offsetMm:5}},
};

test('legacy files keep their original body header and centred three-digit folios',()=>{
  const {project,options}=fixture();
  const before=exportDiagramProject(project),restored=importDiagramProject(before);
  const {plan,page}=render(restored,{...options,cover:'none'});
  for(const index of [0,1]){
    const items=page(index),header=items.find(t=>t.value===options.title),footer=items.find(t=>t.value===(index===0?'001':'002'));
    assert.ok(header&&footer);assert.equal(header.anchor,'start');near(header.x,plan.margin);near(header.y,plan.margin-4);
    assert.equal(footer.anchor,'middle');near(footer.x,plan.width/2);near(footer.y,plan.height-plan.margin+11);
  }
  const oldDisabled=render(project,{...options,cover:'none',pageNumbers:false,runningTitle:false,runningText:'旧文件抬头'}).page(0);
  assert.ok(oldDisabled.some(t=>t.value==='旧文件抬头'));assert.ok(!oldDisabled.some(t=>t.value==='001'||t.value===options.title));
});

test('odd and even SVG text uses the physical PDF folio including the cover, with independent edges and alignments',()=>{
  const {project,options}=fixture();
  for(const cover of ['standard','diagram','none'] as const){
    const {plan,page}=render(project,{...options,cover,pageNumbers:false,pageFurniture:doubleSided});
    for(let index=0;index<plan.pages.length;index++){
      const odd=index%2===0,items=page(index),folio=String(index+1).padStart(3,'0');
      const head=items.find(t=>t.value.includes(odd?'奇数页眉':'偶数页眉'));
      if(cover!=='none'&&index===0)assert.equal(head,undefined,'the illustrated first page has cover typography');
      else{
        assert.ok(head);assert.ok(head.value.includes(odd?options.title:options.author));
        assert.equal(head.anchor,odd?'start':'end');near(head.x,odd?plan.margin:plan.width-plan.margin);
        near(head.y,(odd?12:21)*PDF_PT_PER_MM);
      }
      const foot=items.find(t=>t.value.includes(odd?'奇数页脚':'偶数页脚'));assert.ok(foot);
      assert.equal(foot.value.includes(folio),odd);assert.equal(foot.value.includes(options.designer!),odd);
      assert.equal(foot.anchor,odd?'end':'start');near(foot.x,odd?plan.width-plan.margin:plan.margin);
      near(foot.y+foot.size,plan.height-(odd?18:5)*PDF_PT_PER_MM);
      assert.ok(!items.some(t=>t.value.includes('共用页')));
    }
  }
});

test('shared, odd and even PDF settings survive saving, reopening and switching back to shared layout',()=>{
  const {project,options}=fixture();
  const saved=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{pageFurniture:structuredClone(doubleSided)}}}));
  const settings=saved.exportSettings!.pdf!.pageFurniture!;
  assert.deepEqual(settings,doubleSided);
  const common=render(saved,{...options,pageFurniture:{...settings,differentOddEven:false},cover:'none'});
  for(const index of [0,1]){
    const items=common.page(index);
    for(const title of ['共用页眉','共用页脚']){
      const label=items.find(t=>t.value===title);assert.ok(label);assert.equal(label.anchor,'middle');near(label.x,common.plan.width/2);
    }
    assert.ok(!items.some(t=>/[奇偶]数页[眉脚]/.test(t.value)));
  }
  const inherited=render(saved,{...options,cover:'none',pageFurniture:{...settings,even:undefined}});
  assert.ok(inherited.page(0).some(t=>t.value.includes('奇数页脚')));
  assert.ok(inherited.page(1).some(t=>t.value==='共用页脚'));
});

test('wrapped margin content at the maximum inset does not cover step cells on either side of a spread',()=>{
  const {project,options}=fixture(),header='眉'.repeat(155),footer='脚'.repeat(155);
  const {plan,page}=render(project,{...options,cover:'none',pageFurniture:{...doubleSided,odd:{
    header:{alignment:'right',text:header,offsetMm:40},footer:{alignment:'center',text:footer,offsetMm:40},
  }}});
  for(const i of [0,2]){
    const items=page(i),heads=items.filter(t=>/^眉+$/.test(t.value)),feet=items.filter(t=>/^脚+$/.test(t.value));
    assert.ok(heads.length>1&&feet.length>1);
    assert.equal(heads.map(t=>t.value).join(''),header);assert.equal(feet.map(t=>t.value).join(''),footer);
    const cell=plan.pages[i].cells[0];
    assert.ok(Math.max(...heads.map(t=>t.y+t.size))<=cell.y);
    assert.ok(cell.y+cell.height<=Math.min(...feet.map(t=>t.y)));
    near(heads[0].y,40*PDF_PT_PER_MM);near(feet.at(-1)!.y+feet.at(-1)!.size,plan.height-40*PDF_PT_PER_MM);
  }
});

test('invalid or damaged margin data is rejected on planning and project import',()=>{
  const {project,options}=fixture();
  for(const band of [{alignment:'sideways'},{alignment:'left',offsetMm:-1},{alignment:'center',offsetMm:45},{alignment:'left',text:'字'.repeat(161)}]){
    const pageFurniture={...doubleSided,even:{header:band,footer:{alignment:'right'}}};
    assert.throws(()=>planDiagramPDF(project,{...options,pageFurniture} as DiagramPDFOptions),/页眉|页脚|纸边/);
    const serialized=JSON.parse(exportDiagramProject(project));
    serialized.exportSettings={pdf:{pageFurniture}};
    assert.throws(()=>importDiagramProject(JSON.stringify(serialized)),/页眉|页脚|纸边/);
  }
});
