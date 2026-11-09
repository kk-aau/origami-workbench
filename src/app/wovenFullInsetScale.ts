import {readWovenParams,type WovenParams} from './wovenParams';
/** Explicit parameter edit: scale requested absolute h, retain all source stamps. */
export function scaleWovenFullInsets(params:WovenParams,factor:number):WovenParams{
 if(!params.fullEdgeInsets||!Number.isFinite(factor)||factor<=0)throw Error('整体比例需要正的有限数字及完整逐边 h。');
 const next=structuredClone(params);next.fullEdgeInsets!.entries.forEach(e=>e.inset*=factor);
 const checked=readWovenParams(next as unknown as Record<string,unknown>);if(!checked)throw Error('比例后的请求 h 超出当前范围，未改变原列表。');
 return checked;
}
