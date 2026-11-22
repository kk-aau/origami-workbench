import assert from 'node:assert/strict';
import test from 'node:test';
import {createDiagramProject,appendDiagramStep,addDiagramBranch,adoptDiagramPose,exportDiagramProject,importDiagramProject,type DiagramPose} from '../../src/app/diagramProject';
import {createDiagramSpatialPose,reprojectDiagramSpatialPose,type DiagramSpatialPose} from '../../src/app/diagramSpatialPose';
import {captureCustomGalleryView,captureGalleryView,galleryGrid,galleryRows,galleryStep,galleryImageBox,clampDiagramGalleryPlacement,prepareGalleryViews,type DiagramGalleryView} from '../../src/app/diagramPDFGallery';
import {prepareDiagramPDFProject} from '../../src/app/diagramPDF';
import {rotateDiagramCameraAxis} from '../../src/app/diagramAxisRotation';
import {defaultDiagramPDFOptions,planDiagramPDF,validateDiagramPDFOptions} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {readDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import type {Doc} from '../../src/core/types';
import {arrangeDiagramGallery} from '../../src/app/diagramPDFGalleryArrange';
import type {DiagramGalleryBox,DiagramGalleryPlace} from '../../src/app/diagramPDFGallery';

const doc:Doc={schemaVersion:2,name:'成品图库',paper:{width:90,height:90},segments:[
  {id:'b0',a:[0,0],b:[90,0],assignment:'B',angle:0},{id:'b1',a:[90,0],b:[90,90],assignment:'B',angle:0},
  {id:'b2',a:[90,90],b:[0,90],assignment:'B',angle:0},{id:'b3',a:[0,90],b:[0,0],assignment:'B',angle:0},
  {id:'v',a:[30,0],b:[30,90],assignment:'V',angle:90},
]};
test('gallery persists cameras and captions, reprojects the original fold and shares the vector art on cover and results',async t=>{
  const source=createDiagramProject(doc),initial=source.steps[0],fold=createDiagramSpatialPose(doc);
  const project=adoptDiagramPose(source,initial.id,initial.beforeId,fold.result,undefined,fold.spatial);
  const step=project.steps[0],saved={...captureGalleryView(step,'saved'),cover:true},left={...captureGalleryView(step,'left'),cover:true,caption:'左侧 <A>'};
  const originalVertices=structuredClone(step.pose!.result.geometry.vertices);
  let reprojections=0;
  class LocalSpatialWorker {
    onmessage?:(e:{data:unknown})=>void;
    postMessage({pose,camera,history}:{pose:DiagramPose;camera:DiagramSpatialPose['camera'];history:DiagramPose[]}){
      reprojections++;
      queueMicrotask(()=>this.onmessage?.({data:{ok:true,value:reprojectDiagramSpatialPose(pose,camera,history)}}));
    }
    terminate(){}
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  Object.defineProperty(globalThis,'Worker',{value:LocalSpatialWorker,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else Reflect.deleteProperty(globalThis,'Worker');});
  const options={...defaultDiagramPDFOptions(project),gallery:[saved,left]};
  await prepareGalleryViews(project,options);
  assert.equal(reprojections,1);
  assert.notDeepEqual(galleryStep(project,left).pose!.result.geometry.vertices,originalVertices);
  assert.deepEqual(step.pose!.result.geometry.vertices,originalVertices);
  const plan=planDiagramPDF(project,options);
  assert.deepEqual(plan.pages.map(p=>p.kind),['intro']);
  const svg=diagramPDFPageSVG(project,options,plan,0,readDiagramLineDefaults(),true);
  assert.equal(svg.match(/data-gallery-place="cover"/g)?.length,2);
  assert.equal(svg.match(/data-gallery-place="result"/g)?.length,2);
  assert.ok(svg.indexOf('data-pdf-step="1"')<svg.indexOf('data-gallery-place="result"'));
  assert.match(svg,/左侧 &lt;A&gt;/);
  assert.doesNotMatch(svg,/data-diagram-cover-artwork="image"/,'gallery views have individual hit targets');
  const decoded=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{gallery:options.gallery}}}));
  assert.deepEqual(decoded.exportSettings?.pdf?.gallery,options.gallery);
  assert.throws(()=>validateDiagramPDFOptions({...options,gallery:[{...left,camera:{yaw:NaN,elevation:0}}]}));
  assert.deepEqual(planDiagramPDF(project,{...options,gallery:[{...left,stepId:'removed'}]}).pages.map(p=>p.kind),['intro']);
});
test('gallery prefers side-by-side portraits and stacked landscape figures',()=>{
  const box={x:10,y:20,width:250,height:380};
  const tall=galleryGrid(box,[.3,.3]),wide=galleryGrid(box,[2,2]);
  assert.equal(tall[0].y,tall[1].y);assert.equal(wide[0].x,wide[1].x);
});

