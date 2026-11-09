"""Primal/dual parameter conversion; all angles at the API boundary are degrees."""
import math

KEYS = {'parameterization', 'gamma', 'pleatAngle', 'twistDirection', 'postRotation'}
FAMILIES = ('periodic', 'primal-dual', 'archimedean', 'nonperiodic', 'custom', 'ring')


def validate_parameters(data, validate):
    if data.get('family', 'primal-dual') not in FAMILIES:
        raise ValueError('此构造不支持原始—对偶参数。')
    if data.get('family')=='ring' and data.get('ringMode')=='origamica':
        raise ValueError('原版环状传播使用独立褶角与半径，不适用原始—对偶参数。')
    if data.get('family')=='custom' and data.get('customOutput')=='tile-twists':
        raise ValueError('逐块扭转使用各单元独立褶角，不适用统一原始—对偶参数。')
    mode = data.get('parameterization', 'rho-beta')
    post = data.get('postRotation', 'none')
    if mode not in ('rho-beta', 'gamma-alpha') or post not in ('none', 'primal', 'dual'):
        raise ValueError('参数方式或定向方式无效。')
    base = {k:v for k,v in data.items() if k not in KEYS}
    options = {k:data[k] for k in KEYS if k in data}
    if mode == 'gamma-alpha':
        from tessellation_advanced import number
        gamma = number(data, 'gamma', 1, .01, 100)
        alpha = number(data, 'pleatAngle', 30, .1, 89.9)
        direction = data.get('twistDirection', 'ccw')
        if direction not in ('ccw', 'cw'):
            raise ValueError('扭转方向必须为 cw 或 ccw。')
        a = math.radians(alpha)
        denominator = math.hypot(gamma + math.sin(a), math.cos(a))
        angle = math.degrees(math.atan2(math.cos(a), gamma + math.sin(a))) * (1 if direction == 'ccw' else -1)
        # Validate the mother mesh with ordinary parameters, then use the exact
        # conversion. Legacy slider limits must not clip the original formulas.
        base.update(angle=36, scale=.3)
        result = validate(base)
        result.update(angle=angle, scale=gamma/denominator)
        options.update(gamma=gamma, pleatAngle=alpha, twistDirection=direction)
    else:
        if any(k in data for k in ('gamma', 'pleatAngle', 'twistDirection')):
            raise ValueError('γ、α 和扭转方向仅用于 γ／α 参数方式。')
        result = validate(base)
    return {**result, **options}


def post_rotation(params):
    beta = math.radians(params['angle'])
    mode = params.get('postRotation', 'none')
    if mode == 'primal':
        return -beta
    if mode == 'dual':
        return -math.atan2(-params['scale']*math.sin(beta), 1-params['scale']*math.cos(beta))
    return 0.


def orient_fold(fold, params):
    angle = post_rotation(params)
    if not angle:
        return
    c, s = math.cos(angle), math.sin(angle)
    fold['vertices_coords'] = [[c*x-s*y, s*x+c*y] for x,y in fold['vertices_coords']]
    # Preview coefficients stay in the original mother coordinate frame. The
    # browser applies the new parameter-dependent rotation after interpolation.
