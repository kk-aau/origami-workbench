from pathlib import Path
import hashlib
import json
import difflib

root = Path.cwd().resolve()
base = root / 'output/parallel/original-uniform-helix-extended-version-002-1011'
assert not base.exists(), '保留已经准备的版本快照'
base.mkdir(parents=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
names = ['package.json', 'package-lock.json', 'src/app/state.ts', 'desktop/使用说明.txt']
items, changes = [], []
for name in names:
    before = (root / name).read_bytes()
    text = before.decode('utf-8')
    if name == 'package.json':
        assert text.count('"version": "0.13.5"') == 1
        result = text.replace('"version": "0.13.5"', '"version": "0.13.6"', 1)
        old, new = json.loads(text), json.loads(result)
        assert old.pop('version') == '0.13.5' and new.pop('version') == '0.13.6' and old == new
    elif name == 'package-lock.json':
        old = json.loads(text)
        assert old['version'] == old['packages']['']['version'] == '0.13.5'
        assert text.count('"version": "0.13.5"') == 2
        result = text.replace('"version": "0.13.5"', '"version": "0.13.6"', 2)
        new = json.loads(result)
        for value in [old, new]:
            value.pop('version')
            value['packages'][''].pop('version')
        assert old == new, '依赖与锁定信息不变'
    elif name == 'src/app/state.ts':
        assert text.count("VERSION = '0.13.5'") == 1
        result = text.replace("VERSION = '0.13.5'", "VERSION = '0.13.6'", 1)
    else:
        assert '最新版本 v0.13.5（2026-10-07）' in text
        result = text.replace('最新版本 v0.13.5（2026-10-07）', '此前版本 v0.13.5（2026-10-07）', 1)
        prefix = '折纸工坊 · Windows x64 桌面测试版\n\n'
        assert result.startswith(prefix)
        intro = ('最新版本 v0.13.6（2026-10-11）：包含截至本次验收的镶嵌构造及曲线折痕编辑。'
                 '均匀螺旋通用 CP 新增独立扩展模式，可保留原始转角、构造大折角及明确标记的 180° 解析延拓；'
                 '可调区间、左右宽度与分段数，预览、采用独立折痕副本、保存并导出。'
                 '非均匀螺旋支持安全表达式和可拖动的折角采样点。'
                 '默认原主值模式及普通 DXF LINE 格式保留。'
                 '只提供本次免安装版；请保存关闭旧版，将新版 EXE 放在原程序目录并保留“折纸工坊数据”。'
                 '复现范围按可直接创作的构造验收，纯理论展示暂不复现；尚未宣称全部实用构造均已完成。'
                 '实际刻字软件导入与机器试压仍未验证。\n\n')
        result = prefix + intro + result[len(prefix):]
    after = result.encode('utf-8')
    destination = base / 'files' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(after)
    saved = base / 'before' / name
    saved.parent.mkdir(parents=True, exist_ok=True)
    saved.write_bytes(before)
    items.append(dict(target=name, baselineSha256=sha(before), sha256=sha(after),
                      source=str(destination), kind='modified'))
    changes.extend(difflib.unified_diff(text.splitlines(True), result.splitlines(True),
                                      fromfile='a/' + name, tofile='b/' + name))
patch = base / 'version.patch'
patch.write_text(''.join(changes), encoding='utf-8', newline='')
manifest = dict(version='0.13.6', dependencyChanges=False, files=items,
                patchSha256=sha(patch.read_bytes()), userDataTouched=False, published=False)
(base / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(version='0.13.6', files=4, dependencyChanges=False)))
