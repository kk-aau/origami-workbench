"""Bounded numerical implementation of In[3428]'s square-sum objective.

The lower-bound certificate is exact for the objective, conditional on the
caller verifying the resulting paper. SLSQP only provides a local candidate;
it is not a port of Wolfram's symbolic runtime or a global optimality proof.
"""
import time
import numpy as np
from scipy.optimize import minimize, OptimizeResult, lsq_linear, least_squares
from scipy.linalg import qr
from tessellation_woven_period import period_values_jacobian


class MeritBudgetExceeded(ValueError):
    pass


class MeritLineSearchStalled(ValueError):
    """A cached original chart may be recovered after the frozen first pass."""
    def __init__(self, message, graph):
        super().__init__(message)
        self.graph = graph


class MeritBudget:
    def __init__(self, max_evaluations=12000, max_seconds=8.):
        self.maximum = max_evaluations
        self.deadline = time.monotonic() + max_seconds
        self.evaluations = 0

    def spend(self):
        if self.evaluations >= self.maximum or time.monotonic() >= self.deadline:
            raise MeritBudgetExceeded('原版平方和优化计算预算已用尽；未认证结果，不构成数学无解证明。')
        self.evaluations += 1


def kkt_residual(x,lower,jacobian,budget):
    """Fit free equality multipliers and NONNEGATIVE lower-bound multipliers.

    Multipliers need not be unique when many bounds are active. Selecting the
    minimum-norm equality multipliers on free columns alone can falsely report
    a large stationarity error even when valid bound multipliers exist.
    """
    active=np.isclose(x,lower,atol=1e-9,rtol=1e-9)
    matrix=np.column_stack((jacobian.T,np.eye(len(x))[:,active]))
    m=len(jacobian)
    if not matrix.shape[1]:return float(np.max(np.abs(2*x),initial=0)),active
    budget.spend()
    fit=lsq_linear(matrix,2*x,
                   bounds=(np.r_[np.full(m,-np.inf),np.zeros(np.count_nonzero(active))],
                           np.full(matrix.shape[1],np.inf)),max_iter=100,tol=1e-12)
    budget.spend()
    if not fit.success or not np.all(np.isfinite(fit.x)):
        raise ValueError('原版平方和优化无法可靠评估数值驻点。')
    return float(np.max(np.abs(matrix @ fit.x-2*x),initial=0)),active


class ReflectionSystem:
    """Four-reflection equations in the fixed CP cyclic order, with Jacobian."""
    def __init__(self, base, directions, variable, cycles, budget, period_records=(),closure_system=None):
        self.base, self.directions, self.variable, self.cycles = base, directions, variable, cycles
        self.budget = budget
        self.mask = variable >= 0
        self.cache_x = None
        self.period_records=period_records
        self.closure_system=closure_system

    def positions(self, x):
        if not np.all(np.isfinite(x)):
            raise ValueError('原版平方和优化产生非有限倍率。')
        factors = np.zeros(len(self.base))
        factors[self.mask] = x[self.variable[self.mask]]
        p = self.base + self.directions * factors[:, None]
        if not np.all(np.isfinite(p)):
            raise ValueError('原版平方和优化产生非有限坐标。')
        return p

    def evaluate(self, x):
        self.budget.spend()
        if self.cache_x is not None and np.array_equal(x, self.cache_x):
            return self.cache_value, self.cache_jacobian
        p = self.positions(x)
        centers, neighbors = self.cycles[:, 0], self.cycles[:, 1:]
        v = p[neighbors] - p[centers, None]
        lengths = np.hypot(v[:, :, 0], v[:, :, 1])
        if not np.all(np.isfinite(lengths)):
            raise ValueError('原版平方和优化的反射方向超出有限数值范围。')
        # No clamping: a zero ray is undefined, never a successful zero residual.
        uncertainty = 32 * np.finfo(float).eps * np.maximum(1., np.max(np.abs(p)))
        if np.any(lengths <= uncertainty):
            raise ValueError('原版平方和优化的反射分子存在退化或不可分辨的零长方向。')
        z = (v[:, :, 0] + 1j*v[:, :, 1]) / lengths
        product = z[:, 0]*z[:, 2]*np.conjugate(z[:, 1]*z[:, 3])
        jacobian = np.zeros((len(centers), len(x)))
        for k, sign in enumerate((1., -1., 1., -1.)):
            for ids, direction_sign in ((neighbors[:, k], 1.), (centers, -1.)):
                ids_variable = self.variable[ids]
                valid = ids_variable >= 0
                d = self.directions[ids]
                dtheta = (v[:, k, 0]*d[:, 1]-v[:, k, 1]*d[:, 0]) / lengths[:, k]**2
                np.add.at(jacobian, (np.flatnonzero(valid), ids_variable[valid]),
                          (product.real*sign*direction_sign*dtheta)[valid])
        if not np.all(np.isfinite(product)) or not np.all(np.isfinite(jacobian)):
            raise ValueError('原版平方和优化的反射方程或导数超出有限数值范围。')
        value=product.imag
        if self.period_records:
            periods,period_jacobian=period_values_jacobian(p,self.directions,self.variable,self.period_records,len(x))
            if not np.all(np.isfinite(periods)) or not np.all(np.isfinite(period_jacobian)):
                raise ValueError('原周期方程或导数超出有限数值范围。')
            # Drop[perconds,-1] after flattening ALL pairs/colors/equations.
            value=np.concatenate((value,periods[:-1]))
            jacobian=np.concatenate((jacobian,period_jacobian[:-1]))
        if self.closure_system is not None:
            closure,closure_jacobian=self.closure_system.evaluate(x)
            value=np.concatenate((value,closure));jacobian=np.concatenate((jacobian,closure_jacobian))
        self.cache_x = np.array(x, copy=True)
        self.cache_value, self.cache_jacobian = value, jacobian
        return self.cache_value, self.cache_jacobian


