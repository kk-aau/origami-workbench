import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const json=f=>JSON.parse(fs.readFileSync(f,'utf8')),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=json('output/original-conic-noncircle-checks-1011.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);
assert.equal(run.stages.length,8);assert.ok(run.stages.every(s=>s.exitCode===0));
const out='output/playwright/original-conic-noncircle-main-1011/downloads-001',ui=json(out+'/browser-checks.json'),audit=json(out+'/independent-download-audit.json');
assert.equal(ui.verified,true);assert.deepEqual(ui.errors,[]);assert.equal(ui.downloads.length,16);
assert.equal(audit.verified,true);assert.deepEqual(audit.errors,[]);assert.equal(audit.actualUserDownloads,16);assert.equal(audit.shaFilesUnchanged,true);
const build=json('output/original-conic-noncircle-bundle-verified-1011.json');assert.equal(build.verified,true);assert.equal(ui.bundle,build.bundle);assert.equal(audit.actualBrowserBundle,build.bundle);
const preservation=json('output/original-conic-noncircle-preservation-1011.json');assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,3462);assert.equal(preservation.mappedFiles,7);
const previous=json('output/audits/original-conic-circle-final-1011.json'),integration=json(preservation.integrationReports[0]);
const document='docs/P57-原非圆截线CP统一验收-20261011.md';assert.ok(!fs.existsSync(document));
const modificationRows=integration.files.map(r=>`| [${r.file}](D:/codex/折纸工具/workbench/${r.file}) | ${r.before===null?'新增':'修改'} |`).join('\n');
const text=`# 原非圆截线 CP 统一验收（2026-10-11）

源码版已接通原椭圆、原左抛物输入和原双曲输入的有限二维 CP；可以构造、采用、编辑、保存、导出与按原参数再次生成。完整 Origamica 目标继续推进，免安装包未更新。

| 体验入口 | 实际行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原非圆截线 · 有限二维 CP | 三个分支按钮；默认六原点、27边、10材料面，U13/B14。 |
| 原椭圆 In[4093] | 保原四参数、原五弦驻定与九规则；原母线不归一、不翻转右方向。 |
| 原左抛物输入 / 原双曲输入 | 使用原 In[4022]/In[4025] 九规则作明确本地五弦构造；不冒充原保存离散Out。 |
| 参数编辑与毫米预览 | 焦点、第二截线、起终参数、弦段数可编辑；真实毫米网格、X/Y刻度、比例尺及颜色关联。当前坐标1:1毫米，无平移/缩放；长度/角参数标签分开。 |
| 采用后 → 修改原非圆纸面参数 | 保存完整四阶段来源；编辑后保当前名称与UUID。手工M赋型保几何与配方，显式源再建才恢复U。 |

原构造链是四参数→完整九规则→原耦合弦向驻定→按实际参数采全九规则→rL=eL−f、rR=eR−f→原倍率/Kawasaki→现有有限材料检查。没有以等参数、等弦长或等弧长代替原求解。左/右有符号系数随参数变化；右母线方向保原公式。原椭圆某些数值正则性结果为unknown，保持该结果，另列解析速度下界，不将它改写为原证书。

本次只允许有限子域：焦点幅度0.5–3，N=3–16，闭域跨度至少0.1，切距/半径严格分离且有余量；双曲域避原分母极点。实际有限面还必须严格凸、无交叉/重叠/坍缩、单闭合纸边和连通拓扑圆盘。端封边、未知U及有限四边面是明确本地选择，不把光学规则或局部Kawasaki当成整片层序证明。

| 最终验证 | 结果 |
| --- | --- |
| 项目八阶段 | 前端${run.tests.frontend}、桌面${run.tests.desktop}、服务/worker${run.tests.serverWorker}；平面脚本、层序专项、类型与构建全部通过 |
| 后端回归 | ${run.tests.backend}项完整既有结果沿用，所有Python与既有数值样例/后端输入逐SHA相同；新增桥接另以真实原核/API/源独审验证 |
| 最终构建 | ${run.tests.buildModules}模块，${build.bundle}；主App同bundle，26个构建文件SHA保持 |
| 根实际界面 | ${ui.passed}项；三个分支、椭圆22边修改、真实M编辑与恢复U、文件哨兵重开、精确工程UUID GET |
| 根用户按钮文件 | 16件：12JSON/FOLD、4普通DXF；旧隔离17件、API/POST/UUID捕获另列不计入 |
| 根独立回读 | ${audit.checks}项、12次既有核心导入；原坐标/全部材料身份/原九规则/配方/源真假/保存链和R12逐LINE(x,−y)，16文件SHA保持 |
| 原源与桥接独审 | 原公式1765、真实原核链162、Notebook切片7；最终helper371、abs/tol55、类型/有限/零边界/左∞352，通过且原5合法Doc逐字节不变 |
| 本地交付验证 | 7聚焦测试、94/30独立源、2351程序格式；58+15实际隔离界面、17文件、1831回读及65实际导入/API，不冒充根主验收 |
| 原工作保护 | 上批3462件冻结逐SHA保持，7目标精确before/after、1822既有生产输入未变；原数值核及普通/优化DXF不变 |

四类不合法源诊断已修复：uniform最大绝对残差和local最大Kawasaki误差必须有限且非负，local角容差与geometry容差必须有限且正。独审保留20份实际完整Doc反例、两个旧helper及最终闭环；仅补新桥接检查，未改通用原数值算法、几何或单位。

预览占位在有效、生成和非法状态均420px，当前未生成或非法时禁止采用，避免图块卸载引起弹窗抖动。当前桌面单栏布局尚需压缩以使全部控制与footer同屏；该后续仅布局改造独立进行，不宣称本批已完成。

初版准备审计误以为CP-only必定geometry.invalid；旧六例实际core为geometry.ready/layers.unknown。修订审计如实记录几何状态，核没有Doc.flatFold、foldedVertices、startingFace或应用的FF/三维证书，且层序未solved。原错误谓词、13份冻结及最小修订10份保持；生产未为满足错误断言改动。

| 修改文件 | 状态 |
| --- | --- |
${modificationRows}

| 未完成或未验证 | 状态 |
| --- | --- |
| 全原版范围 | 完整任意解析/符号/默认求解与全数值域仍未完成；原In[4040]直纹三曲带CP正在独立实施，未合入本次 |
| 光学与3D | 本次默认未知U，明确仅采用CP；无普通采用/层序/FF/三维初值、连续运动、碰撞或纸厚认证 |
| 计算环境 | 未执行Wolfram，未宣称原保存Out或连续原曲线等于有限弦材料 |
| 包与设备 | 未重打免安装包、未发布、未第三方刻字软件导入或机器试压、不操作设备 |

主检查记录：output/original-conic-noncircle-checks-1011.json及同名log。根实际操作和文件：${out}。源独审：output/parallel/original-conic-noncircle-independent-source-review-1011；准备与审计修订：output/parallel/original-conic-noncircle-main-acceptance-prepared-1011及output/parallel/original-conic-noncircle-main-audit-predicate-fix-1011。P56/P55及此前记录保持。
`;
const backup='output/original-conic-noncircle-docs-before-1011';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);const docChanges=[];
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']){
 assert.equal(sha(file),previous.snapshots.find(r=>r.file===file).sha256,file);const bytes=fs.readFileSync(file),saved=backup+'/'+file;fs.mkdirSync(saved.slice(0,saved.lastIndexOf('/')),{recursive:true});fs.writeFileSync(saved,bytes,{flag:'wx'});let content=bytes.toString('utf8');
 if(file==='README.md'){
  const heading=content.match(/^# [^\r\n]+\r?\n(?:\r?\n)+/);assert.ok(heading);
  content=content.slice(0,heading[0].length)+`原非圆截线CP（2026-10-11，未重打包）：原椭圆、左抛物与双曲有限CP已接构造、毫米预览、采用、保存和源再建；${run.tests.frontend}前端检查、${ui.passed}实际主界面和16件新用户文件回读通过，见[入口与验收](${document})。完整目标继续推进。\n\n`+content.slice(heading[0].length);
 }else{
  const lines=content.split(/\r?\n/),i=lines.findIndex(l=>l.startsWith('最新已验收：'));assert.ok(i>=0);lines[i]='最新已验收：原椭圆/左抛物/双曲有限二维CP、毫米参数预览、源诊断守卫和完整参数保存/重建，见P57-原非圆截线CP统一验收-20261011.md；P56/P55及此前冻结保持。In[4040]原直纹三曲带CP下一批尚未合入，桌面控制布局压缩也在独立追加；完整曲线、符号/默认求解和全数值域目标仍未完成。';content=lines.join(content.includes('\r\n')?'\r\n':'\n');
 }
 const before=sha(file);fs.writeFileSync(file,content);docChanges.push({file,before,after:sha(file)});
}
fs.writeFileSync(document,text,{flag:'wx'});docChanges.push({file:document,before:null,after:sha(document)});
const record='output/original-conic-noncircle-report-1011.json';assert.ok(!fs.existsSync(record));
fs.writeFileSync(record,JSON.stringify({verified:true,document,docChanges,tests:run.tests,bundle:build.bundle,mainAppChecks:ui.passed,userButtonExportFiles:16,independentDownloadChecks:audit.checks,coreImports:12,preservation,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({document,mainAppChecks:ui.passed,actualFiles:16,completeOrigamicaGoal:false}));
