'use strict';
const $ = id => document.getElementById(id);
const el = (tag, text='') => Object.assign(document.createElement(tag), {textContent:text});
const monitor = $('monitor'), ctx = monitor.getContext('2d');
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const fmt = t => new Date(Math.max(0,t)*1000).toISOString().slice(14,22);
const notify = msg => $('status').textContent = msg;
const panels = {};
const icons = {Media:'▦',Mixer:'≋',Key:'◈',Graphics:'▤',Motion:'⇄',Brand:'◇',Export:'⇧'};
let order = 20;
function dock(panel,side){
  $(side).append(panel);
  panel.classList.remove('float');
  panel.style.cssText='';
}
function keepLayout(){
  const layout = {};
  for(const [name,p] of Object.entries(panels)) layout[name]={side:p.parentElement.id,fold:p.classList.contains('fold'),hidden:p.hidden,x:p.offsetLeft,y:p.offsetTop,w:p.offsetWidth};
  try{localStorage.setItem('fc-layout-3',JSON.stringify(layout))}catch{}
}
function floatPanel(p,x,y){
  document.body.append(p);p.classList.add('float');
  p.style.left=clamp(x,0,Math.max(0,innerWidth-p.offsetWidth))+'px';
  p.style.top=clamp(y,0,Math.max(0,innerHeight-40))+'px';
  p.style.zIndex=++order;
}
function tool(name,side,markup,fold=false){
  const p=el('section');p.className='panel';panels[name]=p;
  p.innerHTML='<div class="panelhead"><button title="Collapse or expand">▾</button><b></b><button title="Dock left">◧</button><button title="Dock right">◨</button><button title="Hide panel">×</button></div><div class="content">'+markup+'</div>';
  const h=p.firstChild, buttons=h.querySelectorAll('button');
  h.querySelector('b').textContent=name==='Key'?'Chroma key':name==='Mixer'?'Audio mixer':name==='Motion'?'Ticker motion':name;
  const nav=el('button');nav.innerHTML='<em>'+icons[name]+'</em>'+name;nav.className='active';$('tools').append(nav);
  function show(visible){p.hidden=!visible;nav.classList.toggle('active',visible);keepLayout()}
  nav.onclick=()=>{if(p.hidden||p.classList.contains('fold')){p.classList.remove('fold');show(true);p.scrollIntoView({block:'nearest'})}else show(false)};
  buttons[0].onclick=()=>{p.classList.toggle('fold');keepLayout()};
  buttons[1].onclick=()=>{dock(p,'left');keepLayout()};buttons[2].onclick=()=>{dock(p,'right');keepLayout()};
  buttons[3].onclick=()=>show(false);
  h.onpointerdown=e=>{
    if(e.target.closest('button'))return;
    const r=p.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
    h.setPointerCapture(e.pointerId);
    h.onpointermove=ev=>{floatPanel(p,ev.clientX-dx,ev.clientY-dy);h.setPointerCapture(ev.pointerId)};
    h.onpointerup=h.onpointercancel=()=>{h.onpointermove=null;keepLayout()};
  };
  dock(p,side);p.classList.toggle('fold',fold);
}
const row=(title,control)=>'<label class="row"><span>'+title+'</span>'+control+'</label>';
const number=(id,min,max,step=1)=>'<input type="number" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'">';
const select=(id,options)=>'<select id="'+id+'">'+options.map(x=>'<option>'+x+'</option>').join('')+'</select>';
const range=(id,min,max,value)=>'<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" value="'+value+'">';
tool('Media','left','<img class="thumb" src="'+sampleMedia.poster+'" alt="Sample bulletin"><div class="actions"><button id="import">Import clips</button><button id="music">Audio bed</button></div><div id="bin"></div>');
tool('Mixer','left','<div class="toolrow"><b>Program output</b><output id="peak">−∞ dB</output></div><meter class="meter" id="meter" min="0" max="1"></meter>'+['Clip','Bed','Master','Bass','Mid','Treble'].map((k,i)=>row(k+' <output id="'+k+'Value"></output>',range(k,i<3?0:-12,i<3?150:12,i<3?100:0))).join(''));
tool('Key','left',row('Enable key','<input type="checkbox" id="keyOn">')+row('Key colour','<input id="keyColor" type="color" value="#00ff00">')+row('Tolerance',range('tolerance',5,240,100))+row('Feather',range('feather',1,100,35))+row('Replacement','<input id="back" type="color" value="#284672">')+row('Backdrop image','<input type="file" id="backdrop" accept="image/*">'),true);
tool('Graphics','right',row('Layer',select('layer',['Headline','Speaker','Breaking news','Top ticker','Bottom ticker','Watermark','Logo','Ad']))+row('Visible','<input id="visible" type="checkbox">')+row('Text / messages','<textarea id="words" rows="2"></textarea>')+row('Font',select('font',['Arial','Georgia','Impact','Trebuchet MS']))+row('Size (% width)',number('size',.5,15,.1))+row('Text colour','<input type="color" id="ink">')+row('Background','<input type="color" id="fill">')+['x','y','w','h','opacity'].map((k,i)=>row(['X %','Y %','Width %','Height %','Opacity %'][i],number(k,i===2||i===3?1:0,100,.1))).join('')+row('Start (s)',number('start',0,86400,.1))+row('End (0 = project)',number('end',0,86400,.1))+row('Logo / ad asset','<input id="graphicFile" type="file" accept="image/*,video/*">'));
tool('Motion','right',row('Animate',select('moving',['Bottom ticker','Top ticker','Watermark']))+row('Direction',select('direction',['Static','Scroll left','Scroll right','Enter from bottom','Enter from top']))+row('Speed (%/sec)',number('speed',1,200))+row('Hold (seconds)',number('hold',.1,60,.1))+row('Separator','<input id="emoji">')+row('Repeat','<input id="repeat" type="checkbox">')+'<small>Use one message per line for vertical motion.</small>');
tool('Brand','left',row('Template',select('preset',['Evening bulletin','Wire service','Studio gold']))+'<div class="actions"><button id="apply">Apply colours</button><button id="saveBrand">Save my style</button><button id="loadBrand">Load my style</button></div>',true);
tool('Export','right',row('Resolution',select('resolution',['720p','480p','1080p','2160p']))+'<button class="gold" id="render">Render sequence</button><div id="downloads"></div>',true);
try{const saved=JSON.parse(localStorage.getItem('fc-layout-3')||'{}');for(const [name,s] of Object.entries(saved)){const p=panels[name];if(!p)continue;if(s.side==='left'||s.side==='right')dock(p,s.side);else floatPanel(p,s.x,s.y);p.classList.toggle('fold',s.fold);p.hidden=s.hidden}}catch{}
$('reset').onclick=()=>{for(const [name,p] of Object.entries(panels)){dock(p,['Media','Mixer','Key','Brand'].includes(name)?'left':'right');p.hidden=false;p.classList.toggle('fold',['Key','Brand','Export'].includes(name))}document.querySelectorAll('nav button').forEach(b=>b.classList.add('active'));keepLayout()};
const initial=(text,x,y,w,h,fill,ink,size)=>({text,x,y,w,h,fill,ink,size,font:'Arial',visible:true,opacity:100,start:0,end:0,direction:'Static',speed:12,hold:2,emoji:' • ',repeat:true});
const layers={
 Headline:initial('EVENING BULLETIN',5,5,42,8,'#122241','#ffffff',2.8),
 Speaker:initial('STUDIO DESK',5,67,28,7,'#182844','#ffffff',2.6),
 'Breaking news':initial('BREAKING NEWS',5,76,34,9,'#aa282d','#ffffff',3.5),
 'Top ticker':initial('Regional news\nTonight’s headlines',54,9,40,13,'#132441','#ffffff',3),
 'Bottom ticker':initial('Evening update   •   News from the region',5,85,90,9,'#e9edf2','#152333',2.8),
 Watermark:initial('FRAMECAST',62,63,30,6,'#000000','#ffffff',2.4),
 Logo:initial('',79,4,16,12,'#101720','#ffffff',2),
 Ad:initial('',67,46,26,25,'#101720','#ffffff',2)
};
layers.Watermark.opacity=30;layers['Top ticker'].direction='Enter from bottom';layers['Bottom ticker'].direction='Scroll left';
const current=()=>layers[$('layer').value], moving=()=>layers[$('moving').value];
const geometry=['x','y','w','h','size','start','end','opacity'];
function inspect(){
  const l=current();for(const k of geometry.concat(['font','ink','fill']))$(k).value=l[k];
  $('words').value=l.text;$('visible').checked=l.visible;
  const m=moving();for(const k of ['direction','speed','hold','emoji'])$(k).value=m[k];$('repeat').checked=m.repeat;
}
$('layer').onchange=inspect;$('moving').onchange=()=>{$('layer').value=$('moving').value;inspect()};
for(const k of geometry)$(k).oninput=()=>{if($(k).value!=='')current()[k]=clamp(+$(k).value,+$(k).min,+$(k).max);timeline()};
for(const k of ['font','ink','fill'])$(k).oninput=()=>current()[k]=$(k).value;
$('visible').onchange=()=>current().visible=$('visible').checked;$('words').oninput=()=>{current().text=$('words').value;timeline()};
for(const k of ['direction','speed','hold','emoji','repeat'])$(k).oninput=()=>moving()[k]=k==='repeat'?$(k).checked:['speed','hold'].includes(k)?Math.max(.1,+$(k).value):$(k).value;
$('apply').onclick=()=>{const colors=[['#122241','#aa282d'],['#134437','#237559'],['#392611','#92631a']][$('preset').selectedIndex];layers.Headline.fill=colors[0];layers['Breaking news'].fill=colors[1];inspect()};
$('saveBrand').onclick=()=>{try{localStorage.setItem('fc-style',JSON.stringify(Object.fromEntries(Object.entries(layers).map(([k,v])=>[k,{font:v.font,ink:v.ink,fill:v.fill,size:v.size}]))));notify('Brand style saved')}catch{notify('Browser storage unavailable')}};
$('loadBrand').onclick=()=>{try{const styles=JSON.parse(localStorage.getItem('fc-style'));if(!styles)throw Error();for(const k of Object.keys(layers))Object.assign(layers[k],styles[k]);inspect();notify('Brand style loaded')}catch{notify('Save a brand style first')}};
let waveform=null, selectedLayer=null;
const clips=[],assets={};let bed,background, audio, mix, streamOut, meterNode, bins,eq=[], mainGain,bedGain, master;
let time=0,playing=false,anchor=0,active=null,record=null,busy=false,demo=true;
const poster=new Image();poster.src=sampleMedia.poster;
const total=()=>clips.reduce((sum,c)=>sum+c.duration,0);
async function loadMedia(url,kind){
  const m=document.createElement(kind);m.preload='auto';m.playsInline=true;
  await new Promise((ok,fail)=>{m.onloadeddata=ok;m.onerror=()=>fail(Error('Unsupported media or unreadable file'));m.src=url});
  return m;
}
function connectMedia(m,target){if(audio&&!m.connected){audio.createMediaElementSource(m).connect(target);m.connected=true}}
async function audioReady(){
 if(!audio){
  audio=new AudioContext();mainGain=audio.createGain();bedGain=audio.createGain();master=audio.createGain();mix=audio.createGain();
  mainGain.connect(mix);bedGain.connect(mix);
  let last=mix;
  for(const [type,f] of [['lowshelf',160],['peaking',1000],['highshelf',5000]]){const node=audio.createBiquadFilter();node.type=type;node.frequency.value=f;last.connect(node);last=node;eq.push(node)}
  last.connect(master);meterNode=audio.createAnalyser();meterNode.fftSize=256;bins=new Uint8Array(256);master.connect(meterNode);master.connect(audio.destination);streamOut=audio.createMediaStreamDestination();master.connect(streamOut);
 }
 clips.forEach(c=>connectMedia(c.media,mainGain));if(bed)connectMedia(bed,bedGain);levels();await audio.resume();
}
function levels(){['Clip','Bed','Master','Bass','Mid','Treble'].forEach((k,i)=>{let v=+$(k).value;$(k+'Value').value=v+(i<3?'%':' dB');if(audio){const node=[mainGain,bedGain,master,...eq][i];node.gain.setTargetAtTime(i<3?v/100:v,audio.currentTime,.015)}})}
for(const k of ['Clip','Bed','Master','Bass','Mid','Treble'])$(k).oninput=levels;
function stop(){playing=false;$('play').textContent='▶ Play';for(const c of clips)c.media.pause();bed?.pause();for(const m of Object.values(assets))m.pause?.()}
function seek(t){time=clamp(t,0,total());anchor=performance.now()-time*1000;active=null;syncMedia(true);$('seek').value=time}
function follow(m,t,force){
 if(!m||!Number.isFinite(m.duration))return;
 if(force||Math.abs(m.currentTime-t)>.35)m.currentTime=clamp(t,0,m.duration);
 if(playing&&m.paused&&t<m.duration)m.play().catch(e=>{if(e.name!=='AbortError')notify(e.message)});
}
function syncMedia(force=false){
 let offset=0,next=null;for(const c of clips){if(time<offset+c.duration||c===clips.at(-1)){next=c;break}offset+=c.duration}
 for(const c of clips)if(c!==next&&!c.media.paused)c.media.pause();
 if(next)follow(next.media,time-offset,force||active!==next);active=next;
 if(bed){if(time<bed.duration)follow(bed,time,force);else bed.pause()}
 const ad=assets.Ad;if(ad?.tagName==='VIDEO'){const l=layers.Ad;if(l.visible&&time>=l.start&&(!l.end||time<l.end))follow(ad,(time-l.start)%ad.duration,force);else ad.pause()}
}
async function run(){if(!clips.length)return;await audioReady();if(time>=total()-.01)seek(0);playing=true;anchor=performance.now()-time*1000;$('play').textContent='Ⅱ Pause';syncMedia(true)}
$('play').onclick=()=>playing?stop():run().catch(e=>notify(e.message));$('homeBtn').onclick=()=>seek(0);$('seek').oninput=()=>seek(+$('seek').value);
$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():monitor.parentElement.requestFullscreen();
function region(name,color,percent,click){const b=el('button',name);b.className='region';b.style.cssText='background:'+color+';width:'+percent+'%';b.onclick=click;return b}
function timeline(){
 const host=$('tracks');host.replaceChildren();const duration=total()||1;
 function lane(name){const line=el('div');line.className='track';line.append(el('small',name));const lane=el('div');lane.className='lane';line.append(lane);host.append(line);return lane}
 const ruler=lane('Timecode');ruler.classList.add('ruler');for(let i=0;i<5;i++)ruler.append(el('small',fmt(i*duration/5).slice(0,5)));
 ruler.onclick=e=>{const r=ruler.getBoundingClientRect();seek(duration*(e.clientX-r.left)/r.width)};
 let offset=0;const videoLane=lane('V1   Picture');for(const c of clips){const at=offset;videoLane.append(region(c.name,'#335886',c.duration/duration*100,()=>seek(at)));offset+=c.duration}
 for(const [key,color] of [['Headline','#79522b'],['Top ticker','#415b8e'],['Bottom ticker','#654489'],['Ad','#3b6975']]){
  if(key==='Ad'&&!assets.Ad)continue;
  const l=layers[key],track=lane(key),start=clamp(l.start,0,duration),end=clamp(l.end||duration,start,duration);
  const b=region(l.text||key,color,(end-start)/duration*100,()=>{$('layer').value=key;panels.Graphics.hidden=false;panels.Graphics.classList.remove('fold');inspect()});b.style.marginLeft=start/duration*100+'%';track.append(b)
 }
 const a=lane('A1   Audio bed');if(bed)a.append(region(bed.dataset.name||'Studio bed','#2d6253',Math.min(100,bed.duration/duration*100),()=>{panels.Mixer.hidden=false;panels.Mixer.classList.remove('fold')}));
 if(waveform&&bed){const clip=a.firstChild;clip.style.backgroundImage='url('+waveform+')';clip.style.backgroundSize='100% 100%'}
 for(const l of host.querySelectorAll('.lane:not(.ruler)')){const bar=el('span');bar.className='cursor';l.append(bar)}
 $('seek').max=total();$('bin').replaceChildren();
 clips.forEach((c,i)=>{const item=el('div');item.className='item';const title=el('span',c.name);title.title=c.name;item.append(title,el('small',fmt(c.duration)));for(const [label,shift] of [['↑',-1],['↓',1]]){const b=el('button',label);b.disabled=!clips[i+shift];b.onclick=()=>{stop();[clips[i],clips[i+shift]]=[clips[i+shift],clips[i]];seek(0);timeline()};item.append(b)}$('bin').append(item)})
}
$('import').onclick=$('addClips').onclick=()=>$('videos').click();$('music').onclick=$('addSound').onclick=()=>$('sounds').click();
$('videos').onchange=async e=>{stop();for(const f of Array.from(e.target.files)){try{const media=await loadMedia(URL.createObjectURL(f),'video');if(!isFinite(media.duration)||media.duration<=0)throw Error('Unknown duration');if(demo){clips.length=0;demo=false;if(bed?.dataset.sample){bed.pause();bed=null}}clips.push({media,name:f.name,duration:media.duration});notify('Imported '+f.name)}catch(err){notify(f.name+' · '+err.message)}}seek(0);timeline();e.target.value=''};
$('sounds').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{stop();const next=await loadMedia(URL.createObjectURL(f),'audio');bed=next;waveform=null;makeWaveform(bed).catch(()=>{});bed.dataset.name=f.name;timeline();notify('Audio bed loaded')}catch(err){notify(err.message)}};
async function loadImage(url){const im=new Image();im.src=url;await im.decode();return im}
$('backdrop').onchange=async e=>{if(e.target.files[0])background=await loadImage(URL.createObjectURL(e.target.files[0]))};
$('graphicFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const key=['Logo','Ad','Watermark'].includes($('layer').value)?$('layer').value:'Ad';const url=URL.createObjectURL(f);const asset=f.type.startsWith('video')?await loadMedia(url,'video'):await loadImage(url);if(asset.tagName==='VIDEO'){asset.muted=true;if(key!=='Ad')throw Error('Select Ad for a video overlay')}assets[key]?.pause?.();assets[key]=asset;layers[key].visible=true;$('layer').value=key;inspect();timeline()}catch(err){notify(err.message)}};
const keyCanvas=document.createElement('canvas'),keyCtx=keyCanvas.getContext('2d',{willReadFrequently:true});
function picture(src){
 const W=monitor.width,H=monitor.height;ctx.fillStyle=$('back').value;ctx.fillRect(0,0,W,H);if(background)ctx.drawImage(background,0,0,W,H);
 if(!src)return;const w=src.videoWidth||src.naturalWidth,h=src.videoHeight||src.naturalHeight;if(!w||!h)return;
 const scale=Math.min(W/w,H/h),dw=w*scale,dh=h*scale;
 if($('keyOn').checked){
 const kw=Math.min(w,960),kh=Math.round(kw*h/w);if(keyCanvas.width!==kw||keyCanvas.height!==kh){keyCanvas.width=kw;keyCanvas.height=kh}
 keyCtx.drawImage(src,0,0,kw,kh);const pixels=keyCtx.getImageData(0,0,kw,kh),d=pixels.data,key=parseInt($('keyColor').value.slice(1),16),r=key>>16,g=(key>>8)&255,b=key&255,th=+$('tolerance').value,soft=+$('feather').value;
 for(let i=0;i<d.length;i+=4){const dist=Math.hypot(d[i]-r,d[i+1]-g,d[i+2]-b);d[i+3]=255*clamp((dist-th)/soft,0,1)}
 keyCtx.putImageData(pixels,0,0);src=keyCanvas}
 ctx.drawImage(src,(W-dw)/2,(H-dh)/2,dw,dh);
}
function graphic(key,l){
 if(!l.visible||time<l.start||(l.end&&time>=l.end))return;
 const W=monitor.width,H=monitor.height,w=W*l.w/100,h=H*l.h/100,t=time-l.start;let x=W*l.x/100,y=H*l.y/100;
 if(key==='Watermark'&&l.direction!=='Static'){const horiz=l.direction.startsWith('Scroll'),sign=['Scroll left','Enter from bottom'].includes(l.direction)?-1:1;const span=horiz?W+w:H+h;let pos=horiz?x:y;pos=((pos+sign*t*l.speed*W/100+(horiz?w:h))%span+span)%span-(horiz?w:h);if(horiz)x=pos;else y=pos}
 ctx.save();ctx.globalAlpha=l.opacity/100;ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
 const asset=assets[key];if(asset){if(asset.tagName!=='VIDEO'||asset.readyState>=2)ctx.drawImage(asset,0,0,w,h)}
 else if(!['Logo','Ad'].includes(key)){
 if(key!=='Watermark'){ctx.fillStyle=l.fill;ctx.fillRect(0,0,w,h)}
 ctx.fillStyle=l.ink;ctx.font='bold '+W*l.size/100+'px '+l.font;ctx.textBaseline='middle';const lines=l.text.split('\n').filter(Boolean);let content=l.text,px=w*.035,py=h/2,fit=true;
 if(key.includes('ticker')&&l.direction!=='Static'){
 if(l.direction.startsWith('Scroll')){content=lines.join(' '+l.emoji+' ')+' '+l.emoji+' ';const width=ctx.measureText(content).width,cycle=w+width;let distance=t*l.speed*W/100;distance=l.repeat?distance%cycle:Math.min(distance,cycle);px=l.direction==='Scroll left'?w-distance:distance-width;fit=false}
 else{const travel=Math.max(.1,h/(l.speed*H/100)),cycle=l.hold+travel;const elapsed=l.repeat?t:Math.min(t,Math.max(0,lines.length*cycle-.001));content=lines[Math.floor(elapsed/cycle)%Math.max(1,lines.length)]||'';py+=(l.direction==='Enter from bottom'?1:-1)*h*(1-Math.min(1,(elapsed%cycle)/travel))}
 }
 if(fit)ctx.fillText(content,px,py,w*.94);else ctx.fillText(content,px,py);
 }
 ctx.restore();
}
function draw(){picture(active?.media.readyState>=2?active.media:poster);for(const [k,l] of Object.entries(layers))graphic(k,l);
 if(selectedLayer&&!playing&&!busy){const l=layers[selectedLayer],W=monitor.width/100,H=monitor.height/100;
 ctx.save();ctx.strokeStyle='#f6c95f';ctx.lineWidth=W*.22;ctx.strokeRect(l.x*W,l.y*H,l.w*W,l.h*H);ctx.fillStyle='#ffe3a0';ctx.fillRect((l.x+l.w-1)*W,(l.y+l.h-1)*H,W,H);ctx.restore()}
}
function dimensions(){
 let short=parseInt($('resolution').value),rat=$('ratio').value,wide=Math.round(short*16/9/2)*2;
 monitor.width=rat==='16:9'?wide:short;monitor.height=rat==='9:16'?wide:short;monitor.style.setProperty('--ar',monitor.width/monitor.height);draw()
}
$('ratio').onchange=$('resolution').onchange=dimensions;
function frame(now){
 if(playing){time=Math.min(total(),(now-anchor)/1000);syncMedia();if(time>=total()){stop();if(record?.state==='recording')record.stop()}}
 draw();$('clock').textContent=fmt(time)+' / '+fmt(total());$('seek').value=time;
 for(const bar of document.querySelectorAll('.cursor'))bar.style.left=(total()?100*time/total():0)+'%';
 if(meterNode){meterNode.getByteTimeDomainData(bins);let peak=0;for(const b of bins)peak=Math.max(peak,Math.abs(b-128)/128);$('meter').value=peak;$('peak').value=peak?Math.round(20*Math.log10(peak))+' dB':'−∞ dB'}
 requestAnimationFrame(frame);
}
function pointer(e){const box=monitor.getBoundingClientRect();return [(e.clientX-box.left)*100/box.width,(e.clientY-box.top)*100/box.height]}
monitor.onpointerdown=e=>{if(busy)return;const [x,y]=pointer(e);const found=Object.entries(layers).reverse().find(([k,l])=>l.visible&&(l.text||assets[k])&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h);if(!found)return;const [k,l]=found;selectedLayer=k;$('layer').value=k;inspect();const dx=x-l.x,dy=y-l.y,resize=dx>l.w-2&&dy>l.h-2;monitor.setPointerCapture(e.pointerId);monitor.onpointermove=ev=>{const [nx,ny]=pointer(ev);if(resize){l.w=clamp(nx-l.x,1,100-l.x);l.h=clamp(ny-l.y,1,100-l.y)}else{l.x=clamp(nx-dx,0,100-l.w);l.y=clamp(ny-dy,0,100-l.h)}inspect()};monitor.onpointerup=monitor.onpointercancel=()=>monitor.onpointermove=null};
function lock(on){busy=on;for(const id of ['desk','reset','exportTop'])$(id).inert=on;Object.values(panels).forEach(p=>p.inert=on)}
async function render(){
 if(busy||!clips.length)return;
 let stream;
 try{
 stop();lock(true);await audioReady();dimensions();seek(0);
 await Promise.all(clips.map(c=>new Promise((resolve,reject)=>{c.media.currentTime=0;if(!c.media.seeking)return resolve();const timer=setTimeout(()=>reject(Error('Clip seek timed out')),5000);c.media.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true})})));
 draw();stream=monitor.captureStream(30);stream.addTrack(streamOut.stream.getAudioTracks()[0].clone());
 const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(v=>MediaRecorder.isTypeSupported(v));if(!mime)throw Error('No supported encoder');
 record=new MediaRecorder(stream,{mimeType:mime});const chunks=[];let failed=false;
 record.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
 record.onerror=()=>{failed=true;notify('Encoding failed. Try a lower resolution.')};
 record.onstop=()=>{stop();lock(false);stream.getTracks().forEach(t=>t.stop());if(!failed&&chunks.length){const link=el('a','Download render');link.style.color='#9cc6ff';link.href=URL.createObjectURL(new Blob(chunks,{type:mime}));link.download='FrameCast-'+$('resolution').value+(mime.includes('mp4')?'.mp4':'.webm');$('downloads').replaceChildren(link);link.click();notify('Render finished · download available in Export')}record=null};
 await run();record.start(250);notify('Rendering sequence · keep this tab visible');
 }catch(err){stop();lock(false);stream?.getTracks().forEach(t=>t.stop());notify('Render failed · '+err.message)}
}
$('render').onclick=render;$('exportTop').onclick=()=>{panels.Export.hidden=false;panels.Export.classList.remove('fold');panels.Export.scrollIntoView({block:'nearest'});$('resolution').focus()};
async function makeWaveform(media){
 const buffer=await (await fetch(media.currentSrc||media.src)).arrayBuffer();
 const decoded=await new OfflineAudioContext(1,1,44100).decodeAudioData(buffer);
 const data=decoded.getChannelData(0),canvas=document.createElement('canvas');canvas.width=640;canvas.height=22;
 const c=canvas.getContext('2d');c.fillStyle='#78c7a5';
 for(let x=0;x<640;x++){let peak=0;const start=Math.floor(data.length*x/640),end=Math.floor(data.length*(x+1)/640);
 for(let i=start;i<end;i+=Math.max(1,Math.floor((end-start)/150)))peak=Math.max(peak,Math.abs(data[i]));
 const h=Math.max(1,Math.min(20,peak*100));c.fillRect(x,11-h/2,1,h)}
 if(bed===media){waveform=canvas.toDataURL();timeline()}
}
async function init(){
 inspect();levels();dimensions();
 try{const [v,a]=await Promise.all([loadMedia(sampleMedia.video,'video'),loadMedia(sampleMedia.audio,'audio')]);clips.push({media:v,duration:v.duration,name:'Studio opening'});bed=a;makeWaveform(bed).catch(()=>{});bed.dataset.sample='1';bed.dataset.name='Studio bed';seek(0)}catch(err){notify('Import a local video to begin · '+err.message)}
 timeline();requestAnimationFrame(frame)
}
init();
