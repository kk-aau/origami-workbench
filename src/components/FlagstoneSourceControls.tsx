import {useState} from 'react';
import {TESS_NAMES,PRUNABLE,changeTessParams,readTessParams,type TessParams} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';

export default function FlagstoneSourceControls({params,onChange,onEdit}:{params:Extract<TessParams,{family:'flagstone'}>;onChange:(p:TessParams)=>void;onEdit?:()=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
 if(!params.motherParams)return <p className="note">其他母结构可通过“用于铺石”送入。</p>;
 return <><p className="note">母结构：{TESS_NAMES[params.motherParams.family]}</p><div className="tess-actions"><button onClick={()=>{if(onEdit){onEdit();return;}setText(JSON.stringify(params.motherParams,null,2));setError('');setOpen(true);}}>编辑铺石母参数</button><button onClick={()=>onChange(structuredClone(params.motherParams!))}>返回母结构</button></div>
 {open&&<TessDialog title="铺石母结构参数" onClose={()=>setOpen(false)}><p>修改母参数后重新生成铺石。铺石层旧对偶目标会清除；新母参数中的修剪和对偶设置按 JSON 内容读取。</p><textarea className="tess-json" aria-label="铺石母结构 JSON" value={text} onChange={e=>setText(e.target.value)}/>{error&&<p role="alert">{error}</p>}<footer><button className="primary" onClick={()=>{try{const p=readTessParams(JSON.parse(text));if(!p||!PRUNABLE.includes(p.family))throw Error('需要有效的平面母结构参数。');onChange(changeTessParams(params,{motherParams:p}));setOpen(false);}catch(e){setError((e as Error).message);}}}>采用铺石母参数</button></footer></TessDialog>}</>;
}
