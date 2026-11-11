import type {SimulationCreaseStyle,SimulationCameraPreset,SimulationDisplayMode,SimulationDisplayOptions} from './simDisplay';
import type {SimulationSolverSettings} from './simSettings';
import type {SimulationMeshQuality} from './simFlexibleMesh';
import type {SimulationLayerOrder} from './simLayerOrder';
import type {SimulationStepAnimation} from './simStepAnimation';
import {validateSimulationPose,type SimulationPose} from './simPose';
import type {SimulationAngleDiagnostics,SimulationSolveState} from './simConvergence';

export interface SimulationImageCapture {
  dataUrl:string;
  width:number;
  height:number;
}

export interface SimulationImageCaptureOptions {
  scale?:1|2|4;
  transparent?:boolean;
  timeoutMs?:number;
  signal?:AbortSignal;
}

export type SimulationImageCaptureReply = {
  type:'zhezhi-sim-image';
  requestId:string;
  revision:string|number;
} & ({image:SimulationImageCapture;error?:never}|{error:string;image?:never});

/** Same-origin boundary between the document UI and the isolated simulation view. */
export interface SimulatorStatus {
  type: 'zhezhi-sim-status';
  status: 'ready' | 'loaded' | 'error' | 'running' | 'paused';
  message: string;
  revision?: string | number;
  backend?: 'webgl2' | 'cpu';
  strain?: number;
  steps?: number;
  view?: SimulationCameraPreset | 'free';
  creaseStyle?: SimulationCreaseStyle;
  warnings?: string[];
  error?: string;
  layerOrder?: 'pending' | 'ready' | 'unavailable';
  layerDisplay?: 'inactive' | 'blending' | 'active';
  layerMessage?: string;
  layerCount?: number;
  layerGapMultiplier?:number;
  layerGap?:number;
  layerGapError?:string;
  /** Step playback uses the preceding folded pose, with per-crease targets. */
  animation?:boolean;
  progress?:number;
  solverSettings?:SimulationSolverSettings;
  displayOptions?:SimulationDisplayOptions;
  meshQuality?:SimulationMeshQuality;
  meshVertices?:number;
  meshTriangles?:number;
  collisionEnabled?:boolean;
  collisionMessage?:string;
  frameSteps?:number;
  maxVelocity?:number;
  meanNodalStrain?:number;
  poseRestored?:boolean;
  pinnedVertices?:number;
  canUndoPose?:boolean;
  canRedoPose?:boolean;
  poseEditRevision?:number;
  interactionActive?:boolean;
  /** Numerical rest is distinct from reaching the requested crease angles. */
  solveState?:SimulationSolveState;
  angleDiagnostics?:SimulationAngleDiagnostics;
}

export type SimulatorCommand =
  | { type: 'zhezhi-sim-load'; fold: unknown; revision: string | number; animation?:SimulationStepAnimation; pose?:SimulationPose; mesh?:SimulationMeshQuality; limitFoldAngles?:boolean }
  | { type: 'zhezhi-sim-fold-limit'; enabled:boolean }
  | { type: 'zhezhi-sim-mesh'; quality:SimulationMeshQuality }
  | { type: 'zhezhi-sim-collision'; enabled:boolean }
  | { type: 'zhezhi-sim-capture-pose'; requestId:string; revision:string|number; finishGesture?:boolean }
  | { type: 'zhezhi-sim-undo-pose'|'zhezhi-sim-redo-pose' }
  | { type: 'zhezhi-sim-layer-order'; revision: string | number; order: SimulationLayerOrder | null; state: 'pending' | 'ready' | 'unavailable'; message?: string }
  | { type: 'zhezhi-sim-progress'; value: number }
  | { type: 'zhezhi-sim-clear'; revision: string | number }
  | { type: 'zhezhi-sim-view'; mode: SimulationDisplayMode }
  | { type: 'zhezhi-sim-display-settings'; settings:Partial<SimulationDisplayOptions> }
  | { type: 'zhezhi-sim-solver-settings'; settings:Partial<SimulationSolverSettings> }
  | { type: 'zhezhi-sim-crease-style'; style: SimulationCreaseStyle }
  | { type: 'zhezhi-sim-camera'; preset: SimulationCameraPreset }
  | { type: 'zhezhi-sim-camera-pose'; view: import('./simPose').SimulationPose['view'] }
  | { type: 'zhezhi-sim-camera-frame'; revision:string; center:[number,number,number]; radius:number }
  | { type: 'zhezhi-sim-material'; creaseStiffness:number; damping:number }
  | { type: 'zhezhi-sim-layer-gap'; multiplier:number }
  | { type: 'zhezhi-sim-colors'; front:string; back:string; line?:string; diagramLine?:string }
  | { type: 'zhezhi-sim-step' | 'zhezhi-sim-export-fold' | 'zhezhi-sim-export-svg' | 'zhezhi-sim-export-obj' | 'zhezhi-sim-export-stl' }
  | { type: 'zhezhi-sim-export-png'; scale?:1|2|4 }
  | { type: 'zhezhi-sim-capture-image'; requestId:string; revision:string|number; scale:1|2|4; transparent:boolean }
  | { type: 'zhezhi-sim-reset' | 'zhezhi-sim-pause' | 'zhezhi-sim-resume' | 'zhezhi-sim-ping' };

