from pathlib import Path
import argparse
import hashlib
import json
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
parser = argparse.ArgumentParser()
parser.add_argument('--camera-index', required=True)
args = parser.parse_args()
out = root / 'output/original-spiral-refold-report-1011.json'
assert not out.exists()
specs = [
 ('original-spiral-refold-3980-next-source-1011', 'freeze.json', 'afd1506e762b64a9295bc563cc07e06523987c86d9d492e410f67aca44aacfee', 37),
 ('original-spiral-refold-3980-cp-1011', 'DELIVERY-FROZEN.json', 'c6c84f5e360389a4c399ba1b7092b71e56c504c887097022fce84c0e20fc67fc', 11),
 ('original-spiral-refold-3980-cp-1011', 'SUPPORT-FROZEN.json', '1015b0af327d519086033cbab7d982cc8b0ff47ee1eaee89a3b7c99432b16e5b', 38),
 ('original-spiral-refold-3980-cp-independent-review-1011', 'freeze.json', '02b2733a394cbce916e793dcb84361fc5364d3c4131bcc7a91ca36b8a0836e12', 14),
 ('original-spiral-refold-3980-cp-1011/space-view-delta-001', 'DELTA-FROZEN.json', '3de247ee08fb7982f4f186226340ac018d9f56f14c836230acb9a1d1ffa4bff4', 31),
 ('original-spiral-refold-3980-cp-1011/space-view-delta-001/axis-domain-addon-001', 'freeze.json', '912f2a3ddf5fc4384277aeb98b35baed0870b32effea06509ad73f929da2216d', 17),
 ('original-spiral-refold-3980-cp-1011/placeholder-layout-delta-001', 'DELTA-FROZEN.json', '32f0dc5c80f23257d4e3d148bc6ee3f5449d967c5af087b4c52c2a67f39f5283', 24),
 ('original-spiral-refold-3980-cp-1011/tab-height-delta-001', 'DELTA-FROZEN.json', 'b927da6f80142d1001eeb0722954933b165d169a009b345814308eea318b2e79', 27),
 ('original-spiral-refold-main-acceptance-prepared-1011', 'freeze.json', '53c2bd52cabdef9b59aed634cd6521d0318291cd0a72c77ee34402b9290e4370', 9),
 ('original-spiral-refold-main-acceptance-prepared-1011/camera-observer-addon-001', 'freeze.json', '3a1be4ee48c868b04c0becb280b8cd1ffe1cb60f11c6daf15e24483d3d7ad84d', 10),
 ('original-spiral-refold-core-main-auditor-prepared-1011', 'freeze.json', '181cc08338207a580b3b8b7f52d78a723595de0e207bab4b4c0f8b5c6fee9d94', 7),
 ('original-spiral-refold-core-camera-auditor-addon-1011', 'freeze.json', '6b39083d5e092e74b022050cd6f480c3d04a326bfa232411d14d0d3c9df1f79e', 8),
 ('original-spiral-refold-parent-layout-prepared-1011', 'freeze.json', '866f6575d08f3c4f1e4e9750e4c66c18a3efa15db22ebe482d20d79cc36657b8', 9),
 ('original-spiral-refold-main-camera-events-prepared-1011', 'freeze.json', '6ac3e08f6aa925df3b0f4f5b9d70851b70ed00813dbbeda811c6195ebf683199', 10),
 ('original-spiral-refold-actual-file-independent-1011', 'freeze.json', '7f0b14e802f12c7b9474e8729dbf0eed2415119bde20d8fb06ff710d96b210b1', 6),
 ('original-spiral-refold-main-independent-review-1011', 'freeze.json', '48c5263d3ed4d7364eebe6f65ec311673a131baac93175bf01a5125e7994e726', 5),
 ('original-spiral-refold-actual-file-independent-final-1011', 'freeze.json', '41b08d1583848661b0529f44132b5c90d4a15fc850099552b57e9520dc323e22', 11),
 ('original-spiral-refold-main-independent-review-final-1011', 'freeze.json', 'c3bdc35fe570adafab24b3aa90b1bdc504305e6cea73207eb3d1ddad0707bcb5', 7),
 ('original-spiral-refold-parent-layout-independent-review-final-1011', 'freeze.json', '761ae927b3e58802272a09f2a07181f49dc5cae314d5df8ae8bcd844ae4baac2', 5),
 ('original-spiral-refold-main-camera-independent-review-1011', 'freeze.json', '5fb9d67cbc0bb14c1800f89a6d9388cf4eebc5941e25826eb23d0fa2906247af', 7),
]
listed = {}
frozen = []
def add_file(p, expected):
    p = p.resolve()
    assert p.is_relative_to(root) and p.is_file() and sha(p) == expected, str(p)
    name = p.relative_to(root).as_posix()
    assert name not in listed or listed[name] == expected, name
    listed[name] = expected
    return dict(file=name, sha256=expected)

