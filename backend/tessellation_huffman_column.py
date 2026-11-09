"""Read-only audit of Origamica 15.0's Huffman radius-four circle block.

This is the saved In[4070] construction and In[4071] closure equations from
section 45, not a production crease pattern.  In[4070] adds 1e-6 to the
third spatial ruling length but not to its flat partner.  The complete block
therefore fails exact in-plane isometry even when its numerical closure is
small.  The notebook contains no machine-readable numerical Out for the
saved FindRoot/GraphicsRow inputs, so no original-output comparison is made.
"""

from dataclasses import dataclass
import math

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import root


HALF_PI = math.pi / 2
THIRD_RULING_OFFSET = 1e-6  # Literal value in In[4070].
SAVED_ROOT_GUESS_DEG = (33.0, 87.0, 60.0, -52.0)


def _unit(vector):
    vector = np.asarray(vector, dtype=float)
    length = np.linalg.norm(vector)
    if not np.isfinite(length) or length <= 1e-12:
        raise ValueError('Degenerate Huffman column frame.')
    return vector / length


def _angle_derivatives(t, state, moving):
    """The three literal consistency equations in In[4070]."""
    q, gamma1, gamma2 = state
    denominator = 1 + 2 * math.cos(t) - 4 * math.cos(t - q)
    if abs(denominator) <= 1e-9 or abs(math.cos(q)) <= 1e-9:
        raise ValueError('The saved consistency equations meet a pole.')
    if abs(math.sin(gamma2 / 2)) <= 1e-9 or abs(math.cos(gamma1 / 2)) <= 1e-9:
        raise ValueError('A fold angle makes the saved equations singular.')
    tangent = math.tan(gamma1 / 2)
    gamma1_prime = (2 * math.sin(t) - 4 * math.sin(t - q)) * tangent / denominator
    gamma2_prime = (
        (-math.sin(t - 2 * q) - 4 * math.sin(q) + 2 * math.sin(2 * q))
        * tangent / (math.cos(q) * -denominator)
    )
    q_prime = 0.0
    if moving:
        q_prime = (
            (-4 + math.cos(t - q) + 2 * math.cos(q))
            / math.tan(gamma2 / 2) * tangent / -denominator
        )
    return np.array((q_prime, gamma1_prime, gamma2_prime), dtype=float)


@dataclass(frozen=True)
class Circle4Parameters:
    """The four arguments of HCwCCircle4, in radians."""

    first_cone_end: float
    second_cone_start: float
    first_fold_angle: float
    second_fold_angle: float

    def __post_init__(self):
        values = tuple(vars(self).values())
        if not all(math.isfinite(value) for value in values):
            raise ValueError('All four HCwCCircle4 parameters must be finite.')
        if not 0 < self.first_cone_end < self.second_cone_start < HALF_PI:
            raise ValueError('The two cone boundaries must be inside (0, pi/2).')
        if not 0 < self.first_fold_angle < math.pi:
            raise ValueError('The first initial fold angle must lie in (0, pi).')
        if not -math.pi < self.second_fold_angle < 0:
            raise ValueError('The second initial fold angle must lie in (-pi, 0).')


