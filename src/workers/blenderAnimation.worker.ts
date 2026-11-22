import {bakeBlenderAnimation,type BlenderAnimationSource} from '../app/blenderAnimation';

self.onmessage=(event:MessageEvent<BlenderAnimationSource>)=>{
  try{
    const blob=bakeBlenderAnimation(event.data,message=>self.postMessage({message}));
    self.postMessage({blob});
  }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
