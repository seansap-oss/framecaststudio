'use strict';
const extensionPanel = (name,html) => panels[name].querySelector('.content').insertAdjacentHTML('beforeend',html);
const named = (id,name) => new Option(name,id);
const check = id => '<input type="checkbox" id="'+id+'">';
const presenter={x:0,y:0,w:100,h:100,crop:false};
let serial=0,monitorGain,notches=[],hiss,compressor,cleanupInput;
const extraId=()=> 'insert-'+(++serial);
const onAir=l=>l.visible&&time>=l.start&&(!l.end||time<l.end);
function baseBox(){
 const split=Object.values(layers).some(l=>l.layout==='Split 50:50'&&onAir(l));
 return split?{x:0,y:0,w:50,h:100,crop:true}:presenter;
}
function paintAsset(asset,w,h,crop){
 if(asset.tagName==='AUDIO'||(asset.tagName==='VIDEO'&&asset.readyState<2))return;
 const sw=asset.videoWidth||asset.naturalWidth,sh=asset.videoHeight||asset.naturalHeight;
 if(!sw||!sh)return;
 const scale=crop?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);
 ctx.drawImage(asset,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
}
function openPanel(name){const p=panels[name];p.hidden=false;p.classList.remove('fold');p.scrollIntoView({block:'nearest'})}
extensionPanel('Graphics',row('Layer name','<input id="layerName">')+row('Layout',select('fitLayout',['Free','Inset','Split 50:50']))+row('Crop to box',check('cropLayer'))+row('Mute insert',check('muteInsert'))+row('Insert level',range('insertLevel',0,100,85))+'<div class="actions"><button id="backward">Lower layer</button><button id="forward">Raise layer</button><button id="removeLayer">Remove insert</button></div>');
function inspectExtra(){
 const l=current();if(!l)return;
 panels.Graphics.classList.toggle('audioInspector',l.kind==='audio');
 panels.Graphics.classList.toggle('videoInspector',l.kind==='video');
 $('layerName').value=l.name||$('layer').value;$('fitLayout').value=l.layout||'Free';$('cropLayer').checked=!!l.crop;$('muteInsert').checked=!!l.muted;$('insertLevel').value=l.volume??100;
}
function rebuildOptions(key){
 $('layer').replaceChildren(...Object.entries(layers).filter(([,l])=>!l.removed).map(([id,l])=>named(id,l.name||id)));$('layer').value=key;
}
function chooseLayer(key){
 selectedLayer=key;currentMain=null;$('layer').value=key;openPanel('Graphics');inspect();
 refreshInspector();markSelection();refreshAudioLanes();if(assets[key]?.tagName==='AUDIO')openPanel('Mixer');
}
$('layer').onchange=()=>chooseLayer($('layer').value);
$('layerName').onchange=()=>{const id=$('layer').value;current().name=$('layerName').value.trim()||id;rebuildOptions(id);timeline()};
$('fitLayout').onchange=()=>{const l=current();l.layout=$('fitLayout').value;if(l.layout==='Split 50:50')Object.assign(l,{x:50,y:0,w:50,h:100,crop:true});if(l.layout==='Inset')Object.assign(l,{x:62,y:7,w:34,h:34,crop:false});inspect()};
$('cropLayer').oninput=()=>current().crop=$('cropLayer').checked;
$('muteInsert').oninput=()=>{current().muted=$('muteInsert').checked;connectInserts();refreshAudioLanes()};
$('insertLevel').oninput=()=>{setClipVolume($('layer').value,+$('insertLevel').value)};
function shiftLayer(step){
 const id=$('layer').value,keys=Object.keys(layers),at=keys.indexOf(id),target=at+step;
 if(target<0||target>=keys.length)return;
 [keys[at],keys[target]]=[keys[target],keys[at]];const sorted=keys.map(k=>[k,layers[k]]);keys.forEach(k=>delete layers[k]);Object.assign(layers,Object.fromEntries(sorted));rebuildOptions(id);timeline();
}
$('backward').onclick=()=>shiftLayer(-1);$('forward').onclick=()=>shiftLayer(1);
function discard(id){const a=assets[id];a?.pause?.();a?.insertGain?.disconnect();if(a?.src.startsWith('blob:')&&!Object.entries(assets).some(([other,m])=>other!==id&&m.src===a.src))URL.revokeObjectURL(a.src);delete layers[id];delete assets[id]}
$('removeLayer').onclick=()=>{const id=$('layer').value;deleteTrack(id)};
function newLayer(kind,name,start,duration,asset){
 const key=extraId(),l=initial(kind==='text'?'New caption':'',15,35,kind==='text'?65:38,kind==='text'?11:38,'#172742','#ffffff',3.2);
 Object.assign(l,{kind,name,start,end:duration?start+duration:kind==='image'?start+5:0,volume:100});layers[key]=l;if(asset){assets[key]=asset;if(kind==="video"||kind==="audio")loadClipWaveform(key,asset)}
 rebuildOptions(key);chooseLayer(key);timeline();return key;
}
$('addText').onclick=()=>{newLayer('text','Text '+(serial+1),time,0);$('words').focus();$('words').select()};
function layerColour(k){return {audio:'#316752',video:'#385e8b',image:'#447177',text:'#70508f'}[layers[k].kind]||'#63507c'}
async function importInserts(files,at){
 stop();for(const file of files){
  const kind=file.type.split('/')[0],url=URL.createObjectURL(file);
  try{if(!['video','audio','image'].includes(kind))throw Error('Unsupported format');
  const asset=kind==='image'?await loadImage(url):await loadMedia(url,kind);
  if(kind!=='image'&&(!isFinite(asset.duration)||asset.duration<=0))throw Error('Cannot read media duration');
  const key=newLayer(kind,file.name,at,kind==='image'?0:asset.duration,asset);if(kind==='audio')makeWaveform(asset).catch(()=>{});connectInserts();syncMedia(true)
  }catch(err){URL.revokeObjectURL(url);notify(file.name+' · '+err.message)}
 }
}
$('insertLayers').onclick=()=>$('inserts').click();$('inserts').onchange=async e=>{await importInserts(Array.from(e.target.files),time);e.target.value=''};
const sequence=$('timeline');
sequence.ondragover=e=>{e.preventDefault();sequence.classList.add('drop')};
sequence.ondragleave=()=>sequence.classList.remove('drop');
sequence.ondrop=async e=>{e.preventDefault();sequence.classList.remove('drop');if(busy)return;const lane=e.target.closest('.lane');let at=time;if(lane){const r=lane.getBoundingClientRect();at=clamp((e.clientX-r.left)/r.width*timelineSpan(),0,timelineSpan())}
 await importInserts(Array.from(e.dataTransfer.files),at)};
