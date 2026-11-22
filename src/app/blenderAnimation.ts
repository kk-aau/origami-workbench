import {diagramAnimationEvaluator,type DiagramFullAnimationEntry} from './diagramFullAnimation';
import {DiagramPlaybackSequence} from './diagramPlaybackSequence';
import {localProgressAt,sinkPhaseAt,playbackBoundaryPause,sinkMotionProgress} from './diagramPlaybackProgress';
import type {DiagramProject} from './diagramProject';
import {readPaperPatterns,type PaperPatterns} from './paperPatterns';
import {materialUV} from '../engine/simPaperTexture';
import {blenderLayerMesh} from '../engine/simBlenderLayers';
import {DEFAULT_SIMULATION_VIEW} from '../engine/simViewCube';
import {viewRotationFor,type Mat3} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {meshTopologyFor} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import type {PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

type Step=Pick<DiagramFullAnimationEntry,'clip'|'plan'|'duration'|'automaticSinkPhase'|'opensSink'|'sinkPoseClock'>;
export type BlenderRenderRequest={kind:'png';stepIndex:number;progress:number}|{kind:'mp4'};
export type BlenderAnimationSource=({step:Step;title:string;patterns?:PaperPatterns;speed:number}|{project:DiagramProject;speed:number;pauseSeconds:number;sinkPauseSeconds?:number;range?:{first:number;last:number};viewStep?:number;view?:Step['clip']['camera'];operationIndex?:number})&{render?:BlenderRenderRequest};

// Each character describes the three edges opposite the corners of an
// exported triangle, in Blender's reversed winding (two bits per edge).
function materialInk(model:PreparedOrigamiModel,color:string){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const material=meshTopologyFor(model).edgeMaterial!;
  const key=(a:number,b:number)=>Math.min(a,b)*model.vertexCount+Math.max(a,b);
  const edges=new Map<number,number>();
  model.edgesVertices.forEach(([a,b],i)=>{
    if(material[i]){
      const assignment=model.edgesAssignment[i];
      edges.set(key(a,b),assignment==='B'?3:assignment==='F'?1:2);
    }
  });
  let masks='';
  for(let i=0;i<model.indices.length;i+=3){
    const a=model.indices[i],b=model.indices[i+2],c=model.indices[i+1];
    masks+=alphabet[(edges.get(key(b,c))??0)|((edges.get(key(c,a))??0)<<2)|((edges.get(key(a,b))??0)<<4)];
  }
  const p=model.originalPositions;
  let left=Infinity,right=-Infinity,near=Infinity,far=-Infinity;
  for(let i=0;i<p.length;i+=3){
    left=Math.min(left,p[i]);right=Math.max(right,p[i]);near=Math.min(near,p[i+2]);far=Math.max(far,p[i+2]);
  }
  return {masks,aspect:(right-left)/(far-near||1),color};
}

/** A temporary transfer for Blender, using the same solved poses as playback.
 * Per-step topology can change when the next CP subdivides a paper face. */
export function bakeBlenderAnimation(source:BlenderAnimationSource,onProgress:(message:string)=>void):Blob{
  const fps=24,session='project' in source?new DiagramPlaybackSequence(source.project):null;
  const count='project' in source?source.project.steps.length:1;
  const {first,last}=('project' in source&&source.range)||{first:0,last:count-1};
  if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||last>=count)throw Error('动画导出步骤范围无效。');
  const geometry:Blob[]=[],images:Blob[]=[],imageIds=new Map<string,number>();
  const texture=(url?:string)=>{
    if(!url)return null;
    const cached=imageIds.get(url);if(cached!==undefined)return cached;
    const comma=url.indexOf(','),mime=url.slice(5,url.indexOf(';'));
    const bytes=Uint8Array.from(atob(url.slice(comma+1)),c=>c.charCodeAt(0));
    const id=images.length;images.push(new Blob([bytes],{type:mime}));imageIds.set(url,id);return id;
  };
  const steps=[];
  let initialView:Mat3|undefined='project' in source&&source.view?viewRotationFor(source.view):undefined;
  let stepStart=1,frame:number|undefined;
  if(source.render?.kind==='png'&&(!Number.isInteger(source.render.stepIndex)||source.render.stepIndex<first||source.render.stepIndex>last||!Number.isFinite(source.render.progress)))throw Error('渲染帧位置无效。');
  for(let index=first,position=0;index<=last;){
    try{
      const entry='project' in source?session!.prepare(index,first,(_,message)=>onProgress(`第 ${index+1} 步 · ${message}`),position):source.step;
      const phase='project' in source?entry.automaticSinkPhase:undefined;
      const title='project' in source?`第 ${(source.operationIndex??index)+1} 步 ${source.project.steps[index].title||''}`.trim()+(phase===undefined?'':phase===0?' · 撑开纸层':' · 向内沉折'):source.title;
      const patterns='project' in source?source.project.basicSettings?.paperPatterns??readPaperPatterns(source.project.states.find(s=>s.id===source.project.steps[index].beforeId)?.doc.metadata?.paperPatterns):source.patterns;
      const {prepared,path}=diagramAnimationEvaluator(entry);
      if(!initialView||'project' in source&&!source.view&&source.viewStep===index&&entry.clip.camera)initialView=viewRotationFor(entry.clip.camera??DEFAULT_SIMULATION_VIEW);
      const layers=blenderLayerMesh(prepared,entry.plan.animation),vertexCount=layers?.vertices.length??prepared.vertexCount;
      const intervals=Math.max(1,Math.round(entry.duration*fps/(1000*source.speed)));
      const pause='project' in source&&(phase===0||index<last)
        ? playbackBoundaryPause(phase===0||!!entry.opensSink,source.pauseSeconds,source.sinkPauseSeconds):0;
      const hold=Math.round(Math.max(0,pause)*fps);
      if(source.render?.kind==='png'&&source.render.stepIndex===index&&(phase===undefined||sinkPhaseAt(source.render.progress)===phase)){
        frame=stepStart+Math.round(intervals*Math.max(0,Math.min(1,localProgressAt(phase,source.render.progress))));
      }
      stepStart+=intervals+hold;
      steps.push({title,vertices:vertexCount,triangles:prepared.faceCount,frames:intervals+1,hold,ink:materialInk(prepared,entry.clip.colors.line),
        front:entry.clip.colors.front,back:entry.clip.colors.back,frontImage:texture(patterns?.front),backImage:texture(patterns?.back)});
      const restUV=materialUV(prepared);
      const uv=layers?Float32Array.from(layers.vertices.flatMap(v=>[restUV[2*v],restUV[2*v+1]])):new Float32Array(restUV);
      // The workbench camera uses a reflected basis. Reflect the model into
      // Blender's Z-up world and reverse winding to retain the material front.
      const indices=new Uint32Array(layers?.indices??prepared.indices);
      for(let i=0;i<indices.length;i+=3){const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b;}
      geometry.push(new Blob([indices,uv]));
      const stride=vertexCount*3;
      const chunkFrames=Math.max(1,Math.min(fps,Math.floor(1024*1024/(stride*4))));
      for(let start=0;start<=intervals;start+=chunkFrames){
        onProgress(`${title} · 生成第 ${start+1} / ${intervals+1} 帧`);
        const frames=Math.min(chunkFrames,intervals+1-start),xyz=new Float32Array(frames*stride);
        for(let j=0;j<frames;j++){
          const progress=sinkMotionProgress(entry.sinkPoseClock,(start+j)/intervals),pose=path.evaluate(progress);
          const p=layers?.positionsAt(pose,progress)??pose,offset=j*stride;
          for(let i=0;i<p.length;i+=3){xyz[offset+i]=p[i];xyz[offset+i+1]=p[i+2];xyz[offset+i+2]=p[i+1];}
        }
        geometry.push(new Blob([xyz]));
      }
      if(phase===0)position=.5;
      else{index++;position=0;}
    }catch(e){throw Error(`${'project' in source?'第 '+(index+1)+' 步：':''}${e instanceof Error?e.message:e}`);}
  }
  const finalRender=source.render&&{kind:source.render.kind,frame};
  const header=new TextEncoder().encode(JSON.stringify({fps,initialView,steps,finalRender,images:images.map(i=>({bytes:i.size,mime:i.type}))}));
  const length=new ArrayBuffer(4);new DataView(length).setUint32(0,header.length,true);
  return new Blob(['ZZANIM01',length,header,...images,...geometry]);
}
