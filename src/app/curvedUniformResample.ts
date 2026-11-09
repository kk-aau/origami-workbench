/** Explicit FunctionInterpolationAlt uniform, InterpolationOrder -> 1 subset.
 * ip denotes intervals; the original inclusive Table contains ip+1 values. */
export function uniformLinear(start:number,end:number,values:number[][]){
  const intervals=values.length-1,n=values[0]?.length;
  if(!(end>start)||intervals<1||!n||values.some(row=>row.length!==n||row.some(x=>!Number.isFinite(x))))
    throw Error('均匀重采样值无效。');
  const samples=values.map(row=>row.slice());
  return (s:number)=>{
    if(!Number.isFinite(s)||s<start||s>end)throw Error('均匀重采样不在原域外外推。');
    let position=(s-start)/(end-start)*intervals;
    const nearest=Math.round(position);if(Math.abs(position-nearest)<=8*Number.EPSILON*Math.max(1,Math.abs(position)))position=nearest;
    const cell=Math.min(intervals-1,Math.max(0,Math.floor(position))),
      weight=position-cell,a=samples[cell],b=samples[cell+1],step=(end-start)/intervals;
    return {value:a.map((x,i)=>x+(b[i]-x)*weight),derivative:a.map((x,i)=>(b[i]-x)/step)};
  };
}

/** Independent divided-difference/Newton replay of the bounded local degrees.
 * Python uses Lagrange products. Neither implementation asserts Wolfram's
 * Automatic/Hermite/Spline selection or default stencil has been reproduced. */
export function uniformPolynomial(start:number,end:number,values:number[][],order:number){
  if(order===1){const linear=uniformLinear(start,end,values);return (s:number,_side:'right'|'left'='right')=>linear(s);}
  uniformLinear(start,end,values);
  const intervals=values.length-1,samples=values.map(row=>row.slice()),cache=new Map<number,number[][]>();
  if(!Number.isInteger(order)||order<2||order>4||intervals<order)throw Error('局部多项式阶数或采样数量无效。');
  return (s:number,side:'right'|'left'='right')=>{
    if(!Number.isFinite(s)||s<start||s>end||side!=='right'&&side!=='left')throw Error('均匀重采样不在原域外外推。');
    let position=(s-start)/(end-start)*intervals;
    const nearest=Math.round(position);if(Math.abs(position-nearest)<=8*Number.EPSILON*Math.max(1,Math.abs(position)))position=nearest;
    let cell=Math.min(intervals-1,Math.max(0,Math.floor(position)));
    if(side==='left'&&position===nearest&&nearest>0&&nearest<intervals)cell=nearest-1;
    const first=Math.min(intervals-order,Math.max(0,cell-Math.floor(order/2))),z=position-first;
    let coefficients=cache.get(first);
    if(!coefficients){coefficients=samples[0].map((_,k)=>{
      const a=samples.slice(first,first+order+1).map(row=>row[k]);
      for(let n=1;n<=order;n++)for(let j=order;j>=n;j--)a[j]=(a[j]-a[j-1])/n;
      return a;
    });cache.set(first,coefficients);}
    const jets=coefficients.map(a=>{let value=a[order],derivative=0;
      for(let j=order-1;j>=0;j--){derivative=derivative*(z-j)+value;value=value*(z-j)+a[j];}
      return {value,derivative:derivative*intervals/(end-start)};
    });
    return {value:position===nearest?samples[nearest].slice():jets.map(x=>x.value),derivative:jets.map(x=>x.derivative)};
  };
}
