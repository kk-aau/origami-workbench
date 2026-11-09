"""Independent mesh construction with the vendored MIT Pleat operators."""
import math
from collections import defaultdict

from tessellation_meshes import polygon_mesh, site_mesh, seeded_points, penrose_mesh, ring_mesh, custom_mesh, reciprocal_centers
from tessellation_patterns import regular_patch, canonical_fold, make_fold

ARCHIMEDEAN = ('3.12.12', '4.6.12', '3.3.4.3.4', '3.3.3.3.6', '4.8.8', '3.6.3.6', '3.4.6.4', '3.3.3.4.4')
RESCH = ('resch-3','resch-4','resch-6')
RESCH_CATALOG = tuple(f'resch-catalog-{i}' for i in range(1,6))
TWO_UNIFORM = tuple(f'two-uniform-{i}' for i in range(1,21))
MIXED = (*ARCHIMEDEAN, 'pgg', '2uniform', 'equilateral-pentagon', 'cairo', 'double-cairo', *RESCH, *TWO_UNIFORM, *RESCH_CATALOG)
ADVANCED = ('archimedean', 'nonperiodic', 'custom', 'ring', 'flagstone', 'woven', 'brocard', 'split', 'woven-lines', 'polygon-tile')


def number(data, key, default, low, high, integer=False):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{key} 必须为数字。')
    try:
        value = float(value)
    except (OverflowError, ValueError):
        raise ValueError(f'{key} 必须为有限数字。') from None
    if not math.isfinite(value) or not low <= value <= high or (integer and int(value) != value):
        raise ValueError(f'{key} 必须在 {low}–{high} 之间' + ('且为整数。' if integer else '。'))
    return int(value) if integer else value


def points(value, low, high, minimum=2, maximum=64, *, relative_distance=False):
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError(f'点数量必须在 {minimum}–{maximum} 之间。')
    result = []
    for p in value:
        if not isinstance(p, list) or len(p) != 2:
            raise ValueError('每个点需要两个坐标。')
        result.append([number({'x': x}, 'x', 0, low, high) for x in p])
    distance_scale = (max(max(p[k] for p in result)-min(p[k] for p in result)
                          for k in (0, 1)) if relative_distance else 1.)
    if distance_scale <= 0 or any(math.dist(a, b) < 1e-6*distance_scale
                                  for i, a in enumerate(result) for b in result[i+1:]):
        raise ValueError('点之间距离过近或重复，请移动或删除重合点。')
    return result


