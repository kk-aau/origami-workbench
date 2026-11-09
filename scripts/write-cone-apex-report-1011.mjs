import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root=process.cwd(),out='output/playwright/original-cone-four-plane-apex-main-final-1011';
const peer='output/parallel/original-cone-four-plane-apex-main-final-independent-review-1011';
const run=json('output/original-cone-four-plane-apex-checks-1011.json'),ui=json(out+'/browser-checks.json');
const layout=json(out+'/parent-layout-final-001/parent-layout-checks.json'),guard=json(out+'/parent-layout-final-001/layout-and-file-preservation-audit.json');
const py=json(peer+'/actual-download-python-001.json'),core=json(peer+'/actual-download-core-001.json'),mp=json(peer+'/actual-affine80-001.json');
const finalBundle=json('output/original-cone-four-plane-apex-final-bundle-verified-1011.json');
const preserved=json('output/original-cone-four-plane-apex-final-preservation-1011.json'),saved=json(peer+'/manifest.json');
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);assert.equal(run.backendInputsUnchanged,true);assert.equal(run.stages.length,8);assert.ok(run.stages.every(r=>r.exitCode===0));
for(const r of [ui,layout,guard,py,core,mp,finalBundle,preserved,saved,json('output/original-cone-four-plane-apex-service-stopped-1011.json')])assert.equal(r.verified,true);
assert.equal(ui.passed,true);assert.equal(ui.checks,287);assert.deepEqual(ui.errors,[]);assert.equal(ui.downloads.length,82);
assert.equal(layout.passed,true);assert.equal(layout.checks,323);assert.equal(layout.records.length,24);assert.equal(layout.nativeCaptures.length,8);assert.deepEqual(layout.errors,[]);
for(const r of [layout,guard]){assert.equal(r.actualUserExports,0);assert.equal(r.projectWrites,0);assert.equal(r.adoptions,0);assert.equal(r.bundle,ui.bundle);}
assert.equal(guard.checks,283);assert.equal(guard.guardedUserFiles.length,131);assert.equal(guard.current82SHAUnchanged,true);assert.equal(guard.prior49SHAUnchanged,true);for(const file of guard.guardedUserFiles)assert.equal(sha(file.path),file.sha256,file.path);
assert.equal(py.passed,true);assert.equal(py.checks,434092);assert.equal(core.passed,true);assert.equal(core.checks,7719);assert.equal(core.actualCoreReopens,60);assert.equal(mp.checks,158201);
const actual=new Set(ui.downloads.map(r=>path.resolve(r.path)));assert.equal(actual.size,82);
for(const r of [py,core]){assert.equal(r.actualUserDownloadsAudited,82);assert.equal(r.files.length,82);assert.equal(r.processing.length,5);assert.deepEqual(r.errors,[]);assert.equal(r.bundle,ui.bundle);for(const f of r.files){assert.ok(actual.has(path.resolve(f.path)));assert.equal(sha(f.path),f.sha256,f.path);}}
assert.equal(mp.bundle,ui.bundle);assert.equal(finalBundle.bundle,ui.bundle);assert.equal(preserved.previousArchiveFilesVerified,3462);assert.equal(preserved.mappedFiles,5);
const counts={};for(const f of ui.downloads){const key=f.role+'/'+f.format;counts[key]=(counts[key]??0)+1;}
assert.deepEqual(counts,{'ordinary-document/json':48,'ordinary-document/fold':12,'ordinary-document/dxf':12,'processing-dxf/dxf':5,'processing-report/json':5});
const hand=ui.mutations[0];assert.deepEqual(hand.selectedIds,['cone4039-curve-3-23']);assert.deepEqual(hand.changedIds,['cone4039-curve-3-23']);assert.equal(hand.singleEdgeSelectionAssumed,false);
assert.deepEqual(saved.actualHandChanges,[{id:'cone4039-curve-3-23',edgeIndex:71,beforeAssignment:'U',afterAssignment:'M',beforeAngle:null,afterAngle:-180}]);
assert.equal(saved.sourceMatchesTrue,55);assert.equal(saved.sourceMatchesFalse,5);assert.equal(ui.lastSaved.kind,'legacyFOLDApex');assert.equal(ui.lastSaved.id,'dfd17264-7b60-41e5-aabf-e19b8f47e13a');
const indexes=[
 ['output/parallel/original-cone-four-plane-apex-source-1011','SOURCE-APEX-FROZEN.json',20],
 ['output/parallel/original-cone-four-plane-apex-cp-1011','DELIVERY-FROZEN.json',16],
 ['output/parallel/original-cone-four-plane-apex-cp-1011','SUPPORT-FROZEN.json',124],
 ['output/parallel/original-cone-four-plane-apex-independent-review-1011','freeze.json',33],
 ['output/parallel/original-cone-four-plane-apex-main-prepared-1011','freeze.json',14],
 ['output/parallel/original-cone-four-plane-apex-parent-layout-prepared-1011','freeze.json',10],
 ['output/parallel/original-cone-four-plane-apex-main-independent-review-1011','freeze.json',10],
 ['output/parallel/original-cone-four-plane-apex-main-auditor-description-fix-1011','freeze.json',6],
 [peer,'freeze.json',9],
 ['output/parallel/original-cone-four-plane-apex-parent-spacing-fix-1011','freeze.json',4],
];
// The separate layout peer certificate is appended only once its producer finishes.
const layoutPeer=process.argv[2];assert.ok(layoutPeer,'需最终布局独审索引路径');
const layoutIndex=json(layoutPeer);indexes.push([path.dirname(layoutPeer),path.basename(layoutPeer),layoutIndex.files.length]);
const frozenIndexes=[];
for(const [base,index,count]of indexes){const file=base+'/'+index,frozen=json(file);assert.equal(frozen.files.length,count);for(const row of frozen.files){const p=path.resolve(base,row.file??row.path);assert.ok(p.startsWith(root+path.sep));assert.equal(sha(p),row.sha256,p);}frozenIndexes.push({base,index,files:count,sha256:sha(file)});}
const before=json('output/audits/original-cone-four-plane-final-1011.json');
const document='docs/P60-原圆锥完整锥顶与旧工程兼容验收-20261011.md';assert.ok(!fs.existsSync(document));
const changes=Object.entries(preserved.lastSourceHashes).map(([file])=>`| [${file}](D:/codex/折纸工具/workbench/${file}) | ${file.endsWith('.css')?'修改；另有一次间距修订':'修改'} |`).join('\n');
const text=`# 原圆锥完整锥顶与旧工程兼容验收（2026-10-11）

源码版原 In[4039] 圆锥四带 CP 已增加完整源锥顶纸域，默认采用此模式，局部截顶仍可选。可构造、预览、采用、修改源参数、保存与导出。完整 Origamica 目标仍未完成，免安装包未更新。

| 体验入口 | 行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原圆锥四带 CP · In[4039] | 纸域边界选“原完整锥顶纸域”或“局部截顶纸域”；默认原锥顶、原山谷 M/V/M、100段。 |
| 原完整锥顶 | 内半径严格0，输入框禁用；原初始0轨只形成一个明确源顶点，不输出零长边，不吸附任意端点。 |
| 局部截顶 | 内半径0.05–1mm可调；切换往返保最近合法截顶半径，明确改变纸域。 |
| 采用后 → 修改原圆锥四带参数 | 同工程源再生及同名重复保存保持UUID；取消不改工程。打开外部文件按既有合同清工程身份，显式新采用后保存为新UUID。 |
| 图形与参数 | 1mm网格/坐标轴/标尺、原u在[0,π]内且跨度≥0.1rad、16–128本地弦段；保原坐标1:1，不归一、平移或缩放。 |

原30.°/10.°机器输入、四镜面、Compose=True与实际native切距保持。原全部(u,0)二维像均为[0,0]，按原源身份识别成一个锥顶；原参数矩形在此不单射，逆参数u不唯一，Jacobian=-v sinθ在锥顶为0。仅源商纸域一一映射且有限纸面简单正面积，不声称整个参数域regular或具有正Jacobian下界。

| 纸域 | 顶点/边/面 | 原山/谷/边界 |
| --- | --- | --- |
| 默认完整锥顶100段 | 405/408/4 | 200/100/108 |
| 完整锥顶16段 | 69/72/4 | 32/16/24 |
| 完整锥顶24段，u0.1…2.9 | 101/104/4 | 48/24/32 |
| 截顶24段，内半径0.65mm | 125/128/4 | 48/24/56 |

源锥顶模式有n个三角与3n个四边证明单元，材料仍是四个实际面，无径向内部加工边。原内部M/V/M标签可明确切为U，内部目标角均null；原母线曲率样式只作预览，不变成CP加工缝。有限直弦不冒充连续曲折或有限材料刚性三维初值。

新v2配方严格六键含paperBoundaryMode；旧v1严格五键只按local-cut读回，不修改旧图、metadata、schema或文件。原实际P59的35JSON/FOLD来源判定30true/5手改false保持；本批实际打开旧JSON/FOLD后再导出仍v1，只有用户明确源再生才输出v2。

| 最终验证 | 结果 |
| --- | --- |
| 项目八阶段 | 前端2908、桌面7、服务/worker66、24平面脚本及层序专项通过；后端1337既有完整结果按全部后端和受保护输入SHA原样沿用。 |
| 最终类型/构建 | CSS修订后另跑tsc+vite，1042模块；${ui.bundle}、26最终资产完整SHA。八阶段后唯一源差异是本弹窗CSS间距。 |
| 最终实际主界面 | 287项、82用户按钮文件、10次采用/11次POST；默认/16/24/U/唯一手改/恢复/截顶往返/两种旧文件均覆盖。 |
| 实际文件类型 | 48JSON+12FOLD为60份普通工程重开；12普通DXF+5优化DXF+5加工报告，共82。没有把加工报告计作工程导入。 |
| 独立实际回读 | Python434092项、核心7719项/60普通工程导入/5加工对；独立80位4×4字面反射158201项、12实际状态，全通过。 |
| 实际加工LINE | 完整16段72→69；修改24/U/恢复104→104；截顶24为128→128。按实际binary64严格共线，不为减少条数移动端点；全源覆盖、尺度、位置、一次加工及普通LINE格式保持。 |
| 真实单线手改 | curve-3-23（apex边71）唯一U/null→M/-180，选中与全数组差集均仅1 ID；旧v1的边95没有混用。来源false，明确源再生后恢复M/V与null角。 |
| 真实父容器布局 | 323项、App/Tess两入口×1420/1920桌面×MVM/U×ready/checking/error共24记录；680px弹窗/420px预览，六控件与footer无双向滚动且状态坐标稳定。 |
| 布局保护 | 283项：82新+49旧文件131 SHA不变；8真实hold后continue的native200响应，零采用/保存/项目POST/用户导出。 |
| 独立源与交付 | 源91,818项；公开586+93守卫、80位206919项；作者21聚焦/零类型诊断/78程序回读/12908独立几何/64组件fixture/188旧文件项均通过。 |
| 已有工作保护 | P59归档3462文件逐SHA保持、1834生产输入保持、五目标及CSS修订来源链严格；11项共享数值/几何/普通与优化DXF核心不改。 |

实际父层初审发现参数区clientHeight=614、scrollHeight=661；独立组件fixture只核弹窗/控件位置，未充分覆盖该父层滚动。保留失败JSON/截图，实测将组间距11→5px可消除47px溢出，字号及30px控件高度不改。修订另有四文件冻结及checked patch，不改原16交付/124支持/准备14/旧82；重新构建后主JS指纹变化，所以新上下文重新跑全287项与82真实文件，再通过最终24组布局。未用临时注入样式作最终证书。

原Python审计两处描述沿用“apex排除”硬码，实际判据已分模式且全部通过；旧报告保留并注明勘误，新的六文件描述修订按当前mode记录排除情况，不改数学判据或产品。旧Fjt构建的26资产、82文件与成功审计，以及全部失败记录均保存；最终证据只绑定CCPjVMCd。

最终lastSaved为legacyFOLDApex，UUID ${ui.lastSaved.id}。CLI汇总返回的主工程UUID仅指主八阶段/同名repeat，不能冒充最终外部文件分支的保存UUID。

当前12状态的平折核心诊断geometry.invalid/layers.unknown，实际原因是曲线弦顶点不满足川崎条件；二维源纸域简单性与CP可采用不等于平折可解。本批无Doc.flatFold、FF层序、三维刚性初值、连续运动、碰撞或纸厚证书。

| 修改源文件 | 状态 |
| --- | --- |
${changes}

| 未完成或未验证 | 状态 |
| --- | --- |
| 全部原版范围 | 完整符号/默认求解/原插值/任意数值域、任意非平折编辑及更广材料/可见色/层序仍继续，不能报可靠剩余数量或百分比。 |
| 下一批 | 原非均匀螺旋In[3968]从只读参考转真实有限CP的源合同与可行性已并行开始，未在本批冒称已实现。 |
| Wolfram/设备/交付 | 未执行Wolfram或对照保存Out，未更新免安装包、发布、第三方刻字软件导入或机器试压，不操作设备、不承诺实机提速。 |

主检查output/original-cone-four-plane-apex-checks-1011.json；最终类型/构建与资产桥output/original-cone-four-plane-apex-final-bundle-1011.json；最终实际文件${out}；最终三审计${peer}。自有两浏览器及8872服务已关闭，不操作用户8787服务。P59及此前所有冻结保持。
`;
const backup='output/original-cone-four-plane-apex-docs-before-1011';assert.ok(!fs.existsSync(backup));fs.mkdirSync(backup);const docChanges=[];
for(const file of ['README.md','docs/Origamica当前剩余范围-20261009.md']){
 assert.equal(sha(file),before.snapshots.find(r=>r.file===file).sha256,file);const data=fs.readFileSync(file),copy=backup+'/'+file;fs.mkdirSync(path.dirname(copy),{recursive:true});fs.writeFileSync(copy,data,{flag:'wx'});let value=data.toString('utf8');
 if(file==='README.md'){const heading=value.match(/^# [^\r\n]+\r?\n(?:\r?\n)+/);assert.ok(heading);value=value.slice(0,heading[0].length)+`原圆锥完整锥顶（2026-10-11，源码版）：默认完整源锥顶，保截顶/v1旧文件兼容及原M/V/null；2908前端、287实际操作、323真实布局和82文件回读通过，见[入口与验收](${document})。免安装包未更新，完整目标继续。\n\n`+value.slice(heading[0].length);}
 else{const lines=value.split(/\r?\n/),i=lines.findIndex(l=>l.startsWith('最新已验收：'));assert.ok(i>=0);lines[i]='最新已验收：原In[4039]圆锥四带完整源锥顶及可选截顶、v1旧工程不改图兼容、原MVM/U与null角、287实际操作/323真实父层布局/82实际文件回读，见P60-原圆锥完整锥顶与旧工程兼容验收-20261011.md。下一批原非均匀螺旋In[3968]真实CP源合同已并行开始，未冒称实现；P59及此前冻结保持，完整曲线、符号/默认与全数值域目标仍未完成。';value=lines.join(value.includes('\r\n')?'\r\n':'\n');}
 const oldSha=sha(file);fs.writeFileSync(file,value);docChanges.push({file,before:oldSha,after:sha(file)});
}
fs.writeFileSync(document,text,{flag:'wx'});docChanges.push({file:document,before:null,after:sha(document)});
const report='output/original-cone-four-plane-apex-report-1011.json';assert.ok(!fs.existsSync(report));
fs.writeFileSync(report,JSON.stringify({verified:true,document,docChanges,tests:run.tests,bundle:ui.bundle,finalMainAppChecks:287,finalLayoutChecks:323,layoutPreservationChecks:283,layoutRecords:24,userButtonExportFiles:82,userFileCounts:counts,independentDownloadChecks:434092,actualCoreChecks:7719,coreImports:60,actualAffine80Checks:158201,processingPairs:5,preservation:preserved,frozenIndexes,actualHandIds:hand.changedIds,actualHandEdgeIndex:71,finalSaved:ui.lastSaved,postEightCheckSourceChange:'CSS controls gap11→5 only; final tsc/build and all actual UI/files/layout rerun',failedLayoutPreserved:true,oldAuditorDescriptionRetained:true,old82And26AssetsPreserved:true,completeOrigamicaGoal:false,packed:false,published:false,machineVerified:false},null,2),{flag:'wx'});
console.log(JSON.stringify({document,finalMain:287,finalLayout:323,userFiles:82,completeOrigamicaGoal:false}));
