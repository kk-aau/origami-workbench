import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../../src/app/state';
import {
  addDiagramBranch,appendDiagramStep,createDiagramProcessFigure,createDiagramProject,exportDiagramProject,
  importDiagramProject,insertDiagramStepOnBranch,removeDiagramStep,selectDiagramBranchStep,
  upsertDiagramProcessFigure,type DiagramProject,
} from '../../src/app/diagramProject';
import {setDiagramBranchLabels} from '../../src/app/diagramBranches';
import {validateDiagramExportSettings} from '../../src/app/diagramExportSettings';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {defaultDiagramPDFOptions,planDiagramPDF,type DiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon} from '../../src/app/diagramPDFDecoration';
import {setDiagramPDFRibbonBranchColor,setDiagramPDFRibbonSegmentColor} from '../../src/app/diagramPDFBranchColors';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {createDiagramPDFPreviewPlanner} from '../../src/app/diagramPDFPreviewPlan';
import {diagramPDFSeamKey} from '../../src/app/diagramPDFSeams';
import {previewPageBody} from '../../src/components/diagramPDFPreviewBody';

const globalColor='#899a85',colorA='#a13236',colorB='#227754',colorA2='#724bb7',segmentColor='#db8501';

function branchedProject(){
  let project=createDiagramProject(blankDoc('彩带分支',100,100));
  function append(){
    project=appendDiagramStep(project);
    return project.activeStepId;
  }
  function fork(parent:string){
    project=addDiagramBranch(project,parent);
    return project.activeStepId;
  }
  const trunk=append(),a=append();
  project=upsertDiagramProcessFigure(project,a,createDiagramProcessFigure(project,a,'copy'));
  const nested=append(),a1=append(),a1End=append(),a2=fork(nested),a2Next=append(),a2End=append();
  const b=fork(trunk),bEnd=append();
  project=setDiagramBranchLabels(project,trunk,'custom',{[a]:'墨镜',[b]:'礼帽'});
  const defaults=defaultDiagramPDFRibbon(),ribbon={...defaults,paint:{...defaults.paint,color:globalColor},
    branchColors:{[a]:colorA,[b]:colorB,[a2]:colorA2}};
  const options:DiagramPDFOptions={...defaultDiagramPDFOptions(project),ribbon,readingOrder:'snake',cover:'none',layout:'3x4'};
  const expected=new Map([[trunk,globalColor],[a,colorA],[nested,colorA],[a1,colorA],[a1End,colorA],
    [a2,colorA2],[a2Next,colorA2],[a2End,colorA2],[b,colorB],[bEnd,colorB]]);
  return {project,options,expected,a,b,a2,a2End};
}

function pathStroke(path:string){
  const stroke=path.match(/\bdata-pdf-ribbon-end-color="([^"]+)"/)?.[1]??path.match(/\bstroke="([^"]+)"/)?.[1];
  assert.ok(stroke,'the ribbon path has a stroke');
  return stroke;
}
function printedBranches(project:DiagramProject,options:DiagramPDFOptions,plan=planDiagramPDF(project,options)){
  const cells=new Map(plan.pages.flatMap(page=>page.cells.map(cell=>[cell.branchNodeId,cell] as const)));
  return plan.pages.flatMap((page,i)=>{
    const svg=diagramPDFPageSVG(project,options,plan,i,defaultDiagramLineDefaults(),true);
    const drawings=new Map([...svg.matchAll(/<g\b[^>]*\bdata-pdf-ribbon-edge="(\d+)"[^>]*>([\s\S]*?)<\/g>/g)]
      .map(match=>{
        const path=match[2].match(/<path\b[^>]*\bdata-pdf-ribbon="true"[^>]*>/)?.[0];
        assert.ok(path);
        return [Number(match[1]),pathStroke(path)] as const;
      }));
    return (page.branchEdges??[]).map((edge,index)=>{
      const cell=cells.get(edge.to);
      assert.ok(cell?.branchStepId,'each edge reaches an exported step or its process figure');
      assert.ok(drawings.has(index),'each planned branch edge is printed');
      return {...edge,key:diagramPDFSeamKey(edge.from,edge.to),step:cell.branchStepId,figure:cell.figureIndex,stroke:drawings.get(index)!};
    });
  });
}

