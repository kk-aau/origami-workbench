"""Close P67 from explicit source, actual-file and check records; no new packaging."""
from pathlib import Path
import hashlib,importlib.util,json,shutil

root=Path.cwd().resolve()
common=root/'output/parallel/original-uniform-helix-extended-finalizer-prepared-1011/finalizer-common.py'
spec=importlib.util.spec_from_file_location('p67_evidence',common)
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
read=lambda name:c.read(root/name)
write=lambda name,value:(root/name).open('x',encoding='utf-8').write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
E=c.Evidence(root)
checks=read('output/practical-editors-checks-1011.json')
assert checks['exitCode']==0 and len(checks['stages'])==8 and all(x['exitCode']==0 for x in checks['stages'])
assert checks['inputsUnchanged'] and checks['backendInputsUnchanged']
bundle=read('output/practical-editors-bundle-1011.json');c.verified(bundle,'bundle')
assert bundle['bundle']=='/assets/main-CAFhAYq_.js' and bundle['tests']==checks['tests']
for row in bundle['files']:E.add(row['file'],row['sha256'])
excluded_runtime_inputs=[]
for row in checks['inputs']:
    if any(part in ['node_modules','.git','.venv','__pycache__'] for part in Path(row['file']).parts):
        assert c.sha(root/row['file'])==row['sha256'],row['file']
        excluded_runtime_inputs.append(row)
    else:E.add(row['file'],row['sha256'])
preservation=read('output/practical-editors-preservation-1011.json');c.verified(preservation,'source preservation')
assert preservation['mappedFiles']==6 and preservation['noUnmappedProductionChanges']
runtime=read('output/practical-editors-runtime-stopped-1011.json');c.verified(runtime,'runtime closed')
assert runtime['ownBrowsersAbsent'] and runtime['ownListenerAbsent'] and runtime['userServiceUntouched']
nmain='output/playwright/private-discrete-npoints-main-1011/downloads-001/browser-checks.json'
nreader='output/parallel/private-discrete-npoints-main-independent-review-1011/actual-files-audit-001.json'
tmain='output/playwright/private-custom-tile-main-1011/downloads-002/browser-checks.json'
treader='output/parallel/private-custom-tile-fold-reader-delta-1011/actual-files-audit-001.json'
actual=[]
for main_name,reader_name,count,files,label in [(nmain,nreader,36,13,'discrete source'),(tmain,treader,49,11,'custom tile')]:
    main=read(main_name);reader=read(reader_name);c.verified(main,label+' main');c.verified(reader,label+' files')
    assert main['checks']==count and reader['actualUserFiles']==len(main['downloads'])==files
    assert main['bundle']==reader['bundle']==bundle['bundle']
    for value in [main,reader]:
        for key in ['downloads','files','observations','receipts','apiCaptures']:
            rows=value.get(key,[])
            if not isinstance(rows,list):continue
            for row in rows:
                if row.get('path'):E.add(row['path'],row.get('sha256'))
    E.add(main_name);E.add(reader_name)
    actual.append({'feature':label,'mainReport':main_name,'readerReport':reader_name,'mainChecks':count,
                   'readbackChecks':reader['checks'],'actualUserFiles':files,'lastSaved':main['lastSaved']})
indexes=[
 'output/parallel/private-discrete-npoints-editor-1011/delivery/freeze.json',
 'output/parallel/private-discrete-npoints-editor-1011/freeze.json',
 'output/parallel/private-discrete-npoints-editor-1011/evidence/peer-input-contract/freeze.json',
 'output/parallel/private-discrete-npoints-editor-1011/evidence/peer-implementation-review/freeze.json',
 'output/parallel/private-custom-tile-editing-1011/freeze.json',
 'output/parallel/private-custom-tile-editing-1011/evidence/peer-custom-tile-contract/freeze.json',
 'output/parallel/private-discrete-npoints-main-acceptance-prepared-1011/freeze.json',
 'output/parallel/private-custom-tile-main-acceptance-prepared-1011/freeze.json',
 'output/parallel/private-custom-tile-main-option-delta-1011/freeze.json',
 'output/parallel/private-discrete-npoints-main-actual-freeze-1011/freeze.json',
 'output/parallel/private-custom-tile-fold-reader-delta-1011/freeze.json',
 'output/parallel/original-practical-notebook-construction-scope-review-1011/freeze.json',
]
index_records=[E.index(p) for p in indexes]
for name in indexes[-3:-1]:
    data=read(name)
    for key in ['externalReferences','externalInputs']:
        for row in data.get(key,[]):E.add(row['path'],row['sha256'])
