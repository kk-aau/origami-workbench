import type {ReactNode} from 'react';
import type {ModelColors} from '../app/modelColors';
import type {ModelViewLayout} from '../app/modelViewState';
import ColorPicker from '../ui/ColorPicker';
import './FoldDisplayBar.css';

export default function FoldDisplayBar({xray,onXray,back,onBack,colors,onColors,onRotate,onFit,layout='single',onLayout,children,kind='flat'}:{xray:boolean;onXray:(value:boolean)=>void;back:boolean;onBack:(value:boolean)=>void;colors:ModelColors;onColors:(value:ModelColors)=>void;onRotate:(delta:number)=>void;onFit:()=>void;layout?:ModelViewLayout;onLayout?:(value:ModelViewLayout)=>void;children?:ReactNode;kind?:'flat'|'rigid'|'spatial'|'curve'}){
 const rigid=kind!=='flat',label=kind==='curve'?'曲面':kind==='rigid'?'刚性三维':kind==='spatial'?'静态三维':'平折';
 return <div className="fold-display-bar" role="toolbar" aria-label={`${label}图像显示`}>
  {kind!=='curve'&&<><button aria-pressed={!xray} onClick={()=>onXray(false)} title={kind==='rigid'?'不透明静态刚性纸面':kind==='spatial'?'不透明静态三维纸面':'不透明纸面；层序状态见画布提示'}>实体</button>
  <button aria-pressed={xray} onClick={()=>onXray(true)} title={rigid?'线框显示所有三维边':'透视 / X 光：半透明显示内部纸面'}>{rigid?'线框':'透视'}</button></>}
  <span className="fold-bar-divider"/>
  <button aria-pressed={layout==='single'&&!back} onClick={()=>{onLayout?.('single');onBack(false);}}>正面</button><button aria-pressed={layout==='single'&&back} onClick={()=>{onLayout?.('single');onBack(true);}}>背面</button>
  {!rigid&&onLayout&&<button aria-pressed={layout==='both'} onClick={()=>onLayout(layout==='both'?'single':'both')} title="同一个折叠结果的正面、背面并排显示，无需重新计算">正背同显</button>}
  <button aria-label={`${label}逆时针旋转45度`} title="逆时针 45°" onClick={()=>onRotate(-45)}>↶</button><button aria-label={`${label}顺时针旋转45度`} title="顺时针 45°" onClick={()=>onRotate(45)}>↷</button>
  <button aria-label={`复位${label}图像位置`} title="复位模型位置与缩放；可直接拖动模型，滚轮缩放" onClick={onFit}>复位</button>
  <span className="fold-bar-divider"/>
  {(['front','back','line'] as const).map((key,i)=><label key={key} title={['FC · 纸张正面颜色','BC · 纸张背面颜色','LC · 边线颜色'][i]}><ColorPicker aria-label={`${label}${['正面颜色','背面颜色','边线颜色'][i]}`} value={colors[key]} onChange={color=>onColors({...colors,[key]:color})}/><span>{['FC','BC','LC'][i]}</span></label>)}
  {children}
 </div>;
}
