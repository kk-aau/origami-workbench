import {useState} from 'react';
import {buildFlasherXSavedTopology,type FlasherXDiagonal,type FlasherXPoint} from '../app/flasherXSavedTopology';
import {buildFlasherYzSavedTopology} from '../app/flasherYzSavedTopology';
import {TessDialog} from './TessellationEditor';
import './FlasherXSavedTopologyDialog.css';

type Variant='X'|'Y'|'Z';
const topologies={X:buildFlasherXSavedTopology(),Y:buildFlasherYzSavedTopology('Y'),
  Z:buildFlasherYzSavedTopology('Z')};
type Region='all'|'minor'|'major';
const point=([x,y]:FlasherXPoint)=>`${x.toPrecision(9)},${(-y).toPrecision(9)}`;
const label=([i,j,k]:[number,number,number])=>`(${i}, ${j}, ${k})`;
const allPoints=topologies.X.diagonals.flatMap(item=>item.quadCoords);
const xs=allPoints.map(([x])=>x),ys=allPoints.map(([,y])=>-y);
const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
const pad=Math.max(x1-x0,y1-y0)*.09;
const viewBox=`${x0-pad} ${y0-pad} ${x1-x0+2*pad} ${y1-y0+2*pad}`;

function Diagram({visible,selected,variant}:{visible:FlasherXDiagonal[];selected:FlasherXDiagonal;variant:Variant}){
  return <svg role="img" data-testid="flasher-saved-topology" data-variant={variant} viewBox={viewBox}
    aria-label={`Flasher 首扇区 ${variant} 对角线，初始二维种子拓扑`} preserveAspectRatio="xMidYMid meet">
    {visible.map(item=><polygon key={`q${item.sourceQuadIndex}`} className={`fx-quad ${item.region}`}
      points={item.quadCoords.map(point).join(' ')}/>)}
    {visible.map(item=><line key={`d${item.sourceQuadIndex}`} data-testid="flasher-saved-diagonal"
      className={`fx-line ${item.region} ${item.sourceQuadIndex===selected.sourceQuadIndex?'active':''}`}
      vectorEffect="non-scaling-stroke" x1={item.endpointCoords[0][0]} y1={-item.endpointCoords[0][1]}
      x2={item.endpointCoords[1][0]} y2={-item.endpointCoords[1][1]}/>)}
    <circle className="fx-point" cx={selected.endpointCoords[0][0]}
      cy={-selected.endpointCoords[0][1]} r={Math.max(x1-x0,y1-y0)*.012}/>
    <circle className="fx-point" cx={selected.endpointCoords[1][0]}
      cy={-selected.endpointCoords[1][1]} r={Math.max(x1-x0,y1-y0)*.012}/>
  </svg>;
}

