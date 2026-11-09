"""Origamica's direct folded coordinates for a positive-alpha primal/dual twist.

The negative-alpha construction has the same ordered vertices and edges as the
crease pattern. It is an embedding only: visibility and layer order are still
independent questions.
"""
import math


def orient_custom_primal_dual_edges(graph, mother, source):
    """Keep the source graph's directed interior edges when its vertices survive.

    Origamica's OrientedInteriorEdgePairs (In[1193]) retains each input Edges
    direction and directs its dual edge 90 degrees CCW from it.  The custom
    mother editor stores faces and vertices, so its canonical source edge is
    from the lower to the higher input vertex index; dualEdgeFlips can reverse
    any individual pair afterward.  A repeated/lattice patch has newly
    generated vertices and cannot claim this source-input correspondence.
    """
    if (source.get('family') != 'custom' or source.get('repeatX', 1) != 1
            or source.get('repeatY', 1) != 1 or 'range1' in source):
        return False
    original = source['vertices']
    if len(original) != len(mother['vertices_coords']):
        return False
    positions = {tuple(round(float(c), 9) for c in point): index
                 for index, point in enumerate(original)}
    if len(positions) != len(original):
        return False
    from pleat.shrink_rotate.crease_orientation import THIS_WAY
    pending = []
    visited = set()
    for edge in graph.halfedges:
        if edge.face is None or edge.rev.face is None:
            continue
        pair = frozenset((id(edge), id(edge.rev)))
        if pair in visited:
            continue
        visited.add(pair)
        first = positions.get(tuple(round(float(c), 9) for c in edge.orig['pos']))
        second = positions.get(tuple(round(float(c), 9) for c in edge.dest['pos']))
        if first is None or second is None or first == second:
            return False
        # The left face of a directed primal halfedge is on its left.  The
        # CCW dual direction is right-face -> left-face, hence edge.rev.
        pending.append((edge, edge.rev if first < second else edge))
    for edge, target in pending:
        edge.attributes.pop(THIS_WAY, None)
        edge.rev.attributes.pop(THIS_WAY, None)
        target[THIS_WAY] = True
    return bool(pending)


def folded_form_scale_rotation(gamma, alpha_deg, direction='ccw'):
    """Return Origamica's (m, phi) with phi in radians.

    Notebook 243486–243528 and 243624–243650: m=rho(+a)/rho(-a),
    phi=beta(+a)-beta(-a). Alpha is the positive CP pleat angle in degrees.
    """
    if not (math.isfinite(gamma) and gamma > 0 and math.isfinite(alpha_deg)
            and 0 < alpha_deg < 90 and direction in ('ccw', 'cw')):
        raise ValueError('原版直接平折需要 γ>0 且 0<α<90° 的折痕参数。')
    a = math.radians(alpha_deg)
    sign = 1 if direction == 'ccw' else -1
    rho_cp = gamma / math.hypot(gamma + math.sin(a), math.cos(a))
    rho_ff = gamma / math.hypot(gamma - math.sin(a), math.cos(a))
    beta_cp = sign * math.atan2(math.cos(a), gamma + math.sin(a))
    beta_ff = sign * math.atan2(math.cos(a), gamma - math.sin(a))
    return rho_cp/rho_ff, beta_cp-beta_ff


def direct_folded_form(fold, recipe, params):
    """Construct ordered FF vertices from the shrink/rotate source coordinates.

    The recipe is the generator's per-vertex (dual center, primal offset). It
    preserves its edge indexing, unlike another serialized negative-alpha CP.
    A length check rejects any mother mesh outside the direct FF relation.
    """
    if not recipe or recipe.get('kind') != 'shrink-rotate':
        raise ValueError('该母结构缺少原始—对偶逐点构造坐标。')
    coefficients = recipe.get('vertices')
    coords = fold['vertices_coords']
    if not isinstance(coefficients, list) or len(coefficients) != len(coords):
        raise ValueError('原始—对偶逐点构造坐标与折痕顶点不对应。')
    if any(not isinstance(v, (tuple, list)) or len(v) != 4 or
           not all(isinstance(n, (int, float)) and math.isfinite(n) for n in v)
           for v in coefficients):
        raise ValueError('原始—对偶逐点构造坐标无效。')
    gamma, alpha = params['gamma'], params['pleatAngle']
    sign = 1 if params.get('twistDirection', 'ccw') == 'ccw' else -1
    a = math.radians(alpha)
    rho_ff = gamma / math.hypot(gamma - math.sin(a), math.cos(a))
    beta_ff = sign * math.atan2(math.cos(a), gamma - math.sin(a))
    m, phi = folded_form_scale_rotation(gamma, alpha, params.get('twistDirection', 'ccw'))
    from tessellation_parameters import post_rotation
    theta = phi + post_rotation(params)
    c, s = math.cos(theta), math.sin(theta)
    cb, sb = math.cos(beta_ff), math.sin(beta_ff)
    vertices = []
    for cx, cy, dx, dy in coefficients:
        x = cx + rho_ff*(cb*dx-sb*dy)
        y = cy + rho_ff*(sb*dx+cb*dy)
        vertices.append([m*(c*x-s*y), m*(s*x+c*y)])
    if any(not all(map(math.isfinite, p)) for p in vertices):
        raise ValueError('原版负 α 平折构造产生无效坐标。')
    scale = max(1., *(abs(v) for p in coords for v in p))
    pairs = {tuple(sorted((i, j))) for i, j in fold['edges_vertices']}
    for face in fold.get('faces_vertices', ()):
        pairs.update(tuple(sorted((i, j))) for n, i in enumerate(face) for j in face[n+1:])
    maximum_error = max((abs(math.dist(coords[i], coords[j])-math.dist(vertices[i], vertices[j]))
                         for i, j in pairs), default=0.)
    if maximum_error > 1e-7*scale:
        raise ValueError('原版负 α 平折构造与纸面面内距离不闭合。')
    return vertices, maximum_error
