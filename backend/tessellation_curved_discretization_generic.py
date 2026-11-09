"""Finite numeric contracts for Origamica In[4087], In[4089], In[4092].

Standalone backend only: no dispatcher or public UI registration. Ordered
systems retain repeated keys and arbitrary sample order. Uniform discretization
solves the original chord equations in unconstrained parameter coordinates;
MINPACK's iteration path is not claimed equivalent to Mathematica FindRoot.
"""
import ast
import copy
import math

import numpy as np
from scipy.optimize import root

from tessellation_curved_generic_linked_expression import Expression, GenericLinkedError

FAMILY = 'discretization-generic-native'
RESULT_FAMILY = 'origamica-generic-discretization'
LIMITS = {
    'maximumRules': 64, 'maximumExpressionLeaves': 256,
    'maximumNestingDepth': 4, 'maximumListEntries': 256,
    'maximumStructureNodes': 2048, 'maximumParameters': 256,
    'maximumCurveDimension': 64, 'maximumDivisions': 64,
    'maximumFoldVertices': 512, 'maximumScalarEvaluations': 262144,
    'maximumAstWeightedEvaluations': 8000000, 'maximumRootEvaluations': 4096,
    'maximumOffsetProducts': 262144,
    'maximumSourceAstNodes': 96, 'maximumSourceCharacters': 240,
    'maximumParameterMagnitude': 1e6,
}
CHOP_TOLERANCE = 1e-10
RESIDUAL_TOLERANCE = 2e-10
FIELDS = {
    'system': {'family', 'mode', 'rules', 'parameters'},
    'uniform': {'family', 'mode', 'curve', 'divisions', 'parameterStart', 'parameterEnd'},
    'multipliers': {'family', 'mode', 'foldPoints', 'leftRulings', 'rightRulings'},
}
SOURCES = {
    'system': ('DiscretizeSystem', 'In[4087]'),
    'uniform': ('DiscretizeCurveUniformly', 'In[4089]'),
    'multipliers': ('FoldAngleMultipliers2D', 'In[4092]'),
}


class GenericDiscretizationError(GenericLinkedError):
    def __init__(self, code, message, *, details=None):
        self.details = details or {}
        super().__init__(code, message)


def _fail(code, message, **details):
    raise GenericDiscretizationError(code, message, details=details)


