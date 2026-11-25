const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../publish.js'),'utf8');
class Element {
 constructor(){this.attached=false;this.html='';this.value='Quality preset';this.disabled=false}
 set innerHTML(value){this.html=value;if(this.attached)this.install()}
 insertAdjacentHTML(where,value){this.html+=value;if(this.attached)this.install()}
 install(){for(const match of this.html.matchAll(/id="([^"]+)"/g)){const child=new Element();if(match[1]==='container')child.value='MP4';elements.set(match[1],child)}}
 before(element){element.attached=true;element.install()}
 add(option){this.options??=[];this.options.push(option);this.value=option.value}
 replaceChildren(...children){this.options=children;this.value=children[0]?.value||''}
 focus(){}
}
let elements;
test('export controls are attached before their handlers; target-size mode toggles',()=>{
 elements=new Map([['settingsHost',new Element()]]);
 const head=source.slice(0,source.indexOf('const accountPanel='));
 const context=vm.createContext({el:()=>new Element(),row:(title,control)=>'<label>'+title+control+'</label>',select:(id)=>'<select id="'+id+'"></select>',$:id=>elements.get(id)||null});
 assert.doesNotThrow(()=>vm.runInContext(head,context));
 for(const id of ['container','videoCodec','quality','encodingSpeed','exportFps','sizeMode','targetMB'])assert.ok(elements.has(id),id);
 elements.get('sizeMode').value='Target size';vm.runInContext('sizeSettings()',context);
 assert.equal(elements.get('targetMB').disabled,false);
 elements.get('sizeMode').value='Quality preset';vm.runInContext('sizeSettings()',context);
 assert.equal(elements.get('targetMB').disabled,true);
});
test('desktop health handshake enables codec, quality and target-size settings',async()=>{
 elements=new Map([['settingsHost',new Element()],['destinations',new Element()]]);
 const head=source.slice(0,source.indexOf('for(const [button,provider]'));
 const context=vm.createContext({
  el:()=>new Element(),row:(title,control)=>'<label>'+title+control+'</label>',
  select:id=>'<select id="'+id+'"></select>',$:id=>elements.get(id)||null,
  Option:class {constructor(label,value){this.label=label;this.value=value}},
  AbortSignal:{timeout:()=>null},
  fetch:async path=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>path==='/api/health'
   ?{service:'poknapham-local',ffmpeg:true,fixedFrames:true,encoders:{h264:true,hevc:true,av1:true}}
   :{pages:[],youtube:null}}),
  window:{addEventListener(){}},
 });
 vm.runInContext(head,context);
 await vm.runInContext('bridgeReady',context);
 assert.equal(vm.runInContext('bridge',context),true);
 assert.equal(elements.get('quality').disabled,false);
 assert.equal(elements.get('videoCodec').disabled,false);
 assert.equal(elements.get('sizeMode').disabled,false);
 elements.get('sizeMode').value='Target size';elements.get('sizeMode').onchange();
 assert.equal(elements.get('targetMB').disabled,false);
});
