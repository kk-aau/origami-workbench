import type {LayerBatchResult} from './layerBatch';

const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const statusNames:Record<LayerBatchResult['status'],string>={completed:'请求范围已完成',exhausted:'引擎候选已取完',cancelled:'已取消 · 部分结果',timeout:'已超时 · 部分结果',error:'计算失败 · 部分结果','size-limit':'达到容量预算 · 部分结果'};

/** Script-free, offline result collection. SVG is isolated as an image, never inline markup. */
export function layerBatchDocument(batch:LayerBatchResult,name:string):string{
  if(!Object.hasOwn(statusNames,batch.status)||!Number.isSafeInteger(batch.startIndex)||batch.startIndex<0||!Number.isInteger(batch.requested)||batch.requested<1||batch.requested>100||!Number.isSafeInteger(batch.startIndex+batch.requested)||batch.items.length>batch.requested)throw new Error('批量结果信息无效。');
  let bytes=0;
  const cards=batch.items.map((item,offset)=>{
    if(!Number.isSafeInteger(item.index)||item.index!==batch.startIndex+offset||item.index>=Number.MAX_SAFE_INTEGER)throw new Error('批量结果编号不连续或超出范围。');
    bytes+=new TextEncoder().encode(item.svg).byteLength;
    if(bytes>64_000_000)throw new Error('结果图超过 64 MB 预算，请分批输出。');
    // Percent-encoding prevents SVG text from terminating either HTML attribute.
    const url=escapeHTML('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(item.svg)),number=item.index+1;
    return `<article id="candidate-${number}"><div class="caption"><h2>第 ${number} 解</h2><a href="${url}" download="candidate-${number}.svg">保存 SVG ↓</a></div><img src="${url}" alt="第 ${number} 解的模型结果图" loading="lazy" width="1024" height="820"/></article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(name)} · 候选结果图册</title>
<style>
:root{color-scheme:light;color:#294536;background:#edece6;font-family:"Microsoft YaHei","PingFang SC",sans-serif}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1200px;margin:auto;padding:28px}header{border-bottom:1px solid #b6c3b4}h1{font-family:"Noto Serif CJK SC","SimSun",serif;font-size:clamp(24px,4vw,38px);margin:12px 0;overflow-wrap:anywhere}header p,footer{line-height:1.7}.eyebrow{font-size:12px;letter-spacing:.14em}.status{display:inline-block;padding:6px 12px;border:1px solid #55745a;background:#e0e8da;font-weight:700}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:24px}article{min-width:0;background:#fffefb;border:1px solid #bbc8b9}.caption{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #dde2d7}h2{font-size:17px;margin:0}a{color:#315f46;text-underline-offset:4px}a:focus-visible{outline:3px solid #865aac;outline-offset:4px}img{display:block;width:100%;height:auto}footer{font-size:13px;color:#586758}.empty{grid-column:1/-1;padding:32px;border:1px dashed #84957e}@media print{body{background:white}main{display:block}article{break-inside:avoid;margin-bottom:24px}.caption a{display:none}header,main,footer{padding:12px}}
</style></head><body><header><div class="eyebrow">折纸工坊 / 候选结果图册</div><h1>${escapeHTML(name)}</h1><span class="status">${statusNames[batch.status]}</span><p>从第 ${batch.startIndex+1} 解开始，请求 ${batch.requested} 个，实际保留 ${batch.items.length} 个。</p><p>${escapeHTML(batch.message)}</p></header><main>${cards||'<p class="empty">本批尚未完成任何结果图。请返回工作台检查停止原因。</p>'}</main><footer>图册可离线查看；每张图可单独保存为 SVG。编号是本工作台引擎的候选顺序，不等同于 Oriedita 的解序。结果图不证明连续无碰撞路径或实际可折性，不包含可编辑工程、模型快照或撤销历史。</footer></body></html>`;
}
