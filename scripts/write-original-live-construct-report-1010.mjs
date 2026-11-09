import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(f,'utf8'),run=JSON.parse(read('output/original-live-construct-full-run-1010.json'));
assert.equal(run.exitCode,0);assert.equal(run.inputsUnchanged,true);
const root='output/original-ring-unsafe-courteous-browser-1010',names=['unsafe','ring-log','paraboloidal-x','courteous'],expected=[30,18,21,18];
const browsers=names.map((name,i)=>{const r=JSON.parse(read(root+'/'+name+'/browser-tests.log').match(/^### Result\r?\n([^\r\n]+)/m)[1]);assert.equal(r.passed,expected[i]);assert.deepEqual(r.errors,[]);return{...r,bundle:new URL(r.bundle,'http://127.0.0.1:8861').pathname};});
const switches=JSON.parse(read(root+'/courteous/browser-switches.log').match(/^### Result\r?\n([^\r\n]+)/m)[1]);assert.equal(switches.passed,9);assert.deepEqual(switches.errors,[]);
assert.ok(browsers.every(b=>b.bundle===browsers[0].bundle));
const audits=names.map(name=>JSON.parse(read(root+'/'+name+'/download-audit.json')));
assert.equal(audits[0].downloadChecks,39);assert.equal(audits[0].actualDownloads,8);assert.equal(audits[1].actualUserDownloads,10);assert.deepEqual(audits[1].ordinaryDXFLineCounts,[204,204]);
assert.equal(audits[2].checks,35);assert.equal(audits[2].actualUserDownloads,7);assert.equal(audits[3].passed,100);assert.equal(audits[3].actualOrdinaryFileDownloads,8);
const preservation=JSON.parse(read('output/original-live-construct-preservation-1010.json'));assert.equal(preservation.verified,true);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const modules=Number(read('output/original-live-construct-build-1010.log').match(/(\d+) modules transformed/)?.[1]);assert.equal(modules,1021);
const file='docs/P52-原公式与空间随机构造统一验收-20261010.md';assert.ok(!fs.existsSync(file));
fs.writeFileSync(file,`# 原公式与空间随机构造统一验收（2026-10-10）

本批已合入源码运行版，完整复现目标尚未完成，免安装包未更新。

| 体验入口 | 已实现结果与准确范围 |
| --- | --- |
| 镶嵌设计 → 环状镶嵌 → 原环形构造 → Log 正域原函数示例 | 原二维公式增加内置 Log/log；可修改 pfn/rfn 原式，源参数与数学域保存，实际构造、层序、采用、保存重开。两实际例108V/204E/97F。严格正域的工程区间包围，明确 binary64/libm端点≤2ULP假设，不宣称实数机器证明、所有符号域或 Wolfram 数值 Out；显式用户同名函数保旧优先级 |
| 镶嵌设计 → 空间构造 → 抛物面 Flasher → 对角折线 X | 原 In[4204]→In[4173]→In[4130]→In[4122] 选项真正传递；可调整 f、重新构造、采用展开图、普通导出并重开。三数值例20/36/17、100/196/97、222/438/217；原方程、求解器、几何/面积/空间等距门禁保持。静态空间等距与平折层序认证区分；f=10⁶真实交叉拒绝，不能采用旧结果 |
| 镶嵌设计 → 线组编织 → 随机 → 原随机母线接受规则 → 原随机母线示例 | MakeCourteousAnarchyLines 原极坐标候选、内部线相交规则与 MaxTries仅距离失败计数；默认20000/seed0。总5000预算覆盖中心重试与候选，不隐藏界外中心。两个种子实际层序已解，可普通采用、保存、导出。原Lines后接本地arrangement；尚未宣称原Graph的两阶段和两公差已复现，不冒 Wolfram SeedRandom 序列 |
| 镶嵌设计 → 原始—对偶 → 原五输入角域 | 原 pverts/pfaces/dverts/dfaces/bverts 独立可编辑、点拖动实时重算、刻度/缩放、取消恢复、参数/结果保存重开。逐原始面首非边界起点三元组、仅首对偶面全部三元组、弧度Min/Max不夹负值或>π。作者IN PROGRESS/TBD和本地示例明确保留，不猜 In[3339]缓存或空dual faces，不增虚假CP采用/层序认证 |

| 根项目实际验收 | 结果 |
| --- | --- |
| 现有检查全部完成 | 前端${run.tests.frontend}、Python${run.tests.backend}、桌面${run.tests.desktop}、服务/worker${run.tests.serverWorker}通过；${run.inputs.length}测试输入SHA保持；类型及${modules}模块构建通过 |
| 最终主界面 | 角域30、环状18、X21、随机18＋切换9，共96；全部使用${browsers[0].bundle}，零页面运行异常 |
| 实际用户导出 | 角域8、环状10、X7、随机8，共33件；API响应捕获单列，未充作用户按钮导出数 |
| 独立文件回读 | 角域39项、X35项、随机100项；环状全CP/FF原射线oracle、原参数/source/保存库与重开通过。环状两DXF各204 LINE、X两DXF各196 LINE，坐标/图层/位置/尺度/一次覆盖核对；普通JSON/FOLD源及原已有坐标转换保持 |
| 数学域专项 | Log helper与338区间/16900次90位独立值导数检查最终SHA匹配；8非法域拒绝。属于有限压力检查，不等于libm全域或实数形式证明 |
| 既有工作保护 | 上批2544份冻结文件保持；1802已有输入未变、19处修改有明确记录；普通和加工优化DXF三核心文件保持 |

原全量测试会话中断，初日志保留，已经完成的前端/桌面不重复；后台重新执行全部剩余项目检查，每阶段实际退出码记录在 output/original-live-construct-continuation-1010.json，合并完成日志另存，未把初次未完成Python段算通过。

修改文件逐项见 output/parallel/original-unsafe-twist-range-integrated-1010.json、original-ring-log-early-adoption-integrated-1010.json、original-ring-log-integrated-1010.json、original-courteous-anarchy-integrated-1010.json、original-paraboloidal-x-integrated-1010.json；早期Ring三核心在完整交付时仅SHA完全相同才跳过，Courteous随后以3e99新基线重放，不覆盖来源门禁。另新增本批根验收与后台退出记录脚本、说明及冻结证据。

仍缺/进行中：Flasher有限因子输入域、原DualFaces返回和Courteous原Graph两公差/两阶段正在下一批独立实现；全 Wolfram表达式/插值对象/选项/默认控制器，以及任意数值/层序/碰撞与物理域仍未完整验证。原生免安装EXE、第三方刻字软件、机器试压均未验证；没有打包或发布，不承诺实机提速。
`,{flag:'wx'});
const intro=`原公式与空间随机构造（2026-10-10，未重打包）：环状Log公式、抛物面Flasher原X和原随机母线可实际构造、采用及普通保存导出；原五输入角域支持可视点编辑与实时计算。完整${run.tests.frontend}/${run.tests.backend}/${run.tests.desktop}/${run.tests.serverWorker}、${modules}模块、96项主界面、33件用户文件回读通过，见[入口、范围及验收](docs/P52-原公式与空间随机构造统一验收-20261010.md)。Flasher因子、原对偶面与随机Graph原公差继续并行，完整目标尚未完成。\n\n`;
const original=read('README.md'),prefix=original.startsWith('# 折纸工坊 · 本机工作台\r\n\r\n')?'# 折纸工坊 · 本机工作台\r\n\r\n':'# 折纸工坊 · 本机工作台\n\n';assert.ok(original.startsWith(prefix));fs.writeFileSync('README.md',prefix+intro+original.slice(prefix.length));
const remainingFile='docs/Origamica当前剩余范围-20261009.md',remaining=read(remainingFile),paragraph=remaining.split(/\r?\n/)[2];assert.ok(paragraph.startsWith('最新已验收：'));
fs.writeFileSync(remainingFile,remaining.replace(paragraph,'最新已验收：原环状Log有限数值公式及实际CP、抛物面Flasher原X、Courteous原随机Lines接受模式和原五输入角域，见P52-原公式与空间随机构造统一验收-20261010.md；P51 Old/标签/剖面和P50参数/母孔保持。下一批Flasher有效因子输入、原DualFaces遗漏和Courteous原Graph两公差/两阶段正在实现，完整目标未完成。'));
console.log(JSON.stringify({report:file,tests:run.tests,modules,mainUI:96,userButtonFiles:33,completeOrigamicaGoal:false}));
