import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
const run=JSON.parse(read('output/original-helpers-full-run-1010.json'));assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
const modules=Number(read('output/original-helpers-build-1010.log').match(/(\d+) modules transformed/)?.[1]);assert.equal(modules,1014);
const root='output/original-helpers-browser-final-1010';
const logs=['flasher/browser-tests.log','woven-old/browser-tests.log','woven-old/full-h-browser-tests.log','pot-section-final/browser-tests.log'];
const expected=[34,13,9,58];
const browsers=logs.map((name,i)=>{const data=JSON.parse(read(root+'/'+name).match(/^### Result\r?\n([^\r\n]+)/m)[1]);assert.equal(data.passed,expected[i]);assert.deepEqual(data.errors,[]);return data;});
assert.ok(browsers.every(b=>b.bundle===browsers[0].bundle));
const flasher=JSON.parse(read(root+'/flasher/download-audit.json'));assert.equal(flasher.verified,true);assert.equal(flasher.actualDownloads,8);assert.equal(flasher.downloadChecks,45);
const woven=JSON.parse(read(root+'/woven-old/download-audit.json'));assert.equal(woven.verified,true);assert.equal(woven.actualDownloads,9);assert.deepEqual(woven.ordinaryDXFLineCounts,[64,64]);
const pot=JSON.parse(read(root+'/pot-section-final/download-audit.json'));assert.equal(pot.passed,127);assert.equal(pot.actualHelperDownloadFiles,32);
const preservation=JSON.parse(read('output/original-helpers-preservation-1010.json'));assert.equal(preservation.verified,true);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const file='docs/P51-原Old编织与原图形工具统一验收-20261010.md';assert.ok(!fs.existsSync(file));
const text=`# 原 Old 编织与原图形工具统一验收（2026-10-10）

本批已合入源码运行版。Old 是真实构造；另外两项是原笔记本本来就提供的图形帮助，不作为新增 CP 构造计数。完整复现目标尚未完成，免安装版本尚未更新，本批没有打包、发布或操作设备。

| 用户体验入口 | 实际行为 | 对应原定义与范围 |
| --- | --- | --- |
| 镶嵌设计 → 线组编织 → 编织定义版本 → 原 Old；也可选择原 In[3442] 示例 | 独立原 d/dd、原内缩 h、原固定面与边界倍率；重新构造、求平折层序、采用 CP、保存和普通导出 | MakeSimpleWovenTessellationOld In[3441]；原例及三个变体 40V/64E/25F，原固定面6与 CP 初值保留。有限直线连通母图，用 SLSQP 求原有限约束；未宣称 Wolfram FindMinimum 算法等价或全部原输入均已覆盖 |
| 线组编织 → 完整绝对 h 参数 → 整体按比例调 h | 全边已有绝对 h 时说明基准宽度用途，比例修改先确认、可取消，再重构实际几何 | 工作台可用性修复，独立于原 Old；不隐式清空绝对 h 或缩放母点 |
| 镶嵌设计 → 空间构造 → Flasher → 完整首扇区标签 | 显示完整原 Text/Table，缩放、拖动、点选坐标编辑、二维/三维绑定与参数保存重开 | FlasherFirstSectorAllPossibleVerticesLabels In[4114]；保原 i=-1..n、j=0..n 次序、Black/Bold/Subscript 和单参数 WrapRules 的 k=-1；有限数值绑定，不提供假的 CP 采用 |
| 镶嵌设计 → 空间构造 → 三种壶体 → 编辑剖面 → 原对称剖面 | 参考图首点归零并镜像，轴、轴交点、外框、范围、比例、尺寸和背景可修改，导出参数、完整 Graphics 数据和 SVG | PotCrossSectionGraphics In[3458]；任意非空有限二维点列含单点、重复、负值与非单调输入均可返回原两条 Line。七种 Graphics 选项有限子域，不冒充所有 Options[Graphics] 或 Mathematica 默认排版；不修改壶体剖面 |

| 验证 | 根项目实际结果 |
| --- | --- |
| 完整项目检查 | 前端 ${run.tests.frontend}、Python ${run.tests.backend}、桌面 ${run.tests.desktop}、服务/worker ${run.tests.serverWorker} 全部通过；${run.inputs.length} 个准确测试输入前后 SHA 不变 |
| 类型与构建 | tsc 无错误；Vite ${modules} 模块；统一界面使用 ${browsers[0].bundle} |
| 实际主界面 | Flasher34、Old13、完整 h9、原剖面58，共114；无页面运行异常，Flasher 原 passive wheel 警告已通过原生 passive:false 监听修复并回归 |
| 实际用户导出文件 | Flasher8、Old9、原剖面24，共41件；另保存8份剖面 HTTP 响应和2份父构造响应，通过浏览器捕获。32份剖面帮助下载中含8份测试响应，不能当成32件用户按钮导出 |
| 文件独立回读 | Flasher45项、原剖面127项；Old JSON/FOLD 重开、隔离工程库保存及实际平折已解。两份普通 DXF 各64条 LINE，所有坐标/层与实际 JSON 严格一致；FOLD 既有端点均值约1ulp按8epsilon尺度界核对 |
| 原式与来源审查 | 独立 Old50原式、64来源门禁、38旧默认完整响应核对；原默认只忽略计算耗时。最终三处核心修复包括全过程截止时间、零求值次数和未经请求的报告字段拒绝 |
| 已有工作保护 | 上一批2472份冻结文件全部 SHA 保持；1794个已有输入保持、10处解释明确的修改；普通/优化 DXF 三个核心文件保持 |

第一轮剖面并行测试误把既有忙碌响应当成构造成功数据。原程序会自动重试，测试脚本改成仅等待 HTTP200 后，在新目录完成全部58项；初失败日志和捕获未覆盖。此前 Flasher 被动 wheel 警告的旧日志也保留。

修改文件逐项见 output/parallel/original-flasher-all-labels-integrated-1010.json、original-flasher-wheel-integrated-1010.json、original-woven-old-integrated-1010.json 和 original-pot-cross-section-integrated-1010.json，共28个唯一交付目标；另新增本批根验收脚本、说明和冻结清单。真实根证据位于 output/original-helpers-browser-final-1010，完整检查与保护证据位于 output/original-helpers-full-run-1010.json 和 output/original-helpers-preservation-1010.json。

仍未验证：全 Wolfram 表达式/插值对象/默认选项与数值控制器，任意数值母图的全域层序、连续无碰撞、纸厚与物理可折性，原生免安装 EXE、第三方刻字软件导入和机器试压。不承诺实机提速。下一批环状 Log 原公式、Unsafe 原五参数角域和 Courteous 原随机接受模式仍在独立实现；不将其进行中证据计入本批已完成。
`;
fs.writeFileSync(file,text,{flag:'wx'});
const intro=`原 Old 编织与原图形工具（2026-10-10，未重打包）：Old 可真实构造、求层序、采用和保存/导出 CP；Flasher 完整标签与原对称剖面图支持编辑、保存和原数据导出。完整 ${run.tests.frontend}/${run.tests.backend}/${run.tests.desktop}/${run.tests.serverWorker}、${modules} 模块、114项主界面与41件用户导出文件回读通过，见[入口、范围与统一验收](docs/P51-原Old编织与原图形工具统一验收-20261010.md)。环状 Log、原五输入角域及原随机线网继续并行，完整目标尚未完成。\n\n`;
const readme=read('README.md');const heading='# 折纸工坊 · 本机工作台\r\n\r\n';const prefix=readme.startsWith(heading)?heading:'# 折纸工坊 · 本机工作台\n\n';assert.ok(readme.startsWith(prefix));
fs.writeFileSync('README.md',prefix+intro+readme.slice(prefix.length));
const remainingFile='docs/Origamica当前剩余范围-20261009.md',remaining=read(remainingFile),paragraph=remaining.split(/\r?\n/)[2];
assert.ok(paragraph.startsWith('最新已验收：'));
fs.writeFileSync(remainingFile,remaining.replace(paragraph,'最新已验收：原 Old 独立 d/dd/FindMinimum 合同及实际 CP、Flasher 完整原标签、原两条对称剖面图与七种有限 Graphics 选项，见 P51-原Old编织与原图形工具统一验收-20261010.md。此前 P50 原矩形壶体额外面板、抛物线四参数和小尺度显式母孔保持。环状 Log 正域公式、独立 UnsafeTwistAngleRange 原五输入工具及 Courteous 原随机接受模式正在并行实现；未计为全部完成。旧账本的 NMinimize 误读已按原 FindMinimum 纠正，历史冻结保留。').replace('完整目标保持active，','完整目标未完成并继续推进，'));
console.log(JSON.stringify({report:file,tests:run.tests,modules,mainUI:114,userButtonExportFiles:41,completeOrigamicaGoal:false}));