def _finite(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        # JSON integers have arbitrary precision, unlike the binary64 contract.
        return False


def _parameter(value):
    if not _finite(value) or abs(value) > LIMITS['maximumParameterMagnitude']:
        _fail('finite-input-budget', '参数须为绝对值不超过10⁶的有限实数；此为本地预算。')
    return float(value)


def validate_discretization_generic_query(data):
    if not isinstance(data, dict) or not isinstance(data.get('mode'), str) or data['mode'] not in FIELDS:
        _fail('input-contract', '一般离散化模式无效。')
    if set(data) != FIELDS[data['mode']] or data['family'] != FAMILY:
        _fail('input-contract', '一般离散化须提供当前模式全部字段，且不接受额外字段。')
    # Validate bounded structure before recursively copying user lists.
    q = dict(data)
    if q['mode'] == 'system':
        rules, parameters = q['rules'], q['parameters']
        if not isinstance(rules, list) or len(rules) > LIMITS['maximumRules']:
            _fail('finite-input-budget', '规则须为不超过64条的有序列表。')
        if not isinstance(parameters, list) or len(parameters) > LIMITS['maximumParameters']:
            _fail('finite-input-budget', '采样须为不超过256项的列表，可重复或乱序。')
        q['parameters'] = [_parameter(x) for x in parameters]
        nodes = leaves = 0

        def visit(value, depth):
            nonlocal nodes, leaves
            nodes += 1
            if nodes > LIMITS['maximumStructureNodes'] or depth > LIMITS['maximumNestingDepth']:
                _fail('finite-input-budget', '规则结构超出2048节点或4层列表预算。')
            if isinstance(value, list):
                if len(value) > LIMITS['maximumListEntries']:
                    _fail('finite-input-budget', '单层列表超出256项预算。')
                for child in value:
                    visit(child, depth + 1)
            else:
                Expression(value, 's')
                leaves += 1
                if leaves > LIMITS['maximumExpressionLeaves']:
                    _fail('finite-input-budget', '所有规则合计超过256个标量源。')

        for rule in rules:
            if not isinstance(rule, dict) or set(rule) != {'key', 'expression'} or not isinstance(rule['key'], str) or not 1 <= len(rule['key']) <= 128:
                _fail('input-contract', '每条规则须为key字符串与expression；重复key保留。')
            visit(rule['expression'], 0)
        if leaves * len(parameters) > LIMITS['maximumScalarEvaluations']:
            _fail('finite-input-budget', '源标量数乘采样数超出求值预算。')
    elif q['mode'] == 'uniform':
        if not isinstance(q['curve'], list) or not 1 <= len(q['curve']) <= LIMITS['maximumCurveDimension']:
            _fail('finite-input-budget', '曲线须为1–64维安全标量源；64为本地预算。')
        for text in q['curve']:
            Expression(text, 's')
        if type(q['divisions']) is not int or not 1 <= q['divisions'] <= LIMITS['maximumDivisions']:
            _fail('finite-input-budget', '分段数须为1–64的整数；64为本地预算。')
        q['parameterStart'] = _parameter(q['parameterStart'])
        q['parameterEnd'] = _parameter(q['parameterEnd'])
        if q['parameterStart'] == q['parameterEnd']:
            _fail('input-contract', '当前数值求根需要不同端点；不把零跨度伪装成有效采样。')
    else:
        points = q['foldPoints']
        if not isinstance(points, list) or not 2 <= len(points) <= LIMITS['maximumFoldVertices']:
            _fail('finite-input-budget', '二维折线须有2–512个顶点。')
        for key in ('foldPoints', 'leftRulings', 'rightRulings'):
            values = q[key]
            if not isinstance(values, list) or len(values) != len(points):
                _fail('input-contract', '左右向量列表须与折线点数相同。')
            if any(not isinstance(v, list) or len(v) != 2 or any(not _finite(x) or abs(x) > 1e150 for x in v) for v in values):
                _fail('finite-input-budget', '顶点与方向须为绝对值不超过10¹⁵⁰的有限二维坐标。')
            q[key] = [[float(x) for x in v] for v in values]
    return copy.deepcopy(q)


class _Budget:
    def __init__(self):
        self.scalar_evaluations = 0
        self.ast_weighted_evaluations = 0
        self.offset_products = 0

    def charge(self, expression):
        self.scalar_evaluations += 1
        self.ast_weighted_evaluations += sum(1 for _ in ast.walk(expression.tree))
        if self.scalar_evaluations > LIMITS['maximumScalarEvaluations'] or self.ast_weighted_evaluations > LIMITS['maximumAstWeightedEvaluations']:
            _fail('evaluation-budget', '一般离散化超出标量或AST加权求值预算。')

    def charge_offset_products(self, left_count, right_count):
        products = left_count * right_count
        if products > LIMITS['maximumOffsetProducts'] - self.offset_products:
            _fail('evaluation-budget', '补偿常数展开超出实际乘积预算；未创建超限乘积列表。',
                  offsetProductsUsed=self.offset_products, requestedOffsetProducts=products,
                  offsetProductLimit=LIMITS['maximumOffsetProducts'])
        self.offset_products += products

    def report(self):
        return {'scalarEvaluations': self.scalar_evaluations,
                'astWeightedEvaluations': self.ast_weighted_evaluations,
                'offsetProducts': self.offset_products}


def _parts(expression, parameter, budget):
    """Real scalar AST with compensated additive offsets, without derivatives.

    Unlike a positive-order jet this permits sqrt(0) when only its value is
    requested. Derivatives are separately generated from the same safe AST.
    """
    budget.charge(expression)

    def total(parts):
        offsets, dynamic = parts
        return math.fsum([*offsets, dynamic])

    def multiply(a, b):
        # An AST power can expand a short constant source exponentially.
        # Reserve all actual products before materializing the Cartesian list;
        # the reservation is cumulative across rules, samples and root probes.
        budget.charge_offset_products(len(a[0]), len(b[0]))
        offsets = [x*y for x in a[0] for y in b[0]]
        if len(offsets) > 256:
            offsets = [math.fsum(offsets)]
        dynamic = math.fsum([math.fsum(a[0])*b[1], math.fsum(b[0])*a[1], a[1]*b[1]])
        return offsets, dynamic

    def visit(node):
        if isinstance(node, ast.Constant):
            return [float(node.value)], 0.
        if isinstance(node, ast.Name):
            return ([], parameter) if node.id == 's' else ([math.pi if node.id == 'pi' else math.e], 0.)
        if isinstance(node, ast.UnaryOp):
            constants, dynamic = visit(node.operand)
            return ([-x for x in constants], -dynamic) if isinstance(node.op, ast.USub) else (constants, dynamic)
        if isinstance(node, ast.BinOp):
            a = visit(node.left)
            if isinstance(node.op, ast.Pow):
                exponent = Expression._integer(node.right)
                if exponent < 0:
                    return [], total(a)**exponent
                result = ([1.], 0.)
                for _ in range(exponent):
                    result = multiply(result, a)
                return result
            b = visit(node.right)
            if isinstance(node.op, ast.Add):
                return a[0]+b[0], math.fsum([a[1], b[1]])
            if isinstance(node.op, ast.Sub):
                return a[0]+[-x for x in b[0]], math.fsum([a[1], -b[1]])
            if isinstance(node.op, ast.Mult):
                return multiply(a, b)
            denominator = total(b)
            if b[1] == 0:
                return [x/denominator for x in a[0]], a[1]/denominator
            return [], total(a)/denominator
        return [], getattr(math, node.func.id)(total(visit(node.args[0])))

    try:
        result = visit(expression.tree)
        if any(not math.isfinite(x) for x in [*result[0], result[1]]):
            raise ValueError('nonfinite real')
        return result
    except GenericDiscretizationError:
        # Budget exhaustion is a hard refusal, never an undefined source atom.
        raise
    except (ValueError, OverflowError, ZeroDivisionError) as cause:
        raise GenericDiscretizationError('source-undefined', '源在所求参数处无有限实数值。', details={'parameter': parameter}) from cause


def _evaluate(expression, parameter, budget):
    offsets, dynamic = _parts(expression, parameter, budget)
    try:
        value = math.fsum([*offsets, dynamic])
    except OverflowError as cause:
        raise GenericDiscretizationError('source-undefined', '源求值超出有限实数范围。') from cause
    if not math.isfinite(value):
        _fail('source-undefined', '源求值超出有限实数范围。')
    return value


def _sample_system(q, budget):
    undefined = []

    def compile_tree(value):
        return [compile_tree(child) for child in value] if isinstance(value, list) else Expression(value, 's')

    def evaluate_tree(tree, s, rule_index, sample_index, path):
        if isinstance(tree, list):
            return [evaluate_tree(child, s, rule_index, sample_index, path+[i]) for i, child in enumerate(tree)]
        try:
            return _evaluate(tree, s, budget)
        except GenericDiscretizationError as error:
            if error.code != 'source-undefined':
                raise
            undefined.append({'ruleIndex': rule_index, 'sampleIndex': sample_index, 'path': path,
                              'parameter': s, 'state': 'not-finite-real', 'code': error.code})
            return None

    rules = []
    for i, rule in enumerate(q['rules']):
        tree = compile_tree(rule['expression'])
        rules.append({'key': rule['key'], 'values': [evaluate_tree(tree, s, i, j, []) for j, s in enumerate(q['parameters'])]})
    return {'parameters': q['parameters'], 'rules': rules, 'undefined': undefined,
            'allSamplesFiniteReal': not undefined, 'ruleOrderPreserved': True,
            'parameterOrderPreserved': True, 'budget': budget.report()}


def _constant_folded_derivative(expression, budget):
    """Fold only syntactically parameter-free finite subtrees before d/ds.

    Keep the source evaluator and source AST unchanged. This permits the
    derivative of sqrt(0) as a constant, without inferring that sqrt(s-s) or
    sqrt(s**4) is regular from values at a few samples.
    """
    def folded(node):
        if isinstance(node, ast.Constant):
            return copy.deepcopy(node)
        if not any(isinstance(child, ast.Name) and child.id == 's' for child in ast.walk(node)):
            part = object.__new__(Expression)
            part.source, part.variable, part.tree = expression.source, 's', node
            return ast.Constant(value=_evaluate(part, 0., budget))
        if isinstance(node, ast.Name):
            return copy.deepcopy(node)
        if isinstance(node, ast.UnaryOp):
            return ast.UnaryOp(op=copy.deepcopy(node.op), operand=folded(node.operand))
        if isinstance(node, ast.BinOp):
            # Exponents remain exact integer AST literals, including -2.
            return ast.BinOp(left=folded(node.left), op=copy.deepcopy(node.op),
                             right=copy.deepcopy(node.right) if isinstance(node.op, ast.Pow) else folded(node.right))
        return ast.Call(func=copy.deepcopy(node.func), args=[folded(node.args[0])], keywords=[])
    local = object.__new__(Expression)
    local.source, local.variable, local.tree = expression.source, expression.variable, folded(expression.tree)
    return local.derivative()


def _uniform_curve(q, budget):
    expressions = [Expression(text, 's') for text in q['curve']]
    derivatives = [_constant_folded_derivative(expression, budget) for expression in expressions]
    a, b, n = q['parameterStart'], q['parameterEnd'], q['divisions']
    initial = [a+(b-a)*i/n for i in range(n+1)]
    initial[-1] = b
    origin_parts = [_parts(expression, a, budget) for expression in expressions]
    origin = [math.fsum([*constants, dynamic]) for constants, dynamic in origin_parts]

    def relative_point(s):
        _parameter(s)
        parts = [_parts(expression, s, budget) for expression in expressions]
        return [math.fsum([*c, *[-x for x in c0], d, -d0]) for (c, d), (c0, d0) in zip(parts, origin_parts)]

    relative_initial = [relative_point(s) for s in initial]
    scale = max((math.hypot(*p) for p in relative_initial), default=0.) or 1.
    if not math.isfinite(scale):
        _fail('source-scale', '曲线尺度超出有限数值范围。')
    evaluations = 0

    def equations(interior, detail=False):
        nonlocal evaluations
        evaluations += 1
        if evaluations > LIMITS['maximumRootEvaluations']:
            _fail('root-budget', '无约束参数求根超出4096次方程求值预算。')
        ts = [a, *[float(t) for t in interior], b]
        points = [[x/scale for x in relative_point(t)] for t in ts]
        chords = [[v-u for u, v in zip(p, r)] for p, r in zip(points, points[1:])]
        lengths = [math.hypot(*v) for v in chords]
        if n > 1 and any(length == 0 or not math.isfinite(length) for length in lengths):
            _fail('undefined-chord-equation', '原联立方程在当前试探点具有零弦或非有限弦；不改种子或补造方向。', parameters=ts)
        units = [[x/length for x in v] if length else None for v, length in zip(chords, lengths)]
        rows, residuals = [], []
        for i in range(1, n):
            derivative = [_evaluate(expression, ts[i], budget) for expression in derivatives]
            normalized = [x/scale for x in derivative]
            delta = [x-y for x, y in zip(units[i-1], units[i])]
            residual = math.fsum(x*y for x, y in zip(delta, normalized))
            speed = math.hypot(*normalized)
            relative = residual/speed if speed else 0.
            if not all(math.isfinite(x) for x in [residual, speed, relative]):
                _fail('source-scale', '原方程或导数尺度超出有限范围。')
            residuals.append(residual)
            rows.append({'vertex': i+1, 'parameter': ts[i], 'derivative': derivative,
                         'equationResidualDividedByCommonScale': residual,
                         'directionResidual': relative, 'stationaryDerivative': speed == 0})
        return (ts, points, lengths, rows) if detail else np.asarray(residuals)

    if n == 1:
        solver = {'method': 'fixed-endpoints-no-interior-equations', 'success': True, 'status': 0, 'nfev': 0}
        interior = []
    else:
        # No softmax/log-gaps, sorting, clipping, extra speed factor or branch
        # restart. Endpoints are eliminated exactly from the original system.
        solution = root(equations, np.asarray(initial[1:-1]), method='hybr',
                        options={'xtol': 1e-11, 'maxfev': LIMITS['maximumRootEvaluations']})
        interior = solution.x
        solver = {'method': 'MINPACK-hybr-unconstrained-original-parameters', 'success': bool(solution.success),
                  'status': int(solution.status), 'nfev': int(solution.nfev)}
    ts, points, lengths, rows = equations(interior, detail=True)
    maximum = max((abs(row['directionResidual']) for row in rows), default=0.)
    if maximum > RESIDUAL_TOLERANCE:
        _fail('root-not-verified', '求根候选未通过原弦向方程的独立终值回算。', residual=maximum, solver=solver)
    world = [[math.fsum([o, scale*x]) for o, x in zip(origin, p)] for p in points]
    if any(not math.isfinite(x) for p in world for x in p):
        _fail('source-scale', '原坐标超出可表示范围。')
    ordered = all((t-u)*(b-a) > 0 for u, t in zip(ts, ts[1:]))
    return {'parameters': ts, 'initialGuess': initial, 'points': world, 'normalizedPoints': points,
            'normalization': {'origin': origin, 'scale': scale}, 'normalizedChordLengths': lengths,
            'equations': rows, 'maximumDirectionResidual': maximum,
            'residualTolerance': RESIDUAL_TOLERANCE, 'strictlyOrderedAlongRequestedInterval': ordered,
            'outsideRequestedInterval': [i for i, t in enumerate(ts) if t < min(a, b) or t > max(a, b)],
            'stationaryVertices': [row['vertex'] for row in rows if row['stationaryDerivative']],
            'unconstrainedParameters': True, 'solver': solver, 'equationEvaluations': evaluations,
            'budget': budget.report()}


def _rotation(a, b):
    ma, mb = max(abs(x) for x in a), max(abs(x) for x in b)
    if not ma or not mb:
        _fail('undefined-direction', '原RotationAngle的方向向量为零；不补造角度。')
    a, b = [x/ma for x in a], [x/mb for x in b]
    angle = math.atan2(a[0]*b[1]-a[1]*b[0], math.fsum(x*y for x, y in zip(a, b)))
    return math.pi if angle == -math.pi else angle


def _fold_multipliers(q):
    points, left, right = q['foldPoints'], q['leftRulings'], q['rightRulings']
    sectors, checks = [], []
    for i, p in enumerate(points):
        previous = [x-y for x, y in zip(points[i-1], p)] if i else None
        following = [x-y for x, y in zip(points[i+1], p)] if i+1 < len(points) else None
        a1, a2 = (_rotation(left[i], previous), _rotation(previous, right[i])) if previous is not None else (None, None)
        a3, a4 = (_rotation(right[i], following), _rotation(following, left[i])) if following is not None else (None, None)
        sectors.append({'vertex': i+1, 'a1': a1, 'a2': a2, 'a3': a3, 'a4': a4})
        if previous is not None and following is not None:
            alternating = math.fsum([a1, -a2, a3, -a4])
            chopped = 0. if abs(alternating) < CHOP_TOLERANCE else alternating
            checks.append({'vertex': i+1, 'alternatingAngle': alternating, 'choppedAngle': chopped})
            if chopped != 0:
                _fail('original-kawasaki-abort', '原FoldAngleMultipliers2D::notff触发Abort，未返回成功倍率。',
                      vertex=i+1, alternatingAngle=alternating, chopTolerance=CHOP_TOLERANCE)
    multipliers, quotient_rows = [], []
    for i, sector in enumerate(sectors):
        first, second = (sector['a4'], sector['a3']) if i == 0 else (sector['a1'], sector['a2'])
        numerator, denominator = math.sin((first+second)/2), math.sin((first-second)/2)
        value = numerator/denominator if denominator else None
        state = 'finite' if denominator else 'original-zero-denominator'
        if value is not None and not math.isfinite(value):
            value, state = None, 'finite-quotient-outside-binary64'
        multipliers.append(value)
        quotient_rows.append({'vertex': i+1, 'numerator': numerator, 'denominator': denominator,
                              'value': value, 'state': state, 'originalDenominatorNonzero': denominator != 0})
    return {'foldPoints': points, 'leftRulings': left, 'rightRulings': right, 'sectors': sectors,
            'kawasaki': checks, 'chopTolerance': CHOP_TOLERANCE,
            'chopComparison': 'abs(approximate-real-angle) < 1e-10',
            'chopAppliedToDenominator': False, 'multipliers': multipliers, 'quotients': quotient_rows,
            'allMultipliersFinite': all(x is not None for x in multipliers), 'rawDirectionsPreserved': True}


def query_discretization_generic(data):
    q = validate_discretization_generic_query(data)
    budget = _Budget()
    sample = _sample_system(q, budget) if q['mode'] == 'system' else _uniform_curve(q, budget) if q['mode'] == 'uniform' else _fold_multipliers(q)
    function, cell = SOURCES[q['mode']]
    return {'family': RESULT_FAMILY, 'query': q,
            'source': {'function': function, 'definitionCell': cell, 'origin': 'notebook-definition',
                       'wolframNumericOutAvailable': False, 'numericModel': 'finite-real-binary64',
                       'chopDocumentation': 'https://reference.wolfram.com/language/ref/Chop.html' if q['mode'] == 'multipliers' else None},
            'limits': dict(LIMITS),
            'certification': {'sourceFormulaEvaluated': True,
                              'allSampledValuesFinite': sample.get('allSamplesFiniteReal', sample.get('allMultipliersFinite', True)),
                              'rootEquationNumericallyVerified': q['mode'] == 'uniform',
                              'rootBranchEquivalentToWolfram': False, 'allRootsEnumerated': False,
                              'continuousDomainCertified': False, 'symbolicObjectsReproduced': False,
                              'wolframOptionsReproduced': False, 'integrationErrorIntervalCertified': False,
                              'adoptableCreasePattern': False, 'globalFoldingCertified': False},
            'sample': sample}
