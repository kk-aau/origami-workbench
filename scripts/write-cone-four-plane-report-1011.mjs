import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root=process.cwd(),out='output/playwright/original-cone-four-plane-main-1011';
const run=json('output/original-cone-four-plane-checks-1011.json'),ui=json(out+'/browser-checks.json'),layout=json(out+'/root-layout-extra.json');
const independent='output/parallel/original-cone-four-plane-main-independent-review-1011';
const py=json(independent+'/actual-download-python-002.json'),core=json(independent+'/actual-download-core-001.json');
const bundle=json('output/original-cone-four-plane-bundle-verified-1011.json'),preservation=json('output/original-cone-four-plane-preservation-1011.json');
const previous=json('output/audits/original-planar-ruled-final-1011.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);assert.equal(run.stages.length,8);assert.ok(run.stages.every(s=>s.exitCode===0));
for(const r of [ui,layout,py,core,bundle,preservation,json('output/original-cone-four-plane-service-stopped-1011.json')])assert.equal(r.verified,true);
assert.equal(ui.passed,true);assert.equal(ui.checks,152);assert.equal(ui.checksDetail.length,152);assert.deepEqual(ui.errors,[]);assert.equal(ui.downloads.length,49);
assert.equal(layout.passed,102);assert.equal(layout.records.length,12);assert.deepEqual(layout.errors,[]);assert.equal(layout.actualUserExports,0);assert.equal(layout.projectWrites,0);
assert.equal(py.passed,true);assert.equal(py.checks,369576);assert.equal(core.passed,true);assert.equal(core.checks,6091);assert.equal(core.actualCoreReopens,35);
for(const r of [py,core]){assert.deepEqual(r.errors,[]);assert.equal(r.actualUserDownloadsAudited,49);assert.equal(r.files.length,49);assert.equal(r.processing.length,4);assert.equal(r.bundle,bundle.bundle);}
assert.equal(ui.bundle,bundle.bundle);assert.equal(layout.bundle,bundle.bundle);
const actualPaths=new Set(ui.downloads.map(r=>path.resolve(r.path)));assert.equal(actualPaths.size,49);
for(const r of [...py.files,...core.files]){assert.ok(actualPaths.has(path.resolve(r.path)));assert.equal(sha(r.path),r.sha256,r.path);}
const hand=ui.mutations[0];assert.deepEqual(hand.selectedIds,['cone4039-curve-3-23']);assert.deepEqual(hand.changedIds,['cone4039-curve-3-23']);assert.equal(hand.singleEdgeSelectionAssumed,false);
assert.equal(preservation.previousArchiveFilesVerified,3485);assert.equal(preservation.mappedFiles,7);
const indexes=[
 ['output/parallel/original-cone-four-plane-cp-4039-1011','freeze.json',74],
 ['output/parallel/original-cone-four-plane-main-acceptance-prepared-1011','freeze.json',18],
 ['output/parallel/original-cone-four-plane-main-library-wait-fix-1011','freeze.json',12],
 [independent,'freeze.json',8],
 ['output/parallel/original-cone-four-plane-main-auditor-fix-1011','freeze.json',10],
 ['output/parallel/original-reflection-neighbor-source-gap-1011','SOURCE-CONTRACT-FROZEN.json',19],
 ['output/parallel/original-reflection-neighbor-source-gap-1011/supplement-001','SUPPLEMENT-FROZEN.json',9],
 ['output/parallel/original-cone-four-plane-independent-review-1011','SOURCE-PHASE-FROZEN.json',30],
 ['output/parallel/original-cone-four-plane-independent-review-1011','IMPLEMENTATION-REVIEW-FROZEN.json',39],
 ['output/parallel/original-cone-four-plane-native-zero-domain-1011','freeze.json',1],
];
const frozenIndexes=[];
for(const [base,index,count]of indexes){const file=base+'/'+index,frozen=json(file);assert.equal(frozen.files.length,count);
 for(const r of frozen.files){const f=path.resolve(base,r.file??r.path);assert.ok(f.startsWith(root+path.sep));assert.equal(sha(f),r.sha256,f);}
 frozenIndexes.push({base,index,files:count,sha256:sha(file)});
}
const integrations=preservation.integrationReports.map(json),changes=integrations.flatMap(r=>r.files);
const document='docs/P59-原圆锥四带CP统一验收-20261011.md';assert.ok(!fs.existsSync(document));
const fileRows=changes.map(r=>`| [${r.file}](D:/codex/折纸工具/workbench/${r.file}) | ${r.before===null?'新增':'修改'} |`).join('\n');
const text=`# 原圆锥四带 CP 统一验收（2026-10-11）

源码版已接通原 In[4039] 的圆锥四镜面有限二维 CP。原山谷 M/V/M 和未赋型 U 两种模式均可构造、采用、保存、导出及修改原参数。当前材料使用明确本地截顶；完整原锥顶纸域正在独立补齐，完整 Origamica 目标未完成，免安装包未更新。

| 体验入口 | 实际行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原圆锥四带 CP · In[4039] | 保原30.°半锥角、10.°镜面倾角和Compose=True；完整原数值四阶段与二维极坐标纸面。 |
| 有限弦段赋型 | 默认原M/V/M，内部目标折角null；可明确选本地未赋型U。原母线样式表示正/负曲率，只作参考预览，不加入加工边。 |
| 参数与图形 | 原u∈[0,π]子区间、局部内半径0.05–1mm、本地16–128段；默认100对应原绘图密度默认值，不冒充原插值采样。毫米网格、轴与1mm尺，桌面参数/预览/footer同屏。 |
| 采用后 → 修改原圆锥四带参数 | 保完整来源、模式及当前名称/UUID；手改保几何和配方，显式源再建恢复原模式与空目标角。 |

Compose=True按原代码同时反射所有尚未使用的镜面点与法向。不是依次用未变镜面切已经反射的曲面。原输入normal不归一，machine数与理想精确角分列；新桥以原binary64输入的精确有理反射代数推导全域切距上下界，再核实际native行与完整阶段。二维坐标Y=v(cos(u sinθ),sin(u sinθ))，按(u,v)的Jacobian=-v sinθ；没有用三维XY投影或native显示归一化scale作为纸面缩放。

原native范围保v=0…4secθ及原stage0锥顶。当前材料首轨为本地正内半径，后四轨来自真实stage1…4切距；四个实际纸面、5(n+1)顶点、5n+8边、2n+8边界，原M2n/Vn或U3n。4n凸验证单元仅作几何证明，不添加径向加工缝。源未指定物理单位，本地明确1原坐标单位=1mm，无平移/再次缩放/翻转。局部截顶不能冒充原完整v0=0纸域。

| 最终验证 | 结果 |
| --- | --- |
| 项目八阶段 | 前端${run.tests.frontend}、桌面${run.tests.desktop}、服务/worker${run.tests.serverWorker}；平面脚本、层序专项、类型与构建全部通过。 |
| 后端回归 | ${run.tests.backend}项既有完整结果沿用；后端和既有共享数值样例/输入逐SHA相同，新桥另经原核、真实API、独立公式和文件核对。 |
| 最终构建 | ${run.tests.buildModules}模块、${bundle.bundle}，26构建文件SHA保持，主UI/布局/实际文件同bundle。 |
| 根实际主界面 | 152项通过，49件实际用户按钮文件；default100、显式16、修改24、localU、动态手改及恢复原MVM；真实HTTP、文件重开与精确UUID保存/库GET。 |
| 根真实桌面布局 | 102项、两入口祖先×两尺寸1420×960/1920×1080×三状态12截图；680px弹窗/420px槽、完整5参数和footer、弹窗/参数/状态均无滚动且高度坐标稳定；零采用/保存/用户导出。 |
| 根独立文件回读 | Python369576项、TS6091项，35JSON/FOLD核心重开及4组优化LINE/report回读；49件源文件SHA保持。 |
| 实际LINE条数 | 16段88源边→85条LINE；修改24段及localU/恢复的128源边→128条LINE。严格共线按实际binary64坐标判断，保覆盖/单位/位置/一次加工，不为降低数字移动端点。 |
| 真实手改 | 仅curve-3-23（边95）被实际选中，U/null→M/-180；从全数组差集证明，未预设单段，来源false；显式原模式重建后M/V/null与来源true。 |
| 源/交付独审 | 原源512+345、独立80位6521×2、220守卫与1594点/普通LINE均通过；旧两轮诊断/域覆盖反例保留。 |
| 隔离交付 | 13聚焦/零TS诊断/33组件Chrome/5Chrome→Node/17809程序格式；33程序产物明确不计用户49文件，无HTTP或主工程验收冒称。 |
| 原工作保护 | 上批3485冻结逐SHA保持、7目标精确before/after、1832生产输入未变，11项原数值/几何/普通与优化DXF核心不变。 |

新桥只修自己的来源检查：三个派生绝对诊断要求有限、非负且≤10⁻¹³；原domain端点与cells连续划分严格，原全认证二叉树计数匹配。没有修改通用原数值核、共享parser、几何、普通DXF或优化导出。

实际Python初审在361475项后将每条规划路径的内部节点都当作独立LINE，忽略合法连续共线合并。旧失败报告保留；修订用stdlib Fraction精确binary64共线与同向判据独立生成实际直线run，绑定全部源ID/settings/passes，再核每LINE、覆盖、图层、色号、毫米与一次Y反向。原TS完整actualDoc/options/plan/baseline与serialized验证6091项保持；没有为通过错误审计更改49文件或导出算法。

库重开准备脚本另补精确UUID行内当前名称的visible等待，网络GET完成后再等待实际React列表；旧18准备和最小修订12保留。通用旧日志摘要器假定passed为数字，本批实际报告passed是布尔状态、checks=152，额外布局passed=102；记录按实际schema核对，不将摘要器断言当成主UI失败。

实际各例核心geometry.invalid/layers.unknown，记录真实诊断，不将CP-only普遍解释为必定invalid；没有Doc.flatFold、foldedVertices、startingFace或应用FF/三维证书。原曲线的有限弦、原山谷定性标签、连续曲面的局部等距及native结果也不等于有限材料刚性三维初值或整片层序证。

| 修改文件 | 状态 |
| --- | --- |
${fileRows}

| 未完成或未验证 | 状态 |
| --- | --- |
| 原锥顶完整纸域 | 下一批正在补唯一source apex及旧v1保存兼容；当前源码仍是明确local-cut，不将本批标为原完整纸域。 |
| 全原版范围 | 任意解析/符号/默认求解、全数值域及更广材料/层序仍未完全复现；完整目标继续，不发布不可靠剩余数量或百分比。 |
| Wolfram与连续曲折 | 未执行Wolfram，不宣称原插值/保存Out/连续曲线完全等价；无FF/三维初值、运动、碰撞或纸厚认证。 |
| 交付与设备 | 未重打免安装包、未发布、未第三方刻字软件导入或机器试压，不操作设备、不承诺实机提速。 |

主检查：output/original-cone-four-plane-checks-1011.json及同名log；根实际49文件：${out}；真实回读及失败：${independent}；最小审计修订：output/parallel/original-cone-four-plane-main-auditor-fix-1011。P58及此前冻结保持。
`;
const backup='output/original-cone-four-plane-docs-before-1011';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);const docChanges=[];
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']){
 assert.equal(sha(file),previous.snapshots.find(r=>r.file===file).sha256,file);const bytes=fs.readFileSync(file),saved=backup+'/'+file;fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,bytes,{flag:'wx'});let content=bytes.toString('utf8');
 if(file==='README.md'){const heading=content.match(/^# [^\r\n]+\r?\n(?:\r?\n)+/);assert.ok(heading);content=content.slice(0,heading[0].length)+`原圆锥四带CP（2026-10-11，未重打包）：原M/V/M与未赋型模式已接构造、毫米预览、采用、保存与源再建；2900前端、152根操作、102真实布局及49用户文件回读通过，见[入口与验收](${document})。当前local-cut，原锥顶下一批及完整目标继续。\n\n`+content.slice(heading[0].length);}
 else{const lines=content.split(/\r?\n/),i=lines.findIndex(l=>l.startsWith('最新已验收：'));assert.ok(i>=0);lines[i]='最新已验收：原In[4039]圆锥四镜面有限四带CP、本地截顶/原MVM或U、空目标角/毫米布局、源保存与参数再建及49实际文件回读，见P59-原圆锥四带CP统一验收-20261011.md。原v0=0完整锥顶纸域正在下一批独立实施，未冒充本次已实现；P58及此前冻结保持，完整曲线、符号/默认与全数值域目标仍未完成。';content=lines.join(content.includes('\r\n')?'\r\n':'\n');}
 const before=sha(file);fs.writeFileSync(file,content);docChanges.push({file,before,after:sha(file)});
}
fs.writeFileSync(document,text,{flag:'wx'});docChanges.push({file:document,before:null,after:sha(document)});
const output='output/original-cone-four-plane-report-1011.json';assert.ok(!fs.existsSync(output));
fs.writeFileSync(output,JSON.stringify({verified:true,document,docChanges,tests:run.tests,bundle:bundle.bundle,mainAppChecks:152,actualLayoutChecks:102,userButtonExportFiles:49,independentDownloadChecks:369576,actualCoreChecks:6091,coreImports:35,processingPairs:4,preservation,frozenIndexes,actualHandIds:hand.changedIds,sourceInputTolerance:1e-13,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({document,mainApp:152,actualLayout:102,actualUserFiles:49,completeOrigamicaGoal:false}));
