"""Read-only reconstruction of Origamica's partly worked-out HCwCParabola.

The saved In[4058] defines a unit circle and confocal parabola, and saved
In[4060]/In[4066]/In[4069] call it with (5°, 85°, 60°, -90°).  As in the
source, the third *spatial* ruling receives a literal 1e-6 offset.  This is
display geometry, not an exact isometric crease pattern or certified FOLD.
"""

from dataclasses import dataclass
import math

import numpy as np
from scipy.integrate import solve_ivp


HALF_PI = math.pi / 2
THIRD_RULING_OFFSET = 1e-6
SAVED_PARAMETERS_DEG = (5.0, 85.0, 60.0, -90.0)


def _unit(vector):
    vector = np.asarray(vector, dtype=float)
    length = np.linalg.norm(vector)
    if not np.isfinite(length) or length <= 1e-12:
        raise ValueError('Degenerate Huffman parabola frame.')
    return vector / length


def _angle_derivatives(t, state, moving):
    """Literal In[4058] consistency equations, with algebraic cancellation.

    gamma2' in the notebook multiplies tan(gamma2/2) and cot(gamma2/2),
    and also a factor A and its reciprocal.  Their product is simplified
    here only after rejecting the poles of the literal representation.
    """
    q, gamma1, gamma2 = map(float, state)
    d = 1 - 4 * math.cos(t - q) + math.cos(q)
    a = -4 + math.cos(t) + math.cos(t - q)
    if (abs(d) <= 1e-9 or abs(a) <= 1e-9
            or abs(math.sin(gamma2 / 2)) <= 1e-9
            or abs(math.cos(gamma2 / 2)) <= 1e-9
            or abs(math.cos(gamma1 / 2)) <= 1e-9):
        raise ValueError('Saved parabola consistency equations meet a pole.')
    sine = math.sin(t - q)
    tangent = math.tan(gamma1 / 2)
    gamma1_prime = -4 * sine * tangent / d
    gamma2_prime = 2 * math.cos(q / 2) * sine * tangent / d
    q_prime = 0.0
    if moving:
        q_prime = (-2 * a * math.cos(q / 2)
                   / math.tan(gamma2 / 2) * tangent / d)
    return np.array((q_prime, gamma1_prime, gamma2_prime), dtype=float)


@dataclass(frozen=True)
class ParabolaParameters:
    first_cone_end: float
    second_cone_start: float
    first_fold_angle: float
    second_fold_angle: float

    def __post_init__(self):
        if not all(math.isfinite(value) for value in vars(self).values()):
            raise ValueError('All four parabola parameters must be finite.')
        if not 0 < self.first_cone_end < self.second_cone_start < HALF_PI:
            raise ValueError('Cone boundaries must lie inside (0, pi/2).')
        if not 0 < self.first_fold_angle < math.pi:
            raise ValueError('First fold angle must lie in (0, pi).')
        if not -math.pi < self.second_fold_angle < 0:
            raise ValueError('Second fold angle must lie in (-pi, 0).')


