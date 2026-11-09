"""External Curve2DSystems descriptions for the verified same-source subset.

These ordered rules are supplied by the caller and actually replace native
frame/coefficient evaluation. Original Wolfram arbitrary rules/interpolation
objects are a wider contract. No imported frame is normalized or repaired.
"""
import ast
import copy
import math
import sympy as sp

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError, Taylor
from tessellation_curved_linked_common_interval import Interval
from tessellation_curved_matched_pair_query import symbolic_node, simplified, algebraic_budget

RULES = ['Speed2D', 'LeftCurvature2D', 'TangentVector2D', 'LeftNormalVector2D']
SOURCE = {'function': 'Curve2DSystem', 'definitionCell': 'In[3627]',
          'subset': 'linked-required-rules/safe-expression'}


def error(code, text): raise GenericLinkedError(code, text)


def validate_curve(curve):
    if not isinstance(curve, dict) or set(curve) != {'x', 'y', 'parameterMin', 'parameterMax'}:
        error('cache-contract', '系统须绑定完整原生曲线与原生域。')
    a, b = curve['parameterMin'], curve['parameterMax']
    if any(type(x) not in (int, float) or not math.isfinite(x) for x in (a, b)) or not -20 <= a < b <= 20 or b-a < .02:
        error('cache-contract', '缓存原生域须在±20内且长度至少0.02。')
    Expression(curve['x'], 'u'); Expression(curve['y'], 'u')
    return copy.deepcopy(curve)


