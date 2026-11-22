const { test } = require('node:test');
const assert = require('node:assert/strict');
const frames = require('../frame-seek.js');

function video(duration=10){
 const listeners=new Map();let position=0;
 return {tagName:'VIDEO',duration,seeking:false,readyState:4,
  get currentTime(){return position},
  set currentTime(value){position=value;this.seeking=true;queueMicrotask(()=>{this.seeking=false;for(const listener of listeners.get('seeked')||[])listener()})},
  addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener)},
  removeEventListener(type,listener){listeners.get(type)?.delete(listener)}
 };
}
test('inactive pending video cannot hold up a render frame',async()=>{
 const active=video(),inactive=video();inactive.seeking=true;
 const layers={visible:{kind:'video',start:0,end:5,visible:true},old:{kind:'video',start:6,end:10,visible:true}};
 const targets=frames.active([], {visible:active,old:inactive}, layers,2);
 assert.equal(targets.size,1);assert.equal(targets.get(active),2);
 await Promise.all([...targets].map(([media,at])=>frames.seek(media,at)));
 assert.equal(active.currentTime,2);
});
test('repeated timestamp uses decoded frame without a new seek',async()=>{
 const media=video();media.currentTime=1;await new Promise(resolve=>setImmediate(resolve));
 Object.defineProperty(media,'currentTime',{get(){return 1},set(){throw Error('unnecessary seek')}});
 await frames.seek(media,1);
});
test('trimmed main video takes priority over its layer copy',()=>{
 const media=video();const layers={main:{kind:'video',start:2,end:7,visible:true}};
 const targets=frames.active([{media,at:2,duration:5,trimIn:4}],{main:media},layers,3);
 assert.equal(targets.get(media),5);
});
