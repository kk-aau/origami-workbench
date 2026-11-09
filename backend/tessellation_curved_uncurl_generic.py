"""Finite numeric Uncurl from Origamica In[3841]/In[3802]/In[3645].

This is the old thirteen-rule Darboux system joined with the old seven-rule
planar recovery.  U is neither normalized nor projected, the planar direction
uses only ArcTan(initialTangent), and every integral is anchored at parameter 0.
Undefined source rules remain present.  Numeric samples are not exact symbolic
Mathematica objects, a continuous-domain proof, or an adoptable crease pattern.
"""
import ast
import copy
import math
from fractions import Fraction

from scipy.integrate import solve_ivp

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError
from tessellation_curved_discretization_generic import (
    GenericDiscretizationError, _parts, _evaluate,
)
from tessellation_curved_uncurl_identity import prove_uncurl_straight_identity

FAMILY = 'uncurl-generic-native'
RESULT_FAMILY = 'origamica-generic-uncurl'
RULE_ORDER_3D = [
    'Speed3D', 'Curvature3D', 'Torsion3D', 'NormalCurvature3D',
    'GeodesicCurvature3D', 'FrenetDarbouxAngle', 'GeodesicTorsion3D',
    'Curve3D', 'TangentVector3D', 'NormalVector3D', 'BinormalVector3D',
    'SurfaceNormalVector3D', 'TangentNormalVector3D',
]
RULE_ORDER_2D = [
    'Curve2D', 'Speed2D', 'LeftCurvature2D', 'Curvature2D',
    'TangentVector2D', 'LeftNormalVector2D', 'NormalVector2D',
]
RULE_ORDER = RULE_ORDER_3D + RULE_ORDER_2D
FIELDS = {'family', 'curve', 'normal', 'parameterStart', 'parameterEnd',
          'segments', 'initialPoint', 'initialTangent'}
LIMITS = {
    'maximumSourceCharacters': 240, 'maximumSourceAstNodes': 96,
    'maximumDerivedAstNodes': 8192, 'maximumParameterMagnitude': 10.,
    'minimumDisplayedSpan': .01, 'maximumDisplayedSpan': 12.,
    'minimumSegments': 8, 'maximumSegments': 128,
    'maximumInitialCoordinateMagnitude': 1e12,
    'maximumScalarEvaluations': 524288,
    'maximumAstWeightedEvaluations': 16000000,
    'maximumOffsetProducts': 262144, 'maximumIntegrationEvaluations': 24000,
}
RTOL, ATOL = 2e-12, 2e-14
PRESET = {
    'family': FAMILY, 'curve': ['sin(s)', '1-cos(s)', '0'],
    'normal': ['0', '0', '1'], 'parameterStart': -.5,
    'parameterEnd': .5, 'segments': 32,
    'initialPoint': [0., 0.], 'initialTangent': [1., 0.],
}


class GenericUncurlError(GenericDiscretizationError):
    def __init__(self, code, message, *, details=None):
        # The compensated scalar evaluator explicitly propagates this error
        # class before its broad ValueError→undefined conversion.  Otherwise
        # a real work-budget refusal could be mistaken for a source singularity.
        super().__init__(code, message, details=details)


def _fail(code, message, **details):
    raise GenericUncurlError(code, message, details=details)