def symbolic(source, u):
    tree = copy.deepcopy(Expression(source, 'u').tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id == 'u': node.id = 's'
    if algebraic_budget(tree) > 24: error('cache-symbolic-budget', '缓存恒等核验超出有限代数预算。')
    return symbolic_node(tree, u)


def expected_rules(curve, u):
    p = [symbolic(curve[key], u) for key in ('x', 'y')]
    d = [sp.diff(x, u) for x in p]; dd = [sp.diff(x, u) for x in d]
    speed = sp.sqrt(sum(x*x for x in d)); t = [x/speed for x in d]
    curvature = (d[0]*dd[1]-d[1]*dd[0])/speed**3
    return [speed, curvature, t, [-t[1], t[0]]]


def source_text(node):
    if node.is_Integer: return str(node)
    if node.is_Rational: return f'({node.p}/{node.q})'
    if node == sp.pi: return 'pi'
    if node == sp.E: return 'e'
    if isinstance(node, sp.Symbol): return 'u'
    if isinstance(node, sp.Add): return '('+'+'.join(source_text(x) for x in node.args)+')'
    if isinstance(node, sp.Mul): return '('+'*'.join(source_text(x) for x in node.args)+')'
    if isinstance(node, sp.Pow):
        base, exponent = node.args
        if exponent.is_Integer and abs(exponent) <= 8: return '('+source_text(base)+')**'+str(exponent)
        if exponent.is_Rational and exponent.q == 2 and abs(exponent.p) <= 8:
            term = 'sqrt('+source_text(base)+')'
            return term if exponent.p == 1 else '('+term+')**'+str(exponent.p)
    if node.func in (sp.sin, sp.cos, sp.tan, sp.atan, sp.exp, sp.log):
        return node.func.__name__+'('+source_text(node.args[0])+')'
    error('cache-expression-budget', '预计算系统超出当前白名单表达式子域；没有替换原曲线。')


class IntervalJet(Taylor):
    @classmethod
    def constant(cls, value, order): return super().constant(Interval.cast(value), order)


def regular_rule_domain(curve, compiled, require_positive_speed=True):
    """Whole native-domain enclosure; algebraic cancellation cannot hide poles."""
    a, b = curve['parameterMin'], curve['parameterMax']
    stack = [(a, b, 0)]; visits = 0
    while stack:
        left, right, depth = stack.pop(); visits += 1
        if visits > 1023: error('cache-domain', '外部系统在完整原生域的正则性未证；保留原域并拒绝。')
        try:
            argument = IntervalJet.variable(Interval(left, right), 2)
            rows = [[f(argument) for f in group] for group in compiled]
            if require_positive_speed and Interval.cast(rows[0][0].value).lo <= 0: raise ValueError('speed sign unresolved')
        except (ValueError, ZeroDivisionError, OverflowError, GenericLinkedError):
            if depth >= 12: error('cache-domain', '外部系统在完整原生域含退化、未定义或未证区间。')
            mid = (left+right)/2
            stack.extend([(left, mid, depth+1), (mid, right, depth+1)])
    return visits


INDEPENDENT_SOURCE = {'function': 'Curve2DSystems', 'definitionCell': 'In[4076]',
                      'kind': 'caller-supplied-safe-rules/no-source-identity'}


def validate_independent_curve2d_system(system):
    """Original caller-supplied rule values; no source/frame identity test."""
    if not isinstance(system, dict) or set(system) != {'family', 'source', 'parameterDomain', 'rules'} or system['family'] != 'origamica-independent-curve2d-system':
        error('independent-rule-contract', '独立规则须使用独立描述类型，不接受同源缓存的身份替代。')
    if system['source'] != INDEPENDENT_SOURCE:
        error('independent-rule-source', '独立规则必须明确来自调用者，不能声明已证明同源的函数来源。')
    domain=system['parameterDomain']
    if not isinstance(domain,list) or len(domain)!=2 or any(type(x) not in (int,float) or not math.isfinite(x) for x in domain) or not -20<=domain[0]<domain[1]<=20 or domain[1]-domain[0]<.02:
        error('independent-rule-domain', '独立规则声明域须在±20内、长度至少0.02；原域保留，不自动外推。')
    rules=system['rules']
    if not isinstance(rules,list) or len(rules)!=4 or any(not isinstance(row,dict) or set(row)!={'key','expressions'} for row in rules) or any(row['key'] not in RULES for row in rules) or len(set(row['key'] for row in rules))!=4:
        error('independent-rule-contract', '独立规则须包含四个唯一原键；输入数组顺序完整保留。')
    by_key={row['key']:row for row in rules};compiled=[]
    for index,key in enumerate(RULES):
        expressions=by_key[key]['expressions']
        if not isinstance(expressions,list) or len(expressions)!=(1 if index<2 else 2):
            error('independent-rule-contract', '独立速度/曲率为标量，切向/左法向各为二维向量。')
        compiled.append([Expression(source,'u') for source in expressions])
    regular_rule_domain({'parameterMin':domain[0],'parameterMax':domain[1]},compiled,False)
    return copy.deepcopy(system),compiled


def validate_independent_curve2d_systems(systems, curves):
    if systems=='Automatic':return systems
    if not isinstance(systems,list) or len(systems)>min(3,len(curves)):
        error('independent-rule-contract', '独立系统须为Automatic或按折线顺序的前0–3项。')
    return [validate_independent_curve2d_system(system)[0] for system in systems]


def validate_curve2d_system(system, curve):
    if not isinstance(system, dict) or set(system) != {'family', 'source', 'curve', 'parameterDomain', 'rules'} or system['family'] != 'origamica-curve2d-system-description':
        error('cache-contract', '外部曲线系统描述类型或字段无效。')
    validate_curve(system['curve'])
    domain=system['parameterDomain']
    if not isinstance(domain,list) or len(domain)!=2 or any(type(x) not in (int,float) or not math.isfinite(x) for x in domain):
        error('cache-source', '外部系统原生域须为完整有限实数域，不接受布尔替代坐标。')
    if system['source'] != SOURCE or system['curve'] != curve or domain != [curve['parameterMin'], curve['parameterMax']]:
        error('cache-source', '外部系统来源、原生域或数组顺序与当前原曲线不匹配。')
    rules = system['rules']
    if not isinstance(rules, list) or len(rules) != 4:
        error('cache-contract', '外部系统须保留原关联调用使用的四个有序规则。')
    compiled = []
    for index, (row, key) in enumerate(zip(rules, RULES)):
        if not isinstance(row, dict) or set(row) != {'key', 'expressions'} or row['key'] != key or not isinstance(row['expressions'], list) or len(row['expressions']) != (1 if index < 2 else 2):
            error('cache-contract', '系统规则顺序、函数维数或字段无效。')
        compiled.append([Expression(source, 'u') for source in row['expressions']])
    u = sp.Symbol('u', real=True)
    try:
        expected = expected_rules(curve, u)
        for row, original in zip(rules, expected):
            original = original if isinstance(original, list) else [original]
            for source, exact in zip(row['expressions'], original):
                if simplified(symbolic(source, u)-exact) != 0:
                    error('cache-invariant', '外部系统规则与原曲线的速度、曲率或标架恒等式不相容；不归一化或替换。')
    except GenericLinkedError: raise
    except (ValueError, TypeError, RecursionError, NotImplementedError) as exc:
        raise GenericLinkedError('cache-symbolic-budget', '外部系统同源恒等性未在有限符号域内证明。') from exc
    regular_rule_domain(curve, compiled)
    return copy.deepcopy(system), compiled


def validate_curve2d_systems(systems, curves):
    if systems == 'Automatic': return 'Automatic'
    if not isinstance(systems, list) or len(systems) > 3 or len(systems) > len(curves):
        error('cache-contract', 'Curve2DSystems须为Automatic或按原曲线顺序的前0–3项系统。')
    return [validate_curve2d_system(system, curves[i])[0] for i, system in enumerate(systems)]


def precompute_curve2d_systems(data):
    if not isinstance(data, dict) or set(data) != {'family', 'curves'} or data['family'] != 'curve2d-systems-native' or not isinstance(data['curves'], list) or not 1 <= len(data['curves']) <= 3:
        error('cache-contract', '预计算输入须为1–3条完整原生曲线。')
    curves = [validate_curve(c) for c in data['curves']]; systems = []
    for curve in curves:
        expected = expected_rules(curve, sp.Symbol('u', real=True))
        system = {'family': 'origamica-curve2d-system-description', 'source': dict(SOURCE), 'curve': curve,
                  'parameterDomain': [curve['parameterMin'], curve['parameterMax']],
                  'rules': [{'key': key, 'expressions': [source_text(x) for x in (value if isinstance(value, list) else [value])]}
                            for key, value in zip(RULES, expected)]}
        validate_curve2d_system(system, curve); systems.append(system)
    return {'family': 'origamica-curve2d-systems', 'systems': systems,
            'proof': {'method': 'bounded-symbolic-formula-identity/native-domain-interval',
                      'sourceIdentitiesVerified': True, 'numericalInterpolationReproduced': False}}
