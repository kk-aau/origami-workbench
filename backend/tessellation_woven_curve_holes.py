"""Bounded analytic mother-hole sampling; never resample submitted vertices."""
import copy
import math


def validate_curve_holes(value, components):
    records=value.get('curveHoles')
    if not isinstance(records,list) or not 1<=len(records)<=32:
        raise ValueError('曲线母孔需要1–32个显式解析来源。')
    used=set()
    def finite(x):return not isinstance(x,bool) and isinstance(x,(int,float)) and math.isfinite(x)
    for record in records:
        if not isinstance(record,dict) or set(record)!={'component','curve','segments','maxError'}:
            raise ValueError('曲线母孔来源字段无效。')
        c,n,error,curve=(record[k] for k in ('component','segments','maxError','curve'))
        if isinstance(c,bool) or not isinstance(c,int) or not 0<=c<len(components) or c in used or isinstance(n,bool) or not isinstance(n,int) or not 8<=n<=256 or not finite(error) or not 0<error<=1000:
            raise ValueError('曲线母孔部件、段数或最大弦误差无效。')
        used.add(c)
        if not isinstance(curve,dict) or set(curve)!={'kind','center','radii','rotation'} or curve['kind']!='ellipse' or any(not isinstance(curve[k],list) or len(curve[k])!=2 or not all(finite(x) for x in curve[k]) for k in ('center','radii')) or any(abs(x)>1000 for x in curve['center']) or any(not 0<x<=1000 for x in curve['radii']) or not finite(curve['rotation']) or abs(curve['rotation'])>360:
            raise ValueError('曲线母孔需要有限圆／椭圆中心、半径及旋转角。')
        if max(curve['radii'])*(1-math.cos(math.pi/n))>error:
            raise ValueError('曲线母孔的整段弦误差超过请求值。')
        vertices=components[c]
        bindings=value.get('ringHoles')
        if len(vertices)!=n or not isinstance(bindings,list) or not any(isinstance(b,dict) and b.get('component')==c for b in bindings):
            raise ValueError('曲线母孔来源没有绑定完整独立孔环。')
        pairs={tuple(sorted(e)) for e in value['edges'] if e[0] in vertices}
        if len(pairs)!=n or any(tuple(sorted((a,b))) not in pairs for a,b in zip(vertices,vertices[1:]+vertices[:1])):
            raise ValueError('曲线母孔显式边顺序与参数采样不一致。')
        angle=curve['rotation']*math.pi/180;co,si=math.cos(angle),math.sin(angle)
        for i,v in enumerate(vertices):
            t=i*2*math.pi/n;x,y=curve['radii'][0]*math.cos(t),curve['radii'][1]*math.sin(t)
            expected=[curve['center'][0]+co*x-si*y,curve['center'][1]+si*x+co*y]
            if any(abs(a-b)>32*math.ulp(1.)*max(1,abs(a),abs(b)) for a,b in zip(value['vertices'][v],expected)):
                raise ValueError('曲线母孔坐标与保存解析参数不一致；未移动点或重采样。')
    return dict(schema='zhezhi-woven-curve-holes-v1',records=copy.deepcopy(records),
                chordErrors=[max(r['curve']['radii'])*(1-math.cos(math.pi/r['segments'])) for r in records],
                sampledVertexIds=[components[r['component']] for r in records],
                analyticBoundary=True,cpBoundary='explicit-chords')
