import {useState} from 'react';
import {readTessParams,type TessParams} from '../app/tessellation';
import {hexFlasherSavedParams,fourRingFlasherParams,flasherFactorLimits,type FlasherParams} from '../app/flasherParams';
import FlasherP46ReadonlyDialog from './FlasherP46ReadonlyDialog';
import TessNumberField from './TessNumberField';

export default function FlasherControls({params,onChange}:{params:FlasherParams;onChange:(next:TessParams)=>void}){
  const [showReadonly,setShowReadonly]=useState<'Y'|'current'|null>(null);
  const limits=flasherFactorLimits(params);
  const change=(patch:Partial<FlasherParams>)=>{
    const next=readTessParams({...params,...patch});
    if(next)onChange(next);
  };
  return <>
    <div className="tess-pair">
      <TessNumberField label="环数 r" value={params.rings} min={1} max={limits.rings} step={1} onChange={rings=>change({rings})}/>
      <TessNumberField label="高度阶 h" value={params.heightOrder} min={1} max={limits.heightOrder} step={1} onChange={heightOrder=>change({heightOrder})}/>
    </div>
    <div className="tess-pair">
      <TessNumberField label="旋转阶 m" value={params.rotationalOrder} min={3} max={limits.rotationalOrder} step={1} onChange={rotationalOrder=>change({rotationalOrder})}/>
      <TessNumberField label="径向间隔 dr" value={params.radialIncrement} min={0} max={.5} step={.005} onChange={radialIncrement=>change({radialIncrement})}/>
    </div>
    <div className="tess-pair tess-small-selects">
      <label className="select-field">轻折对角线<select aria-label="Flasher 轻折对角线" value={params.diagonal} onChange={event=>change({diagonal:event.target.value as 'X'|'Y'|'Z'})}><option value="Y">Y · 默认</option><option value="Z">Z · 反向</option><option value="X">X · 棋盘</option></select></label>
      <TessNumberField label="山谷阈值 °" value={params.minimumAngleDeg} min={0} max={90} step={.5} onChange={minimumAngleDeg=>change({minimumAngleDeg})}/>
    </div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <button type="button" className="text-button" aria-label="载入 X 对角线静态 CP/FF 本地例" onClick={()=>{
      const next=readTessParams({family:'flasher',rings:3,heightOrder:2,rotationalOrder:5,
        radialIncrement:0,diagonal:'X',minimumAngleDeg:10});
      if(next)onChange(next);
    }}>X 棋盘 CP/FF · r3/h2/m5</button>
    <button type="button" className="text-button" aria-label="载入六角 Flasher 保存例 In[4197]" onClick={()=>{
      const next=readTessParams(hexFlasherSavedParams());
      if(next)onChange(next);
    }}>六角保存例 · In[4197]</button>
    <button type="button" className="text-button" aria-label="载入四环 Flasher 静态 CP/FF 本地例" onClick={()=>{
      const next=readTessParams(fourRingFlasherParams());
      if(next)onChange(next);
    }}>四环 CP/FF · r4/h1/m5</button>
    <button type="button" className="text-button" aria-label="打开 Flasher 完整首扇区标签" onClick={()=>setShowReadonly('current')}>
      完整首扇区标签</button>
    <button type="button" className="text-button" aria-label="打开 Flasher 原版固定图只读入口" onClick={()=>setShowReadonly('Y')}>
      原图 · In[4131/32/4206]</button>
    </div>
    <p className="note">原版 MakeFlasher：二维展开 CP 与逐面等距的静态三维 FF，四边形沿 X/Y/Z 对角线弯曲；不表示平折层序。{params.diagonal==='X'&&' X 拓扑来自 In[4122]/[4123]；一键例本地取 dr=0、山谷阈值 10°，原保存图没有这两个参数。继续调参以当前输入为准。'}</p>
    {showReadonly&&<FlasherP46ReadonlyDialog initialVariant={showReadonly} currentParams={params} onClose={()=>setShowReadonly(null)}/>}
  </>;
}
