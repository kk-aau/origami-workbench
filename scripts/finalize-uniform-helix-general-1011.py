from pathlib import Path
import argparse
import hashlib
import json
import shutil

root = Path.cwd().resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
parser = argparse.ArgumentParser()
parser.add_argument('--indexes', required=True)
parser.add_argument('--core-index', required=True)
parser.add_argument('--numeric-index', required=True)
parser.add_argument('--parent-index', required=True)
args = parser.parse_args()
out = root / 'output/original-uniform-helix-general-report-1011.json'
assert not out.exists()
listed = {}
frozen = []

def add_file(p, expected=None):
    p = p.resolve()
    assert p.is_relative_to(root) and p.is_file(), str(p)
    expected = expected or sha(p)
    assert sha(p) == expected, str(p)
    name = p.relative_to(root).as_posix()
    assert name not in listed or listed[name] == expected, name
    listed[name] = expected
    return dict(file=name, sha256=expected)

def add_index(spec):
    p = root / spec['file']
    add_file(p, spec['sha256'])
    data = read(p)
    assert len(data['files']) == spec['count'], str(p)
    count = 0
    for key in ['files', 'authorBrowserFiles', 'actualFiles', 'nonUserInputs',
                'actualUserDownloads', 'actualNonUserInputs', 'actualUserFiles']:
        rows = data.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or 'sha256' not in row:
                continue
            raw = row.get('file', row.get('path'))
            if not raw:
                continue
            item = Path(raw)
            if not item.is_absolute():
                item = p.parent / item if (p.parent / item).is_file() else root / item
            add_file(item, row['sha256'])
            count += 1
    frozen.append(dict(file=spec['file'], sha256=spec['sha256'],
                       indexFiles=spec['count'], explicitRowsVerified=count))
    return data

specs = read(root / args.indexes)
for spec in specs:
    add_index(spec)
add_file(root / args.indexes)
run = read(root / 'output/original-uniform-helix-general-runtime-fix-checks-1011.json')
assert run['exitCode'] == 0 and run['inputsUnchanged'] and run['backendInputsUnchanged']
assert len(run['stages']) == 8 and all(s['exitCode'] == 0 for s in run['stages'])
assert run['tests']['frontend'] >= 3022 and run['tests']['desktop'] == 7
assert run['tests']['serverWorker'] == 66 and run['tests']['backend'] == 1337
build = read(root / 'output/original-uniform-helix-general-runtime-fix-bundle-1011.json')
assert build['verified'] and build['tests'] == run['tests']
for row in build['files']:
    add_file(root / row['file'], row['sha256'])
main_dir = root / 'output/playwright/original-uniform-helix-general-main-1011/downloads-004'
parent_dir = root / 'output/playwright/original-uniform-helix-general-main-1011/parent-layout-002'
main = read(main_dir / 'browser-checks.json')
parent = read(parent_dir / 'parent-layout-checks.json')
layout_audit = read(parent_dir / 'parent-layout-independent-audit.json')
assert main['passed'] and main['actualUserDownloadCount'] == 49 and not main['errors']
assert main['nativeRequests'] == 0 and len(main['receipts']) == 9
assert parent['passed'] and len(parent['records']) == 12 and not parent['errors']
assert parent['adoptions'] == parent['projectWrites'] == parent['actualUserExports'] == 0
assert layout_audit['verified'] and not layout_audit['errors']
assert main['bundle'] == parent['actualBrowserBundle'] == build['bundle']
core = read(root / args.core_index)
numeric = read(root / args.numeric_index)
layout = read(root / args.parent_index)
for folder, name in [(Path(args.core_index).parent, 'core-bindings-004.json'),
                     (Path(args.numeric_index).parent, 'source-byte-bindings-004.json'),
                     (Path(args.parent_index).parent, 'layout-bindings-004.json')]:
    binding = read(root / folder / name)
    assert binding['verified'] and binding['passed'] and not binding['errors']
assert core['actualBundle'] == numeric['actualBundle'] == layout['actualBundle'] == build['bundle']
assert core['coreChecks'] == 5176 and core['independentBindingChecks'] == 109
assert core['actualSourceTrue'] == 30 and core['actualHandFalse'] == 5
assert numeric['independentMP80ExactChecks'] == 482823 and numeric['independentBindingChecks'] == 180
assert layout['independentChecks'] == 710 and layout['actualParentRecords'] == 12
preserve = read(root / 'output/original-uniform-helix-general-runtime-fix-preservation-1011.json')
assert preserve['verified'] and preserve['mappedFiles'] == 8
for name, value in preserve['lastSourceHashes'].items():
    add_file(root / name, value)
assert read(root / 'output/original-uniform-helix-general-runtime-stopped-1011.json')['verified']
assert sha(root / 'tmp/Origamica-15.0-reference.nb') == '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
previous = read(root / 'output/audits/original-spiral-refold-final-1011.json')
old = {r['file']: r['sha256'] for r in previous['snapshots']}
backup = root / 'output/original-uniform-helix-general-docs-before-1011'
assert not backup.exists()
backup.mkdir()
doc_changes = []
for name in ['README.md', 'docs/Origamica当前剩余范围-20261009.md']:
    p = root / name
    assert sha(p) == old[name], name
    saved = backup / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(p, saved)
    doc_changes.append(dict(file=name, before=sha(p)))
