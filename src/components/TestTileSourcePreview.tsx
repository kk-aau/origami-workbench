import {useEffect,useRef,useState} from 'react';
import {embedTestTiling2D,TEST_TILE_IN2811_SPECS,type TestTileGraphic2D} from '../app/testTileGraphics2D';

function Graphic({graphic,tile,fontSize}:{graphic:TestTileGraphic2D;tile:number;fontSize:number}){
  // Mathematica's Graphics uses Cartesian y; invert positions without flipping glyphs.
  if(graphic.kind==='line')return <polyline data-source-test-outline={tile} points={graphic.points.map(([x,y])=>`${x},${-y}`).join(' ')}
    fill="none" stroke={graphic.color} strokeWidth={graphic.absoluteWidth} vectorEffect="non-scaling-stroke"
    strokeLinecap="round" strokeLinejoin="round"/>;
  return <text data-source-test-text={`${tile}:${graphic.role}`} x={graphic.at[0]} y={-graphic.at[1]}
    fill={graphic.color} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}>{graphic.value}</text>;
}

/** A bounded, read-only view of In[2811]; controls show local numeric extensions of the same saved rule. */
export default function TestTileSourcePreview(){
  const [sides,setSides]=useState(4),[rotation,setRotation]=useState(0),[scale,setScale]=useState(1);
  const [indices,setIndices]=useState(true),[viewport,setViewport]=useState({width:300,height:160});
  const svgRef=useRef<SVGSVGElement>(null);
  useEffect(()=>{
    const svg=svgRef.current;if(!svg)return;
    const observer=new ResizeObserver(()=>setViewport({width:svg.clientWidth,height:svg.clientHeight}));
    observer.observe(svg);return ()=>observer.disconnect();
  },[]);
  const saved=sides===4&&rotation===0&&scale===1&&indices;
  const specs=saved?TEST_TILE_IN2811_SPECS:TEST_TILE_IN2811_SPECS.map(spec=>({...spec,sides,rotation,scale}));
  const tiles=embedTestTiling2D(specs,indices);
  const points=tiles.flatMap(tile=>tile.vertices),xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const pad=Math.max(.18,(maxX-minX)*.09,(maxY-minY)*.09),width=maxX-minX+2*pad,height=maxY-minY+2*pad;
  const viewBox=`${minX-pad} ${-maxY-pad} ${width} ${height}`;
  // Text/AbsoluteThickness keep their screen size when FunctionTransform changes the tile.
  const fontSize=11*Math.max(width/Math.max(1,viewport.width),height/Math.max(1,viewport.height));
  return <details className="test-tile-source-preview">
    <summary>原版 TestTile 绘图 · In[2811]（只读）</summary>
    <p className="note">{saved?'原保存输入：两块单位正方形，第二块向右平移 1；黑色块号、深棕顶点号、橙色闭合边线。':'本地数值推演；已偏离 In[2811] 保存参数，不代表 Wolfram 保存输出。'}此预览不修改当前工程。</p>
    <div className="test-tile-source-controls">
      <label>边数 <select aria-label="TestTile 边数" value={sides} onChange={event=>setSides(Number(event.target.value))}>{Array.from({length:10},(_,index)=>index+3).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>旋转 <input aria-label="TestTile 旋转" type="range" min="-180" max="180" step="15" value={rotation} onChange={event=>setRotation(Number(event.target.value))}/><output>{rotation}°</output></label>
      <label>倍率 <input aria-label="TestTile 倍率" type="range" min="0.5" max="1.5" step="0.1" value={scale} onChange={event=>setScale(Number(event.target.value))}/><output>{scale.toFixed(1)}</output></label>
      <label><input aria-label="TestTile 拼块编号" type="checkbox" checked={indices} onChange={event=>setIndices(event.target.checked)}/>拼块编号</label>
      <button className="text-button" type="button" onClick={()=>{setSides(4);setRotation(0);setScale(1);setIndices(true);}}>恢复 In[2811]</button>
    </div>
    <svg ref={svgRef} aria-label="TestTile 双拼块保存绘图" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" data-saved-in2811={saved}>
      {tiles.map((tile,index)=><g key={index} data-source-test-tile={index+1}>{tile.graphics.map((graphic,j)=><Graphic key={j} graphic={graphic} tile={index+1} fontSize={fontSize}/>)}</g>)}
    </svg>
    <p className="note">仅实现已保存的 TestTile 数值二维 TileVertices／Tiling 分派；没有具名拼块的三维 RenderTile 规则。</p>
  </details>;
}
