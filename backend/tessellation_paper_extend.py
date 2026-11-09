"""Grow a tessellation around its requested core, then cut one chosen sheet.

New tessellation cells fill the added area. The old perimeter does not become
an inert interior ring. Periodic interiors keep their old creases; edge
half-molecules can be rebuilt as complete molecules when the sheet grows.
"""
from __future__ import annotations

from copy import deepcopy
import math
import time

from tessellation_paper import paper_polygon
from tessellation_paper_clip import clip_fold_to_convex_paper


def _center(graph):
    coords = graph['vertices_coords']
    return [(min(p[axis] for p in coords) + max(p[axis] for p in coords)) / 2
            for axis in (0, 1)]


def _extended_parameters(params, pad):
    result = dict(params)
    family = params['family']
    if family == 'periodic':
        result['rows'] += 2 * pad
        result['columns'] += 2 * pad
    elif family == 'primal-dual':
        result['rings'] += pad
    elif family == 'archimedean':
        if params['tiling'] in ('cairo', 'double-cairo'):
            result['repeatX'] += 2 * pad
            result['repeatY'] += 2 * pad
            # The public editor remains bounded at four repeats. A selected
            # square around a skew Double Cairo cell may need a 6x6 source
            # patch before its corners are covered by real pattern faces.
            result['_paperExpansionInternal'] = True
        else:
            result['rings'] += pad
    elif family == 'custom':
        result['repeatX'] += 2 * pad
        result['repeatY'] += 2 * pad
    elif family == 'flagstone':
        result['rows'] += 2 * pad
        result['columns'] += 2 * pad
    elif family == 'ring' and params.get('ringMode') != 'origamica' and 'radii' not in params:
        result['rings'] += pad
    else:
        raise ValueError('该构造目前没有保真向外延展规则，不能生成独立纸张。')
    return result


def _crease_edges(fold, kinds=('M', 'V'), skip_boundary_touching=False):
    coords = fold['vertices_coords']
    boundary = ({v for (a, b), kind in zip(fold['edges_vertices'], fold['edges_assignment'])
                 if kind == 'B' for v in (a, b)} if skip_boundary_touching else set())
    return [(kind, coords[a], coords[b]) for (a, b), kind in
            zip(fold['edges_vertices'], fold['edges_assignment'])
            if kind in kinds and a not in boundary and b not in boundary]


def _contains_original_creases(original, extended, kinds=('M', 'V'),
                               skip_boundary_touching=False):
    coords = extended['vertices_coords']
    span = max(max(p[axis] for p in coords) - min(p[axis] for p in coords)
               for axis in (0, 1))
    tolerance = max(span, 1.) * 2e-7
    lookup = {}
    for (a, b), kind in zip(extended['edges_vertices'], extended['edges_assignment']):
        if kind not in kinds:
            continue
        x, y = coords[a], coords[b]
        key = tuple(sorted((tuple(round(v / tolerance) for v in x),
                            tuple(round(v / tolerance) for v in y))))
        lookup.setdefault((kind, key), []).append((x, y))
    for kind, a, b in _crease_edges(original, kinds, skip_boundary_touching):
        key = tuple(sorted((tuple(round(v / tolerance) for v in a),
                            tuple(round(v / tolerance) for v in b))))
        if not any((math.dist(a, x) <= tolerance and math.dist(b, y) <= tolerance) or
                   (math.dist(a, y) <= tolerance and math.dist(b, x) <= tolerance)
                   for x, y in lookup.get((kind, key), [])):
            return False
    return True


