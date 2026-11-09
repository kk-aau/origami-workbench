import {readTessParams,type TessParams} from '../app/tessellation';
import type {LinkedFirstBandPolyhedralParams} from '../app/linkedFirstBandPolyhedralParams';
import TessNumberField from './TessNumberField';

export default function LinkedFirstBandPolyhedralControls({params,onChange}:{
  params:LinkedFirstBandPolyhedralParams;onChange:(next:TessParams)=>void;
}){
  const change=(patch:Partial<LinkedFirstBandPolyhedralParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next)onChange(next);
  };
  return <>
    <div className="tess-pair">
      <TessNumberField label="曲线分段" value={params.curveSegments}
        min={8} max={96} step={1} onChange={curveSegments=>change({curveSegments})}/>
      <TessNumberField label="山谷阈值 · °" value={params.minimumAngleDeg}
        min={0} max={90} step={.5} onChange={minimumAngleDeg=>change({minimumAngleDeg})}/>
    </div>
    <p className="note">原版 In[4086] 保存的非零扰动同心圆首带；以真实三维样点构成三角纸面，再逐面展开为同索引 CP。可采用静态等距多面体近似；后续四带仍缺严格构造，不表示平折层序。</p>
  </>;
}
