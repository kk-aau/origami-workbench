from pathlib import Path
import json,hashlib,shutil
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
reportpath=root/'output/practical-construction-report-1011.json';assert not reportpath.exists()
names=['nested-mother-visual-editor-root','nested-mother-visual-editor-delta-root','original-six-root-delivery','nested-mother-transfer-delta-root','nested-mother-focus-delta-root','original-static-spatial-root-delivery','woven-source-editor-root-delivery','original-array-camera-realtime-delta-root','custom-mesh-editor-root','custom-mesh-connectivity-root','linked-bands-planar-root','original-six-static-root','practical-main-entries-root','linked-layout-delta-root']
base=read(root/'output/original-arrays-checks-1011.json');expected={r['file']:r['sha256'] for r in base['inputs']};changes={};recordfiles=[]
for name in names:
 file=root/'output/parallel'/(name+'-integrated-1010.json');record=read(file);assert record['verified'];recordfiles.append(file)
 for row in record['files']:
  assert expected.get(row['file'])==row['before'],row['file'];expected[row['file']]=row['after'];changes[row['file']]=row['after']
for name,digest in expected.items():assert sha(root/name)==digest,name
check=read(root/'output/practical-construction-checks-002-1011.json');layoutcheck=read(root/'output/practical-layout-final-checks-1011.json');assert check['exitCode']==0 and check['inputsUnchanged'] and len(check['stages'])==8 and layoutcheck['exitCode']==0
browserpaths=[
 'output/playwright/nested-mother-main-1011/downloads-003/browser-checks.json',
 'output/playwright/practical-construction-main-1011/downloads-002/browser-checks.json',
 'output/playwright/custom-mesh-source-main-1011/downloads-002/browser-checks.json',
 'output/playwright/custom-mesh-source-main-1011/disconnected-apply-002/browser-checks.json',
 'output/playwright/practical-linked-layout-main-1011/browser-checks.json',
 'output/playwright/woven-source-main-1011/final-browser-checks.json']
readerbase='output/parallel/practical-construction-main-independent-reader-1011/'
readerpaths=[readerbase+'evidence/'+n for n in ['nested-actual-003.json','practical-actual-003.json','custom-actual-004.json','linked-layout-actual-002.json','woven-actual-003.json']]
frozen=[
 (readerbase+'NESTED-ACTUAL-FROZEN.json','edc6f43fe039de3b3540d30cd288c1fac1c5cc13cbdfb8988fba0273ef85bf22'),
 (readerbase+'PRACTICAL-ACTUAL-FROZEN.json','fa31b75c8a4943a3d2b9c4dcff19e7a3996df5f249afea34a99fd24e67101987'),
 (readerbase+'WOVEN-ACTUAL-FROZEN.json','2b25cb96a0f179cf4e99923987580fa0278a9f7a59eb06e89039ba43337282f7'),
 ('output/parallel/original-linked-bands-4086-planar-independent-review-1011/freeze.json','37d416ade316fe7f19c59184c1e1bc2b01b79ba45570d6676f6a60cfc114a5c7'),
 ('output/playwright/custom-mesh-source-main-1011/freeze.json','e2d57abeb2f77376736ba6e7cd245ba7d1bc1fad4821f212c3c3d82e5eda6291'),
 ('output/parallel/woven-source-main-final-review-1011/freeze.json','ea1031b46b175bea0427d21f3a00f762fe0e67875f1dc3740d9de5b91eef0c30')]
bound={}
def bind(path,digest=None):
 file=Path(path).resolve();assert file.is_relative_to(root) and file.is_file(),str(file)
 actual=sha(file);assert digest is None or digest==actual,str(file);bound[file]=actual
for name,digest in frozen:
 index=root/name;bind(index,digest);data=read(index)
 filebase=Path(data['rootBase']) if 'rootBase' in data else index.parent
 for row in [*data.get('files',data.get('listedFiles',[])),*data.get('references',[])]:bind(filebase/row['path'],row['sha256'])
for name in ['output/practical-followups-root-sha-1011.json','output/woven-source-editor-root-sha-1011.json','output/original-static-spatial-root-sha-1011.json','output/yoshimura-six-source-delivery-support-sha-1011.json']:
 index=root/name;bind(index);data=read(index)
 for row in data.get('files',[]):bind(root/row['file'],row['sha256'])
browsers=[];actualfiles={}
for name in browserpaths:
 file=root/name;data=read(file);assert data['verified'] and not data.get('errors'),name;bind(file)
 files=data.get('files',data.get('downloads',[]));assert files
 for row in files:
  assert row['actualUserExport'];bind(Path(row['path']));actualfiles[Path(row['path']).resolve()]=row
 browsers.append({'file':name,'bundle':data['bundle'],'checks':data['checks'],'actualUserFiles':len(files),'freshSingleRun':not name.endswith('final-browser-checks.json')})