release_name='release/验收-v0.13.6-20261011.json'
release=read(release_name);c.verified(release,'portable release')
for row in release['artifacts']:assert c.sha(root/row['file'])==row['sha256'],row['file']
backup=read('output/practical-editors-docs-before-1011/index.json')
for row in backup['files']:
    assert row['sha256']==c.sha(root/row['backup']),row['file']
    E.add(row['backup'],row['sha256'])
acceptance='docs/P67-拼块与曲折源图编辑验收-20261011.md'
acceptance_text='''# P67 拼块与曲折源图编辑验收

本地源码的拼块可视轮廓编辑、组合图导航及离散曲折源图编辑已验收。它们晚于 v0.13.6 包，不包含在该包中。入口与操作见[编辑说明](P67-拼块与曲折源图编辑说明-20261011.md)。整个实用镶嵌复现目标尚未完成。

| 验收 | 实际结果 |
| --- | --- |
| 项目检查 | 8 个阶段成功；3106 前端、7 桌面、66 服务／worker 检查及构建通过。后端 1337 项沿用 P66，在受保护输入逐 SHA 相同下复用；未声称重新执行。24 个平面脚本及 3 个既有层序阶段重新执行。 |
| 曲折主程序 | 36 项实际操作，13 个真实按钮导出，独立回读 1322 项。原六点及改后点列实际采用、保存、按 UUID 重开和来源再建通过；非单位母线幅度保留，零母线拒绝。 |
| 拼块主程序 | 49 项实际操作，11 个真实按钮导出，独立回读 377 项。原四块组合中新增五边轮廓，真实生成母图及新扭转 CP，保存重开、格矢和其它拼块保持。凹轮廓的扭转选项仍禁用。 |
| 导出坐标 | 普通 DXF 逐 LINE 与源文档端点、赋型、长度尺度严格一致，仅作现有的一次 Y 翻转。源图采用仍沿既有包围框平移与 200/span 转换。 |
| 取消与浏览 | 草稿取消、缩放、平移、网格及适合视图不写入原工程；实际取消阶段没有源生成请求或工程写入。 |
| 已有工作 | 6 个明确生产文件改变；其余 1869 份 src/backend/tests 输入未改。P66 的 7548 份固定快照逐 SHA 核对；旧包保留。 |
| 清理 | 本次 8880 服务及专用浏览器已关闭；用户 8787 服务保持。 |

两次验收失败按实际原因保留：首次拼块脚本使用 Playwright 的 OPTION.isDisabled，会沿外层标签检查 SELECT；改为只读原生 OPTION.disabled，产品条件未改。最初文件回读要求 FOLD 计算副本逐位相等而失败；25 条边中 5 条引用的两个共享顶点，Y 坐标仅相差 1 个 binary64 ULP，最大 3.552713678800501e−15 mm。新回读只对普通 FOLD 及其重开允许每坐标至多 1 ULP，要求同赋型、唯一边双射；两 ULP、错赋型、多边、歧义及 NaN 均拒绝。JSON、库重开、源 API、纸幅及 DXF 仍严格相等，FOLD 自身的面／边覆盖和交叉检查使用精确 Fraction。没有改动实际文件、原 reader 或生产算法。

实际按钮文件共 24 个；API 观察、保存回执和截图不计入导出数量。新曲折采用明确为 CP-only；新拼块已验证有限几何及局部必要条件，不由此声称全局层序、刚性运动或碰撞已证明。

未验证：本批编辑在免安装包中的实际运行（尚未打包）、新图案优化导出的单独按钮操作、真实刻字软件导入、机器试压及任何实机提速。没有发布或设备操作。

最终证据记录在 `output/practical-editors-report-1011.json`，失败记录和固定原文件均保留。
'''
if (root/acceptance).exists():assert (root/acceptance).read_text(encoding='utf-8')==acceptance_text
(root/acceptance).write_text(acceptance_text,encoding='utf-8')
readme=root/'README.md';text=readme.read_text(encoding='utf-8')
addition='\nP67 实用编辑更新（2026-10-11，源码版）：拼块轮廓可增删点，组合图可缩放／平移并显示刻度；离散曲折原点／母线源图支持拖动、精确输入及保现源插删点。实际 85 项、24 个按钮文件回读及保存重开通过。见[操作入口](docs/P67-拼块与曲折源图编辑说明-20261011.md)与[验收](docs/P67-拼块与曲折源图编辑验收-20261011.md)。v0.13.6 免安装包已交付，保留原包；本批源码更新尚未包含在其中。实用阵列构造继续实现。\n'
if addition in text:text=text.replace(addition,'',1)
assert text==(root/next(r['backup'] for r in backup['files'] if r['file']=='README.md')).read_text(encoding='utf-8')
text=text.replace('# 折纸工坊 · 本机工作台\n','# 折纸工坊 · 本机工作台\n'+addition,1)
readme.write_text(text,encoding='utf-8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md'
remaining_text='''# Origamica 当前剩余范围（2026-10-11，实际创作范围）

P66 均匀螺旋扩展已完成，并交付 v0.13.6 免安装版；包产物和 SHA 见 `release/验收-v0.13.6-20261011.json`。后续 P67 拼块轮廓／组合导航及 N 点源图可视编辑已完成源码验收，尚未重新打包。整个实用复现目标没有完成。

| 当前工作 | 状态与下一验收边界 |
| --- | --- |
| 拼块轮廓及组合浏览 | P67 已完成：3–24 点增删、坐标刻度、缩放／平移、预览取消、真实母结构及 CP 采用／保存／重开／普通导出。 |
| N 点曲折源图 | P67 已完成：原点与两侧非单位母线编辑、保原点列插删、原幅度及边赋型规则、CP-only 实际采用和来源重建。 |
| Miura／Mars、Huffman 波纹阵列 | 原 Notebook 有实际参数与 CP 构造；现有通用刚性四边网格不等于具名原式。正在制作按原式可调行列、长度、种子的创作入口及源绑定。 |
| Yoshimura／Miura 混合及双向螺旋 | 原 MakeYoshimuraMiuraOri 和 In[2539/2540] 有有限实际 CP／3D 例；正在制作原参数构造候选。区别于已完成的空间螺旋纸带，也不冒称任意平面对数螺旋密铺。 |
| Yoshimura 六度折筒 | 原 MakeTYoshimuraGrid 的六度种子构造另有实际例；仍需其具名创作流程，不用混合四度构造代替。 |
| 水雷阵列 | 原 MakeWaterbombTessellation(nx,ny,t) 为阵列，现有单水雷基础形不等于该功能。正在制作原 3×3 及可调阵列 CP／解析形态候选。 |
| 显式母网拓扑编辑 | 单拼块有序轮廓已完成；任意母网的顶点／面索引编辑仍需独立可视流程。不能随意增点破坏面拓扑。 |
| 直线／旋转弦线组草稿及边界 | 有数字线组、有限母图可视点边编辑；源直线草稿可视拖线及边界保源插删点继续。 |
| 嵌套母参数 | 可返回母结构使用已有控件；原位编辑仍为 JSON，后续简化，母改变使旧目标失效时需明确处理。 |
| 多关联曲折后续带 | 原 In[4086] 为实际设计延伸候选；首带已有采用，完整后续多带的有限材料与来源证书未完成。先核有限原例，不扩张无实际操作理论。 |
| 剩余入口、容量与交付 | 继续逐项核真实构造、参数、采用及保存／导出；极小图鼠标命中及大图性能按实测确认。未给出可靠完整缺口数量或工期。 |

只纳入可供用户简单操作并创作新镶嵌的实际功能。纯理论、内部辅助／别名、完整 Mathematica 符号系统及无操作的研究全域暂不复现；44 个参考菜单或 314 条定义均不能当剩余任务数。本表是已核实的工作方向，不是全部功能数量结论。旧剩余文档、失败证据和原包均保留在固定记录中。

详见 `docs/P67-拼块与曲折源图编辑验收-20261011.md` 以及 `output/parallel/original-practical-notebook-construction-scope-review-1011/实用构造源复核.md`；后一只读原盘点保留其审查时状态。设备实际导入与试压分别标记未验证，不承诺实机提速。
'''
assert c.sha(remaining)==next(r['sha256'] for r in backup['files'] if r['file']==remaining.relative_to(root).as_posix()) or remaining.read_text(encoding='utf-8')==remaining_text
remaining.write_text(remaining_text,encoding='utf-8')
doc_changes=[]
for row in backup['files']:doc_changes.append({'file':row['file'],'before':row['sha256'],'after':c.sha(root/row['file']),'backup':row['backup']})
for p in [acceptance,'docs/P67-拼块与曲折源图编辑说明-20261011.md','README.md','docs/Origamica当前剩余范围-20261009.md']:E.add(p)
fixed=[
 'output/practical-editors-checks-1011.json','output/practical-editors-checks-1011.log',
 'output/practical-editors-bundle-1011.json','output/practical-editors-preservation-1011.json',
 'output/practical-editors-runtime-stopped-1011.json','output/practical-editors-server-pid-1011.json',
 'output/practical-editors-server-1011.stdout.log','output/practical-editors-server-1011.stderr.log',
 'output/parallel/practical-editors-root-delivery-integrated-1010.json',
 'output/parallel/practical-editors-root-delivery-1011/manifest.json','output/parallel/practical-editors-root-delivery-1011/practical-editors.patch',
 'output/practical-editors-docs-before-1011/index.json','output/practical-editing-candidates-root-sha-1011.json',
 'output/practical-tile-main-prepared-root-sha-1011.json','output/practical-tile-option-delta-root-sha-1011.json',
 'output/practical-discrete-actual-freeze-root-sha-1011.json','output/practical-tile-fold-reader-root-sha-1011.json',
 'output/practical-tile-fold-diagnostic-1011.json','output/diagnose-practical-tile-fold-1011.py',
 'output/playwright/private-custom-tile-main-1011/downloads-001/browser-checks.json',
 'output/playwright/private-custom-tile-main-1011/downloads-001/failure.png',
 'output/playwright/private-custom-tile-main-1011/downloads-001/before-guard.json',
 'output/playwright/private-custom-tile-main-1011/downloads-002/before-guard.json',
 'output/playwright/private-custom-tile-main-1011/downloads-002/verify-main.browser.js',
 'output/playwright/private-custom-tile-main-1011/downloads-002/independent-files-002.json',
 'output/playwright/private-custom-tile-main-1011/downloads-002/edited-convex-source.png',
 'output/playwright/private-custom-tile-main-1011/downloads-002/final-edited-cp.png',
 'output/playwright/private-discrete-npoints-main-1011/downloads-001/verify-main.browser.js',
 'output/playwright/private-discrete-npoints-main-1011/downloads-001/zero-vector-rejected.png',
 'output/playwright/private-discrete-npoints-main-1011/downloads-001/edited-real-cp-ready.png',
 'output/practical-tile-playwright-config-002-1011.json','output/inspect-custom-tile-disabled-1011.js',
 'output/start-practical-editors-server-1011.mjs','scripts/stop-practical-editors-runtime-1011.ps1',
 'scripts/verify-practical-editors-preservation-1011.py','scripts/finalize-practical-editors-1011.py',
 'scripts/backup-practical-editors-docs-1011.py','scripts/prepare-practical-editors-integration-1011.py',
 'scripts/prepare-practical-editors-checks-1011.py','scripts/run-practical-editors-checks-1011.mjs',
 'scripts/capture-practical-editors-bundle-1011.py',release_name,'release/SHA256SUMS-0.13.6.txt',
 'output/original-practical-notebook-scope-root-sha-1011.json',common,
]
for p in fixed:E.add(p)
old_index='output/audits/original-uniform-helix-extended-final-1011.json';E.add(old_index,preservation['previousIndexSHA256'])
old=read(old_index)
for row in old['snapshots']:
    if row['file'].startswith(('src/','backend/','tests/')) or row['file'] in ['package.json','package-lock.json','desktop/使用说明.txt']:
        E.add(row['file'],preservation['mappedSourceHashes'].get(row['file'],row['sha256']))
for name,digest in preservation['mappedSourceHashes'].items():E.add(name,digest)
report={'verified':True,'passed':True,'date':'2026-10-11','practicalEditingBatchComplete':True,
        'completeOrigamicaGoal':False,'executionContinuesPerUser':True,'packed':False,'published':False,'machineVerified':False,
        'newEditorsIncludedInExistingPortable':False,'portableArtifactSHAStillExact':release['artifacts'],
        'sourceChanges':preservation['mappedSourceHashes'],'docChanges':doc_changes,'tests':checks['tests'],
        'backendRerun':False,'backendReuseInputSHAExact':True,'wholeProjectStages':8,'bundle':bundle['bundle'],
        'runtimeInputsSHARecheckedNotArchived':excluded_runtime_inputs,
        'actual':actual,'actualMainChecks':85,'actualUserButtonFiles':24,
        'FOLDMaximumCoordinateULPs':1,'FOLDUniqueBijectionRequired':True,'JSON_DXF_SourceAPIExact':True,
        'beforeFailuresRetained':['OPTION label retarget assertion','FOLD computation copy exact-bit assertion'],
        'preservation':preservation,'runtime':runtime,'frozenIndexes':index_records,
        'notVerified':['new editors in packaged portable','new shape optimized-export button flow','real cutter software import',
                       'machine impression','global layer proof for new custom tile','continuous rigid folding','collision'],
        'baseArchiveReference':{'file':old_index,'sha256':c.sha(root/old_index),'archive':old['archive'],
                                'allSnapshotsRechecked':7548,'copiedAgain':False,'existingArchiveRetained':True},
        'usesExplicitEvidenceRows':True,'files':E.rows()}
report_name='output/practical-editors-report-1011.json';write(report_name,report);E.add(report_name)
archive=root/'output/audits/practical-editors-artifacts-1011';index=root/'output/audits/practical-editors-final-1011.json'
assert not archive.exists() and not index.exists();archive.mkdir(parents=True)
snapshots=[]
for row in E.rows():
    source=c.safe_file(root/row['file'],root);assert c.sha(source)==row['sha256'],row['file']
    destination=archive/row['file'];destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
    assert c.sha(destination)==row['sha256'],row['file']
    snapshots.append({**row,'bytes':destination.stat().st_size})
write(index.relative_to(root),{'verified':True,'archive':archive.relative_to(root).as_posix(),'snapshots':snapshots,
                             'baseArchiveReference':report['baseArchiveReference'],'report':report_name,
                             'bundle':bundle['bundle'],'practicalEditingBatchComplete':True,
                             'completeOrigamicaGoal':False,'executionContinuesPerUser':True,
                             'usesOnlyExplicitRows':True,'recursiveWalkUsed':False,'ownRuntimeClosed':True,
                             'packed':False,'published':False,'machineVerified':False})
print(json.dumps({'verified':True,'snapshots':len(snapshots),'sourceChanges':6,'mainChecks':85,'actualFiles':24,
                  'packaged':False,'completeOrigamicaGoal':False}))
