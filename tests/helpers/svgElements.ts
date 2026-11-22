import {XMLParser} from 'fast-xml-parser';
import type {Point} from '../../src/core/types';

export interface SvgElementNode {
  tag:string;
  attrs:Record<string,string>;
  text:string;
  parent?:SvgElementNode;
}

const parser=new XMLParser({preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'',parseTagValue:false});

/** Keep SVG paint order and enclosing groups, including lines with an accessible title. */
export function svgElements(svg:string):SvgElementNode[]{
  const result:SvgElementNode[]=[];
  function visit(entries:Record<string,unknown>[],parent?:SvgElementNode){
    for(const entry of entries){
      if('#text' in entry){if(parent)parent.text+=String(entry['#text']);continue;}
      const tag=Object.keys(entry).find(key=>Array.isArray(entry[key]));
      if(!tag)continue;
      const node:SvgElementNode={tag,attrs:(entry[':@']??{}) as Record<string,string>,text:'',parent};
      result.push(node);
      visit(entry[tag] as Record<string,unknown>[],node);
    }
  }
  visit(parser.parse(svg));
  return result;
}

export function linesAt(nodes:SvgElementNode[],a:Point,b:Point):SvgElementNode[]{
  function matches(x:string,y:string,point:Point){
    return Math.abs(Number(x)-point[0])<=1e-8&&Math.abs(Number(y)-point[1])<=1e-8;
  }
  return nodes.filter(({tag,attrs:{x1,y1,x2,y2}})=>tag==='line'&&(
    (matches(x1,y1,a)&&matches(x2,y2,b))||(matches(x1,y1,b)&&matches(x2,y2,a))));
}
