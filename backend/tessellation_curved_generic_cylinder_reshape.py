"""Closed-form saved subdomains of Origamica ReshapeGeneric3D.

In[3891]/In[3892] and In[3896]/In[3897] use constant Darboux data.
This evaluates their continuous source and target strips, not a sampled FOLD
crease pattern or Wolfram's NDSolve/FunctionInterpolation output.
"""

from dataclasses import dataclass
import math


MODES = ('flatten-cylinder', 'curl-plane')
INITIAL = {'u': 0, 'b': (0, 0, 0), 'd': (0, 1, 0), 't': (1, 0, 0), 'sigma': 1}


def _real(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f'{name} must be a finite real number.')
    return value


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


@dataclass(frozen=True)
class SavedGenericCylinderReshape:
    mode: str = 'flatten-cylinder'
    parameter_end: float = math.pi
    ruling_width: float = 1.0

    def __post_init__(self):
        if self.mode not in MODES:
            raise ValueError('mode must be a saved cylinder reshape case.')
        object.__setattr__(self, 'parameter_end', _real(self.parameter_end, 'parameter_end'))
        object.__setattr__(self, 'ruling_width', _real(self.ruling_width, 'ruling_width'))
        if not 0 < self.parameter_end <= math.pi:
            raise ValueError('parameter_end must be in (0, pi].')
        if not 0 < self.ruling_width <= 1:
            raise ValueError('ruling_width must be in (0, 1].')

    def _domain(self, u, v=0):
        u, v = _real(u, 'u'), _real(v, 'v')
        if not 0 <= u <= self.parameter_end or not 0 <= v <= self.ruling_width:
            raise ValueError('(u, v) lies outside the saved strip subdomain.')
        return u, v

    def frame(self, stage, u):
        u, _ = self._domain(u)
        if stage not in ('source', 'target'):
            raise ValueError('stage must be source or target.')
        cylinder = stage == 'source' if self.mode == 'flatten-cylinder' else stage == 'target'
        if cylinder and stage == 'source':
            b = (-math.cos(u), 0.0, math.sin(u))
            tangent = (math.sin(u), 0.0, math.cos(u))
            normal = (-math.cos(u), 0.0, math.sin(u))
            normal_curvature = -1.0
        elif cylinder:
            b = (math.sin(u), 0.0, 1 - math.cos(u))
            tangent = (math.cos(u), 0.0, math.sin(u))
            normal = (-math.sin(u), 0.0, math.cos(u))
            normal_curvature = 1.0
        else:
            b = (u, 0.0, 0.0)
            tangent = (1.0, 0.0, 0.0)
            normal = (0.0, 0.0, 1.0)
            normal_curvature = 0.0
        director = (0.0, 1.0, 0.0)
        left = _cross(normal, tangent)
        return {'u': u, 'b': b, 't': tangent, 'l': left, 'normal': normal,
                'd': director, 'sigma': 1,
                'normalCurvature': normal_curvature, 'geodesicCurvature': 0.0,
                'geodesicTorsion': 0.0}

    def surface(self, stage, u, v):
        _, v = self._domain(u, v)
        frame = self.frame(stage, u)
        return tuple(x + v * d for x, d in zip(frame['b'], frame['d']))

    def first_form(self, stage, u, v):
        self._domain(u, v)
        frame = self.frame(stage, u)
        xu, xv = frame['t'], frame['d']
        return (_dot(xu, xu), _dot(xu, xv), _dot(xv, xv))

    def regularity(self, stage, u, v):
        self._domain(u, v)
        frame = self.frame(stage, u)
        return math.sqrt(_dot(_cross(frame['t'], frame['d']),
                              _cross(frame['t'], frame['d'])))

    def sample(self, curve_segments=64):
        if type(curve_segments) is not int or not 16 <= curve_segments <= 256:
            raise ValueError('curve_segments must be an integer in [16, 256].')
        us = [self.parameter_end * i / curve_segments for i in range(curve_segments + 1)]
        us[-1] = self.parameter_end
        stages = {}
        for stage in ('source', 'target'):
            stages[stage] = {
                'crease': [self.frame(stage, u)['b'] for u in us],
                'outerBoundary': [self.surface(stage, u, self.ruling_width) for u in us],
            }
        return {'mode': self.mode, 'parameterValues': us, 'stages': stages,
                'sourceCells': ('In[3891]', 'In[3896]') if self.mode == 'flatten-cylinder'
                else ('In[3892]', 'In[3897]'),
                'wolframNumericalOutputReproduced': False,
                'exactStraightCreaseFOLD': False}


def certify_saved_generic_cylinder_reshape(
        mode='flatten-cylinder', parameter_end=math.pi, ruling_width=1.0):
    """Construct a bounded continuous pair with exact matching first forms."""
    return SavedGenericCylinderReshape(mode, parameter_end, ruling_width)
