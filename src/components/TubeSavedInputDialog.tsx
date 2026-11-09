import {useState} from 'react';
import {tubeSavedInputCells,tubeSavedInputExample,type TubeSavedInputCell} from '../app/tubeSavedInputExamples';
import TubeInputGraphics from './TubeInputGraphics';
import {TessDialog} from './TessellationEditor';
import './TubeSavedInputDialog.css';

export default function TubeSavedInputDialog({onClose}:{onClose:()=>void}){
  const [cell,setCell]=useState<TubeSavedInputCell>(3595);
  const example=tubeSavedInputExample(cell);
  const params=example.params;
  return <TessDialog title="原版管状构造输入示意" onClose={onClose}>
    <div className="tube-saved-input-dialog" data-testid="tube-saved-input-dialog" data-cell={cell}>
      <nav aria-label="选择原版管状输入示意">
        {tubeSavedInputCells.map(id=><button key={id} type="button" aria-pressed={cell===id}
          onClick={()=>setCell(id)}>In[{id}]</button>)}
      </nav>
      <div className="tube-saved-input-heading">
        <strong>{example.title}</strong>
        <span>下圈 {params.bottomPoints.length} 点 · 上圈 {params.topPoints.length} 点</span>
      </div>
      <p className="tube-saved-input-detail">{example.detail}</p>
      <div className="tube-saved-input-stage" data-testid="tube-saved-input-stage">
        <TubeInputGraphics params={params} height={380}/>
      </div>
      <div className="tube-saved-input-legend" aria-label="图形图例">
        <span><i className="bottom"/>下圈</span><span><i className="top"/>上圈</span>
        <span><i className="links"/>对应连线</span><span><i className="pleat"/>褶片示意</span>
      </div>
      <footer className="tube-saved-input-footer"><span>仅显示原版俯视输入图；未计算折痕、折后面或碰撞。</span>
        <button type="button" onClick={onClose}>关闭</button></footer>
    </div>
  </TessDialog>;
}
