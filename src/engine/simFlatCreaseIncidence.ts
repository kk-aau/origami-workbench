import type {FoldDocument} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {FoldGraph} from '../core/types';

const pair=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const sameOwners=(a:number[],b:number[])=>{
  if(a.length!==b.length)return false;
  const left=[...a].sort((x,y)=>x-y),right=[...b].sort((x,y)=>x-y);
  return left.every((f,k)=>f===right[k]);
};

/** Ordinary FOLD adjacency names each face once, even when a finite F walk
 * visits both sides of an edge within that face. The weak simulator needs
 * occurrences instead. Adapt only this known representation difference on a
 * private copy; malformed ownership still reaches the strict mesh validator.
 * Cut banks, holes and declared simulation meshes keep their explicit identity.
 */
export function simulationFlatCreaseIncidence(source:FoldDocument):FoldDocument {
  const graph=source as unknown as FoldGraph,faces=source.faces_vertices,rows=source.faces_edges,declared=source.edges_faces;
  if(source.zhezhi_simulation_mesh!==undefined||graph.faces_holes!==undefined||graph.faces_holeEdges!==undefined||graph.faces_holeFaces!==undefined||
    !Array.isArray(rows)||rows.length!==faces.length||!Array.isArray(declared)||declared.length!==source.edges_vertices.length)return source;
  if(new Set(source.vertices_coords.map(point=>point.join(','))).size!==source.vertices_coords.length||
    new Set(source.edges_vertices.map(([a,b])=>pair(a,b))).size!==source.edges_vertices.length)return source;
  const owners=source.edges_vertices.map(()=>[] as number[]),expanded=new Set<number>();
  let corners=0;
  for(let f=0;f<faces.length;f++){
    const face=faces[f],row=rows[f];
    if(!Array.isArray(row)||row.length!==face.length||(corners+=face.length)>65536)return source;
    for(let k=0;k<face.length;k++){
      const e=row[k];
      if(!Number.isInteger(e)||e<0||e>=owners.length||pair(face[k],face[(k+1)%face.length])!==pair(...source.edges_vertices[e]))return source;
      owners[e].push(f);
    }
  }
  for(let e=0;e<owners.length;e++){
    const actual=owners[e],saved=declared[e];
    if(!Array.isArray(saved)||saved.some(f=>!Number.isInteger(f)||f<0||f>=faces.length))return source;
    if(sameOwners(actual,saved))continue;
    if(source.edges_assignment?.[e]!=='F'||actual.length!==2||actual[0]!==actual[1]||saved.length!==1||saved[0]!==actual[0])return source;
    expanded.add(e);
  }
  if(!expanded.size)return source;
  let neighbors:FoldGraph['faces_faces'];
  if(graph.faces_faces!==undefined){
    if(!Array.isArray(graph.faces_faces)||graph.faces_faces.length!==faces.length)return source;
    neighbors=[];
    for(let f=0;f<faces.length;f++){
      const row=graph.faces_faces[f];if(!Array.isArray(row)||row.length!==rows[f].length)return source;
      const next:(number|null)[]=[];
      for(let k=0;k<row.length;k++){
        const e=rows[f][k],fs=owners[e],expected=fs.length===2?fs[0]===f?fs[1]:fs[0]:null,value=row[k];
        if(expanded.has(e)){if(value!==null&&value!==undefined&&value!==f)return source;}
        else if(expected===null?value!==null&&value!==undefined:value!==expected)return source;
        next.push(expected);
      }
      neighbors.push(next as number[]);
    }
  }
  return {...source,edges_faces:owners,...(neighbors?{faces_faces:neighbors}:{})};
}
