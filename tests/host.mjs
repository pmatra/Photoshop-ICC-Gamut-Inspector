import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../plugin/host.js',import.meta.url),'utf8');
async function harness(initial={}, release={status:200,tag:"v0.1.6"}){
  const disk=new Map(Object.entries(initial)),messages=[];let listener,failBackup=false;
  const entry=name=>({name,async read(){if(!disk.has(name))throw Error('not found');return disk.get(name);},async write(text){if(failBackup&&name==='settings.backup.json')throw Error('Disk full');disk.set(name,text);},async moveTo(folder,{newName}){disk.set(newName,disk.get(name));disk.delete(name);}});
  const folder={nativePath:'/profiles',async getEntries(){return[];}};
  const dataFolder={async getEntry(name){if(!disk.has(name))throw Error('not found');return entry(name);},async createFile(name,{overwrite}){if(disk.has(name)&&!overwrite)throw Error('exists');return entry(name);}};
  const fs={async getPluginFolder(){return {async getEntry(){return {async read(){return JSON.stringify({version:"0.1.5"});}};}};},async getDataFolder(){return dataFolder;},async getFolder(){return folder;},async createPersistentToken(){return'directory-token';},async getEntryForPersistentToken(){return folder;}};
  const view={postMessage:m=>messages.push(m)};
  const context={fetch:async url=>{
    assert.equal(url,'https://api.github.com/repos/pmatra/Photoshop-ICC-Gamut-Inspector/releases?per_page=100');
    return {status:release.status,ok:release.status===200,json:async()=>release.items ?? [{tag_name:release.tag}]};
  },require:name=>name==='uxp'?{storage:{localFileSystem:fs,formats:{binary:'binary'}}}:{app:{get activeDocument(){throw Error('No document');}}},document:{getElementById:()=>view},window:{addEventListener:(name,fn)=>listener=fn},setTimeout,console};
  vm.runInNewContext(source,context);
  const send=(type,fields={},from=view)=>listener({source:from,data:{namespace:'icc-inspector',type,...fields}});
  const flush=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,0));};
  await send('ready');await flush();
  return{disk,messages,send,flush,failBackup:()=>{failBackup=true;}};
}
const h=await harness();
assert.ok(h.messages.some(m=>m.type==='version'&&m.version==='0.1.5'));
await h.send('checkUpdate');
assert.match(h.messages.at(-1).message,/0\.1\.6 is available/);
const previews=await harness({}, {status:200,items:[
  {tag_name:'v0.1.8',draft:true},
  {tag_name:'v0.1.6',prerelease:true},
  {tag_name:'v0.1.7',prerelease:true}
]});
await previews.send('checkUpdate');
assert.match(previews.messages.at(-1).message,/0\.1\.7 is available/);
const older=await harness({}, {status:200,tag:'v0.0.99'});
await older.send('checkUpdate');
assert.match(older.messages.at(-1).message,/latest published version/);
const noRelease=await harness({}, {status:200,items:[]});
await noRelease.send('checkUpdate');
assert.match(noRelease.messages.at(-1).message,/No published release/);
await h.send('directory',{makeDefault:true});await h.send('saveSettings',{values:{theme:'light',density:13}});await h.flush();
const saved=JSON.parse(h.disk.get('settings.json'));assert.equal(saved.values.directoryToken,'directory-token');assert.equal(saved.values.theme,'light');
assert.equal(JSON.parse(h.disk.get('settings.backup.json')).schema,1);
const old=h.disk.get('settings.json');h.failBackup();await h.send('saveSettings',{values:{theme:'dark'}});await h.flush();assert.equal(h.disk.get('settings.json'),old);assert.ok(h.messages.some(m=>m.type==='error'&&m.message.includes('Disk full')));
const count=h.messages.length;await h.send('load',{id:'/arbitrary/path'},{});assert.equal(h.messages.length,count);
await h.send('load',{id:'/arbitrary/path'});assert.ok(h.messages.at(-1).message.includes('stale'));
const recovery=await harness({'settings.json':'{broken','settings.backup.json':JSON.stringify({schema:1,values:{theme:'dark'}})});
assert.ok(recovery.messages.some(m=>m.type==='notice'&&m.message.includes('recovered')));
await recovery.send('saveSettings',{values:{theme:'light'}});await recovery.flush();
assert.ok([...recovery.disk.keys()].some(n=>n.startsWith('settings.malformed-')));assert.equal(JSON.parse(recovery.disk.get('settings.backup.json')).values.theme,'dark');
console.log('Host bridge sender validation, directory permission token retention, serialized settings, backup failure protection and malformed recovery: passed');
