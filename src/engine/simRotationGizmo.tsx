import {createRoot} from 'react-dom/client';
import DiagramRotationGizmo from '../components/DiagramRotationGizmo';
import {diagramSimulationSurfaceOrbitCamera,diagramSimulationSurfaceViewFromCamera} from '../app/diagramSimulationSurfaceCamera';
import type {SimulationPose} from './simPose';

/** Shared by the simulator workspace, capture dialogs and both animation players. */
export function mountSimulationRotationGizmo(read:()=>SimulationPose['view'],change:(view:SimulationPose['view'])=>void){
  const host=document.createElement('div');host.style.cssText='position:fixed;left:12px;bottom:48px;z-index:30';
  document.body.append(host);const root=createRoot(host);let shown=true,start:SimulationPose['view']|null=null;
  const render=()=>root.render(<><button type="button" onClick={()=>{shown=!shown;render();}} aria-pressed={shown} style={{position:'absolute',left:0,bottom:0,whiteSpace:'nowrap'}}>三轴旋转环</button>{shown&&<DiagramRotationGizmo camera={diagramSimulationSurfaceOrbitCamera(read())} onStart={()=>{start=structuredClone(read());}} onChange={camera=>change(diagramSimulationSurfaceViewFromCamera(start??read(),camera))} onEnd={(camera,cancelled)=>{const original=start??read();start=null;change(cancelled?original:diagramSimulationSurfaceViewFromCamera(original,camera));}}/>}</>);
  render();return render;
}
