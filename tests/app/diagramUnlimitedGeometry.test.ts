import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {diagramFoldFacesAtPoint,projectDiagramFoldCP,diffDiagramFoldCP} from '../../src/app/diagramFoldLink';
import {validateDiagramAnnotations} from '../../src/app/diagramAnnotations';
import {setDiagramWorkReporter,flushDiagramWork} from '../../src/app/diagramWork';
import {createDiagramProject,adoptDiagramPose,advanceDiagramStep,inheritDiagramCurrentPose,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';

test('a valid model beyond the old face and vertex quotas retains its indexed material faces',()=>{
  const doc=blankDoc('大纸面',4100,1);
  for(let x=1;x<4100;x++)doc.segments.push({id:'f'+x,a:[x,0],b:[x,1],assignment:'F',angle:0});
  const graph=buildFold(doc).graph,faces=graph.faces_vertices!;
  assert.ok(faces.length>2048);assert.ok(graph.vertices_coords.length>8192);
  const pose:DiagramPose={sourceStateId:'source',sourceRevision:0,sourceDoc:doc,result:{geometry:{status:'ready',message:'',vertices:graph.vertices_coords,faces,graph},layers:{status:'unknown',message:''},warnings:[]}};
  const hits=diagramFoldFacesAtPoint(pose,[4099.5,.5]);
  assert.equal(hits.length,1);assert.ok(hits[0]>=0&&hits[0]<faces.length);
  let project=createDiagramProject(doc);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,pose.result);
  const next=advanceDiagramStep(project),inherited=inheritDiagramCurrentPose(next,project.activeStepId,next.activeStepId);
  const restored=importDiagramProject(exportDiagramProject(inherited));
  assert.equal(restored.steps.length,2);
  assert.deepEqual(restored.steps[1].pose!.result.geometry.vertices,pose.result.geometry.vertices);
  assert.deepEqual(restored.steps[1].pose!.result.geometry.faces,faces);
});

test('crease projection completes beyond the former segment budget',()=>{
  const doc=blankDoc('大折痕图',100,100);
  doc.segments=doc.segments.flatMap(s=>{const mid:[number,number]=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2];return [{...s,id:s.id+'a',b:mid},{...s,id:s.id+'b',a:mid}];});
  const result=computeFlatFold(doc);
  const pose:DiagramPose={sourceStateId:'source',sourceRevision:0,sourceDoc:doc,result};
  const after={...doc,segments:[...doc.segments,...Array.from({length:40_001},(_,i)=>({id:'m'+i,a:[0,(i+1)*100/40_003] as [number,number],b:[100,(i+1)*100/40_003] as [number,number],assignment:'M' as const,angle:-180}))]};
  const answer=projectDiagramFoldCP(pose,doc,after);
  assert.equal(answer.preview.length,40_001);
  assert.ok(answer.preview.every(part=>part.visibility==='visible'));
});

test('crossing crease changes finish after more than two million geometric checks',()=>{
  const doc=blankDoc('交叉折痕',100,100);
  const after={...doc,segments:[...doc.segments,...Array.from({length:2100},(_,i)=>({id:'m'+i,a:[0,(i+1)/22] as [number,number],b:[100,100-(i+1)/22] as [number,number],assignment:'M' as const,angle:-180}))]};
  let operations=0;setDiagramWorkReporter(count=>{operations=count;});
  try{
    const changes=diffDiagramFoldCP(doc,after);flushDiagramWork();
    assert.equal(changes.length,2100);assert.ok(operations>2_000_000);
  }finally{setDiagramWorkReporter(undefined);}
});

test('large material identifiers and annotation arrays remain valid while malformed identities reject',()=>{
  const lines=Array.from({length:10_001},(_,i)=>({id:'line'+i,kind:'line' as const,a:[0,0],b:[1,1],style:'valley',color:'#123456',width:.5,foldFaces:[8192+i]}));
  assert.doesNotThrow(()=>validateDiagramAnnotations(lines));
  assert.throws(()=>validateDiagramAnnotations([{...lines[0],foldFaces:[Number.MAX_SAFE_INTEGER+1]}]));
  assert.throws(()=>validateDiagramAnnotations([{...lines[0],foldFaces:[8192,8192]}]));
});
