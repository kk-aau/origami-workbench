"""Explicit inner paper: clip actual convex faces, then re-anchor true FF."""
from copy import deepcopy
import math
import time

from tessellation_paper_clip import (
    inscribed_paper_polygon, clip_fold_to_convex_paper, map_vertex_values,
)


INSCRIBABLE=frozenset(('twist','circular-twist','periodic','primal-dual','archimedean',
                      'nonperiodic','custom','ring','flagstone','woven','woven-lines',
                      'brocard','split','polygon-tile'))


def _source_anchor(core):
    source=core['source']
    value=source.get('stationaryFoldFace')
    if value is None and 'foldedFormStationaryFace' in source:
        value=source['foldedFormStationaryFace']
        if core['stats']['parameters'].get('family')=='circular-twist':
            if type(value) is not int:raise ValueError('原构造固定面来源编号无效。')
            value-=1
    if value is not None and (type(value) is not int or not 0<=value<len(core['fold']['faces_vertices'])):
        raise ValueError('原构造固定面来源编号无效。')
    return value


def _anchor_values(values,coords,face):
    """Rigidly align the mapped source frame to the surviving CP root face."""
    a=face[0]
    b=max(face[1:],key=lambda v:math.dist(coords[a],coords[v]))
    u=[values[b][k]-values[a][k] for k in (0,1)]
    v=[coords[b][k]-coords[a][k] for k in (0,1)]
    length=math.hypot(*u);target=math.hypot(*v)
    if not length or not target:raise ValueError('内切纸张固定面退化。')
    u=[x/length for x in u];v=[x/target for x in v]
    side=lambda points,c: ((points[b][0]-points[a][0])*(points[c][1]-points[a][1])-
                           (points[b][1]-points[a][1])*(points[c][0]-points[a][0]))
    c=max(face,key=lambda i:abs(side(coords,i)))
    source_side,target_side=side(values,c),side(coords,c)
    if not source_side or not target_side:raise ValueError('内切纸面不能恢复固定面姿态。')
    sign=1 if (source_side>0)==(target_side>0) else -1
    out=[]
    for point in values:
        d=[point[k]-values[a][k] for k in (0,1)]
        x=d[0]*u[0]+d[1]*u[1]
        y=sign*(-d[0]*u[1]+d[1]*u[0])
        out.append([coords[a][0]+x*v[0]-y*v[1],coords[a][1]+x*v[1]+y*v[0]])
    return out


def _paper_root(fold,polygon):
    """Geometric tie-break independent of source face serialization order."""
    center=[sum(p[k] for p in polygon)/len(polygon) for k in (0,1)]
    span=max(max(p[k] for p in polygon)-min(p[k] for p in polygon) for k in (0,1))
    candidates=[]
    for index,face in enumerate(fold['faces_vertices']):
        centroid=[sum(fold['vertices_coords'][v][k] for v in face)/len(face) for k in (0,1)]
        x,y=[(centroid[k]-center[k])/span for k in (0,1)]
        candidates.append(((round(x*x+y*y,12),round(x,12),round(y,12)),index))
    return min(candidates)[1]


