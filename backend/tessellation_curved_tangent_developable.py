"""Exact saved subdomain of Origamica In[3913] ReshapeTandev3D.

The source is a unit-speed helical tangent developable.  Setting the target
torsion to zero with the notebook's initial frame gives a planar circular
tangent developable.  Their smooth interiors are isometric; v=0 is the
singular edge of regression on *both* surfaces, not a regular paper crease.
"""

import math


_A = math.sqrt(3.0) / 2.0
_PITCH = 0.5
_KAPPA = _A


def _u(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('u must be a finite number in [0, pi].')
    value = float(value)
    if not math.isfinite(value) or not 0 <= value <= math.pi:
        raise ValueError('u must be a finite number in [0, pi].')
    return value


def _v(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('v must be a finite number in [0, 1].')
    value = float(value)
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError('v must be a finite number in [0, 1].')
    return value


def source_frame(u):
    """Return base, unit tangent ruling and their u derivatives in R3."""
    u = _u(u)
    c, s = math.cos(u), math.sin(u)
    base = (-_A * c, _A * s, _PITCH * u)
    director = (_A * s, _A * c, _PITCH)
    return {
        'base': base, 'director': director, 'baseDerivative': director,
        'directorDerivative': (_A * c, -_A * s, 0.0),
    }


def flattened_frame(u):
    """Notebook target: b(0)=(-1,0,0), d(0)=(0,1,0), normal=(0,0,1)."""
    u = _u(u)
    c, s = math.cos(_KAPPA * u), math.sin(_KAPPA * u)
    director = (s, c, 0.0)
    return {
        'base': (-1 + (1 - c) / _KAPPA, s / _KAPPA, 0.0),
        'director': director, 'baseDerivative': director,
        'directorDerivative': (_KAPPA * c, -_KAPPA * s, 0.0),
    }


def surface_point(u, v, *, space):
    v = _v(v)
    frame = source_frame(u) if space else flattened_frame(u)
    return tuple(b + v * d for b, d in zip(frame['base'], frame['director']))


def surface_differentials(u, v, *, space):
    v = _v(v)
    frame = source_frame(u) if space else flattened_frame(u)
    tangent = tuple(b + v * d for b, d in zip(
        frame['baseDerivative'], frame['directorDerivative']))
    return tangent, frame['director']


def first_fundamental_form(v):
    """Common E,F,G and determinant; positive determinant only for v>0."""
    v = _v(v)
    return (1 + _KAPPA * _KAPPA * v * v, 1.0, 1.0,
            _KAPPA * _KAPPA * v * v)


def unit_surface_normal(u, v, *, space):
    """The ruling surface has no unique tangent plane at the regression edge."""
    v = _v(v)
    if v == 0:
        raise ValueError('The tangent developable is singular at v=0.')
    frame = source_frame(u) if space else flattened_frame(u)
    dx, dy, dz = frame['directorDerivative']
    rx, ry, rz = frame['director']
    cross = (dy * rz - dz * ry, dz * rx - dx * rz, dx * ry - dy * rx)
    return tuple(component / _KAPPA for component in cross)


def source_invariants():
    """Constants fixed by In[3913], not estimated from mesh chords."""
    return {'speed': 1.0, 'curvature': _KAPPA,
            'sourceTorsion': -_PITCH, 'targetTorsion': 0.0,
            'orientation': 1, 'branchSign': 1}
