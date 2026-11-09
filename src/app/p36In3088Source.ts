/** Origamica Section 36 In[3088]: four offset split-twist quadrilaterals. */
import type {TessParams,TessPaperSpec} from './tessellation';

export function p36In3088Params(paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  const h=1/Math.sqrt(2);
  return {
    family:'custom',
    vertices:[[0,0],[1,0],[1,h],[0,h],[2,0],[2,h],[1,2*h],[0,2*h],[2,2*h]],
    faces:[[0,1,2,3],[1,4,5,2],[3,2,6,7],[2,5,8,6]],
    repeatX:1,repeatY:1,customOutput:'tile-twists',angle:36,scale:.3,
    // The notebook's StationaryFace -> 17 is one-based.
    stationaryFace:16,
    tileTwists:[
      {width:.18,offset:+.12,tilt:90,construction:'split',ccw:true,baseVertex:0,connection:'V',centralTypes:['V','V','V','V']},
      {width:.18,offset:-.12,tilt:90,construction:'split',ccw:false,baseVertex:1,connection:'V',centralTypes:['V','V','V','V']},
      {width:.18,offset:-.12,tilt:90,construction:'split',ccw:false,baseVertex:3,connection:'V',centralTypes:['V','V','V','V']},
      {width:.18,offset:+.12,tilt:90,construction:'split',ccw:true,baseVertex:2,connection:'V',centralTypes:['V','V','V','V']},
    ],
    monolithicOptions:{mergedEdges:'delete',samePtTolerance:1e-8,
      collinearCleanup:true,collinearTolerance:1e-8},
    ...(paper?{paper}:{}),
  };
}

/** Display-only decorations may change without losing the saved construction. */
export function isP36In3088Source(params:TessParams):boolean{
  if(params.family!=='custom'||params.paper||params.pruneBoundary||params.lattice||
    params.repeatX!==1||params.repeatY!==1||params.customOutput!=='tile-twists')return false;
  const source=p36In3088Params();
  const values=(p:Extract<TessParams,{family:'custom'}>)=>[
    p.vertices,p.faces,p.stationaryFace,p.tileTwists?.map(tile=>[
      tile.width,tile.offset,tile.tilt,tile.construction,tile.ccw,
      tile.baseVertex,tile.connection,tile.centralTypes]),
    p.monolithicOptions?.mergedEdges,p.monolithicOptions?.samePtTolerance,
    p.monolithicOptions?.collinearCleanup,p.monolithicOptions?.collinearTolerance,
  ];
  return JSON.stringify(values(params))===JSON.stringify(values(source));
}
