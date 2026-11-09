"""Read-only saved MakeAltMoselyPot geometry from Origamica In[3556–3558].

This is the deprecated TRotationalPot display construction.  It deliberately
returns explicit display lines and faces, never a FOLD candidate: the original
FoldedFormGapSize separates display surfaces and no collision proof is given.
"""

import math


FAMILY = 'alt-mosely-pot-reference'
_SAVED = {
    3557: {'profile': ((0., 0.), (1., 1.), (1., 2.), (2., 3.)), 'sectors': 8},
    3558: {'profile': ((0., 0.), (1., 0.), (2., math.sqrt(3)),
                       (1., 2*math.sqrt(3)), (0., 2*math.sqrt(3))),
           'sectors': 6},
}
_GAP = .05
_MINIMUM_ANGLE = math.radians(10)


def validate_alt_mosely_query(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY or \
            set(data) - {'family', 'example', 'sectors'}:
        raise ValueError('只接受 MakeAltMoselyPot 的只读保存示例查询。')
    example = data.get('example', 3557)
    if type(example) is not int or example not in _SAVED:
        raise ValueError('保存示例只支持 In[3557] 和 In[3558]。')
    sectors = data.get('sectors', _SAVED[example]['sectors'])
    if type(sectors) is not int or sectors < 4 or sectors > 16 or sectors % 2:
        raise ValueError('旋转阶数须为 4–16 的正偶数。')
    return {'family': FAMILY, 'example': example, 'sectors': sectors}


def _rotate(point, angle):
    c, s = math.cos(angle), math.sin(angle)
    x, y, *tail = point
    return (c*x-s*y, s*x+c*y, *tail)


def _line(first, second, role, part):
    return {'points': [list(first), list(second)], 'role': role, 'part': part}


def _angle(a, b):
    return math.atan2(a[0]*b[1]-a[1]*b[0], a[0]*b[0]+a[1]*b[1])


def _split_wedge(profile, sectors, part):
    """Exact vertices of MakeMoselyPot's CreasePatternSplitWedge/FFSplitWedge.

    Only the saved Default boundary and the original default gap/angle are
    implemented. StyledFoldLine uses the source's 10 degree threshold.
    """
    phi = math.pi/sectors
    x0, z0 = profile[0]
    section = [(x-x0, z-z0) for x, z in profile]
    radii = [0.]
    for a, b in zip(section, section[1:]):
        radii.append(radii[-1]+math.dist(a, b))
    directions = [((b[0]-a[0])/math.dist(a, b),
                   (b[1]-a[1])/math.dist(a, b))
                  for a, b in zip(section, section[1:])]
    bend = [0.] + [_angle(a, b) for a, b in zip(directions, directions[1:])] + [0.]
    flat_base = section[0][1] == section[1][1]
    cp = {letter: [] for letter in 'efgijk'}
    space = {letter: [] for letter in 'efgijk'}
    for (x, z), r in zip(section, radii):
        w = math.tan(phi)*x
        v = math.tan(phi)*r
        s = (v-w)/2
        reduced = (1-_GAP)*w
        e2, f2 = (r, 0.), (r, w)
        g2 = (r, (w+v)/2)
        c2 = (r, -(w+v)/2)
        d2 = (r, -w)
        i2, j2, k2 = (_rotate(point, 2*phi) for point in (c2, d2, e2))
        for name, point in zip('efgijk', (e2, f2, g2, i2, j2, k2)):
            cp[name].append(point)
        e3, f3 = (x, 0., z), (x, reduced, z)
        g3 = (x+s*math.sin(2*phi), w-s*math.cos(2*phi), z)
        # i3/j3/k3 are rotations of c3/d3/e3 in the original cell.
        c3 = (x+s*math.sin(2*phi), -w+s*math.cos(2*phi), z)
        d3 = (x, -reduced, z)
        i3, j3, k3 = (_rotate(point, 2*phi) for point in (c3, d3, e3))
        for name, point in zip('efgijk', (e3, f3, g3, i3, j3, k3)):
            space[name].append(point)

    lines = []
    for name, role in (('f', 'M'), ('g', 'V'), ('i', 'V'), ('j', 'M')):
        start = 1 if flat_base else 0
        for index in range(start, len(section)-1):
            lines.append(_line(cp[name][index], cp[name][index+1], role, part))
    for index in range(1, len(section)-1):
        def role(angle):
            if angle > _MINIMUM_ANGLE:
                return 'V'
            if angle < -_MINIMUM_ANGLE:
                return 'M'
            return 'F'
        for left, right, sign in (('e', 'f', 1), ('f', 'g', -1),
                                  ('g', 'i', 1), ('i', 'j', -1),
                                  ('j', 'k', 1)):
            lines.append(_line(cp[left][index], cp[right][index],
                               role(sign*bend[index]), part))
    # Default boundary in cpsw: Line[{e2[-1],g2[-1],i2[-1],k2[-1]}].
    border = [cp[name][-1] for name in 'egik']
    lines.extend(_line(a, b, 'B', part) for a, b in zip(border, border[1:]))

    faces = []
    for left, right, role in (('e', 'f', 'panel'), ('f', 'g', 'flange-side'),
                              ('g', 'i', 'flange-face'),
                              ('i', 'j', 'flange-side'), ('j', 'k', 'panel')):
        for index in range(len(section)-1):
            # MakeMoselyPot pfn=Polygon/@Transpose[{#2,#1,RotateLeft[#1],RotateLeft[#2]}].
            polygon = [space[right][index], space[left][index],
                       space[left][index+1], space[right][index+1]]
            faces.append({'vertices': [list(point) for point in polygon],
                          'role': role, 'part': part})
    return {'flatLines': lines, 'faces': faces, 'width': radii[-1],
            'radii': radii, 'bendAnglesRad': bend, 'flatBase': flat_base}


def query_alt_mosely_pot(data):
    query = validate_alt_mosely_query(data)
    example, m = query['example'], query['sectors']
    original = list(_SAVED[example]['profile'])
    profile = original[:]
    if profile[0][0] < profile[-1][0]:
        profile.append((profile[0][0], profile[-1][1]+.0001))
    elif profile[0][0] > profile[-1][0]:
        profile.insert(0, (profile[-1][0], profile[0][1]-.0001))
    height = original[-1][1]-original[0][1]
    forward = _split_wedge(profile, m, 'forward')
    reverse = _split_wedge(list(reversed(profile)), m, 'reverse')
    width = forward['width']
    phi = math.pi/m

    def cp_reverse(point):
        x, y = _rotate(point, -2*phi)[:2]
        # In[303]: ReflectionYMatrix2D={{-1,0},{0,1}}.
        return (width*math.cos(2*phi)-x,
                width*math.sin(2*phi)+y)

    def cp_final(point, repeat):
        shifted = (point[0]+width*repeat*(math.cos(2*phi)-1),
                   point[1]+width*repeat*math.sin(2*phi))
        return _rotate(shifted, -phi)[:2]

    split_lines = []
    flat_lines = []
    for part, wedge in (('forward', forward), ('reverse', reverse)):
        for line in wedge['flatLines']:
            base = line['points'] if part == 'forward' else \
                [cp_reverse(point) for point in line['points']]
            item = {**line, 'points': [list(cp_final(point, 0)) for point in base]}
            split_lines.append(item)
            for repeat in range(m//2):
                flat_lines.append({**item,
                                   'points': [list(cp_final(point, repeat))
                                              for point in base],
                                   'repeat': repeat})

    def ff_reverse(point):
        x, y, z = _rotate(point, 2*phi)
        return (x, y, z+height)

    split_faces = []
    faces = []
    for part, wedge in (('forward', forward), ('reverse', reverse)):
        for face in wedge['faces']:
            base = face['vertices'] if part == 'forward' else \
                [ff_reverse(point) for point in face['vertices']][::-1]
            split_faces.append({**face, 'vertices': [list(point) for point in base]})
            for repeat in range(m//2):
                faces.append({**face, 'vertices':
                              [list(_rotate(point, 4*math.pi*repeat/m))
                               for point in base], 'repeat': repeat})
    return {
        'family': 'origamica-alt-mosely-pot-display', 'query': query,
        'source': {'section': 43, 'function': 'MakeAltMoselyPot',
                   'definitionCell': 'In[3556]', 'savedCell': f'In[{example}]',
                   'classDeprecated': True, 'machineReadableWolframOut': False},
        'options': {'CreasePatternBoundary': 'Default',
                    'MinimumAngleDeg': 10, 'FoldedFormGapSize': _GAP},
        'profile': {'original': [list(point) for point in original],
                    'axisCompleted': [list(point) for point in profile],
                    'heightFromOriginal': height, 'splitWedgeWidth': width,
                    'axisPointAdded': len(profile) != len(original)},
        'splitWedge': {'flatLines': split_lines, 'foldedFaces': split_faces},
        'display': {'flatLines': flat_lines, 'foldedFaces': faces},
        'certification': {'sourceFormulaCoordinates': True,
                          'historicalDeprecatedClass': True,
                          'exactFOLD': False, 'adoptableCreasePattern': False,
                          'foldedDisplayHasGap': True,
                          'selfIntersectionChecked': False,
                          'manufacturabilityChecked': False},
    }
