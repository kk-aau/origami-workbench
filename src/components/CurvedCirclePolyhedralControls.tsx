import {readTessParams,type TessParams} from '../app/tessellation';
import type {CurvedCirclePolyhedralParams} from '../app/curvedCirclePolyhedralParams';
import TessNumberField from './TessNumberField';

export default function CurvedCirclePolyhedralControls({params,onChange}:{
  params:CurvedCirclePolyhedralParams;onChange:(next:TessParams)=>void;
}){
  const change=(patch:Partial<CurvedCirclePolyhedralParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next)onChange(next);
  };
  return <>
    <div className="tess-pair">
      <TessNumberField label="空间折角 γ · °" value={params.foldAngleDeg} min={30} max={150}
        step={1} onChange={foldAngleDeg=>change({foldAngleDeg})}/>
      <TessNumberField label="圆弧段数" value={params.curveSegments} min={4} max={96}
        step={1} onChange={curveSegments=>change({curveSegments})}/>
    </div>
    <div className="tess-pair">
      <TessNumberField label="圆弧起点 / π" value={params.parameterStartPi} min={0}
        max={params.parameterEndPi-.01} step={.01}
        onChange={parameterStartPi=>change({parameterStartPi})}/>
      <TessNumberField label="圆弧终点 / π" value={params.parameterEndPi}
        min={params.parameterStartPi+.01} max={1} step={.01}
        onChange={parameterEndPi=>change({parameterEndPi})}/>
    </div>
    <div className="tess-pair">
      <TessNumberField label="左侧宽度" value={params.leftWidth} min={.05}
        max={Math.min(4,(1-1e-8)/Math.cos(params.foldAngleDeg*Math.PI/360))}
        step={.05} onChange={leftWidth=>change({leftWidth})}/>
      <TessNumberField label="右侧宽度" value={params.rightWidth} min={.05}
        max={4} step={.05} onChange={rightWidth=>change({rightWidth})}/>
    </div>
    <TessNumberField label="山谷阈值 · °" value={params.minimumAngleDeg}
      min={0} max={90} step={.5} onChange={minimumAngleDeg=>change({minimumAngleDeg})}/>
    <p className="note">In[3992]/[3995] 圆弧跨面构造的逐面精确等距多面体近似。空间圆弧采样点来自原版解析式；二维扇角按弦长修正。可采用为静态三维纸张，不等同于原光滑曲面或平折层序。</p>
  </>;
}
