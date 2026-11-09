"""Literal numeric NearConstantWidthScale (In[3871]/In[3874]).

The director is deliberately not normalized: the original formula uses d(s)
as supplied. This is a local scale helper, not a nearest-foot or paper solver.
"""
import math
from tessellation_curved_generic_linked_expression import Expression, Taylor
from tessellation_curved_linked_common_interval import Interval

FAMILY = 'near-constant-width-generic'
PRESET = dict(family=FAMILY, baseCurve=['s', '0'],
              director=['sin(s)', 'cos(s)'], parameterStart=0.,
              parameterEnd=math.pi/3, width=.5, segments=64)


def validate_near_width_query(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY or set(data)-set(PRESET):
        raise ValueError('近恒宽通用查询的类型或字段无效。')
    q = {**PRESET, **data}
    for key in ('baseCurve', 'director'):
        if not isinstance(q[key], list) or len(q[key]) not in (2, 3):
            raise ValueError('基线与母线方向须分别为 2 或 3 个标量函数。')
        for expr in q[key]: Expression(expr, 's')
        q[key] = q[key].copy()
    if len(q['baseCurve']) != len(q['director']):
        raise ValueError('基线与母线方向的维数必须相同。')
    for key in ('parameterStart', 'parameterEnd', 'width'):
        value = q[key]
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError('参数区间与宽度须为有限数字。')
        q[key] = float(value)
    if not -20 <= q['parameterStart'] < q['parameterEnd'] <= 20 or not .001 <= q['parameterEnd']-q['parameterStart'] <= 12:
        raise ValueError('s 区间须在 −20…20，长度为 0.001–12。')
    if abs(q['width']) > 1000:
        raise ValueError('宽度倍率须在 −1000…1000；负值反转母线侧。')
    if type(q['segments']) is not int or not 8 <= q['segments'] <= 128:
        raise ValueError('显示段数须为 8–128 的整数。')
    return q


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


class NearWidthKernel:
    def __init__(self, q):
        self.q = q
        self.base = [Expression(x, 's') for x in q['baseCurve']]
        self.director = [Expression(x, 's') for x in q['director']]
        start = Taylor.variable(q['parameterStart'], 2)
        self.origin_parts = [x.affine_parts(start) for x in self.base]
        self.origin = [math.fsum(c)+d.value for c, d in self.origin_parts]
        speeds = []
        for i in range(9):
            t = Taylor.variable(q['parameterStart']+(q['parameterEnd']-q['parameterStart'])*i/8, 2)
            speeds.append(math.hypot(*(x.affine_parts(t)[1].c[1] for x in self.base)))
        self.scale = max(abs(q['width']), max(speeds)*(q['parameterEnd']-q['parameterStart']))
        if not math.isfinite(self.scale) or self.scale <= 0:
            raise ValueError('基线或宽度无法生成有限的局部坐标。')

    def evaluate(self, s):
        u = Taylor.variable(s, 2)
        b = []
        for expr, (offset, dynamic) in zip(self.base, self.origin_parts):
            c, d = expr.affine_parts(u)
            shift = math.fsum(c+[-x for x in offset])
            b.append((d-dynamic.value+shift)/self.scale)
        velocity = [x.derivative() for x in b]
        speed = dot(velocity, velocity).sqrt()
        tangent = [x/speed for x in velocity]
        director = [expr(u) for expr in self.director]
        projection = dot(tangent, director)
        radicand = 1-projection*projection
        factor = 1/radicand.sqrt()
        outer = [x+self.q['width']/self.scale*factor*d for x, d in zip(b, director)]
        return b, velocity, director, projection, radicand, factor, outer, speed

    def proof(self):
        todo = [(self.q['parameterStart'], self.q['parameterEnd'], 0)]
        cells, unresolved = [], []
        evaluations = 0
        while todo:
            low, high, depth = todo.pop()
            evaluations += 1
            try:
                _, _, _, _, rad, factor, _, speed = self.evaluate(Interval(low, high))
                if speed.value.lo <= 0 or rad.value.lo <= 0:
                    raise ValueError('interval not yet resolved')
                cells.append(dict(start=low, end=high, normalizedSpeedLowerBound=speed.value.lo,
                                  radicandLowerBound=rad.value.lo, scaleUpperBound=factor.value.hi))
                continue
            except (ValueError, OverflowError, ZeroDivisionError):
                # An enclosure failure is not evidence of an actual singularity.
                # A real failure at this interior point is reported distinctly.
                self.evaluate((low+high)/2)
            if depth >= 10 or evaluations+len(todo)+2 > 1023:
                unresolved.append([low, high])
            else:
                middle = (low+high)/2
                todo.extend([(middle, high, depth+1), (low, middle, depth+1)])
        cells.sort(key=lambda x: x['start']); unresolved.sort()
        return dict(status='verified' if not unresolved else 'unknown', evaluations=evaluations,
                    cells=cells, unresolved=unresolved,
                    roundingModel='binary64-outward-2ulp/libm-endpoints-2ulp-assumed',
                    method='safe-AST/Taylor/adaptive-interval-domain')


def query_near_width(data):
    q = validate_near_width_query(data)
    kernel = NearWidthKernel(q)
    rows = []
    for i in range(q['segments']+1):
        s = q['parameterStart']+(q['parameterEnd']-q['parameterStart'])*i/q['segments']
        b, velocity, director, projection, rad, factor, outer, speed = kernel.evaluate(s)
        local_base, local_outer = [x.value for x in b], [x.value for x in outer]
        d = [x.value for x in director]
        perpendicular_squared = max(0., dot(d, d)-projection.value**2)
        rows.append(dict(s=s, normalizedBase=local_base, normalizedOuter=local_outer,
                         base=[kernel.origin[k]+kernel.scale*x for k, x in enumerate(local_base)],
                         outer=[kernel.origin[k]+kernel.scale*x for k, x in enumerate(local_outer)],
                         baseDerivative=[x.value*kernel.scale for x in velocity], director=d,
                         tangentProjection=projection.value, radicand=rad.value, scale=factor.value,
                         scaleDerivative=factor.c[1],
                         rulingLength=q['width']*factor.value*math.hypot(*d),
                         localPerpendicularDistance=abs(q['width'])*factor.value*math.sqrt(perpendicular_squared)))
    proof = kernel.proof()
    return dict(family='origamica-generic-near-width', query=q,
                source=dict(definitionCell='In[3871]', numericalDefinitionCell='In[3874]',
                            function='NearConstantWidthScale/NNearConstantWidthScale',
                            formula='1/sqrt(1-(normalize(bprime).d)^2)',
                            directorNormalized=False, wolframInterpolationReproduced=False,
                            machineReadableWolframOut=False),
                normalization=dict(origin=kernel.origin, scale=kernel.scale),
                certification=dict(fullDomainFormulaCertified=proof['status']=='verified',
                                   nearestFootDistanceChecked=False, paperRegularityChecked=False,
                                   globalInjectivityChecked=False, spatialDevelopabilityChecked=False,
                                   selfCollisionChecked=False, exactStraightCreaseFOLD=False,
                                   adoptableCreasePattern=False),
                proof=proof, sample=dict(rows=rows))