test('gallery alignment and equal gaps use actual frame edges and persist only the chosen side',()=>{
  const project=createDiagramProject(doc),base=captureGalleryView(project.steps[0],'saved');
  const gallery:DiagramGalleryView[]=Array.from({length:4},(_,i)=>({...base,cover:true,
    layout:{cover:{x:.04+i*.21,y:.05+i*.14,width:.05+i*.02},result:{x:.1+i*.18,y:.08+i*.17,width:.12-i*.013}}}));
  const options={...defaultDiagramPDFOptions(project),cover:'minimal' as const,layout:'1x1' as const,
    pageLayouts:{2:{rows:2,columns:2}},gallery};
  const plan=planDiagramPDF(project,options);
  function rendered(place:DiagramGalleryPlace,views:DiagramGalleryView[]){
    const page=place==='cover'?0:plan.pages.findIndex(p=>p.kind==='gallery');
    const svg=diagramPDFPageSVG(project,{...options,gallery:views},plan,page,readDiagramLineDefaults(),true);
    const boxes:DiagramGalleryBox[]=[...svg.matchAll(/data-gallery-view="(\d+)" data-gallery-place="(cover|result)" data-gallery-x="([^"]+)" data-gallery-y="([^"]+)" data-gallery-width="([^"]+)" data-gallery-height="([^"]+)"/g)]
      .filter(match=>match[2]===place).map(([,id,,x,y,width,height])=>({index:Number(id),place,box:{x:+x,y:+y,width:+width,height:+height}}));
    assert.equal(boxes.length,4);return {boxes,page};
  }
  for(const place of ['cover','result'] as const)for(const axis of ['x','y'] as const){
    const other=place==='cover'?'result':'cover',size=axis==='x'?'width':'height';
    const {boxes,page}=rendered(place,gallery),selected=[2,0,1];
    for(const action of ['start','center','end','distribute'] as const){
      const edited=arrangeDiagramGallery(options,plan,page,project.name,boxes,place,selected,axis,action);
      const reopened=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{...options,gallery:edited}}})).exportSettings!.pdf!.gallery!;
      assert.deepEqual(reopened.map(item=>item.layout![other]),gallery.map(item=>item.layout![other]));
      assert.deepEqual(reopened[3],gallery[3]);
      const actual=rendered(place,reopened).boxes.slice(0,3).map(entry=>entry.box);
      for(const [i,box] of actual.entries()){
        assert.ok(Math.abs(box.width-boxes[i].box.width)<1e-8);
        assert.ok(Math.abs(box.height-boxes[i].box.height)<1e-8);
      }
      if(action==='distribute'){
        const gaps=actual.slice(1).map((box,i)=>box[axis]-actual[i][axis]-actual[i][size]);
        assert.ok(Math.abs(gaps[0]-gaps[1])<1e-8);
        assert.ok(Math.abs(actual[0][axis]-boxes[0].box[axis])<1e-8);
        assert.ok(Math.abs(actual[2][axis]-boxes[2].box[axis])<1e-8);
      }else{
        const offset=action==='start'?0:action==='center'?.5:1;
        const aligned=actual.map(box=>box[axis]+offset*box[size]);
        assert.ok(Math.max(...aligned)-Math.min(...aligned)<1e-8);
      }
    }
  }
});