def validate_advanced(data, *, allow_pruned_tile_twists=False):
    family = data['family']
    if family=='polygon-tile':
        from tessellation_tile_twist import validate_polygon_tile
        return validate_polygon_tile(data)
    if family=='woven-lines':
        from tessellation_woven import validate_woven
        return validate_woven(data)
    if family=='brocard':
        from tessellation_brocard import validate_brocard
        return validate_brocard(data)
    if family=='split':
        from tessellation_split_exact import validate_exact_split
        return validate_exact_split(data)
    rules = {
        'archimedean': {'tiling', 'rings', 'starAngle', 'cairoAngle', 'repeatX', 'repeatY', 'cairoOutput'},
        'nonperiodic': {'kind', 'count', 'seed', 'depth', 'points', 'boundary', 'boundaryMode', 'penroseVersion', 'borderTriangles', 'goldbergVersion', 'goldbergOrder', 'goldbergRings', 'goldbergOffset', 'goldbergOutput'},
        'custom': {'vertices', 'faces', 'repeatX', 'repeatY', 'lattice', 'range1', 'range2', 'customOutput', 'tileTwists', 'stationaryFace', 'monolithicOptions'},
        'ring': {'sides', 'rings', 'growth', 'radii', 'includeCenter', 'ringMode', 'outerRadii', 'creaseRadii', 'offsetAngle', 'outerProfiles', 'creaseProfiles', 'outerExpressions', 'creaseExpressions', 'outerVectors', 'creaseVectors', 'outerLinearMaps', 'creaseLinearMaps', 'outerFourierCurves', 'creaseFourierCurves', 'outerSignedPowers', 'creaseSignedPowers', 'outerVectorExpressions', 'creaseVectorExpressions', 'outerVectorTemplate', 'creaseVectorTemplate', 'vectorFunctionDefinitions'},
        'flagstone': {'rows', 'columns', 'width', 'aspect', 'tiling', 'motherParams', 'dualTargets', 'shrinkage', 'junctionAssignment'},
        'woven': {'rows', 'columns', 'width', 'weave', 'phase'},
    }
    shared = {'family'} | ({'angle', 'scale', 'dualTargets'} if family not in ('flagstone', 'woven') else set())
    if set(data) - rules[family] - shared:
        raise ValueError('含当前构造不支持的参数。')
    out = {'family': family}
    if 'angle' in shared:
        out.update(angle=number(data, 'angle', 45 if family=='archimedean' or data.get('kind')=='goldberg' else 36, -80, 80), scale=number(data, 'scale', .3, .1, .85))
        if abs(out['angle']) < .1:
            raise ValueError('旋转角绝对值不能小于 0.1°。')
        if 'dualTargets' in data:
            out['dualTargets'] = points(data['dualTargets'], -100, 100, maximum=256)
    if family == 'archimedean':
        kind = data.get('tiling', '3.6.3.6')
        if not isinstance(kind, str) or kind not in MIXED:
            raise ValueError('阿基米德平铺类型无效。')
        out.update(tiling=kind, rings=number(data, 'rings', 1, 1, 2, True))
        if kind in (*RESCH,*RESCH_CATALOG):out['starAngle']=number(data,'starAngle',40,10,55)
        elif 'starAngle' in data:raise ValueError('星尖角只适用于 Resch 星形母结构。')
        if kind in ('cairo','double-cairo'):
            out.update(cairoAngle=number(data,'cairoAngle',90,60.1,119.9),repeatX=number(data,'repeatX',2,1,4,True),repeatY=number(data,'repeatY',2,1,4,True))
            output=data.get('cairoOutput','tiling')
            if output not in ('tiling','twist'):raise ValueError('Cairo 输出方式无效。')
            out['cairoOutput']=output
        elif any(k in data for k in ('cairoAngle','repeatX','repeatY','cairoOutput')):
            raise ValueError('Cairo 底角和周期数仅适用于 Cairo 系列。')
    elif family == 'nonperiodic':
        kind = data.get('kind', 'voronoi')
        if kind not in ('voronoi', 'delaunay', 'penrose', 'goldberg'):
            raise ValueError('非周期母结构类型无效。')
        original=kind=='penrose' and data.get('penroseVersion')=='origamica'
        out.update(kind=kind, count=number(data, 'count', 9, 3, 96, True), seed=number(data, 'seed', 1, 0, 999999, True), depth=number(data, 'depth', 2, 0 if original else 1, 7 if original else 3, True))
        if 'penroseVersion' in data:
            if kind!='penrose' or data['penroseVersion'] not in ('legacy','origamica'):raise ValueError('Penrose 层级规则无效。')
            out['penroseVersion']=data['penroseVersion']
        if 'borderTriangles' in data:
            if kind!='penrose' or not isinstance(data['borderTriangles'],bool):raise ValueError('边界半菱形选项须为布尔值。')
            out['borderTriangles']=data['borderTriangles']
        if 'goldbergVersion' in data:
            if kind!='goldberg' or data['goldbergVersion'] not in ('legacy','origamica'):raise ValueError('Goldberg 构造版本无效。')
            out['goldbergVersion']=data['goldbergVersion']
        if data.get('goldbergVersion')=='origamica':
            m=number(data,'goldbergOrder',5,3,16,True)
            n=number(data,'goldbergRings',2,1,9,True)
            o=number(data,'goldbergOffset',0,0,17,True)
            if m*n*n>256:raise ValueError('Goldberg 当前最多生成 256 个三角单元，请减少旋转阶或层数。')
            if o>=2*n or (o and m%2):raise ValueError('Goldberg 偏移仅适用于偶数阶，且须小于两倍径向层数。')
            output=data.get('goldbergOutput','twist')
            if output not in ('twist','tiling'):raise ValueError('Goldberg 输出方式无效。')
            if m<5 and output=='twist':raise ValueError('3/4 阶 Goldberg 的原版外心对偶交叉或退化，请选择母结构排布。')
            out.update(goldbergOrder=m,goldbergRings=n,goldbergOffset=o,goldbergOutput=output)
        elif any(k in data for k in ('goldbergOrder','goldbergRings','goldbergOffset','goldbergOutput')):
            raise ValueError('Goldberg 原版参数须使用原版构造模式。')
        if 'points' in data:
            if kind in ('penrose','goldberg'):
                raise ValueError('细分母结构不接受种子点。')
            out['points'] = points(data['points'], -10, 10, 3, 96)
        if 'boundary' in data:
            if kind!='voronoi':raise ValueError('自定义裁剪边界仅适用于 Voronoi。')
            from tessellation_line_groups import convex_boundary
            out['boundary']=convex_boundary(data['boundary'])
        if 'boundaryMode' in data:
            if kind!='delaunay' or data['boundaryMode'] not in ('square','hull'):raise ValueError('Delaunay 边界须为种子凸包或旧版补角。')
            out['boundaryMode']=data['boundaryMode']
        if kind=='voronoi' and 'points' in out:
            boundary=out.get('boundary',[[0,0],[1,0],[1,1],[0,1]])
            if any((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])< -1e-8 for a,b in zip(boundary,boundary[1:]+boundary[:1]) for p in out['points']):
                raise ValueError('Voronoi 种子必须位于裁剪边界内；请编辑种子或重置种子。')
        if kind=='goldberg' and data.get('goldbergVersion')!='origamica' and out['depth']>2:
            raise ValueError('Goldberg 最多支持 2 次细分。')
    elif family == 'custom':
        out['vertices'] = points(data.get('vertices'), -10, 10, 3, 96)
        output=data.get('customOutput','twist')
        if output not in ('twist','tiling','tile-twists'):raise ValueError('自定义拼块输出须为统一扭转、逐块扭转或母结构排布。')
        faces = data.get('faces')
        if not isinstance(faces, list) or not 1 <= len(faces) <= 96:
            raise ValueError('自定义网格需包含 1–96 个多边形面。')
        for face in faces:
            if not isinstance(face, list) or not 3 <= len(face) <= 24 or any(isinstance(i, bool) or not isinstance(i, int) or not 0 <= i < len(out['vertices']) for i in face) or len(set(face)) != len(face):
                raise ValueError('自定义面包含无效或重复的顶点编号。')
            ps = [out['vertices'][i] for i in face]
            cross = [(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) for a,b,c in zip(ps,ps[1:]+ps[:1],ps[2:]+ps[:2])]
            if output in ('twist','tile-twists') and (not (all(x >= -1e-9 for x in cross) or all(x <= 1e-9 for x in cross)) or max(abs(x) for x in cross) < 1e-9):
                raise ValueError('扭转折痕的每个自定义面必须是非退化的凸多边形；凹形拼块请选择母结构排布。')
            area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ps,ps[1:]+ps[:1]))
            if abs(area)<1e-9:raise ValueError('自定义拼块面积不可退化。')
            if output=='tiling':
                for i,(a,b) in enumerate(zip(ps,ps[1:]+ps[:1])):
                    for j,(c,d) in enumerate(zip(ps,ps[1:]+ps[:1])):
                        if j<=i or j==i+1 or (i==0 and j==len(ps)-1):continue
                        if max(a[0],b[0])<min(c[0],d[0])-1e-9 or max(c[0],d[0])<min(a[0],b[0])-1e-9 or max(a[1],b[1])<min(c[1],d[1])-1e-9 or max(c[1],d[1])<min(a[1],b[1])-1e-9:continue
                        orient=lambda x,y,z:(y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0])
                        if orient(a,b,c)*orient(a,b,d)<=1e-16 and orient(c,d,a)*orient(c,d,b)<=1e-16:
                            raise ValueError('自定义拼块边界自交或接触，请调整顶点。')
        if set(range(len(out['vertices']))) != {i for f in faces for i in f}:
            raise ValueError('自定义网格含未被面使用的孤立顶点。')
        out.update(faces=faces, repeatX=number(data,'repeatX',1,1,3,True), repeatY=number(data,'repeatY',1,1,3,True))
        signed_ranges='range1' in data or 'range2' in data
        if signed_ranges:
            if 'range1' not in data or 'range2' not in data or 'lattice' not in data or out['repeatX']!=1 or out['repeatY']!=1:
                raise ValueError('带正负指数的格点范围须成对设置、指定双格矢，并将旧重复数设为 1。')
            for key in ('range1','range2'):
                value=data[key]
                if (not isinstance(value,list) or len(value)!=2 or
                    any(isinstance(i,bool) or not isinstance(i,int) or abs(i)>64 for i in value) or
                    value[0]>value[1]):
                    raise ValueError('格点指数范围须为 -64–64 内升序的整数闭区间。')
                out[key]=value.copy()
        tile_count=len(faces)*((out['range1'][1]-out['range1'][0]+1)*(out['range2'][1]-out['range2'][0]+1) if signed_ranges else out['repeatX']*out['repeatY'])
        if output=='tiling':out['customOutput']='tiling'
        elif output=='tile-twists':
            if 'monolithicOptions' in data:
                merge=data['monolithicOptions']
                if not isinstance(merge,dict) or set(merge)!={
                        'mergedEdges','samePtTolerance','collinearCleanup','collinearTolerance'}:
                    raise ValueError('整体拼块合并选项须完整指定。')
                if merge['mergedEdges'] not in ('auto','delete','retain') or not isinstance(merge['collinearCleanup'],bool):
                    raise ValueError('共享边模式或共线清理开关无效。')
                for key in ('samePtTolerance','collinearTolerance'):
                    value=merge[key]
                    if (isinstance(value,bool) or not isinstance(value,(int,float)) or
                            not math.isfinite(value) or not 0<=value<=1e-4):
                        raise ValueError('拼块合并容差须为 0–0.0001。')
                out['monolithicOptions']=merge.copy()
            if 'stationaryFace' in data:
                out['stationaryFace']=number(data,'stationaryFace',0,0,4096,True)
            entries=data.get('tileTwists')
            if not isinstance(entries,list) or len(entries)!=len(faces):
                raise ValueError('逐块扭转需要为每个原始拼块设置褶宽、偏置、褶角和中心赋型。')
            out['tileTwists']=[]
            for face,entry in zip(faces,entries):
                common={'width','offset','tilt','centralTypes'}
                is_split=isinstance(entry,dict) and entry.get('construction')=='split'
                centered_angle=isinstance(entry,dict) and entry.get('angleMode')=='twist'
                allowed={'width','offset','centralTypes','angleMode','twistAngle'} if centered_angle else common
                if is_split:
                    allowed|={'construction','baseVertex','connection'}
                    if not centered_angle:allowed.add('ccw')
                if not isinstance(entry,dict) or set(entry)!=allowed:
                    raise ValueError('逐块扭转参数缺失或含无效字段。')
                width=number(entry,'width',.2,.05,.8);offset=number(entry,'offset',0,-.4,.4)
                if centered_angle:
                    if offset!=0:raise ValueError('固定中心扭角只适用于无偏置的居中拼块。')
                    twist_angle=number(entry,'twistAngle',30,1,179)
                else:
                    tilt=number(entry,'tilt',70,1,179)
                types=entry['centralTypes']
                if abs(offset)+width/2>=.5-1e-8 or not isinstance(types,list) or len(types)!=len(face) or any(t not in ('M','V') for t in types):
                    raise ValueError('逐块扭转褶宽、偏置或中心赋型无效。')
                tile_options=dict(width=width,offset=offset,centralTypes=types.copy())
                if centered_angle:tile_options.update(angleMode='twist',twistAngle=twist_angle)
                else:tile_options['tilt']=tilt
                if is_split:
                    if len(face)!=4 or isinstance(entry['baseVertex'],bool) or not isinstance(entry['baseVertex'],int) or not 0<=entry['baseVertex']<4 or entry['connection'] not in ('M','V') or not centered_angle and not isinstance(entry['ccw'],bool):
                        raise ValueError('四边形分裂需要 1–4 号基点、连接山谷和扭转方向。')
                    tile_options.update(construction='split',baseVertex=entry['baseVertex'],connection=entry['connection'])
                    if not centered_angle:tile_options['ccw']=entry['ccw']
                out['tileTwists'].append(tile_options)
            out['customOutput']='tile-twists'
            # A bounded lattice may be larger before PruneTiling removes
            # complete source tiles. The constructed sheet is still capped
            # at 36 tiles by construct_tile_patch after pruning.
            if tile_count>36 and not allow_pruned_tile_twists:
                raise ValueError('逐块扭转当前最多支持 36 个拼块。')
        elif 'tileTwists' in data:raise ValueError('逐块扭转参数只能用于逐块扭转输出。')
        if output!='tile-twists' and any(key in data for key in ('stationaryFace','monolithicOptions')):
            raise ValueError('固定面与整体合并选项只适用于逐块扭转的整片折后图。')
        if 'lattice' in data:
            lattice=points(data['lattice'],-20,20,2,2)
            u,v=lattice
            if abs(u[0]*v[1]-u[1]*v[0])<1e-8:raise ValueError('两个周期向量不能为零或共线。')
            out['lattice']=lattice
        if tile_count > 192:
            raise ValueError('拼接后最多允许 192 个面。')
    elif family == 'ring':
        mode=data.get('ringMode','mesh')
        if mode not in ('mesh','origamica'):raise ValueError('环状构造模式无效。')
        out.update(sides=number(data,'sides',8,3,20 if mode=='origamica' else 16,True), rings=number(data,'rings',2,1,4,True), growth=number(data,'growth',1.8,1.2,2.5))
        if mode=='origamica':
            if any(key in data for key in ('radii','includeCenter','dualTargets')):raise ValueError('原版环状传播不使用梯形半径、中心点或对偶编辑。')
            if not .1<=out['angle']<=80:raise ValueError('原版环状传播褶角须在 0.1°–80° 之间。')
            count=out['rings']
            p_radii=data.get('outerRadii',[1+.8*i for i in range(count+1)])
            r_radii=data.get('creaseRadii',[1+.8*i+.35 for i in range(count)])
            if not isinstance(p_radii,list) or not isinstance(r_radii,list) or len(p_radii)!=count+1 or len(r_radii)!=count:
                raise ValueError('原版环状传播需要环数+1 个外环半径和环数个中间半径。')
            p_radii=[number({'r':r},'r',1,.001,10) for r in p_radii]
            r_radii=[number({'r':r},'r',1,.001,10) for r in r_radii]
            if any(not a+1e-5<b<c-1e-5 for a,b,c in zip(p_radii,r_radii,p_radii[1:])):
                raise ValueError('每个中间半径必须严格处于相邻两个外环半径之间。')
            out.update(ringMode=mode,outerRadii=p_radii,creaseRadii=r_radii,
                       offsetAngle=number(data,'offsetAngle',0,-180,180))
            variants = sum(any(key in data for key in pair) for pair in (
                ('outerProfiles','creaseProfiles'), ('outerExpressions','creaseExpressions'),
                ('outerVectors','creaseVectors'), ('outerLinearMaps','creaseLinearMaps'),
                ('outerFourierCurves','creaseFourierCurves'),
                ('outerSignedPowers','creaseSignedPowers'),
                ('outerVectorExpressions','creaseVectorExpressions'),
                ('outerVectorTemplate','creaseVectorTemplate')))
            if variants > 1:
                raise ValueError('极坐标采样、公式与二维向量曲线不能同时使用。')
            definitions = None
            if 'vectorFunctionDefinitions' in data:
                from tessellation_ring_vector_expression import validate_vector_function_definitions
                if 'outerVectorExpressions' not in data and 'outerVectorTemplate' not in data:
                    raise ValueError('局部纯函数定义仅用于二维数值公式。')
                definitions = validate_vector_function_definitions(data['vectorFunctionDefinitions'])
                out['vectorFunctionDefinitions'] = definitions
            if 'outerProfiles' in data or 'creaseProfiles' in data:
                if 'outerProfiles' not in data or 'creaseProfiles' not in data:
                    raise ValueError('自定义极坐标曲线需同时提供外环与中间圆采样。')
                def profiles(key,count):
                    value=data[key]
                    if not isinstance(value,list) or len(value)!=count:
                        raise ValueError('极坐标曲线采样组数与环数不一致。')
                    result=[]
                    for row in value:
                        if not isinstance(row,list) or not 8<=len(row)<=64:
                            raise ValueError('每条极坐标曲线须有 8–64 个等角度半径倍率采样。')
                        result.append([number({'v':v},'v',1,.5,1.5) for v in row])
                    return result
                out['outerProfiles']=profiles('outerProfiles',count+1)
                out['creaseProfiles']=profiles('creaseProfiles',count)
            if 'outerExpressions' in data or 'creaseExpressions' in data:
                from tessellation_ring_original import compile_radius_expression
                if 'outerExpressions' not in data or 'creaseExpressions' not in data:
                    raise ValueError('极坐标公式须同时提供外环与中间环。')
                for key,size,bases in (('outerExpressions',count+1,p_radii),('creaseExpressions',count,r_radii)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('极坐标公式组数与环数不一致。')
                    out[key]=[]
                    for expression,radius in zip(rows,bases):
                        formula=compile_radius_expression(expression)
                        for j in range(256):formula(radius,math.tau*j/256)
                        if abs(formula(radius,0)-formula(radius,math.tau))>1e-6*max(1,radius):
                            raise ValueError('极坐标公式在 0 与 2π 处必须连续闭合。')
                        out[key].append(expression)
            if 'outerVectors' in data or 'creaseVectors' in data:
                from tessellation_ring_original import validate_vector_polygon
                if 'outerVectors' not in data or 'creaseVectors' not in data:
                    raise ValueError('二维向量曲线须同时提供外环和中间环。')
                for key,size in (('outerVectors',count+1),('creaseVectors',count)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('二维向量曲线组数与环数不一致。')
                    out[key]=[validate_vector_polygon(row) for row in rows]
            if 'outerLinearMaps' in data or 'creaseLinearMaps' in data:
                from tessellation_ring_vector_ellipse import validate_linear_map
                if 'outerLinearMaps' not in data or 'creaseLinearMaps' not in data:
                    raise ValueError('二维线性曲线须同时提供外环和中间环。')
                for key,size in (('outerLinearMaps',count+1),('creaseLinearMaps',count)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('二维线性曲线组数与环数不一致。')
                    out[key]=[validate_linear_map(row) for row in rows]
            if 'outerFourierCurves' in data or 'creaseFourierCurves' in data:
                from tessellation_ring_vector_fourier import validate_fourier_curve
                if 'outerFourierCurves' not in data or 'creaseFourierCurves' not in data:
                    raise ValueError('二维傅里叶曲线须同时提供外环和中间环。')
                for key,size in (('outerFourierCurves',count+1),('creaseFourierCurves',count)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('二维傅里叶曲线组数与环数不一致。')
                    out[key]=[validate_fourier_curve(row) for row in rows]
            if 'outerSignedPowers' in data or 'creaseSignedPowers' in data:
                from tessellation_ring_signed_power import validate_signed_power
                if 'outerSignedPowers' not in data or 'creaseSignedPowers' not in data:
                    raise ValueError('圆到方形二维向量幂须同时提供外环和中间环。')
                for key,size in (('outerSignedPowers',count+1),('creaseSignedPowers',count)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('圆到方形二维向量幂组数与环数不一致。')
                    out[key]=[validate_signed_power(row) for row in rows]
            if 'outerVectorExpressions' in data or 'creaseVectorExpressions' in data:
                from tessellation_ring_vector_expression import validate_vector_expression
                if 'outerVectorExpressions' not in data or 'creaseVectorExpressions' not in data:
                    raise ValueError('二维向量公式须同时提供外环和中间环。')
                for key,size in (('outerVectorExpressions',count+1),('creaseVectorExpressions',count)):
                    rows=data[key]
                    if not isinstance(rows,list) or len(rows)!=size:
                        raise ValueError('二维向量公式组数与环数不一致。')
                    out[key]=[validate_vector_expression(row,definitions) for row in rows]
            if 'outerVectorTemplate' in data or 'creaseVectorTemplate' in data:
                from tessellation_ring_vector_expression import validate_vector_template
                if 'outerVectorTemplate' not in data or 'creaseVectorTemplate' not in data:
                    raise ValueError('索引二维向量公式须同时提供 pfn 和 rfn。')
                out['outerVectorTemplate']=validate_vector_template(data['outerVectorTemplate'],count+1,definitions)
                out['creaseVectorTemplate']=validate_vector_template(data['creaseVectorTemplate'],count,definitions)
        elif any(key in data for key in ('outerRadii','creaseRadii','offsetAngle','outerProfiles','creaseProfiles','outerExpressions','creaseExpressions','outerVectors','creaseVectors','outerLinearMaps','creaseLinearMaps','outerFourierCurves','creaseFourierCurves','outerSignedPowers','creaseSignedPowers','outerVectorExpressions','creaseVectorExpressions','outerVectorTemplate','creaseVectorTemplate','vectorFunctionDefinitions')):
            raise ValueError('曲线半径和初始相位仅用于原版环状传播。')
        elif 'radii' in data:
            radii=data['radii']
            if not isinstance(radii,list) or not 1<=len(radii)<=8:raise ValueError('需要 1–8 个严格递增的正半径。')
            out['radii']=[number({'r':r},'r',1,.001,10) for r in radii]
            if any(b-a<1e-5 for a,b in zip(out['radii'],out['radii'][1:])):raise ValueError('半径须严格递增且相邻间距不少于 0.00001。')
            if not isinstance(data.get('includeCenter',False),bool):raise ValueError('包含中心须为布尔值。')
            out['includeCenter']=data.get('includeCenter',False)
        elif 'includeCenter' in data:raise ValueError('中心点选项需要自定义半径列表。')
    else:
        out.update(rows=number(data,'rows',3,2,6,True), columns=number(data,'columns',3,2,6,True), width=number(data,'width',.25,.1,.45))
        if family == 'flagstone':
            if 'shrinkage' in data:out['shrinkage']=number(data,'shrinkage',.8,.05,.99)
            if 'junctionAssignment' in data:
                if data['junctionAssignment'] not in ('original','tuck'):raise ValueError('铺石交汇赋型须为原版统一或兼容折入。')
                out['junctionAssignment']=data['junctionAssignment']
            if 'motherParams' in data:
                from tessellation_prune import PRUNABLE
                from tessellate import validate_request
                source=data['motherParams']
                if not isinstance(source,dict) or source.get('family') not in PRUNABLE:raise ValueError('铺石母结构须为支持的平面网格构造。')
                out['motherParams']=validate_request(source)
            if 'dualTargets' in data:out['dualTargets']=points(data['dualTargets'],-100,100,maximum=256)
            out['aspect'] = number(data,'aspect',1,.5,2)
            tiling=data.get('tiling','square')
            if tiling not in ('square','triangle','hexagon'):raise ValueError('铺石母结构类型无效。')
            if tiling!='square' and out['aspect']!=1:raise ValueError('砖块宽比仅适用于方格铺石。')
            out['tiling']=tiling
            if 'motherParams' in out and out['aspect']!=1:raise ValueError('外部母结构保持原始比例，不支持砖块宽比。')
        else:
            weave = data.get('weave','plain')
            if weave not in ('plain','twill','basket'):
                raise ValueError('编织方式无效。')
            out.update(weave=weave, phase=number(data,'phase',0,0,1,True))
    return out


def archimedean_mesh(kind, rings):
    from pleat.example_graphs import from_tiles
    from pleat.example_tilesets import t_3_12_12, t_4_6_12, t_3_3_4_3_4, t_3_3_3_3_6, curved_truncate, curved_expand, align_tiles, pgg_2x, u2_4_6_12__3_4_6_4
    from pleat.prototiles import RegularEuclideanTile, EuclideanProtoTile
    from pleat.io.fold import graph_to_fold
    if kind == '3.3.3.4.4':
        polygons = []; n = 2*rings+1; h = math.sqrt(3)/2
        for row in range(n):
            x, y = row/2, row*(1+h)
            for col in range(n):
                a=x+col
                polygons.append([[a,y],[a+1,y],[a+1,y+1],[a,y+1]])
                polygons.append([[a,y+1],[a+1,y+1],[a+.5,y+1+h]])
                if col < n-1:
                    polygons.append([[a+1,y+1],[a+1.5,y+1+h],[a+.5,y+1+h]])
        return polygon_mesh(polygons)
    if kind=='equilateral-pentagon':
        # Unit edges close with sin(theta)=3/4; the two right angles meet
        # four-at-a-vertex and the other three angles sum to a full turn.
        theta=math.pi-math.asin(.75);ps=[[0.,0.]]
        for angle in (0,theta/2,theta,theta+math.pi/2):ps.append([ps[-1][0]+math.cos(angle),ps[-1][1]+math.sin(angle)])
        tile=EuclideanProtoTile(points=ps)
        for a,b in ((0,4),(2,3),(1,1)):align_tiles(tile,a,tile,b)
        tiles=[tile]
    elif kind == '3.6.3.6':
        tri = RegularEuclideanTile(3,edge_labels=['h']*3)
        hexa = RegularEuclideanTile(6,edge_labels=['t']*6)
        align_tiles(tri,'h',hexa,'t'); tiles = [tri,hexa]
    else:
        tiles = {'3.12.12':t_3_12_12, '4.6.12':t_4_6_12, '3.3.4.3.4':t_3_3_4_3_4,
                 '3.3.3.3.6':t_3_3_3_3_6, '4.8.8':lambda:curved_truncate(4,4), '3.4.6.4':lambda:curved_expand(6,3), 'pgg':pgg_2x, '2uniform':u2_4_6_12__3_4_6_4}[kind]()
    return canonical_fold(graph_to_fold(from_tiles(tiles,rings=rings)))


def resch_star_mesh(order, tip_degrees, rings):
    """Equal-edge n-stars alternate with regular 6/4/3-gons.

    At every interior tiling vertex, a star tip and a star reflex angle
    leave 360/n degrees for the regular polygon. The stars are split into
    convex tip triangles and a central n-gon for the flat-twist pipeline;
    this does not simulate the original spatial Resch folding mechanism.
    """
    import numpy as np
    from pleat.prototiles import EuclideanProtoTile, RegularEuclideanTile
    from pleat.example_tilesets import align_tiles
    from pleat.example_graphs import from_tiles
    from pleat.io.fold import graph_to_fold
    tip=math.radians(tip_degrees)
    ratio=math.sin(tip/2)/math.sin(tip/2+math.pi/order)
    shape=np.array([[(1 if i%2==0 else ratio)*math.cos(math.pi*i/order),(1 if i%2==0 else ratio)*math.sin(math.pi*i/order)] for i in range(2*order)])
    shape/=np.linalg.norm(shape[1]-shape[0])
    star=EuclideanProtoTile(points=shape,edge_labels=['regular','star']*order)
    sides={3:6,4:4,6:3}[order]
    regular=RegularEuclideanTile(sides,edge_labels=['star']*sides)
    align_tiles(star,'star',star,'star');align_tiles(star,'regular',regular,'star')
    outline=canonical_fold(graph_to_fold(from_tiles([star,regular],rings=rings)))
    polygons=[]
    for face in outline['faces_vertices']:
        p=[outline['vertices_coords'][i] for i in face]
        cross=[(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) for a,b,c in zip(p,p[1:]+p[:1],p[2:]+p[:2])]
        reflex={(i+1)%len(p) for i,x in enumerate(cross) if x>1e-8}
        if not reflex:polygons.append(p);continue
        polygons.append([p[i] for i in sorted(reflex)])
        polygons.extend([p[(i-1)%len(p)],p[i],p[(i+1)%len(p)]] for i in range(len(p)) if i not in reflex)
    return polygon_mesh(polygons)


def assign_local_mv(fold, preferred=None, preserve=False):
    """Bounded binary solve for Maekawa and strict local-minimum sectors.

    This is an assignment search, NOT a global layer-order certificate.
    """
    import numpy as np
    from scipy.optimize import milp, Bounds, LinearConstraint
    from scipy.sparse import lil_matrix
    coords=fold['vertices_coords']; edges=fold['edges_vertices']; assignments=fold['edges_assignment']
    border={v for edge,a in zip(edges,assignments) if a=='B' for v in edge}
    active=[i for i,a in enumerate(assignments) if a!='B']; ids={e:i for i,e in enumerate(active)}
    incident=defaultdict(list)
    for i,(a,b) in enumerate(edges):
        incident[a].append((i,b));incident[b].append((i,a))
    vertices=[v for v in incident if v not in border]; rows=[]; rhs=[]
    for j,v in enumerate(vertices):
        ns=incident[v]; d=len(ns)
        if d%2 or d<2:
            raise ValueError('铺石拓扑含不支持的内部顶点。')
        rows.append({**{ids[e]:1 for e,_ in ns},len(active)+j:-2});rhs.append((d-2)/2)
        ns=sorted(ns,key=lambda p:math.atan2(coords[p[1]][1]-coords[v][1],coords[p[1]][0]-coords[v][0]))
        angles=[math.atan2(coords[k][1]-coords[v][1],coords[k][0]-coords[v][0]) for _,k in ns]
        sectors=[(angles[(i+1)%d]-angles[i])%math.tau for i in range(d)]
        for i,s in enumerate(sectors):
            if s+1e-7<min(sectors[i-1],sectors[(i+1)%d]):
                rows.append({ids[ns[i][0]]:1,ids[ns[(i+1)%d][0]]:1});rhs.append(1)
    n=len(active)+len(vertices);matrix=lil_matrix((len(rows),n))
    for i,row in enumerate(rows):
        for j,value in row.items():matrix[i,j]=value
    cost=np.zeros(n)
    for i,e in enumerate(active):cost[i]=(-1 if preferred and preferred[e]=='M' else 1)+(i+1)*1e-5
    lower=np.zeros(n);upper=np.ones(n)
    if preserve:
        for e,i in ids.items():
            if assignments[e] in ('M','V'):lower[i]=upper[i]=int(assignments[e]=='M')
    result=milp(cost,integrality=np.ones(n),bounds=Bounds(lower,upper),constraints=LinearConstraint(matrix.tocsr(),rhs,rhs),options={'time_limit':5})
    if result.x is None:
        raise ValueError('当前构造的局部山谷赋型无解，请调整旋转角、缩放或褶宽。' if result.status==2 else '局部赋型在 5 秒限时内未完成，请减小构造规模。')
    for e in active:assignments[e]='M' if result.x[ids[e]]>.5 else 'V'
    fold['edges_foldAngle']=[{'M':-180,'V':180}.get(a) for a in assignments]
    return fold


def orient_rotational_dual_edges(graph):
    """In[1132]/In[3386]: radial-major outward, then axial CCW ordering."""
    from pleat.shrink_rotate.crease_orientation import THIS_WAY

    for edge in graph.halfedges:
        if (edge.face is None or edge.rev.face is None
                or THIS_WAY in edge.attributes or THIS_WAY in edge.rev.attributes):
            continue
        p1=edge.face['reciprocal_pos']
        p2=edge.rev.face['reciprocal_pos']
        dx,dy=(float(p2[k]-p1[k]) for k in (0,1))
        length=math.hypot(dx,dy)
        if length<=1e-12:
            raise ValueError('旋转梯形的对偶边长度为零，无法按原版径向规则定向。')
        mx,my=(float((p1[k]+p2[k])/2) for k in (0,1))
        mid_length=math.hypot(mx,my)
        if mid_length<=1e-10:
            forward=True
        else:
            radial=(dx*mx+dy*my)/(length*mid_length)
            forward=radial>0 if abs(radial)>1e-6 else (mx*dy-my*dx)>0
        (edge if forward else edge.rev)[THIS_WAY]=True


def build_mother(params):
    from pleat.io.fold import graph_to_fold
    family=params['family'];source={}
    if family=='flagstone' and 'motherParams' in params:
        mother,details=build_mother(params['motherParams'])
        source.update(motherSource=details)
    elif family=='primal-dual' and 'motherParams' in params:
        mother,details=build_mother(params['motherParams'])
        source.update(motherSource=details,motherFamily=params['motherParams']['family'])
    elif family=='primal-dual':
        from pleat.example_graphs import from_tiles
        from pleat.example_tilesets import platonic
        mother=graph_to_fold(from_tiles(platonic({'square':4,'triangle':3,'hexagon':6}[params['tiling']]),rings=params['rings']))
    elif family=='archimedean':
        if params['tiling'] in ('cairo','double-cairo'):
            from tessellation_cairo import cairo_cell,cairo_mesh
            double=params['tiling']=='double-cairo'
            mother=cairo_mesh(params['cairoAngle'],double,params['repeatX'],params['repeatY'])
            source.update(periodicCell=cairo_cell(params['cairoAngle'],double),mesh='double Cairo equilateral pentagons' if double else 'Cairo equilateral pentagons')
        elif params['tiling'] in TWO_UNIFORM:
            from tessellation_uniform import uniform_mesh, uniform_cell
            index=int(params['tiling'].rsplit('-',1)[1])
            mother=uniform_mesh(index,params['rings'])
            source.update(twoUniform=index,periodicCell=uniform_cell(index),mesh='two-uniform regular polygon tiling')
        elif params['tiling'] in RESCH_CATALOG:
            from tessellation_resch import resch_mesh,resch_cell
            index=int(params['tiling'].rsplit('-',1)[1])
            mother=resch_mesh(index,params['starAngle'],params['rings'])
            source.update(resch=index,periodicCell=resch_cell(index,params['starAngle']),mesh='Resch star tiling / convex subdivision',starTipAngle=params['starAngle'])
        elif params['tiling'] in RESCH:
            mother=resch_star_mesh(int(params['tiling'][-1]),params['starAngle'],params['rings'])
            source.update(mesh='Resch star tiling / convex subdivision',starTipAngle=params['starAngle'])
        else:mother=archimedean_mesh(params['tiling'],params['rings'])
    elif family=='nonperiodic':
        seed_points=params.get('points') or seeded_points(params['count'],params['seed'],params.get('boundary'))
        if params['kind']=='goldberg' and params.get('goldbergVersion')=='origamica':
            from tessellation_goldberg import goldberg_mesh
            m,n,o=params['goldbergOrder'],params['goldbergRings'],params['goldbergOffset']
            mother=goldberg_mesh(m,n,o)
            source.update(mesh='Origamica radial unit triangles',dual='face circumcenters',goldbergOrder=m,goldbergRings=n,goldbergOffset=o)
        elif params['kind']=='goldberg':
            from pleat.example_graphs import rosette
            from pleat.conway import goldberg2_graph
            graph=rosette(5)
            for _ in range(params['depth']):graph=goldberg2_graph()(graph)
            mother=canonical_fold(graph_to_fold(graph))
        else:
            mother=penrose_mesh(params['depth'],params.get('penroseVersion','legacy'),params.get('borderTriangles',True)) if params['kind']=='penrose' else site_mesh(params['kind'],seed_points,params.get('boundary'),params.get('boundaryMode','square'))
        if params['kind'] in ('voronoi','delaunay'):source['seedPoints']=seed_points
    elif family=='ring':
        if 'radii' in params:
            from tessellation_meshes import rotational_trapezoid_mesh
            mother=rotational_trapezoid_mesh(params['sides'],params['radii'],params['includeCenter'])
            source.update(mesh='rotational cyclic trapezoids',radii=params['radii'],includeCenter=params['includeCenter'])
        else:mother=ring_mesh(params['sides'],params['rings'],params['growth'])
    elif family=='custom':
        if 'range1' in params:
            from tessellation_lattice_patch import polygons_from_custom,lattice_patch_mesh
            mother=lattice_patch_mesh(polygons_from_custom(params['vertices'],params['faces']),params['lattice'],params['range1'],params['range2'])
        else:
            mother=custom_mesh(params['vertices'],params['faces'],params['repeatX'],params['repeatY'],params.get('lattice'))
    else:
        mother=regular_patch(params['tiling'],params['rows'],params['columns'])
    if 'pruneBoundary' in params:
        from tessellation_prune import prune_mesh
        mother=prune_mesh(mother,params['pruneBoundary'])
    from tessellate import check_geometry
    counts=defaultdict(int)
    for face in mother['faces_vertices']:
        for a,b in zip(face,face[1:]+face[:1]):counts[tuple(sorted((a,b)))]+=1
    face_limit = (600 if params.get('_paperExpansionInternal') and
                  family == 'archimedean' and params.get('tiling') in ('cairo', 'double-cairo')
                  else 256)
    if len(mother['faces_vertices'])>face_limit or max(counts.values())>2 or len(mother['vertices_coords'])-len(mother['edges_vertices'])+len(mother['faces_vertices'])!=1 or check_geometry(mother)['status']!='passed':
        raise ValueError(f'母结构必须是无交叉、无重叠、无孔洞的连续平面网格，且不超过 {face_limit} 个面。')
    return mother,source


def advanced_construct(params):
    if params['family']=='ring' and params.get('ringMode')=='origamica':
        from tessellation_ring_original import circular_ring_pattern
        from tessellate import check_geometry,check_local_conditions

        fold,flat,error=circular_ring_pattern(params['sides'],params['outerRadii'],params['creaseRadii'],params['angle'],params['offsetAngle'],
                                              outer_profiles=params.get('outerProfiles'),crease_profiles=params.get('creaseProfiles'),
                                              outer_expressions=params.get('outerExpressions'),crease_expressions=params.get('creaseExpressions'),
                                              outer_vectors=params.get('outerVectors'),crease_vectors=params.get('creaseVectors'),
                                              outer_linear_maps=params.get('outerLinearMaps'),crease_linear_maps=params.get('creaseLinearMaps'),
                                              outer_fourier_curves=params.get('outerFourierCurves'),crease_fourier_curves=params.get('creaseFourierCurves'),
                                              outer_signed_powers=params.get('outerSignedPowers'),crease_signed_powers=params.get('creaseSignedPowers'),
                                              outer_vector_expressions=params.get('outerVectorExpressions'),crease_vector_expressions=params.get('creaseVectorExpressions'),
                                              outer_vector_template=params.get('outerVectorTemplate'),crease_vector_template=params.get('creaseVectorTemplate'),
                                              vector_function_definitions=params.get('vectorFunctionDefinitions'))
        if check_geometry(fold)['status']!='passed' or check_local_conditions(fold)['status']!='passed':
            raise ValueError('原版环状传播产生相交折痕或不满足局部平折条件；请调整半径或褶角。')
        source={'name':'折纸工作台','license':'GPL-3.0-only','algorithm':'Origamica p/q/r/s polar propagation',
                'version':2,'foldedForm':flat,'closureError':error,
                'curveFamily':'indexed-vector-expression' if 'outerVectorTemplate' in params else 'numeric-vector-expression' if 'outerVectorExpressions' in params else 'signed-power-superellipse' if 'outerSignedPowers' in params else 'vector-fourier' if 'outerFourierCurves' in params else 'linear-ellipse' if 'outerLinearMaps' in params else 'cartesian-polygon' if 'outerVectors' in params else 'analytic-polar' if 'outerExpressions' in params else 'sampled-polar' if 'outerProfiles' in params else 'circles',
                'scope':'bounded numerical polar formulas, periodic radial profiles, origin-visible Cartesian polygons, certified linear ellipses, finite vector Fourier curves, certified per-ring or indexed vector expressions, or Origamica signed-power vector superellipses; arbitrary Mathematica symbolic functions not supported'}
        from tessellation_ring_vector_expression import ring_log_numeric_domain
        log_domain=ring_log_numeric_domain(params)
        if log_domain is not None:source['logNumericDomain']=log_domain
        return fold,None,None,4*params['rings']*params['sides']+1,source
    if params['family']=='polygon-tile':
        from tessellation_tile_twist import construct_polygon_tile
        return construct_polygon_tile(params)
    if params['family']=='woven-lines':
        from tessellation_woven import construct_woven
        return construct_woven(params)
    if params['family']=='split':
        from tessellation_split_exact import construct_exact_split
        return construct_exact_split(params)
    if params['family']=='brocard':
        from tessellation_brocard import construct_brocard
        return construct_brocard(params)
    import numpy as np
    from pleat.io.fold import fold_to_graph, graph_to_fold
    from pleat.shrink_rotate import shrink_rotate_pattern
    from pleat.shrink_rotate.crease_orientation import assign_this_way_by_bfs,THIS_WAY
    family=params['family'];dual=None
    source={'name':'折纸工作台 / Pleat','license':'GPL-3.0-only / MIT','algorithm':family,'version':1}
    if family=='woven':
        from tessellation_box_woven import construct_box_woven
        return construct_box_woven(params)
    mother,details=build_mother(params)
    source.update(details)
    if params.get('customOutput')=='tile-twists':
        from tessellation_tile_patch import construct_tile_patch
        from tessellation_flat_embedding import flat_face_embedding

        fold=construct_tile_patch(mother,params['tileTwists'],params['vertices'],params['faces'],
                                  params.get('monolithicOptions'))
        stationary_face=params.get('stationaryFace',0)
        flat,closure=flat_face_embedding(fold,stationary_face)
        source.update(name='折纸工作台',license='GPL-3.0-only',algorithm='individually twisted polygon tiles / checked seam joins',
                      version=2,output='tile-twists',tileTwists=params['tileTwists'],foldedForm=flat,closureError=closure,
                      foldedFormStationaryFace=stationary_face,mergedEdgeMode=fold['zhezhi_merged_edge_mode'],
                      monolithicOptions=fold['zhezhi_monolithic_options'])
        return fold,mother,None,len(mother['faces_vertices']),source
    if params.get('cairoOutput')=='tiling' or params.get('customOutput')=='tiling' or params.get('goldbergOutput')=='tiling':
        fold=canonical_fold(make_fold(mother['vertices_coords'],mother['edges_vertices'],['B' if a=='B' else 'F' for a in mother['edges_assignment']],mother['faces_vertices']))
        fold['edges_foldAngle']=[0 if a=='F' else None for a in fold['edges_assignment']]
        algorithm='custom polygon outline / no pleat' if family=='custom' else 'Goldberg radial unit triangles / exact rotational joins' if params.get('goldbergOutput')=='tiling' else 'Cairo unit-edge closure / exact periodic joins'
        source.update(name='折纸工作台',license='GPL-3.0-only',algorithm=algorithm,output='tiling')
        return fold,mother,None,len(mother['faces_vertices']),source
    if len(mother['faces_vertices'])==1:
        # No shared edge exists to create a pleat; retain the single paper tile.
        ps=np.array(mother['vertices_coords']);center=ps.mean(axis=0)
        theta=math.radians(params.get('angle',0));c,s=math.cos(theta),math.sin(theta)
        transformed=center+(ps-center)@np.array([[c,s],[-s,c]])*params.get('scale',params.get('shrinkage',1))
        fold=canonical_fold(make_fold(transformed.tolist(),mother['edges_vertices'],['B']*len(mother['edges_vertices']),mother['faces_vertices']))
        source.update(name='折纸工作台',license='GPL-3.0-only',algorithm='single paper tile / rigid transform / no shared-edge pleats')
        return fold,mother,None,1,source
    try:graph=fold_to_graph(mother)
    except (KeyError,AssertionError,ValueError):
        raise ValueError('母结构邻接不一致，请检查面边界或重复的面。') from None
    if family=='flagstone':
        from tessellation_flagstone import maxmin_flagstone_centers, parallel_flagstone
        targets=params.get('dualTargets',params.get('motherParams',{}).get('dualTargets',
                           mother.get('zhezhi_voronoi_dual_targets',mother.get('zhezhi_penrose_dual_targets'))))
        original_assignment=params.get('junctionAssignment','original')=='original'
        centers,dual=(maxmin_flagstone_centers(mother,targets) if original_assignment else reciprocal_centers(mother,targets))
        # Rectangular tiles retain the square dual and hence square molecules.
        for p in mother['vertices_coords']:p[0]*=params['aspect']
        fold=parallel_flagstone(mother,centers,params['width'],params.get('shrinkage'),params.get('junctionAssignment','original'))
        if 'motherParams' in params:
            from tessellate import check_geometry,check_local_conditions
            if check_geometry(fold)['status']!='passed' or check_local_conditions(fold)['status'] not in ('passed','not_applicable'):
                raise ValueError('该母结构的铺石双褶发生交叉或不满足局部平折条件，当前构造不能采用；请调整母结构或对偶点。')
        reciprocal_method=('feasible input reciprocal or max-min fallback' if targets is not None
                           else 'max-min reciprocal')
        source.update(name='折纸工作台',license='GPL-3.0-only',algorithm=f'parallel-pleat / {reciprocal_method} / circumcenter molecules / uniform junction assignment',version=2)
        source.update(shrinkage=params.get('shrinkage'),junctionAssignment=params.get('junctionAssignment','original'))
        if not original_assignment:source['algorithm']='parallel-pleat / centroid reciprocal / circumcenter molecules / legacy directional tuck assignment'
    else:
        targets=params.get('dualTargets',params.get('motherParams',{}).get('dualTargets',
                           mother.get('zhezhi_goldberg_dual_targets',mother.get('zhezhi_voronoi_dual_targets',
                           mother.get('zhezhi_penrose_dual_targets',mother.get('zhezhi_rotational_trapezoid_dual_targets'))))))
        if targets is None and family=='nonperiodic' and params['kind']=='delaunay':
            targets=[]
            for face in mother['faces_vertices']:
                ps=np.array([mother['vertices_coords'][i] for i in face]);a=ps[0]
                targets.append(np.linalg.solve(2*(ps[1:]-a),np.sum(ps[1:]**2,axis=1)-np.sum(a*a)).tolist())
        if family=='primal-dual' and params.get('reciprocalMethod')=='original-min-total-pleat':
            from tessellation_reciprocal_min_total import min_total_pleat_from_mother,validate_custom_mother_input
            validate_custom_mother_input(params['motherParams'],mother)
            centers,dual,proof=min_total_pleat_from_mother(mother,targets)
            source['reciprocalMinTotalPleat']=proof
        else:
            centers,dual=reciprocal_centers(mother,targets)
        source_penrose_targets=mother.get('zhezhi_penrose_dual_targets')
        if (source_penrose_targets is not None and 'dualTargets' not in params
                and 'dualTargets' not in params.get('motherParams',{})):
            # In[3382] records each a2/o2 triangle's exact numeric reciprocal
            # coordinate before pairing rhombs. The solver certifies the
            # joined graph but its least-squares projection is not that source
            # coordinate. Retain the prescribed points only when they satisfy
            # every current interior primal edge after mesh deduplication.
            if any(math.dist(actual,source)>1e-8 for actual,source in zip(centers,source_penrose_targets)):
                raise ValueError('Penrose 原版对偶点需要实质投影，不能冒充原版对偶。')
            owners={}
            for face_id,face in enumerate(mother['faces_vertices']):
                for a,b in zip(face,face[1:]+face[:1]):
                    owners.setdefault(tuple(sorted((a,b))),[]).append(face_id)
            for (a,b),adjacent in owners.items():
                if len(adjacent)!=2:continue
                edge=[mother['vertices_coords'][b][k]-mother['vertices_coords'][a][k] for k in (0,1)]
                offset=[source_penrose_targets[adjacent[1]][k]-source_penrose_targets[adjacent[0]][k] for k in (0,1)]
                if abs(sum(x*y for x,y in zip(edge,offset)))/math.hypot(*edge)>1e-9:
                    raise ValueError('Penrose 原版对偶点与当前母结构不垂直，不能以投影坐标冒充原版对偶。')
            centers=[point[:] for point in source_penrose_targets]
            dual['vertices_coords']=[point[:] for point in centers]
            source['dual']='Penrose source triangle coordinates'
        source_voronoi_targets=mother.get('zhezhi_voronoi_dual_targets')
        if (source_voronoi_targets is not None and 'dualTargets' not in params
                and 'dualTargets' not in params.get('motherParams',{})):
            # A least-squares projection can move an already valid site when
            # the reciprocal system is ill-conditioned.  Test the source
            # bisectors directly before retaining the exact input sites.
            owners={}
            for face_id,face in enumerate(mother['faces_vertices']):
                for a,b in zip(face,face[1:]+face[:1]):
                    owners.setdefault(tuple(sorted((a,b))),[]).append(face_id)
            for (a,b),adjacent in owners.items():
                if len(adjacent)!=2:continue
                edge=[mother['vertices_coords'][b][k]-mother['vertices_coords'][a][k] for k in (0,1)]
                sites=[source_voronoi_targets[adjacent[1]][k]-source_voronoi_targets[adjacent[0]][k] for k in (0,1)]
                if abs(sum(x*y for x,y in zip(edge,sites)))/math.hypot(*edge)>1e-6:
                    raise ValueError('Voronoi 输入种子不满足分区边的垂直对偶关系，请调整种子或边界。')
            # The reciprocal solver certifies the bounded graph, but its
            # projection can move sites by a few nanounits after mesh rounding.
            # Origamica uses the supplied points themselves as DualVertices.
            centers=[point[:] for point in source_voronoi_targets]
            dual['vertices_coords']=[point[:] for point in centers]
            source['dual']='input Voronoi seeds'
        source_ring_targets=mother.get('zhezhi_rotational_trapezoid_dual_targets') if family=='ring' else None
        if source_ring_targets is not None and 'dualTargets' not in params:
            # In[3385] uses each face's circumcenter verbatim.  Certify that
            # mesh rounding preserved a positive orthogonal reciprocal before
            # replacing the generic centroid projection with those centers.
            owners={}
            for face_id,face in enumerate(mother['faces_vertices']):
                for a,b in zip(face,face[1:]+face[:1]):
                    owners.setdefault(tuple(sorted((a,b))),[]).append(face_id)
            for (a,b),adjacent in owners.items():
                if len(adjacent)!=2:continue
                edge=[mother['vertices_coords'][b][k]-mother['vertices_coords'][a][k] for k in (0,1)]
                delta=[source_ring_targets[adjacent[1]][k]-source_ring_targets[adjacent[0]][k] for k in (0,1)]
                length=math.hypot(*edge)
                if abs(sum(x*y for x,y in zip(edge,delta)))/length>1e-9:
                    raise ValueError('旋转梯形原版外心与当前母结构不垂直，请调整半径。')
                normal=[-edge[1],edge[0]]
                centroids=[[sum(mother['vertices_coords'][i][k] for i in mother['faces_vertices'][j])/len(mother['faces_vertices'][j])
                            for k in (0,1)] for j in adjacent]
                if sum(normal[k]*(centroids[1][k]-centroids[0][k]) for k in (0,1))<0:
                    normal=[-x for x in normal]
                if sum(normal[k]*delta[k] for k in (0,1))<=0:
                    raise ValueError('旋转梯形原版外心未形成正向对偶，请调整半径。')
            centers=[point[:] for point in source_ring_targets]
            dual['vertices_coords']=[point[:] for point in centers]
            source['dual']='rotational trapezoid face circumcenters'
        if params.get('goldbergVersion')=='origamica' and 'dualTargets' not in params and any(math.dist(a,b)>1e-7 for a,b in zip(centers,targets)):
            raise ValueError('原版 Goldberg 外心对偶在此旋转阶发生交叉或退化；可查看母结构排布，不能将调整后的对偶冒充原版扭转。')
        for face,center in zip(sorted(graph.faces,key=lambda f:f['id']),centers):face['reciprocal_pos']=np.array(center)
        if family=='ring':
            orient_rotational_dual_edges(graph)
            source['assignmentMethod']='Origamica radial-major outward / axial CCW dual-edge ordering'
        else:
            center=np.mean(np.array(mother['vertices_coords']),axis=0)
            anchor=min(graph.faces,key=lambda f:(round(float(np.linalg.norm(f['reciprocal_pos']-center)),10),f['id']))
            assign_this_way_by_bfs(graph,anchor)
            if family=='primal-dual' and params.get('motherParams',{}).get('family')=='custom':
                from tessellation_primal_dual_fold import orient_custom_primal_dual_edges
                if orient_custom_primal_dual_edges(graph,mother,params['motherParams']):
                    source['assignmentMethod']='Origamica directed primal input edges / CCW dual pairs'
        if family=='primal-dual' and params.get('dualEdgeFlips'):
            coordinate_ids={tuple(round(float(c),10) for c in p):i
                            for i,p in enumerate(mother['vertices_coords'])}
            interior={}
            for edge in graph.halfedges:
                if edge.face is None or edge.rev.face is None:continue
                a=coordinate_ids.get(tuple(round(float(c),10) for c in edge.orig['pos']))
                b=coordinate_ids.get(tuple(round(float(c),10) for c in edge.dest['pos']))
                if a is not None and b is not None:interior[tuple(sorted((a,b)))]=edge
            for pair in params['dualEdgeFlips']:
                edge=interior.get(tuple(pair))
                if edge is None:raise ValueError('所选对偶定向边不是当前母结构的内部共享边。')
                if THIS_WAY in edge.attributes:
                    del edge[THIS_WAY];edge.rev[THIS_WAY]=True
                elif THIS_WAY in edge.rev.attributes:
                    del edge.rev[THIS_WAY];edge[THIS_WAY]=True
                else:raise ValueError('所选母结构内部边没有可翻转的对偶定向。')
            source['dualEdgeFlips']=params['dualEdgeFlips']
        result=shrink_rotate_pattern(graph,alpha=np.deg2rad(params['angle']),factor=params['scale'],simplify_boundary=False)
        fold=canonical_fold(graph_to_fold(result))
        # Pleat's BFS labels can satisfy Maekawa while putting the odd crease
        # outside the acute BLB sector of an irregular Voronoi vertex. Repair
        # those labels with the same bounded local solve used for unknowns;
        # retain upstream choices as the optimization preference.
        repair_voronoi=False
        if family=='nonperiodic' and params['kind']=='voronoi' and 'U' not in fold['edges_assignment']:
            from tessellate import check_geometry
            from tessellation_lff import analyze_lff_graph

            repair_voronoi=(check_geometry(fold)['status']=='passed'
                            and analyze_lff_graph(fold,geometry_status='passed')['status']=='failed')
        if 'U' in fold['edges_assignment'] or repair_voronoi:
            fold=assign_local_mv(fold,preferred=fold['edges_assignment'].copy())
            if repair_voronoi:source.update(version=2,assignmentMethod='bounded Maekawa/BLB correction with upstream M/V preference')
        from tessellation_preview import shrink_rotate_preview
        fold['zhezhi_preview']=shrink_rotate_preview(result,fold)
        source['algorithm']='perpendicular-reciprocal / Shrink-Rotate'
    return fold,mother,dual,len(mother['faces_vertices']),source
