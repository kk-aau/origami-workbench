import type {Doc} from '../core/types';
import {readMiuraHuffmanRecipe,miuraHuffmanSourceMatches,type MiuraHuffmanRecipe} from './miuraHuffmanCP';
import {yoshimuraMiuraRecipeFromDoc,yoshimuraMiuraSourceMatches,type YoshimuraMiuraRecipe} from './yoshimuraMiuraCP2534';
import {readYoshimuraSixRecipe,yoshimuraSixSourceMatches,type YoshimuraSixRecipe} from './yoshimuraSixCP2507';
import {readWaterbombTessellation2604Recipe,waterbombTessellation2604SourceMatches,type WaterbombTessellation2604Recipe} from './waterbombTessellation2604';

export type OriginalArrayKind='wave-grid'|'yoshimura-miura'|'waterbomb'|'yoshimura-six';
export type OriginalArraySource=
 | {kind:'wave-grid';recipe:MiuraHuffmanRecipe}
 | {kind:'yoshimura-miura';recipe:YoshimuraMiuraRecipe}
 | {kind:'waterbomb';recipe:WaterbombTessellation2604Recipe}
 | {kind:'yoshimura-six';recipe:YoshimuraSixRecipe};
const sourceKeys=['originalMiuraHuffman','originalYoshimuraMiura2534','originalWaterbombTessellation2604','originalYoshimuraSix2507'];

/** Read the saved recipe even after hand editing; reconstruction is an explicit action. */
export function readOriginalArraySource(doc:Doc):OriginalArraySource|null{
 try{
  const metadata=doc.metadata;
  if(!metadata||sourceKeys.filter(key=>Object.hasOwn(metadata,key)).length!==1)return null;
  if(Object.hasOwn(metadata,sourceKeys[0])){const recipe=readMiuraHuffmanRecipe(doc);return recipe?{kind:'wave-grid',recipe}:null;}
  if(Object.hasOwn(metadata,sourceKeys[1])){const recipe=yoshimuraMiuraRecipeFromDoc(doc);return recipe?{kind:'yoshimura-miura',recipe}:null;}
  if(Object.hasOwn(metadata,sourceKeys[3])){const recipe=readYoshimuraSixRecipe(doc);return recipe?{kind:'yoshimura-six',recipe}:null;}
  const recipe=readWaterbombTessellation2604Recipe(doc);return recipe?{kind:'waterbomb',recipe}:null;
 }catch{return null;}
}

export function originalArraySourceMatches(doc:Doc):boolean{
 const source=readOriginalArraySource(doc);
 if(!source)return false;
 return source.kind==='wave-grid'?miuraHuffmanSourceMatches(doc):
  source.kind==='yoshimura-miura'?yoshimuraMiuraSourceMatches(doc):
  source.kind==='yoshimura-six'?yoshimuraSixSourceMatches(doc):waterbombTessellation2604SourceMatches(doc);
}

/** A different original model/overload starts a new project; parameter edits keep its identity. */
export function sameOriginalArrayFamily(left:OriginalArraySource|null,right:OriginalArraySource):boolean{
 if(!left||left.kind!==right.kind)return false;
 if(left.kind==='wave-grid'&&right.kind==='wave-grid')return left.recipe.model===right.recipe.model;
 if(left.kind==='yoshimura-miura'&&right.kind==='yoshimura-miura')return left.recipe.mode===right.recipe.mode;
 if(left.kind==='yoshimura-six'&&right.kind==='yoshimura-six')return left.recipe.seed===right.recipe.seed;
 return left.kind==='waterbomb'&&right.kind==='waterbomb';
}
