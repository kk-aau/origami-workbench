import {useState} from 'react';
import {changeTessParams,readTessParams,tessPreset,TESS_NAMES,
  type TessParams,type TessFamily} from '../app/tessellation';
import {primalDualIn3354Params} from '../app/primalDualIn3354';
import {primalDualIn3386Params} from '../app/primalDualIn3386';
import {TessDialog} from './TessellationEditor';

export {PRIMAL_DUAL_MOTHER_FAMILIES} from '../app/nestedMotherParams';
import {PRIMAL_DUAL_MOTHER_FAMILIES} from '../app/nestedMotherParams';

export default function PrimalDualSourceControls({params,onChange,onEdit}:{
  params:Extract<TessParams,{family:'primal-dual'}>;onChange:(p:TessParams)=>void;onEdit?:()=>void}){
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
  const edit=()=>{
    if(onEdit){onEdit();return;}
    setText(JSON.stringify(params.motherParams??tessPreset('custom'),null,2));
    setError('');setOpen(true);
  };
  const apply=()=>{
    try{
      const source=readTessParams(JSON.parse(text));
      if(!source||!PRIMAL_DUAL_MOTHER_FAMILIES.includes(source.family)||
        source.family==='ring'&&source.ringMode==='origamica')
        throw Error('需要有效的有限平面母结构参数；原版环状传播和递归原始—对偶不可作为母结构。');
      const {paper:_paper,...withoutPaper}=source;
      onChange(changeTessParams(params,{motherParams:withoutPaper,paper:undefined,
        pruneBoundary:undefined,dualTargets:undefined,dualEdgeFlips:undefined,
        visibleTopFace:undefined,faceupFace:undefined}));
      setOpen(false);
    }catch(cause){setError((cause as Error).message);}
  };
  return <>
    <button type="button" className="outline primal-dual-saved-example"
      title="Origamica 第 39 节 In[3354]：2×2 方格、γ=2、α=20°、逆时针、原始面定向、FaceupFace=3"
      onClick={()=>onChange(primalDualIn3354Params())}>载入 2×2 保存例 · In[3354]</button>
    <button type="button" className="outline primal-dual-saved-example"
      title="Origamica 第 40 节 In[3386]：11 扇区、半径 1/2/4、不含中心点、径向优先定向、γ=2、α=20°、CW、FaceupFace=1；采用仍须实时层序已解"
      onClick={()=>onChange(primalDualIn3386Params())}>载入旋转梯形诊断例 · In[3386]</button>
    {params.motherParams?<><p className="note">当前母结构：{TESS_NAMES[params.motherParams.family]}。沿原图求垂直对偶，再构造扭转候选。</p>
      <div className="tess-actions"><button className="text-button" onClick={edit}>编辑母结构参数</button>
        <button className="text-button" onClick={()=>onChange(structuredClone(params.motherParams!))}>返回母结构</button>
        <button className="text-button" onClick={()=>onChange(changeTessParams(params,{motherParams:undefined,dualEdgeFlips:undefined,visibleTopFace:undefined,faceupFace:undefined}))}>恢复内置母结构</button></div></>
      :<button className="text-button" onClick={edit}>输入自定义母结构参数</button>}
    {open&&<TessDialog title="原始—对偶母结构参数" onClose={()=>setOpen(false)}>
      <p>输入周期、混合、非周期、自定义网格或普通环状母结构的参数。生成后分别检查几何、局部平折与整片层序。</p>
      <textarea className="tess-json" aria-label="原始对偶母结构 JSON" value={text}
        onChange={event=>setText(event.target.value)}/>
      {error&&<p role="alert">{error}</p>}
      <footer><button className="primary" onClick={apply}>采用母结构参数</button></footer>
    </TessDialog>}
  </>;
}
