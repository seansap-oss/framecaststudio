'use strict';
const timelineMenu=el('div');
timelineMenu.id='trackMenu';
timelineMenu.hidden=true;
timelineMenu.setAttribute('role','menu');
document.body.append(timelineMenu);
let insertion=null;
function closeTrackMenu(){timelineMenu.hidden=true}
function clearSamples(){
 if(!demo)return;
 for(const [id,l] of Object.entries(layers))if(l.sample)discard(id);
 demo=false;
}
function addProgram(media,name,at,sample=false){
 const id=newLayer('video',name,at,media.duration,media);
 Object.assign(layers[id],{x:0,y:0,w:100,h:100,program:true,sample});
 if(sample)placeUnderTitles(id);
 rebuildOptions(id);inspect();timeline();return id;
}
function addBed(media,name,at,sample=false){
 const id=newLayer('audio',name,at,media.duration,media);
 Object.assign(layers[id],{bus:'bed',sample});makeWaveform(media).catch(()=>{});return id;
}
async function addFiles(files,kind){
 const context=insertion;insertion=null;
 let start=context?.at??time;stop();
 for(const f of files){
  const url=URL.createObjectURL(f);
  try{
   const type=kind==='program'?'video':kind==='bed'?'audio':f.type.split('/')[0];
   if(!['video','image','audio'].includes(type))throw Error('Unsupported media type');
   const asset=type==='image'?await loadImage(url):await loadMedia(url,type);
   if(type!=='image'&&(!Number.isFinite(asset.duration)||asset.duration<=0))throw Error('Unreadable duration');
   let id;
   if(kind==='program'){if(demo){clearSamples();if(!context)start=0}id=addProgram(asset,f.name,start);start+=asset.duration}
   else if(kind==='bed'){id=addBed(asset,f.name,start)}
   else{id=newLayer(type,f.name,start,type==='image'?0:asset.duration,asset);if(type==='audio')makeWaveform(asset).catch(()=>{})}
   if(context?.near&&layers[context.near])orderAt(id,context.near,true);
   connectInserts();timeline();const l=layers[id];seek(l.start);chooseLayer(id);notify('Added '+f.name);
  }catch(e){URL.revokeObjectURL(url);notify(f.name+' · '+e.message)}
 }
}
for(const [id,kind] of [['videos','program'],['sounds','bed'],['inserts','insert']]){
 const input=$(id);input.multiple=true;
 input.oncancel=()=>{insertion=null};input.onchange=async()=>{const files=Array.from(input.files);input.value='';await addFiles(files,kind)};
}
sequence.ondrop=async e=>{
 e.preventDefault();sequence.classList.remove('drop');if(busy)return;
 const lane=e.target.closest('.lane'),r=lane?.getBoundingClientRect();
 insertion={at:r?clamp((e.clientX-r.left)/r.width*timelineSpan(),0,timelineSpan()):time};
 await addFiles(Array.from(e.dataTransfer.files),'insert');
};
function deleteTrack(id){
 if(!id||!layers[id])return;
 stop();
 if(id.startsWith('insert-'))discard(id);
 else {layers[id].removed=true;layers[id].visible=false;assets[id]?.pause?.()}
 selectedLayer=null;
 const next=Object.keys(layers).reverse().find(k=>!layers[k].removed&&(layers[k].text||assets[k]));
 rebuildOptions(next||'');timeline();seek(Math.min(time,total()));
 if(next)chooseLayer(next);else{panels.Graphics.hidden=true;notify('Timeline cleared')}
}
function renameTrack(id){
 if(!layers[id])return;
 const label=Array.from($('tracks').querySelectorAll('.track[data-key]')).find(n=>n.dataset.key===id)?.firstElementChild;
 if(!label)return;
 const name=label.querySelector('.trackName');if(!name)return;
 const input=el('input');input.className='trackRename';input.value=layers[id].name||id;input.setAttribute('aria-label','Track name');
 name.replaceWith(input);input.focus();input.select();let done=false;
 const finish=save=>{if(done)return;done=true;if(save&&input.value.trim())layers[id].name=input.value.trim();rebuildOptions(id);timeline();chooseLayer(id)};
 input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false)};input.onblur=()=>finish(true);
}
function decorateHeader(label,id){
 const name=el('span',layers[id].name||id);name.className='trackName';name.title='Double-click to rename';label.replaceChildren(name);
 name.onclick=()=>{stop();chooseLayer(id)};name.ondblclick=()=>renameTrack(id);
 const actions=el('button','⋯');actions.className='trackMore';actions.title='Track actions';actions.onclick=()=>{const r=actions.getBoundingClientRect();showTrackMenu(id,time,r.left,r.bottom)};label.append(actions);
}
function autoScrollRows(y){const r=sequence.getBoundingClientRect();if(y>r.bottom-30)sequence.scrollTop+=12;if(y<r.top+65)sequence.scrollTop-=12}
function changeOrder(id,direction){
 const visible=Object.keys(layers).filter(k=>!layers[k].removed&&(layers[k].text||assets[k]||layers[k].kind));
 const at=visible.indexOf(id);const other=direction==='top'?visible.at(-1):direction==='bottom'?visible[0]:visible[at+(direction==='up'?1:-1)];
 if(other&&other!==id)orderAt(id,other,['up','top'].includes(direction));rebuildOptions(id);timeline();chooseLayer(id);
}
function alignInFront(id,reference){
 const item=layers[id],other=layers[reference];
 if(!item||!other||id===reference)return;
 const range=clipState(id,item,total());
 commitRange(id,item,{...range,start:other.start});
 orderAt(id,reference,true);rebuildOptions(id);timeline();chooseLayer(id);
 seek(other.start+Math.min(.04,range.duration/2));notify((item.name||id)+' aligned above '+(other.name||reference));
}
function showTrackMenu(id,at,x,y){
 if(busy)return;stop();if(id)chooseLayer(id);
 timelineMenu.replaceChildren();
 function action(label,handler){const b=el('button',label);b.setAttribute('role','menuitem');b.onclick=()=>{closeTrackMenu();handler()};timelineMenu.append(b)}
 if(id){
  timelineMenu.append(el('strong',layers[id].name||id));action('Rename track…',()=>renameTrack(id));
  for(const [label,dir] of [['Move up','up'],['Move down','down'],['Bring to front','top'],['Send to back','bottom']])action(label,()=>changeOrder(id,dir));
  action('Move clip to playhead',()=>{const l=layers[id],old=clipState(id,l,total());commitRange(id,l,{...old,start:time});timeline();syncMedia(true);chooseLayer(id)});
  const others=Object.entries(layers).filter(([k,l])=>k!==id&&!l.removed&&['video','image'].includes(l.kind));
  if(others.length){
   const target=el('select');target.setAttribute('aria-label','Track to align with');
   for(const [k,l] of others)target.add(named(k,l.name||k));timelineMenu.append(target);
   action('Align start & bring in front',()=>alignInFront(id,target.value));
  }
  action('Delete track',()=>deleteTrack(id));
 }
 timelineMenu.append(el('small','INSERT AT '+fmt(at)));
 for(const [label,accept] of [['Video','video/*'],['Audio','audio/*'],['Image','image/*']])action('＋ '+label+'…',()=>{insertion={at,near:id};const i=$('inserts');i.accept=accept;i.click()});
 action('＋ Text',()=>{const key=newLayer('text','Text '+(serial+1),at,0);if(id)orderAt(key,id,true);timeline();seek(at);chooseLayer(key)});
 timelineMenu.hidden=false;timelineMenu.style.left=clamp(x,4,innerWidth-timelineMenu.offsetWidth-4)+'px';timelineMenu.style.top=clamp(y,4,innerHeight-timelineMenu.offsetHeight-4)+'px';
}
$('insertLayers').onclick=()=>{insertion=null;$('inserts').accept='video/*,audio/*,image/*';$('inserts').click()};
sequence.oncontextmenu=e=>{
 e.preventDefault();const id=e.target.closest('.track[data-key]')?.dataset.key;
 const lane=e.target.closest('.lane'),r=lane?.getBoundingClientRect();const at=r?clamp((e.clientX-r.left)/r.width*timelineSpan(),0,timelineSpan()):time;
 showTrackMenu(id,at,e.clientX,e.clientY);
};
document.addEventListener('pointerdown',e=>{if(!timelineMenu.contains(e.target))closeTrackMenu()},true);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')closeTrackMenu();if(busy||e.target.closest('input,select,textarea,dialog,[contenteditable=true]')||!layers[selectedLayer])return;
 if(e.key==='Delete'){e.preventDefault();deleteTrack(selectedLayer)}
 if(e.key==='F2'){e.preventDefault();renameTrack(selectedLayer)}
});
function bindScrubber(ruler,span){
 const thumb=el('button','▼');thumb.className='cursor scrubThumb';thumb.title='Drag playhead';thumb.setAttribute('aria-label','Playhead');ruler.append(thumb);
 const scrub=e=>{const r=ruler.getBoundingClientRect();seek(clamp((e.clientX-r.left)/r.width*span,0,total()))};
 ruler.onclick=null;ruler.onpointerdown=e=>{if(e.button!==0||busy)return;e.preventDefault();stop();ruler.setPointerCapture(e.pointerId);scrub(e);ruler.onpointermove=scrub;ruler.onpointerup=ruler.onpointercancel=()=>ruler.onpointermove=null};
 thumb.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();stop();seek(time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.04))}};
}
init();
