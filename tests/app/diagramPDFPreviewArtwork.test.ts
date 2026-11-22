import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {appendDiagramStep,createDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {defaultDiagramPDFOptions,diagramPDFRibbonCaptionRects,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPreviewBodySVG,diagramPDFPageSVG,renderDiagramPDFPage} from '../../src/app/diagramPDFPage';
import {diagramPDFBackgroundSVG,diagramPDFRibbonSVG,diagramPDFBranchContinuations,defaultDiagramPDFRibbon} from '../../src/app/diagramPDFDecoration';
import {pdfArtworkReader} from '../../src/app/diagramPDFArtworkCache';

test('resizing reuses CP projections only for the same prepared step and material states',()=>{
  const project=createDiagramProject(blankDoc('投影',200,100)),palette=defaultDiagramLineDefaults();
  const [step]=project.steps,[before,after]=project.states;
  let calls=0;
  const compute=()=>{calls++;return [];};
  pdfArtworkReader(project,palette,true).creases(step,before,after,compute);
  pdfArtworkReader(project,palette,false).creases(step,before,after,compute);
  assert.equal(calls,1);
  pdfArtworkReader(project,palette,true).creases(step,before,{...after},compute);
  pdfArtworkReader({...project},palette,true).creases(step,before,after,compute);
  assert.equal(calls,3);
});

test('preview retains exact press artwork when page size, palette, cover CP or decoration is edited',async()=>{
  let project=createDiagramProject(blankDoc('图解',200,200));
  for(let i=0;i<4;i++)project=appendDiagramStep(project);
  project.steps[0].annotations=[{kind:'line',id:'crease',style:'crease',a:[10,10],b:[90,90],color:'#333333',width:.5}];
  const palette=defaultDiagramLineDefaults(),documentA=blankDoc('窄',90,200),documentB=blankDoc('宽',200,90);
  const first={...defaultDiagramPDFOptions(project),readingOrder:'snake' as const,ribbon:defaultDiagramPDFRibbon()};
  const seen:string[]=[];
  for(const [i,doc] of [documentA,documentB,documentA].entries()){
    const options={...first,coverCPDoc:doc,orientation:i===1?'landscape' as const:'portrait' as const,pageTextColor:i===1?'#882222':'#111111'};
    const plan=planDiagramPDF(project,options),page=plan.pages[0];
    const colors=i===1?{...palette,crease:{...palette.crease,color:'#449900',globalFields:['color' as const]}}:palette;
    const adaptive=i!==1;
    const full=diagramPDFPageSVG(project,options,plan,0,colors,adaptive);
    assert.equal(await renderDiagramPDFPage(undefined,project,options,plan,0,colors,adaptive),full);
    const body=diagramPDFPreviewBodySVG(project,options,plan,0,colors,adaptive);
    const head=diagramPDFBackgroundSVG(options,plan,0)+diagramPDFRibbonSVG(options,plan,page,0,diagramPDFRibbonCaptionRects(project,options,plan,page));
    const tail=diagramPDFBranchContinuations(options,plan,page);
    const end=body.lastIndexOf('</svg>');
    assert.equal(body.slice(0,end).replace(/^(<svg[^>]*>)/,'$1'+head)+tail+body.slice(end),full);
    seen.push(body);
  }
  assert.notEqual(seen[0],seen[1]);assert.equal(seen[0],seen[2]);
});