document = root / 'docs/P64-原通用均匀螺旋CP统一验收-20261011.md'
assert not document.exists()
doc = f'''# 原通用均匀螺旋 CP 验收（2026-10-11）

原 In[3951]/In[3945] 主实分支的八参数构造已接入主工作区，支持参数预览、采用、保存、来源再建和普通／加工导出。源码版可体验，免安装包未更新，完整 Origamica 目标继续。

| 入口 | 可体验功能 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原通用均匀螺旋 CP · In[3951] | 半径、螺旋角、折角、原角起止、左右纸宽、16–128 弦；毫米刻度与两面 CP，可直接采用。 |
| 采用后 → 修改原通用均匀螺旋纸面参数 | 重新生成、取消、保存及重开；同工程保 UUID，明确再建才恢复原 U/null。 |

原初值 f(0)=(1,0)，不随 r 缩放；原单位母线宽为 1，与 r 独立。裁域保绝对零点源，支持负角、负起点、跨零和超出保存例 π 的区间。原单位显式对应 1 mm，无额外缩放、翻转、镜像或端点吸附。两面共享原 U/null 折痕，外边 B/0；有限验证用的母线和对角线不加入 CP。

当前实现 r>0、−90°<θ<90°、0°<γ<180° 的主分支。纸宽为 (0,1]，没有 .05 下限。连续纸域须小于一个圆周并满足焦距条件，实际弦图另行精确验证；粗采样有真实交叉时拒绝采用。凸性条件是充分条件，非凸但简单的有限单元也允许。原源合法性、数值可表示性、纸域条件和材料接口容量分别报错，不用保存例参数范围替代通用域。

| 检查 | 结果 |
| --- | --- |
| 项目现有检查 | 前端 {run['tests']['frontend']}、桌面 7、服务/worker 66、24 平面脚本及 3 层序专项通过，{run['tests']['buildModules']} 模块构建通过。后端 1337 按受保护输入 SHA 沿用已完成结果，没有冒称重跑。 |
| 最终主 App 实际操作 | {main['checks']} 项、49 件实际按钮文件、9 次保存 POST；默认100段、半径变化、负角非凸、跨零、超 π、唯一手改/恢复、小半径128段通过，native 请求 0。 |
| 导出及来源回读 | 27 JSON、8 FOLD、8 普通 DXF、3 加工 DXF 与3报告；35普通工程导入、3完整加工规划及每边一次覆盖。核心5176加109绑定共5285项，最终来源30真／5手改假。DXF保持R12 AC1009普通LINE和既有一次Y变换。 |
| 独立数值与有限图 | 独立 MP80/整数几何482823加180绑定，共483003项；实际毫米坐标、每条LINE、交叉、重叠及两面拓扑通过，最大源残差1.426×10⁻¹⁵、毫米/LINE残差8.882×10⁻¹⁶。产品构造器没有充当数值oracle。 |
| 真正父窗口 | {parent['checks']} 项、12 场景，两个入口×1420/1920桌面×等待/成功/错误；720px 弹窗和430px图槽全部控件可见，无双向滚动或裁切。回读 {layout_audit['checks']} 项通过，保护101件实际文件，真实150ms定时器控制后恢复。 |
| 已有工作 | P63 归档4158件核验；{preserve['unchangedProductionInputs']}既有生产输入保持。八个最终修改文件有三段精确集成链，最终资产与实际流程一致。自有8876及验收浏览器已关闭，没有发布或操作设备。 |

独立回读发现初版浏览器→Node 来源匹配误拒24/30个原构造文件。问题只涉及逐帧世界误差估计、单位向量残差及有限三角行列式三个派生值。现在有限纸域证明从实际索引图重算并严格绑定，单位残差从保存的四组向量重算并严格绑定；只有指定的世界工程估计叶允许8 ULP重放，u=0零值严格。参数、源初值、政策、索引、线型和身份保持严格；旧45初值反例与新派生值造假回归保持。没有通过扩大全部metadata容差解决。

手改流程的前两次自动化失败保留：首次预设缩放次数不足，第二次把包含标题的容器当成实际 SVG 命中范围。修正真实 SVG 边界和命中检测后，仍要求端点距离、弦长及唯一 ID/差集。未修改产品缩放逻辑或放宽判定。原两次31件部分文件、修复前401操作49文件、来源误拒及修复前父布局证据保留，并分别绑定自己的 bundle。

| 修改文件 | 用途 |
| --- | --- |
| src/app/uniformHelixGeneralCP3951.ts | 通用解析源、实际有限两面图、来源及跨运行匹配 |
| src/components/UniformHelixGeneralCP3951Dialog.tsx / .css | 八参数、毫米刻度、参考纸宽及原值错误状态 |
| src/App.tsx / src/components/TessellationPanel.tsx | 独立入口、采用及同工程源再建 |
| tests/app/uniformHelixGeneralCP3951.test.ts | 原源、有限图、初值和跨运行来源回归 |
| tests/fixtures/uniform-helix-general-cp-3951-20261011.json | 23组独立数值与有限几何 fixture |
| tests/fixtures/uniform-helix-general-runtime-chrome-20261011.json | 三个真实Chrome原JSON回归快照，非数值 oracle |

| 未完成或未验证 | 状态 |
| --- | --- |
| 更广原域 | 周期 θ 别名、γ>π及γ=π的可去奇点延续仍需独立实现；不声称原函数这些输入非法。 |
| 任意 γ(u) | P65 任意折角函数的原源合同已核对，构造实现仍在隔离开发，尚未主 App 交付。 |
| 极小图交互容量 | 当前主编辑画布仍有固定缩放下限，极小内部折痕的鼠标编辑容量需进一步验证和调整。小半径参数、保存和导出通过不代表任意小线条都可鼠标编辑。 |
| 完整原版与空间材料 | 原符号/默认、Wolfram插值、全部合法数值域、任意非平折编辑及完整色面/层序继续；本批是二维有限CP，不认证刚性3D、FF、连续无碰撞或纸厚。工程误差不是区间数值证书。 |
| 外部验证与交付 | 未执行Wolfram，未重打免安装包或发布；未做刻字软件实际导入或机器试压，不承诺实机提速。 |

最终实际文件：output/playwright/original-uniform-helix-general-main-1011/downloads-004。最终UUID：{main['lastSaved']['id']}。完整报告：output/original-uniform-helix-general-report-1011.json。
'''
document.write_text(doc, encoding='utf-8')
doc_changes.append(dict(file=document.relative_to(root).as_posix(), before=None, after=sha(document)))
p = root / 'README.md'
s = p.read_text(encoding='utf-8')
anchor = '# 折纸工坊 · 本机工作台\n\n'
assert s.startswith(anchor)
s = anchor + f'原通用均匀螺旋CP（2026-10-11，源码版）：八参数、毫米两面预览、采用/保存/源再建及普通/加工导出已接入。实际{main["checks"]}操作、12父布局与49件实际文件回读通过，跨浏览器/Node来源误拒已修复，见[入口与验收](docs/P64-原通用均匀螺旋CP统一验收-20261011.md)。任意折角函数继续，完整目标未完成，免安装包未更新。\n\n' + s[len(anchor):]
s = s.replace('通用螺旋八参数实现已独立验证，待主工作区接入；', '通用螺旋八参数随后已完成P64主工作区验收；')
p.write_text(s, encoding='utf-8')
p = root / 'docs/Origamica当前剩余范围-20261009.md'
s = p.read_text(encoding='utf-8')
first = s.index('最新已验收：')
end = s.index('\n\n', first)
s = s[:first] + f'最新已验收：P64 原In[3951]通用均匀螺旋主分支八参数构造，实际{main["checks"]}操作、49实际文件和12父布局通过，浏览器/Node来源派生数值误拒已修，见P64-原通用均匀螺旋CP统一验收-20261011.md。P61/P62/P63成果保持。P65任意折角函数仍在隔离开发，尚未主App交付；周期θ别名、γ>π及γ=π延续、极小CP鼠标编辑容量仍需补。完整曲线、符号/默认、原插值与全部数值域、任意非平折及完整色面/层序未完成，不能给出可靠剩余数量或百分比。' + s[end:]
p.write_text(s, encoding='utf-8')
for row in doc_changes:
    row['after'] = sha(root / row['file'])
