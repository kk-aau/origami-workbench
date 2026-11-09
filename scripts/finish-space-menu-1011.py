from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
reportpath=root/'output/space-menu-report-1011.json';assert not reportpath.exists()
base=read(root/'output/practical-construction-checks-002-1011.json');expected={r['file']:r['sha256'] for r in base['inputs']};changed={};records=[]
for name in ['linked-layout-delta-root','space-menu-root-delivery','space-menu-across-route-root']:
 p=root/'output/parallel'/(name+'-integrated-1010.json');d=read(p);assert d['verified'];records.append(p)
 for r in d['files']:
  assert expected.get(r['file'])==r['before'],r['file'];expected[r['file']]=r['after']
  if name!='linked-layout-delta-root':changed[r['file']]=r['after']
for name,digest in expected.items():assert sha(root/name)==digest,name
checks=read(root/'output/space-menu-checks-002-1011.json');assert checks['exitCode']==0 and checks['inputsUnchanged'] and checks['tests']['frontend']==3216
actualfile=root/'output/playwright/space-menu-main-1011/downloads-002/browser-checks.json';actual=read(actualfile);assert actual['verified'] and actual['checks']==119 and not actual['errors'] and len(actual['downloads'])==45 and len(actual['receipts'])==11
readerfile=root/'output/parallel/space-menu-actual-reader-1011/actual-files-002.json';reader=read(readerfile);assert reader['verified'] and reader['checks']==18231 and not reader['errors'] and reader['ordinaryLines']==2571 and reader['shaFilesUnchanged']
cleanupfile=root/'output/space-menu-runtime-cleanup-1011.json';cleanup=read(cleanupfile);assert cleanup['verified'] and cleanup['userServicePreserved']
oldfile=root/'output/audits/practical-construction-final-1011.json';old=read(oldfile);oldbase=root/old['archive'];assert len(old['snapshots'])==765
for r in old['snapshots']:assert sha(oldbase/r['file'])==r['sha256'],r['file']
releases={'release/Zhezhi-Workbench-0.13.6-Portable-x64.exe':'0cd9e4a6d3086b6917fc19719f247740b7dd26402bfe2c0be2ceb288a708f441','release/Zhezhi-Workbench-0.13.6-Source.zip':'2c07399c06b6dcbd4250f9bb71bb4098a4a5813f348bd1c4564724d5c2cdb19e'}
for name,digest in releases.items():assert sha(root/name)==digest,name
bound={}
def bind(p,digest=None):
 p=Path(p).resolve();assert p.is_relative_to(root) and p.is_file(),p;h=sha(p);assert digest is None or h==digest,p;bound[p]=h
def historical(p,digest):
 p=Path(p).resolve()
 if p.exists() and sha(p)==digest:bind(p,digest);return
 prior=oldbase/p.relative_to(root);assert prior.is_file() and sha(prior)==digest,p;bind(prior,digest)
for name,digest in [('practical-entry-curation-1011','2ed7efd417460a3c157aed432235a050dbbd9cdd7f6e16c972fb1be21ba2535b'),('practical-named-gaps-1011','deb3f76694494aebfd7ac2334494fc829acc17da30d1024961c87855f9e19c20'),('practical-goal-completion-audit-1011','825a54aea7bbfdbe68502039d63ca294294f164c06138833a619f9f2026ba345'),('practical-space-menu-1011','a53591e6dbe1faabc2fc943a86fa38dd7c7cbc8edbee60d905e185f1a0f35b45')]:
 p=root/'output/parallel'/name/'freeze.json';bind(p,digest);d=read(p)
 for row in d.get('files',d.get('listedFiles',[])):bind(p.parent/row['path'],row['sha256'])
 for row in d.get('references',[]):historical(Path(row['path']) if Path(row['path']).is_absolute() else root/row['path'],row['sha256'])
 if d.get('manifest'):bind(p.parent/d['manifest']['path'],d['manifest']['sha256'])
