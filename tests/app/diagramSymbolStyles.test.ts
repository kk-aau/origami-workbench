import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDiagramBasicSettings,readDiagramBasicSettings} from '../../src/app/diagramBasicSettings';
import {appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {overrideDiagramSymbolStyle,resolveDiagramSymbolStyle,validateDiagramSymbolStyles,type DiagramSymbolStyles} from '../../src/app/diagramSymbolStyles';
import {blankDoc} from '../../src/app/state';

const arrow:DiagramSymbolAnnotation={id:'arrow',kind:'symbol',symbol:'fold',position:[0,0],rotation:0,size:20,width:.7,color:'#293d35'};
const styles:DiagramSymbolStyles={fold:{color:'#113355',width:2,fill:'solid',adaptive:true},cpCallout:{width:1.4,adaptive:true}};
test('a project style preserves legacy artwork and explicit overrides independently for each pen field',()=>{
  assert.deepEqual(resolveDiagramSymbolStyle(arrow),{color:arrow.color,width:.7,adaptive:true});
  assert.deepEqual(resolveDiagramSymbolStyle(arrow,styles),styles.fold);
  const tinted={...arrow,color:'#112233'};
  assert.equal(resolveDiagramSymbolStyle(tinted,styles).color,tinted.color);
  assert.equal(resolveDiagramSymbolStyle(tinted,styles).width,2);
  const custom=overrideDiagramSymbolStyle(tinted,{width:.8});
  assert.deepEqual(custom.appearanceOverrides,['color','width']);
  assert.deepEqual(resolveDiagramSymbolStyle(custom,styles),{...styles.fold,width:.8,color:tinted.color});
  // New drawings explicitly distinguish inherited fallback paint from a local edit.
  assert.equal(resolveDiagramSymbolStyle({...tinted,appearanceOverrides:[]},styles).color,styles.fold?.color);
  assert.throws(()=>validateDiagramAnnotations([{...arrow,appearanceOverrides:['width','width']}]));
  assert.throws(()=>validateDiagramAnnotations([{...arrow,appearanceOverrides:['strokePattern']}]));
});

test('a symbol-only settings edit preserves all step, state and saved line references and roundtrips',()=>{
  const project=appendDiagramStep(createDiagramProject(blankDoc('符号测试')));
  project.steps[0].annotations=[overrideDiagramSymbolStyle(arrow,{width:.8})];
  const previous=readDiagramBasicSettings(project);
  project.basicSettings=previous;
  const result=applyDiagramBasicSettings(project,project.name,{...previous,symbolStyles:styles});
  assert.equal(result.steps,project.steps);
  assert.equal(result.states,project.states);
  assert.deepEqual(result.basicSettings?.lineDefaults,previous.lineDefaults);
  const reopened=importDiagramProject(exportDiagramProject(result));
  assert.deepEqual(reopened.basicSettings?.symbolStyles,styles);
  assert.deepEqual(reopened.steps[0].annotations,project.steps[0].annotations);
});

test('symbol and callout type styles reject invalid sizes, colours, and unsupported fills',()=>{
  for(const invalid of [{arbitrary:{width:.7}},{fold:{width:0}},{fold:{color:'red'}},{hold:{adaptive:1}},{cut:{fill:'solid'}},{cpCallout:{fill:'solid'}},{fold:{fill:'unknown'}}])assert.throws(()=>validateDiagramSymbolStyles(invalid));
  assert.doesNotThrow(()=>validateDiagramSymbolStyles({paperCallout:{width:.4,color:'#abc'},...styles}));
});
