"""Explicit finite NDSolve step options; no guessed kernel error/default norm."""
import math
from types import SimpleNamespace
import numpy as np
from scipy.integrate import DOP853
from tessellation_curved_generic_linked_expression import GenericLinkedError

def validate_ndsolve_options(raw, parameter_span):
    if not isinstance(raw,dict) or not raw or set(raw)-{'MaxSteps','MaxStepSize'}:
        raise GenericLinkedError('ndsolve-options-contract','当前有限NDSolve选项仅接受显式MaxSteps／MaxStepSize；精度目标、Automatic、Infinity和内核默认未替代。')
    if 'MaxSteps' in raw and (type(raw['MaxSteps']) is not int or not 1<=raw['MaxSteps']<=4096):
        raise GenericLinkedError('ndsolve-options-contract','MaxSteps须为1–4096的显式整数；成功步计数与RHS总预算分别限制。')
    if 'MaxStepSize' in raw and (type(raw['MaxStepSize']) not in (int,float) or not math.isfinite(raw['MaxStepSize']) or not 1e-6<=raw['MaxStepSize']<=parameter_span):
        raise GenericLinkedError('ndsolve-options-contract','MaxStepSize须为1e-6至完整原s域长度的显式步长；不改变参数域。')
    return dict(raw)

def solve_with_steps(rhs, start, end, initial, rtol, atol, max_step, before_step):
    """Each step() is one accepted DOP853 step; rejected attempts stay in nfev."""
    solver=DOP853(rhs,start,initial,end,rtol=rtol,atol=atol,max_step=max_step)
    intervals=[];nodes=[start];states=[np.asarray(initial).copy()]
    while solver.status=='running':
        before_step()
        message=solver.step()
        if solver.status=='failed':raise GenericLinkedError('integration-failed','完整原s域的Darboux数值恢复失败：'+str(message))
        intervals.append((solver.t_old,solver.t,solver.dense_output()))
        nodes.append(solver.t);states.append(solver.y.copy())
    def evaluate(s):
        if s==start:return np.asarray(initial).copy()
        for left,right,dense in intervals:
            if min(left,right)-1e-14<=s<=max(left,right)+1e-14:return dense(s)
        raise GenericLinkedError('integration-domain','请求参数超出完成的原s域；不外推未完成积分。')
    return SimpleNamespace(success=True,y=np.asarray(states).T,t=np.asarray(nodes),nfev=solver.nfev,sol=evaluate)