def solve_merit(graph, lower, budget, *, period_records=(),closure_system=None,recover_near_feasible=False):
    if not np.all(np.isfinite(lower)) or np.any(lower <= 0):
        raise ValueError('原版平方和优化需要有限正下界。')
    if len(lower) > 512 or len(graph['cycles'])+max(0,2*len(period_records)-1)+(closure_system.row_count if closure_system is not None else 0) > 512:
        raise MeritBudgetExceeded('原版平方和优化超过当前 512 变量／方程容量；未认证结果，不构成数学无解证明。')
    system = ReflectionSystem(graph['base'], graph['directions'], graph['variable'], graph['cycles'], budget,period_records,closure_system)
    at_lower, initial_jacobian = system.evaluate(lower)
    selected=np.arange(len(at_lower));rank_tolerance=None
    if closure_system is not None:
        # Repeated-corner closure rows contain exact geometric redundancies.
        # SLSQP needs independent equality rows. Freeze a pivoted Jacobian
        # basis for this chart, then require ALL original residuals at output
        # and use the FULL Jacobian in the KKT diagnostic.
        _,r,pivots=qr(initial_jacobian.T,mode='economic',pivoting=True)
        diagonal=np.abs(np.diag(r));rank_tolerance=float(np.max(diagonal,initial=0))*1e-10
        rank=int(np.count_nonzero(diagonal>rank_tolerance));selected=np.asarray(pivots[:rank],dtype=int)
        if rank==0 and np.max(np.abs(at_lower),initial=0)>1e-12:raise ValueError('绕孔闭合约束在初始下界的导数退化；未认证，不构成数学无解证明。')
    lower_merit = float(lower @ lower)
    recovery_report = None
    if np.max(np.abs(at_lower), initial=0) <= 1e-12:
        # For x_i >= lower_i >= 0, sum(x_i^2) >= sum(lower_i^2).
        # Bypass finite differencing at an active bound and retain exact values.
        result = OptimizeResult(x=lower.copy(), success=True, nfev=0, nit=0)
        certificate = 'feasible-lower-bound'
    else:
        def objective(x):
            budget.spend()
            value=float(x @ x)
            if not np.isfinite(value):
                raise ValueError('原版平方和优化的倍率平方和超出有限数值范围。')
            return value
        def gradient(x):
            budget.spend()
            return 2*x
        result = minimize(objective, lower.copy(), jac=gradient, method='SLSQP',
                          bounds=[(float(v), None) for v in lower],
                          constraints={'type': 'eq', 'fun': lambda x: system.evaluate(x)[0][selected],
                                       'jac': lambda x: system.evaluate(x)[1][selected]},
                          options={'ftol': 1e-10, 'maxiter': 400, 'disp': False})
        if recover_near_feasible and not result.success and np.all(np.isfinite(result.x)):
            # SLSQP can stall its merit line search at an almost feasible
            # active bound. Do not turn that failure into success. Restore
            # ALL original equations, then actually solve the unchanged
            # square-sum problem again from the restored feasible seed.
            initial_residual = system.evaluate(result.x)[0]
            initial_maximum = float(np.max(np.abs(initial_residual), initial=0))
            if initial_maximum <= 1e-7:
                original_result = result
                seed = np.maximum(result.x, lower+1e-10)
                restored = least_squares(lambda x: system.evaluate(x)[0], seed,
                    jac=lambda x: system.evaluate(x)[1], bounds=(lower, np.full(len(lower), np.inf)),
                    ftol=1e-13, xtol=1e-13, gtol=1e-13, max_nfev=60)
                restored_maximum = float(np.max(np.abs(system.evaluate(restored.x)[0]), initial=0))
                if restored.success and restored_maximum <= 1e-12:
                    result = minimize(objective, restored.x, jac=gradient, method='SLSQP',
                        bounds=[(float(v), None) for v in lower],
                        constraints={'type': 'eq', 'fun': lambda x: system.evaluate(x)[0][selected],
                                     'jac': lambda x: system.evaluate(x)[1][selected]},
                        options={'ftol': 1e-10, 'maxiter': 400, 'disp': False})
                    recovery_report = dict(method='full-original-constraint-restoration-then-square-sum',
                        initialOptimizerStatus=int(original_result.status),
                        initialOptimizerMessage=str(original_result.message),
                        initialMaximumResidual=initial_maximum,
                        restorationMaximumResidual=restored_maximum,
                        restorationEvaluations=int(restored.nfev),
                        originalConstraintCount=len(initial_residual),
                        restartedOptimizerSuccess=bool(result.success),
                        noArtificialUpperBound=True)
        certificate = 'local-numerical-candidate'
    residual, jacobian = system.evaluate(result.x)
    maximum = float(np.max(np.abs(residual), initial=0))
    if not result.success or not np.all(np.isfinite(result.x)) or np.any(result.x < lower) or maximum > 1e-7:
        message=f'原版平方和优化未找到满足折叠约束的解（{getattr(result, "message", "未收敛")}，最大残差 {maximum:.3g}）；不构成数学无解证明。'
        if (not recover_near_feasible and not result.success and np.all(np.isfinite(result.x)) and
                not np.any(result.x < lower) and maximum <= 1e-7):
            raise MeritLineSearchStalled(message, graph)
        raise ValueError(message)
    if certificate=='feasible-lower-bound':
        kkt=0.;active=np.ones(len(lower),dtype=bool)
    else:
        # Diagnostic only, never a global minimum certificate.
        try:kkt,active=kkt_residual(result.x,lower,jacobian,budget)
        except np.linalg.LinAlgError as exc:
            raise ValueError('原版平方和优化无法可靠评估数值驻点。') from exc
    report=dict(
        schema='origamica-woven-periodic-merit-v1' if period_records else 'origamica-woven-nonperiodic-merit-v1', objective='sum-pleat-factors-squared',
        certificate=certificate, lowerBounds=lower.tolist(), lowerMerit=lower_merit,
        merit=float(result.x @ result.x), maximumResidual=maximum,
        kktResidual=kkt, activeBounds=int(np.count_nonzero(active)),
        iterations=int(result.nit), evaluationCount=budget.evaluations, evaluationBudget=budget.maximum,
        noArtificialUpperBound=True, periodicContract='ordered-perconds-drop-last-v1' if period_records else 'not-supported', wolframExecuted=False)
    if recovery_report is not None:report['numericalRecovery']=recovery_report
    if period_records:
        raw,_=period_values_jacobian(system.positions(result.x),system.directions,system.variable,period_records,len(lower))
        report.update(periodicRecords=period_records,periodicRawResiduals=raw.tolist(),
                      periodicEquationCount=len(raw)-1,droppedPeriodicEquation=len(raw)-1,
                      droppedPeriodicResidual=float(raw[-1]))
    if closure_system is not None:
        raw_closure,_=closure_system.evaluate(result.x)
        report.update(holeClosureContract='whole-unfold-repeated-corners-v1',holeClosureEquationCount=len(raw_closure),holeClosureRawResiduals=raw_closure.tolist(),holeClosureMaximumResidual=float(np.max(np.abs(raw_closure),initial=0)),equalityEquationCount=len(residual),independentEquationCount=len(selected),equalityRowIndices=selected.tolist(),rankTolerance=rank_tolerance,constraintReduction='fixed-pivoted-jacobian-basis-full-output-check')
    return result, system.positions(result.x), report