test('a mixed-page alignment that would cover a step leaves all gallery placements intact',()=>{
  const project=createDiagramProject(doc),view=captureGalleryView(project.steps[0],'saved');
  const options={...defaultDiagramPDFOptions(project),cover:'none' as const,gallery:[view,{...view}]};
  const plan=planDiagramPDF(project,options),cell=plan.pages[0].cells[0];
  const boxes:DiagramGalleryBox[]=[
    {index:0,place:'result',box:{x:cell.x,y:cell.y+cell.height+8,width:20,height:20}},
    {index:1,place:'result',box:{x:cell.x+cell.width+8,y:cell.y,width:20,height:20}},
  ];
  assert.throws(()=>arrangeDiagramGallery(options,plan,0,project.name,boxes,'result',[0,1],'x','start'),/遮挡/);
  assert.ok(options.gallery.every(item=>item.layout===undefined));
  assert.strictEqual(arrangeDiagramGallery(options,plan,0,project.name,boxes,'result',[0,1],'x','distribute'),options.gallery);
});
test('gallery mirrors each finished image around its own box independently on the cover and result page',()=>{
  const project=createDiagramProject(doc);
  const view={...captureGalleryView(project.steps[0],'saved'),cover:true,caption:'图注 <A>',
    layout:{cover:{x:.3,y:.25,width:.1},result:{x:.15,y:.4,width:.18}}};
  for(const [mirrorX,mirrorY] of [[true,false],[false,true],[true,true],[false,false]]){
    const gallery=[{...view,mirrorX,mirrorY},{...view,caption:'原图'}];
    const options={...defaultDiagramPDFOptions(project),cover:'standard' as const,gallery};
    const restored=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{gallery}}}));
    assert.deepEqual(restored.exportSettings!.pdf!.gallery,gallery);
    const plan=planDiagramPDF(restored,options);
    for(const [index,place] of [[0,'cover'],[1,'result']] as const){
      const svg=diagramPDFPageSVG(restored,options,plan,index,readDiagramLineDefaults(),true);
      const match=svg.match(/<g data-gallery-view="0" data-gallery-place="(cover|result)" data-gallery-x="([^"]+)" data-gallery-y="([^"]+)" data-gallery-width="([^"]+)" data-gallery-height="([^"]+)">/)!;
      assert.equal(match[1],place);
      const [x,y,w,h]=match.slice(2).map(Number);
      assert.equal(svg.match(/data-gallery-mirror=/g)?.length??0,Number(mirrorX||mirrorY));
      if(mirrorX||mirrorY){
        assert.ok(svg.includes(`transform="matrix(${mirrorX?-1:1} 0 0 ${mirrorY?-1:1} ${mirrorX?2*x+w:0} ${mirrorY?2*y+h:0})"><svg`));
        assert.match(svg,/<\/svg><\/g><text[^>]*>图注 &lt;A&gt;<\/text>/);
      }
    }
  }
  assert.throws(()=>validateDiagramPDFOptions({...defaultDiagramPDFOptions(project),gallery:[{...view,mirrorX:1 as any}]}),/镜像/);
});
test('a saved camera on an inactive deeper branch is rendered on the cover and result sheet even when exporting just the current step',async()=>{
  let p=appendDiagramStep(appendDiagramStep(createDiagramProject(doc)));
  const finished=p.steps[2],fold=createDiagramSpatialPose(doc);
  p=adoptDiagramPose(p,finished.id,finished.beforeId,fold.result,undefined,fold.spatial);
  const view={...captureGalleryView(p.steps[2],'saved'),cover:true,caption:'分支成品'};
  p=addDiagramBranch(p,p.steps[0].id);
  assert.equal(p.steps.length,2);
  const options={...defaultDiagramPDFOptions(p),scope:'current' as const,cover:'minimal' as const,gallery:[view]};
  const snapshot=await prepareDiagramPDFProject(p,options);
  const [row]=galleryRows(snapshot,options,'result');
  assert.equal(row.ref.stepIndex,2);assert.equal(row.ref.branchStepId,finished.id);
  assert.equal(galleryStep(snapshot,view).pose?.spatial?.vertices.length,fold.spatial.vertices.length);
  const plan=planDiagramPDF(snapshot,options);
  const pages=plan.pages.map((_,i)=>diagramPDFPageSVG(snapshot,options,plan,i,readDiagramLineDefaults(),true));
  assert.match(pages[0],/data-gallery-place="cover"/);
  assert.match(pages.at(-1)!,/data-gallery-place="result"/);
  assert.match(pages[0],/分支成品/);
});
test('a new view appears after the steps with or without a cover',()=>{
  const project=createDiagramProject(doc),view=captureGalleryView(project.steps[0],'saved');
  const options={...defaultDiagramPDFOptions(project),gallery:[view]};
  assert.equal(view.cover,false);
  assert.equal(view.result,true);
  for(const cover of ['none','minimal','diagram'] as const){
    const plan=planDiagramPDF(project,{...options,cover});
    const last=plan.pages.at(-1)!;
    assert.equal(last.cells.length,1);
    assert.equal(last.resultGallery?.count,1);
    const slot=last.resultGallery!.slots![0],cell=last.cells[0];
    assert.ok(slot.x>=cell.x+cell.width||slot.y>=cell.y+cell.height);
  }
});
test('each repeated view has a stable row and independent whole-page placement on cover and results',()=>{
  const project=createDiagramProject(doc),view={...captureGalleryView(project.steps[0],'saved'),cover:true};
  const gallery:DiagramGalleryView[]=[
    {...view,cover:false,result:false},
    {...view,layout:{cover:{x:.06,y:.7,width:.2},result:{x:.4,y:.1,width:.12}}},
    {...view,result:false},
    ...Array.from({length:6},()=>({...view,cover:false})),
  ];
  const options={...defaultDiagramPDFOptions(project),pageLayouts:{0:{columns:1,rows:1},1:{columns:2,rows:3}},gallery},plan=planDiagramPDF(project,options);
  const boxes=(page:number)=>{
    const svg=diagramPDFPageSVG(project,options,plan,page,readDiagramLineDefaults(),true);
    return [...svg.matchAll(/<g data-gallery-view="(\d+)" data-gallery-place="(cover|result)" data-gallery-x="([^"]+)" data-gallery-y="([^"]+)" data-gallery-width="([^"]+)" data-gallery-height="([^"]+)"><svg\b([^>]*)>/g)].map(([,index,place,x,y,width,height,attributes])=>{
      for(const [key,val] of Object.entries({x,y,width,height}))assert.ok(attributes.includes(' '+key+'="'+val+'"'));
      return {index:Number(index),place,x:Number(x),y:Number(y),width:Number(width),height:Number(height)};
    });
  };
  const cover=boxes(0),results=boxes(1);
  assert.deepEqual(cover.map(row=>row.index),[1,2]);
  assert.deepEqual(results.map(row=>row.index),[1,3,4,5,6,7]);
  assert.deepEqual(boxes(2).map(row=>row.index),[8]);
  assert.equal(cover[0].place,'cover');assert.equal(results[0].place,'result');
  assert.equal(cover[0].y,plan.height*.7);assert.equal(cover[0].width,plan.width*.2);
  assert.equal(results[0].x,plan.width*.4);assert.equal(results[0].width,plan.width*.12);
  assert.ok(Math.abs(cover[0].width/cover[0].height-results[0].width/results[0].height)<1e-9);
  const decoded=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{gallery}}}));
  assert.deepEqual(decoded.exportSettings?.pdf?.gallery,gallery);
  for(const invalid of [null,{other:{x:.1,y:.1,width:.2}},{result:{x:Infinity,y:.4,width:.2}},{cover:{x:.6,y:.9,width:0}}])
    assert.throws(()=>validateDiagramPDFOptions({...options,gallery:[{...view,layout:invalid} as DiagramGalleryView]}));
});
test('the auto image box fits its figure and manual resizing clamps to the full page',()=>{
  const slot={x:20,y:40,width:60,height:100},page={width:200,height:300};
  assert.deepEqual(galleryImageBox(slot,.4,10,page),{x:32,y:40,width:36,height:90});
  assert.deepEqual(galleryImageBox(slot,.4,10,page,{x:.9,y:.9,width:1}),{x:80,y:0,width:120,height:300});
  assert.deepEqual(clampDiagramGalleryPlacement({x:-2,y:-1,width:2},2,page),{x:0,y:0,width:1});
});