def _finite(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def validate_uncurl_generic_query(data):
    if not isinstance(data, dict) or set(data) != FIELDS or data.get('family') != FAMILY:
        _fail('input-contract', '旧式Uncurl须提供完整字段，不接受额外初始参数或符号options。')
    for key in ('curve', 'normal'):
        if not isinstance(data[key], list) or len(data[key]) != 3:
            _fail('input-contract', '曲线与原法向各须为三个同参s安全标量源。')
        for source in data[key]:
            Expression(source, 's')
    a, b = data['parameterStart'], data['parameterEnd']
    if any(not _finite(s) or abs(s) > LIMITS['maximumParameterMagnitude'] for s in (a, b)):
        _fail('finite-input-budget', '显示参数须为−10至10的有限实数；此为本地预算。')
    if not LIMITS['minimumDisplayedSpan'] <= b-a <= LIMITS['maximumDisplayedSpan']:
        _fail('finite-input-budget', '显示区间须递增，跨度为0.01至12；积分仍从固定0开始。')
    if type(data['segments']) is not int or not LIMITS['minimumSegments'] <= data['segments'] <= LIMITS['maximumSegments']:
        _fail('finite-input-budget', '分段数须为8至128的整数；此为本地采样预算。')
    for key in ('initialPoint', 'initialTangent'):
        vector = data[key]
        if not isinstance(vector, list) or len(vector) != 2 or any(
                not _finite(x) or abs(x) > LIMITS['maximumInitialCoordinateMagnitude'] for x in vector):
            _fail('finite-input-budget', '二维初值须为绝对值不超过10¹²的有限坐标。')
    q = copy.deepcopy(data)
    q['parameterStart'], q['parameterEnd'] = float(a), float(b)
    q['initialPoint'] = [float(x) for x in q['initialPoint']]
    q['initialTangent'] = [float(x) for x in q['initialTangent']]
    return q


class _Budget:
    def __init__(self):
        self.scalar_evaluations = self.ast_weighted_evaluations = 0
        self.offset_products = self.integration_evaluations = 0

    def charge(self, expression):
        self.scalar_evaluations += 1
        self.ast_weighted_evaluations += sum(1 for _ in ast.walk(expression.tree))
        if (self.scalar_evaluations > LIMITS['maximumScalarEvaluations'] or
                self.ast_weighted_evaluations > LIMITS['maximumAstWeightedEvaluations']):
            _fail('evaluation-budget', '旧式Uncurl超出实际标量或AST加权求值预算。')

    def charge_offset_products(self, left_count, right_count):
        requested = left_count * right_count
        if requested > LIMITS['maximumOffsetProducts'] - self.offset_products:
            _fail('evaluation-budget', '补偿常数展开超出全查询乘积预算；未创建超限列表。',
                  requestedOffsetProducts=requested, offsetProductsUsed=self.offset_products)
        self.offset_products += requested

    def charge_integration(self):
        self.integration_evaluations += 1
        if self.integration_evaluations > LIMITS['maximumIntegrationEvaluations']:
            _fail('integration-budget', '固定0积分超出24000次方程求值预算。')

    def report(self):
        return {'scalarEvaluations': self.scalar_evaluations,
                'astWeightedEvaluations': self.ast_weighted_evaluations,
                'offsetProducts': self.offset_products,
                'integrationEvaluations': self.integration_evaluations}


def _constant_fold(expression, budget):
    """Only variable-free, real-finite subtrees; no s-s or radical identities."""
    class Fold(ast.NodeTransformer):
        def visit(self, node):
            constant_candidate = isinstance(node, (ast.BinOp, ast.UnaryOp, ast.Call)) or (
                isinstance(node, ast.Name) and node.id in ('pi', 'e'))
            if constant_candidate and not any(
                    isinstance(child, ast.Name) and child.id == 's' for child in ast.walk(node)):
                part = object.__new__(Expression)
                part.tree, part.source, part.variable = node, expression.source, 's'
                try:
                    return ast.copy_location(ast.Constant(value=_evaluate(part, 0., budget)), node)
                except GenericDiscretizationError as error:
                    if error.code != 'source-undefined':
                        raise
                    # Do not recursively round a maximal constant subtree:
                    # (1e9+1e-8-1e9) must retain the original compensated sum.
                    return node
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
                # The safe grammar stores a signed integer exponent AST;
                # folding its unary minus to a float would invalidate **-1.
                node.left = self.visit(node.left)
                return node
            return super().visit(node)
    result = object.__new__(Expression)
    result.tree = Fold().visit(copy.deepcopy(expression.tree))
    result.source, result.variable = expression.source, expression.variable
    return result


def _compile_sources(q, budget):
    systems = []
    for key, order in (('curve', 3), ('normal', 1)):
        components = []
        for source in q[key]:
            expression = _constant_fold(Expression(source, 's'), budget)
            derivatives = [expression]
            for _ in range(order):
                expression = expression.derivative()
                if sum(1 for _ in ast.walk(expression.tree)) > LIMITS['maximumDerivedAstNodes']:
                    _fail('derivative-budget', '安全源的导数AST超出8192节点；未执行超限求值。')
                derivatives.append(expression)
            components.append(derivatives)
        systems.append(components)
    return systems


def _value(expression, s, budget):
    try:
        return _evaluate(expression, s, budget)
    except GenericDiscretizationError as error:
        if error.code != 'source-undefined':
            raise
        return None


def _jets(components, s, budget):
    vectors = [[] for _ in components[0]]
    for derivatives in components:
        value = _value(derivatives[0], s, budget)
        vectors[0].append(value)
        # A formal derivative of log(s), for example, must not turn a source
        # outside its real domain into a valid higher-order source jet.
        for i, derivative in enumerate(derivatives[1:], 1):
            vectors[i].append(_value(derivative, s, budget) if value is not None else None)
    return vectors


def _vector(value):
    return value if all(x is not None and math.isfinite(x) for x in value) else None


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _scaled(a, k):
    return [x*k for x in a]


def _safe(operation):
    try:
        value = operation()
        if isinstance(value, list):
            return _vector(value)
        return value if value is not None and math.isfinite(value) else None
    except (ValueError, OverflowError, ZeroDivisionError):
        return None


def _fraction_vector(vector):
    return [Fraction.from_float(float(value)) for value in vector]


def _fraction_dot(a, b):
    return sum((x*y for x, y in zip(a, b)), Fraction(0))


def _source_rules(curve_jets, normal_jets, *, straight_identity=False):
    c, cp, cpp, cppp = map(_vector, curve_jets)
    u, up = map(_vector, normal_jets)
    rules = {key: None for key in RULE_ORDER_3D}
    rules['Curve3D'], rules['SurfaceNormalVector3D'] = c, u
    if cp is None:
        return rules
    v = _safe(lambda: math.hypot(*cp))
    rules['Speed3D'] = v
    if v is None or v == 0:
        return rules
    t = _safe(lambda: [x/v for x in cp])
    rules['TangentVector3D'] = t
    if t is None:
        return rules
    if u is not None:
        rules['TangentNormalVector3D'] = _safe(lambda: _cross(u, t))
    if cpp is None:
        return rules
    # Exactly accumulate products of the binary64 source jets, before common
    # positive speed scaling.  This is fixed-size rational arithmetic (at most
    # three 1074-bit dyadics per product), not symbolic source simplification.
    # It preserves exact zero for proportional jets and symmetric triple
    # products; neither an epsilon cutoff nor normalized-vector cancellation
    # may manufacture a Frenet frame or change Sign[kg].
    fcp, fcpp, fv = _fraction_vector(cp), _fraction_vector(cpp), Fraction.from_float(v)
    fv2, fv3 = fv*fv, fv*fv*fv
    # Exact rounded jets alone cannot prove the original source's identity:
    # at s=.1 the independently rounded 2s/4s/6s are no longer proportional.
    # A bounded AST rational identity is used only after all original low
    # source jets exist and speed is positive; it never repairs a source pole.
    w = [Fraction(0)]*3 if straight_identity and c is not None else _cross(fcp, fcpp)
    w2 = _fraction_dot(w, w)
    curvature_vector = _safe(lambda: [float(value/fv3) for value in w])
    rules['Curvature3D'] = _safe(lambda: math.hypot(*curvature_vector)) if curvature_vector is not None else None
    if w2:
        maximum = max(abs(value) for value in w)
        direction = [float(value/maximum) for value in w]
        magnitude = math.hypot(*direction)
        b = [value/magnitude for value in direction]
        rules['BinormalVector3D'] = b
        rules['NormalVector3D'] = _safe(lambda: _cross(b, t))
    fcppp = _fraction_vector(cppp) if cppp is not None else None
    tau_fraction = _fraction_dot(w, fcppp)/w2 if fcppp is not None and w2 else None
    if tau_fraction is not None:
        rules['Torsion3D'] = _safe(lambda: float(tau_fraction))
    if u is None:
        return rules
    fu = _fraction_vector(u)
    numerator_n = _fraction_dot(fcpp, fu)
    numerator_g = _fraction_dot(fu, w)
    kn = _safe(lambda: float(numerator_n/fv2))
    kg = _safe(lambda: float(numerator_g/fv3))
    rules['NormalCurvature3D'], rules['GeodesicCurvature3D'] = kn, kg
    if kn is not None and kg is not None and (kn != 0 or kg != 0):
        rules['FrenetDarbouxAngle'] = math.atan2(kn, kg)
    if fcppp is None or up is None or not w2 or tau_fraction is None:
        return rules
    fup = _fraction_vector(up)
    derivative_n = _fraction_dot(fcppp, fu)+_fraction_dot(fcpp, fup)
    derivative_g = _fraction_dot(fup, w)+_fraction_dot(fu, _cross(fcp, fcppp))
    speed_product = _fraction_dot(fcp, fcpp)
    # Literal old tauG with N=C''.U, G=U.(C'xC''), D=C'.C'', W=C'xC'':
    # (kg kn'-kn kg')/(kappa²*v)
    #   = (G*N'-N*G' + G*N*D/v²)/|W|².
    # Evaluate this equal rational expression before returning binary64.  It
    # avoids both squared physical curvature overflow and zero-sign drift.
    correction = (numerator_g*derivative_n-numerator_n*derivative_g+
                  numerator_g*numerator_n*speed_product/fv2)/w2
    rules['GeodesicTorsion3D'] = _safe(lambda: float(tau_fraction-correction))
    return rules


def _source_point(compiled, s, budget, *, straight_identity=False):
    cj, uj = [_jets(components, s, budget) for components in compiled]
    return {'sourceJets': {'curve': cj, 'normal': uj},
            'rules': _source_rules(cj, uj, straight_identity=straight_identity)}


def _relative_source(compiled, s, origin_parts, scale, budget):
    if origin_parts is None:
        return None
    try:
        parts = [_parts(component[0], s, budget) for component in compiled[0]]
        return _vector([math.fsum([*c, *[-x for x in c0], d, -d0])/scale
                        for (c, d), (c0, d0) in zip(parts, origin_parts)])
    except GenericDiscretizationError as error:
        if error.code != 'source-undefined':
            raise
        return None
    except (ValueError, OverflowError, ZeroDivisionError):
        return None


def _integrate(compiled, ends, angle0, recovered_scale, budget, *, straight_identity=False):
    branches = []
    for direction, end in ((-1, min(ends)), (1, max(ends))):
        if end == 0:
            continue
        metadata = {'direction': direction, 'endParameter': end, 'status': 'undefined',
                    'code': None, 'message': None, 'evaluations': 0}
        branch = {'metadata': metadata, 'solution': None}
        if angle0 is None:
            metadata.update(code='initial-angle-undefined', message='原ArcTan[0,0]未定义，不能补造恢复方向。')
            branches.append(branch)
            continue
        started = budget.integration_evaluations

        def rhs(s, state):
            budget.charge_integration()
            source = _source_point(compiled, float(s), budget, straight_identity=straight_identity)
            v, kg = source['rules']['Speed3D'], source['rules']['GeodesicCurvature3D']
            if v is None or kg is None:
                _fail('recovery-source-undefined', '固定0积分路径的原速度或测地曲率未定义。', parameter=float(s))
            value = _safe(lambda: [v*kg, v/recovered_scale*math.cos(state[0]),
                                   v/recovered_scale*math.sin(state[0])])
            if value is None:
                _fail('recovery-source-undefined', '原恢复方程超出有限实数范围。', parameter=float(s))
            return value

        try:
            solution = solve_ivp(rhs, (0., end), [angle0, 0., 0.], method='DOP853',
                                 rtol=RTOL, atol=ATOL, dense_output=True,
                                 max_step=abs(end)/32)
            if not solution.success:
                metadata.update(code='integration-failed', message=solution.message)
            elif not all(math.isfinite(float(x)) for x in solution.y.flat):
                metadata.update(code='integration-nonfinite', message='固定0积分产生非有限数值。')
            else:
                metadata['status'] = 'ready'
                branch['solution'] = solution
        except GenericUncurlError as error:
            # Hard work limits abort the query, not a manufactured undefined rule.
            if error.code in ('evaluation-budget', 'integration-budget', 'derivative-budget'):
                raise
            metadata.update(code=error.code, message=str(error), **error.details)
        metadata['evaluations'] = budget.integration_evaluations-started
        branches.append(branch)
    return branches


def generate_uncurl_generic_query(data):
    q = validate_uncurl_generic_query(data)
    budget = _Budget()
    compiled = _compile_sources(q, budget)
    straight_identity = prove_uncurl_straight_identity(compiled[0]) is True
    a, b, n = q['parameterStart'], q['parameterEnd'], q['segments']
    parameters = [a+(b-a)*i/n for i in range(n+1)]
    parameters[-1] = b
    sampled = [_source_point(compiled, s, budget, straight_identity=straight_identity) for s in parameters]
    origin_parts = None
    try:
        origin_parts = [_parts(component[0], 0., budget) for component in compiled[0]]
        source_origin = _vector([math.fsum([*c, d]) for c, d in origin_parts])
        if source_origin is None:
            origin_parts = None
    except GenericDiscretizationError as error:
        if error.code != 'source-undefined':
            raise
        source_origin = None
    except (ValueError, OverflowError):
        source_origin = None
    relative = [_relative_source(compiled, s, origin_parts, 1., budget) for s in parameters]
    max_speed = max((row['rules']['Speed3D'] or 0. for row in sampled), default=0.)
    integration_interval = [min(a, 0.), max(b, 0.)]
    path_span = integration_interval[1]-integration_interval[0]
    source_scale = _safe(lambda: max([math.hypot(*point) for point in relative if point is not None]
                                    + [max_speed*(b-a)]))
    recovered_scale = _safe(lambda: max_speed*path_span)
    if source_scale is None or recovered_scale is None:
        _fail('normalization-scale', '显示或固定0积分尺度超出有限binary64范围；不把非有限尺度伪装为1。')
    source_scale, recovered_scale = source_scale or 1., recovered_scale or 1.
    initial = q['initialTangent']
    angle0 = math.atan2(initial[1], initial[0]) if any(initial) else None
    branches = _integrate(compiled, integration_interval, angle0, recovered_scale, budget, straight_identity=straight_identity)
    rows = []
    for s, source, relative_point in zip(parameters, sampled, relative):
        angle = normalized_recovered = recovered = None
        if s == 0 and angle0 is not None:
            angle, normalized_recovered, recovered = angle0, [0., 0.], q['initialPoint'].copy()
        else:
            branch = next((item for item in branches if item['metadata']['direction'] == (-1 if s < 0 else 1)), None)
            if branch is not None and branch['solution'] is not None:
                state = branch['solution'].sol(s)
                angle = _safe(lambda: float(state[0]))
                normalized_recovered = _safe(lambda: [float(x) for x in state[1:]])
                if normalized_recovered is not None:
                    recovered = _safe(lambda: [math.fsum([x, recovered_scale*y])
                                               for x, y in zip(q['initialPoint'], normalized_recovered)])
        rules = source['rules']
        v, kg = rules['Speed3D'], rules['GeodesicCurvature3D']
        t2 = [math.cos(angle), math.sin(angle)] if angle is not None else None
        l2 = [-t2[1], t2[0]] if t2 is not None else None
        n2 = _scaled(l2, 1. if kg > 0 else -1. if kg < 0 else 0.) if l2 is not None and kg is not None else None
        rules.update({'Curve2D': recovered, 'Speed2D': v, 'LeftCurvature2D': kg,
                      'Curvature2D': abs(kg) if kg is not None else None,
                      'TangentVector2D': t2, 'LeftNormalVector2D': l2, 'NormalVector2D': n2})
        undefined = [{'key': key, 'code': 'recovery-undefined' if key in
                      ('Curve2D', 'TangentVector2D', 'LeftNormalVector2D', 'NormalVector2D')
                      else 'source-rule-undefined'} for key in RULE_ORDER if rules[key] is None]
        jet_undefined = [{'system': system, 'order': order, 'component': component,
                          'code': 'source-jet-undefined'}
                         for system, jets in source['sourceJets'].items()
                         for order, vector in enumerate(jets)
                         for component, value in enumerate(vector) if value is None]
        rows.append({'s': s, 'rules': rules, 'sourceJets': source['sourceJets'],
                     'sourceCurve': rules['Curve3D'],
                     'normalizedSourceCurve': _safe(lambda: [x/source_scale for x in relative_point]) if relative_point is not None else None,
                     'recoveredCurve': recovered, 'normalizedRecoveredCurve': normalized_recovered,
                     'angle2D': angle, 'undefined': undefined, 'undefinedSourceJets': jet_undefined})
    ready_count = sum(branch['metadata']['status'] == 'ready' for branch in branches)
    recovery_status = 'ready' if ready_count == len(branches) and angle0 is not None else 'partial' if ready_count else 'undefined'
    return {
        'family': RESULT_FAMILY, 'query': q,
        'source': {'functions': ['UncurlCurveInDevelopableSystem', 'Darboux3DSystemOld', 'RecoverCurve2DSystemOld'],
                   'definitionCells': ['In[3841]', 'In[3802]', 'In[3645]'],
                   'ruleOrder': RULE_ORDER.copy(), 'wolframNumericOutAvailable': False,
                   'simplification': 'None', 'assumptions': [],
                   'sourceJetsConvention': 'physical-derivatives',
                   'expressionDerivativeConvention': 'safe-ast-chain-rule-constant-only-folding'},
        'normalization': {'sourceOrigin': source_origin, 'sourceScale': source_scale,
                          'recoveredOrigin': q['initialPoint'].copy(), 'recoveredScale': recovered_scale,
                          'anchorParameter': 0.,
                          'sourceScaleConvention': 'max-sampled-relative-radius-or-displayed-speed-span-or-one',
                          'recoveredScaleConvention': 'sampled-maximum-speed-times-full-integration-span-or-one'},
        'sample': {'parameters': parameters, 'rows': rows},
        'domain': {'requestedInterval': [a, b], 'integrationInterval': integration_interval,
                   'anchorParameter': 0., 'recoveryStatus': recovery_status,
                   'branches': [branch['metadata'] for branch in branches],
                   'continuousDomainCertified': False},
        'limits': copy.deepcopy(LIMITS),
        'diagnostics': {'initialTangentAngle': angle0,
                        'initialTangentMagnitude': math.hypot(*initial),
                        'initialTangentMagnitudePreserved': False,
                        'sourceNormalNormalized': False, 'sourceNormalOrthogonalized': False,
                        'undefinedRuleCount': sum(len(row['undefined']) for row in rows),
                        'undefinedSourceJetCount': sum(len(row['undefinedSourceJets']) for row in rows),
                        'budget': budget.report(),
                        'integrationMethod': 'DOP853', 'relativeTolerance': RTOL, 'absoluteTolerance': ATOL},
        'certification': {'allSampledSourceValuesFinite': all(row['sourceCurve'] is not None and
                          row['rules']['SurfaceNormalVector3D'] is not None for row in rows),
                          'allSampledRulesFinite': all(not row['undefined'] for row in rows),
                          'allSampledRecoveredPointsFinite': all(row['recoveredCurve'] is not None for row in rows),
                          'sourceFormulaEvaluated': True, 'originalRuleOrderPreserved': True,
                          'recoveryFixedAtParameterZero': True, 'rawSurfaceNormalPreserved': True,
                          'initialTangentDirectionOnly': True, 'continuousDomainCertified': False,
                          'integrationErrorIntervalCertified': False,
                          'symbolicObjectsReproduced': False, 'wolframOptionsReproduced': False,
                          'exactStraightCreaseFOLD': False, 'adoptableCreasePattern': False,
                          'globalFoldingCertified': False},
    }