function connectInserts(){if(!audio)return;for(const [id,m] of Object.entries(assets)){if(!layers[id]?.kind||!['VIDEO','AUDIO'].includes(m.tagName))continue;if(!m.insertGain){m.insertGain=audio.createGain();m.insertGain.connect(layers[id].program?mainGain:layers[id].bus==='bed'?bedGain:mix);connectMedia(m,m.insertGain)}m.insertGain.gain.value=clipGain(id,time)}}
function syncInserts(force){for(const [id,m] of Object.entries(assets)){const l=layers[id];if(!l?.kind||!m.pause)continue;if(m.insertGain)m.insertGain.gain.value=clipGain(id,time);const local=time-l.start+(l.trimIn||0);if(onAir(l)&&local<m.duration)follow(m,local,force);else m.pause()}}
function selectMain(c,at){seek(at);selectedLayer='@presenter';openPanel('Media');notify(c.name+' · drag the picture or resize its handles')}
function selectionBox(){if(layers[selectedLayer]?.kind==='audio')return null;return selectedLayer==='@presenter'?baseBox():layers[selectedLayer]}
function points(box){return [[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]].map(([u,v])=>({u,v,x:box.x+box.w*u,y:box.y+box.h*v}))}
function drawHandles(){const l=selectionBox();if(!l||(selectedLayer!=='@presenter'&&!onAir(l)))return;const w=monitor.width/100,h=monitor.height/100,s=7*monitor.width/Math.max(1,monitor.clientWidth);
 ctx.save();ctx.strokeStyle='#9fbeff';ctx.lineWidth=s/5;ctx.strokeRect(l.x*w,l.y*h,l.w*w,l.h*h);ctx.fillStyle='#fff';for(const p of points(l))ctx.fillRect(p.x*w-s/2,p.y*h-s/2,s,s);ctx.restore()}
