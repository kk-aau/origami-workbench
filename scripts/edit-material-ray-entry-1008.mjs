import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='src/components/MaterialPieceSelector.tsx';let text=fs.readFileSync(file,'utf8');
const replacements=[
 ["import MaterialBatchDialog from './MaterialBatchDialog';","import MaterialBatchDialog from './MaterialBatchDialog';\r\nimport MaterialRayDialog from './MaterialRayDialog';"],
 ['[batchOpen,setBatchOpen]=useState(false);','[batchOpen,setBatchOpen]=useState(false),[rayOpen,setRayOpen]=useState(false);'],
 ['{onFaceEdit&&<button className="outline" onClick={()=>setBatchOpen(true)}>批量材料构造</button>}','{onFaceEdit&&<button className="outline" onClick={()=>setBatchOpen(true)}>批量材料构造</button>}{onFaceEdit&&<button className="outline" onClick={()=>setRayOpen(true)}>材料射线构造</button>}'],
 ['{batchOpen&&onFaceEdit&&<MaterialBatchDialog','{rayOpen&&onFaceEdit&&<MaterialRayDialog doc={doc} onApply={onFaceEdit} onClose={()=>setRayOpen(false)}/>} {batchOpen&&onFaceEdit&&<MaterialBatchDialog']
];
for(const [before,after] of replacements){assert.ok(text.includes(before),'Missing ray insertion point');text=text.replace(before,after);}fs.writeFileSync(file,text);
