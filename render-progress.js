'use strict';
(function(root){
 class RenderClock {
  constructor(now=()=>performance.now()){this.now=now;this.started=now();this.pausedAt=null;this.pausedMs=0;this.samples=[];this.done=0;this.total=0;this.state='Preparing';this.ended=null}
  active(){return (this.pausedAt??this.ended??this.now())-this.started-this.pausedMs}
  pause(value){if(value&&this.pausedAt===null)this.pausedAt=this.now();else if(!value&&this.pausedAt!==null){this.pausedMs+=this.now()-this.pausedAt;this.pausedAt=null}}
  update(done,total){this.state='Rendering';this.done=done;this.total=total;const t=this.active();this.samples.push({t,done});while(this.samples.length>2&&this.samples[1].t<t-30000)this.samples.shift()}
  status(){const active=this.active(),first=this.samples[0],last=this.samples.at(-1);const rate=last&&first&&last.t-first.t>=1000?(last.done-first.done)/((last.t-first.t)/1000):null;return {elapsed:((this.ended??this.now())-this.started)/1000,remaining:this.state==='Complete'?0:this.state==='Rendering'&&rate>0?Math.max(0,(this.total-this.done)/rate-(active-last.t)/1000):null,paused:this.pausedAt!==null,state:this.state}}
  end(ok){this.ended=this.now();this.state=ok?'Complete':'Stopped'}
 }
 root.FrameCastRenderClock=RenderClock;
 if(typeof module!=='undefined')module.exports=RenderClock;
})(typeof globalThis==='undefined'?this:globalThis);