test('nested ribbons take the destination branch colour, including process figures and both halves of each page crossing',()=>{
  const {project,options,expected,a}=branchedProject();
  for(const layout of ['3x4','1x1'] as const){
    const printed=printedBranches(project,{...options,layout});
    assert.ok(printed.some(edge=>edge.step===a&&edge.figure===0));
    assert.deepEqual(new Set(printed.map(edge=>edge.step)),new Set(expected.keys()));
    for(const edge of printed){
      assert.equal(edge.stroke,expected.get(edge.step),`${edge.kind} ${edge.from} → ${edge.to}`);
    }
    if(layout==='1x1'){
      const exits=printed.filter(edge=>edge.kind==='outgoing'),entries=printed.filter(edge=>edge.kind==='incoming');
      assert.equal(exits.length,expected.size+1,'one extra edge belongs to the process figure');
      assert.deepEqual(new Set(exits.map(edge=>edge.key)),new Set(entries.map(edge=>edge.key)));
    }else assert.ok(printed.some(edge=>edge.kind==='local'));
  }
});

test('a segment to a process figure overrides just that connection, survives a project save and can be cleared without repaginating',()=>{
  const {project,options,a}=branchedProject(),original={...options,layout:'1x1' as const};
  const preview=createDiagramPDFPreviewPlanner(),plan=preview(project,original);
  const initial=printedBranches(project,original,plan);
  const exit=initial.find(edge=>edge.step===a&&edge.figure===0&&edge.kind==='outgoing')!;
  const key=exit.key,figurePage=exit.otherPage!,palette=defaultDiagramLineDefaults();
  const artwork=previewPageBody(project,original,plan,figurePage,palette,true);
  const pdf={...original,ribbon:setDiagramPDFRibbonSegmentColor(original.ribbon!,key,segmentColor)};
  const colored=preview(project,pdf);
  assert.equal(colored.pages[figurePage].cells,plan.pages[figurePage].cells,'recolouring reuses step geometry');
  assert.equal(previewPageBody(project,pdf,colored,figurePage,palette,true),artwork,'the existing process artwork stays visible');
  const reopened=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf}}));
  const restored={...defaultDiagramPDFOptions(reopened),...reopened.exportSettings!.pdf};
  assert.deepEqual(restored.ribbon,pdf.ribbon);
  for(const connections of [printedBranches(project,pdf,colored),printedBranches(reopened,restored)]){
    assert.equal(connections.filter(edge=>edge.key===key).length,2);
    assert.deepEqual(connections.map(edge=>edge.stroke),initial.map(edge=>edge.key===key?segmentColor:edge.stroke));
  }
  const reset={...pdf,ribbon:setDiagramPDFRibbonSegmentColor(pdf.ribbon,key)};
  assert.deepEqual(printedBranches(project,reset,preview(project,reset)),initial);
});

test('clearing a parent colour reveals the global gradient while explicit nested and sibling colours survive',()=>{
  const {project,options,a,expected}=branchedProject();
  const ribbon=setDiagramPDFRibbonBranchColor(options.ribbon!,a);
  const mixed={...options,ribbon:{...ribbon,paint:{...ribbon.paint,kind:'radial' as const}}};
  for(const edge of printedBranches(project,mixed)){
    const original=expected.get(edge.step);
    if(original===colorA||original===globalColor)assert.ok(edge.stroke.startsWith('url(#'));
    else assert.equal(edge.stroke,original);
  }
});