def add_index(p, expected=None, count=None):
    p = p.resolve()
    expected = expected or sha(p)
    add_file(p, expected)
    d = json.loads(p.read_text(encoding='utf-8-sig'))
    if count is not None:
        assert len(d['files']) == count, str(p)
    rows = []
    # These fields are explicit file lists; integer download counts are deliberately excluded.
    fields = ['files', 'actualFiles', 'nonUserInputs', 'actualUserDownloads',
              'actualNonUserInputs', 'nonUserActualInputs', 'actualInputs',
              'preservedFailedParentInputs', 'sourceCSSDeltaReferences']
    for field in fields:
        for row in d.get(field, []) if isinstance(d.get(field), list) else []:
            if not isinstance(row, dict) or 'sha256' not in row:
                continue
            name = row.get('path', row.get('file'))
            if name is None:
                continue
            declared = Path(d.get('producerRoot', str(p.parent)))
            candidate = next((q for q in [p.parent / name, declared / name, root / name, Path(name)]
                              if q.is_file() and sha(q) == row['sha256']), None)
            assert candidate is not None, name
            rows.append(add_file(candidate, row['sha256']))
    frozen.append(dict(file=p.relative_to(root).as_posix(), sha256=expected,
                       indexFiles=len(d['files']), files=rows))
    return d

for folder, index, expected, count in specs:
    add_index(root / 'output/parallel' / folder / index, expected, count)
add_index(root / 'output/parallel/original-spiral-refold-root-wiring-r2-1011/freeze.json', count=4)
camera_index = root / args.camera_index
camera_frozen = add_index(camera_index)
assert camera_frozen['verified'] and len(camera_frozen['files']) == 12
assert sha(camera_index) == '0eb6b5e423797b403c9b5a7cdf3daa47296c6f7e71ba7254d9dc791cd40cfa98'
for name in ['actual-index.json', 'external-log-index.json']:
    add_index(camera_index.parent / name)
run = read('output/original-spiral-refold-checks-1011.json')
assert run['exitCode'] == 0 and run['inputsUnchanged'] and run['backendInputsUnchanged']
assert run['tests'] == dict(frontend=2989, desktop=7, backend=1337, serverWorker=66, buildModules=1051)
build = read('output/original-spiral-refold-tabs-fix-build-1011.json')
assert build['verified'] and build['onlyViewSourceChanged'] and build['allOtherEightStageInputsUnchanged']
for row in build['files']:
    assert sha(root / row['file']) == row['sha256']
main_dir = 'output/playwright/original-spiral-refold-main-1011/downloads-003'
main = read(main_dir + '/browser-checks.json')
layout = read('output/playwright/original-spiral-refold-main-1011/parent-layout-003/parent-layout-checks.json')
camera = read('output/playwright/original-spiral-refold-main-camera-events-1011/run-001/camera-events.json')
camera_audit = read('output/playwright/original-spiral-refold-main-camera-events-1011/run-001/camera-event-independent-audit.json')
assert main['passed'] and main['checks'] == 344 and main['actualUserDownloadCount'] == 52 and main['nativeRequests'] == 0
assert layout['passed'] and layout['checks'] == 578 and len(layout['records']) == 36
assert layout['actualUserExports'] == layout['projectWrites'] == layout['adoptions'] == 0
assert camera['verified'] and camera['passed'] == 34 and len(camera['records']) == 4 and not camera['errors']
assert camera_audit['verified'] and camera_audit['checks'] == 5289 and not camera_audit['errors']
assert main['bundle'] == layout['bundle'] == camera['actualBrowserBundle'] == build['bundle'] == '/assets/main-DCKxcTym.js'
core = read('output/parallel/original-spiral-refold-main-independent-review-final-1011/freeze.json')
numeric = read('output/parallel/original-spiral-refold-actual-file-independent-final-1011/freeze.json')
parent = read('output/parallel/original-spiral-refold-parent-layout-independent-review-final-1011/freeze.json')
assert core['checks'] == 6864 and numeric['checks'] == 505708 and parent['checks'] == 1210
preserve = read('output/original-spiral-refold-tabs-fix-preservation-1011.json')
assert preserve['verified'] and preserve['mappedFiles'] == 7 and preserve['unchangedProductionInputs'] == 1847
for name, value in preserve['lastSourceHashes'].items():
    assert sha(root / name) == value, name
