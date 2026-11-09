import {useState} from 'react';
import {exampleRingFourierCurve} from '../app/ringFourierCurves';
import {readTessParams,type TessParams} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';

type RingParams=Extract<TessParams,{family:'ring'}>;

function examples(rings:number){
  return {
    outerFourierCurves:Array.from({length:rings+1},exampleRingFourierCurve),
    creaseFourierCurves:Array.from({length:rings},exampleRingFourierCurve),
  };
}

export default function RingFourierDialog({params,onApply,onClose}:{params:RingParams;onApply:(next:RingParams)=>void;onClose:()=>void}){
  const [text,setText]=useState(()=>JSON.stringify({
    outerFourierCurves:params.outerFourierCurves??examples(params.rings).outerFourierCurves,
    creaseFourierCurves:params.creaseFourierCurves??examples(params.rings).creaseFourierCurves,
  },null,2));
  const [error,setError]=useState('');
  function apply(){
    try{
      const parsed:unknown=JSON.parse(text);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
        Object.keys(parsed).some(key=>key!=='outerFourierCurves'&&key!=='creaseFourierCurves'))
        throw Error('只接受 outerFourierCurves 和 creaseFourierCurves 两组曲线。');
      const curves=parsed as ReturnType<typeof examples>;
      const next=readTessParams({...params,
        outerProfiles:undefined,creaseProfiles:undefined,
        outerExpressions:undefined,creaseExpressions:undefined,
        outerVectors:undefined,creaseVectors:undefined,
        outerLinearMaps:undefined,creaseLinearMaps:undefined,
        outerFourierCurves:curves.outerFourierCurves,creaseFourierCurves:curves.creaseFourierCurves,
        outerSignedPowers:undefined,creaseSignedPowers:undefined,
        outerVectorExpressions:undefined,creaseVectorExpressions:undefined,outerVectorTemplate:undefined,creaseVectorTemplate:undefined,vectorFunctionDefinitions:undefined});
      if(!next||next.family!=='ring')throw Error('曲线组数、矩阵或扰动无效；需保持逆时针、单圈与有限幅度。');
      onApply(next);
    }catch(cause){setError((cause as Error).message);}
  }
  return <TessDialog title="二维傅里叶向量曲线" onClose={onClose}>
    <p className="note">每条曲线按 R·(offset + Σ Mₖ·[cos(kφ), sin(kφ)]) 构造。第一个矩阵是椭圆骨架，后续最多三个谐波可形成非椭圆的光滑曲线。外环需 {params.rings+1} 条，中间环需 {params.rings} 条；计算会验证单圈、严格嵌套与射线首次交点。φ 保留原版参数角含义。</p>
    <textarea className="tess-json" aria-label="二维傅里叶向量曲线 JSON" value={text} onChange={event=>{setText(event.target.value);setError('');}}/>
    {error&&<p role="alert">{error}</p>}
    <footer><button onClick={()=>{setText(JSON.stringify(examples(params.rings),null,2));setError('');}}>填入双峰曲线</button><button className="primary" onClick={apply}>采用二维曲线</button></footer>
  </TessDialog>;
}
