"""The saved circular subfamily of Origamica's FoldCurvedFold3D.

In[3973]/In[3974] give two opposite signed 120-degree folds of a planar
semicircle.  In[3978]/In[3979] pass the same inputs through the numerical
entry.  This module evaluates the unique closed-form solution of their
published ODE and Frenet initial-value system.  It does not imitate Wolfram's
NDSolve interpolation or accept arbitrary planar functions.
"""

from dataclasses import dataclass
import math

import sympy as sp


FAMILY = 'planar-circle-to-curved-fold-3d'


def _finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f'{name} must be a finite real number.')
    return result


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


@dataclass(frozen=True)
class PlanarCircleFold3D:
    """Both exact ruled surfaces of one saved planar-circle input.

    ``orientation=+1`` is In[3973]'s positive valley fold and ``-1`` is
    In[3974]'s negative mountain fold.  Both have initial 3D point (1,0,0),
    tangent (0,1,0), top-side binormal (0,0,1), and u in [0, pi].  The
    parameter v measures positive unit-ruling distance on each side.
    """

    orientation: int = 1
    left_width: float = 1.0
    right_width: float = 1.0

    def __post_init__(self):
        if type(self.orientation) is not int or self.orientation not in (-1, 1):
            raise ValueError('orientation must be +1 or -1.')
        for name in ('left_width', 'right_width'):
            width = _finite(getattr(self, name), name)
            if not 0 < width < 2:
                raise ValueError(f'{name} must lie strictly between 0 and the focal radius 2.')
            object.__setattr__(self, name, width)

    @property
    def fold_angle_rad(self):
        return self.orientation * 2 * math.pi / 3

    def exact_expressions(self, parameter):
        """Return SymPy expressions for the source inputs and recovered 3D form."""
        if not isinstance(parameter, sp.Symbol) or parameter.is_real is not True:
            raise ValueError('parameter must be a real SymPy Symbol.')
        u = parameter
        e = sp.Integer(self.orientation)
        half = sp.Rational(1, 2)
        c, s = sp.cos(u / 2), sp.sin(u / 2)
        cu, su = sp.cos(u), sp.sin(u)
        height = e * sp.sqrt(3) / 2
        return {
            'flatCrease': (e * (2 * c - 1), 2 * s),
            'flatLeftRuling': (-c, -e * s),
            'flatRightRuling': (c, e * s),
            'foldedCrease': (1 - e + e * cu, su, sp.Integer(0)),
            'foldedLeftRuling': (-half * cu, -e * half * su, height),
            'foldedRightRuling': (half * cu, e * half * su, height),
            'foldAngleRad': e * 2 * sp.pi / 3,
        }

    @staticmethod
    def _u(u):
        u = _finite(u, 'u')
        if not 0 <= u <= math.pi:
            raise ValueError('u lies outside the saved [0, pi] interval.')
        return u

    def _v(self, side, v):
        if side not in ('left', 'right'):
            raise ValueError('side must be left or right.')
        v = _finite(v, 'ruling distance')
        width = self.left_width if side == 'left' else self.right_width
        if not 0 <= v <= width:
            raise ValueError('ruling distance lies outside the certified strip.')
        return v

    def frame(self, u):
        """Evaluate the exact planar input and reconstructed 3D generators."""
        u = self._u(u)
        e = self.orientation
        c, s = math.cos(u / 2), math.sin(u / 2)
        cu, su = math.cos(u), math.sin(u)
        height = e * math.sqrt(3) / 2
        return {
            'u': u,
            'flatCrease': (e * (2 * c - 1), 2 * s),
            'flatLeftRuling': (-c, -e * s),
            'flatRightRuling': (c, e * s),
            'foldedCrease': (1 - e + e * cu, su, 0.0),
            'foldedLeftRuling': (-cu / 2, -e * su / 2, height),
            'foldedRightRuling': (cu / 2, e * su / 2, height),
            'foldAngleRad': self.fold_angle_rad,
        }

    def surface(self, space, side, u, v):
        """Evaluate a continuous 2D or 3D ruled strip before its focal line."""
        if space not in (2, 3):
            raise ValueError('space must be 2 or 3.')
        v = self._v(side, v)
        frame = self.frame(u)
        prefix = 'flat' if space == 2 else 'folded'
        crease = frame[f'{prefix}Crease']
        ruling = frame[f'{prefix}{side.title()}Ruling']
        return tuple(x + v * r for x, r in zip(crease, ruling))

    def differentials(self, space, side, u, v):
        """Return analytic (d/du, d/dv) of a continuous strip."""
        if space not in (2, 3):
            raise ValueError('space must be 2 or 3.')
        v = self._v(side, v)
        u = self._u(u)
        e = self.orientation
        tangent = ((-e * math.sin(u / 2), math.cos(u / 2)) if space == 2
                   else (-e * math.sin(u), math.cos(u), 0.0))
        factor = 1 - e * v / 2 if side == 'left' else 1 + e * v / 2
        frame = self.frame(u)
        prefix = 'flat' if space == 2 else 'folded'
        return (tuple(factor * x for x in tangent),
                frame[f'{prefix}{side.title()}Ruling'])

    def first_form(self, space, side, u, v):
        """Return the smooth surface's first fundamental form (E, F, G)."""
        du, dv = self.differentials(space, side, u, v)
        return _dot(du, du), _dot(du, dv), _dot(dv, dv)

    def sample(self, curve_segments=64, ruling_segments=4):
        """Numerically evaluate paired points, sharing the same crease indices.

        This evaluates the exact solution associated with In[3978]/In[3979]
        inputs; it is not an NDSolve or FunctionInterpolation emulation.
        """
        if type(curve_segments) is not int or not 2 <= curve_segments <= 2048:
            raise ValueError('curve_segments must be an integer in [2, 2048].')
        if type(ruling_segments) is not int or not 1 <= ruling_segments <= 32:
            raise ValueError('ruling_segments must be an integer in [1, 32].')
        if (curve_segments + 1) * (2 * ruling_segments + 1) > 60000:
            raise ValueError('sample grid exceeds 60000 points.')
        us = [math.pi * i / curve_segments for i in range(curve_segments + 1)]
        frames = [self.frame(u) for u in us]
        flat = [frame['flatCrease'] for frame in frames]
        folded = [frame['foldedCrease'] for frame in frames]
        seam = list(range(len(us)))
        rows = {}
        distances = {}
        for side, width in (('left', self.left_width),
                            ('right', self.right_width)):
            rows[side] = [seam]
            distances[side] = [0.0]
            for j in range(1, ruling_segments + 1):
                v = width * j / ruling_segments
                distances[side].append(v)
                row = []
                for frame in frames:
                    row.append(len(flat))
                    for prefix, points in (('flat', flat), ('folded', folded)):
                        crease = frame[f'{prefix}Crease']
                        ruling = frame[f'{prefix}{side.title()}Ruling']
                        points.append(tuple(x + v * r for x, r in zip(crease, ruling)))
                rows[side].append(row)
        return {
            'family': FAMILY,
            'orientation': self.orientation,
            'foldAngleRad': self.fold_angle_rad,
            'parameterValues': us,
            'rulingDistances': distances,
            'flatSamples': flat,
            'foldedSamples': folded,
            'creaseIndices': seam,
            'sideRows': rows,
            'continuousIsometryCertified': True,
            'continuousDevelopabilityCertified': True,
            'sampledChordsExactIsometry': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        }


def fold_curved_circle_3d(orientation=1, *, left_width=1, right_width=1):
    """Construct In[3973] (+1) or In[3974] (-1) analytically."""
    return PlanarCircleFold3D(orientation, left_width, right_width)


def nfold_curved_circle_3d(orientation=1, *, left_width=1, right_width=1,
                           curve_segments=64, ruling_segments=4):
    """Numerically sample the exact IVP solution for In[3978]/In[3979].

    Their restricted angle/Frenet ODE has the closed solution above.  Direct
    evaluation avoids integration drift, while making no claim to reproduce
    NDSolve's particular interpolation between its sample points.
    """
    fold = fold_curved_circle_3d(orientation, left_width=left_width,
                                 right_width=right_width)
    sample = fold.sample(curve_segments=curve_segments,
                         ruling_segments=ruling_segments)
    sample['numericalRecovery'] = 'closed-form-evaluation-of-source-ivp'
    return sample
