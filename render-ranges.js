'use strict';
const ranges=[];let selectedRange='all',rangeSerial=0;
const rangeTools=el('section');rangeTools.className='rangeTools';rangeTools.innerHTML='<div class="rangeHeading"><b>Export ranges</b><span>Drag across the strip to mark a clip, or set In and Out at the playhead.</span><button id="rangeIn">Set In</button><button id="rangeOut">Set Out</button><button id="rangeAdd">+ Add range</button></div><div id="rangeStrip" aria-label="Drag to mark an export range"></div><div id="rangeList"></div>';
document.querySelector('.timelineHint').after(rangeTools);
const renderActions=el('div');renderActions.className='actions renderActions';renderActions.innerHTML='<button id="pauseRender" disabled>Pause render</button><button id="cancelRender" disabled>Cancel render</button>';
$('progress').after(renderActions);
$('progress').before(row('Export section','<select id="rangeChoice"><option value="all">Whole video</option></select>'));
let pendingIn=null;
function paintRanges(){
 const strip=$('rangeStrip'),list=$('rangeList'),choice=$('rangeChoice');strip.replaceChildren();list.replaceChildren();
 const previous=selectedRange;choice.replaceChildren(new Option('Whole video','all'));
 for(const r of ranges){
  choice.add(new Option(r.name+' · '+fmt(r.start)+'–'+fmt(r.end),String(r.id)));
  const bar=el('button',r.name);bar.className='rangeMarker';bar.style.left=100*r.start/timelineSpan()+'%';bar.style.width=Math.max(.3,100*(r.end-r.start)/timelineSpan())+'%';bar.title=fmt(r.start)+' – '+fmt(r.end);bar.onclick=()=>{selectedRange=String(r.id);paintRanges();seek(r.start)};strip.append(bar);
  const line=el('div');line.className='rangeItem';const name=el('input');name.value=r.name;name.setAttribute('aria-label','Range name');name.onchange=()=>{r.name=name.value.trim()||'Clip '+r.id;paintRanges()};
  const start=el('input');start.type='number';start.step='0.01';start.min='0';start.value=r.start.toFixed(2);start.setAttribute('aria-label','Range start seconds');
  const end=el('input');end.type='number';end.step='0.01';end.min='0';end.value=r.end.toFixed(2);end.setAttribute('aria-label','Range end seconds');
  const update=()=>{r.start=Math.max(0,Math.min(+start.value,total()-1/30));r.end=Math.min(total(),Math.max(r.start+1/30,+end.value));paintRanges()};start.onchange=update;end.onchange=update;
  const remove=el('button','×');remove.title='Remove range';remove.onclick=()=>{ranges.splice(ranges.indexOf(r),1);if(selectedRange===String(r.id))selectedRange='all';paintRanges()};
  line.append(name,start,el('span','to'),end,remove);list.append(line);
 }
 choice.value=ranges.some(r=>String(r.id)===previous)?previous:'all';selectedRange=choice.value;
}
$('rangeChoice').onchange=()=>{selectedRange=$('rangeChoice').value;const r=ranges.find(x=>String(x.id)===selectedRange);if(r)seek(r.start)};
$('rangeIn').onclick=()=>{pendingIn=time;notify('In point: '+fmt(time))};
function addRange(start,end){if(end-start<1/30)return notify('Choose at least one frame');const r={id:++rangeSerial,name:'Clip '+rangeSerial,start:Math.max(0,start),end:Math.min(total(),end)};ranges.push(r);selectedRange=String(r.id);paintRanges();notify('Marked '+r.name+' · '+fmt(r.start)+' to '+fmt(r.end))}
$('rangeOut').onclick=()=>{if(pendingIn===null)return notify('Set In first');addRange(Math.min(pendingIn,time),Math.max(pendingIn,time));pendingIn=null};
$('rangeAdd').onclick=()=>{const start=Math.max(0,Math.min(time,total()-5));addRange(start,Math.min(total(),start+5))};
const strip=$('rangeStrip');let dragStart=null;
strip.onpointerdown=e=>{if(e.target!==strip||busy)return;dragStart=Math.max(0,Math.min(total(),(e.clientX-strip.getBoundingClientRect().left)/strip.clientWidth*timelineSpan()));strip.setPointerCapture(e.pointerId)};
strip.onpointerup=e=>{if(dragStart===null)return;const end=Math.max(0,Math.min(total(),(e.clientX-strip.getBoundingClientRect().left)/strip.clientWidth*timelineSpan()));addRange(Math.min(dragStart,end),Math.max(dragStart,end));dragStart=null};
const beforeRender=render;
render=async function(){const r=ranges.find(x=>String(x.id)===$('rangeChoice').value);renderStart=r?.start??0;renderEnd=r?.end??null;await beforeRender()};
$('pauseRender').onclick=()=>{if(!busy||!record)return;if(!renderPaused&&record.state==='recording'){record.pause();stop();renderPaused=true;$('pauseRender').textContent='Resume render'}else if(renderPaused&&record.state==='paused'){record.resume();playing=true;anchor=performance.now()-time*1000;syncMedia(true);renderPaused=false;$('pauseRender').textContent='Pause render'}};
$('cancelRender').onclick=()=>{if(!busy)return;renderCancelled=true;renderAbort?.abort();jobs=[];jobSet=[];if(record&&record.state!=='inactive')record.stop();else{stop();lock(false);finishJob(false)}$('jobStatus').value='Render cancelled';notify('Render cancelled')};
paintRanges();
