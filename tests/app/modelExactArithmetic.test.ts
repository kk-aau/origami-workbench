import test from 'node:test';
import assert from 'node:assert/strict';
import {fractionNumber} from '../../src/app/modelExactArithmetic';

// Independent BigInt reference: normalize from exact binary lengths, then
// explicitly round the integer quotient to nearest even before scaling.
function exactValue(n:bigint,d:bigint,exponent:number){
 if(n===0n)return 0;
 const sign=(n<0n)===(d<0n)?1:-1;
 if(n<0n)n=-n;if(d<0n)d=-d;
 let e=n.toString(2).length-d.toString(2).length;
 if(e<0?n<<BigInt(-e)<d:n<d<<BigInt(e))e--;
 const unit=Math.max(-1074,e+exponent-52),shift=exponent-unit;
 if(shift>=0)n<<=BigInt(shift);else d<<=BigInt(-shift);
 let q=n/d;const r=n%d;
 if(2n*r>d||2n*r===d&&(q&1n))q++;
 return sign*Number(q)*2**unit;
}

test('scaled rational coordinates preserve ties, subnormals and integers rounded up to powers of two',()=>{
 for(const bits of [1,52,53,54,67,128,512,1023,1024,1350]){
  const power=1n<<BigInt(bits);
  for(const n of [power-1n,power,power+1n,power+(power>>2n)])
   for(const d of [1n,3n,power-1n,power+1n])
    for(const exponent of [-1200,-1075,-1022,-53,0,1023]){
     const want=exactValue(n,d,exponent);
     assert.ok(Object.is(fractionNumber(n,d,exponent),want));
     assert.ok(Object.is(fractionNumber(n,-d,exponent),-want));
    }
 }
});
