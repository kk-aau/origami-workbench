import type {DiagramLocalLayerProbe} from '../app/diagramLocalLayerProbe';

export default function DiagramLocalLayers({probe,hidden=[]}:{probe:DiagramLocalLayerProbe|null;hidden?:readonly number[]}){
  if(!probe)return null;
  const confirmed=probe.order.status==='ordered';
  const row=(face:number,position:string,current=false)=><div key={face} className={'diagram-local-layer-row'+(current?' is-current':'')} data-local-layer-face={face} data-local-layer-position={position}><span>{position}</span><strong>F{face+1}</strong><small>{hidden.includes(face)?'已隐藏':current?'当前':''}</small></div>;
  return <aside className="diagram-local-layers" aria-label={probe.sampled?'纸面参考点的局部纸层':'鼠标位置的局部纸层'} data-local-layer-scope={probe.sampled?'sample':'pointer'} data-local-layer-status={probe.order.status}>
    <header><strong>此处纸层</strong><span>{probe.faces.length} 层重叠</span></header>
    {confirmed?<div className="diagram-local-layer-wheel">
      {probe.above.length?probe.above.map((face,i)=>row(face,`上 ${probe.above.length-i} 层`)):<p className="diagram-local-layer-edge">上方无纸层</p>}
      {row(probe.face,'当前纸面',true)}
      {probe.below.length?probe.below.map((face,i)=>row(face,`下 ${i+1} 层`)):<p className="diagram-local-layer-edge">下方无纸层</p>}
    </div>:<><div className="diagram-local-layer-wheel">{row(probe.face,'当前纸面',true)}</div><p className="diagram-local-layer-note">{probe.order.status!=='ordered'&&probe.order.message}</p></>}
    <footer>{probe.sampled?'纸面参考点':'仅此位置'} · 上下各两层</footer>
  </aside>;
}