for row in reader['actualFileBindings']:bind(row['path'],row['sha256'])
for name in ['output/space-menu-checks-1011.json','output/space-menu-checks-1011.log','output/space-menu-checks-002-1011.json','output/space-menu-checks-002-1011.log','output/space-menu-server-launch-1011.json','output/space-menu-server-pid-1011.json','output/space-menu-server-1011.stdout.log','output/space-menu-server-1011.stderr.log','output/start-space-menu-server-1011.mjs','output/cleanup-space-menu-runtime-1011.ps1','scripts/run-space-menu-checks-1011.mjs','scripts/run-space-menu-checks-002-1011.mjs','scripts/prepare-space-menu-integration-1011.py','scripts/prepare-space-menu-main-1011.py','scripts/finish-space-menu-1011.py','output/parallel/space-menu-actual-reader-1011/read-actual.ts','output/parallel/space-menu-actual-reader-1011/read-actual-v2.ts','output/parallel/space-menu-actual-reader-1011/actual-files-001.json','output/parallel/space-menu-actual-reader-1011/actual-files-002.json','output/parallel/space-menu-actual-reader-1011/probe-across.ts','output/parallel/space-menu-actual-reader-1011/probe-across.json']:
 bind(root/name)
for phase in ['001','002']:
 p=root/'output/playwright/space-menu-main-1011'/('downloads-'+phase)
 for name in ['config.json','verify-main.browser.js','browser-checks.json','main-menu.png']:bind(p/name)
 if phase=='001':bind(p/'failure.png');bind(p/'baseline-before.json')
for filename in ['space-menu-bundle-1011.json','space-menu-bundle-002-1011.json']:
 p=root/'output'/filename;bind(p);d=read(p);assert d['verified'] and len(d['files'])==26
 for row in d['files']:bind(root/row['copy'],row['sha256'])
