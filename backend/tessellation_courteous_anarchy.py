"""Finite original In[3408] Lines, with a separate bounded search resource.

The original non-intersection rejection does NOT increment fails. Only the
two distance checks do. Python RNG values are retained for independent replay;
this does not reproduce Wolfram SeedRandom's sequence. Graph In[3411] options
are not claimed by the local arrangement used by this first Lines batch.
"""
import copy
import math
import random

TOTAL_ATTEMPT_LIMIT = 5000
TOTAL_RANDOM_DRAW_LIMIT = 10000


def _cross(a, b):
    return a[0]*b[1]-a[1]*b[0]


def _orientation(boundary):
    return 1 if sum(_cross(a,b) for a,b in zip(boundary,boundary[1:]+boundary[:1])) > 0 else -1


def _inside(point, boundary):
    if not all(math.isfinite(v) for v in point):
        return False
    # Boundary intersections are evaluated in machine precision. This roundoff
    # guard is independent of mindist and never changes a distance comparison.
    scale=max(1.,*(abs(v) for p in boundary for v in p))
    epsilon=32*math.ulp(scale*scale)
    orientation=_orientation(boundary)
    return all(orientation*_cross([b[0]-a[0],b[1]-a[1]],
                                 [point[0]-a[0],point[1]-a[1]]) >= -epsilon
               for a,b in zip(boundary,boundary[1:]+boundary[:1]))


def _clip_segment(a, b, boundary):
    direction=[b[0]-a[0],b[1]-a[1]]
    low,high=0.,1.
    orientation=_orientation(boundary)
    for p,q in zip(boundary,boundary[1:]+boundary[:1]):
        edge=[q[0]-p[0],q[1]-p[1]]
        value=orientation*_cross(edge,[a[0]-p[0],a[1]-p[1]])
        slope=orientation*_cross(edge,direction)
        if slope==0:
            if value<0:return None
        elif slope>0:low=max(low,-value/slope)
        else:high=min(high,-value/slope)
    if not low<high:return None
    return [[a[k]+t*direction[k] for k in (0,1)] for t in (low,high)]


def _candidate_intersections(segment, existing, boundary):
    a,b=segment;direction=[b[0]-a[0],b[1]-a[1]];points=[]
    for p,q in existing:
        edge=[q[0]-p[0],q[1]-p[1]]
        determinant=_cross(direction,edge)
        if determinant==0:continue # Indeterminate/Infinite does not enter polygon.
        t=_cross([p[0]-a[0],p[1]-a[1]],edge)/determinant
        point=[a[k]+t*direction[k] for k in (0,1)]
        if _inside(point,boundary):points.append(point)
    return points


def _accept_segment(segment, existing, old_points, boundary, mindist):
    """Literal branch order, retaining repeated boundary intersection atoms."""
    intersections=_candidate_intersections(segment,existing,boundary)
    if len(intersections)<=2 and len(existing)!=len(boundary):
        return False,False,'no-interior-intersection',intersections
    for i,p in enumerate(intersections):
        for q in intersections[i+1:]:
            if math.dist(p,q)<mindist:
                return False,True,'new-intersections-too-close',intersections
    for p in intersections:
        for q in old_points:
            if math.dist(p,q)<mindist:
                return False,True,'intersection-too-close-to-old-point',intersections
    return True,False,None,intersections


def _line_spec(segment,width):
    a,b=segment;dx,dy=b[0]-a[0],b[1]-a[1]
    angle=math.degrees(math.atan2(dy,dx))%180
    tangent=[math.cos(math.radians(angle)),math.sin(math.radians(angle))]
    normal=[-tangent[1],tangent[0]]
    return [angle,sum(p*n for p,n in zip(a,normal)),width]