test('mixed pages protect steps and cover text when reopening a manually placed result',()=>{
  const project=createDiagramProject(doc),placement={x:0,y:0,width:.9};
  const view={...captureGalleryView(project.steps[0],'saved'),caption:'正面',layout:{result:placement}};
  const options={...defaultDiagramPDFOptions(project),gallery:[view]},plan=planDiagramPDF(project,options);
  const slot=plan.pages[0].resultGallery!.slots![0];
  function resultBox(){
    const svg=diagramPDFPageSVG(project,options,plan,0,readDiagramLineDefaults(),true);
    const match=svg.match(/data-gallery-place="result" data-gallery-x="([^"]+)" data-gallery-y="([^"]+)" data-gallery-width="([^"]+)" data-gallery-height="([^"]+)"/)!;
    return match.slice(1).map(Number);
  }
  const [x,y,w,h]=resultBox();
  assert.ok(x>=slot.x&&y>=slot.y&&x+w<=slot.x+slot.width+.001&&y+h<slot.y+slot.height);
  assert.deepEqual(view.layout.result,{x:0,y:0,width:.9});
  view.layout.result={x:(slot.x+1)/plan.width,y:(slot.y+1)/plan.height,width:.02};
  const [freeX,freeY,freeW]=resultBox();
  assert.ok(Math.abs(freeX-slot.x-1)<1e-8&&Math.abs(freeY-slot.y-1)<1e-8&&Math.abs(freeW-.02*plan.width)<1e-8);
});

