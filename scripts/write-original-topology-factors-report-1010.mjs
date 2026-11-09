import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8'),json=file=>JSON.parse(read(file));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const run=json('output/original-topology-factors-checks-retry-1010.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
const base='output/playwright/original-topology-factors-final-1010';
const graph='output/parallel/courteous-graph-root-review-1010/root-final-8862';
const browser=(file)=>JSON.parse(read(file).match(/^### Result\r?\n([^\r\n]+)/m)[1]);
const browsers=[['flasher/browser-tests.log',27],['dual/browser-tests.log',18]]
  .map(([file,passed])=>{const r=browser(base+'/'+file);assert.equal(r.passed,passed);assert.deepEqual(r.errors,[]);return{file:base+'/'+file,...r};});
for(const [file,passed] of [['browser-main.log',24],['browser-switches.log',10],['browser-insets.log',10]]){
  const r=browser(graph+'/'+file);assert.equal(r.passed,passed);assert.deepEqual(r.errors,[]);browsers.push({file:graph+'/'+file,...r});
}
const bundle=browsers[0].bundle;
assert.equal(browsers[1].bundle,bundle);assert.equal(browsers[2].bundle,bundle);assert.ok(fs.existsSync('dist'+bundle));
const flasher=json(base+'/flasher/download-audit.json');assert.equal(flasher.actualUserDownloads,24);
const dual=json(base+'/dual/download-verification.json');assert.equal(dual.verified,true);assert.equal(dual.cases.length,2);
const graphAudit=json(graph+'/download-audit.json');assert.equal(graphAudit.passed,204);assert.equal(graphAudit.actualOrdinaryFileDownloads,10);
const preserved='output/parallel/flasher-input-contract-1010/evidence/root-preservation-review/after-shared-tolerance-guard/summary.json';
const preservation=json(preserved);assert.equal(preservation.unmappedChanges,0);assert.equal(preservation.p52FrozenFilesPreserved,2489);
const initial=json('output/original-topology-factors-checks-1010.json');assert.equal(initial.exitCode,1);
const tests=run.tests;
const document='docs/P53-原母图对偶面与Flasher因子统一验收-20261010.md';
assert.ok(!fs.existsSync(document));
const text=`# 原母图、对偶面与 Flasher 因子统一验收（2026-10-10）

本批已在当前源码运行版完成实际构造与采用。完整 Origamica 目标仍在推进，免安装包尚未更新。

| 改动 | 实际体验入口与效果 |
| --- | --- |
| 原随机 Graph | 镶嵌设计 → 线组编织 → 随机线组 → 原随机母图 · 两阶段公差 → 原随机母图示例。两项公差分别可调，按原 Indexify/Intersectify 顺序构造母图，随后真实生成编织 CP、求层序、普通采用、保存和导出；旧随机 Lines 与兼容模式保留。 |
| Flasher 因子 | 镶嵌设计 → 空间构造 → Flasher 旋转折叠。环数与高度阶各 1–9、积不超过 9，旋转阶 3–16，实际面数不超过 600；动态控件显示当前预算。新增 r1/h4/m4、r5/h1/m4、r1/h1/m9 已实际采用和导出。 |
| 原对偶面 | 镶嵌设计 → 原始—对偶及铺石镶嵌。默认原始—对偶补回 4 面，In[3386] 补回 22 面；铺石的优化与可行目标分支也保留原面序和母点对应。CP、FF、母图编号及对偶点边保持。 |
| 输入兼容 | 缺席 Flasher 字段使用默认，显式 null/数组/布尔/字符串和非法 diagonal 拒绝；数学整值小数或指数与整数一致。保留刚性四边网格原有 SamePtTolerance:null/0；面积溢出改为受控错误。 |

| 统一验证 | 结果 |
| --- | --- |
| 前端 / 后端 / 桌面 / 服务与 worker | ${tests.frontend} / ${tests.backend} / ${tests.desktop} / ${tests.serverWorker}，现有所有检查均通过 |
| 类型检查及构建 | ${tests.buildModules} 模块，最终主包 ${bundle} |
| 最终主界面 | 89 项，三个构造流程、原图编辑、正常采用、旧模式切换、拒绝后恢复均通过；另检查工程库参数实际重构 |
| 实际用户按钮文件 | 46 件：Flasher 24、对偶 12、Graph 10。API 响应捕获和核查副本单列，不重复计数 |
| 文件核查 | 普通 R12 LINE DXF 独立逐边回读，毫米坐标/赋型/每边加工次数保持；JSON/FOLD 在主 App 真正重开。Graph 204 独立下载检查、6 个 CP/FF 的全点对等距验证通过 |
| 已有工作保护 | P52 的 2489 份冻结文件全部保持；17 处既有修改、23 个新增文件均对应 8 条整合记录；普通/优化 DXF 三核心及 Flasher 几何内核保持 |

首次完整前端检查确实发现 Graph 的跨家族校验误拒绝刚性四边网格的合法同名参数。已修复该入口并补回归，原失败日志与记录保留；修复后重新运行了整套。早期浏览器验收脚本的权限、输出路径、beforeunload 和执行环境错误也保留，最终验收使用独立新目录和同一最终构建，未将失败尝试计入通过数。

原 Graph 本身返回 Faces=[]，有界母面由后续编织适配形成，二者分别标记。Graph 保留原边顺序、方向和重复边，只按原规则删除自环；重复或退化图不能继续编织时明确拒绝。等距排序的有限分支须拓扑一致，歧义或超预算拒绝。来源 proof/mother 坐标校验为 1e-10 相对阈值，排序分支与完整母线回放为 1e-12 绝对阈值，未宣称 Wolfram 随机序列或所有数值选择完全相同。

原始—对偶 In[3386] 的既有层序无解采用限制仍有效。Flasher 是已验证静态三维等距，完整连续折叠、碰撞、纸厚与实物有效性没有被本批认证。

| 尚未完成或未验证 | 状态 |
| --- | --- |
| 下一批真实原函数 | MinTotalPleat 原最小总褶求解及 Flasher 超过 16 的旋转阶有限预算范围在独立隔离目录推进，尚未合入本批 |
| 完整原版范围 | 任意解析/插值对象、全部符号/默认求解语义及全部数值、层序、碰撞域未完整复现；不能给出可靠剩余百分比 |
| 交付与实机 | 未重打免安装包、未自动发布；未运行 Wolfram 内核、未在第三方刻字软件导入或机器试压，不承诺实机提速 |

完整日志：output/original-topology-factors-checks-retry-1010.log；最终主界面：${base} 与 ${graph}；前次失败：output/original-topology-factors-checks-1010.log；保护审计：${preserved}。
`;
const previous=json('output/audits/original-live-construct-final-1010.json');
const docChanges=[];
const backup='output/original-topology-factors-docs-before-1010';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']) {
  const before=fs.readFileSync(file);assert.equal(hash(before),previous.snapshots.find(row=>row.file===file).sha256);
  const saved=backup+'/'+file;fs.mkdirSync(saved.slice(0,saved.lastIndexOf('/')),{recursive:true});fs.writeFileSync(saved,before,{flag:'wx'});
  let content=before.toString('utf8');
  if(file==='README.md') {
    const firstBreak=content.indexOf('\n\n')>=0?content.indexOf('\n\n')+2:content.indexOf('\r\n\r\n')+4;
    assert.ok(firstBreak>1);
    const intro=`原母图与对偶面（2026-10-10，未重打包）：原随机Graph可实际构造/采用；Flasher因子输入扩展，原始—对偶及铺石面结构补齐。统一${tests.frontend}/${tests.backend}/${tests.desktop}/${tests.serverWorker}检查、${tests.buildModules}模块、89项最终主界面与46件真实按钮文件回读通过，见[体验入口与验收](${document})。最小总褶求解及旋转阶预算扩域继续并行，完整目标尚未完成。\n\n`;
    content=content.slice(0,firstBreak)+intro+content.slice(firstBreak);
  } else {
    const lines=content.split(/\r?\n/),index=lines.findIndex(line=>line.startsWith('最新已验收：'));assert.ok(index>=0);
    lines[index]=`最新已验收：原随机Graph两公差与实际CP、Flasher有限因子扩展、原始—对偶及铺石遗漏DualFaces和严格输入合同，见P53-原母图对偶面与Flasher因子统一验收-20261010.md；P52/P51/P50保持。下一批原MinTotalPleat及Flasher旋转阶实际面数预算扩域正在独立实现，完整目标未完成。`;
    content=lines.join(content.includes('\r\n')?'\r\n':'\n');
  }
  fs.writeFileSync(file,content);docChanges.push({file,before:hash(before),after:hash(fs.readFileSync(file))});
}
fs.writeFileSync(document,text,{flag:'wx'});docChanges.push({file:document,before:null,after:hash(fs.readFileSync(document))});
fs.writeFileSync('output/original-topology-factors-report-1010.json',JSON.stringify({
  verified:true,tests,mainAppChecks:89,userButtonExportFiles:46,bundle,document,docChanges,
  completeOrigamicaGoal:false,browsers:browsers.map(({file,passed,bundle})=>({file,passed,bundle})),
  preservation,initialFailedRunRetained:true,packed:false,published:false,machineVerified:false,
},null,2),{flag:'wx'});
console.log(JSON.stringify({document,tests,mainAppChecks:89,userButtonExportFiles:46,completeOrigamicaGoal:false}));