def _generate_lines(count,mindist,boundary,seed,max_failures,width,rng):
    original_boundary=copy.deepcopy(boundary)
    existing=[[a[:],b[:]] for a,b in zip(boundary,boundary[1:]+boundary[:1])]
    old_points=copy.deepcopy(boundary)
    lows=[min(p[k] for p in boundary) for k in (0,1)]
    highs=[max(p[k] for p in boundary) for k in (0,1)]
    center=[(a+b)/2 for a,b in zip(lows,highs)]
    radius=math.dist(lows,highs)
    draws=[];accepted=[];attempts=failures=nonintersection=0;stop=None
    provider_attempts=outside_centers=resource_attempts=geometry_rejections=0

    def draw():
        if len(draws)>=TOTAL_RANDOM_DRAW_LIMIT:return None
        value=rng.random()
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<1:
            raise ValueError('随机数流必须是[0,1)内有限值。')
        draws.append(float(value));return value

    while len(accepted)<count and failures<max_failures and resource_attempts<TOTAL_ATTEMPT_LIMIT:
        candidate_center=None
        while candidate_center is None:
            if resource_attempts>=TOTAL_ATTEMPT_LIMIT:stop='resource-attempts';break
            provider_attempts+=1;resource_attempts+=1
            r,theta=draw(),draw()
            if r is None or theta is None:stop='resource-draws';break
            p=[center[0]+radius*r*math.cos(2*math.pi*theta),center[1]+radius*r*math.sin(2*math.pi*theta)]
            if _inside(p,boundary):candidate_center=p
            else:outside_centers+=1
        if stop:break
        if resource_attempts>=TOTAL_ATTEMPT_LIMIT:stop='resource-attempts';break
        resource_attempts+=1
        theta=draw()
        if theta is None:stop='resource-draws';break
        direction=[radius*math.cos(2*math.pi*theta),radius*math.sin(2*math.pi*theta)]
        segment=_clip_segment([p-d for p,d in zip(candidate_center,direction)],
                              [p+d for p,d in zip(candidate_center,direction)],boundary)
        attempts+=1
        if segment is None:geometry_rejections+=1;continue
        accepted_now,distance_failure,reason,intersections=_accept_segment(segment,existing,old_points,boundary,mindist)
        if distance_failure:failures+=1
        elif reason=='no-interior-intersection':nonintersection+=1
        if accepted_now:
            existing.append(segment);old_points.extend(intersections);accepted.append(_line_spec(segment,width))
    if stop is None:
        stop='goal' if len(accepted)==count else 'distance-failures' if failures>=max_failures else 'resource-attempts'
    proof=dict(schema='origamica-courteous-lines-v1',function='MakeCourteousAnarchyLines',
        definitionCells=['In[3407]','In[3408]'],definitionLines=[[251806,251819],[251821,252110]],
        boundary=original_boundary,goal=count,minimumDistance=mindist,randSeed=seed,maxDistanceFailures=max_failures,
        totalAttemptLimit=TOTAL_ATTEMPT_LIMIT,totalRandomDrawLimit=TOTAL_RANDOM_DRAW_LIMIT,
        attempts=attempts,distanceFailures=failures,noInteriorIntersectionRejections=nonintersection,stopReason=stop,
        providerAttempts=provider_attempts,outsideCenterRejections=outside_centers,resourceAttempts=resource_attempts,
        candidateGeometryRejections=geometry_rejections,
        randomEngine='Python random.Random',randomDraws=draws,completeLines=existing,
        wolframSeedSequenceReproduced=False,wolframExecuted=False,
        motherGraphRoute='local-arrangement-from-accepted-lines',originalGraphOptionsReproduced=False)
    return accepted,dict(requested=count,generated=len(accepted),attempts=attempts,seed=seed,courteousAnarchy=proof)


def courteous_lines(count,mindist,boundary,seed=0,max_failures=20000,width=.04):
    from tessellation_line_groups import convex_boundary
    convex_boundary(boundary) # Validates finite workbench domain, retains source order.
    if type(count) is not int or not 1<=count<=24 or type(seed) is not int or not 0<=seed<=999999:
        raise ValueError('原随机母线目标数或种子无效。')
    if type(max_failures) is not int or not 1<=max_failures<=20000:
        raise ValueError('原MaxTries距离失败上限须为1–20000。')
    if isinstance(mindist,bool) or not isinstance(mindist,(int,float)) or not math.isfinite(mindist) or not .001<=mindist<=2:
        raise ValueError('原随机母线最小交点距离须为0.001–2。')
    lines,info=_generate_lines(count,mindist,boundary,seed,max_failures,width,random.Random(seed))
    if not lines:raise ValueError('搜索预算内未找到符合原接受规则的母线；可减小间距或改变种子，未输出CP。')
    return lines,info