test('a picked camera survives save and reopen with its material side and exact orientation',()=>{
  const source=createDiagramProject(doc),fold=createDiagramSpatialPose(doc);
  const project=adoptDiagramPose(source,source.activeStepId,source.steps[0].beforeId,fold.result,undefined,fold.spatial);
  const step=project.steps[0],back=captureGalleryView(step,'opposite');
  const camera=rotateDiagramCameraAxis(fold.spatial.camera,'z',.61);
  const custom=captureCustomGalleryView(step,camera,back);
  assert.equal(custom.angle,'custom');
  assert.equal(custom.side,back.side);
  assert.deepEqual(custom.camera,camera);
  assert.notStrictEqual(custom.camera?.rotation,camera.rotation);
  const decoded=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:{gallery:[custom]}}}));
  assert.deepEqual(decoded.exportSettings?.pdf?.gallery?.[0],custom);
  assert.ok(!step.pose!.spatial!.camera.rotation||step.pose!.spatial!.camera.rotation!==camera.rotation);
  const options=defaultDiagramPDFOptions(project);
  assert.throws(()=>validateDiagramPDFOptions({...options,gallery:[{...custom,camera:undefined}]}));
  assert.throws(()=>validateDiagramPDFOptions({...options,gallery:[{...custom,simulationView:{yaw:0,pitch:0,zoom:1}}]}));
  assert.throws(()=>captureCustomGalleryView(source.steps[0],camera));
  assert.throws(()=>captureCustomGalleryView({...step,paperVisible:false},camera));
});
