import test from 'node:test';
import assert from 'node:assert/strict';
import {faceRelationComponents} from '../../src/core/faceRelationComponents';

test('face components agree with reachability for every partial orientation of four faces',()=>{
  const count=4,pairs:[number,number][]=[];
  for(let a=0;a<count;a++)for(let b=a+1;b<count;b++)pairs.push([a,b]);
  // Unknown, above and below assignments include disconnected graphs, DAGs,
  // both cycle directions, and edges crossing between cyclic components.
  for(let code=0;code<3**pairs.length;code++){
    let rest=code;const values=Uint8Array.from(pairs,()=>{const value=rest%3;rest=Math.floor(rest/3);return value;});
    const reach=Array.from({length:count},(_,a)=>Array.from({length:count},(_,b)=>a===b));
    pairs.forEach(([a,b],i)=>{if(values[i])reach[values[i]===1?b:a][values[i]===1?a:b]=true;});
    for(let k=0;k<count;k++)for(let a=0;a<count;a++)for(let b=0;b<count;b++)reach[a][b]||=reach[a][k]&&reach[k][b];
    const {component,sizes}=faceRelationComponents(count,pairs,values);
    for(let a=0;a<count;a++){
      let size=0;
      for(let b=0;b<count;b++){
        assert.equal(component[a]===component[b],reach[a][b]&&reach[b][a],`assignment ${code}, faces ${a}/${b}`);
        if(component[a]===component[b])size++;
        else if(reach[a][b])assert.ok(component[a]<component[b],'component order must follow below-to-above paths');
      }
      assert.equal(sizes[component[a]],size);
    }
  }
});

test('changed candidates recompute components, including cycles created and removed by one edge',()=>{
  const pairs:[number,number][]=[[0,1],[1,2],[0,2],[2,3]],values=Uint8Array.from([2,2,2,2]);
  const before=faceRelationComponents(4,pairs,values);assert.equal(before.sizes.length,4);
  values[2]=1;
  const cyclic=faceRelationComponents(4,pairs,values);
  assert.equal(cyclic.sizes[cyclic.component[0]],3);
  assert.equal(cyclic.component[0],cyclic.component[1]);assert.equal(cyclic.component[0],cyclic.component[2]);
  assert.ok(cyclic.component[2]<cyclic.component[3]);
  values[2]=0;
  const after=faceRelationComponents(4,pairs,values);assert.equal(after.sizes.length,4);
  assert.equal(before.sizes.length,4,'a new candidate must not mutate previous component results');
});

test('component discovery supports deep chains without recursive stack growth',()=>{
  const count=20_000,pairs:[number,number][]=Array.from({length:count-1},(_,i)=>[i,i+1]);
  const {component,sizes}=faceRelationComponents(count,pairs,new Uint8Array(count-1).fill(2));
  assert.equal(sizes.length,count);assert.equal(component[0],0);assert.equal(component[count-1],count-1);
});