readers=[]
for name in readerpaths:
 file=root/name;data=read(file);assert data['verified'] and not data['errors'];bind(file)
 for row in data['actualFileBindings']:bind(Path(row['path']),row['sha256'])
 readers.append({'file':name,'checks':data['checks'],'actualFiles':data['actualUserDownloads'],'coreImports':data['actualCoreImports'],'ordinaryLines':data['ordinaryLines'],'savePOSTs':data['actualSavePOSTs'],'projectDisks':data['actualProjectDisks']})
oldarchive=root/'output/audits/original-arrays-final-1011.json';old=read(oldarchive);oldbase=root/old['archive'];assert len(old['snapshots'])==2273
for row in old['snapshots']:assert sha(oldbase/row['file'])==row['sha256'],row['file']
releases={
 'release/Zhezhi-Workbench-0.13.6-Portable-x64.exe':'0cd9e4a6d3086b6917fc19719f247740b7dd26402bfe2c0be2ceb288a708f441',
 'release/Zhezhi-Workbench-0.13.6-Source.zip':'2c07399c06b6dcbd4250f9bb71bb4098a4a5813f348bd1c4564724d5c2cdb19e'}
for name,digest in releases.items():assert sha(root/name)==digest,name
cleanup=read(root/'output/practical-tools-runtime-cleanup-1011.json');assert cleanup['verified'] and cleanup['userServicePreserved']
assert len(changes)==38 and len(actualfiles)==85 and sum(b['checks'] for b in browsers)==296
doc=root/'docs/P69-实用母网与阵列空间预览-20261011.md';assert not doc.exists()
text='''# P69 实用母网、编织源编辑与阵列空间预览

本批是源码版更新，尚未进入 v0.13.6 免安装包。用户本机 8787 服务保持；浏览器版刷新后可体验。整个实用复现目标继续，不能据本批通过宣称原版全部复现。

| 功能 | 操作入口与最终行为 |
| --- | --- |
| 母网源编辑 | 镶嵌设计 → 自定义 → 编辑网格。拖动或精确改点，新增点、连线、按顺序建面，明确删面后再删除引用。刻度、缩放／平移、撤销／重做、取消可用。临时连线不保存为折痕；高级网格 JSON 保留。 |
| 嵌套母参数 | 原始—对偶 → 编辑母结构参数；铺石 → 编辑铺石母参数。复用对应构造的数字／可视控件，局部预览后应用；只有源真正改变才清除旧索引目标。已修复“用于铺石”错误恢复默认纸张。 |
| 编织线组与源边界 | 线组编织 → 编辑线组／编辑边界。拖线、旋转、输入角度／距离／宽度倍率，增删点；旋转弦边界保留原 0／1／2 点来源，预览凸包不覆盖源点。几何与整片层序门禁保持。 |
| 六度 Yoshimura 折筒 | 构造方式 → 六度折筒。三种原六度种子，行列／毫米长度／两个控制折角，有限三角 CP、静态 3D、采用、参数重开、普通导出。 |
| Miura／Mars／Huffman 及 Yoshimura／Miura 空间预览 | 波纹阵列或双向螺旋／混合 → 原静态 3D。按原正负目标角逐面构造，核对全共享点、全邻面闭环和逐面等距。拖动旋转、滚轮缩放；CP／3D 标签切换保留视角；拖动折角过程中更新。 |
| 关联多带二维纸面 | 构造方式 → 关联多带 CP。半径、间距、扰动、初始角、绝对参数裁域、2–4 带、采样和毫米倍率可调；刻度、缩放／平移、取消、采用和来源重建。仅真实纸边 B 与内部 U/null 弦进入 CP。 |

## 范围与使用边界

母网编辑仅保存用户明确建立的有序源面，不自动猜面、合点或推断折痕。断连源可保存、继续编辑；现有后端仍拒绝生成不连续母网 CP。凹面可用于母结构排布，扭转仍须通过现有几何和层序检查。新增／改点本身不代表 CP 可采用。

六度两折角保持原正分支 30–60°；阵列静态预览最多 600 面，CP 原容量门禁保持。静态形态核验不是连续运动、碰撞、厚度制造或平折层序证明。有效 CP 若空间闭环失败，明确停止 3D，保留二维采用；真实反例已验证。

关联多带采用原 In[4076]/In[4086] 的字面二维公式，但数值采用明确的本地四次插值和中央根，不等同 Mathematica 默认 ListInterpolation 或原三维保存链。原三维链的源矛盾仍未解决，不能声称已复现。四带 Γ90 真正失败、两带 Γ90 可构造；输入不回退，不把证明横线／对角线加入 CP，不附 FF 或层序。原毫米倍率只用一次。

## 统一验证

| 检查 | 结果 |
| --- | --- |
| 项目检查 | 3216 前端、7 桌面、66 服务／工作线程；8 阶段全通过，1090 模块构建。1337 后端结果只在源码 SHA 一致的条件下复用。 |
| 最终布局修正 | 仅 Linked CSS 改动；所有其余已检查输入 SHA 保持。再次运行类型检查／构建，并核验 1366×768、1420×960、1920×1080 的十参数、完整说明及底栏均可达。 |
| 实际主 App | 296 个成功断言、85 个真实按钮文件；含母参数、取消、采用、拖动、保存、JSON/FOLD 重开。编织 72 为三个实际阶段的成功断言合并，包含明确保留的两次测试脚本失败，不能冒称全流程单轮成功。 |
| 独立实际文件读回 | 19289 检查、83 文件、62 次格式导入、1451 条普通 DXF LINE、19 个真实保存 POST、17 个工程库 UUID；两件断连拒绝补验 JSON 另由 16 项只读比较确认。 |
| 原源数学审查 | Linked 12 个有限例（10 构造、2 明确拒绝），21636 数学检查与 134 门禁检查；六度／具名阵列逐面变换和实际 DOM 空间坐标另核验。以上不代表任意参数全域或 Wolfram 数值等价。 |
| 文件与运行资源 | 每项合并前核对既有 SHA、备份；旧失败和 P68 2273 个归档文件保持。只清理自有测试浏览器与 8882 服务，用户 8787 服务保持。普通／优化 DXF 核心、后端和依赖没有改动。 |

检查与文件索引见 `output/practical-construction-report-1011.json`，完整冻结见 `output/audits/practical-construction-final-1011.json`。DLQ 是本批完整操作构建；DG 为只改 Linked CSS 后的最终构建。各报告绑定各自真实 bundle，不混用历史结果。

刻字软件实际导入、实机试压未验证；不承诺实机提速。没有机器操作或发布。本批尚未打包；v0.13.6 两个既有产物 SHA 保持。

## 修改文件

'''
text+='| 文件 | SHA256 |\n| --- | --- |\n'+''.join(f'| `{name}` | `{digest}` |\n' for name,digest in sorted(changes.items()))
doc.write_text(text,encoding='utf8',newline='\n')
backup=root/'output/practical-construction-docs-before-1011';assert not backup.exists();backup.mkdir();docchanges=[]
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 file=root/name;saved=backup/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,saved);before=sha(file);oldtext=file.read_text(encoding='utf8')
 if name=='README.md':
  first,rest=oldtext.split('\n',1);new=first+'\n\nP69 实用创作更新（2026-10-11，源码版）：母网增删点／连线／有序建面、嵌套母参数控件、编织源线及边界、六度折筒 CP／静态三维、具名阵列三维、多关联二维纸面已接实际采用和保存重开。3216 前端、296 成功操作断言、85 个实际按钮文件验收通过；见[入口、范围与验收](docs/P69-实用母网与阵列空间预览-20261011.md)。免安装 v0.13.6 未更新，整个目标继续；原关联空间链及连续运动等未验证。\n'+rest
 else:
  new='''# Origamica 当前剩余范围（2026-10-11，实际创作范围）

P66已交付v0.13.6；P67、P68及P69后续实用构造为源码更新，尚未重新打包。P69实际296个成功断言、85件按钮文件与独立文件回读已通过，具体入口见 [P69说明](P69-实用母网与阵列空间预览-20261011.md)。整个目标继续。

| 当前方向 | 已完成与剩余边界 |
| --- | --- |
| 拼块、母网与嵌套母参数 | P67／P69已补轮廓增删、组合导航、有序母网建面、原位母参数控件。断连源仍被后端拒绝；不把源可编辑算 CP 可采用。 |
| 编织线组与源边界 | P69拖线、旋转、精确数字、0／1／2点旋转弦边界、实际层序通过后采用与保存完成。容量与极端参数按原门禁，未认证任意图。 |
| 原具名阵列 | P68／P69完成Miura/Mars/Huffman、Yoshimura/Miura两重载／双向螺旋、六度折筒的CP创作、源绑定及核验静态3D；水雷阵列解析形态已完成。连续运动、碰撞、平折层序不可据静态等距声称。 |
| N点曲折与螺旋纸域 | 已完成有限实际CP、源图可视编辑与保存重建。区别于任意平面对数螺旋密铺，不声明存在原版专用密铺工具。 |
| 多关联曲折后续带 | P69已有2–4带可创作二维材料、毫米裁域与来源读回；本地数值解释明确。原三维保存链等距矛盾仍未解决，不声明复现。 |
| 入口与最终交付 | 继续审查“构造”菜单中的只读参考、实际采用入口与具名原工具差异，并核用户创作流程／容量。没有可靠完整缺口数量或工期；完成全部实用项后优先本地资源打包。 |

只纳入用户可以直接操作并创作新镶嵌的实际功能。纯理论、内部辅助／别名、完整Mathematica符号系统及无实际操作的研究全域暂不复现。44个菜单或314条定义均不能当剩余数量。本表是已核实方向，不是100%复现结论；旧文档、失败证据及既有包保留。

刻字软件实际导入与实机试压未验证，不承诺实机提速。P69普通／优化DXF核心保持。详细文件和测试见 `output/practical-construction-report-1011.json`。
'''
 file.write_text(new,encoding='utf8',newline='\n');docchanges.append({'file':name,'before':before,'backup':saved.relative_to(root).as_posix(),'after':sha(file)})
