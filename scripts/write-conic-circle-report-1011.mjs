import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=json('output/original-conic-circle-checks-1011.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);
assert.equal(run.stages.length,8);assert.ok(run.stages.every(s=>s.exitCode===0));
const out='output/playwright/original-conic-circle-main-1011/downloads-002',ui=json(out+'/browser-checks.json'),audit=json(out+'/independent-download-audit-v2.json');
assert.equal(ui.verified,true);assert.deepEqual(ui.errors,[]);assert.equal(ui.downloads.length,13);
assert.equal(audit.verified,true);assert.equal(audit.actualUserDownloads,13);assert.ok(audit.checks>0);
const build=json('output/original-conic-circle-bundle-verified-1011.json');assert.equal(build.verified,true);
assert.equal(ui.bundle,build.bundle);assert.equal(audit.actualBrowserBundle,build.bundle);
const preservation=json('output/original-conic-circle-preservation-1011.json');assert.equal(preservation.verified,true);
assert.equal(preservation.previousArchiveFilesVerified,23899);assert.equal(preservation.mappedFiles,9);
const previous=json('output/audits/original-finite-npoints-final-1011.json'),integration=json(preservation.integrationReports[0]);
const document='docs/P56-原圆截线CP统一验收-20261011.md';assert.ok(!fs.existsSync(document));
const modificationRows=integration.files.map(r=>`| [${r.file}](D:/codex/折纸工具/workbench/${r.file}) | ${r.before===null?'新增':'修改'} |`).join('\n');
const content=`# 原圆截线 CP 统一验收（2026-10-11）

源码版已接通原圆例二维材料的构造、可视拖点、采用、编辑、保存和再次生成。完整 Origamica 复现目标仍在推进，免安装包未更新。

| 体验入口 | 实际行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原圆例二维纸域 · 仅 CP | 原 In[4019]/In[4021] 焦点 −1/−1，左系数0.5、右系数−0.5，16弦；实际51顶点、52边、2材料面，U16/B36。 |
| 圆例纸域编辑窗口 | 原毫米网格、刻度、标尺；拖动弧端点或左右截线点，亦可精确输入参数。默认原坐标1:1毫米，无平移或缩放。 |
| 采用后 → 修改原圆例纸面参数 | 保存完整九规则及原参数；再次生成保持当前工程名称和UUID。手工M赋型保实际几何和配方，显式源重建才恢复U。 |
| 普通及优化导出 | 保既有R12/AC1009 LINE格式与一次Y翻转；用户实际导出后重新解析，核几何、材料身份、位置和尺寸。 |

两原母线都指向圆心，右侧原系数为负；没有反向母线后改成正数。连续纸域由径向Jacobian下界与有限材料几何检查共同约束，当前允许左系数0.05–0.95、右系数−2–−0.05、单第一象限弧区间及16–128弦。弦采样和端封边为明确本地有限构造；预览母线不会新增为CP加工线。默认U，只允许明确仅采用CP，没有为二维纸域添FF、三维初态或层序证书。

| 最终验证 | 结果 |
| --- | --- |
| 八阶段项目检查 | 前端${run.tests.frontend}、桌面${run.tests.desktop}、服务/worker${run.tests.serverWorker}通过；24项平面脚本、层序专项、类型和构建通过 |
| 后端回归 | ${run.tests.backend}项完整上批结果沿用；全部Python、既有共享样例与后端输入逐SHA相同，新前端样例另有原核及API验证，没有重复声称本轮重跑 |
| 最终构建 | ${run.tests.buildModules}模块，${build.bundle}；主界面实际使用该bundle，26件构建文件SHA不变 |
| 主App实际界面 | ${ui.passed}项；原52边、修改后76边、真实pointer逆矩阵回算、非法右正系数拒绝、赋型及显式重建 |
| 用户实际文件 | 13件：8JSON/FOLD、3普通DXF、1优化DXF、1核验报告；API/保存回执/指针捕获不计入 |
| 独立文件回读 | ${audit.checks}项；全部坐标/身份/赋型、原参数完整绑定、保存POST及UUID、原LINE和实际优化报告回读 |
| 当前跨运行时来源核验 | 346项，Chrome文件在Node可读；派生浮点窄公差保持，输入/身份/单位/误差政策严格，实际geometry变更拒绝，不修改Doc |
| 原工作保护 | 上批23899件冻结逐SHA保持，9目标精确before/after；普通/优化DXF与原数值核保持原字节 |

首次界面脚本立即断言计算器忙429，而既有界面自动重试随后200；新验收只等待非忙响应，其他HTTP失败照样断言。初版独立审计错误要求R12含$INSUNITS，既有R12以AC1009、LUNITS及999毫米说明表达坐标合同；新审计核该实际合同，并保逐LINE精确(x,−y)。两项原记录均保留，未据此修改生产导出或数值计算。

| 修改文件 | 状态 |
| --- | --- |
${modificationRows}

| 未完成或未验证 | 状态 |
| --- | --- |
| 原版全部功能 | 非圆截线下一批尚未合入，完整解析/符号/默认求解与全数值域仍未完成 |
| 原计算环境 | 未运行Wolfram，不宣称原保存Out、连续曲线与当前有限折线等价 |
| 三维与物理 | 未认证连续刚性路径、3D全局运动、碰撞及纸厚；当前仅二维CP材料 |
| 安装包及设备 | 未重打免安装包、未自动发布、未第三方刻字软件导入或实机试压、不操作机器 |

检查记录：output/original-conic-circle-checks-1011.json及同名log。实际用户操作和文件：${out}。独立文件与源核验：output/parallel/original-conic-circle-main-acceptance-prepared-1011及output/parallel/original-conic-circle-independent-main-review-1011。P55及此前冻结保持。
`;
const backup='output/original-conic-circle-docs-before-1011';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);const docChanges=[];
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']){
 assert.equal(sha(file),previous.snapshots.find(r=>r.file===file).sha256,file);
 const bytes=fs.readFileSync(file),saved=backup+'/'+file;fs.mkdirSync(saved.slice(0,saved.lastIndexOf('/')),{recursive:true});fs.writeFileSync(saved,bytes,{flag:'wx'});let text=bytes.toString('utf8');
 if(file==='README.md'){
  const heading=text.match(/^# [^\r\n]+\r?\n(?:\r?\n)+/);assert.ok(heading);
  text=text.slice(0,heading[0].length)+`原圆截线CP（2026-10-11，未重打包）：毫米标尺、拖点、原负右系数、采用、保存和源重建已接通；${run.tests.frontend}项前端检查、${ui.passed}项实际界面及13件新用户文件回读通过，见[入口与验收](${document})。完整复现目标继续推进。\n\n`+text.slice(heading[0].length);
 }else{
  const lines=text.split(/\r?\n/),i=lines.findIndex(l=>l.startsWith('最新已验收：'));assert.ok(i>=0);
  lines[i]='最新已验收：原圆截线二维材料CP、毫米刻度与拖点、负右系数及完整源配方保存/重建，见P56-原圆截线CP统一验收-20261011.md；P55/P54及此前冻结保持。非圆截线下一批尚未合入；完整曲线、符号/默认求解和全数值域目标仍未完成。';text=lines.join(text.includes('\r\n')?'\r\n':'\n');
 }
 const before=sha(file);fs.writeFileSync(file,text);docChanges.push({file,before,after:sha(file)});
}
fs.writeFileSync(document,content,{flag:'wx'});docChanges.push({file:document,before:null,after:sha(document)});
const record='output/original-conic-circle-report-1011.json';assert.ok(!fs.existsSync(record));
fs.writeFileSync(record,JSON.stringify({verified:true,document,docChanges,tests:run.tests,bundle:build.bundle,mainAppChecks:ui.passed,userButtonExportFiles:13,independentDownloadChecks:audit.checks,preservation,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({document,mainAppChecks:ui.passed,actualFiles:13,completeOrigamicaGoal:false}));
