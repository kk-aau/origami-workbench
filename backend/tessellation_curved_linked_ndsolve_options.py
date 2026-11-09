"""The sole NDSolve path in the linked functions: First3D -> NRecoverDarboux3D.

NCurve2DSystem/Next2D/Next3D/NNearConstantWidthScale retain their distinct
FunctionInterpolation, ListInterpolation and FindRoot option paths.
"""
import numpy as np

def validate_ndsolve_options(raw,span):
    # The expression interval module imports the common-parameter Jet class.
    # Load its existing option validator after these definitions are complete.
    from tessellation_curved_ndsolve_options import validate_ndsolve_options as validate
    return validate(raw,span)


def solve_linked_first3d_steps(rhs,start,end,initial,options):
    from tessellation_curved_ndsolve_options import solve_with_steps
    from tessellation_curved_generic_linked_expression import GenericLinkedError
    options=validate_ndsolve_options(options,end-start)
    calls=0;accepted=0
    def bounded_rhs(s,state):
        nonlocal calls
        calls+=1
        if calls>24000:
            raise GenericLinkedError('integration-budget','首First3D原完整s域恢复超过24000次RHS预算；不缩域或修改原初值。')
        result=rhs(s,state)
        if not np.all(np.isfinite(result)):
            raise GenericLinkedError('integration-failed','首First3D原导数非有限；不替换原系数。')
        return result
    def before_step():
        nonlocal accepted
        if accepted>=options.get('MaxSteps',4096):
            raise GenericLinkedError('max-steps-exceeded','首First3D的原MaxSteps成功步数已耗尽，完整s域未完成；不返回截短关联曲线。')
        accepted+=1
    # A step cannot exceed the complete forward interval. Its span gives the
    # same unconstrained trajectory as the old solve_ivp max_step=Infinity.
    max_step=options.get('MaxStepSize',end-start)
    sol=solve_with_steps(bounded_rhs,start,end,initial,2e-12,2e-14,max_step,before_step)
    if not sol.success or not np.all(np.isfinite(sol.y)):
        raise GenericLinkedError('integration-failed','首First3D未恢复完整有限原s域。')
    stamp={
        'callerFunction':'NLinkedFoldsFirst3D','callerDefinitionCell':'In[4081]',
        'recoveryFunction':'NRecoverDarboux3D','controlledStages':['NRecoverDarboux3D'],
        'optionPath':'opts/NRecoverDarboux3D/FilterRules[Options[NDSolve]]',
        'method':'DOP853','rtol':2e-12,'atol':2e-14,'evaluations':sol.nfev,
        'initialParameter':start,'initialState':np.asarray(initial).tolist(),
        'interpolationAndRootStagesControlled':False,
        'stepOptions':{
            'optionSource':'Options[NDSolve]/FilterRules/recovery','definitionCell':'In[3815]',
            'options':options,'effectiveMaxStepSize':max_step,
            'backwardSteps':0,'forwardSteps':len(sol.t)-1,
            'backwardParameters':[start],'forwardParameters':sol.t.tolist(),
            'counting':'accepted-DOP853-steps/shared-backward-forward','rhsEvaluationBudget':24000,
            'sourceInputsPreserved':True,'originalAutomaticDefaultsReproduced':False,
            'wolframStepControllerReproduced':False,'workingPrecisionReproduced':False,'errorGoalNormReproduced':False}}
    return sol,stamp
