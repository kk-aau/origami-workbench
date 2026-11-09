import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8'),json=file=>JSON.parse(read(file));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const run=json('output/original-constructible-editor-checks-1011.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
const base='output/playwright/original-constructible-final-1010';
const names=['min-total','flasher','gore','across','discrete'];
const browsers=names.map(name=>({name,...json(`${base}/${name}/browser-checks.json`)}));
for(const r of browsers){assert.equal(r.verified,true);assert.deepEqual(r.errors,[]);assert.ok(r.passed>0);}
const bundle=browsers[0].bundle;assert.ok(fs.existsSync('dist'+bundle));for(const r of browsers)assert.equal(r.bundle,bundle);
const preservation=json('output/original-constructible-preservation-final-1011.json');
assert.equal(preservation.noUnmappedProductionChanges,true);assert.equal(preservation.previousArchiveFilesVerified,3257);
const minPython=json(`${base}/min-total/independent-download-audit.json`),minTypescript=json(`${base}/min-total/core-download-audit.json`);
assert.equal(minPython.actualOrdinaryDownloads,12);assert.equal(minTypescript.actualOrdinaryDownloads,12);assert.ok(minPython.passed>0&&minTypescript.passed>0);
const flasher=json(`${base}/flasher/download-audit.json`),gore=json(`${base}/gore/download-audit.json`);
assert.equal(flasher.verified,true);assert.equal(flasher.actualUserDownloads,16);assert.equal(gore.verified,true);assert.equal(gore.actualUserDownloads,13);
const acrossPython=json(`${base}/across/independent-download-audit.json`),acrossCore=json(`${base}/across/core-download-audit.json`);
assert.ok(acrossPython.passed>0&&acrossCore.passed>0);
const discreteAudit=json(`${base}/discrete/download-audit.json`),discreteCore=json(`${base}/discrete/download-import-audit.json`);
assert.equal(discreteAudit.verified,true);assert.equal(discreteAudit.actualUserDownloads,21);assert.equal(discreteCore.verified,true);
const actualUserFiles=browsers.reduce((n,r)=>n+r.downloads.length,0),uiChecks=browsers.reduce((n,r)=>n+r.passed,0),tests=run.tests;
const document='docs/P54-原曲线CP与多瓣展开统一验收-20261011.md';assert.ok(!fs.existsSync(document));
const text=`# 原曲线 CP 与多瓣展开统一验收（2026-10-11）

本批源码运行版增加五项可操作能力，并补齐采用前来源一致性校验。完整 Origamica 复现目标仍在推进，免安装包尚未更新。

| 功能 | 体验入口与最终行为 |
| --- | --- |
| 原最小总褶宽 | 镶嵌设计 → 原始—对偶 → 参数 / 定向 → 对偶求解方法 → 原最小总褶宽；使用“原最小总褶宽 · 有限数值示例”可实际生成 CP、编辑对偶点、求层序、采用、保存和导出。原垂直对偶模式保留。 |
| Flasher 旋转阶扩域 | 镶嵌设计 → 空间构造 → Flasher 旋转折叠。旋转阶按实际面数预算调整；r1/h1 支持至 m149，默认 r2/h2 上限24。r1/h1/m17与m149已经实际采用，普通与优化DXF保持原LINE格式。 |
| 多瓣展开 | 镶嵌设计 → 空间构造 → 原Gore瓣片展开 → 材料方式 → 原多瓣 · 独立材料集合。SphereMultipleGoreData 与 MultipleGoreData 的每瓣分别保留CP/真实三维来源和材料身份；采用后可从纸张属性选择并单独变换一瓣。极点与接缝不焊接。 |
| 跨右侧二维纸带 | 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 跨右侧构造 → 圆弧解析子域 → 有限纸带示例。可调整原参数与两侧宽度，生成真实有界CP，采用后可修改二维纸带源参数、保存、重开和普通导出。未知折角只按CP采用，辅助母线默认排除加工。 |
| 离散曲线 CP | 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原参数离散与倍率。目前原三点与左右母线可接为真实有限纸域；默认保未知赋型，只采用CP；用户明确山谷赋型后须重新通过几何、局部与实际整片层序检查，才允许普通采用。 |

| 最终统一验证 | 结果 |
| --- | --- |
| 项目检查 | 前端 ${tests.frontend}、后端 ${tests.backend}、桌面 ${tests.desktop}、服务与worker ${tests.serverWorker}；完整八阶段已通过；跨运行时修复后重跑前端、全部平面与层序例、桌面、服务和构建，后端使用逐文件同SHA的通过结果 |
| 类型及构建 | ${tests.buildModules} 模块；最终主界面使用同一 ${bundle} |
| 实际主界面 | ${uiChecks} 项；构造、合法采用、失败拒绝、参数恢复、材料编辑、保存、实际JSON/FOLD重开和工程库参数重构 |
| 用户按钮文件 | ${actualUserFiles} 件；源API捕获和验收输入单列，不计入用户导出数 |
| 文件回读 | 普通与优化DXF只按原LINE独立回读；核原索引、毫米位置/尺度、赋型及覆盖次数；JSON/FOLD使用实际App重开，工程库核实际保存UUID |
| 原有工作 | P53的3257份冻结文件逐份SHA保持；本批每项生产变动均链到集成记录；普通DXF、优化器与加工DXF核心保持 |

最小总褶宽使用原In[1527]的符号宽度、原锚点、最小总宽LP及公共RMS比例/平移拟合；独立核原可行性、对偶最优性、唯一性和全部面内点对等距。四面数值例实际层序已解；三面例真实CP通过局部检查但整片层序无解，普通采用继续拒绝。不是原笔记本的保存调用，不宣称Wolfram内核数值结果。

Flasher保留r/h各1–9、rh≤9和实际面数≤600的有限预算；565个整值参数组合仅表示输入预算允许，不表示每个径向增量或每条数值分支均已认证。计算失败仍受控拒绝。静态三维、二维CP与全部原面点对等距分别核查，不认证连续运动、碰撞或纸厚。Across二维纸带保留其原坐标作为毫米工程坐标，未额外归一化为200毫米纸张；普通DXF按实际纸幅回读，未重复缩放。跨V8的解析样本、数值证明及派生纸幅只按1e-13绝对公差核验；参数、身份、结构和政策仍严格，实际工程与端点不被修改。

来源复核发现并修复了CP、折叠坐标或当前毫米工程不一致时仍可能允许采用的问题。MinTotal在原LP证书后核CP/FF与当前有效参数、原母图和毫米工程；Flasher的原来源认证扩展到全部面大小，并核实际拓扑、坐标、折角和赋型。正常保存重开与默认字段省略仍兼容。共面dr=0的DirectedAngle存在+π/-π浮点分支，按圆周角比较并保实际签角/赋型；没有认证唯一物理山谷，非共面赋型变化继续拒绝。审查中gamma-alpha模式直接改raw angle/scale会被正常归一化回同一有效值，该伪反例没有计作产品问题。

首轮前端原生Python夹具曾以Windows访问冲突退出，独立4测试通过后将同一测试集并发限制为4，再跑完整检查通过；未确认根因，不修改数学算法掩盖失败。早期MinTotal回读脚本将省略customOutput默认twist与显式twist视为不同，保留原脚本与差异证据后，只在新审计中声明这一默认规范化；完整源、实际工程几何与其他配方字段仍严格回读。所有前次失败和预验记录保留，第一轮本次整合的两项通用纸张测试未将离散构造纳入独立纸域分类，已补齐分类及多瓣选择器名称，并重新运行整套；原构造、参数读取和几何没有因此放宽。以上计数只来自最终同一构建。

最终主界面首轮还发现，点编辑器把缺省纸张写成了JavaScript自有paper:undefined，虽在JSON请求中被省略，当前参数的严格来源读取仍拒绝，导致对偶点修改后层序已解却无法采用。已在点编辑器参数提交处保留真正缺省状态，来源门禁和几何检查保持严格；真实捕获响应加入回归，并重新运行相关完整检查和最终主界面。失败文件与前次构建结果单列保留，不计作最终通过。

| 尚未完成或未验证 | 状态 |
| --- | --- |
| 原版全域 | 任意解析/插值对象、全部符号和默认求解语义、全部数值与层序域仍未完整复现；二维纸带与离散CP有明示有限域，不宣称任意曲线均可构造。 |
| 实物有效性 | 多瓣是独立材料集合，没有认证粘合成整纸；曲线纸带不造平折证明；全局连续路径、碰撞与纸厚未验证。 |
| 交付及机器 | 尚未更新免安装包，未自动发布；未在第三方刻字软件导入、未试压或操作刻字机，不承诺实机提速。 |

完整检查：output/original-constructible-editor-checks-1011.log；主界面与用户文件：${base}；源码保护：output/original-constructible-preservation-final-1011.json。
`;
const previous=json('output/audits/original-topology-factors-final-1010.json'),docChanges=[];
const backup='output/original-constructible-docs-before-1011';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']){
 const before=fs.readFileSync(file);assert.equal(sha(before),previous.snapshots.find(row=>row.file===file).sha256);
 const saved=backup+'/'+file;fs.mkdirSync(saved.slice(0,saved.lastIndexOf('/')),{recursive:true});fs.writeFileSync(saved,before,{flag:'wx'});
 let content=before.toString('utf8');
 if(file==='README.md'){
  const heading=content.match(/^# [^\r\n]+\r?\n(?:\r?\n)+/);assert.ok(heading);
  const intro=`原曲线CP与多瓣展开（2026-10-11，未重打包）：原最小总褶宽、Flasher旋转阶预算扩域、多瓣独立材料、离散曲线CP和跨右侧二维纸带已接入实际采用/保存/导出，并修复来源一致性门禁。完整${tests.frontend}/${tests.backend}/${tests.desktop}/${tests.serverWorker}检查、${tests.buildModules}模块、${uiChecks}项最终主界面与${actualUserFiles}件用户文件回读通过，见[体验入口与范围](${document})。完整复现目标尚未完成。\n\n`;
  content=content.slice(0,heading[0].length)+intro+content.slice(heading[0].length);
 }else{
  const lines=content.split(/\r?\n/),index=lines.findIndex(line=>line.startsWith('最新已验收：'));assert.ok(index>=0);
  lines[index]=`最新已验收：原最小总褶宽、Flasher旋转阶预算扩域、多瓣独立材料、原离散曲线CP、跨右侧二维有限纸带与采用前来源一致性门禁，见P54-原曲线CP与多瓣展开统一验收-20261011.md。P53/P52及此前冻结保持；完整任意曲线/符号/默认求解、全部数值和层序域目标仍未完成。`;
  content=lines.join(content.includes('\r\n')?'\r\n':'\n');
 }
 fs.writeFileSync(file,content);docChanges.push({file,before:sha(before),after:sha(fs.readFileSync(file))});
}
fs.writeFileSync(document,text,{flag:'wx'});docChanges.push({file:document,before:null,after:sha(fs.readFileSync(document))});
fs.writeFileSync('output/original-constructible-report-1011.json',JSON.stringify({verified:true,document,docChanges,tests,bundle,mainAppChecks:uiChecks,userButtonExportFiles:actualUserFiles,browsers:browsers.map(({name,passed,bundle,downloads})=>({name,passed,bundle,actualUserFiles:downloads.length})),preservation,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({document,tests,uiChecks,actualUserFiles,completeOrigamicaGoal:false}));
