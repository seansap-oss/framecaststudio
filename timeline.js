'use strict';
let currentMain=null;
const MIN_LENGTH=0.04;
function timelineSpan(){const length=total();return length+Math.max(1,length*.12)}
function assignMainTimes(){
 let end=0;
 for(const clip of clips){if(!Number.isFinite(clip.at))clip.at=end;end=Math.max(end,clip.at+clip.duration)}
}
function mainEnd(){assignMainTimes();return clips.reduce((end,c)=>Math.max(end,c.at+c.duration),0)}
function applyOrder(keys){
 const entries=keys.map(key=>[key,layers[key]]);
 for(const key of keys)delete layers[key];
 Object.assign(layers,Object.fromEntries(entries));
}
function placeUnderTitles(key){
 const keys=Object.keys(layers).filter(k=>k!==key);
 const firstTitle=keys.findIndex(k=>!['video','image','audio'].includes(layers[k].kind));
 keys.splice(firstTitle<0?keys.length:firstTitle,0,key);applyOrder(keys);
}
function orderAt(key,other,above){
 const keys=Object.keys(layers).filter(k=>k!==key);
 keys.splice(keys.indexOf(other)+(above?1:0),0,key);applyOrder(keys);
}
function bindTrackOrder(lane,key){
 const line=lane.parentElement,label=line.firstChild;line.dataset.key=key;decorateHeader(label,key);
 const grip=el('button','⠿');grip.className='orderGrip';grip.title='Drag up or down to change layer order';label.prepend(grip);
 grip.onpointerdown=e=>{
  if(busy||e.button!==0)return;e.preventDefault();stop();chooseLayer(key);
  grip.setPointerCapture(e.pointerId);let destination=null,above=false;
  function clear(){document.querySelectorAll('.dropAbove,.dropBelow').forEach(n=>n.classList.remove('dropAbove','dropBelow'))}
  grip.onpointermove=ev=>{
   clear();destination=null;autoScrollRows(ev.clientY);const hit=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.track[data-key]');
   if(!hit||hit===line)return;destination=hit.dataset.key;above=ev.clientY<hit.getBoundingClientRect().top+hit.offsetHeight/2;
   hit.classList.add(above?'dropAbove':'dropBelow');
  };
  const finish=commit=>{clear();grip.onpointermove=null;grip.onpointerup=grip.onpointercancel=null;
   if(commit&&destination){orderAt(key,destination,above);rebuildOptions(key);timeline();inspect();notify('Layer order updated')}}
  grip.onpointerup=()=>finish(true);grip.onpointercancel=()=>finish(false);
 };
}
function clipState(key,item,span){
 return {start:key?item.start:item.at,source:item.trimIn||0,duration:key?Math.max(MIN_LENGTH,(item.end||span)-item.start):item.duration};
}
function clipLimits(key,item){
 if(key)return {min:0,max:Infinity,source:assets[key]?.duration||Infinity};
 const others=clips.filter(c=>c!==item);
 return {min:Math.max(0,...others.filter(c=>c.at<item.at).map(c=>c.at+c.duration)),max:Math.min(Infinity,...others.filter(c=>c.at>item.at).map(c=>c.at)),source:item.media.duration};
}
// Body drags preserve the source range. Trimming the left edge preserves the source end.
function editedRange(original,mode,delta,limits){
 let {start,source,duration}=original;
 const minimum=Math.min(MIN_LENGTH,duration);
 if(mode==='move')start=clamp(start+delta,limits.min,limits.max-duration);
 if(mode==='left'){const move=clamp(delta,Math.max(limits.min-start,Number.isFinite(limits.source)?-source:-Infinity),duration-minimum);start+=move;duration-=move;if(Number.isFinite(limits.source))source+=move}
 if(mode==='right')duration=clamp(duration+delta,minimum,Math.min(limits.source-source,limits.max-start));
 if(mode==='slip')source=clamp(source+delta,0,limits.source-duration);
 return {start,source,duration};
}
function commitRange(key,item,state){
 const {start,source,duration}=state;
 if(key){item.start=start;item.end=start+duration}else{item.at=start;item.duration=duration}
 item.trimIn=source;
}
function markSelection(){
 for(const b of document.querySelectorAll('.region[data-clip]'))b.classList.toggle('chosen',b.clipItem===(currentMain||layers[selectedLayer]));
}
function inspectClip(key,item){
 if(key){chooseLayer(key);return}
 currentMain=item;selectedLayer='@presenter';openPanel('Graphics');refreshInspector();markSelection();
}
const inspector=el('section');inspector.className='timing';
inspector.innerHTML='<b id="clipHeading">Clip inspector</b>'+row('Timeline start (s)',number('when',0,1e9,.01))+row('Source in (s)',number('sourceIn',0,1e9,.01))+row('Duration (s)',number('clipLength',.01,1e9,.01));
panels.Graphics.querySelector('.content').prepend(inspector);
panels.Graphics.querySelector('.panelhead b').textContent='Clip inspector · Graphics';
function refreshInspector(state){
 const key=currentMain?null:$('layer').value,item=currentMain||layers[key];if(!item)return;
 const values=state||clipState(key,item,total());
 $('clipHeading').textContent=item.name||key;$('when').value=values.start.toFixed(2);$('sourceIn').value=values.source.toFixed(2);$('clipLength').value=values.duration.toFixed(2);
 $('sourceIn').disabled=!Number.isFinite(clipLimits(key,item).source);
 panels.Graphics.classList.toggle('baseInspector',!!currentMain);
}
for(const [id,field,mode] of [['when','start','move'],['sourceIn','source','slip'],['clipLength','duration','right']]){
 $(id).onchange=()=>{
  const key=currentMain?null:$('layer').value,item=currentMain||layers[key],s=clipState(key,item,total()),v=$(id).valueAsNumber;if(!Number.isFinite(v)){refreshInspector();return}
  stop();const result=editedRange(s,mode,v-s[field],clipLimits(key,item));commitRange(key,item,result);timeline();seek(Math.min(time,total()));inspect();refreshInspector();
 }
}
const thumbnails=new WeakMap();
function addFilmstrip(button,media){
 if(!media||!['IMG','VIDEO'].includes(media.tagName))return;
 if(!thumbnails.has(media)){
  if(media.tagName==='VIDEO'&&media.readyState<2)return;
  const tile=document.createElement('canvas');tile.width=72;tile.height=30;
  try{tile.getContext('2d').drawImage(media,0,0,72,30);thumbnails.set(media,tile.toDataURL('image/jpeg',.65))}catch{return}
 }
 button.style.backgroundImage='linear-gradient(90deg,#192b48ea,#16264166),url('+thumbnails.get(media)+')';
 button.style.backgroundSize='100% 100%, auto 100%';
}
function bindRegion(button,key,item,lane,span){
 const initial=clipState(key,item,total());button.dataset.clip='';button.clipItem=item;
 function position(state){
  button.style.left=(100*state.start/span)+'%';button.style.width=(100*state.duration/span)+'%';
 }
 button.textContent=(item.name||key)+' · '+frameTime(initial.start)+' · '+initial.duration.toFixed(2)+' s';
 position(initial);button.classList.toggle('chosen',item===(currentMain||layers[selectedLayer]));
 for(const side of ['left','right']){const grip=el('span');grip.className='edge '+side;grip.dataset.mode=side;grip.title='Trim '+side+' end';button.append(grip)}
 addFilmstrip(button,key?assets[key]:item.media);
 button.onpointerdown=e=>{
  if(busy||e.button!==0)return;e.preventDefault();stop();inspectClip(key,item);
  const mode=e.target.dataset.mode||'move',x=e.clientX,width=lane.clientWidth,source=clipState(key,item,total()),limits=clipLimits(key,item);
  button.setPointerCapture(e.pointerId);let moved=false,result=source,axis=null,target=null,above=false;
  const originY=e.clientY;
  function clearTarget(){target?.classList.remove('dropAbove','dropBelow');target=null}
  button.onpointermove=ev=>{
   const dy=ev.clientY-originY;
   if(key && mode==='move' && !axis && Math.max(Math.abs(dy),Math.abs(ev.clientX-x))>=5)axis=Math.abs(dy)>Math.abs(ev.clientX-x)?'stack':'time';
   if(key && mode==='move' && !axis)return;
   if(axis==='stack'){
    moved=true;clearTarget();autoScrollRows(ev.clientY);
    const hit=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.track[data-key]');
    if(hit && hit.dataset.key!==key){target=hit;above=ev.clientY<hit.getBoundingClientRect().top+hit.offsetHeight/2;hit.classList.add(above?'dropAbove':'dropBelow')}
    return;
   }
   const px=ev.clientX-x;if(!moved&&Math.abs(px)<2)return;moved=true;
   result=editedRange(source,mode,px/width*span,limits);result=snapRange(key,result,mode,span,width,ev.altKey);position(result);refreshInspector(result);
   notify((item.name||key)+' · '+fmt(result.start)+' → '+fmt(result.start+result.duration)+' · '+result.duration.toFixed(2)+' s');
  };
  const finish=commit=>{
   button.onpointermove=button.onpointerup=button.onpointercancel=null;
   if(commit&&axis==='stack'&&target){orderAt(key,target.dataset.key,above);rebuildOptions(key)}
   else if(commit&&moved&&axis!=='stack')commitRange(key,item,result);
   clearTarget();clearSnap();
   timeline();seek(clamp(time,0,total()));inspect();refreshInspector()
  };
  button.onpointerup=()=>finish(true);button.onpointercancel=()=>finish(false);
 };
 button.onclick=()=>inspectClip(key,item);
}
const desk=$('desk'),timelinePane=$('timeline'),monitorPane=desk.querySelector('main');
const sizingDefault=()=>({left:Math.max(280,Math.round(innerWidth*.19)),right:Math.max(300,Math.round(innerWidth*.22)),timeline:Math.round(innerHeight*.40),mode:'normal'});
let sizing=sizingDefault();
try{Object.assign(sizing,JSON.parse(localStorage.getItem('fc-pane-sizes')||'{}'))}catch{}
function saveSizes(){try{localStorage.setItem('fc-pane-sizes',JSON.stringify(sizing))}catch{}}
function sizeWorkspace(){
 const compact=innerWidth<=850;
 const leftVisible=!!$('left').querySelector('.panel:not([hidden])'),rightVisible=!!$('right').querySelector('.panel:not([hidden])');
 const available=desk.clientWidth-100,sideBudget=Math.max(320,available-300);
 let left=leftVisible?clamp(sizing.left,150,sideBudget-(rightVisible?180:0)):0;
 const right=rightVisible?clamp(sizing.right,180,sideBudget-left):0;
 const maxHeight=Math.max(110,(compact?innerHeight:desk.clientHeight)-150);
 const height=sizing.mode==='fold'?timelinePane.firstElementChild.offsetHeight+4:sizing.mode==='expand'?maxHeight:clamp(sizing.timeline,105,maxHeight);
 if(compact){desk.style.gridTemplateColumns='';desk.style.gridTemplateRows='';timelinePane.style.maxHeight=height+'px';timelinePane.style.height=height+'px'}
 else{desk.style.gridTemplateColumns='60px '+left+'px minmax(150px,1fr) '+right+'px';desk.style.gridTemplateRows='minmax(105px,1fr) '+height+'px';timelinePane.style.maxHeight='';timelinePane.style.height=''}
 timelinePane.classList.toggle('foldTime',sizing.mode==='fold');$('collapseTime').textContent=sizing.mode==='fold'?'▸ Restore':'▾';$('expandTime').textContent=sizing.mode==='expand'?'↙ Restore':'⤢';
}
function sizeMode(mode){sizing.mode=sizing.mode===mode?'normal':mode;sizeWorkspace();saveSizes()}
$('collapseTime').onclick=()=>sizeMode('fold');$('expandTime').onclick=()=>sizeMode('expand');
function divider(axis,side,host){
 const grip=el('div');grip.className='divider '+side;grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation',axis==='y'?'horizontal':'vertical');grip.setAttribute('aria-label','Resize '+side);grip.title='Drag to resize · double-click to restore';
 host.append(grip);
 const coordinate=e=>axis==='y'?e.clientY:e.clientX;
 const extent=()=>side==='timeline'?timelinePane.offsetHeight:$(side).offsetWidth;
 const sign=side==='left'?1:-1;
 const adjust=value=>{sizing[side]=Math.max(0,value);if(side==='timeline')sizing.mode='normal';sizeWorkspace()};
 grip.onpointerdown=e=>{
  if(e.button!==0)return;e.preventDefault();const origin=coordinate(e),size=extent();grip.setPointerCapture(e.pointerId);
  grip.onpointermove=ev=>adjust(size+sign*(coordinate(ev)-origin));grip.onpointerup=grip.onpointercancel=()=>{grip.onpointermove=null;saveSizes()};
 };
 grip.ondblclick=()=>{adjust(sizingDefault()[side]);saveSizes()};
 grip.onkeydown=e=>{const step={ArrowLeft:-16,ArrowRight:16,ArrowUp:-16,ArrowDown:16}[e.key];if(step){e.preventDefault();adjust(extent()+sign*step);saveSizes()}};
}
divider('x','left',monitorPane);divider('x','right',monitorPane);divider('y','timeline',timelinePane.querySelector('.bar'));
new MutationObserver(sizeWorkspace).observe($('left'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
new MutationObserver(sizeWorkspace).observe($('right'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
window.addEventListener('resize',sizeWorkspace);
const originalReset=$('reset').onclick;
$('reset').onclick=()=>{originalReset();sizing=sizingDefault();document.querySelectorAll('.panel').forEach(p=>{p.classList.remove('largeTool');p.style.height='';p.style.width=''});sizeWorkspace();saveSizes()};
for(const p of Object.values(panels)){
 const btn=el('button','⤢');btn.title='Expand or restore tool';p.querySelector('.panelhead').insertBefore(btn,p.querySelector('.panelhead button:last-child'));
 btn.onclick=()=>{if(p.classList.contains('largeTool')){p.classList.remove('largeTool');p.style.height=p.dataset.previousHeight||''}else{p.dataset.previousHeight=p.style.height;p.classList.remove('fold');p.classList.add('largeTool');p.style.height='58vh'}};
}
sizeWorkspace();
