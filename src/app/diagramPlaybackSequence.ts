import {DiagramFullAnimationSession,type DiagramFullAnimationEntry} from './diagramFullAnimation';
import {selectAutomaticSinkGuide} from './diagramAutomaticSinkPlan';
import {diagramSinkGuide,findAutomaticSinkPattern} from './diagramSinkGuide';
import type {DiagramProject} from './diagramProject';
import {sinkPhaseAt} from './diagramPlaybackProgress';

/** Worker-local projection. Original step and CP indices remain public.
 * Only materialize a guide when the selected continuous range reaches it.
 * Previously solved clips retain their positions in the session's cache. */
export class DiagramPlaybackSequence {
  private working:DiagramProject;
  private session:DiagramFullAnimationSession;
  private start=0;
  private next=0;
  private firstLeg:number[]=[0];
  private sourceOfLeg:number[]=[];
  constructor(private source:DiagramProject){
    this.working={...source,steps:[...source.steps],states:[...source.states]};
    this.session=new DiagramFullAnimationSession(this.working);
  }
  prepare(index:number,start:number,progress:(index:number,message:string)=>void=()=>{},position=0):DiagramFullAnimationEntry {
    if(!Number.isInteger(index)||!Number.isInteger(start)||start<0||start>index||index>=this.source.steps.length||!Number.isFinite(position)||position<0||position>1)throw Error('演示步骤范围无效。');
    if(this.start!==start){
      this.working={...this.source,steps:[...this.source.steps],states:[...this.source.states]};
      this.session=new DiagramFullAnimationSession(this.working);
      this.next=start;this.start=start;this.firstLeg=[];this.firstLeg[start]=start;
      this.sourceOfLeg=[];
    }
    while(this.next<=index){
      const i=this.next,leg=this.firstLeg[i],step=this.source.steps[i],before=this.source.states[i],after=this.source.states[i+1];
      let count=1;
      try{
        const pattern=before?.id===step.beforeId&&after?.id===step.afterId?findAutomaticSinkPattern(before.doc,after.doc):undefined;
        if(pattern&&!diagramSinkGuide(this.source,step.id)){
          progress(i,'正在计算沉折撑开姿态…');
          const {project:legs,opening,closing}=selectAutomaticSinkGuide(this.source,i,pattern,message=>progress(i,message));
          this.working.steps.splice(leg,1,legs.steps[0],legs.steps[1]);
          this.working.states.splice(leg+1,0,legs.states[1]);
          // With a preceding step, prepare() must register both legs in that
          // step's world frame. At the range start the selected plans already fit.
          if(i===start)this.session.startWithPreparedSink(start,opening,closing);
          count=2;
        }
      }catch(error){throw Object.assign(new Error(error instanceof Error?error.message:'无法生成沉折中间态。'),{stepIndex:i});}
      this.sourceOfLeg[leg]=i;if(count===2)this.sourceOfLeg[leg+1]=i;
      this.firstLeg[++this.next]=leg+count;
    }
    const first=this.firstLeg[index],dual=this.firstLeg[index+1]-first===2,phase=dual?sinkPhaseAt(position):undefined;
    try{
      const entry=this.session.prepare(first+(phase??0),start,(v,t)=>progress(this.sourceOfLeg[v],t));
      const beforeLabel=phase===1?'沉折中间态':`CP${index}`,afterLabel=phase===0?'沉折中间态':`CP${index+1}`;
      return {...entry,index,automaticSinkPhase:phase,clip:{...entry.clip,beforeLabel,afterLabel}};
    }catch(error){
      const v=(error as {stepIndex?:number}).stepIndex;
      throw Object.assign(new Error(error instanceof Error?error.message:'无法准备当前步骤。'),{stepIndex:v!==undefined?this.sourceOfLeg[v]??index:index});
    }
  }
}