def generate_inscribed_paper(params,generate_base):
    started=time.perf_counter()
    base={key:value for key,value in params.items() if key!='paper'}
    if base.get('family','primal-dual') not in INSCRIBABLE:
        raise ValueError('空间结构不能套用二维内切纸张。')
    core=generate_base(base)
    if core['stats']['checks']['geometry']['status']!='passed':
        raise ValueError('原构造折痕几何未通过，不能进行内切裁剪。')
    original=core['fold'];coords=original['vertices_coords']
    if any(len(p)!=2 or any(not math.isfinite(x) for x in p) for p in coords):
        raise ValueError('内切纸张只支持有限二维折痕。')
    origin=coords[0]
    span=max(max(p[k] for p in coords)-min(p[k] for p in coords) for k in (0,1))
    if not math.isfinite(span) or span<=0:raise ValueError('原折痕范围退化。')
    # Existing clip tolerances retain their legacy contract. Normalize here
    # so precise tiny P34 tiles obey the same topology/coverage checks.
    unit={**original,'vertices_coords':[[(p[k]-origin[k])/span for k in (0,1)] for p in coords]}
    paper={key:value for key,value in params['paper'].items() if key!='fit'}
    polygon=inscribed_paper_polygon(unit,paper,minimum_area_ratio=0.)
    original_flat=core['source'].get('foldedForm') if core['source'].get('output')!='tiling' else None
    unit_flat=None
    if original_flat is not None:
        if (not isinstance(original_flat,list) or len(original_flat)!=len(coords) or
                any(not isinstance(p,list) or len(p)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) for v in p) for p in original_flat)):
            raise ValueError('原构造平折逐点数据无效。')
        flat_origin=original_flat[0]
        unit_flat=[[(p[k]-flat_origin[k])/span for k in (0,1)] for p in original_flat]
    clipped=clip_fold_to_convex_paper(unit,polygon,unit_flat)
    fold=clipped['fold'];face_map=clipped['faceMap'];vertex_map=clipped['vertexMap']
    fold['vertices_coords']=map_vertex_values(vertex_map,coords)
    target=[[origin[k]+span*p[k] for k in (0,1)] for p in polygon]
    for name,values in original.items():
        if name.startswith('zhezhi_face_'):
            if not isinstance(values,list) or len(values)!=len(original['faces_vertices']):
                raise ValueError('原构造逐面来源数组无效。')
            fold[name]=[deepcopy(values[i]) for i in face_map]
    old_anchor=_source_anchor(core)
    starting=face_map.index(old_anchor) if old_anchor in face_map else _paper_root(fold,target)
    source={key:deepcopy(core['source'][key]) for key in ('name','license','output') if key in core['source']}
    source.update(algorithm='actual-face inscribed paper clip',version=1,
                  paperMethod='inscribed-pattern-clip-v1',paperPolygon=target,
                  sourceVertexMap=vertex_map,sourceFaceMap=face_map,paperStartingFace=starting,
                  provenance={'family':base.get('family','primal-dual'),
                              'algorithm':core['source'].get('algorithm'),
                              'sourceStationaryFace':old_anchor,
                              'sourceVertices':len(coords),'sourceFaces':len(original['faces_vertices'])})
    # Never reuse illustration coordinates or an old preview recipe. A true
    # source FF is verified by the clip, then compared in the new root frame.
    if core['source'].get('output')=='tiling':
        source['foldedFormStatus']='not_applicable'
    else:
        kinds=set(fold['edges_assignment'])
        if kinds<=set(('M','V','U','B')):
            from tessellation_flat_embedding import flat_face_embedding
            try:
                flat,closure=flat_face_embedding(fold,starting)
            except ValueError as exc:
                if original_flat is not None:raise
                source.update(foldedFormStatus='unavailable',foldedFormReason=str(exc))
            else:
                if unit_flat is not None:
                    # The clip coordinates have now been restored to source
                    # units; align the mapped source in that same frame.
                    mapped=[[span*p[k] for k in (0,1)] for p in clipped['foldedForm']]
                    anchored=_anchor_values(mapped,fold['vertices_coords'],fold['faces_vertices'][starting])
                    if max(math.dist(a,b) for a,b in zip(anchored,flat))>span*1e-7:
                        raise ValueError('原平折与内切后反射几何不一致。')
                source.update(foldedForm=flat,foldedFormMethod='strict face reflection after inscribed crop',
                              foldedFormMaxIsometryError=closure)
        elif unit_flat is not None:
            mapped=[[span*p[k] for k in (0,1)] for p in clipped['foldedForm']]
            source.update(foldedForm=_anchor_values(mapped,fold['vertices_coords'],fold['faces_vertices'][starting]),
                          foldedFormMethod='verified source face interpolation in cropped root frame')
        else:
            source.update(foldedFormStatus='unavailable',foldedFormReason='含辅助面边，未提供可验证的原平折坐标。')
    from tessellation_paper_extend import _frame_metrics
    stats=_frame_metrics(fold,params,source,started)
    stats.update(tiles=core['stats']['tiles'],kind='inscribed-tessellation-paper')
    fold['file_creator']='折纸工作台 / 内切纸张逐面裁剪'
    fold['frame_description']='仅保留内切纸张内的真实折痕；整片层序须重新验证。'
    warnings=['已按内切纸张逐面裁剪；外部结构已裁掉，保留的内部折痕沿用原山谷赋型。',
              '内切后的整片平折层序须重新计算，原层序和连续折叠路径不能直接继承。']
    if stats['checks']['local']['status']=='failed':warnings.append('裁剪后局部必要条件未通过，此候选不可采用。')
    return {'preview':None,'fold':fold,'mother':core.get('mother'),'dual':core.get('dual'),
            'stats':stats,'warnings':warnings,'source':source}