def _frame_metrics(fold, params, source, started):
    from tessellate import check_geometry, check_local_conditions
    from tessellation_lff import analyze_lff_graph

    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('延展后纸张的折痕发生交叉或退化。')
    assignments = fold['edges_assignment']
    if source.get('output') == 'tiling':
        boundary = {v for (a, b), kind in zip(fold['edges_vertices'], assignments)
                    if kind == 'B' for v in (a, b)}
        local = {'status': 'not_applicable', 'reason': '母结构排布没有山谷折痕。',
                 'interiorVertices': len(fold['vertices_coords']) - len(boundary),
                 'oddDegreeVertices': [], 'kawasakiViolations': [],
                 'maekawaViolations': [], 'unknownAssignmentVertices': [],
                 'maxKawasakiErrorDeg': 0., 'toleranceDeg': .001}
    else:
        local = check_local_conditions(fold)
    lff = analyze_lff_graph(fold, geometry_status=geometry['status'])
    return {
        'vertices': len(fold['vertices_coords']), 'edges': len(fold['edges_vertices']),
        'faces': len(fold['faces_vertices']),
        'mountainEdges': assignments.count('M'), 'valleyEdges': assignments.count('V'),
        'boundaryEdges': assignments.count('B'), 'unassignedEdges': assignments.count('U'),
        'elapsedMs': round((time.perf_counter() - started) * 1000), 'parameters': params,
        'checks': {'geometry': geometry, 'local': local, 'lff': lff,
                   'layerOrder': {'status': 'not_checked'}},
        'foldability': 'not_applicable' if source.get('output') == 'tiling' else 'candidate',
        'kind': 'extended-tessellation-paper',
    }


