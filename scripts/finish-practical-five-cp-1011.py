from pathlib import Path
import hashlib,json,shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
report=root/'output/practical-five-cp-report-1011.json'
assert not report.exists()
checks=read(root/'output/practical-five-hover-checks-1011.json')
assert checks['exitCode']==0 and checks['inputsUnchanged'] and checks['tests']['frontend']==3265
for r in checks['inputs']:assert sha(root/r['file'])==r['sha256'],r['file']
sourcepath=root/'output/parallel/practical-five-cp-root-delivery-1011/ROOT-SOURCE-FROZEN.json'
source=read(sourcepath);assert len(source['files'])==791
for r in source['files']:
 assert sha(root/r['path'])==r['sha256'] and sha(root/r['snapshot'])==r['sha256'],r['path']
cleanup=read(root/'output/practical-five-cp-runtime-cleanup-1011.json')
assert cleanup['verified'] and cleanup['userServicePreserved']
old_indexes=[]
for path,count in [('output/audits/space-menu-final-1011.json',304),('output/audits/practical-construction-final-1011.json',765)]:
 old=read(root/path);assert len(old['snapshots'])==count
 for r in old['snapshots']:assert sha(root/old['archive']/r['file'])==r['sha256'],r['file']
 old_indexes.append({'path':path,'sha256':sha(root/path),'snapshots':count})
for name,digest in {'release/Zhezhi-Workbench-0.13.6-Portable-x64.exe':'0cd9e4a6d3086b6917fc19719f247740b7dd26402bfe2c0be2ceb288a708f441','release/Zhezhi-Workbench-0.13.6-Source.zip':'2c07399c06b6dcbd4250f9bb71bb4098a4a5813f348bd1c4564724d5c2cdb19e'}.items():assert sha(root/name)==digest
bound={}
def bind(p,digest=None):
 p=Path(p).resolve();assert p.is_relative_to(root) and p.is_file(),p
 h=sha(p);assert digest is None or digest==h,p;bound[p]=h
def own_freeze(name):
 p=root/name;bind(p);d=read(p)
 for r in d.get('files',d.get('listedFiles',[])):
  bind(p.parent/r['path'],r['sha256'])
 manifest=d.get('manifest')
 if isinstance(manifest,dict):bind(p.parent/manifest['path'],manifest['sha256'])
 # Historical reference inputs remain in their existing immutable indexes.
 # Actual references are separately bound by the actual-reader list below.

for name in [
 'output/parallel/huffman-finite-cp-1011/freeze.json',
 'output/parallel/huffman-finite-cp-1011/source-before/freeze.json',
 'output/parallel/huffman-paired-finite-cp-1011/freeze.json',
 'output/parallel/huffman-paired-material-source-1011/PAIR-SOURCE-FROZEN.json',
 'output/parallel/ellipse-across-finite-cp-1011/DELIVERY-FROZEN.json',
 'output/parallel/ellipse-across-finite-cp-1011/SOURCE-FROZEN.json',
 'output/parallel/ellipse-across-finite-cp-1011/SUPPORT-FROZEN.json',
 'output/parallel/alt-mosely-finite-cp-1011/DELIVERY-FROZEN.json',
 'output/parallel/alt-mosely-finite-cp-1011/SUPPORT-FROZEN.json',
 'output/parallel/ellipse-across-finite-cp-mechanism-peer-1011/freeze.json',
 'output/playwright/practical-five-ellipse-across-main-1011/freeze.json',
 'output/parallel/practical-five-alt-main-final-review-1011/freeze.json',
 'output/parallel/practical-five-cp-actual-reader-1011/ACTUAL-FROZEN.json',
]:own_freeze(name)
bind(sourcepath)
for r in source['files']:bind(root/r['snapshot'],r['sha256'])
changes=[]
for name in ['practical-five-cp-root-delivery','processing-hover-root']:
 p=root/'output/parallel'/(name+'-integrated-1010.json');bind(p);d=read(p);assert d['verified']
 for r in d['files']:bind(root/r['file'],r['after']);changes.append({'file':r['file'],'sha256':r['after']})