result = dict(verified=True, tests=run['tests'], bundle=build['bundle'],
              actualMainChecks=main['checks'], userButtonExportFiles=49,
              actualCoreImports=35, processingPairs=3, finalSaved=main['lastSaved'],
              actualCoreChecks=5285, independentPythonChecks=483003,
              independentLayoutChecks=710, minimumActualSVGFontPx=layout['minimumActualSVGFontPx'],
              finalLayoutChecks=parent['checks'], finalLayoutRecords=12,
              layoutIndependentReadbackChecks=layout_audit['checks'],
              actualCoreIndependentIndex=args.core_index,
              actualNumericIndependentIndex=args.numeric_index,
              actualParentIndependentIndex=args.parent_index,
              preservation=preserve, frozenIndexes=frozen,
              listedEvidence=[dict(file=k, sha256=v) for k, v in sorted(listed.items())],
              docChanges=doc_changes, completeOrigamicaGoal=False,
              packed=False, published=False, machineVerified=False,
              notVerified=['完整Origamica符号/默认/插值/全数值域', 'P65尚未主App交付',
                           'theta周期别名/gamma大于pi及pi延续', '极小CP鼠标编辑容量',
                           '任意非平折和完整色面层序', 'Wolfram实际执行',
                           '免安装包更新', '刻字软件导入和机器试压'])
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(verified=True, actual49=True, bundle=build['bundle'],
                     frozenIndexes=len(frozen), listedFiles=len(listed), goalComplete=False)))