test('single-route and range export use the active path colours even if its forks are outside the selected range',()=>{
  const {project,options,a2End,expected}=branchedProject(),active=selectDiagramBranchStep(project,a2End);
  for(const scope of ['route','range'] as const){
    const pdf={...options,scope,rangeStart:active.steps.length-1,rangeEnd:active.steps.length};
    const plan=planDiagramPDF(active,pdf);
    assert.equal(plan.pages.length,1);
    const cells=plan.pages[0].cells,svg=diagramPDFPageSVG(active,pdf,plan,0,defaultDiagramLineDefaults(),true);
    const base=pathStroke(svg.match(/<path\b[^>]*\bdata-pdf-ribbon="true"[^>]*>/)![0]);
    const segments=new Map([...svg.matchAll(/<path\b[^>]*\bdata-pdf-ribbon-segment="([^"]+)"[^>]*>/g)]
      .map(match=>[decodeURIComponent(match[1]),pathStroke(match[0])]));
    const displayed=cells.slice(1).map((cell,i)=>{
      const key=diagramPDFSeamKey(cells[i].ribbonNodeId!,cell.ribbonNodeId!);
      const color=segments.get(key)??base;
      assert.equal(color,expected.get(active.steps[cell.stepIndex].id));
      return color;
    });
    assert.deepEqual(new Set(displayed),scope==='route'?new Set([globalColor,colorA,colorA2]):new Set([colorA2]));
  }
});

test('a coloured process connection in the whole tree keeps its identity on both sheets of a single-route export',()=>{
  const {project,options,a,a2End}=branchedProject(),active=selectDiagramBranchStep(project,a2End);
  const key=printedBranches(project,options).find(edge=>edge.step===a&&edge.figure===0)!.key;
  const pdf={...options,layout:'1x1' as const,scope:'route' as const,ribbon:setDiagramPDFRibbonSegmentColor(options.ribbon!,key,segmentColor)};
  const plan=planDiagramPDF(active,pdf),palette=defaultDiagramLineDefaults();
  const painted=plan.pages.flatMap((_,i)=>{
    const svg=diagramPDFPageSVG(active,pdf,plan,i,palette,true);
    return [...svg.matchAll(/<path\b[^>]*\bdata-pdf-ribbon-segment="([^"]+)"[^>]*>/g)]
      .filter(match=>pathStroke(match[0])===segmentColor).map(match=>({page:i,key:decodeURIComponent(match[1])}));
  });
  const figurePage=plan.pages.findIndex(page=>page.cells.some(cell=>active.steps[cell.stepIndex].id===a&&cell.figureIndex===0));
  assert.ok(figurePage>0);
  assert.deepEqual(painted,[{page:figurePage-1,key},{page:figurePage,key}]);
});

test('inserting and removing a first branch step keeps that arm’s authored colour across a saved project',()=>{
  const {project,options,a,a2End,expected}=branchedProject(),original={...project,exportSettings:{pdf:options}};
  const inserted=insertDiagramStepOnBranch(original,{leafId:a2End,anchorId:a,position:'before'});
  const reopened=importDiagramProject(exportDiagramProject(inserted)),newHead=reopened.activeStepId;
  assert.notEqual(newHead,a);
  for(const [current,addedHead] of [[reopened,true],[removeDiagramStep(reopened,newHead),false]] as const){
    const pdf={...options,...current.exportSettings!.pdf};
    assert.equal(pdf.ribbon!.branchColors![addedHead?newHead:a],colorA);
    assert.equal(pdf.ribbon!.branchColors![addedHead?a:newHead],undefined);
    const edges=printedBranches(current,pdf);
    assert.equal(edges.some(edge=>edge.step===newHead),addedHead);
    for(const edge of edges)assert.equal(edge.stroke,edge.step===newHead?colorA:expected.get(edge.step));
  }
});