class ParabolaAudit:
    """Original partial-block numerical data in the bounded real domain."""

    def __init__(self, parameters, *, rtol=2e-10, atol=2e-12, max_evaluations=None):
        self.parameters = parameters
        self.integration_evaluations = 0
        if max_evaluations is not None and (type(max_evaluations) is not int or max_evaluations <= 0):
            raise ValueError('The direct numerical evaluation budget must be positive.')
        def tick():
            if max_evaluations is not None:
                self.integration_evaluations += 1
                if self.integration_evaluations > max_evaluations:
                    raise ValueError('The direct HCwCParabola evaluation budget was exhausted.')
        t1, t2 = parameters.first_cone_end, parameters.second_cone_start
        initial = (0.0, parameters.first_fold_angle,
                   parameters.second_fold_angle)

        def integrate(start, end, state, moving):
            def rhs(t,y):
                tick()
                return _angle_derivatives(t,y,moving)
            solution = solve_ivp(
                rhs,
                (start, end), state, dense_output=True, rtol=rtol, atol=atol,
            )
            if not solution.success or not np.all(np.isfinite(solution.y)):
                raise ValueError('Saved parabola angle ODE did not integrate.')
            return solution

        self._before = integrate(t1, 0.0, initial, False)
        self._middle = integrate(t1, t2, initial, True)
        self._after = integrate(t2, HALF_PI, self._middle.y[:, -1], False)

        # In[4058]'s NRecoverDarboux3D initial F,T,L,U in that order.
        frame0 = np.array((1, 0, 0, 0, 0, 1, -1, 0, 0, 0, -1, 0), dtype=float)

        def darboux(t, state):
            tick()
            _, gamma1, _ = self.angles(t)
            _, tangent, lateral, normal = np.asarray(state).reshape(4, 3)
            kappa_n = -math.tan(gamma1 / 2)
            return np.concatenate((
                tangent, lateral + kappa_n * normal,
                -tangent, -kappa_n * tangent,
            ))

        self._darboux = solve_ivp(
            darboux, (0.0, HALF_PI), frame0, dense_output=True,
            rtol=rtol, atol=atol,
        )
        if not self._darboux.success:
            raise ValueError('Saved parabola Darboux frame did not integrate.')
        self._axis = self._instant_third_ruling((t1 + t2) / 2)

    def angles(self, t):
        t = float(t)
        if not math.isfinite(t) or not 0 <= t <= HALF_PI:
            raise ValueError('t must lie in [0, pi/2].')
        t1, t2 = self.parameters.first_cone_end, self.parameters.second_cone_start
        solution = self._before if t < t1 else self._middle if t <= t2 else self._after
        return tuple(map(float, solution.sol(t)))

    def _darboux_frame(self, t):
        return self._darboux.sol(t).reshape(4, 3)

    def _instant_third_ruling(self, t):
        """In[4058]'s parabola tangent/normal mapped into the folded frame."""
        q, gamma1, gamma2 = self.angles(t)
        _, tangent1, lateral_left, normal_left = self._darboux_frame(t)
        lateral_right = math.cos(gamma1) * lateral_left - math.sin(gamma1) * normal_left
        normal_right = math.sin(gamma1) * lateral_left + math.cos(gamma1) * normal_left
        tangent1_flat = np.array((-math.sin(t), math.cos(t)))
        lateral1_flat = np.array((-math.cos(t), -math.sin(t)))
        tangent2_flat = np.array((-math.sin(q / 2), math.cos(q / 2)))
        tangent2 = _unit(
            np.dot(tangent2_flat, tangent1_flat) * tangent1
            + np.dot(tangent2_flat, lateral1_flat) * lateral_right
        )
        lateral2_left = _unit(np.cross(normal_right, tangent2))
        lateral2_right = math.cos(gamma2) * lateral2_left - math.sin(gamma2) * normal_right
        return _unit(-math.sin(q / 2) * tangent2 - math.cos(q / 2) * lateral2_right)

    def frame(self, t):
        q, gamma1, gamma2 = self.angles(t)
        scale = 4 / (1 + math.cos(q))
        f0 = np.zeros(2)
        f1 = np.array((math.cos(t), math.sin(t)))
        f2 = scale * np.array((math.cos(q), math.sin(q)))
        f3 = np.array((2.0, f2[1]))
        ff0 = np.zeros(3)
        ff1, tangent1, lateral_left, normal_left = self._darboux_frame(t)
        lateral_right = math.cos(gamma1) * lateral_left - math.sin(gamma1) * normal_left
        delta = f2 - f1
        tangent1_flat = np.array((-math.sin(t), math.cos(t)))
        lateral1_flat = -f1
        ff2 = (ff1 + np.dot(delta, tangent1_flat) * tangent1
               + np.dot(delta, lateral1_flat) * lateral_right)
        flat_third_length = float(f3[0] - f2[0])
        ff3 = ff2 + (flat_third_length + THIRD_RULING_OFFSET) * self._axis
        return {
            't': float(t), 'q': q, 'gamma1': gamma1, 'gamma2': gamma2,
            'f0': f0, 'f1': f1, 'f2': f2, 'f3': f3,
            'ff0': ff0, 'ff1': ff1, 'ff2': ff2, 'ff3': ff3,
            'flatThirdRulingLength': flat_third_length,
            'foldedThirdRulingLength': flat_third_length + THIRD_RULING_OFFSET,
        }

    def sample(self, divisions=25):
        if type(divisions) is not int or not 8 <= divisions <= 64:
            raise ValueError('divisions must be an integer in [8, 64].')
        return [self.frame(float(t)) for t in np.linspace(0, HALF_PI, divisions + 1)]

    def paired_sample(self, divisions=25):
        frames = self.sample(divisions)
        center2 = frames[0]['f1']
        center3 = frames[0]['ff1']
        pivot = _unit(frames[0]['ff2'] / 2 - center3)
        paired = []
        for frame in frames:
            flat_mirror = {
                f'f{index}': 2 * center2 - frame[f'f{index}']
                for index in range(4)
            }
            folded_mirror = {}
            for index in range(4):
                point = frame[f'ff{index}']
                displacement = point - center3
                folded_mirror[f'ff{index}'] = (
                    center3 + 2 * np.dot(pivot, displacement) * pivot - displacement
                )
            paired.append({'base': frame, 'flatMirror': flat_mirror,
                           'foldedMirror': folded_mirror})
        return paired


def saved_parabola_audit():
    return ParabolaAudit(ParabolaParameters(*map(math.radians, SAVED_PARAMETERS_DEG)))
