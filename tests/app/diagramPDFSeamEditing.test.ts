import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon,diagramPDFPageSeams,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';
import {changeDiagramPDFSeamHeight,setDiagramPDFSeamLinked,type DiagramPDFSeamHeights} from '../../src/app/diagramPDFSeams';
import {createDiagramPDFPreviewPlanner} from '../../src/app/diagramPDFPreviewPlan';

for(const branched of [false,true]){
  test('independent inlet/outlet edits align facing pages and survive project reload: '+(branched?'branch':'linear'),()=>{
    let project=createDiagramProject(blankDoc('彩带节点',200,200));
    while(project.steps.length<17)project=appendDiagramStep(project);
    if(branched)project=addDiagramBranch(project,project.activeStepId);
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'none',layout:'2x2',readingOrder:'snake',ribbon:defaultDiagramPDFRibbon(),
      pageLayouts:{1:{snakeDirection:'vertical'}}};
    const plan=planDiagramPDF(project,options);
    const seams=diagramPDFPageSeams(options,plan,plan.pages[1]);
    const entry=seams.find(s=>s.kind==='incoming')!,exit=seams.find(s=>s.kind==='outgoing')!;
    const edited={...options,ribbonSeamHeights:changeDiagramPDFSeamHeight(changeDiagramPDFSeamHeight(undefined,entry.key,.22),exit.key,.81)};
    const loaded=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:edited}}));
    const restored={...defaultDiagramPDFOptions(loaded),...loaded.exportSettings!.pdf};
    const next=planDiagramPDF(loaded,restored);
    for(const [p,side,expected] of [[0,'outgoing',.22],[1,'incoming',.22],[1,'outgoing',.81],[2,'incoming',.81]] as const){
      const page=next.pages[p],handles=diagramPDFPageSeams(restored,next,page);
      const handle=handles.find(s=>s.kind===side)!;
      assert.ok(Math.abs(handle.height-expected)<1e-9);
      const tracks=diagramPDFRibbonTracks(restored,next,page);
      const track=page.branchEdges?tracks[page.branchEdges.findIndex(e=>e.kind===side)]:tracks[0];
      const tip=side==='incoming'?track.nodes[0]:track.nodes.at(-1)!;
      assert.equal(tip[0],side==='incoming'?0:1);
      assert.ok(Math.abs(tip[1]-expected)<1e-9);
      assert.deepEqual(page.cells.map(c=>[c.x,c.y]),plan.pages[p].cells.map(c=>[c.x,c.y]));
    }
    const reset={...edited,ribbonSeamHeights:changeDiagramPDFSeamHeight(edited.ribbonSeamHeights,entry.key,undefined)};
    const resetPlan=planDiagramPDF(project,reset),resetSeams=diagramPDFPageSeams(reset,resetPlan,resetPlan.pages[1]);
    assert.equal(resetSeams.find(s=>s.kind==='incoming')!.height,entry.height);
    assert.ok(Math.abs(resetSeams.find(s=>s.kind==='outgoing')!.height-.81)<1e-9);
    assert.throws(()=>planDiagramPDF(project,{...options,ribbonSeamHeights:{[entry.key]:2}}),/彩带节点/);
  });
  test('detached facing ends edit and reset separately, reconnect from either end, and reload: '+(branched?'branch':'linear'),()=>{
    let project=createDiagramProject(blankDoc('跨页联动',100,100));
    while(project.steps.length<10)project=appendDiagramStep(project);
    if(branched)project=addDiagramBranch(project,project.activeStepId);
    const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),cover:'diagram',introLayout:'2x2',layout:'2x2',
      readingOrder:'snake',ribbon:defaultDiagramPDFRibbon()};
    const preview=createDiagramPDFPreviewPlanner(),initial=preview(project,options);
    const seam=diagramPDFPageSeams(options,initial,initial.pages[0]).find(s=>s.kind==='outgoing')!;
    function endpoints(heights:DiagramPDFSeamHeights){
      const edited={...options,ribbonSeamHeights:heights};
      const plan=preview(project,edited);
      assert.deepEqual(plan,planDiagramPDF(project,edited));
      return [0,seam.otherPage].map((index,i)=>{
        const page=plan.pages[index],kind=i?'incoming':'outgoing';
        const handle=diagramPDFPageSeams(edited,plan,page).find(s=>s.key===seam.key&&s.kind===kind)!;
        const tracks=diagramPDFRibbonTracks(edited,plan,page);
        const edgeIndex=page.branchEdges?.findIndex(e=>e.kind===kind&&e.otherPage===(i?0:seam.otherPage));
        const nodes=tracks[edgeIndex??0].nodes,tip=i?nodes[0]:nodes.at(-1)!;
        assert.ok(Math.abs(tip[1]-handle.height)<1e-9);
        return Number(handle.height.toFixed(10));
      });
    }
    assert.deepEqual(endpoints({}),[0,1].map(()=>Number(seam.height.toFixed(10))));
    const legacy={[seam.key]:.37};
    assert.deepEqual(endpoints(legacy),[.37,.37]);
    let heights=setDiagramPDFSeamLinked(legacy,seam.key,false,.37);
    assert.deepEqual(endpoints(heights),[.37,.37]);
    heights=changeDiagramPDFSeamHeight(heights,seam.key,.75,'incoming');
    assert.deepEqual(endpoints(heights),[.37,.75]);
    heights=changeDiagramPDFSeamHeight(heights,seam.key,0,'outgoing');
    assert.deepEqual(endpoints(heights),[0,.75]);
    const loaded=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{...options,ribbonSeamHeights:heights}}}));
    assert.deepEqual(loaded.exportSettings!.pdf!.ribbonSeamHeights,heights);
    assert.equal(endpoints(changeDiagramPDFSeamHeight(heights,seam.key,undefined,'incoming'))[0],0);
    assert.equal(endpoints(changeDiagramPDFSeamHeight(heights,seam.key,undefined,'outgoing'))[1],.75);
    for(const current of [0,.75]){
      const joined=setDiagramPDFSeamLinked(heights,seam.key,true,current);
      assert.deepEqual(endpoints(joined),[current,current]);
      assert.deepEqual(endpoints(changeDiagramPDFSeamHeight(joined,seam.key,1,'incoming')),[1,1]);
    }
    assert.throws(()=>planDiagramPDF(project,{...options,ribbonSeamHeights:{[seam.key]:{incoming:-1}}}),/彩带节点/);
    for(const widthMm of [8,14])for(const height of [.34,.95]){
      const edited={...options,ribbon:{...options.ribbon!,widthMm},ribbonSeamHeights:{[seam.key]:height}};
      const plan=preview(project,edited);
      assert.deepEqual(plan,planDiagramPDF(project,edited),'width changes update both preview and export gutters');
      const slopes:number[]=[];
      for(const [index,inlet] of [[0,false],[seam.otherPage,true]] as const){
        const page=plan.pages[index],tracks=diagramPDFRibbonTracks(edited,plan,page);
        const track=tracks[page.branchEdges?.findIndex(e=>e.kind===(inlet?'incoming':'outgoing'))??0];
        const tip=inlet?track.nodes[0]:track.nodes.at(-1)!;
        const shoulder=inlet?track.nodes[1]:track.nodes.at(-2)!;
        assert.ok(Math.abs(tip[1]-height)<1e-9);
        const tangent=inlet?track.neighbors?.before:track.neighbors?.after;
        slopes.push(tangent?(tangent[1]-tip[1])/(tangent[0]-tip[0]):0);
        assert.ok(Math.abs(shoulder[0]-tip[0])*plan.width>=widthMm*72/25.4/2,'clear half a band before turning');
      }
      assert.ok(Math.abs(slopes[0]-slopes[1])<1e-8,'linked ends meet at the same angle');
      if(height===.34)assert.ok(Math.abs(slopes[0])>.01,'the height between the two steps continues the sloping path');
      else assert.ok(Math.abs(slopes[0])<1e-8,'a seam that reverses the vertical direction has a level tangent');
    }
  });
}