test('project export settings reject malformed branch and segment colours while preserving older global-only gradients',()=>{
  const {project,options}=branchedProject(),defaults=defaultDiagramPDFRibbon();
  const legacy={...options,ribbon:{...defaults,paint:{...defaults.paint,kind:'linear' as const}}};
  const saved=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:legacy}}));
  const restored={...defaultDiagramPDFOptions(saved),...saved.exportSettings!.pdf};
  const colors=printedBranches(saved,restored);
  assert.ok(colors.length);
  assert.ok(colors.every(edge=>edge.stroke.startsWith('url(#')));
  for(const field of ['branchColors','segmentColors']){
    for(const invalid of [[],null,{'branch':'red'},{'branch':123}]){
      assert.throws(()=>validateDiagramExportSettings({pdf:{ribbon:{...defaults,[field]:invalid}}}),field);
    }
  }
});

test('the first connection blends the inherited colour into the authored branch colour and both page halves share its progress',()=>{
  const {project,options,a,b,a2}=branchedProject();
  for(const layout of ['3x4','1x1'] as const){
    const pdf={...options,layout},plan=planDiagramPDF(project,pdf),palette=defaultDiagramLineDefaults();
    const all=plan.pages.map((_,index)=>diagramPDFPageSVG(project,pdf,plan,index,palette,true));
    for(const [step,source,destination] of [[a,globalColor,colorA],[b,globalColor,colorB],[a2,colorA,colorA2]]){
      const node='s/'+encodeURIComponent(step),spans:{page:number;first:number;last:number}[]=[];
      all.forEach((svg,page)=>{
        const paths=[...svg.matchAll(/<path\b[^>]*data-pdf-ribbon-segment="([^"]+)"[^>]*>/g)].filter(match=>{
          const [,to]=JSON.parse(decodeURIComponent(match[1]));return to===node&&!match[0].includes('data-pdf-ribbon-extension');
        });
        if(!paths.length)return;
        const progress=paths.map(([path])=>{
          assert.match(path,new RegExp('data-pdf-ribbon-start-color="'+source+'"'));
          assert.match(path,new RegExp('data-pdf-ribbon-end-color="'+destination+'"'));
          assert.match(path,/stroke="url\(#/);
          return path.match(/data-pdf-ribbon-paint-span="([^"]+)"/)![1].split(' ').map(Number);
        });
        spans.push({page,first:progress[0][0],last:progress.at(-1)![1]});
      });
      assert.equal(spans[0].first,0);assert.equal(spans.at(-1)!.last,1);
      if(layout==='1x1'){
        assert.equal(spans.length,2);assert.ok(spans[0].last>0&&spans[0].last<1);
        assert.equal(spans[0].last,spans[1].first,'the same seam has exactly one gradient phase');
      }
    }
    for(const svg of all)assert.doesNotMatch(svg,/<image\b|<foreignObject|<filter|<mask/,'native export stays vector-only');
  }
});

test('overriding or resetting a branch entry restores exactly its intended colour policy',()=>{
  const {project,options,a}=branchedProject(),plan=planDiagramPDF(project,options),palette=defaultDiagramLineDefaults();
  const first=printedBranches(project,options,plan).find(edge=>edge.step===a&&edge.figure===undefined)!;
  const overwritten={...options,ribbon:setDiagramPDFRibbonSegmentColor(options.ribbon!,first.key,segmentColor)};
  const svg=diagramPDFPageSVG(project,overwritten,plan,0,palette,true);
  const path=[...svg.matchAll(/<path\b[^>]*data-pdf-ribbon-segment="([^"]+)"[^>]*>/g)].find(match=>decodeURIComponent(match[1])===first.key)![0];
  assert.match(path,new RegExp('stroke="'+segmentColor+'"'));assert.doesNotMatch(path,/data-pdf-ribbon-start-color/);
  const reset={...options,ribbon:setDiagramPDFRibbonBranchColor(options.ribbon!,a)};
  const resetSVG=diagramPDFPageSVG(project,reset,plan,0,palette,true);
  const entry=[...resetSVG.matchAll(/<path\b[^>]*data-pdf-ribbon-segment="([^"]+)"[^>]*>/g)].find(match=>decodeURIComponent(match[1])===first.key)![0];
  assert.match(entry,new RegExp('stroke="'+globalColor+'"'));assert.doesNotMatch(entry,/data-pdf-ribbon-start-color/);
});