for p in records:bind(p)
for name in changed:bind(root/name,changed[name])
bind(actualfile);bind(readerfile);bind(cleanupfile)
backup=root/'output/space-menu-docs-before-1011';assert not backup.exists();backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 t=backup/name;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,t);bind(t)
doc=root/'docs/P70-空间构造实用入口与缺口复核-20261011.md';assert not doc.exists()
doc.write_text('''# P70 空间构造实用入口与缺口复核

源码版更新；免安装 v0.13.6 未更新。整体实际创作复现目标继续，不能据本批菜单验收宣布全部完成。

| 操作入口 | 当前行为 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 空间构造类型 | 21 个入口按 5 组显示。壶体、多面体、曲折纸域、螺旋纸域和可调曲面共用同一菜单；采用曲面之后仍可选择、重复打开和取消。 |
| 曲折纸域／螺旋纸域 CP | 十种已可采用的纸面构造从参考区移到主菜单，打开后可调参数、采用、保存、来源重开及普通导出。没有新增数学构造的虚假计数。 |
| 跨右侧圆弧 · 二维 CP | 修复真实验收发现的默认只读入口：具有采用回调时直接打开圆弧 CP，仍能切换“一般源输入”参考。原有工程、源公式和导出格式保持。 |
| 多面体与折线纸带 → 折线纸带源参数 | 直接进入有序原点／左右向量编辑，生成纸带后经过现有几何检查再采用 CP。高级离散化参考仍默认系统规则，未冒充材料采用。 |
| 原式工具与参考示例 | 保留 45 个原式／参考选项，空占位可重复选择；移除与主菜单重复的家族、十种 CP 和两项曲面别名。 |

| 验收 | 结果 |
| --- | --- |
| 前端测试／类型检查／构建 | 修复后重新运行 3216 项全部通过；构建 1091 模块。后台 1337、桌面 7、服务 66 项按全部相关输入 SHA 不变复用，未声称本批重新运行。 |
| 真实主 App | 119 个断言；十种 CP 各两次打开／取消、采用、真实保存、来源重开；源参数构造后采用；已采用曲面分支再次打开／取消；两种屏幕尺寸。 |
| 实际文件 | 45 个用户按钮导出、11 次实际保存／项目落盘；32 次实际导入及 18231 个独立回读检查通过，2571 条普通 DXF LINE 坐标和类型逐项核对。 |
| 原文件回读 | 原工程在取消后完整不变；普通 DXF 保持 R12、毫米、一次 Y 翻转。跨右侧仍沿原两面 CP 合同，不伪称已增加独立材料拓扑。 |
| 失败记录 | 首次真实界面发现跨右侧只读默认，修复后复验通过；首次回读把旧 CP 合同误当材料合同，明确纠正后再读取，保留两份失败记录。 |

本批生产文件仅 TessellationPanel.tsx、SpaceConstructionMenu.tsx、CurvedAcrossRightLinearAngleDialog.tsx。后台、数学构造、核心几何、导出和依赖保持；旧 P69 的 765 个归档快照及已交付包 SHA 核对不变。测试浏览器和 8883 服务已清理，用户 8787 服务保留。

## 尚未完成的实际构造

| 已确认原版二维 CP 用途 | 当前剩余 |
| --- | --- |
| Huffman 圆曲折，In[4070–4072] | 原四参数／原返回已存在；单块有限 CP 候选完成，尚未主界面验收，成对纸面接缝和覆盖继续证明。 |
| Huffman 共焦抛物线，In[4058–4060] | 原工具本身部分完成；有限二维 CP 候选完成，尚未主界面验收；不以未完成理论代替可用纸面构造。 |
| 交替 Mosely 壶体，In[3556] | 原真实平面带与共享身份候选正在实现，保留原薄区反例；工程精度拒绝不等于原数学非法，不静默吸附、删线或改保存例。 |
| 椭圆曲折，In[4034] | 原左谷／右山／谷曲折与两条真实第二截线纸边正在接有限 CP；不拿旧 In[4093] 未赋型局部构造替代。 |
| 变角反折，In[3988] | 原递减折角和完整左右单位宽纸域正在接有限 CP；不拿现有递增圆弧家族替代。 |

这是已确认的五项实际缺口，不是对所有历史条目作“总共只剩五项”的保证。源审计明确整个目标尚不能完成。纯理论、内部辅助及没有实际创作操作的研究仍按用户约定暂不复现。

刻字软件实际导入、机器试压、实机提速未验证；没有操作机器或发布。
''',encoding='utf8')
readme=root/'README.md';s=readme.read_text(encoding='utf8');first,rest=s.split('\n',1);readme.write_text(first+'\n\nP70 空间构造入口更新（2026-10-11，源码版）：十种可采用 CP 移入分组主菜单，新增折线纸带源参数入口，修复跨右侧默认进入只读视图。3216 前端、119 真实操作及 45 按钮文件／11 保存回读通过；见[入口与五项已确认缺口](docs/P70-空间构造实用入口与缺口复核-20261011.md)。完整目标继续，免安装 v0.13.6 未更新。\n'+rest,encoding='utf8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md';s=remaining.read_text(encoding='utf8');first,rest=s.split('\n',1);remaining.write_text(first+'\n\nP70 已将十种可采用 CP 和折线纸带源参数移入分组主菜单，真实采用／保存／重开及 45 件按钮文件通过，见 [P70说明](P70-空间构造实用入口与缺口复核-20261011.md)。原文件复核确认仍须补齐 Huffman 圆曲折、共焦抛物线、交替 Mosely 壶体、椭圆 In[4034] 与递减变角反折 In[3988] 的实际有限 CP 采用流程；候选正并行实现，Huffman 单块候选尚未主验收／成对证明。五项为已确认缺口，并非封闭完整数量；不把原式示图或已有不同公式家族算完成。整个目标仍 active。\n'+rest,encoding='utf8')
for p in [doc,readme,remaining]:bind(p)
result={'verified':True,'sourceChanges':[{'file':k,'sha256':v} for k,v in changed.items()],'frontend':3216,'buildModules':1091,'guardedReuse':checks['guardedReuse'],'actualUIAssertions':119,'actualUserFiles':45,'actualSavePOSTs':11,'actualReaderChecks':18231,'actualCoreImports':32,'ordinaryLines':2571,'bundle':actual['bundle'],'fiveConfirmedPracticalGaps':['Huffman Circle4','Huffman Parabola','Alt Mosely In3556','Ellipse In4034','Across decreasing angle In3988'],'goalStatus':'active','fullGoalCompleted':False,'completeRemainingCountKnown':False,'packaged':False,'oldPackagePreserved':True,'userServicePreserved':True,'physicalValidation':False,'testsAndArtifacts':{'browser':actualfile.relative_to(root).as_posix(),'reader':readerfile.relative_to(root).as_posix(),'checks':'output/space-menu-checks-002-1011.json'},'sourceAuditIndexes':[p.relative_to(root).as_posix() for p in bound if p.name=='freeze.json']}
reportpath.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');bind(reportpath)
archive=root/'output/audits/space-menu-artifacts-1011';archive.mkdir();snapshots=[]
for p,digest in sorted(bound.items(),key=lambda kv:str(kv[0])):
 assert sha(p)==digest,p;t=archive/p.relative_to(root);t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);assert sha(t)==digest;snapshots.append({'file':p.relative_to(root).as_posix(),'sha256':digest,'bytes':p.stat().st_size})
freeze=root/'output/audits/space-menu-final-1011.json';assert not freeze.exists();freeze.write_text(json.dumps({'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':snapshots,'previousP69SnapshotsVerified':765,'goalCompleted':False},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'archiveFiles':len(snapshots),'report':str(reportpath),'goal':'active'},ensure_ascii=False))
