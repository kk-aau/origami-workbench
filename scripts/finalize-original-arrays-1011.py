"""Record the practical CP batch from actual files; keep older archives and packages."""
from pathlib import Path
import importlib.util,json,hashlib,os,shutil
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda n:json.loads((root/n).read_text(encoding='utf-8-sig'))
common=root/'output/parallel/original-uniform-helix-extended-finalizer-prepared-1011/finalizer-common.py'
spec=importlib.util.spec_from_file_location('array_evidence',common);c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);E=c.Evidence(root)
previous_name='output/audits/practical-editors-final-1011.json';previous=read(previous_name)
assert previous['verified'] and len(previous['snapshots'])==3070
for row in previous['snapshots']:assert sha(root/previous['archive']/row['file'])==row['sha256'],row['file']
old={r['file']:r['sha256'] for r in previous['snapshots']}
integration_name='output/parallel/original-arrays-root-delivery-integrated-1010.json';integration=read(integration_name)
assert integration['verified'] and len(integration['files'])==18
mapped={}
for row in integration['files']:
 assert old.get(row['file'])==row['before'] and sha(root/row['file'])==row['after'],row['file']
 mapped[row['file']]=row['after'];E.add(row['file'],row['after'])
protected={n:v for n,v in old.items() if n.startswith(('src/','backend/','tests/')) and n not in mapped}
for name,digest in protected.items():E.add(name,digest)
census=set()
for folder in ['src','backend','tests']:
 for current,dirs,files in os.walk(root/folder,followlinks=False):
  dirs[:]=[n for n in dirs if n!='__pycache__' and not (Path(current)/n).is_symlink() and not (hasattr(Path(current)/n,'is_junction') and (Path(current)/n).is_junction())]
  census.update((Path(current)/n).relative_to(root).as_posix() for n in files)
assert census==set(protected)|set(mapped),sorted(census-set(protected)-set(mapped))
checks=read('output/original-arrays-checks-1011.json');assert checks['exitCode']==0 and len(checks['stages'])==8 and all(s['exitCode']==0 for s in checks['stages']) and checks['inputsUnchanged'] and checks['backendInputsUnchanged']
bundle=read('output/original-arrays-bundle-1011.json');assert bundle['verified'] and bundle['bundle']=='/assets/main-BFPpAiGy.js'
for row in bundle['files']:E.add(row['file'],row['sha256'])
actual_names=['output/playwright/original-arrays-main-1011/downloads-002/browser-checks.json','output/original-arrays-actual-files-002-1011.json','output/playwright/original-arrays-main-1011/downloads-002/library-reopen-checks-003.json','output/original-arrays-library-files-1011.json']
actual=[read(n) for n in actual_names]
for name,value in zip(actual_names,actual):c.verified(value,name);E.add(name)
assert actual[0]['checks']==69 and actual[1]['actualUserFiles']==29 and actual[1]['checks']==10061 and actual[2]['checks']==5 and actual[3]['checks']==8
for value in actual:
 for key in ['files','downloads']:
  for row in value.get(key,[]):E.add(row['path'],row.get('sha256'))
runtime=read('output/original-arrays-runtime-stopped-1011.json');c.verified(runtime,'runtime');assert runtime['ownBrowsersAbsent'] and runtime['ownListenerAbsent'] and runtime['userServiceUntouched']
release=read('release/验收-v0.13.6-20261011.json')
for row in release['artifacts']:assert sha(root/row['file'])==row['sha256'],row['file']
for name in ['package.json','package-lock.json','src/app/state.ts','desktop/使用说明.txt']:E.add(name,old[name])
indexes=[
 'output/parallel/private-miura-huffman-presets-1011/SOURCE-FROZEN.json',
 'output/parallel/private-miura-huffman-presets-1011/DELIVERY-FROZEN.json',
 'output/parallel/private-miura-huffman-presets-1011/SUPPORT-FROZEN.json',
 'output/original-yoshimura-miura-source-root-sha-1011.json',
 'output/original-yoshimura-miura-candidate-root-sha-1011.json',
 'output/parallel/original-waterbomb-tessellation-cp-2604-1011/DELIVERY-FROZEN.json',
 'output/parallel/original-waterbomb-tessellation-cp-2604-1011/SUPPORT-FROZEN.json',
 'output/parallel/private-waterbomb-peer-readonly-1011/freeze.json',
 'output/parallel/original-practical-array-entry-independent-review-1011/freeze.json',
]
frozen=[E.index(n) for n in indexes]
for name in indexes[3:5]:
 data=read(name);E.add(data['originalIndex'],data['originalIndexSHA256'])
 for row in data.get('externalReferences',[]):E.add(row['file'],row['sha256'])
