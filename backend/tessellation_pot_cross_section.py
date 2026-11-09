"""Finite literal PotCrossSectionGraphics In[3458], notebook 261319–261359.

This is an original Graphics helper. Its two Lines are not a paper constructor.
Translation/reflection affect only this returned graphic, never a pot profile.
"""
import copy
import math

GRAPHICS_OPTIONS = ('Axes', 'AxesOrigin', 'Frame', 'PlotRange',
                    'AspectRatio', 'ImageSize', 'Background')


def _number(value, low, high):
    return type(value) in (int, float) and low <= value <= high and math.isfinite(value)


def _point(value):
    return (isinstance(value, list) and len(value) == 2 and
            all(_number(v, -1_000_000, 1_000_000) for v in value))


def _graphics_options(value):
    if not isinstance(value, dict) or set(value)-set(GRAPHICS_OPTIONS):
        raise ValueError('原 Graphics 帮助当前仅支持七个有限选项；未知或未覆盖选项不能执行。')
    for name, option in value.items():
        if name == 'Axes':
            valid = type(option) is bool or (isinstance(option, list) and len(option) == 2 and
                                            all(type(v) is bool for v in option))
        elif name == 'AxesOrigin':
            valid = _point(option)
        elif name == 'Frame':
            valid = type(option) is bool
        elif name == 'PlotRange':
            valid = option == 'All' or (isinstance(option, list) and len(option) == 2 and
                all(_point(pair) and pair[1]-pair[0] >= 1e-9 for pair in option))
        elif name == 'AspectRatio':
            valid = option == 'Automatic' or _number(option, .05, 20)
        elif name == 'ImageSize':
            valid = _number(option, 20, 1200) or (isinstance(option, list) and len(option) == 2 and
                                                all(_number(v, 20, 1200) for v in option))
        else:
            valid = isinstance(option, str) and option in ('None', 'White', 'Black') or (
                isinstance(option, dict) and set(option) == {'RGBColor'} and
                isinstance(option['RGBColor'], list) and len(option['RGBColor']) == 3 and
                all(_number(v, 0, 1) for v in option['RGBColor']))
        if not valid:
            raise ValueError(f'{name} 超出当前支持的原 Graphics 有限数值域。')
    # Original FilterRules preserves surviving rules in their original order.
    return copy.deepcopy(value)


def validate_pot_cross_section_query(data):
    if (not isinstance(data, dict) or data.get('family') != 'pot-cross-section-native' or
            set(data)-{'family', 'points', 'graphicsOptions'}):
        raise ValueError('原对称剖面帮助查询类型或字段无效。')
    points = data.get('points')
    if (not isinstance(points, list) or not 1 <= len(points) <= 512 or
            any(not _point(p) for p in points)):
        raise ValueError('原帮助输入须为1–512个有限二维点，坐标绝对值不超过1000000。')
    # No monotonicity, positive radius, deduplication or parent-constructor checks.
    return {'family': 'pot-cross-section-native', 'points': copy.deepcopy(points),
            'graphicsOptions': _graphics_options(data.get('graphicsOptions', {}))}


def query_pot_cross_section(data):
    q = validate_pot_cross_section_query(data)
    origin = q['points'][0]
    translated = [[p[0]-origin[0], p[1]-origin[1]] for p in q['points']]
    reflected = [[-p[0], p[1]] for p in translated]
    return {
        'schema': 'origamica-pot-cross-section-graphics-v1', 'query': q,
        'source': {
            'function': 'PotCrossSectionGraphics', 'definitionCell': 'In[3458]',
            'definitionLines': [261319, 261359], 'referenceOrigin': copy.deepcopy(origin),
            'originalPrimitiveOrder': ['Line[pts1]', 'Line[({-1,1}#)&/@pts1]'],
            'forwardedGraphicsRules': [{'option': name, 'value': copy.deepcopy(value)}
                                       for name, value in q['graphicsOptions'].items()],
            'finiteGraphicsOptions': list(GRAPHICS_OPTIONS),
            'allOriginalLineCoordinatesPreserved': True,
            'fullOptionsGraphicsReproduced': False,
            'mathematicaDefaultRenderingReproduced': False,
            'wolframExecuted': False,
        },
        'data': {'head': 'Graphics',
                 'primitives': [{'head': 'Line', 'points': translated},
                                {'head': 'Line', 'points': reflected}],
                 'options': copy.deepcopy(q['graphicsOptions'])},
    }
