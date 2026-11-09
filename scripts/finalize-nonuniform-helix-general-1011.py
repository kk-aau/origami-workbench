"""Finalize P65 only from completed actual-file audits; never start services or pack."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--core', required=True)
    parser.add_argument('--numeric', required=True)
    parser.add_argument('--layout', required=True)
    parser.add_argument('--index', action='append', default=[])
    args = parser.parse_args()
    root = Path.cwd().resolve()
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    report_path = root / 'output/original-nonuniform-helix-general-report-1011.json'
    assert not report_path.exists(), '保留已完成报告'
    evidence = {}

    def add_file(p, expected=None):
        p = Path(p).resolve()
        assert p.is_relative_to(root) and p.is_file(), str(p)
        digest = sha(p)
        assert expected is None or digest == expected, str(p)
        name = p.relative_to(root).as_posix()
        assert name not in evidence or evidence[name] == digest, name
        evidence[name] = digest
        return name

    indexes = []
    for name in args.index:
        p = root / name
        data = read(p)
        add_file(p)
        assert isinstance(data.get('files'), list), name
        listed = 0
        for key in ['files', 'authorBrowserFiles', 'actualFiles', 'nonUserInputs',
                    'actualUserDownloads', 'actualNonUserInputs', 'actualUserFiles',
                    'externalInputs']:
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
                listed += 1
        indexes.append(dict(file=name, sha256=sha(p), indexFiles=len(data['files']),
                            explicitRowsVerified=listed))

    checks_path = root / 'output/original-nonuniform-helix-general-checks-1011.json'
    run = read(checks_path)
    assert run['exitCode'] == 0 and run['inputsUnchanged'] and run['backendInputsUnchanged']
    assert len(run['stages']) == 8 and all(s['exitCode'] == 0 for s in run['stages'])
    assert run['tests']['frontend'] == 3055 and run['tests']['desktop'] == 7
    assert run['tests']['serverWorker'] == 66 and run['tests']['backend'] == 1337
    bundle_path = root / 'output/original-nonuniform-helix-general-bundle-1011.json'
    bundle = read(bundle_path)
    assert bundle['verified'] and bundle['tests'] == run['tests']
    assert bundle['bundle'] == '/assets/main-Co5JCLSj.js'
    for row in bundle['files']:
        add_file(root / row['file'], row['sha256'])
    base = root / 'output/playwright/original-nonuniform-helix-general-main-1011'
    main_path = base / 'downloads-002/browser-checks.json'
    parent_path = base / 'parent-layout-001/parent-layout-checks.json'
    after_path = base / 'parent-layout-001/independent-parent-audit.json'
    browser = read(main_path)
    parent = read(parent_path)
    after = read(after_path)
    assert browser['verified'] and browser['passed'] and not browser['errors']
    assert len(browser['downloads']) == browser['actualUserDownloadCount'] == 49
    assert len(browser['receipts']) == 9 and browser['nativeRequests'] == 0
    assert browser['checks'] == 623
    assert browser['bundle'] == parent['actualBrowserBundle'] == bundle['bundle']
    assert parent['verified'] and parent['passed'] and not parent['errors']
    assert len(parent['records']) == 12 and parent['sourceTimerDelayMs'] == 130
    assert parent['checks'] == 228
    assert parent['adoptions'] == parent['projectWrites'] == parent['actualUserExports'] == 0
    assert after['verified'] and not after['errors']
    independent = {}
    for role, name in [('core', args.core), ('numeric', args.numeric), ('layout', args.layout)]:
        p = root / name
        data = read(p)
        assert data.get('verified') is True and not data.get('errors'), name
        assert data.get('passed', True) is True, name
        add_file(p)
        independent[role] = dict(file=name, sha256=sha(p), result=data)
    core = independent['core']['result']
    numeric = independent['numeric']['result']
    layout = independent['layout']['result']
    assert core['bundle'] == numeric['bundle'] == layout['actualBrowserBundle'] == bundle['bundle']
    assert core['actualUserDownloadsAudited'] == 49
    assert core['actualCoreOrdinaryJSONFOLDImports'] == len(core['imports']) == 35
    assert sum(row['sourceMatches'] is True for row in core['imports']) == 30
    assert sum(row['sourceMatches'] is False for row in core['imports']) == 5
    assert len(core['processing']) == 3 and len(core['actualHandChanges']) == 1
    assert layout['actualParentRecords'] == 12 and layout['protectedActualUserFiles'] == 98
    assert layout['protectedByteBindings'] == 119
    assert numeric['checks'] == 708164 and numeric['actualUserDownloadsAudited'] == 49
    assert numeric['actualDocumentDownloadsAudited'] == 35 and len(numeric['processing']) == 3
    assert numeric['uniqueAnalyticSourceFrameSetsAudited'] == numeric['uniqueMaterialGeometriesAudited'] == 6
    assert numeric['producerImported'] is numeric['backendImported'] is numeric['candidateGenerated'] is False
    assert numeric['HTTPNativeInvoked'] is False
    assert numeric['browserReportSHA256'] == sha(main_path)

    preserve_path = root / 'output/original-nonuniform-helix-general-preservation-1011.json'
    preserve = read(preserve_path)
    assert preserve['verified'] and preserve['mappedFiles'] == 7
    assert preserve['previousArchiveFilesVerified'] == 4182 and preserve['noUnmappedProductionChanges']
    for name, digest in preserve['lastSourceHashes'].items():
        add_file(root / name, digest)
    stopped_path = root / 'output/original-nonuniform-helix-general-runtime-stopped-1011.json'
    assert read(stopped_path)['verified']
    assert sha(root / 'tmp/Origamica-15.0-reference.nb') == '19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
    for p in [checks_path, bundle_path, main_path, parent_path, after_path, preserve_path, stopped_path]:
        add_file(p)

    old = read(root / 'output/audits/original-uniform-helix-general-final-1011.json')
    assert len(old['snapshots']) == 4182
    for row in old['snapshots']:
        assert sha(root / old['archive'] / row['file']) == row['sha256'], row['file']
    old_hashes = {r['file']: r['sha256'] for r in old['snapshots']}
    backup = root / 'output/original-nonuniform-helix-general-docs-before-1011'
    assert not backup.exists()
    backup.mkdir()
    changes = []
    for name in ['README.md', 'docs/Origamica当前剩余范围-20261009.md']:
        p = root / name
        assert sha(p) == old_hashes[name], name
        target = backup / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, target)
        changes.append(dict(file=name, before=sha(p)))
    document = root / 'docs/P65-原任意折角函数CP统一验收-20261011.md'
    assert not document.exists()
    font = min(t['renderedFontSizePx'] for r in parent['records'] for s in r['svgs'] for t in s['texts'])
    text = f'''# 原任意折角函数 CP 验收（2026-10-11）

原 In[3959]/In[3966] 的非均匀螺旋构造已接入源码版主工作区。安全表达式和明确的本地自然 C² 点函数可以生成两面 CP，并采用、修改、保存、重开和导出。完整 Origamica 目标继续，免安装包未更新。

| 入口 | 可体验功能 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原任意折角螺旋 CP · In[3966] | 七个数值参数及完整 γ(u) 函数；毫米纸面刻度、折角曲线、点拖动与原单位宽参考。 |
| 采用后 → 修改原任意折角函数纸面参数 | 修改后重新采用；取消保留当前 CP，保存及重开保留完整配方，同工程保留 UUID。明确再建恢复 U/null。 |

原 f(a)=(1,0)、T(a)=(0,1) 在本次起点 a 重新设置，不能套用均匀螺旋的绝对零相位。原空间曲线和左右母线保持原 r、θ、γ(u) 定义。原单位对应 1 mm；两面共享曲线 U/null，外边 B/0；验证用的母线和对角线不成为额外加工边。

默认表达式为 `pi/3+u/3`，r=1、θ=30°、u∈[0,π]、左内切宽0.5、右宽1、100弦。原单位1/1有明确按钮与虚线参考。改纸宽可复用不变的源帧；改函数或源参数时即时更新输入与函数图，130ms源计算等待期间禁用旧候选采用，只接受最新参数结果。

| 验收 | 结果 |
| --- | --- |
| 项目检查 | 前端 {run['tests']['frontend']}、桌面7、服务/worker66通过；24平面与3层序专项通过；构建 {run['tests']['buildModules']} 模块通过。后端1337沿用受保护输入SHA一致的既有结果，未冒称本批重跑。 |
| 主程序真实操作 | {browser['checks']} 项，49个实际按钮文件，9次保存POST；表达式、非仿射函数、八次渐进拖点、周期角/负起点、跨π128弦、唯一手改及恢复通过。native请求0。 |
| 保存及导出 | 核心独立回读 {core['checks']} 项通过；35个JSON/FOLD导入，来源30真/5手改假；普通DXF、3组优化DXF及报告均经过独立重新解析。原值、几何、材料两面、覆盖及加工次数以实际文件核验。DXF保持既有R12普通LINE及一次Y变换。独立原公式数值结果见报告中的numeric。 |
| 独立原公式与实际图 | MP80和实际二进制坐标整数几何共 {numeric['checks']} 项通过；六套源帧、六种材料几何以及35持久工程、全部11份DXF逐边核验。未导入产品构造器作为数值oracle；实际自然点以独立三对角求解和分节点积分核对。源单位残差约1.041×10⁻¹⁴，保存毫米图与LINE回放残差0；γ显示像素误差单列，不混写为毫米。 |
| 窗口布局 | {parent['checks']} 项、12实际场景：两个入口×1420/1920桌面×等待/成功/错误。图槽与按钮不漂移，无双向滚动或裁切；最小真实SVG字体 {font:.5f}px。只读回查 {after['checks']}、独立读回 {layout['checks']} 项通过，保护本批49及上批49实际文件。父布局12场景验证表达式模式；自然点的真实拖动/保存属于主流程，不冒称同一父布局证明。 |
| 原工作 | P64归档4182件复核；{preserve['unchangedProductionInputs']}既有生产输入不变。本批7文件有精确集成链，当前资产、源文件与实际流程一致。自有8877及浏览器已关闭，用户服务保持。 |

| 修改文件 | 用途 |
| --- | --- |
| src/app/nonuniformHelixGeneralCP3966.ts | 原任意折角源、表达式及本地C²模型、两侧焦点与实际有限图、配方和来源匹配 |
| src/components/NonuniformHelixGeneralCP3966Dialog.tsx / .css | 参数、毫米刻度、函数曲线及点拖动、稳定状态与采用按钮 |
| src/App.tsx / src/components/TessellationPanel.tsx | 独立入口、采用及同工程源参数再建 |
| tests/app/nonuniformHelixGeneralCP3966.test.ts | 源、纸域、有限图、参数持续与异常输入回归 |
| tests/fixtures/nonuniform-helix-general-cp-3966-20261011.json | 独立原公式数值及真实有限图案例 |

原源合法性、数值预算、两侧焦点、完整有限几何与材料接口分别验证。γ必须为正；正偶数π可保源参考但不伪造两面CP。γ″导致的右侧焦点及局部不奇异但全局相交均有真实拒绝案例，不移动端点、压缩宽度或把错误参数替换成默认。

开发及验收发现的问题均保留：早期正偶数π分支误绕过γ>0检查已修；图中文字实际过小已在集成前修正。主程序首轮自动化因自然模式输入框名称中的空格定位错误而停在207项，修正测试后完整623项通过。独立读回的对象字段顺序比较问题也保留失败记录，修正比较时不放宽数值、数组顺序或原始文件SHA。

| 未完成或未验证 | 状态 |
| --- | --- |
| Mathematica完整语义 | 本地表达式白名单及自然三次点模型不等同所有Wolfram Function、InterpolatingFunction或原Automatic默认。未运行Wolfram。 |
| 数值及空间材料 | 当前工程误差不是区间证书；不认证所有合法数值域、连续全域单射、刚性3D、FF、纸厚、碰撞或完整层序。 |
| 下一批及剩余目标 | 均匀螺旋周期角、γ>π和γ=π显式延续在隔离实现；极小CP鼠标编辑容量、任意非平折及完整色面/层序仍需补。不能给出可靠总剩余数量或百分比。 |
| 交付及外部验证 | 未重打免安装包或发布；未做刻字软件实际导入、机器试压或设备操作，不承诺实机提速。 |

最终实际目录：output/playwright/original-nonuniform-helix-general-main-1011/downloads-002。工程UUID：{browser['lastSaved']['id']}。报告：output/original-nonuniform-helix-general-report-1011.json。
'''
    document.write_text(text, encoding='utf-8')
    changes.append(dict(file=document.relative_to(root).as_posix(), before=None))
    p = root / 'README.md'
    s = p.read_text(encoding='utf-8')
    anchor = '# 折纸工坊 · 本机工作台\n\n'
    assert s.startswith(anchor)
    intro = '任意折角函数CP（2026-10-11，源码版）：表达式、可拖动函数点、毫米纸面预览和采用/保存/重开/导出已接入。实际623操作、49件实际文件回读及12父布局通过，见[入口与验收](docs/P65-原任意折角函数CP统一验收-20261011.md)。完整目标继续，免安装包未更新。\n\n'
    p.write_text(anchor + intro + s[len(anchor):], encoding='utf-8')
    p = root / 'docs/Origamica当前剩余范围-20261009.md'
    s = p.read_text(encoding='utf-8')
    start = s.index('最新已验收：')
    end = s.index('\n\n', start)
    latest = '最新已验收：P65原In[3959]/In[3966]任意折角函数两面CP，表达式和本地自然C²点函数已接主工作区；实际623操作、49实际文件及12父布局通过，见P65-原任意折角函数CP统一验收-20261011.md。P61至P64成果保持。均匀螺旋周期θ别名、γ>π及γ=π显式延续在隔离实现，极小CP鼠标编辑容量仍需补。完整表达式、原Wolfram插值/默认与全部数值域、任意非平折及完整色面/层序未完成，不能给出可靠剩余数量或百分比。'
    s = s[:start] + latest + s[end:]
    s = s.replace('# Origamica 当前剩余范围（2026-10-10更新）', '# Origamica 当前剩余范围（2026-10-11更新）', 1)
    p.write_text(s, encoding='utf-8')
    for row in changes:
        row['after'] = sha(root / row['file'])
    result = dict(verified=True, tests=run['tests'], bundle=bundle['bundle'],
                  actualMainChecks=browser['checks'], userButtonExportFiles=49,
                  actualCoreImports=35, processingPairs=3, finalSaved=browser['lastSaved'],
                  finalLayoutChecks=parent['checks'], finalLayoutRecords=12,
                  minimumActualSVGFontPx=font, layoutIndependentReadbackChecks=after['checks'],
                  independent=independent, preservation=preserve, frozenIndexes=indexes,
                  listedEvidence=[dict(file=k, sha256=v) for k, v in sorted(evidence.items())],
                  docChanges=changes, ownRuntimeClosed=True, completeOrigamicaGoal=False,
                  packed=False, published=False, machineVerified=False,
                  notVerified=['完整Wolfram表达式/默认/插值及全数值域', '连续区间数值证书',
                               '任意非平折与完整色面层序', '极小CP鼠标容量',
                               'Wolfram执行', '免安装包更新', '刻字软件导入和机器试压'])
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(verified=True, actualFiles=49, indexes=len(indexes),
                         evidenceFiles=len(evidence), goalComplete=False)))


if __name__ == '__main__':
    main()
