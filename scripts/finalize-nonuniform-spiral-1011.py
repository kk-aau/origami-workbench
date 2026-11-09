from pathlib import Path
import hashlib
import json
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads((root / p).read_text(encoding='utf-8-sig'))
report_path = root / 'output/original-nonuniform-spiral-report-1011.json'
assert not report_path.exists()
specs = [
 ('original-nonuniform-spiral-3968-cp-source-1011', 'SOURCE-CONTRACT-FROZEN.json', '33d2b0f148b67698870b5f1566cc3a7efe9849d247825a435210e3dcaae6c051', 38),
 ('original-nonuniform-spiral-3968-cp-independent-source-1011', 'freeze.json', 'd4c74a8f0d63d78499bd0f70bf7c5d5d216067ff713574bad8cf922d05185be7', 26),
 ('original-nonuniform-spiral-3968-cp-width-supplement-1011', 'freeze.json', 'cfee9ae36e68e6e4f7376a7617ccd1f37f806806eff7a35070c79f401f1b6703', 23),
 ('original-nonuniform-spiral-3968-cp-1011', 'DELIVERY-FROZEN-003.json', '025de15ba9027a52d5664926a940b92453aa500be1d32096a919c8d7468b7f6d', 12),
 ('original-nonuniform-spiral-3968-cp-1011', 'SUPPORT-FROZEN-001.json', '42841c159775dd9846d04f4e502cbd01106e960d56def646a24e6acedbd80d41', 15),
 ('original-nonuniform-spiral-3968-root-wiring-r2-1011', 'freeze.json', 'ef0bd7445998f8d40dfb2d1862cc4fa65877f3befcb2df95c57fe3acbd5722c1', 4),
 ('original-nonuniform-spiral-3968-cp-independent-review-1011', 'freeze.json', 'c3a54afa9ed6920c7645e92545bbddefd2742ba6bafbe93d25f328aab3f88602', 16),
 ('original-nonuniform-spiral-main-acceptance-prepared-1011', 'freeze.json', '4c412cc9b3ec4d1040e76f8732c51a55c35320079128630a051af203afc0b44f', 11),
 ('original-nonuniform-spiral-3968-cp-1011/performance-001', 'DELTA-FROZEN-001.json', 'a469ec44b8e812dd9d4e623e9a9a39c0132b42d680a0988af9e32e9fc902e927', 15),
 ('original-nonuniform-spiral-3968-cp-1011/performance-001', 'PERFORMANCE-SUPPORT-FROZEN-001.json', '851d1f6a203b67ade5b9db44d3834df98f3e8d4a97329fb5f1cc7c97c50f3681', 9),
 ('original-nonuniform-spiral-performance-independent-review-1011', 'freeze.json', '38c6aabd608e3fad9c6c41ab29f43448b2b6744f2598bc485b5100fe71ef3196', 13),
 ('original-nonuniform-spiral-readable-rulers-1011', 'freeze.json', '1ad16f9a238e9a3729b1f2f09fadafb8bd13c66e2d87ff554066bae8b55e00ae', 4),
 ('original-nonuniform-spiral-core-main-auditor-prepared-1011', 'freeze.json', '45b3f393525ea7cc96995efcf518c97b1e756ec414a25d8149c121a87e9fc60d', 6),
 ('original-nonuniform-spiral-parent-layout-prepared-1011', 'freeze.json', 'a2aaad994504bac51bf271b660d6a494ac110d53a7217c0160d6db42e5b04d66', 11),
 ('original-nonuniform-spiral-main-independent-review-1011', 'freeze.json', '3064e771aac9c1eaafff7e527f6f86291bbeb09f762b8c60aef668b280cbdba5', 6),
 ('original-nonuniform-spiral-actual-file-independent-1011', 'freeze.json', '053764dcf4aa47a86719c453207b84340aa0458d1c1104746cf4374891aff6bc', 11),
 ('original-nonuniform-spiral-parent-spacing-fix-1011', 'freeze.json', '939a23b813cc8d9774d9d47b73b0c1ef303ec16d71eaba703b85c726885d01f6', 3),
 ('original-nonuniform-spiral-parent-layout-css-bridge-addon-1011', 'freeze.json', '1033da251dd4b29bf395a6d29dd7a563d1710176eaae3e5e4aa7cfd6e9c6cbba', 15),
]
frozen = []
for folder, index, expected, count in specs:
 base = root / 'output/parallel' / folder
 p = base / index
 assert sha(p) == expected, p
 j = json.loads(p.read_text(encoding='utf-8-sig'))
 assert len(j['files']) == count, p
 listed = []
 for row in j['files']:
  item = row.get('path', row.get('file'))
  candidates = [root / item, base / item]
  f = next((v.resolve() for v in candidates if v.is_file() and sha(v) == row['sha256']), None)
  assert f is not None and f.is_relative_to(root), item
  listed.append(dict(file=f.relative_to(root).as_posix(), sha256=row['sha256']))
 for field in ['actualUserDownloads', 'nonUserActualInputs']:
  for row in j.get(field, []):
   f = Path(row.get('path', row.get('file'))).resolve()
   assert f.is_relative_to(root) and sha(f) == row['sha256'], str(f)
   listed.append(dict(file=f.relative_to(root).as_posix(), sha256=row['sha256']))
 frozen.append(dict(file=p.relative_to(root).as_posix(), sha256=expected, indexFiles=count, files=listed))
