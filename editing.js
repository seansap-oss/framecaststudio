'use strict';
const effects=['Cross dissolve','Fade through black','Fade through white','Wipe left','Wipe right','Wipe up','Wipe down','Slide left','Slide right','Push up','Push down','Iris open','Iris close','Zoom','Blur dissolve'];
const transitions=new Map();
const levelText=v=>v+'% · '+(v? (20*Math.log10(v/100)).toFixed(1):'−∞')+' dB';
function sourceTime(layer,t){return Math.max(0,t-layer.start+(layer.trimIn||0))}
function envelope(layer,s){
 const points=layer.points||[];
 if(!points.length)return layer.volume??100;
 const i=points.findIndex(p=>p.s>=s);
 if(i<0)return points.at(-1).v;
 if(i===0)return points[0].v;
 const a=points[i-1],b=points[i];
 return a.v+(b.v-a.v)*(s-a.s)/(b.s-a.s);
}
function transitionRange(to){
 const tr=transitions.get(to),a=layers[tr?.from],b=layers[to];
 if(!tr||!a||!b||a.removed||b.removed)return null;
 const start=Math.max(a.start,b.start),duration=Math.min(tr.duration,a.end-start,b.end-start);
 return duration>.001?{...tr,start,duration}:null;
}
function progressOf(tr){return clamp((time-tr.start)/tr.duration,0,1)}
function clipGain(key,t){
 const layer=layers[key];if(layer.muted)return 0;
 let gain=envelope(layer,sourceTime(layer,t))/100;
 for(const [to,entry] of transitions){
  if(!entry.audio || (key!==to && key!==entry.from))continue;
  const tr=transitionRange(to);if(!tr)continue;
  const p=clamp((t-tr.start)/tr.duration,0,1);
  gain*=key===to?p:1-p;
 }
 return gain;
}
async function loadClipWaveform(key,asset){
 try{await makeWaveform(asset)}catch{if(layers[key]){layers[key].waveUnavailable=true;refreshAudioLanes()}}
}
function setClipVolume(key,value){
 const l=layers[key];l.volume=value;
 if(l.points?.length){
  const s=clamp(sourceTime(l,time),l.trimIn||0,(l.trimIn||0)+l.end-l.start);
  const near=l.points.find(p=>Math.abs(p.s-s)<.02);
  if(near)near.v=value;else l.points.push({s,v:value});
  l.points.sort((a,b)=>a.s-b.s)
 }
 connectInserts();refreshAudioLanes();
}
function refreshAudioLanes(){
 for(const strip of document.querySelectorAll('.audioEnvelope')){
  const l=layers[strip.dataset.key];if(!l)continue;
  strip.hidden=selectedLayer!==strip.dataset.key;if(strip.hidden)continue;
  const duration=l.end-l.start,offset=l.trimIn||0,asset=assets[strip.dataset.key];
  const wave=strip.querySelector('.wave');
  if(l.waveform){wave.style.backgroundImage='url('+l.waveform+')';wave.style.backgroundSize=(asset.duration/duration*100)+'% 100%';wave.style.backgroundPosition=(asset.duration>duration?100*offset/(asset.duration-duration):0)+'% center'}
  const v=Math.round(envelope(l,sourceTime(l,time)));
  strip.querySelector('output').value=levelText(v)+(l.muted?' · muted':'');
  strip.querySelector('button').textContent=l.muted?'Unmute':'Mute';
  wave.title=(l.waveUnavailable?'Waveform unavailable. ':'')+'Drag level · double-click to add a point · right-click a point to remove';
  const nodes=l.points||[],coords=[[0,envelope(l,offset)],...nodes.filter(p=>p.s>offset&&p.s<offset+duration).map(p=>[(p.s-offset)/duration*100,p.v]),[100,envelope(l,offset+duration)]];
  const svg=wave.firstChild;svg.replaceChildren();
  const path=document.createElementNS(svg.namespaceURI,'polyline');
  path.setAttribute('points',coords.map(([x,y])=>x+','+(100-y)).join(' '));svg.append(path);
  for(const p of nodes){const x=(p.s-offset)/duration*100;if(x<0||x>100)continue;const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',100-p.v);dot.setAttribute('r','2');svg.append(dot)}
  if(selectedLayer===strip.dataset.key){$('insertLevel').value=v;$('muteInsert').checked=!!l.muted;$('numericGain').value=v}
 }
}
function attachClipControls(lane,key,span){
 const l=layers[key],tr=transitionRange(key);
 if(tr){const strip=el('button',tr.effect+' · '+tr.duration.toFixed(2)+'s');strip.className='transitionStrip';strip.style.left=100*tr.start/span+'%';strip.style.width=100*tr.duration/span+'%';strip.title=strip.textContent+' · click to edit or drag right edge to trim';lane.append(strip);
  strip.onclick=()=>editTransition(key);
  const edge=el('span');edge.className='edge right';strip.append(edge);
  edge.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const x=e.clientX,old=tr.duration;edge.setPointerCapture(e.pointerId);
   edge.onpointermove=ev=>{const available=Math.min(l.end,layers[tr.from].end)-tr.start;transitions.get(key).duration=clamp(old+(ev.clientX-x)*span/lane.clientWidth,.04,available);strip.style.width=100*transitions.get(key).duration/span+'%'};
   edge.onpointerup=edge.onpointercancel=()=>{edge.onpointermove=null;timeline();editTransition(key)}};
 }
 if(l.kind==='video'){
  lane.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/framecast-effect')){e.preventDefault();e.stopPropagation();lane.classList.add('effectTarget')}});
  lane.addEventListener('dragleave',()=>lane.classList.remove('effectTarget'));
  lane.addEventListener('drop',e=>{
   const effect=e.dataTransfer.getData('application/framecast-effect');if(!effects.includes(effect))return;
   e.preventDefault();e.stopPropagation();lane.classList.remove('effectTarget');sequence.classList.remove('drop');openPanel('Transitions');
   $('transitionTo').value=key;$('effectName').value=effect;
   const prior=Object.keys(layers).filter(k=>k!==key&&layers[k].kind==='video'&&layers[k].start<=l.start).sort((a,b)=>Math.abs(layers[a].end-l.start)-Math.abs(layers[b].end-l.start))[0];
   if(prior)$('transitionFrom').value=prior;
   applyTransition(false,true);
  });
 }
 if(!['video','audio'].includes(l.kind))return;
 const wrap=el('div');wrap.className='audioEnvelope';wrap.dataset.key=key;
 const controls=el('small'),mute=el('button'),read=el('output');
 mute.onclick=()=>{l.muted=!l.muted;connectInserts();refreshAudioLanes()};controls.append(mute,read);
 const track=el('div'),wave=el('div');wave.className='wave';track.className='waveLane';wave.style.left=l.start/span*100+'%';wave.style.width=(l.end-l.start)/span*100+'%';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');wave.append(svg);track.append(wave);wrap.append(controls,track);lane.parentElement.after(wrap);
 function coords(e){const r=wave.getBoundingClientRect();return {v:Math.round(clamp(1-(e.clientY-r.top)/r.height,0,1)*100),s:(l.trimIn||0)+clamp((e.clientX-r.left)/r.width,0,1)*(l.end-l.start)}}
 const nearest=s=>(l.points||[]).find(p=>Math.abs(p.s-s)<(l.end-l.start)*9/Math.max(1,wave.clientWidth));
 wave.ondblclick=e=>{const p=coords(e);l.points??=[];if(!nearest(p.s)){if(!l.points.length){l.points.push({s:l.trimIn||0,v:l.volume??100},{s:(l.trimIn||0)+l.end-l.start,v:l.volume??100})}l.points.push(p);l.points.sort((a,b)=>a.s-b.s)}refreshAudioLanes()};
 wave.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();const p=nearest(coords(e).s);if(p){l.points=l.points.filter(n=>n!==p);refreshAudioLanes()}};
 wave.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const p=nearest(coords(e).s);wave.setPointerCapture(e.pointerId);
  wave.onpointermove=ev=>{const v=coords(ev).v;if(p)p.v=v;else if(!l.points?.length)l.volume=v;else return;connectInserts();refreshAudioLanes()};
  wave.onpointerup=wave.onpointercancel=()=>wave.onpointermove=null};
 wrap.hidden=true;
}
inspector.insertAdjacentHTML('beforeend',row('Clip level (%)',number('numericGain',0,100)));
$('numericGain').onchange=()=>{if(layers[selectedLayer])setClipVolume(selectedLayer,clamp(+$('numericGain').value,0,100))};

