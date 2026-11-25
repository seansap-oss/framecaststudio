const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../deterministic-export.js'),'utf8');
const fn=source.slice(source.indexOf('function renderAudioSources()'),source.indexOf('function renderVisualSources()'));
test('export audio omits hidden tracks and retains per-clip gain, mute and bus',()=>{
 const layers={hidden:{kind:'video',visible:false},speech:{kind:'video',visible:true,start:2,end:12,trimIn:3,volume:45},music:{kind:'audio',visible:true,start:0,end:12,volume:70,bus:'bed',muted:true}};
 const assets=Object.fromEntries(Object.keys(layers).map(k=>[k,{src:k+'.mp4'}]));
 const c=vm.createContext({layers,assets,total:()=>12});vm.runInContext(fn,c);
 const result=JSON.parse(JSON.stringify(vm.runInContext('renderAudioSources()',c)));
 assert.deepEqual(result.map(x=>x.id),['speech','music']);assert.equal(result[0].volume,45);assert.equal(result[0].sourceIn,3);assert.equal(result[0].bus,'clip');assert.equal(result[1].bus,'bed');assert.equal(result[1].mute,true);
});
