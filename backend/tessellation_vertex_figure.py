"""Literal numeric MakeArchimedeanVertexFigure, including RenderTile groups.

The original default PolygonTile Tiling renders edge Lines, not filled Polygons.
No welding, pruning or paper/material certification is part of this helper.
"""
import math
from tessellation_unit_regular_centered import unit_regular_polygon_vertices

def validate_vertex_figure(data):
 if not isinstance(data,dict) or data.get('family')!='archimedean-vertex-figure-native' or set(data)-{'family','vertexType'}:
  raise ValueError('原顶点图只接受 family 和 vertexType。')
 sides=data.get('vertexType',[3,4,6,4])
 if not isinstance(sides,list) or len(sides)>16 or any(type(n) is not int or not 3<=n<=24 for n in sides):
  raise ValueError('vtype须为最多16项的3–24边整数列表；空列表保留原原点输出。')
 return dict(family='archimedean-vertex-figure-native',vertexType=sides.copy())

def query_vertex_figure(data):
 q=validate_vertex_figure(data);rotations=[];tiles=[];theta=0.
 for n in q['vertexType']:
  rotations.append(theta);c,s=math.cos(theta),math.sin(theta)
  tile=[[c*x-s*y,s*x+c*y] for x,y in unit_regular_polygon_vertices(n)];tiles.append(tile)
  theta+=math.pi-2*math.pi/n # Source FractionBox denominator is #2.
 # RenderTile appends one LIST of individually styled edge Lines to its out.
 groups=[[[dict(primitive='Line',points=[p,tile[(j+1)%len(tile)]],style='TilingLine') for j,p in enumerate(tile)]] for tile in tiles]
 return dict(schema='origamica-vertex-figure-v1',query=q,source=dict(function='MakeArchimedeanVertexFigure',definitionCell='In[3098]',definitionLines=[231647,231696],renderTileCells=['In[2999]','In[2860]'],defaultOptionsLines=[210801,210827],rotationsRad=rotations,tileVertices=tiles,totalInteriorAngleRad=theta,renderTileDefaults=dict(TilePolys=False,TileEdges=True,TileVertexIndices=False,TileEdgeArrowStyle=None,TilePolyFill=None,TileEdgeArrowDirs=None,TileIndex=None),originalGraphicGroupsPreserved=True,wolframExecuted=False,paperCertification=False),data=dict(graphics=[groups,dict(primitive='Point',point=[0.,0.],style=dict(AbsolutePointSize=5))]))
