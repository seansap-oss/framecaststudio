'use strict';
// One inspector for each ticker instance, including duplicates and reopened projects.
const tickerInspector=el('section');tickerInspector.className='tickerInspector';
tickerInspector.innerHTML='<h3>Messages <button type="button" id="inspectorDuplicate">⧉ Duplicate layer</button></h3><p>One update per row. Drag the grip to reorder.</p><div id="tickerMessages"></div><button type="button" id="addTickerMessage">+ Add message</button><h3>Motion</h3><div id="tickerMotion"></div>';
const graphicContent=panels.Graphics.querySelector('.content');
const wordsRow=$('words').closest('label');wordsRow.before(tickerInspector);
graphicContent.insertBefore($('inspectorDuplicate'),tickerInspector);
const motionContent=panels.Motion.querySelector('.content');
const motionPlaceholder=el('div');motionContent.prepend(motionPlaceholder);
const motionRows=['direction','speed','hold','emoji','repeat'].map(id=>$(id).closest('label'));
const isTicker=(id,l)=>!!l&&(id==='Top ticker'||id==='Bottom ticker'||l.ticker===true);
const tickerIcons=['','🏆','⚽','🔥','📣','⭐','◆','🔴','🎙️','⚡','✅','📺'];
function tickerMessages(l){
 if(!Array.isArray(l.messages))l.messages=(l.text||'').split(/\r?\n/).filter(Boolean).map(text=>({text,icon:'',separator:l.emoji||' • '}));
 return l.messages;
}
function syncTickerText(l){l.text=l.messages.map(m=>m.text).join('\n');timeline()}
function renderTickerMessages(l){
 const host=$('tickerMessages');host.replaceChildren();
 tickerMessages(l).forEach((message,index)=>{
  const line=el('div');line.className='tickerMessage';line.draggable=true;
  const grip=el('span','⋮⋮');grip.title='Drag to reorder messages';
  const number=el('span',String(index+1));number.className='tickerIndex';
  const input=el('textarea');input.rows=2;input.placeholder='Write update '+(index+1);input.value=message.text;
  input.setAttribute('aria-label','Message '+(index+1));input.oninput=()=>{message.text=input.value;syncTickerText(l)};
  const icon=el('select');icon.setAttribute('aria-label','Emoji or icon for message '+(index+1));
  for(const symbol of tickerIcons)icon.add(new Option(symbol||'No icon',symbol));
  if(message.icon&&!tickerIcons.includes(message.icon))icon.add(new Option(message.icon,message.icon));icon.value=message.icon||'';
  icon.onchange=()=>{message.icon=icon.value;timeline()};
  const separator=el('input');separator.value=message.separator??l.emoji??' • ';separator.placeholder='Separator';separator.title='Separator after this message in horizontal scrolling';separator.setAttribute('aria-label','Separator after message '+(index+1));separator.oninput=()=>{message.separator=separator.value;timeline()};
  const copy=el('button','⧉');copy.title='Duplicate message';copy.onclick=()=>{l.messages.splice(index+1,0,structuredClone(message));syncTickerText(l);renderTickerMessages(l)};
  const remove=el('button','×');remove.title='Remove message';remove.onclick=()=>{l.messages.splice(index,1);syncTickerText(l);renderTickerMessages(l)};
  line.append(grip,number,input,icon,separator,copy,remove);host.append(line);
  line.ondragstart=e=>{if(e.target!==line&&e.target!==grip)return e.preventDefault();e.dataTransfer.setData('text/plain',String(index));e.dataTransfer.effectAllowed='move'};
  line.ondragover=e=>e.preventDefault();line.ondrop=e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));if(!Number.isInteger(from)||from<0||from>=l.messages.length)return;l.messages.splice(index,0,l.messages.splice(from,1)[0]);syncTickerText(l);renderTickerMessages(l)};
 });
}
const beforeTickerInspect=inspect;
inspect=function(){
 const id=$('layer').value,l=layers[id],ticker=isTicker(id,l);
 if(ticker){if(!$('moving').querySelector('option[value="'+CSS.escape(id)+'"]'))$('moving').add(new Option(l.name||id,id));$('moving').value=id}
 beforeTickerInspect();tickerInspector.hidden=!ticker;wordsRow.hidden=ticker;
 if(ticker){for(const row of motionRows)$('tickerMotion').append(row);renderTickerMessages(l)}
 else for(const row of motionRows)motionPlaceholder.append(row);
};
$('addTickerMessage').onclick=()=>{const l=current();if(!l)return;tickerMessages(l).push({text:'',icon:'',separator:l.emoji||' • '});renderTickerMessages(l);$('tickerMessages').lastElementChild?.querySelector('textarea').focus()};
$('inspectorDuplicate').onclick=()=>$('duplicateSelected').click();
// A copied ticker retains message rows, direction, speed, font and position.
const originalDuplicate=$('duplicateSelected').onclick;
$('duplicateSelected').onclick=async()=>{const source=selectedLayer;await originalDuplicate();if(source!==selectedLayer&&isTicker(source,layers[source]))layers[selectedLayer].ticker=true;inspect()};
inspect();