def generate_extended_paper(params, generate_validated):
    """Return a real FOLD graph whose new pattern reaches an independent B."""
    started = time.perf_counter()
    base = {key: value for key, value in params.items() if key != 'paper'}
    if base['family'] == 'woven':
        # Re-solving a larger inverse-unfolded patch changes its free pleats;
        # translating it cannot preserve the existing CP or stationary face.
        # Fail before any nonlinear solve rather than clipping stale metadata.
        raise ValueError('盒褶编织尚无保真向外延展到独立纸张的规则，请沿用原边界。')
    if 'pruneBoundary' in base or 'dualTargets' in base or base.get('motherParams'):
        raise ValueError('修剪、手动对偶和外部铺石母结构暂不能保真向外延展到新纸边。')
    core = generate_validated(base)
    if core['stats']['checks']['geometry']['status'] != 'passed':
        raise ValueError('原核心折痕几何未通过，不能向外延展。')
    if base['family'] == 'twist':
        if base.get('mode') == 'quad-split' or base.get('splitCount', 1) != 1:
            raise ValueError('镜像拼接与四边形分裂须先建立独立的外延规则，当前纸形不能直接套用。')
        from tessellation_patterns import polygon_twist
        fold = polygon_twist(base['sides'], base['angle'], base['scale'],
                             base.get('offsetX', 0), base.get('offsetY', 0),
                             base.get('polygon'), paper=params['paper'])
        if 'polygon' in base:
            from tessellation_advanced import assign_local_mv
            fold = assign_local_mv(fold, preferred=fold['edges_assignment'].copy())
        fold['file_creator'] = '折纸工作台 / 单元扭转射线直达独立纸边'
        fold['frame_description'] = '扭转折痕由中心直接延伸至选定纸张边界。'
        source = dict(core['source'])
        source.update(paperMethod='direct-boundary-rays-v1',
                      paperPolygon=paper_polygon([[-1., -1.], [1., -1.],
                                                  [1., 1.], [-1., 1.]],
                                                 **params['paper']))
        stats = _frame_metrics(fold, params, source, started)
        stats['tiles'] = core['stats']['tiles']
        return {'preview': None, 'fold': fold, 'mother': None, 'dual': None,
                'stats': stats,
                'warnings': [*core['warnings'],
                             '单元扭转射线已直接延伸至选定纸边；没有保留旧纸边或空白外环。'],
                'source': source}
    # A flagstone's existing paper extends beyond its primal mother polygon:
    # its outer half-molecules also belong inside the selected new sheet.
    basis = (core['fold'] if base['family'] == 'flagstone' else
             core.get('mother') or core['fold'])
    target_before_rotation = paper_polygon(basis['vertices_coords'], **params['paper'])
    from tessellation_parameters import post_rotation

    orientation = post_rotation(params) if 'angle' in params else 0.
    cosine, sine = math.cos(orientation), math.sin(orientation)
    target = [[cosine * x - sine * y, sine * x + cosine * y]
              for x, y in target_before_rotation]
    failures = []
    # A triangular paper around a skewed periodic patch can put its corners
    # more than five cells away.
    # Keep the other families at five: their larger source graphs can exceed
    # the existing face or vertex/edge safety limits before reaching pad six.
    max_padding = 7 if base['family'] == 'periodic' else 5
    for pad in range(1, max_padding + 1):
        try:
            extra_params = _extended_parameters(base, pad)
            expanded = generate_validated(extra_params)
            extended = deepcopy(expanded['fold'])
            # Mother geometry is independent of the moving twist parameters.
            # Align in that frame, then apply the same postRotation to the
            # displacement as to both crease patterns. This keeps a live
            # preview recipe valid when angle/scale change.
            if base['family'] == 'flagstone':
                # The original rule places a corner at primal_scale*vertex +
                # dual_scale*dual_center. Its translational period is therefore
                # that same weighted sum (and differs from the mother period
                # when width is nonzero or rectangular aspect is changed).
                primal_scale, dual_scale = ((1., base['width']) if
                                            base.get('shrinkage') is None else
                                            (base['shrinkage'], 1-base['shrinkage']))
                mother_delta = [a-b for a, b in zip(
                    _center(core['mother']), _center(expanded['mother']))]
                dual_delta = [a-b for a, b in zip(
                    _center(core['dual']), _center(expanded['dual']))]
                translation_before_rotation = [
                    primal_scale*m + dual_scale*d
                    for m, d in zip(mother_delta, dual_delta)]
            else:
                center = _center(basis)
                expanded_center = _center(expanded.get('mother') or expanded['fold'])
                translation_before_rotation = [a - b for a, b in zip(center, expanded_center)]
            translation = [
                cosine * translation_before_rotation[0] - sine * translation_before_rotation[1],
                sine * translation_before_rotation[0] + cosine * translation_before_rotation[1]]
            extended['vertices_coords'] = [
                [p[0] + translation[0], p[1] + translation[1]]
                for p in extended['vertices_coords']]
            clipped = clip_fold_to_convex_paper(
                extended, target, folded_form=expanded['source'].get('foldedForm'))
            fold = clipped['fold']
            core_kinds = ('F',) if core['source'].get('output') == 'tiling' else ('M', 'V')
            if not _contains_original_creases(
                    core['fold'], fold, core_kinds,
                    skip_boundary_touching=base['family'] == 'flagstone'):
                raise ValueError('延展改变了原有核心折痕；需要不同的延展规则。')
            fold['file_creator'] = '折纸工作台 / 向外延展后按独立纸张收边'
            fold['frame_description'] = '核心镶嵌向外延展至独立纸边；整片层序仍需验证。'
            source = dict(core['source'])
            for key in ('foldedForm', 'foldedFormMethod', 'foldedFormMaxIsometryError'):
                source.pop(key, None)
            source.update(
                paperMethod='extended-pattern-clip-v1', paperPolygon=target,
                paperExpansion=pad,
                paperClipPreview={
                    'kind': 'convex-clip-v1',
                    'sourceFold': {key: extended[key] for key in (
                        'vertices_coords', 'edges_vertices',
                        'edges_assignment', 'faces_vertices')},
                    'sourcePreview': expanded.get('preview'),
                    'translation': translation,
                    'translationBeforeRotation': translation_before_rotation,
                    'paper': params['paper'], 'polygon': target,
                    'polygonBeforeRotation': target_before_rotation,
                },
            )
            if 'foldedForm' in clipped:
                source['foldedForm'] = clipped['foldedForm']
                source['foldedFormMethod'] = (expanded['source'].get('foldedFormMethod') or
                                              '源图逐点折后坐标裁剪映射')
            stats = _frame_metrics(fold, params, source, started)
            stats['tiles'] = core['stats']['tiles']
            warnings = list(core['warnings'])
            warnings.append(
                '已向外扩展母结构，新增镶嵌折痕一直延伸至独立纸张边界；'
                + ('内部山谷线逐条保留，旧边界结构已按新外沿重构。'
                   if base['family'] == 'flagstone' else
                   '原核心山谷线已逐条核对。'))
            if stats['checks']['local']['status'] == 'failed':
                warnings.append('延展后的整片局部必要条件未通过，此纸形暂不可采用。')
            return {'preview': None, 'fold': fold, 'mother': core.get('mother'),
                    'dual': core.get('dual'), 'stats': stats, 'warnings': warnings,
                    'source': source}
        except ValueError as exc:
            failures.append(f'向外扩展 {pad} 圈：{exc}')
    raise ValueError('无法在选定纸形下保留完整核心并把图样延展到纸边。' +
                     (f' {failures[-1]}' if failures else ''))