type PendingImageCapture={revision:string|number;resolve:(image:SimulationImageCapture)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;removeAbort?:()=>void};
let bridgeSession=0;

/** Queues messages until the iframe has installed its listeners. Dispose on unmount. */
export class SimulatorBridge {
  private ready = false;
  private pending: SimulatorCommand[] = [];
  private currentRevision: string | number | undefined;
  private loadedRevision: string | number | undefined;
  private disposed=false;
  private imageSequence=0;
  private readonly imageSession=++bridgeSession;
  private imageCaptures=new Map<string,PendingImageCapture>();
  private poseCaptures=new Map<string,{revision:string|number;resolve:(pose:SimulationPose)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private iframe: HTMLIFrameElement, private onStatus: (status: SimulatorStatus) => void) {
    window.addEventListener('message', this.receive);
    iframe.addEventListener('load', this.frameLoaded);
    this.ping();
  }
  private ping = () => {
    this.iframe.contentWindow?.postMessage({ type: 'zhezhi-sim-ping' }, location.origin);
  };
  private frameLoaded = () => {
    this.rejectImageCaptures('模拟视图已重新载入，请等待模型就绪后重新截取。');
    this.ping();
  };
  private receive = (event: MessageEvent) => {
    if (this.disposed || event.origin !== location.origin || event.source !== this.iframe.contentWindow) return;
    if(event.data?.type==='zhezhi-sim-pose'){
      const reply=event.data,capture=this.poseCaptures.get(reply.requestId);
      if(!capture||reply.revision!==capture.revision||reply.revision!==this.currentRevision)return;
      this.poseCaptures.delete(reply.requestId);clearTimeout(capture.timer);
      try{if(typeof reply.error==='string')throw new Error(reply.error.slice(0,500));capture.resolve(validateSimulationPose(reply.pose));}catch(error){capture.reject(error instanceof Error?error:new Error('三维姿态无效。'));}return;
    }
    const reply=event.data as SimulationImageCaptureReply|undefined;
    if(reply?.type==='zhezhi-sim-image'){
      const capture=this.imageCaptures.get(reply.requestId);
      if(!capture||reply.revision!==capture.revision||reply.revision!==this.currentRevision)return;
      if(typeof reply.error==='string')this.finishImageCapture(reply.requestId,new Error(reply.error.slice(0,500)));
      else{
        const image=reply.image;
        if(!image||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.width>8192||image.height>8192||image.width*image.height>16_000_000||typeof image.dataUrl!=='string'||!/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i.test(image.dataUrl)){
          this.finishImageCapture(reply.requestId,new Error('模拟视图返回的 PNG 图像无效，请重新截取。'));
        }else this.finishImageCapture(reply.requestId,undefined,{dataUrl:image.dataUrl,width:image.width,height:image.height});
      }
      return;
    }
    const status = event.data as SimulatorStatus | undefined;
    if (!status || status.type !== 'zhezhi-sim-status') return;
    if (status.status === 'ready') {
      if(status.revision===undefined&&this.loadedRevision!==undefined){
        this.loadedRevision=undefined;
        this.rejectImageCaptures('模拟视图已重新载入，请等待模型就绪后重新截取。');
      }
      this.ready = true;
      for (const message of this.pending) this.post(message);
      this.pending = [];
    }
    if (status.revision !== undefined && status.revision !== this.currentRevision) return;
    if(status.status==='loaded')this.loadedRevision=status.revision;
    if(status.status==='error'){
      this.loadedRevision=undefined;
      this.rejectImageCaptures(status.error||'当前模拟无法截取，请重新载入有效模型。');
    }
    this.onStatus(status);
  };
  private post(message: SimulatorCommand) {
    this.iframe.contentWindow?.postMessage(message, location.origin);
  }
  send(message: SimulatorCommand) {
    if(this.disposed)return;
    if (message.type === 'zhezhi-sim-load' || message.type === 'zhezhi-sim-clear') {
      this.rejectImageCaptures('模拟模型或步骤已切换，请重新截取当前画面。');
      this.currentRevision = message.revision;
      this.loadedRevision=undefined;
      this.pending = [];
    }
    if (this.ready) this.post(message);
    else this.pending.push(message);
  }
  /** Finish the current pointer gesture for manual saves. Background saves can
   * pass finishGesture:false and retry later if an interaction is active. */
  async capturePose(options:{finishGesture?:boolean}={}):Promise<SimulationPose>{
    if(this.disposed||!this.ready||this.currentRevision===undefined||this.loadedRevision!==this.currentRevision)throw new Error('请等待三维模型载入完成后再保存完整作品。');
    const requestId=`sim-pose-${this.imageSession}-${++this.imageSequence}`,revision=this.currentRevision;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.poseCaptures.delete(requestId);reject(new Error('三维姿态保存超时，请重试。'));},15000);
      this.poseCaptures.set(requestId,{revision,resolve,reject,timer});
      try{this.post({type:'zhezhi-sim-capture-pose',requestId,revision,...(options.finishGesture===false?{finishGesture:false}:{})});}catch{clearTimeout(timer);this.poseCaptures.delete(requestId);reject(new Error('无法连接三维视图。'));}
    });
  }
  /** Captures the current pose and camera without advancing or pausing playback. */
  async captureImage(options:SimulationImageCaptureOptions={}):Promise<SimulationImageCapture>{
    if(this.disposed)throw new Error('模拟视图已关闭，请重新打开后截取。');
    if(!this.ready||this.currentRevision===undefined||this.loadedRevision!==this.currentRevision)throw new Error('请等待三维模型载入完成后再截取。');
    if(!this.iframe.contentWindow)throw new Error('模拟视图尚未连接，请重新打开后截取。');
    const scale=options.scale??1,timeoutMs=options.timeoutMs??15000;
    if(![1,2,4].includes(scale))throw new Error('截图分辨率倍数无效，请选择 1×、2×或 4×。');
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Error('截图等待时间无效，请设置 1 至 60000 毫秒。');
    if(options.signal?.aborted)throw new Error('本次截图已取消。');
    const requestId=`sim-image-${this.imageSession}-${++this.imageSequence}`,revision=this.currentRevision;
    return new Promise<SimulationImageCapture>((resolve,reject)=>{
      const timer=setTimeout(()=>this.finishImageCapture(requestId,new Error('截取模拟图片超时，请确认模拟视图可用后重试。')),timeoutMs);
      const capture:PendingImageCapture={revision,resolve,reject,timer};
      this.imageCaptures.set(requestId,capture);
      if(options.signal){
        const abort=()=>this.finishImageCapture(requestId,new Error('本次截图已取消。'));
        options.signal.addEventListener('abort',abort,{once:true});
        capture.removeAbort=()=>options.signal!.removeEventListener('abort',abort);
      }
      try{this.post({type:'zhezhi-sim-capture-image',requestId,revision,scale,transparent:options.transparent??true});}
      catch{this.finishImageCapture(requestId,new Error('无法连接模拟视图，请重新打开后截取。'));}
    });
  }
  private finishImageCapture(requestId:string,error?:Error,image?:SimulationImageCapture){
    const capture=this.imageCaptures.get(requestId);if(!capture)return;
    this.imageCaptures.delete(requestId);clearTimeout(capture.timer);capture.removeAbort?.();
    if(error)capture.reject(error);else if(image)capture.resolve(image);
  }
  private rejectImageCaptures(message:string){
    for(const requestId of this.imageCaptures.keys())this.finishImageCapture(requestId,new Error(message));
    for(const capture of this.poseCaptures.values()){clearTimeout(capture.timer);capture.reject(new Error(message));}this.poseCaptures.clear();
  }
  dispose() {
    if(this.disposed)return;
    this.post({ type: 'zhezhi-sim-pause' });
    this.disposed=true;
    this.rejectImageCaptures('模拟视图已关闭，本次截图已取消。');
    window.removeEventListener('message', this.receive);
    this.iframe.removeEventListener('load', this.frameLoaded);
    this.pending = [];
  }
}