monitor.onpointerdown=e=>{
 if(busy)return;const [x,y]=pointer(e),box=selectionBox();
 const handle=box&&points(box).find(p=>Math.abs(p.x-x)<600/monitor.clientWidth&&Math.abs(p.y-y)<600/monitor.clientHeight);
 if(!handle){const found=Object.entries(layers).reverse().find(([k,l])=>onAir(l)&&l.kind!=='audio'&&(assets[k]||l.text)&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h);if(found)chooseLayer(found[0]);else {selectedLayer='@presenter'; openPanel('Media')}}
 if(selectedLayer==='@presenter'&&baseBox()!==presenter){Object.assign(presenter,baseBox());for(const l of Object.values(layers))if(onAir(l)&&l.layout==='Split 50:50')l.layout='Free'}
 const target=selectedLayer==='@presenter'?presenter:layers[selectedLayer];if(!target)return;const b={...selectionBox()};
 monitor.setPointerCapture(e.pointerId);monitor.onpointermove=ev=>{
  const [nx,ny]=pointer(ev),dx=nx-x,dy=ny-y;
  if(!handle){target.x=clamp(b.x+dx,0,100-b.w);target.y=clamp(b.y+dy,0,100-b.h)}
  else{if(handle.u===0){target.x=clamp(b.x+dx,0,b.x+b.w-1);target.w=b.x+b.w-target.x}if(handle.u===1)target.w=clamp(b.w+dx,1,100-b.x);if(handle.v===0){target.y=clamp(b.y+dy,0,b.y+b.h-1);target.h=b.y+b.h-target.y}if(handle.v===1)target.h=clamp(b.h+dy,1,100-b.y)}
  inspect();
 };monitor.onpointerup=monitor.onpointercancel=()=>monitor.onpointermove=null;
};
extensionPanel('Mixer','<details open><summary>Program audio cleanup</summary>'+row('Hum notch',select('hum',['Bypass','50 Hz','60 Hz']))+row('Hiss low-pass',select('noise',['Bypass','12 kHz','9 kHz','6 kHz']))+row('Compressor',check('compress'))+row('Threshold (dB)',range('threshold',-50,0,-20))+row('Ratio',range('compRatio',1,12,3))+'</details>');
function installCleanup(input){
 cleanupInput=input;notches=[1,2,3].map(()=>{const node=audio.createBiquadFilter();node.type='notch';node.Q.value=18;return node});
 hiss=audio.createBiquadFilter();hiss.type='lowpass';hiss.Q.value=.707;compressor=audio.createDynamicsCompressor();refreshCleanup()
}
function refreshCleanup(){if(!cleanupInput)return;for(const node of [cleanupInput,...notches,hiss,compressor])node.disconnect();let last=cleanupInput;
 if($('hum').selectedIndex)notches.forEach((n,i)=>{n.frequency.value=parseInt($('hum').value)*(i+1);last.connect(n);last=n});
 if($('noise').selectedIndex){hiss.frequency.value=parseInt($('noise').value)*1000;last.connect(hiss);last=hiss}
 if($('compress').checked){compressor.threshold.value=+$('threshold').value;compressor.ratio.value=+$('compRatio').value;last.connect(compressor);last=compressor}last.connect(master);
}
for(const id of ['hum','noise','compress','threshold','compRatio'])$(id).oninput=refreshCleanup;
function installMonitor(){monitorGain=audio.createGain();master.connect(monitorGain);monitorGain.connect(audio.destination);monitorGain.gain.value=+$('listen').value/100}
$('listen').oninput=()=>{if(monitorGain)monitorGain.gain.value=+$('listen').value/100};
let lastListen=100;$('monitorMute').onclick=()=>{const v=+$('listen').value;if(v)lastListen=v;$('listen').value=v?0:lastListen;$('listen').oninput()};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!busy&&!e.target.closest('input,select,textarea,button,[contenteditable=true]')){e.preventDefault();$('play').click()}});
extensionPanel('Brand','<details open><summary>Six program templates</summary>'+row('Slot',select('slot',['1','2','3','4','5','6']))+row('Program name','<input id="slotName" placeholder="Evening news">')+'<div class="actions"><button id="saveSlot">Save layout</button><button id="renameSlot">Rename</button><button id="recallSlot">Recall</button></div></details>');
const vault=new Promise((resolve,reject)=>{const r=indexedDB.open('framecast-templates',1);r.onupgradeneeded=()=>r.result.createObjectStore('programs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
async function slotData(id,value){
 const db=await vault;return new Promise((resolve,reject)=>{const tx=db.transaction('programs',value?'readwrite':'readonly'),s=tx.objectStore('programs'),r=value?s.put(value,id):s.get(id);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
}
async function slotLabels(){for(const opt of $('slot').options){const data=await slotData(opt.value);opt.textContent=opt.value+' · '+(data?.name||'Empty')}const data=await slotData($('slot').value);$('slotName').value=data?.name||''}
$('slot').onchange=()=>slotLabels().catch(e=>notify(e.message));
$('saveSlot').onclick=async()=>{try{const id=$('slot').value,name=$('slotName').value.trim()||'Template '+id,graphics=[];
 for(const [key,l] of Object.entries(layers)){if(l.removed||['audio','video'].includes(l.kind)||assets[key]?.tagName==='VIDEO')continue;
 const blob=assets[key]?await (await fetch(assets[key].src)).blob():null;graphics.push({key,layer:{...l},blob})}
 await slotData(id,{name,graphics});await slotLabels();notify('Saved '+name)}catch(e){notify('Template save failed · '+e.message)}};
$('renameSlot').onclick=async()=>{try{const id=$('slot').value,s=await slotData(id);if(!s)throw Error('Save a layout in this slot first');s.name=$('slotName').value.trim()||s.name;await slotData(id,s);await slotLabels()}catch(e){notify(e.message)}};
$('recallSlot').onclick=async()=>{try{const s=await slotData($('slot').value);if(!s)throw Error('Empty template slot');const decoded=await Promise.all(s.graphics.map(async g=>g.blob?await loadImage(URL.createObjectURL(g.blob)):null));stop();
 for(const [key,l] of Object.entries(layers))if(key.startsWith('insert-')&&['text','image'].includes(l.kind))discard(key);
 s.graphics.forEach(({key,layer},i)=>{if(assets[key]?.tagName==='VIDEO')return;const id=key.startsWith('insert-')?extraId():key;layers[id]={...layer};if(decoded[i])assets[id]=decoded[i];else delete assets[id]});
 rebuildOptions('Headline');chooseLayer('Headline');timeline();notify('Loaded '+s.name)}catch(e){notify(e.message)}};
slotLabels().catch(()=>notify('Template storage unavailable in this browser'));
extensionPanel('Motion',row('Insert into',select('iconTarget',['Ticker message','Ticker separator']))+'<div id="symbols" class="actions"></div><details><summary>Icon Creator</summary>'+row('Symbol / initials','<input id="badgeText" maxlength="6" value="FC">')+row('Badge colour','<input type="color" id="badgeColor" value="#a42f37">')+'<button id="createIcon">Add icon layer</button></details>');
for(const icon of ['🏆','⚽','🔥','📣','⭐','◆','🔴','🎙️']){const b=el('button',icon);b.onclick=()=>{const l=moving();if($('iconTarget').selectedIndex)l.emoji=icon;else l.text+=' '+icon;$('layer').value=$('moving').value;inspect();timeline()};$('symbols').append(b)}
$('createIcon').onclick=()=>{const id=newLayer('text','Custom icon',time,0);Object.assign(layers[id],{text:$('badgeText').value,fill:$('badgeColor').value,w:9,h:10});inspect();timeline()};
const exportDialog=el('dialog');exportDialog.id='publish';
exportDialog.innerHTML='<div class="bar"><b>Export &amp; share</b><span class="spacer"></span><button id="exitPublish">Back to Edit</button></div><section>'+row('Title','<input id="postTitle" value="Evening bulletin">')+row('Caption','<textarea id="caption" rows="2"></textarea>')+row('Hashtags','<input id="tags">')+'<div id="formats"></div><div id="destinations"></div><div id="settingsHost"></div><progress id="progress" max="100" value="0"></progress><output id="jobStatus">Ready</output><div class="actions"><button class="gold" id="batch">Render selected versions</button><button id="copyCaption">Copy caption</button></div><div id="results"></div></section>';
document.body.append(exportDialog);
const presets=['16:9','9:16','1:1'], destinations=['YouTube','YouTube Shorts','Instagram Reels','Facebook Page Reels','WhatsApp'];
destinations.forEach((d,i)=>{const label=el('label');label.className='dest';const tick=el('input');tick.type='checkbox';tick.checked=i===0;const sel=el('select');presets.forEach(r=>sel.add(named(r,r)));sel.selectedIndex=i===0?0:1;label.append(tick,el('span',d),sel);$('destinations').append(label)});
let jobs=[],jobSet=[],oldRatio='',rendered=[],framing={};
const geomKeys=['x','y','w','h','layout','crop'];
function snapshot(){return Object.fromEntries(Object.entries(layers).map(([k,l])=>[k,Object.fromEntries(geomKeys.map(g=>[g,l[g]]))]))}
let currentRatio=$('ratio').value;
function switchRatio(r){framing[currentRatio]=snapshot();currentRatio=r;$('ratio').value=r;for(const [k,g] of Object.entries(framing[r]||{}))if(layers[k])Object.assign(layers[k],g);dimensions();inspect()}
$('ratio').onchange=()=>switchRatio($('ratio').value);
function previewFormats(){
 const r=currentRatio;$('formats').replaceChildren();
 for(const preset of presets){switchRatio(preset);const btn=el('button');const img=el('canvas');img.width=preset==='9:16'?58:105;img.height=preset==='16:9'?59:105;img.getContext('2d').drawImage(monitor,0,0,img.width,img.height);btn.append(img,el('small','Edit '+preset));btn.onclick=()=>{closeExport();switchRatio(preset)};$('formats').append(btn)}
 switchRatio(r)
}
function closeExport(){if(busy||jobs.length)return;panels.Export.querySelector('.content').prepend($('resolution').closest('label'));exportDialog.close()}
$('exitPublish').onclick=closeExport;exportDialog.oncancel=e=>{e.preventDefault();closeExport()};
$('exportTop').onclick=()=>{stop();$('settingsHost').append($('resolution').closest('label'));previewFormats();exportDialog.showModal()};
$('copyCaption').onclick=async()=>{const copy=[$('postTitle').value,$('caption').value,$('tags').value].filter(Boolean).join('\n');try{await navigator.clipboard.writeText(copy);$('jobStatus').value='Caption copied'}catch{prompt('Copy caption',copy)}};
$('batch').onclick=()=>{if(busy||jobs.length)return;const selected=Array.from($('destinations').children).filter(l=>l.firstChild.checked);jobs=[...new Set(selected.map(l=>l.lastChild.value))];if(!jobs.length){$('jobStatus').value='Choose at least one destination';return}
 rendered=[];jobSet=[...jobs];oldRatio=currentRatio;$('results').replaceChildren();nextJob()};
function nextJob(){if(jobs.length){switchRatio(jobs.shift());render()}else{switchRatio(oldRatio);jobSet=[];$('jobStatus').value='Ready to download or share'}}
function updateProgress(){const p=clamp(Math.floor(time/Math.max(.001,total())*100),0,99);$('progress').value=p;$('jobStatus').value=currentRatio+' · '+p+'% · '+fmt(time)+' / '+fmt(total());notify('Rendering '+currentRatio+' · '+p+'%')}
function finishJob(ok){$('progress').value=ok?100:0;if(!ok){jobs=[];jobSet=[];$('jobStatus').value='Render failed. Try a lower resolution.';return}if(jobSet.length)setTimeout(nextJob,60)}
function registerRender(link,blob){
 const ext=link.download.split('.').pop(),name=($('postTitle').value.trim()||'FrameCast').replace(/[^\p{L}\p{N} _-]/gu,'_')+'-'+currentRatio.replace(':','x')+'-'+$('resolution').value+'.'+ext;
 link.download=name;link.textContent='Download '+name;const line=el('div');line.className='actions';line.append(link);const file=new File([blob],name,{type:blob.type.split(';')[0]});
 const share=el('button','Share file…');if(navigator.canShare?.({files:[file]})){share.onclick=()=>navigator.share({files:[file],text:$('caption').value}).catch(e=>notify(e.message));line.append(share)}
 $('results').append(line);const fallback=link.cloneNode(true);$('downloads').replaceChildren(fallback);if(!jobSet.length)link.click()
}
$('render').onclick=()=>$('exportTop').click();

