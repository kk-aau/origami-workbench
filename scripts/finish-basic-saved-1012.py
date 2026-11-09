from pathlib import Path
import hashlib, json, shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
checkp=root/'output/basic-saved-checks-002-1012.json'
checks=read(checkp)
assert checks['exitCode']==0 and checks['inputsUnchanged'] and checks['tests']['frontend']==3537
sourcep=root/'output/parallel/basic-saved-main-root-001-1012/ROOT-SOURCE-FROZEN.json'
assert sha(sourcep)=='a6f3fedcfbeed403d08c4c635c3bb9f9ed9a5bca66749dd4757925ce1c32d60c'
source=read(sourcep)
snapshots={r['path']:root/r['snapshot'] for r in source['files']}
for r in source['files']:assert sha(root/r['snapshot'])==r['sha256']
for r in source['compiledBundleCopies']:assert sha(root/r['copy'])==r['sha256']
actualp=root/'output/playwright/basic-saved-main-1012/downloads-002/browser-checks.json'
actual=read(actualp)
assert actual['verified'] and actual['checks']==274 and len(actual['downloads'])==56 and len(actual['receipts'])==18 and not actual['errors']
peer=root/'output/parallel/basic-saved-actual-reader-1012'
run=peer/'runs/actual002-1012'
result=read(run/'actual-readback.json')
assert result['verified'] and result['geometryAuditVerified'] and result['nodeSourceGuardFiles']==45 and result['actualBrowserExportFiles']==56 and not result['errors']
accept=run/'actual-acceptance-freeze.json'
assert sha(accept)=='bc9693b49809cf0ef6f8a78ea5254d74a4264e6a1aa6680a5c6361a6c701209b'
acceptance=read(accept)
for r in acceptance['files']:assert sha(r['path'])==r['sha256'],r['path']
prepared=read(peer/'preparation-freeze.json')
assert sha(peer/'preparation-freeze.json')=='0e4f3d57ade66a1623a13da6080956b705019e00b64b61f975617931a65ab6a6'
for r in prepared['files']:assert sha(peer/r['path'])==r['sha256'],r['path']
records=['basic-saved-new-root-1012','basic-saved-wiring-root-1012','basic-saved-layout-root-1012','basic-saved-tight-layout-root-1012']
changed={}
for name in records:
    data=read(root/f'output/parallel/{name}-integrated-1010.json')
    assert data['verified']
    for r in data['files']:changed[r['file']]=r['after']
assert len(changed)==15
work=root/'output/parallel/basic-saved-check-snapshot-002-1012/work'
for name,digest in changed.items():assert sha(snapshots.get(name,work/name))==digest,name
backup=root/'output/basic-saved-docs-before-1012'
assert not backup.exists()
backup.mkdir()
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
    dest=backup/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/name,dest)