layout_base = root / 'output/parallel/original-nonuniform-spiral-parent-layout-independent-review-1011'
layout_index = layout_base / 'freeze.json'
assert layout_index.is_file(), 'Independent layout freeze required'
lj = json.loads(layout_index.read_text(encoding='utf8'))
layout_files = []
for row in lj['files']:
 item = row.get('path', row.get('file'))
 f = next((v.resolve() for v in [root / item, layout_base / item] if v.is_file() and sha(v) == row['sha256']), None)
 assert f is not None and f.is_relative_to(root), item
 layout_files.append(dict(file=f.relative_to(root).as_posix(), sha256=row['sha256']))
frozen.append(dict(file=layout_index.relative_to(root).as_posix(), sha256=sha(layout_index), indexFiles=len(lj['files']), files=layout_files))
run = read('output/original-nonuniform-spiral-checks-1011.json')
final_run = read('output/original-nonuniform-spiral-final-checks-1011.json')
assert run['exitCode'] == final_run['exitCode'] == 0
assert run['inputsUnchanged'] and run['backendInputsUnchanged'] and final_run['inputsUnchanged']
assert final_run['tests']['frontend'] == 2937
main = read('output/playwright/original-nonuniform-spiral-main-1011/browser-checks.json')
assert main['passed'] and main['checks'] == 204 and len(main['downloads']) == 52
layout = read('output/playwright/original-nonuniform-spiral-main-1011/parent-layout-final-001/parent-layout-checks.json')
assert layout['passed'] and layout['checks'] == 166 and len(layout['records']) == 12
assert layout['actualUserExports'] == layout['projectWrites'] == layout['adoptions'] == 0
assert layout['bundle'] == '/assets/main-CBd4Y56z.js' and layout['newBundleActualUserDownloads'] == 0
core = read('output/parallel/original-nonuniform-spiral-main-independent-review-1011/core-actual-files-audit-001.json')
binding = read('output/parallel/original-nonuniform-spiral-main-independent-review-1011/actual-main-binding-001.json')
py = read('output/parallel/original-nonuniform-spiral-actual-file-independent-1011/actual-files-audit-003.json')
assert core['passed'] and binding['verified'] and py['passed']
assert core['checks'] + binding['checks'] == 4324 and py['checks'] == 2103394
bridge = read('output/original-nonuniform-spiral-css-bridge-1011.json')
assert bridge['verified'] and bridge['onlyCSSSourceChange'] and bridge['mainJavaScriptEqualAfterAllowedAssetReferenceReplacement']
for row in bridge['files']:
 assert sha(root / row['file']) == row['sha256'], row['file']
preserve = read('output/original-nonuniform-spiral-parent-final-preservation-1011.json')
assert preserve['verified'] and preserve['previousArchiveFilesVerified'] == 3900 and preserve['mappedFiles'] == 7
for f, expected in preserve['lastSourceHashes'].items():
 assert sha(root / f) == expected, f