summary={'verified':True,'practicalBatchComplete':True,'completeOrigamicaGoal':False,'executionContinuesPerUser':True,'goalStatus':'active','date':'2026-10-11','packed':False,'published':False,'machineVerified':False,'sourceChanges':changes,'integrationRows':57,'integrationRecords':14,'docChanges':docchanges,'tests':check['tests'],'backendRerun':False,'wholeProjectStages':8,'finalBuildAndTypecheckPassed':True,'finalBundle':read(root/'output/practical-construction-final-bundle-1011.json')['bundle'],'actualBrowserStages':browsers,'actualMainChecks':296,'actualUserButtonFiles':85,'independentActualFileChecks':sum(r['checks'] for r in readers),'independentActualFileReports':readers,'independentSupplementaryJSONChecks':16,'ordinaryDXFLines':sum(r['ordinaryLines'] for r in readers),'actualSavePOSTs':sum(r['savePOSTs'] for r in readers),'actualSavedProjectUUIDs':sum(r['projectDisks'] for r in readers),'frozenIndexes':[{'file':name,'sha256':digest} for name,digest in frozen],'runtimeCleanup':'output/practical-tools-runtime-cleanup-1011.json','previousP68ArchiveVerifiedSnapshots':2273,'previousReleaseHashesPreserved':releases,'unverified':['原关联三维保存链仍有等距矛盾','Mathematica默认数值插值等价','参数全域、连续运动、自碰撞、厚度与实机','最终构造入口与完整实用范围仍需审查'],'documentation':doc.relative_to(root).as_posix(),'priorFailuresPreserved':True}
reportpath.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
for file in [reportpath,doc,root/'README.md',root/'docs/Origamica当前剩余范围-20261009.md',root/'output/practical-tools-runtime-cleanup-1011.json',root/'output/practical-construction-checks-002-1011.json',root/'output/practical-layout-final-checks-1011.json',root/'output/practical-construction-final-bundle-1011.json',root/'scripts/finish-practical-construction-1011.py',*recordfiles]:bind(file)
for name in changes:bind(root/name)
for name in ['output/practical-construction-bundle-1011.json','output/practical-construction-bundle-002-1011.json','output/practical-construction-final-bundle-1011.json']:
 file=root/name;bind(file)
 for row in read(file)['files']:bind(root/row['copy'],row['sha256'])
archive=root/'output/audits/practical-construction-artifacts-1011';index=root/'output/audits/practical-construction-final-1011.json';assert not archive.exists() and not index.exists();archive.mkdir();snapshots=[]
for file,digest in sorted(bound.items(),key=lambda x:str(x[0])):
 assert sha(file)==digest,str(file);relative=file.relative_to(root);copy=archive/relative;copy.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,copy);assert sha(copy)==digest;snapshots.append({'file':relative.as_posix(),'sha256':digest,'bytes':copy.stat().st_size})
index.write_text(json.dumps({'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':snapshots,'previousP68':{'file':oldarchive.relative_to(root).as_posix(),'sha256':sha(oldarchive),'snapshots':2273},'goalComplete':False,'actualFiles':85,'actualChecks':296,'independentActualChecks':summary['independentActualFileChecks'],'backendGuardedReuse':True,'packed':False,'published':False},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'filesChanged':38,'mainChecks':296,'actualFiles':85,'independentChecks':summary['independentActualFileChecks'],'ordinaryDXFLines':summary['ordinaryDXFLines'],'snapshots':len(snapshots),'completeGoal':False,'packed':False},ensure_ascii=False))
