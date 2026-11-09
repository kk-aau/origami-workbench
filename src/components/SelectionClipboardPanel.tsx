import type {Point} from '../core/types';
import {isMaterialClipboard,clipboardDescription,type WorkbenchClipboard} from '../app/materialClipboard';
import {NumberField} from './Fields';

export default function SelectionClipboardPanel({clipboard,selected,offset,onOffset,onCopy,onCut,onPaste}:{clipboard:WorkbenchClipboard|null;selected:boolean;offset:Point;onOffset:(p:Point)=>void;onCopy:()=>void;onCut:()=>void;onPaste:(p:Point)=>void}){
 const material=isMaterialClipboard(clipboard);
 return <section aria-label="选区剪贴板"><h2>选区剪贴板</h2>
  <div className="button-pair"><button disabled={!selected} onClick={onCopy}>复制选中</button><button disabled={!selected} onClick={onCut}>剪切选中</button></div>
  <div className="button-pair"><button disabled={!clipboard} onClick={()=>onPaste([0,0])}>原位粘贴</button><button disabled={!clipboard} onClick={()=>onPaste(offset)}>偏移粘贴</button></div>
  <div className="two-fields"><NumberField label="偏移 X" value={offset[0]} min={-1000} max={1000} step={1} suffix="mm" onChange={x=>onOffset([x,offset[1]])}/><NumberField label="偏移 Y" value={offset[1]} min={-1000} max={1000} step={1} suffix="mm" onChange={y=>onOffset([offset[0],y])}/></div>
  <p role="status" className="note">{clipboard?`剪贴板 · ${clipboardDescription(clipboard)}`:'剪贴板为空'}</p>
  <p className="note">{material?'材料快照保留顶点、面、切口和已有折后位置，可跨工程粘贴。粘贴前可预览、调整毫米偏移或取消；副本身份独立。':'保存选中线段与辅助圆的几何和样式。偏移单位为毫米；粘贴生成独立副本，可一次撤销。隐藏对象不参与复制或剪切，剪切遵守边界保护。'}</p>
 </section>;
}