assert read('output/original-nonuniform-spiral-runtime-stopped-1011.json')['verified']
previous = read('output/audits/original-cone-four-plane-apex-final-1011.json')
previous_hashes = {r['file']: r['sha256'] for r in previous['snapshots']}
backup = root / 'output/original-nonuniform-spiral-docs-before-1011'
assert not backup.exists()
doc_changes = []
for name in ['README.md', 'docs/Origamica当前剩余范围-20261009.md']:
 f = root / name
 assert sha(f) == previous_hashes[name], name
 saved = backup / name
 saved.parent.mkdir(parents=True, exist_ok=True)
 shutil.copyfile(f, saved)
 before = sha(f)
 text = f.read_text(encoding='utf8')
 if name == 'README.md':
  first = text.index('\n') + 1
  text = text[:first] + '\n原非均匀螺旋CP（2026-10-11，源码版）：原In[3968]已有带毫米刻度的纸域参数、实时预览、采用、保存和源再建；2937前端、204实际操作、166主界面布局及52实际文件回读通过，见[入口与验收](docs/P61-原非均匀螺旋纸域CP统一验收-20261011.md)。均匀螺旋继续接入，完整目标未完成，免安装包未更新。\n' + text[first:]
 else:
  start = text.index('最新已验收：')
  end = text.index('\n\n', start)
  text = text[:start] + '最新已验收：原In[3968]非均匀螺旋有限两面CP、毫米标尺、五参数及实时预览、采用/保存/源再建，204实际操作与52实际文件回读通过；最终CSS版本另有166项真实父布局，保留功能版本文件且通过精确JS桥，见P61-原非均匀螺旋纸域CP统一验收-20261011.md。下一批原In[3951]均匀螺旋正在接入，In[3980]展开再折回源合同并行检查。P60及此前冻结保持；完整曲线、符号/默认与全数值域目标仍未完成。' + text[end:]
 f.write_text(text, encoding='utf8')
 doc_changes.append(dict(file=name, before=before, after=sha(f)))
