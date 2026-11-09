import {defaultModelColors,type ModelColors} from '../app/modelColors';
import ColorPicker from '../ui/ColorPicker';
export default function ModelColorControls({colors,onChange}:{colors:ModelColors;onChange:(colors:ModelColors)=>void}){
  return <details style={{position:'relative'}}><summary style={{cursor:'pointer',padding:'8px'}}>模型配色</summary>
    <div style={{position:'absolute',top:'100%',left:0,width:220,padding:12,background:'#fffefb',border:'1px solid #bac8b8',borderRadius:4,zIndex:20,boxShadow:'0 4px 16px #20352b22'}}>
      {(['front','back','line'] as const).map((key,i)=><label key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>{['纸张正面','纸张背面','模型边线'][i]}<ColorPicker aria-label={['模型正面颜色','模型背面颜色','模型边线颜色'][i]} value={colors[key]} onChange={color=>onChange({...colors,[key]:color})}/></label>)}
      <button onClick={()=>onChange(defaultModelColors())}>恢复默认配色</button>
      <p>仅改变模型显示及当前图像导出；随模型集合保存，不改变山谷或层序。</p>
    </div>
  </details>;
}
