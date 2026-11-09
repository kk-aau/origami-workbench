/** Display-only transition. A full slider alone never certifies a flat pose. */
export class SimulationLayerEndpoint {
  private started:number|null=null;
  private repaint=false;
  get needsFrame(){return this.repaint;}
  reset(){this.started=null;this.repaint=false;}
  update(now:number,eligible:boolean):number {
    if(!eligible||!Number.isFinite(now)){this.reset();return 0;}
    this.started??=now;
    const t=Math.max(0,Math.min(1,(now-this.started-120)/300));
    this.repaint=t<1;
    return t*t*(3-2*t);
  }
}