actual=[]
for path,count,files in [
 ('output/playwright/practical-five-cp-main-1011/downloads-001',54,24),
 ('output/playwright/practical-five-ellipse-across-main-1011/downloads-001',154,20),
 ('output/playwright/practical-five-alt-main-1011/downloads-001',62,18),
 ('output/playwright/processing-hover-main-1011/downloads-001',12,4),
]:
 p=root/path;d=read(p/'browser-checks.json');assert d['verified'] and not d['errors'] and d['checks']==count and len(d['downloads'])==files
 for r in d['downloads']:assert r['actualUserExport'];bind(r['path'])
 bind(p/'browser-checks.json')
 for name in ['config.json','verify-main.browser.js']:
  if (p/name).exists():bind(p/name)
 for name in ['circle-pair.png','input-fixture.json','input-role.json']:
  if (p/name).exists():bind(p/name)
 actual.append({'path':path+'/browser-checks.json','assertions':count,'buttonFiles':files})
readerpath=root/'output/parallel/practical-five-cp-actual-reader-1011/evidence/actual-readback-002.json'
reader=read(readerpath);assert reader['verified'] and reader['checks']==16787 and not reader['errors'] and reader['shaFilesUnchanged']
for r in reader['actualFileBindings']:bind(r['path'],r['sha256'])
hoverpath=root/'output/parallel/processing-hover-actual-reader-1011/readback-001.json'
hover=read(hoverpath);assert hover['verified'] and hover['checks']==31
for r in hover['actualFileBindings']:bind(root/r['path'],r['sha256'])
bundlepath=root/'output/practical-five-cp-bundle-1011.json';bind(bundlepath)
for r in read(bundlepath)['files']:bind(root/r['copy'],r['sha256'])
for name in [
 'scripts/prepare-practical-five-cp-integration-1011.py','scripts/prepare-practical-five-cp-main-1011.py',
 'scripts/run-practical-five-cp-checks-1011.mjs','scripts/run-practical-five-hover-checks-1011.mjs',
 'scripts/finish-practical-five-cp-1011.py',
 'output/practical-five-cp-checks-1011.json','output/practical-five-cp-checks-1011.log',
 'output/practical-five-hover-checks-1011.json','output/practical-five-hover-checks-1011.log',
 'output/practical-five-cp-server-launch-1011.json','output/practical-five-cp-server-pid-1011.json',
 'output/practical-five-cp-server-1011.stdout.log','output/practical-five-cp-server-1011.stderr.log',
 'output/start-practical-five-cp-server-1011.mjs','output/cleanup-practical-five-cp-runtime-1011.ps1',
 'output/cleanup-practical-five-cp-runtime-1011-no-bom-failed.ps1','output/practical-five-cp-runtime-cleanup-1011.json',
 'output/parallel/processing-hover-actual-reader-1011/read-actual.ts','output/parallel/processing-hover-actual-reader-1011/readback-001.json',
]:bind(root/name)
backup=root/'output/practical-five-cp-docs-before-1011';assert not backup.exists();backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 p=backup/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p);bind(p)
doc=root/'docs/P71-五种原版纸面构造与加工预览-20261011.md'
assert not doc.exists()
doc.write_text('''# P71 五种原版纸面构造与加工预览

源码版已接入实际创作流程。现有免安装 v0.13.6 未更新；整体目标仍进行中，不据五项验收宣称原工具已穷尽。

| 体验入口 | 当前可用行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 曲折纸域 → Huffman 圆／共焦抛物线 CP | 四角参数、离散分段和毫米尺度；默认成对纸面，可切换单块；有刻度预览、缩放和平移，采用后可从源参数重开。 |
| 空间构造 → 壶体 → 交替 Mosely CP | 原剖面可拖点、增删点和输入坐标；偶数扇区、角度阈值可调，生成真实纸面后采用、保存、源重建。 |
| 空间构造 → 曲折纸域 → 原光学椭圆 CP | 两焦点／交点、原参数区间、分段、母线密度和毫米比例；原左右折痕类型保留，纸边采用真实第二截线。 |
| 空间构造 → 曲折纸域 → 原下降折角 CP | 原递减折角、参数区间、左右纸宽、分段和毫米比例；完整两面纸域，有源坐标和预览刻度。 |
| 优化加工导出 → 原方案 → 预览悬停 | 高亮所在线段所属的整个连续规划组；原 LINE 文件格式仍是多条实体，此次仅修复预览归属，不据此宣称机器连续加工。 |

五种构造均支持实时有效预览、无效输入禁止采用、取消保留原工程、实际采用、保存／重开和普通 JSON／FOLD／DXF 导出。新入口共用分组菜单，当前主菜单 26 项；不把参考公式作为新增创作数量。

| 核验 | 结果 |
| --- | --- |
| 新鲜前端测试／类型检查／构建 | 3265 项通过、类型通过、1100 模块构建通过。后台 1337／桌面 7／服务 66 项按全部相关输入 SHA 不变复用，未声称本批重新执行。 |
| 五种构造真实 App | 270 个界面断言、62 个真实按钮文件、13 次保存 POST／7 个最终工程 UUID。 |
| 独立实际文件回读 | 16787 检查、49 次核心导入、1323 条普通 DXF LINE 坐标／类型核对通过；检查取消不变、源守卫、重建身份和磁盘保存。 |
| 悬停预览 | 12 个真实界面断言、4 个按钮文件、31 个独立回读检查通过，原工程逐字节不变；整个连续组、零转弯与共线方案均覆盖。 |
| 保留记录 | 候选失败、薄区精度反例、第一次读者适配失败和清理脚本编码失败均保留；旧 P70／P69 归档与已交付包 SHA 不变。 |

曲线 CP 是有限折线纸面；没有据此验证原连续三维折叠、碰撞或层序。极薄区精度失败明确拒绝，不吸附、移动点或删除结构。原式研究／内部辅助／没有实际操作的公式按用户最新范围暂不复现；实用范围仍独立复核，完整总数未定。

深圳经纬线 V48 是用户提供的机器型号。真正连续加工的新传统 R12 POLYLINE 格式另批实现，普通 LINE 导出保留；不写抬落笔或机器命令。刻字软件名称未知，实际软件导入、机器试压和实机提速均未验证，没有操作机器或发布。
''',encoding='utf8')
for name,text in [
 ('README.md','P71 实用纸面更新（2026-10-11，源码版）：Huffman 圆／抛物线、交替 Mosely、原光学椭圆及下降折角五种 CP 已接参数、采用、保存／重开与导出；3265 前端、270 实际操作及 62 按钮文件独立回读通过。加工预览悬停可高亮完整规划组；见[入口与验收](docs/P71-五种原版纸面构造与加工预览-20261011.md)。普通 LINE 保留，真正连续路径格式另批实现；整体目标继续，免安装 v0.13.6 未更新。'),
 ('docs/Origamica当前剩余范围-20261009.md','P71 已补齐此前确认的五种有限 CP 实际创作流程，270 实际操作、62 按钮文件和独立回读通过，见 [P71说明](P71-五种原版纸面构造与加工预览-20261011.md)。按用户最新要求排除没有实际操作的理论／内部辅助；实用范围收口继续，不能称 Notebook 已穷尽。普通 LINE 文件的规划连续不等于实机连笔，用户已允许无机器命令的传统 R12 连续路径，另批实现验证。'),
]:
 p=root/name;s=p.read_text(encoding='utf8');first,rest=s.split('\n',1);p.write_text(first+'\n\n'+text+'\n'+rest,encoding='utf8');bind(p)