assert read('output/original-spiral-refold-runtime-stopped-1011.json')['verified']
assert sha(root / 'tmp/Origamica-15.0-reference.nb') == '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
previous = read('output/audits/original-uniform-helix-final-1011.json')
old_hashes = {r['file']: r['sha256'] for r in previous['snapshots']}
backup = root / 'output/original-spiral-refold-docs-before-1011'
assert not backup.exists()
changes = []
doc_name = 'docs/P63-原螺旋展开再折回CP统一验收-20261011.md'
for name in ['README.md', 'docs/Origamica当前剩余范围-20261009.md']:
    p = root / name
    assert sha(p) == old_hashes[name], name
    saved = backup / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(p, saved)
    before = sha(p)
    text = p.read_text(encoding='utf-8')
    if name == 'README.md':
        at = text.index('\n') + 1
        text = text[:at] + '\n原螺旋展开再折回 CP（2026-10-11，源码版）：In[3980]新增五参数、毫米纸域预览及原空间/连续折回参考，支持采用、保存、源再建和导出；三维参考可旋转、缩放、复位，界面无裁切或滚动。实际344操作、578布局和52文件回读通过，见[入口与验收](' + doc_name + ')。通用螺旋八参数实现已独立验证，待主工作区接入；完整目标仍进行中，免安装包未更新。\n' + text[at:]
    else:
        at = text.index('最新已验收：')
        end = text.index('\n\n', at)
        text = text[:at] + '最新已验收：P63 原In[3980]螺旋展开再折回有限两面CP、当前起点二维重置和当前区间中点连续折回，五参数及毫米预览，可采用/保存/源再建/导出。实际344操作、578布局36场景、52实际文件及三维拖动/缩放/复位通过，见P63-原螺旋展开再折回CP统一验收-20261011.md。P61/P62已有成果保持。下一批P64原In[3951]通用r/θ/γ及八参数构造已独立实现和审查，尚待主App接入验收；不能算已交付。完整曲线、符号/默认、原插值与全数值域、任意非平折编辑及完整色面/层序仍未完成，无法给出可靠剩余数量或百分比。' + text[end:]
    p.write_text(text, encoding='utf-8')
    changes.append(dict(file=name, before=before, after=sha(p)))