doc_name = 'docs/P61-原非均匀螺旋纸域CP统一验收-20261011.md'
doc = root / doc_name
assert not doc.exists()
doc.write_text('''# 原非均匀螺旋纸域 CP 验收（2026-10-11）

原 In[3968] 非均匀螺旋已从只读参考增加为可构造、采用、保存及导出的有限二维 CP。源码版可体验，免安装包未更新，完整 Origamica 目标仍在推进。

| 体验入口 | 效果 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原非均匀螺旋内切 CP · In[3968] | 原角起止、左右纸宽、16–128弦段可精确输入或拖滑条；毫米坐标轴、网格、标尺及端点可视。 |
| 实时纸宽预览 | 复用已验证源采样，调宽无需新数值请求；取消不修改当前工程。采用时重新验证完整来源。 |
| 采用后 → 修改原非均匀螺旋纸面参数 | 可重新生成原 U/null；同工程源参数再建和同名保存保持 UUID，手改来源明确失配。 |

原参数 r=1、θ=30°、γ(u)=π/3+u/3 保持，u是原角而非弧长；原起点 f(u₀)=(1,0)、T(u₀)=(0,1)。修改原角起点会按原函数在该起点重新初始化。保原母线方向、坐标及1:1毫米，不翻转右侧、不归一或额外缩放。原128点插值选项与100段 StyledCurve 是两件事；本地有限弦不冒充 Wolfram 插值结果。

原两侧单位宽1参考完整保留。默认CP取0.5/0.5mm安全纸域；左宽必须小于当前区间最小焦距并留0.0001mm间隙，范围0.05–1mm，右宽0.05–1mm。原全区间左焦距约0.713225571mm，后段u₀=2.6允许左右原单位宽1；非法宽度明确拒绝，不静默截断。宽纸域允许经独立证明的简单非凸单元，不能用错误的全凸前提拒绝它们。

| 有限CP | 顶点 / 边 / 材料面 |
| --- | --- |
| 默认100弦段 | 303 / 304 / 2 |
| 16弦段 | 51 / 52 / 2 |
| 24弦段 | 75 / 76 / 2 |

两真实材料面仅沿原折痕共边，内部U/null、边界B/0；证明用2n四边单元及4n三角不生成加工缝。原母线是预览参考，不新增CP压痕。

| 验证 | 结果 |
| --- | --- |
| 项目检查 | 最终前端2937、桌面7、服务/worker66及24平面脚本与层序专项通过。后端1337既有完整检查按全部受保护输入SHA保持沿用，未冒称本批重跑。类型检查和1045模块构建通过。 |
| 实际操作与按钮文件 | 功能版本204项；32 JSON、7 FOLD、7普通DXF、3优化DXF、3加工报告，共52。默认、16/24段、非凸宽纸域、后段单位纸宽、唯一手改及恢复、取消、工程库、同UUID保存均覆盖。 |
| 独立核心回读 | 4324项，39份普通工程按现有格式真实导入，3组加工规划与逐LINE回读；34源文件匹配、5手改文件失配。 |
| 独立数值与材料核对 | Python 2,103,394项断言，52实际文件；MP80源最大残差5.05×10⁻¹⁵，坐标及逐LINE最大残差1.22×10⁻¹⁵mm。实际两面几何与一次覆盖核验通过。 |
| 主界面最终布局 | 166项，App源修改/镶嵌入口×两种桌面×ready/checking/error共12记录；680px弹窗、420px预览，五输入及滑条/标尺/footer同屏，无双向滚动。4真实native请求hold后继续，零采用、保存或用户导出。 |
| 文件保护 | 本轮52及P60原82共134文件逐SHA不变；P60归档3900与1837已有生产输入保持，11共享几何/普通及优化导出核心不改。 |

204操作与52按钮文件属于 /assets/main-CCa43v6o.js。随后修复镶嵌父样式覆盖造成的滚动，只改本弹窗CSS。最终 /assets/main-CBd4Y56z.js 的真实应用JS除唯一自身sourceMap文件名注释外字节完全相同，22其它资产相同；保留旧26资产，最终26均核对SHA。最终版本在全新无临时样式浏览器中完成上述12组布局；没有将旧52声称为新版本下载，新版本按钮下载计数为0。首布局溢出失败、所有审计假设/草稿失败及历史冻结保留。

实际唯一手改 spiral3968-crease-23（边69）U/null→M/-180，完整差集只有1 ID，来源判定false；明确源再生才恢复。7种状态的平折核心仍为geometry.invalid/layers.unknown（川崎条件），这批二维纸域不提供平折、层序、有限面刚性三维、连续运动、碰撞或纸厚认证。

| 修改文件 | 用途 |
| --- | --- |
| src/app/nonuniformSpiralCP3968.ts | 原数据来源验证、有限两面CP与私有预览复用 |
| src/components/NonuniformSpiralCP3968Dialog.tsx / .css | 五参数、毫米预览、状态及实际父样式布局 |
| src/App.tsx / src/components/TessellationPanel.tsx | 独立构造入口、采用与原参数重开 |
| tests/app/nonuniformSpiralCP3968.test.ts / tests/fixtures/nonuniform-spiral-cp-3968-20261011.json | 回归与固定源fixture |

| 未完成或未验证 | 说明 |
| --- | --- |
| 下一批 | 原In[3951]均匀螺旋构造接入中，In[3980]展开再折回源合同并行；本批不计为已完成。 |
| 原版完整范围 | 任意符号/默认求解/原插值/全数值域、任意非平折编辑及更广材料/颜色/层序仍未完整复现，不能报可靠剩余数量或百分比。 |
| 外部验证与交付 | 未执行Wolfram或核对保存Out；未更新免安装包、发布、刻字软件实际导入或机器试压，不承诺实机提速。 |

主报告 output/original-nonuniform-spiral-report-1011.json；实际文件 output/playwright/original-nonuniform-spiral-main-1011；最终资产与CSS桥 output/original-nonuniform-spiral-css-bridge-1011.json。自有浏览器与8873测试服务已关闭，未操作用户服务。
''', encoding='utf8')
doc_changes.append(dict(file=doc_name, before=None, after=sha(doc)))
report = dict(verified=True, tests=final_run['tests'], firstEightStagesPassed=True,
 finalFunctionalMainAppChecks=204, userButtonExportFiles=52, actualFormatRoles=dict(JSON=32,FOLD=7,ordinaryDXF=7,processingDXF=3,processingReport=3),
 actualCoreChecks=4324, actualCoreImports=39, actualProcessingPairs=3, independentPythonChecks=2103394,
 finalLayoutChecks=166, finalLayoutRecords=12, finalLayoutPassed=True, layoutGuardedFiles=134,
 functionalBundle=main['bundle'], bundle=bridge['finalBundle'], finalBundleActualUserDownloads=0,
 cssBridgeFile='output/original-nonuniform-spiral-css-bridge-1011.json', cssBridgeSha256=sha(root/'output/original-nonuniform-spiral-css-bridge-1011.json'),
 finalLayoutReport='output/playwright/original-nonuniform-spiral-main-1011/parent-layout-final-001/parent-layout-checks.json',
 preservation=preserve, frozenIndexes=frozen, docChanges=doc_changes, finalSaved=main['lastSaved'],
 completeOrigamicaGoal=False, packed=False, published=False, machineVerified=False,
 notVerified=['complete Origamica symbolic/default/numerical/interpolation domains','Uniform3951 next integration','In3980 next refold reconstruction','Wolfram execution or saved Out','finite rigid3D/flat-fold/layers/collision/thickness','portable package/third-party cutter/machine'])
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(verified=True, indexes=len(frozen), main=204, layout=166, downloads=52, finalBundleDownloads=0, mappedTargets=7)))