bind(doc)
result={'verified':True,'sourceChanges':changes,'tests':checks['tests'],'guardedReuse':checks['guardedReuse'],'practicalActual':{'assertions':270,'buttonFiles':62,'savePOSTs':13,'diskUUIDs':7,'readerChecks':16787,'coreImports':49,'ordinaryLines':1323},'hoverActual':{'assertions':12,'buttonFiles':4,'readerChecks':31,'historicalOutput':'dxf-lines'},'actualReports':actual,'sourceFreeze':sourcepath.relative_to(root).as_posix(),'bundle':source['bundle'],'fiveConfirmedPracticalGapsClosed':True,'fullGoalCompleted':False,'completeRemainingCountKnown':False,'goalStatus':'active','packaged':False,'physicalValidation':False,'runtimeCleaned':True,'userServicePreserved':True,'previousIndexes':old_indexes}
report.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');bind(report)
archive=root/'output/audits/practical-five-cp-artifacts-1011';assert not archive.exists();archive.mkdir();rows=[]
for p,digest in sorted(bound.items(),key=lambda x:str(x[0])):
 assert sha(p)==digest,p;t=archive/p.relative_to(root);t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);assert sha(t)==digest
 rows.append({'file':p.relative_to(root).as_posix(),'sha256':digest,'bytes':p.stat().st_size})
index=root/'output/audits/practical-five-cp-final-1011.json';assert not index.exists();index.write_text(json.dumps({'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':rows,'previousIndexes':old_indexes,'goalCompleted':False},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'snapshots':len(rows),'report':str(report)},ensure_ascii=False))
