import {groupFlagstoneFaces} from '../app/flagstoneFaceGroups';
import type {ModelOverlapRegions} from '../app/modelOverlapRegions';
import type {FlatFoldResult} from '../core/types';

self.onmessage=(event:MessageEvent<{result:FlatFoldResult;regions?:ModelOverlapRegions}>)=>{
  try{self.postMessage(groupFlagstoneFaces(event.data.result,event.data.regions));}
  catch(error){self.postMessage({status:'unconfirmed',message:`面层序分组失败：${error instanceof Error?error.message:String(error)}`,groups:[],occlusions:[]});}
};
