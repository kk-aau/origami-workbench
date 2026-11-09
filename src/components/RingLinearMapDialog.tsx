import {useState} from 'react';
import {identityRingLinearMap} from '../app/ringLinearMaps';
import {readTessParams,type TessParams} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';

type RingParams=Extract<TessParams,{family:'ring'}>;

function mapsFor(rings:number,sheared=false){
  const matrix=()=>sheared?[[1.12,.2],[.08,.92]]:identityRingLinearMap();
  return {
    outerLinearMaps:Array.from({length:rings+1},matrix),
    creaseLinearMaps:Array.from({length:rings},matrix),
  };
}

/** A certified vector-valued subset of Origamica pfn/rfn, separate from polar radius formulas. */
export default function RingLinearMapDialog({params,onApply,onClose}:{params:RingParams;onApply:(next:RingParams)=>void;onClose:()=>void}){
  const [text,setText]=useState(()=>JSON.stringify({
    outerLinearMaps:params.outerLinearMaps??mapsFor(params.rings).outerLinearMaps,
    creaseLinearMaps:params.creaseLinearMaps??mapsFor(params.rings).creaseLinearMaps,
  },null,2));
  const [error,setError]=useState('');
  function apply(){
    try{
      const parsed:unknown=JSON.parse(text);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
        Object.keys(parsed).some(key=>key!=='outerLinearMaps'&&key!=='creaseLinearMaps'))throw Error('只接受 outerLinearMaps 和 creaseLinearMaps 两组矩阵。');
      const maps=parsed as ReturnType<typeof mapsFor>;
      const next=readTessParams({...params,
        outerProfiles:undefined,creaseProfiles:undefined,
        outerExpressions:undefined,creaseExpressions:undefined,
        outerVectors:undefined,creaseVectors:undefined,
        outerLinearMaps:maps.outerLinearMaps,creaseLinearMaps:maps.creaseLinearMaps,
        outerFourierCurves:undefined,creaseFourierCurves:undefined,
        outerSignedPowers:undefined,creaseSignedPowers:undefined,
        outerVectorExpressions:undefined,creaseVectorExpressions:undefined,outerVectorTemplate:undefined,creaseVectorTemplate:undefined,vectorFunctionDefinitions:undefined});
      if(!next||next.family!=='ring')throw Error('矩阵组数或数值无效；每个矩阵须保持逆时针、非退化且不过度拉伸。');
      onApply(next);
    }catch(cause){setError((cause as Error).message);}
  }
  return <TessDialog title="二维线性椭圆曲线" onClose={onClose}>
    <p className="note">每条曲线由半径 R 与矩阵 A 给出：R·A·[cos φ, sin φ]。外环需 {params.rings+1} 个矩阵，中间环需 {params.rings} 个。仅接受逆时针、非退化的椭圆；计算会解析检查整圈嵌套与射线首次交点。修改后保存在工程参数中。</p>
    <textarea className="tess-json" aria-label="二维线性椭圆矩阵 JSON" value={text} onChange={event=>{setText(event.target.value);setError('');}}/>
    {error&&<p role="alert">{error}</p>}
    <footer><button onClick={()=>{setText(JSON.stringify(mapsFor(params.rings,true),null,2));setError('');}}>填入剪切椭圆</button><button className="primary" onClick={apply}>采用二维曲线</button></footer>
  </TessDialog>;
}