folder=root/'output/original-arrays-docs-before-1011';assert not folder.exists();folder.mkdir();doc_before=[]
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 source=root/name;target=folder/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);digest=sha(source);assert sha(target)==digest
 doc_before.append({'file':name,'before':digest,'backup':target.relative_to(root).as_posix()});E.add(target,digest)
guide='docs/P68-原版参数阵列构造与验收-20261011.md';assert not (root/guide).exists()
(root/guide).write_text('''# P68 原版参数阵列构造与验收

本地源码新增三组真实参数构造，能采用 CP、保存、重开源参数及普通导出。这批与 P67 编辑更新均晚于 v0.13.6 包，尚未重新打包；完整实用复现目标没有完成。

| 镶嵌设计入口 | 操作与原版对应 |
| --- | --- |
| 波纹阵列 | 选择 Miura-ori、Mars 或 Huffman，调整行列、毫米边长、种子扇区角及小折角。按 MakeTMiuraMarsOri / MakeTHuffmanGrid 原直接点式、正长度解和赋型构造；保真实纸边与负坐标，不用通用刚性网格或 LP 代替。 |
| 双向螺旋／混合 | 选择逐列倾角或同角分段，点击图中列精调倾角，改行数、Γ和毫米单位；预设有原22列双向螺旋。两重载的原行高／列宽不同，分别保留。每格原对角线及水平线，没有擅加内部竖缝；Γ保存为原真实目标角，不全改±180°。 |
| 水雷阵列 | 调 nx、ny、t 与单元毫米边长，水雷／blintz交替形成真实矩形 CP。可切换原解析三维预览并旋转／缩放；t改变解析形态，二维 CP 不因t改变。毫米单元只统一乘一次，显示旋转不写回几何。 |

采用后在折痕编辑点击“修改原阵列构造参数”。同模型／同重载调参保存沿原 UUID；明确换 Miura/Mars/Huffman 或 Yoshimura 的两重载会建立新工程。手改折痕后仍可读取原配方并明确重新构造；新结果采用继续严格校验实际几何、赋型、目标角及来源，不会把原配方读取等同未改过的几何证明。

窗口保留上次有效预览，更新／错误状态标明旧图且禁用采用；取消不修改工程。Huffman 非正解、奇异角、非法字段或容量超限明确拒绝，不静默取默认、吸附、移动端点或补跨空白压痕。

| 实际验收 | 结果 |
| --- | --- |
| 整项目 | 8阶段成功，3145前端（本批新增39）、7桌面、66服务／worker和1072模块构建；24平面脚本及3既有层序阶段重新执行。后端1337项在全输入SHA一致下复用P67结果，未重新运行。 |
| 独立入口与原源 | 最终18文件绑定；79公开入口检查、9静态接线与8seed/parity源项通过。旧Yosh手改丢失配方的2项失败保留，reader窄修后闭环；采用guard没有放宽。 |
| 真实主App | 69主操作＋5工程库操作，30实际按钮文件；9真实POST、6独立保存项目，同源和跨模型／重载UUID规则通过。JSON/FOLD文件与实际库GET均可恢复源参数。 |
| 实际文件回读 | 10061主文件＋8库文件检查通过。6普通DXF全为原R12 LINE，每原边一次，毫米端点与原文档严格一致，仅既有一次Y翻转。源参数、材料图、纸幅、位置和保存版本核对。 |
| 实际交互／布局 | 水雷真实快速拖t时图未清空、图框高度保持；1420×960、1920×1080、1366×768共10状态无窗口滚动／底栏遮盖，SVG刻度均≥12px。不是任意机器FPS承诺。 |
| 原工作保护 | 18明确生产文件：2修改、16新增；其它src/backend/tests逐SHA不变，P67的3070固定快照重新核对。旧包及源ZIP逐SHA不变，本次8881与专用浏览器已关闭，用户8787服务保留。 |

修改文件：`src/App.tsx`、`src/components/TessellationPanel.tsx`、`src/app/originalArraySource.ts`；三组各自的 `miuraHuffmanCP`、`yoshimuraMiuraCP2534`、`waterbombTessellation2604` helper、Dialog、CSS、测试及fixture。完整18文件SHA与实际证据见 `output/original-arrays-report-1011.json`。

未验证／未实现：本批免安装包运行（未打包）、真实刻字软件和机器试压；本批新图案优化导出未逐个实际按钮测试。Miura/Huffman及Yoshimura/Miura的原FoldGraph3D空间构造尚未复现，不能说全功能完成；水雷仅解析静态面等距预览。平折层序、连续刚性运动、碰撞未认证，未制造对应证书。Wolfram未执行，只按提供Notebook字面源核对。

保留全部失败：CLI宿主缺少URL类的首轮脚本失败；首reader误把FOLD来源扩展的导入Doc覆盖JSON保存基准而失败，改为保存JSON基准、仍严格比较几何／源／POST。两者均属验收脚本，原产品和实际文件没有为其改动。作者staging、patch EOL及依赖失败也固定保留，未把staging callback文件当主App用户导出。
''',encoding='utf-8')
readme=root/'README.md';text=readme.read_text(encoding='utf-8');text=text.replace('# 折纸工坊 · 本机工作台\n','# 折纸工坊 · 本机工作台\n\nP68 原版参数阵列（2026-10-11，源码版）：Miura/Mars/Huffman波纹格、Yoshimura/Miura混合及双向螺旋、水雷阵列已有直接参数入口，支持CP采用、保存与源重开。3145前端、74真实操作及30按钮文件回读通过；见[入口与验收](docs/P68-原版参数阵列构造与验收-20261011.md)。P67编辑和P68阵列未包含在已交付的v0.13.6包中，旧包保持。CP分支完成不等于原空间折叠或整个目标完成。\n',1);readme.write_text(text,encoding='utf-8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md';text=remaining.read_text(encoding='utf-8')
text=text.replace('整个实用复现目标没有完成。','P68新增三组阵列的有限CP与真实保存／导出流程也已验收；原Miura/Huffman及Yoshimura/Miura空间FoldGraph3D尚缺。整个实用复现目标没有完成。',1)
text=text.replace('正在制作按原式可调行列、长度、种子的创作入口及源绑定。','P68已完成原式可调行列、长度、种子的有限CP创作、采用和源绑定；原FoldGraph3D静态构形仍缺。')
text=text.replace('正在制作原参数构造候选。','P68已完成两原重载、双向22列保存参数的实际CP创作和源绑定；原FoldGraph3D空间构形仍缺。')
text=text.replace('正在制作原 3×3 及可调阵列 CP／解析形态候选。','P68已完成原阵列CP及可调nx/ny/t/mm解析形态、静态三角面等距、真实采用保存重开。连续运动、碰撞和层序未认证。')
remaining.write_text(text,encoding='utf-8')
doc_changes=[{**row,'after':sha(root/row['file'])} for row in doc_before]
for name in [guide,'README.md','docs/Origamica当前剩余范围-20261009.md']:E.add(name)
fixed=[
 previous_name,integration_name,'output/original-arrays-checks-1011.json','output/original-arrays-checks-1011.log','output/original-arrays-bundle-1011.json',
 'output/original-arrays-runtime-stopped-1011.json','output/original-arrays-server-pid-1011.json','output/original-arrays-server-1011.stdout.log','output/original-arrays-server-1011.stderr.log',
 'output/original-arrays-actual-files-1011.json','output/original-arrays-post-diagnostic-1011.json','output/original-arrays-post-presence-diagnostic-1011.json','output/original-arrays-post-identity-diagnostic-1011.json','output/original-arrays-post-inspection-diagnostic-1011.json','output/diagnose-original-array-post-1011.ts',
 'output/original-arrays-main-1011/verify-main.template.js','output/original-arrays-main-1011/verify-main.template-002.js','output/original-arrays-main-1011/verify-library-003.browser.js','output/original-arrays-main-1011/playwright-config-001.json','output/original-arrays-main-1011/playwright-config-002.json',
 'output/playwright/original-arrays-main-1011/downloads-001/browser-checks.json','output/playwright/original-arrays-main-1011/downloads-001/failure.png','output/playwright/original-arrays-main-1011/downloads-001/before-guard.json','output/playwright/original-arrays-main-1011/downloads-001/verify-main.browser.js',
 'output/playwright/original-arrays-main-1011/downloads-002/before-guard.json','output/playwright/original-arrays-main-1011/downloads-002/verify-main.browser.js','output/playwright/original-arrays-main-1011/downloads-002/verify-library-003.browser.js','output/playwright/original-arrays-main-1011/downloads-002/water-edited-library-get.json',
 'output/playwright/original-arrays-main-1011/downloads-002/wave-draft.png','output/playwright/original-arrays-main-1011/downloads-002/double-spiral-draft.png','output/playwright/original-arrays-main-1011/downloads-002/water-spatial-draft.png',
 'output/parallel/original-arrays-root-delivery-002-1011/manifest.json','output/parallel/original-arrays-root-delivery-002-1011/original-arrays.patch','output/parallel/practical-array-entry-root-1011/manifest.json','output/parallel/practical-array-entry-root-1011/original-array-entry.patch',
 'output/original-miura-huffman-delivery-root-sha-1011.json','output/original-waterbomb-delivery-root-sha-1011.json','output/original-array-peer-root-sha-1011.json','output/original-miura-support-root-sha-1011.json','output/original-waterbomb-support-root-sha-1011.json',
 'scripts/finalize-original-arrays-1011.py','scripts/prepare-original-array-entry-1011.py','scripts/prepare-original-arrays-integration-1011.py','scripts/prepare-original-array-checks-1011.py','scripts/run-original-arrays-checks-1011.mjs','scripts/capture-original-arrays-bundle-1011.py',
 'scripts/prepare-original-arrays-main-1011.py','scripts/prepare-original-arrays-main-002-1011.py','scripts/audit-original-arrays-actual-files-1011.ts','scripts/audit-original-arrays-actual-files-002-1011.ts','scripts/audit-original-arrays-library-1011.ts','scripts/stop-original-arrays-runtime-1011.ps1','output/start-original-arrays-server-1011.mjs','release/验收-v0.13.6-20261011.json','release/SHA256SUMS-0.13.6.txt',
]
for name in fixed:E.add(name)
for row in actual[0]['receipts']:E.add('output/playwright/original-arrays-main-1011/downloads-002/'+row['kind']+'-save-receipt.json')
report={'verified':True,'passed':True,'practicalCPBatchComplete':True,'completeOrigamicaGoal':False,'executionContinuesPerUser':True,'date':'2026-10-11','packed':False,'published':False,'machineVerified':False,
 'sourceChanges':mapped,'docChanges':doc_changes,'tests':checks['tests'],'backendRerun':False,'wholeProjectStages':8,'bundle':bundle['bundle'],
 'actualMainChecks':74,'actualUserButtonFiles':30,'actualOrdinaryDXFFiles':6,'independentActualFileChecks':10069,'actualSavePOSTs':9,'actualSavedProjectUUIDs':6,'mainLayoutStates':len(actual[0]['layouts']),
 'independentEntryChecks':79,'frozenIndexes':frozen,'runtime':runtime,'unchangedProductionFiles':len(protected),'noUnmappedProductionChanges':True,
 'oldReleaseArtifactHashesUnchanged':release['artifacts'],'newFeaturesInExistingPortable':False,
 'notVerified':['new portable package','new-array optimized-export UI flows','actual cutter software import','machine impression','global layer order','continuous motion/collision'],
 'notReproducedPracticalSource3D':['MakeTHuffmanGrid FoldGraph3D','MakeTMiuraMarsOri FoldGraph3D','MakeYoshimuraMiuraOri FoldGraph3D'],
 'previousArchiveReference':{'file':previous_name,'sha256':sha(root/previous_name),'archive':previous['archive'],'allSnapshotsRechecked':3070,'retained':True,'copiedAgain':False},
 'beforeFailuresRetained':True,'usesExplicitRows':True,'files':E.rows()}
report_name='output/original-arrays-report-1011.json'
with (root/report_name).open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
E.add(report_name);archive=root/'output/audits/original-arrays-artifacts-1011';index=root/'output/audits/original-arrays-final-1011.json';assert not archive.exists() and not index.exists();archive.mkdir(parents=True)
snapshots=[]
for row in E.rows():
 source=root/row['file'];assert sha(source)==row['sha256'],row['file'];out=archive/row['file'];out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,out);assert sha(out)==row['sha256'];snapshots.append({**row,'bytes':out.stat().st_size})
with index.open('x',encoding='utf-8') as f:json.dump({'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':snapshots,'report':report_name,'previousArchiveReference':report['previousArchiveReference'],'practicalCPBatchComplete':True,'completeOrigamicaGoal':False,'executionContinuesPerUser':True,'actualMainChecks':74,'actualUserButtonFiles':30,'bundle':bundle['bundle'],'ownRuntimeClosed':True,'usesOnlyExplicitRows':True,'packed':False,'published':False,'machineVerified':False},f,ensure_ascii=False,indent=2)
print(json.dumps({'verified':True,'sourceChanges':18,'protected':len(protected),'snapshots':len(snapshots),'mainChecks':74,'actualFiles':30,'goalComplete':False}))
