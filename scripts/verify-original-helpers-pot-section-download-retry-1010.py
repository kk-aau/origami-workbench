"""Read actual browser downloads independently, without importing producer code."""
import copy
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent.parent
DOWNLOADS = HERE / 'output/original-helpers-browser-final-1010/pot-section-final'
NAMES = ['standard', 'translated-nonmonotone', 'singleton', 'duplicate-negative',
         'all-seven', 'automatic-ratio', 'tiny-unordered', 'boundary-512']
CHECKS = []
FILES = []


def check(condition, name):
    assert condition, name
    CHECKS.append(name)


def read(name, suffix):
    path = DOWNLOADS / (name + suffix)
    raw = path.read_bytes()
    FILES.append({'path': str(path.relative_to(HERE)), 'bytes': len(raw),
                  'sha256': hashlib.sha256(raw).hexdigest()})
    return json.loads(raw) if suffix.endswith('.json') else ET.fromstring(raw)


def close(actual, expected):
    return math.isclose(float(actual), float(expected), rel_tol=1e-12, abs_tol=1e-12)


def svg_numbers(node, attr):
    return [float(x) for x in node.get(attr).split()]


for name in NAMES:
    q = read(name, '-source.json')
    r = read(name, '-response.json')
    data = read(name, '-data.json')
    root = read(name, '.svg')
    points = q['points']
    options = q['graphicsOptions']
    first = [[p[0] - points[0][0], p[1] - points[0][1]] for p in points]
    second = [[-p[0], p[1]] for p in first]
    expected = [{'head': 'Line', 'points': first}, {'head': 'Line', 'points': second}]
    check(r == data and r['query'] == q, name + ': downloaded source/data/HTTP response agree')
    check(r['data'] == {'head': 'Graphics', 'primitives': expected, 'options': options},
          name + ': literal subtraction and reflection preserve every point and order')
    s = r['source']
    check(s['referenceOrigin'] == points[0] and s['definitionLines'] == [261319, 261359]
          and s['definitionCell'] == 'In[3458]', name + ': original source evidence')
    check(s['forwardedGraphicsRules'] == [{'option': k, 'value': v} for k, v in options.items()]
          and list(r['data']['options']) == list(options), name + ': original filtered-rule order')
    check(not s['fullOptionsGraphicsReproduced'] and not s['mathematicaDefaultRenderingReproduced']
          and not s['wolframExecuted'] and not any(k in r for k in ['paper', 'adoptable', 'creasePattern']),
          name + ': helper does not claim full runtime or paper adoption')
    ns = {'s': 'http://www.w3.org/2000/svg'}
    inner = root.find('s:svg', ns)
    group = inner.find('s:g', ns)
    lines = group.findall('s:polyline', ns)
    check(len(lines) == 2 and [p.get('data-original-index') for p in lines] == ['0', '1']
          and all(p.get('data-original-head') == 'Line' for p in lines), name + ': SVG ordered two Line primitives')
    parsed = [[[float(v) for v in pair.split(',')] for pair in p.get('points').split()] for p in lines]
    check(parsed == [first, second], name + ': SVG contains all raw coordinates, duplicates and outside points')
    check(group.get('transform') == 'scale(1,-1)' and inner.get('overflow') == 'hidden'
          and inner.get('preserveAspectRatio') == 'none', name + ': upright coordinates and viewport-only clipping')
    all_points = first + second
    explicit_range = isinstance(options.get('PlotRange'), list)
    if explicit_range:
        bounds = options['PlotRange']
    else:
        bounds = [[min(p[a] for p in all_points), max(p[a] for p in all_points)] for a in [0, 1]]
        bounds = [[lo - .5, hi + .5] if hi-lo < 1e-12*max(1, abs(lo), abs(hi)) else [lo, hi]
                  for lo, hi in bounds]
    [[xmin, xmax], [ymin, ymax]] = bounds
    check(svg_numbers(inner, 'viewBox') == [xmin, -ymax, xmax-xmin, ymax-ymin], name + ': PlotRange exact viewport')
    ratio = options.get('AspectRatio', 'Automatic')
    if ratio == 'Automatic':
        ratio = (ymax-ymin)/(xmax-xmin)
    size = options.get('ImageSize')
    w = size[0] if isinstance(size, list) else size if isinstance(size, (int, float)) else min(300, 150/ratio)
    h = size[1] if isinstance(size, list) else w*ratio
    content_w = min(w, h/ratio)
    content_h = content_w*ratio
    check(root.get('width').endswith('pt') and root.get('height').endswith('pt')
          and close(root.get('width')[:-2], w) and close(root.get('height')[:-2], h), name + ': ImageSize output dimensions')
    expected_content = [(w-content_w)/2, (h-content_h)/2, content_w, content_h]
    check(all(close(inner.get(k), v) for k, v in zip(['x', 'y', 'width', 'height'], expected_content)),
          name + ': AspectRatio and centered image region actually applied')
    axes = options.get('Axes', False)
    if isinstance(axes, bool):
        axes = [axes, axes]
    origin = options.get('AxesOrigin', [0, 0])
    axis_lines = {p.get('data-graphics-option'): p for p in group.findall('s:line', ns)}
    check(set(axis_lines) == {k for k, show in zip(['Axes-x', 'Axes-y'], axes) if show}, name + ': Axes visibility')
    for k, values in [('Axes-x', [xmin, origin[1], xmax, origin[1]]), ('Axes-y', [origin[0], ymin, origin[0], ymax])]:
        if k in axis_lines:
            check(all(close(axis_lines[k].get(a), v) for a, v in zip(['x1', 'y1', 'x2', 'y2'], values)), name + ': ' + k + ' AxesOrigin')
    frames = root.findall('s:rect', ns)
    check(len(frames) == int(options.get('Frame', False)), name + ': Frame actual primitive')
    if frames:
        check(all(close(frames[0].get(k), v) for k, v in zip(['x', 'y', 'width', 'height'], expected_content)), name + ': Frame uses content dimensions')
    bg = options.get('Background', 'None')
    actual_background = root.get('style').split(';')[0]
    if isinstance(bg, dict):
        rgb = [float(v) for v in actual_background.removeprefix('background:rgb(').removesuffix(')').split(',')]
        check(all(close(a, b*255) for a, b in zip(rgb, bg['RGBColor'])), name + ': RGB Background consumed')
    else:
        check(actual_background == 'background:' + ('transparent' if bg == 'None' else bg.lower()), name + ': Background consumed')
    check(not root.findall('.//s:script', ns) and len(list(root.iter())) == 5 + len(axis_lines) + len(frames), name + ': no extra graphics or script')

before = read('constructor', '-before.json')
after = read('constructor', '-after.json')
before['stats'].pop('elapsedMs')
after['stats'].pop('elapsedMs')
check(before == after, 'actual parent constructor before/after all fields except measured elapsed exact')
check(after['stats']['parameters']['crossSection'][0][0] == .3, 'original nonzero parent radius is unchanged')
browser = json.loads((DOWNLOADS / 'browser-evidence.json').read_bytes())
check(browser['passed'] == 58 and not browser['errors'] and browser['actualHelperDownloadFiles'] == 32,
      'actual browser 58 checks and 32 helper downloads completed')
evidence = {'schema': 'pot-cross-section-independent-download-v1', 'producerImports': [],
            'passed': len(CHECKS), 'checks': CHECKS, 'files': FILES,
            'actualHelperDownloadFiles': 32, 'constructorDownloadFiles': 2}
(DOWNLOADS / 'download-audit.json').write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': len(CHECKS), 'actualHelperDownloadFiles': 32, 'constructorDownloadFiles': 2}))
