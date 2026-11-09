import type {WovenParams} from './wovenParams';

/** A feasible original six-valent input whose lower-bound line search needs restoration. */
export function wovenMeritRecoveryPreset():WovenParams&{mode:'graph'}{
 const n=6,vertices:[number,number][]=[[0,0],...Array.from({length:n},(_,i)=>[Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n)] as [number,number])];
 const edges:[number,number][]=[...Array.from({length:n},(_,i)=>[i+1,(i+1)%n+1] as [number,number]),...Array.from({length:n},(_,i)=>[0,i+1] as [number,number])];
 return {family:'woven-lines',mode:'graph',graph:{vertices,edges},width:.06,parity:-1,minPleat:1,minBorderPleat:.01,borderInset:'auto',stationaryFace:0,optimization:'origamica-merit'};
}
