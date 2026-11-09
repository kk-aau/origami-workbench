/** Independent finite integer-seed MT19937/53-bit replay of Python random().
 * Arithmetic checked against CPython Modules/_randommodule.c (3.11), not a
 * Wolfram random-number implementation. This reader never generates a CP.
 * https://github.com/python/cpython/blob/3.11/Modules/_randommodule.c
 */
export function courteousPythonRandom(seed:number):()=>number{
 if(!Number.isInteger(seed)||seed<0||seed>999999)throw Error('随机种子超出有限域。');
 const state=new Uint32Array(624);state[0]=19650218;
 for(let i=1;i<624;i++)state[i]=(Math.imul(1812433253,state[i-1]^(state[i-1]>>>30))+i)>>>0;
 let i=1;
 for(let k=0;k<624;k++){
  state[i]=((state[i]^Math.imul(state[i-1]^(state[i-1]>>>30),1664525))+seed)>>>0;
  if(++i===624){state[0]=state[623];i=1;}
 }
 for(let k=0;k<623;k++){
  state[i]=((state[i]^Math.imul(state[i-1]^(state[i-1]>>>30),1566083941))-i)>>>0;
  if(++i===624){state[0]=state[623];i=1;}
 }
 state[0]=0x80000000;let index=624;
 const word=()=>{
  if(index===624){
   for(let k=0;k<624;k++){
    const combined=(state[k]&0x80000000)|(state[(k+1)%624]&0x7fffffff);
    state[k]=(state[(k+397)%624]^(combined>>>1)^(combined&1?0x9908b0df:0))>>>0;
   }
   index=0;
  }
  let value=state[index++];value^=value>>>11;value^=(value<<7)&0x9d2c5680;value^=(value<<15)&0xefc60000;value^=value>>>18;
  return value>>>0;
 };
 return()=>((word()>>>5)*67108864+(word()>>>6))/9007199254740992;
}