p = root / doc_name
assert not p.exists()
hand_id = main['mutations'][0]['changedIds']
assert hand_id == ['refold3980-crease-0']
p.write_text(f'''# 原螺旋展开再折回 CP 验收（2026-10-11）

原 In[3980] 保存例及五个纸域参数现可在主工作区构造、采用、编辑、保存、重新生成和导出。源码版可体验；免安装包未更新，完整 Origamica 复现目标仍进行中。

| 入口 | 可体验功能 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原展开再折回 CP · In[3980] | 原角起止、左右纸宽和16–128采样段；毫米坐标、网格和真实两面CP同屏，可直接采用。 |
| 采用后 → 修改原展开再折回纸面参数 | 回到源参数修改；源再生成恢复原U/null，同工程保存保UUID，取消保持当前工程。 |
| 原连续空间 / 中点连续折回 | 实际鼠标拖动旋转、滚轮缩放和复位；XYZ毫米轴可见，仅改变视图，不改变CP数据。 |

固定保存源为 r=1、θ=30°、γ(u)=2π/3−u/3，原左右AL=2/3、AR=4/3，不翻转母线。改变起点a时二维重新初始化 f(a)=(1,0)、T(a)=(0,1)；空间折回取当前区间中点(a+b)/2的真实解析源标架。与P62均匀螺旋保绝对零点后裁域的规则分别处理。1源坐标单位显式对应1mm，不额外缩放、镜像或翻转。

本批u∈[0,π]、跨度至少0.1rad，左右宽0.05–1mm；默认保持原宽1/1和100弦。连续全单位纸域已证明，实际binary64有限纸域逐次验证；非法输入保原值并禁用采用，不吸附或移动端点。GL32/64按原方程计算，没有复现Wolfram128点插值语义。两侧材料面共用原U/null曲线折痕，边界B/0；验证用母线和对角线不加入CP。

| 检查 | 结果 |
| --- | --- |
| 项目检查 | 前端2989、桌面7、服务/worker66及24平面脚本与层序专项通过。后端1337既有完整结果按所有受保护输入SHA沿用，本批没有冒称重跑。后续修改仅限此弹窗视图，最终类型与1051模块构建再次通过。 |
| 主App实际操作 | 344项，52实际按钮文件，8保存POST；默认100段、16段、非对称宽、裁域、唯一手改、恢复、128段薄宽。库与JSON/FOLD重开、源再建、UUID、取消及实时纸宽通过；源native请求0。 |
| 导出回读 | 32JSON、7FOLD、7普通DXF、3加工DXF和3加工报告；39真实工程导入。6502核心核对加362独立绑定，共6864项。34source真、5手改假；完整规划、独立baseline、逐LINE位置/尺度与每边一次通过。DXF保持普通R12 LINE及既有一次Y变换。 |
| 独立高精度及有限几何 | 505708项，独立冻结MP80源最大残差1.799×10⁻¹⁵，毫米坐标最大2.235×10⁻¹⁵；覆盖、交叉及有限材料拓扑通过，不用产品helper作数值oracle。 |
| 真正父窗口 | 578项、36场景：App源再编辑/镶嵌入口×1420/1920桌面×三参考页×等待/成功/错误。680px弹窗、420px预览、参数及按钮完整可见，无双向滚动、遮挡或裁切。 |
| 布局独审 | 678回读加532绑定，共1210项；238用户文件保护，SVG最小实际字号11.929px。控制真实150ms定时器并恢复，未注入临时样式或假source响应。 |
| 实际三维视图事件 | 34检查、4场景，独立回读5289项，其中3440投影核对，最大差4.441×10⁻¹⁶。实际File.text绑定、原三轨世界坐标、2D CP、参数及来源不变；采用/项目保存/用户导出均0。自身测试恢复文件的两条请求和前后字节单独留存，不声称恢复文件零变化。 |
| 已有工作与冻结 | P62归档3552、1847既有生产输入及11共享核心保持；五个新增源/界面/测试文件和两个现有连接文件有精确集成链。最终DCKxcTym的26资产与实际流程一致；自有浏览器和8875服务已关闭，用户服务保持。 |

独立来源审查保留23个metadata-only反例，并通过938项修复后审查：原二维首速度x=0和零起点原空间基点(1,0,0)分别精确校验，其它派生误差保留合理容限。实际唯一手改为refold3980-crease-0，由U/null变M/−180，其余边保持；明确源再建才恢复。

真实父布局先发现占位420加页签34导致454px溢出，再发现公共按钮最小34px导致30px页签栏顶部裁切2px。只在本弹窗CSS修复占位高度及按钮高度，保留两次失败截图、报告和原SHA；最终全36场景通过。此前D0/Bx两轮实际文件及核对作为历史证据保持，不混称最终构建。

| 修改文件 | 用途 |
| --- | --- |
| src/app/spiralRefoldCP3980.ts | 原方程、二维初值/中点标架、有限材料CP及严格来源校验 |
| src/components/SpiralRefoldCP3980Dialog.tsx / .css | 五参数、毫米纸域、连续空间参考、真实相机交互及局部布局修复 |
| src/App.tsx / src/components/TessellationPanel.tsx | 新入口、采用及源再建 |
| tests/app/spiralRefoldCP3980.test.ts / tests/fixtures/spiral-refold-cp-3980-20261011.json | 25项新增聚焦回归及独立数值fixture |

| 未完成或未验证 | 状态 |
| --- | --- |
| 下一批通用原函数 | P64通用均匀螺旋八参数实现和独立审查完成，仍需主App接入与实际导出验收。不能用固定保存例代替完整函数的全部参数语义。 |
| 完整原版 | 符号/默认求解、原插值、全部合法数值域和函数输入、任意非平折编辑、完整色面/层序继续；不能报告可靠剩余百分比。 |
| 空间与材料折叠 | 当前3D为连续参考，不认证有限材料刚性折形、FF、层序、连续无碰撞或纸厚。 |
| 外部交付 | 未执行Wolfram或核对保存Out，未更新免安装包/发布；未做刻字软件实际导入或机器试压，不承诺实机提速。 |

实际文件：{main_dir}。最终保存UUID：{main['lastSaved']['id']}。报告：output/original-spiral-refold-report-1011.json。
''', encoding='utf-8')
changes.append(dict(file=doc_name, before=None, after=sha(p)))
report = dict(verified=True, tests=run['tests'], eightStagesPassed=True, bundle=main['bundle'],
    actualMainChecks=344, userButtonExportFiles=52, actualCoreImports=39, processingPairs=3,
    actualCoreChecks=6864, independentPythonChecks=505708, finalLayoutChecks=578,
    finalLayoutRecords=36, layoutIndependentChecks=1210, layoutGuardedFiles=238,
    actualCameraChecks=34, actualCameraRecords=4, cameraIndependentChecks=5289,
    finalSaved=main['lastSaved'], sourceNativeRequests=0, preservation=preserve,
    frozenIndexes=frozen, listedEvidence=[dict(file=k, sha256=v) for k, v in sorted(listed.items())],
    docChanges=changes, actualDirectory=main_dir, runtimeClosed=True,
    completeOrigamicaGoal=False, packed=False, published=False, machineVerified=False,
    notVerified=['complete original parameter/function domains', 'P64 main App integration',
                 'symbolic/default/interpolation semantics', 'Wolfram or saved Out',
                 'finite rigid3D/flat-fold/layers/collision/thickness', 'portable/third-party cutter/machine'])
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, main=344, layout=578, camera=34, files=52, indexes=len(frozen), completeOrigamicaGoal=False)))
