from pathlib import Path
import hashlib,json,shutil

root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
reportpath=root/'output/processing-r12-report-1011.json';assert not reportpath.exists()
checks=read(root/'output/processing-r12-checks-002-1011.json');first=read(root/'output/processing-r12-checks-1011.json')
assert checks['exitCode']==first['exitCode']==0 and checks['inputsUnchanged'] and first['inputsUnchanged']
assert first['tests']['frontend']==3338 and checks['guardedReuse']['frontend']
for r in checks['inputs']:assert sha(root/r['file'])==r['sha256'],r['file']
bound={};external_copies=[]
def bind(p,digest=None):
 p=Path(p).resolve();assert p.is_relative_to(root) and p.is_file(),p;h=sha(p);assert digest is None or h==digest,p;bound[p]=h
def freeze_own(name):
 p=root/name;bind(p);d=read(p)
 for r in d['files']:bind(p.parent/r['path'],r['sha256'])
 return d

oldpath=root/'output/audits/practical-five-cp-final-1011.json';old=read(oldpath);assert len(old['snapshots'])==2002
for r in old['snapshots']:assert sha(root/old['archive']/r['file'])==r['sha256'],r['file']
bind(oldpath)
freeze_own('output/parallel/processing-r12-polyline-1011/freeze.json')
peer=freeze_own('output/parallel/processing-r12-independent-1011/freeze.json')
freeze_own('output/parallel/practical-goal-scope-close-1011/freeze.json')
reader=root/'output/parallel/processing-r12-independent-1011/evidence/actual-readback-002.json';d=read(reader)
assert d['verified'] and not d['errors'] and d['checks']==2530 and d['actualUserExports']==13
bind(reader)
for r in peer.get('references',[]):
 p=Path(r['path']) if Path(r['path']).is_absolute() else root/r['path']
 if p.resolve().is_relative_to(root):bind(p,r['sha256'])
 else:
  assert p.resolve()==Path('C:/Users/11312/Desktop/环状镶嵌.dxf').resolve() and sha(p)==r['sha256']
  copy=root/'output/processing-r12-reference-copies-1011'/p.name;copy.parent.mkdir(parents=True,exist_ok=True)
  if copy.exists():assert sha(copy)==r['sha256']
  else:shutil.copy2(p,copy)
  bind(copy,r['sha256']);external_copies.append({'original':str(p),'copy':copy.relative_to(root).as_posix(),'sha256':r['sha256'],'actualUserExport':False})
changes={}
for name in ['processing-r12-core-root','processing-r12-root-ui','processing-r12-preview-layout-root']:
 p=root/'output/parallel'/(name+'-integrated-1010.json');bind(p);d=read(p);assert d['verified']
 for r in d['files']:bind(root/r['file'],r['after']);changes[r['file']]=r['after']
assert len(changes)==8
for phase in ['001','002']:
 p=root/'output/playwright/processing-r12-main-1011'/('downloads-'+phase);d=read(p/'browser-checks.json')
 assert d['verified'] and not d['errors'] and len(d['downloads'])==13 and d['checks']==(16 if phase=='001' else 17)
 for r in d['downloads']:assert r['actualUserExport'];bind(r['path'])
 for name in ['browser-checks.json','verify-main.browser.js','config.json','input-fixture.json','continuous-preview.png']:bind(p/name)
 for suffix in ['', '-002']:
  # Both source/bundle versions stay bound to their own real browser runs.
  q=root/f'output/parallel/processing-r12-root-delivery{suffix}-1011/ROOT-SOURCE-FROZEN.json';bind(q);s=read(q)
  assert len(s['files'])==791
  for r in s['files']:bind(root/r['snapshot'],r['sha256'])
  b=root/f'output/processing-r12-bundle{suffix}-1011.json';bind(b)
  for r in read(b)['files']:bind(root/r['copy'],r['sha256'])
 # Loop deliberately deduplicates unchanged common files in the binding map.
for phase in ['001','002']:
 p=root/f'output/processing-r12-runtime-cleanup-{phase}-1011.json';d=read(p);assert d['verified'] and d['userServicePreserved'];bind(p)