/** Three saved source drawings, separate from the solved Y/Z Flasher path. */
export default function FlasherXSavedTopologyDialog({onClose,initialVariant='X'}:{onClose:()=>void;initialVariant?:Variant}){
  const [variant,setVariant]=useState<Variant>(initialVariant);
  const [region,setRegion]=useState<Region>('all');
  const [selectedIndex,setSelectedIndex]=useState(0);
  const topology=topologies[variant];
  const visible=topology.diagonals.filter(item=>region==='all'||item.region===region);
  const selected=topology.diagonals[selectedIndex];
  const chooseRegion=(next:Region)=>{
    setRegion(next);
    if(next!=='all'&&selected.region!==next)
      setSelectedIndex(topology.diagonals.findIndex(item=>item.region===next));
  };
  const chooseVariant=(next:Variant)=>{setVariant(next);setRegion('all');setSelectedIndex(0);};
  return <TessDialog title="第 46 节 · Flasher X/Y/Z 对角线保存例" onClose={onClose}>
    <div className="flasher-x-dialog">
      <aside className="fx-sidebar">
        <span className="fx-kicker">{variant==='X'?'IN[4123] / LLNL ARRANGEMENT':
          variant==='Y'?'IN[4125] / ZIRBEL DIRECTION':'IN[4127] / REVERSE DIRECTION'}</span>
        <h2>首扇区对角线</h2>
        <p>固定原版保存输入 r=3、h=2、m=5、k=0、n=6。{variant==='X'?<>
          线段按 In[4122] 的棋盘式选取。</>:<>
          {variant} 线段按 In[{variant==='Y'?'4124':'4126'}] 对每个四边形统一选取{variant==='Y'?'顶点 1–3':'顶点 2–4'}。</>}
          坐标来自 In[4099] 初始二维种子；浅色四边形仅作辅助轮廓。</p>
        <div className="fx-stats">
          <div><strong>21</strong><span>四边形 / {variant} 线</span></div>
          <div><strong>9 + 12</strong><span>次网格 / 主网格</span></div>
          <div><strong>{variant==='X'?'11 : 10':variant==='Y'?'21 : 0':'0 : 21'}</strong><span>1–3 / 2–4</span></div>
        </div>
        <fieldset className="fx-filters fx-variants"><legend>保存线型</legend>
          {([['X','X · 棋盘'],['Y','Y · 默认'],['Z','Z · 反向']] as const)
            .map(([key,text])=><button key={key} type="button" aria-pressed={variant===key}
              onClick={()=>chooseVariant(key)}>{text}</button>)}
        </fieldset>
        <fieldset className="fx-filters"><legend>查看区域</legend>
          {([['all','全部 · 21'],['minor','次网格 · 9'],['major','主网格 · 12']] as const)
            .map(([key,text])=><button key={key} type="button" aria-pressed={region===key}
              onClick={()=>chooseRegion(key)}>{text}</button>)}
        </fieldset>
        <div className="fx-inspector"><span>选中对角线 · {selectedIndex+1} / 21</span>
          <strong>{selected.region==='minor'?'次网格':'主网格'} {selected.row} 行 · {selected.column} 列</strong>
          <dl><dt>源四边形</dt><dd>#{selected.sourceQuadIndex}</dd>
            <dt>端点选择</dt><dd>{selected.diagonal==='13'?'1 → 3':'2 → 4'}</dd>
            <dt>顶点编号</dt><dd>{label(selected.endpointLabels[0])}<br/>{label(selected.endpointLabels[1])}</dd></dl>
          <input aria-label={`选中 ${variant} 对角线`} type="range" min="0" max="20"
            value={selectedIndex} onChange={event=>{
              const index=Number(event.target.value);setSelectedIndex(index);
              if(region!=='all'&&topology.diagonals[index].region!==region)setRegion('all');
            }}/>
        </div>
      </aside>
      <main className="fx-main">
        <header className="fx-main-heading"><div><span>初始 CP 种子 · 第一扇区</span>
          <h3>四边形上的 {variant} 对角线</h3></div><span>r·h = 6</span></header>
        <div className="fx-figure"><Diagram visible={visible} selected={selected} variant={variant}/>
          <div className="fx-legend"><span><i className="minor"/>次网格</span><span><i className="major"/>主网格</span><span><i className="selected"/>选中线</span></div>
        </div>
        <p className="fx-note"><strong>只读拓扑参考</strong>{variant==='X'?
          ' 这张初始种子图没有 CP／FF、山谷赋型、逐面等距或层序证明；不可直接采用或当作精确 FOLD。Flasher 控件中另有按 X 选项求得、经几何与逐面等距校验的静态 CP／FF 候选，两者不能混作原版数值 Out。':
          ` ${variant} 保存线型只展示初始 CP 种子，没有在此求出 CP／FF、山谷赋型、逐面等距或层序；不可采用或导出精确 FOLD。现有 MakeFlasher Y/Z 求解候选属于独立流程。`}</p>
        <footer className="fx-footer"><span>关闭后当前作品和撤销记录保持不变。</span><button type="button" className="primary" onClick={onClose}>关闭</button></footer>
      </main>
    </div>
  </TessDialog>;
}
