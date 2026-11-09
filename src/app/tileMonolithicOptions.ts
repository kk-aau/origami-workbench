/** Origamica MonolithicEmbedTiling graph options for a tile-twist patch. */
export type TileMonolithicOptions={
  mergedEdges:'auto'|'delete'|'retain';
  samePtTolerance:number;
  collinearCleanup:boolean;
  collinearTolerance:number;
};

/** New patches follow KillMergedEdges=True, CollinearCleanup=True. */
export const ORIGINAL_MONOLITHIC_OPTIONS:TileMonolithicOptions={
  mergedEdges:'delete',samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8,
};

/** A missing option object means a pre-option project; preserve its geometry. */
export const LEGACY_MONOLITHIC_OPTIONS:TileMonolithicOptions={
  mergedEdges:'auto',samePtTolerance:1e-8,collinearCleanup:false,collinearTolerance:1e-8,
};

export function readTileMonolithicOptions(value:unknown):TileMonolithicOptions|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  const keys=['collinearCleanup','collinearTolerance','mergedEdges','samePtTolerance'];
  if(Object.keys(data).sort().join(',')!==keys.join(','))return null;
  if(!['auto','delete','retain'].includes(String(data.mergedEdges))||
      typeof data.collinearCleanup!=='boolean')return null;
  for(const key of ['samePtTolerance','collinearTolerance']){
    const number=data[key];
    if(typeof number!=='number'||!Number.isFinite(number)||number<0||number>1e-4)return null;
  }
  return {...data} as TileMonolithicOptions;
}