for name in [
 'scripts/finish-processing-r12-1011.py','scripts/run-processing-r12-checks-1011.mjs','scripts/run-processing-r12-checks-002-1011.mjs',
 'scripts/prepare-processing-r12-main-1011.py','scripts/prepare-processing-r12-main-002-1011.py',
 'scripts/prepare-processing-r12-actual-1011.py','scripts/prepare-processing-r12-actual-002-1011.py','scripts/processing-r12-actual-1011.browser.js',
 'output/parallel/processing-r12-browser-template-before-002.js','output/parallel/processing-r12-preview-layout-1011-before.css',
 'output/processing-r12-checks-1011.json','output/processing-r12-checks-1011.log','output/processing-r12-checks-002-1011.json','output/processing-r12-checks-002-1011.log',
 'output/start-processing-r12-server-1011.mjs','output/start-processing-r12-server-002-1011.mjs',
 'output/processing-r12-server-pid-1011.json','output/processing-r12-server-pid-002-1011.json',
 'output/processing-r12-server-launch-1011.json','output/processing-r12-server-launch-002-1011.json',
 'output/processing-r12-server-1011.stdout.log','output/processing-r12-server-1011.stderr.log',
 'output/processing-r12-server-002-1011.stdout.log','output/processing-r12-server-002-1011.stderr.log',
 'output/cleanup-processing-r12-runtime-001-1011.ps1','output/cleanup-processing-r12-runtime-002-1011.ps1',
]:bind(root/name)
backup=root/'output/processing-r12-docs-before-1011';assert not backup.exists();backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 p=backup/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,p);bind(p)
doc=root/'docs/P72-传统连续DXF与文件验收-20261011.md';assert not doc.exists()
doc.write_text('''# P72 传统连续 DXF 与文件验收

当前源码版已实现。操作：工具栏「优化加工导出」→「连续路径 · 限制转弯」→ 设置最多连续转弯次数 → 生成预览 → 导出加工文件。现有免安装 v0.13.6 未重新打包。

| 方案 | 实际文件 |
| --- | --- |
| 连续路径 · 限制转弯 | 传统 R12／AC1009 POLYLINE、完整 VERTEX 和 SEQEND；每条优化路径为一个实体，保留原拐点，最多转弯参数作用于实际路径。 |
| 共线相连合并 | 普通 R12 LINE；仅合并相连共线实线，保留最长长度／最多原段参数。 |
| 保留原线段 | 普通 R12 LINE；独立原段保持，不用连续实体替换普通导出。 |

无需选择加工方式或文件格式，加工方式仍为压痕。所有文件只表达几何，没有抬笔、落笔或机器控制命令。普通 CP、普通 DXF、既有加工 LINE、历史 R2000 与 SVG 出口保留。传统 POLYLINE 采用零基点／标高和默认二维法向，顶点沿用绝对毫米坐标及一次 Y 翻转；真闭环保留原最后闭边，不新增跨空白闭合线。重复／部分重叠仍先阻止，只有用户明确保留时才保留相应加工次数；加工设置不同仍分组，相同设置也仅明确确认后合并。

这是对原 LINE 无法表达完整转弯路径的问题作文件表示修复，不能据此判定此前 V48 外框实物倾斜的设备原因已解决。

| 预览与数字 | 行为 |
| --- | --- |
| 实体数 | 优化前为参与加工的原 LINE 出现次数，优化后为重新解析后的实际 LINE／POLYLINE 实体数；不是用原折痕数或规划组数替代。 |
| 总长和路径间距离 | 按加工次数累计，路径间距离按文件实体顺序估算；下游软件可能重排，不能当作实机动作或速度预测。 |
| 悬停 | 整条实际连续路径全部高亮，原段模式仅高亮相应段。保留滚轮缩放、拖动、放大／缩小和适合画布。 |
| 信息行 | 放在画布外独立底行，适合画布时不遮纸张下边缘。 |
| 输入与取消 | 参数变化立刻作废旧文件；非法参数不能导出旧结果，取消不改变源工程。 |

| 检查 | 结果 |
| --- | --- |
| 新格式专项 | 68 项新增核心检查，覆盖交叉、断开、闭环、重叠、重复加工、负坐标、极大／极小尺度及异常字段／额外实体／缺少 SEQEND 等。 |
| 相关回归 | 87 项聚焦检查通过，包含 5 项新增 worker／预览／统计集成检查和原 14 项预览回归。 |
| 全项目前端 | 新鲜运行 3338 项全部通过，类型检查与 1100 模块构建通过。之后仅 CSS 改动，按全部输入 SHA 复用同一次前端结果，重新运行类型／构建。 |
| 后台／桌面／服务 | 1337／7／66 项按所有相关输入 SHA 不变复用，未声称本批重新运行；依赖和普通 DXF 文件代码不变。 |
| 真实主 App | 最终 17 项操作断言、13 个真实用户按钮文件，包含三种连续设置、共线、原段、核验报告、普通 DXF 及源工程前后 JSON。初轮 16 项／13 文件单独保留。 |
| 独立读者 | Python 标准库单独解析 DXF 组码与实体，2530 项通过；未调用产品私有解析器。逐原边核几何覆盖、顺序、尺度、位置、次数、图层和 DOM 数值；原工程前后逐字节一致。 |
| 旧出口 | 两组预先保存的 8 份旧出口 SHA 不变，23 个旧／共用函数保持；旧 P71 的 2002 归档快照核对不变。 |

真实测试图：原 9 LINE／470 mm → 一次转弯 5 POLYLINE／470 mm；零转弯 8 POLYLINE／470 mm；共线 8 LINE／470 mm；保留原段 9 LINE／470 mm。山折两次时 6 POLYLINE／13 次原边覆盖／520 mm，次数未被静默省略。

| 修改文件 | 用途 |
| --- | --- |
| src/core/cpProcessingExport.ts | 传统连续出口和严格序列回读；旧出口保持。 |
| src/workers/cpProcessing.worker.ts | 连续方案自动选 POLYLINE，其他方案选 LINE。 |
| src/app/cpProcessingPreview.ts | 根据实际表示生成预览并核实体数、长度及路径间距离。 |
| src/components/CPProcessingPreview.tsx | 实际连续实体编号、高亮、来源长度和导航。 |
| src/components/CPProcessingExportDialog.tsx | 自动格式、真实统计、报告和准确方案文案。 |
| src/components/cpProcessingExport.css | 信息行不再覆盖画布。 |
| tests/core/cpProcessingR12Polyline.test.ts | 68 项格式／几何／异常回归。 |
| tests/app/cpProcessingContinuousOutput.test.ts | 5 项线程选择、预览归属与统计回归。 |

另新增本次检查、冻结、浏览器验收脚本及此文档；README 和剩余范围说明同步，旧内容保留在更新前副本。

按用户最新实用范围的独立收口，此前确认的五种镶嵌缺口均已关闭；确认剩余为 0 不等于原 Notebook 已穷尽，完整总数未定。任意空间曲线的真实纸域创作用途仍保留未决线索，没有把它擅自归为不可应用。

设备信息为用户提供的「深圳经纬线 V48 刻字机」；刻字软件准确名称仍未知。本地没有 ezdxf 或 dxf-parser，未下载安装，因此不声称第三方 CAD 解析器已通过。刻字软件实际导入、V48 试压／连续压痕／外框偏移改善及实机提速均未验证，没有操作机器或自动发布。测试专用浏览器与服务已清理，用户 8787 服务保留。

采用的实体语义见 [Autodesk POLYLINE 文档](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm) 和 [VERTEX 文档](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D.htm)。它们不代替目标刻字软件和机器验收。
''',encoding='utf8')
for name,text in [
 ('README.md','P72 加工导出更新（2026-10-11，源码版）：连续方案自动使用传统 R12 POLYLINE，无抬落笔或机器命令；普通／共线 LINE 保留。统计按实际实体、整条路径高亮及缩放拖动已接入，信息行不遮纸边。3338 前端、17 实际操作与 13 按钮文件独立回读通过，见[入口、修改及验收](docs/P72-传统连续DXF与文件验收-20261011.md)。V48 实机和刻字软件导入未验证；免安装 v0.13.6 未更新。'),
 ('docs/Origamica当前剩余范围-20261009.md','P71 五种实用纸面已完成，独立 [范围收口](../output/parallel/practical-goal-scope-close-1011/实用范围收口.md)确认此前实用剩余为 0；完整总数仍未定，任意空间曲线用途保留未决，不宣称 Notebook 已穷尽。P72 另已接传统 R12 连续加工 DXF，3338 前端、17 操作、13 实际文件及独立回读通过，见[P72说明](P72-传统连续DXF与文件验收-20261011.md)；软件导入／实机未验证，整体目标未自行标完成。'),
]:
 p=root/name;s=p.read_text(encoding='utf8');firstline,rest=s.split('\n',1);p.write_text(firstline+'\n\n'+text+'\n'+rest,encoding='utf8');bind(p)
