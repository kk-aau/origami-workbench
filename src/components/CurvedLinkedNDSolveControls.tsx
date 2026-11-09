import type {LinkedFirst3DIntegration} from '../app/curvedLinkedNDSolveOptions';
import './CurvedLinkedNDSolveControls.css';
export default function CurvedLinkedNDSolveControls({maxSteps,maxStepSize,onChange,integration}:{maxSteps:string;maxStepSize:string;
 onChange:(key:'stepMaxSteps'|'stepMaxSize',value:string)=>void;integration?:LinkedFirst3DIntegration}){
 return <fieldset className="linked-first3d-steps"><legend>首 First3D · 原 NDSolve 步选项</legend>
  <label><span>MaxSteps</span><input aria-label="关联首First3D MaxSteps" type="number" min="1" max="4096" step="1" placeholder="留空沿用当前求解" value={maxSteps} onChange={e=>onChange('stepMaxSteps',e.target.value)}/></label>
  <label><span>MaxStepSize</span><input aria-label="关联首First3D MaxStepSize" type="number" min="0.000001" step="any" placeholder="原 s 参数步长" value={maxStepSize} onChange={e=>onChange('stepMaxSize',e.target.value)}/></label>
  <button onClick={()=>{onChange('stepMaxSteps','512');onChange('stepMaxSize','.02');}}>采用首段步控制示例</button>
  {integration&&<span className="linked-step-usage" data-testid="linked-first3d-step-usage">原 s 完整域 · {integration.stepOptions.forwardSteps} 成功步</span>}
 </fieldset>;
}