doc=root/'docs/P76-单纸基础模型与展开纸形创作-20261012.md'
assert not doc.exists()
doc.write_text('''# P76 单纸基础模型与展开纸形创作

在“镶嵌设计 → 空间构造类型”选择“五种原单纸基础模型 CP”或“原圆锥／柱面 · 展开纸形”。采用后在折痕编辑点“修改单纸基础模型参数”或“修改原展开纸形参数”，可继续改造，同构造模型重建保留名称和 UUID。

| 模型 | 可实际创作 |
| --- | --- |
| 六角顶点 | 仰角 θ、原赋型或明确选择按目标形态重算；保原 CP 几何与 raw/local 边对照 |
| 单位立方盒 | 主折角 γ；原固定单位盒，不虚构缩放尺寸参数 |
| 带襟片立方盒 | 主折角、襟片两角与宽度；数值、滑条及紫色来源拖点 |
| 单位四面体 | 主折角与对应认证静态构形 |
| Oriceps 钳形 | 主折角、六个真实尺寸，紫色轴向拖点与毫米来源图 |
| 原圆锥展开 | 完整原参数域、完整尖或截顶纸形、分段和显式源单位 |
| 原圆柱展开／卷平面 | 原二维纸形边界、参数范围、分段和单位；原三维曲面参考 |

基础模型使用原纸图及面身份。默认六角原赋型与目标姿态存在有向角差异，保持原值并显示诊断；显式重算后才按目标有向角赋型，全部面内距离与角度通过才提供认证静态 Scene。带襟片盒仅对原唯一相邻面的异常边显式保留原值并采用 B/0，不泛化修改其它边。原自动树可能有多条同长路线，本地合法树与严格静态检查保留，不宣称已执行 Mathematica 得到逐字节相同姿态。

三种展开纸形用于生成纸张轮廓，均为一纸面、全部 B/0，没有额外折痕或拼接缝。原圆锥尖沿原身份合并；截顶保留原内外弧与切口。原三维图为参考，不把曲面姿态作为单平面的刚性 Scene。源到毫米只缩放一次，初始位置、索引、纸张边界和原参数完整保存。

| 验收 | 结果 |
| --- | --- |
| 完整固定源码 | 3537 前端测试通过、TypeScript 通过、Vite 1140 模块构建通过；两 CSS 紧凑修正后其余输入完全相同，复用前端结果并重建 |
| 后端／服务／桌面 | 1337／66／7 项此前通过，406 个相关源码与测试输入 SHA 相同才复用 |
| 真实主 App | 274 操作检查；实际拖点、滑条、快速最新参数、非法输入、取消、采用、改参、重开、视角、缩放和平移通过 |
| 实际文件 | 54 份模型普通 JSON/FOLD/DXF 与两份取消前后工程，共 56 下载；308 条原边、毫米尺度、原位置、一次 Y 转换与每边一次覆盖通过 |
| 保存与来源 | 18 POST、9 UUID；45 Chrome／磁盘来源 guard，材料仍有效的微移、配方与 trace 篡改均拒绝 |
| 小窗口 | 1024×640 两图左右、毫米刻度至少 12px、全部侧栏控件和可见说明不覆盖采用栏；1366 与 1920 操作通过 |
| 固定版本 | 832 源码快照、不可变构建文件与实际 HTTP main bundle 一致；共享折序绘图工作保留 |

首轮测试脚本错误假设默认是六角模型，实际产品默认单位立方盒，因此等待不存在的六角滑条；保留失败，第二轮明确选择六角后全部通过，未迁就测试改变产品。独立数学／普通文件读取、源码 guard 与实际 UI 证据分列，详见[报告](../output/basic-saved-report-1012.json)与[独立回读](../output/parallel/basic-saved-actual-reader-1012/runs/actual002-1012/actual-readback.json)。

共 15 个生产目标：两个核心、三个测试、一个原 fixture、两个对话框及 CSS、预览模块与 Worker、App、TessellationPanel、SpaceConstructionMenu。整体实用复现还需旋转褶皱的三角／周期身份与 TQ 约束变形设计；本批为源码更新，尚未打包，旧 v0.13.6 包保留。刻字软件导入、机器试压、连续运动、层序、碰撞与实机提速未验证。
''',encoding='utf8')
intro='P76（2026-10-12，源码版）：五种单纸基础模型与三种原展开纸形已完成创作入口，3537 前端、274 真实界面操作、56 实际下载及 45 来源 guard 通过，见[入口与验收](docs/P76-单纸基础模型与展开纸形创作-20261012.md)。剩余旋转褶皱及 TQ 约束变形继续，整体目标尚未完成，旧包保留。\n\n'
readme=root/'README.md'
readme.write_text(readme.read_text(encoding='utf8').replace('\n\n','\n\n'+intro,1),encoding='utf8')
remaining=root/'docs/Origamica当前剩余范围-20261009.md'
intro='P76 最新状态（2026-10-12）：五种原单纸模型与三种原展开纸形已完成采用、有效改参、保存重开和普通文件闭环；3537 前端、274 操作、56 下载、18 保存、9 UUID 与 45 来源 guard 通过。见[P76](P76-单纸基础模型与展开纸形创作-20261012.md)。余下原旋转褶皱（含三角共尖与周期身份）及一般 TQ 约束变形设计继续，整体未完成，未打包。\n\n'
remaining.write_text(remaining.read_text(encoding='utf8').replace('\n\n','\n\n'+intro,1),encoding='utf8')
reportp=root/'output/basic-saved-report-1012.json'
assert not reportp.exists()
report=dict(verified=True,sourceOnly=True,packaged=False,goalComplete=False,tests=checks['tests'],guardedReuse=checks['guardedReuse'],checkFile=checkp.relative_to(root).as_posix(),checkSHA256=sha(checkp),actualChecks=274,actualFiles=56,actualPOSTs=18,actualDiskUUIDs=9,sourceGuards=45,sourceFreeze=sourcep.relative_to(root).as_posix(),sourceFreezeSHA256=sha(sourcep),actualEvidence=actualp.relative_to(root).as_posix(),actualSHA256=sha(actualp),peerActualAcceptanceSHA256=sha(accept),peerReadback=result,changedFiles=[dict(file=k,verifiedFrozenSHA256=v) for k,v in changed.items()],remaining='Rotational pleats including original shared apex/periodic identities, and actual TQ constrained design',softwareImportVerified=False,machineTrialVerified=False,machineSpeedupPromised=False)
reportp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
paths=set()
add=lambda p:paths.add(Path(p).resolve())
for p in [checkp,sourcep,actualp,reportp,doc,readme,remaining,accept,peer/'preparation-freeze.json',root/'scripts/finish-basic-saved-1012.py']:add(p)
for r in acceptance['files']:add(r['path'])
for r in prepared['files']:add(peer/r['path'])
for name in changed:add(snapshots.get(name,work/name))
for name in records:
    add(root/f'output/parallel/{name}-integrated-1010.json')
    for p in (root/f'output/parallel/integration-{name}-1010-before').rglob('*'):
        if p.is_file():add(p)
for folder in [backup,root/'output/playwright/basic-saved-main-1012/downloads-001',root/'output/playwright/basic-saved-main-1012/downloads-002']:
    for p in folder.rglob('*'):
        if p.is_file():add(p)
for p in (root/'output/playwright/basic-saved-main-1012').glob('*.js'):add(p)
for p in (root/'output/playwright/basic-saved-main-1012').glob('*.json'):add(p)
for index in [1,2]:
    for suffix in ['json','log']:add(root/f'output/basic-saved-checks-{index:03d}-1012.{suffix}')
archive=root/'output/audits/basic-saved-artifacts-1012'
assert not archive.exists()
archive.mkdir(parents=True)
rows=[]
for p in sorted(paths,key=str):
    assert p.is_relative_to(root),str(p)
    name=p.relative_to(root).as_posix()
    dest=archive/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,dest)
    assert sha(dest)==sha(p)
    rows.append(dict(file=name,sha256=sha(dest),bytes=dest.stat().st_size))
final=root/'output/audits/basic-saved-final-1012.json'
assert not final.exists()
final.write_text(json.dumps(dict(verified=True,archive=archive.relative_to(root).as_posix(),snapshots=rows,reportSHA256=sha(reportp),goalComplete=False,physicalVerification=False),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,changedFiles=15,archiveFiles=len(rows),actualChecks=274,actualFiles=56,frontend=3537,goalComplete=False),ensure_ascii=False))
