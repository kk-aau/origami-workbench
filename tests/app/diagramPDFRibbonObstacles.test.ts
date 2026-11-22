import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import {adoptDiagramPose,createDiagramProject} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {defaultDiagramPDFOptions,diagramPDFCellContent,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {defaultDiagramPDFRibbon} from '../../src/app/diagramPDFDecoration';
import {diagramPDFRibbonObstacleRects} from '../../src/app/diagramPDFRibbonObstacles';

test('a tall narrow folded subject and its caption reserve separate areas; moving the step moves both',()=>{
  const doc=blankDoc('细长作品',32,180);
  let project=createDiagramProject(doc);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc),defaultModelView());
  const options={...defaultDiagramPDFOptions(project),readingOrder:'snake' as const,ribbon:{...defaultDiagramPDFRibbon(),showArrows:false}};
  const plan=planDiagramPDF(project,options),cell=plan.pages.flatMap(p=>p.cells)[0];
  const endpoint={...cell,x:0,y:0};
  const {imageRect}=diagramPDFCellContent(project.steps[0],cell,options,plan);
  const [paper,caption]=diagramPDFRibbonObstacleRects([cell,endpoint],endpoint);
  assert.ok(paper.width<imageRect.width*.5&&paper.height>paper.width*3);
  assert.ok(caption.width<cell.width*.5&&caption.y>paper.y+paper.height);
  const moved={...cell,x:cell.x+22,y:cell.y-33};
  const relocated=diagramPDFRibbonObstacleRects([moved,endpoint],endpoint);
  for(const [i,rect] of [paper,caption].entries()){
    assert.ok(Math.abs(relocated[i].x-rect.x-22)<1e-9&&Math.abs(relocated[i].y-rect.y+33)<1e-9);
  }
});