const editor=$('transitionEditor');
editor.innerHTML=row('From clip','<select id="transitionFrom"></select>')+row('To clip','<select id="transitionTo"></select>')+row('Effect',select('effectName',effects))+row('Duration (s)',number('effectDuration',.04,600,.05))+row('Crossfade clip audio',check('effectAudio'))+'<div class="actions"><button id="tryEffect">Preview</button><button id="applyEffect">Apply</button><button id="removeEffect">Remove</button></div><output id="effectStatus"></output>';
$('effectDuration').value=1;
function updateTransitionLists(){
 for(const id of ['transitionFrom','transitionTo']){const s=$(id),old=s.value;s.replaceChildren(...Object.entries(layers).filter(([k,l])=>l.kind==='video'&&!l.removed).map(([k,l])=>named(k,l.name)));if([...s.options].some(o=>o.value===old))s.value=old;else if(id==='transitionTo'&&s.length>1)s.selectedIndex=1}
 $('numericGain').closest('label').hidden=!['video','audio'].includes(layers[selectedLayer]?.kind);
 refreshAudioLanes()
}
function editTransition(to){
 const tr=transitions.get(to);openPanel('Transitions');$('transitionTo').value=to;if(!tr)return;
 $('transitionFrom').value=tr.from;$('effectName').value=tr.effect;$('effectDuration').value=tr.duration;$('effectAudio').checked=tr.audio;
}
$('transitionTo').onchange=()=>editTransition($('transitionTo').value);
function applyTransition(preview,fromDrop=false){
 const from=$('transitionFrom').value,to=$('transitionTo').value,a=layers[from],b=layers[to],duration=$('effectDuration').valueAsNumber;
 const status=$('effectStatus');if(!a||!b||a===b){status.value='Choose two different video clips.';return}
 if(!Number.isFinite(duration)||duration<.04||duration>Math.min(a.end-a.start,b.end-b.start)){status.value='Duration must fit inside both clips.';return}
 if(previewUndo)endTransitionPreview();
 const previous={start:b.start,end:b.end,keys:Object.keys(layers),effect:transitions.get(to),time};
 const overlap=Math.min(a.end,b.end)-Math.max(a.start,b.start);
 if(overlap<duration-.00001){
  const next=a.end-duration;
  if(!preview&&!fromDrop&&!confirm('Move '+b.name+' to '+next.toFixed(2)+' s to create a '+duration+' s overlap?'))return;
  const len=b.end-b.start;b.start=next;b.end=next+len;
 }
 if(Object.keys(layers).indexOf(to)<Object.keys(layers).indexOf(from))orderAt(to,from,true);
 transitions.set(to,{from,duration,effect:$('effectName').value,audio:$('effectAudio').checked});
 const tr=transitionRange(to);$('effectDuration').value=tr.duration;stop();seek(tr.start);timeline();status.value='Applied · '+a.name+' → '+b.name;
 if(preview){
  previewUndo=()=>{b.start=previous.start;b.end=previous.end;applyOrder(previous.keys.filter(k=>layers[k]).concat(Object.keys(layers).filter(k=>!previous.keys.includes(k))));if(previous.effect)transitions.set(to,previous.effect);else transitions.delete(to);seek(previous.time);timeline();status.value='Preview finished · Apply to keep this transition.'};
  previewEnd=tr.start+tr.duration;run().catch(e=>{endTransitionPreview();notify(e.message)});
 }
}
let previewEnd=null,previewUndo=null;
function endTransitionPreview(){
 const undo=previewUndo;previewUndo=null;previewEnd=null;if(playing)stop();undo?.()
}
$('applyEffect').onclick=()=>applyTransition(false);$('tryEffect').onclick=()=>applyTransition(true);
$('removeEffect').onclick=()=>{transitions.delete($('transitionTo').value);timeline();$('effectStatus').value='Transition removed'};
function drawTransitionLayer(key,l){
 if(!onAir(l))return;
 const tr=transitionRange(key),out=[...transitions.keys()].map(transitionRange).find(v=>v?.from===key&&time>=v.start&&time<v.start+v.duration);
 const active=tr&&time>=tr.start&&time<tr.start+tr.duration?tr:out;
 if(!active){graphic(key,l);return}
 const incoming=active===tr,p=progressOf(active),W=monitor.width,H=monitor.height,fx=active.effect;
 ctx.save();let opacity=1;
 if(fx==='Fade through black'||fx==='Fade through white'){
  if(incoming){if(p<.5){ctx.restore();return}opacity=2*p-1}
  else opacity=Math.max(0,1-2*p);
  if(!incoming||p>=.5){ctx.fillStyle=fx.endsWith('black')?'black':'white';ctx.fillRect(0,0,W,H)}
 }else if(fx.startsWith('Push'))ctx.translate(0,(fx==='Push up'?-1:1)*(incoming?p-1:p)*H);
 else if(incoming){
  if(fx.startsWith('Wipe')||fx.startsWith('Iris')){
   ctx.beginPath();
   if(fx==='Iris close'){ctx.rect(0,0,W,H);ctx.arc(W/2,H/2,Math.hypot(W,H)*(1-p)/2,0,Math.PI*2);ctx.clip('evenodd')}
   else{if(fx==='Iris open')ctx.arc(W/2,H/2,Math.hypot(W,H)*p/2,0,Math.PI*2);
    else if(fx==='Wipe up')ctx.rect(0,H*(1-p),W,H*p);else if(fx==='Wipe down')ctx.rect(0,0,W,H*p);else ctx.rect(fx==='Wipe left'?W*(1-p):0,0,W*p,H);
    ctx.clip()}
  }else if(fx.startsWith('Slide'))ctx.translate((fx==='Slide left'?1:-1)*(1-p)*W,0);
  else{opacity=p;if(fx==='Zoom'){const s=.65+.35*p;ctx.translate(W*(1-s)/2,H*(1-s)/2);ctx.scale(s,s)}if(fx==='Blur dissolve')ctx.filter='blur('+((1-p)*18)+'px)'}
 }
 graphic(key,opacity===1?l:{...l,opacity:l.opacity*opacity});ctx.restore()
}

const gallery=el('details');gallery.innerHTML='<summary>Transition presets · 15</summary>';const choices=el('div');choices.className='effectChoices';
for(const name of effects){const b=el('button',name);b.draggable=true;b.title='Drag onto the incoming clip or click to select';b.onclick=()=>{$('effectName').value=name};b.ondragstart=e=>{e.dataTransfer.setData('application/framecast-effect',name);e.dataTransfer.effectAllowed='copy'};choices.append(b)}
gallery.append(choices);editor.prepend(gallery);