class Circle4Audit:
    """Numerically evaluate the saved continuous equations without adoption."""

    def __init__(self, parameters, *, rtol=2e-10, atol=2e-12, max_evaluations=None):
        self.parameters = parameters
        self.integration_evaluations = 0
        if max_evaluations is not None and (type(max_evaluations) is not int or max_evaluations <= 0):
            raise ValueError('The direct numerical evaluation budget must be positive.')
        def tick():
            if max_evaluations is not None:
                self.integration_evaluations += 1
                if self.integration_evaluations > max_evaluations:
                    raise ValueError('The direct HCwCCircle4 evaluation budget was exhausted.')
        t1, t2 = parameters.first_cone_end, parameters.second_cone_start
        initial = (0.0, parameters.first_fold_angle, parameters.second_fold_angle)

        def integrate(start, end, state, moving):
            def rhs(t, y):
                tick()
                return _angle_derivatives(t, y, moving)
            solution = solve_ivp(
                rhs,
                (start, end), state, dense_output=True, rtol=rtol, atol=atol,
            )
            if not solution.success or not np.all(np.isfinite(solution.y)):
                raise ValueError('The saved angle ODE did not integrate.')
            return solution

        self._before = integrate(t1, 0.0, initial, False)
        self._middle = integrate(t1, t2, initial, True)
        self._after = integrate(t2, HALF_PI, self._middle.y[:, -1], False)

        # NRecoverDarboux3D's saved initial data, in F,T,L,U order.
        frame0 = np.array((1, 0, 0, 0, 0, 1, -1, 0, 0, 0, -1, 0), dtype=float)

        def darboux(t, state):
            tick()
            _, gamma1, _ = self.angles(t)
            f, tangent, lateral, normal = np.asarray(state).reshape(4, 3)
            kappa_n = -math.tan(gamma1 / 2)
            return np.concatenate((
                tangent,
                lateral + kappa_n * normal,
                -tangent,
                -kappa_n * tangent,
            ))

        self._darboux = solve_ivp(
            darboux, (0.0, HALF_PI), frame0, dense_output=True,
            rtol=rtol, atol=atol,
        )
        if not self._darboux.success:
            raise ValueError('The saved Darboux frame did not integrate.')
        self._axis = self._instant_third_ruling((t1 + t2) / 2)

    @property
    def adoption_status(self):
        return 'read-only; exact complete-block isometry and original-output parity unverified'

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
        q, gamma1, gamma2 = self.angles(t)
        _, tangent1, lateral_left, normal_left = self._darboux_frame(t)
        lateral_right = math.cos(gamma1) * lateral_left - math.sin(gamma1) * normal_left
        normal_right = math.sin(gamma1) * lateral_left + math.cos(gamma1) * normal_left
        tangent1_flat = np.array((-math.sin(t), math.cos(t)))
        lateral1_flat = np.array((-math.cos(t), -math.sin(t)))
        tangent2_flat = np.array((-math.sin(q), math.cos(q)))
        tangent2 = (
            np.dot(tangent2_flat, tangent1_flat) * tangent1
            + np.dot(tangent2_flat, lateral1_flat) * lateral_right
        )
        tangent2 = _unit(tangent2)
        lateral2_left = _unit(np.cross(normal_right, tangent2))
        lateral2_right = math.cos(gamma2) * lateral2_left - math.sin(gamma2) * normal_right
        return _unit(-math.sin(q) * tangent2 - math.cos(q) * lateral2_right)

    def frame(self, t):
        """Paired f0..f3 and ff0..ff3, plus angles and the saved 1e-6 gap."""
        q, gamma1, gamma2 = self.angles(t)
        f0 = np.zeros(2)
        f1 = np.array((math.cos(t), math.sin(t)))
        f2 = np.array((4 * math.cos(q) - 2, 4 * math.sin(q)))
        f3 = np.array((2.0, 4 * math.sin(q)))
        ff0 = np.zeros(3)
        ff1, tangent1, lateral_left, normal_left = self._darboux_frame(t)
        lateral_right = math.cos(gamma1) * lateral_left - math.sin(gamma1) * normal_left
        delta = f2 - f1
        tangent1_flat = np.array((-math.sin(t), math.cos(t)))
        lateral1_flat = -f1
        ff2 = ff1 + np.dot(delta, tangent1_flat) * tangent1 + np.dot(delta, lateral1_flat) * lateral_right
        flat_third_length = 4 * (1 - math.cos(q))
        ff3 = ff2 + (flat_third_length + THIRD_RULING_OFFSET) * self._axis
        return {
            't': float(t), 'q': q, 'gamma1': gamma1, 'gamma2': gamma2,
            'f0': f0, 'f1': f1, 'f2': f2, 'f3': f3,
            'ff0': ff0, 'ff1': ff1, 'ff2': ff2, 'ff3': ff3,
            'flatThirdRulingLength': flat_third_length,
            'foldedThirdRulingLength': flat_third_length + THIRD_RULING_OFFSET,
        }

    def closure_residuals(self):
        """The four expressions submitted to FindRoot in saved In[4071]."""
        first = self.frame(0.0)
        last = self.frame(HALF_PI)
        y_left = _unit(np.cross(last['ff2'] - last['ff1'], -last['ff1']))
        y_right = self._axis
        z_axis = _unit(np.cross(y_left, y_right))
        x_right = np.cross(y_right, z_axis)
        pivot = _unit(first['ff2'] / 2 - first['ff1'])
        rotated_left = 2 * np.dot(pivot, y_left) * pivot - y_left
        return np.array((
            last['q'] - math.pi / 3,
            np.dot(y_left, y_right) - math.cos(math.pi / 6),
            np.dot(rotated_left, z_axis),
            np.dot(rotated_left, x_right),
        ))

    def sample(self, divisions=25):
        """Draw-only CP/3D paired ruled patches, matching source divisions."""
        if isinstance(divisions, bool) or not isinstance(divisions, int) or not 2 <= divisions <= 512:
            raise ValueError('divisions must be an integer in [2, 512].')
        return [self.frame(float(t)) for t in np.linspace(0, HALF_PI, divisions + 1)]

    def paired_sample(self, divisions=25):
        """The base and reflected blocks of In[4061]/In[4068].

        Each item retains the four flat and four spatial boundaries.  The
        reflected CP is a half-turn about f1(0), and the folded copy is a
        half-turn about the saved pivot axis through ff1(0).  This is display
        data, with no straight-crease FOLD or collision certification.
        """
        frames = self.sample(divisions)
        center2 = frames[0]['f1']
        center3 = frames[0]['ff1']
        pivot = _unit(frames[0]['ff2'] / 2 - center3)
        paired = []
        for frame in frames:
            flat_mirror = {f'f{index}': 2 * center2 - frame[f'f{index}']
                           for index in range(4)}
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


def solve_saved_circle4_closure(*, tolerance=2e-6):
    """Find a numerical root near the notebook's guess; no uniqueness claim."""
    guess = np.radians(SAVED_ROOT_GUESS_DEG)

    def residual(values):
        try:
            model = Circle4Audit(Circle4Parameters(*map(float, values)))
            return model.closure_residuals()
        except (ValueError, OverflowError, FloatingPointError):
            return np.full(4, 100.0)

    result = root(residual, guess, method='hybr', options={'xtol': 2e-8})
    if not result.success or np.linalg.norm(result.fun, ord=np.inf) > tolerance:
        raise ValueError('The saved four-equation closure was not verified near its initial guess.')
    model = Circle4Audit(Circle4Parameters(*map(float, result.x)))
    if np.linalg.norm(model.closure_residuals(), ord=np.inf) > tolerance:
        raise ValueError('The numerical closure failed final verification.')
    return model