bind(doc)
result={'verified':True,'sourceChanges':[{'file':p,'sha256':h} for p,h in changes.items()],'freshFrontend':3338,'newCoreChecks':68,'newAppChecks':5,'focusedChecks':87,'typecheck':True,'buildModules':1100,'CSSOnlyFinalFrontendGuardedReuse':True,'backendDesktopServerGuardedReuse':{'backend':1337,'desktop':7,'server':66},'actualUIAssertions':17,'actualUserFiles':13,'independentReaderChecks':2530,'actualReport':'output/playwright/processing-r12-main-1011/downloads-002/browser-checks.json','actualReader':reader.relative_to(root).as_posix(),'sourceFreeze':'output/parallel/processing-r12-root-delivery-002-1011/ROOT-SOURCE-FROZEN.json','externalReferenceCopies':external_copies,'ordinaryExportsPreserved':True,'noMachineCommands':True,'physicalImportVerified':False,'machineTrialVerified':False,'machineModelUserReported':'深圳经纬线 V48','cuttingSoftwareKnown':False,'runtimeCleaned':True,'userServicePreserved':True,'packaged':False,'goalStatus':'active','fullGoalCompleted':False}
reportpath.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');bind(reportpath)
archive=root/'output/audits/processing-r12-artifacts-1011';assert not archive.exists();archive.mkdir();rows=[]
for p,digest in sorted(bound.items(),key=lambda x:str(x[0])):
 assert sha(p)==digest,p;t=archive/p.relative_to(root);t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);assert sha(t)==digest
 rows.append({'file':p.relative_to(root).as_posix(),'sha256':digest,'bytes':p.stat().st_size})
index=root/'output/audits/processing-r12-final-1011.json';assert not index.exists();index.write_text(json.dumps({'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':rows,'previousP71SnapshotCountVerified':2002,'goalCompleted':False,'physicalValidation':False},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'snapshots':len(rows),'report':str(reportpath)},ensure_ascii=False))
