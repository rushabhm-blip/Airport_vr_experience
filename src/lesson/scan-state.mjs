/** Engine-independent practice scanner. Inputs are in scanner-local metres. */
export class PracticeScanner {
  constructor({flight='PA101',date='practice-day',gate='18',dwell=.65}={}){this.expected={flight,date,gate};this.dwell=dwell;this.reset();}
  reset(){this.held=0;this.previous=null;this.accepted=false;}
  update({document,position,normal,dt=0,boardingAllowed=true,tracked=true,paused=false}){
    if(paused){this.held=0;this.previous=null;return {state:'paused',message:'Practice paused'};}
    if(this.accepted)return {state:'accepted',message:'Boarding pass accepted'};
    const fail=(message)=>{this.held=0;this.previous=null;return {state:'retry',message};};
    if(!tracked)return fail('Bring your document back into view.');
    if(document?.type!=='boarding-pass')return fail('Use your boarding pass, not the booking confirmation.');
    if(document.flight!==this.expected.flight||document.date!==this.expected.date)return fail('This pass is for another flight or date. Ask airline staff.');
    // gate is the current checkpoint, not the possibly stale printed gate.
    if(document.currentGate!==this.expected.gate)return fail('Check the current boarding gate.');
    if(!boardingAllowed)return fail('Wait for the boarding call.');
    if(!Array.isArray(position)||!Array.isArray(normal)||position.length!==3||normal.length!==3||![...position,...normal,dt].every(Number.isFinite))return fail('Tracking data unavailable.');
    const [x,y,z]=position;
    if(Math.abs(x)>.085||y<.151||y>.205||Math.abs(z+.015)>.085)return fail('Hold the pass just above the scanning glass.');
    const len=Math.hypot(...normal);
    if(len<.5||normal[1]/len>-.87)return fail('Turn the code towards the reader.');
    // Reject time gaps and movement; sustained valid samples are required.
    const delta=Math.max(0,Math.min(dt,.1));
    const moved=this.previous&&Math.hypot(...position.map((v,i)=>v-this.previous[i]))>.012;
    this.previous=[...position];
    if(dt>.15||moved){this.held=0;return {state:'reading',message:'Hold it steady.',progress:0};}
    this.held+=delta;
    if(this.held>=this.dwell){this.accepted=true;return {state:'accepted',message:'Boarding pass accepted',progress:1};}
    return {state:'reading',message:'Reading… hold it steady.',progress:this.held/this.dwell};
  }
}
