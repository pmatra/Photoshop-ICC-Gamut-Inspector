/* UXP host: file access and read-only Photoshop document integration.
   The local WebView can only request operations on entries chosen by the user. */
const {storage}=require('uxp');
const {app}=require('photoshop');
const fs=storage.localFileSystem, formats=storage.formats;
const view=document.getElementById('inspector');
const files=new Map();
let serial=0, scanSerial=0, folder=null, settings={}, settingsFolder=null, saveQueue=Promise.resolve(), viewReady=false;
const pending=[];
const MAX_BYTES=64*1024*1024;
function send(type,data={}){const message={namespace:'icc-inspector',type,...data};if(viewReady)view.postMessage(message);else pending.push(message);}
async function readSettings(){
  settingsFolder=await fs.getDataFolder();
  for(const name of ['settings.json','settings.backup.json']){
    try{const file=await settingsFolder.getEntry(name);const parsed=JSON.parse(await file.read());if(!parsed||parsed.schema!==1||typeof parsed.values!=='object')throw Error('Invalid settings format');settings=parsed.values;if(name.includes('backup'))send('notice',{message:'Settings recovered from backup.'});return;}
    catch(e){if(!String(e.message).match(/not exist|not found|could not find/i))send('notice',{message:`Could not read ${name}: ${e.message}`});}
  }
}
function saveSettings(values){
  // Serialize writes; retain a valid previous snapshot. UXP does not promise
  // filesystem-level atomic rename on every platform, so keep a backup too.
  const text=JSON.stringify({schema:1,values});settings=JSON.parse(text).values;
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    JSON.parse(text);
    let old;
    try{old=await settingsFolder.getEntry('settings.json');const contents=await old.read();const parsed=JSON.parse(contents);if(parsed.schema===1){const backup=await settingsFolder.createFile('settings.backup.json',{overwrite:true});await backup.write(contents);}}catch(e){if(old)send('notice',{message:'Previous settings are malformed; backup was preserved.'});}
    const temp=await settingsFolder.createFile('settings.pending.json',{overwrite:true});await temp.write(text);
    await temp.moveTo(settingsFolder,{newName:'settings.json',overwrite:true});
  }).catch(e=>send('error',{message:`Could not save settings: ${e.message}`}));
}
async function bytesFor(entry){if(entry.isFolder)throw Error('Choose an ICC file.');const meta=await entry.getMetadata();if(meta.size>MAX_BYTES)throw Error('Profile exceeds 64 MiB.');const buffer=await entry.read({format:formats.binary});if(buffer.byteLength>MAX_BYTES)throw Error('Profile exceeds 64 MiB.');return new Uint8Array(buffer);}
function register(entry){const id=`file-${++serial}`;files.set(id,entry);return{id,name:entry.name,path:entry.nativePath};}
async function loadFile(entry,slot){const bytes=await bytesFor(entry);send('profile',{...register(entry),slot,bytes:Array.from(bytes)});}
async function listFolder(entry){
  const scan=++scanSerial;folder=entry;files.clear();send('directoryStart',{path:entry.nativePath});
  const entries=await entry.getEntries();let batch=[];
  for(const file of entries){if(file.isFolder||! /\.(icc|icm)$/i.test(file.name))continue;
    if(scan!==scanSerial)return;
    const info=register(file);
    try{const bytes=await bytesFor(file);batch.push({...info,bytes:Array.from(bytes)});}catch(e){batch.push({...info,error:e.message});}
    if(scan!==scanSerial)return;
    if(batch.length>=4||batch.reduce((n,e)=>n+(e.bytes?.length||0),0)>2*1024*1024){send('directoryBatch',{entries:batch});batch=[];await new Promise(r=>setTimeout(r,0));}
  }
  if(scan!==scanSerial)return;if(batch.length)send('directoryBatch',{entries:batch});send('directoryEnd');
}
function documentInfo(){
  try{const doc=app.activeDocument;send('document',{name:doc.title||doc.name||'Untitled',profile:doc.colorProfileName||'None',mode:String(doc.mode)});}
  catch{send('document',{name:'No open document',profile:'',mode:''});}
}
const initialized=readSettings();
window.addEventListener('message',async event=>{
  if(event.source!==view||event.data?.namespace!=='icc-inspector')return;
  const message=event.data;
  try{
    await initialized;
    switch(message.type){
      case 'ready':viewReady=true;for(const message of pending.splice(0))view.postMessage(message);send('settings',{values:settings});documentInfo();
        if(settings.directoryToken){try{await listFolder(await fs.getEntryForPersistentToken(settings.directoryToken));}catch(e){send('error',{message:'Saved directory is unavailable. Choose Open Directory to grant access again.'});}}
        break;
      case 'open':{const file=await fs.getFileForOpening({types:['icc','icm'],allowMultiple:false});if(file)await loadFile(file,message.slot==='comparison'?'comparison':'primary');break;}
      case 'directory':{const chosen=await fs.getFolder();if(chosen){if(message.makeDefault){const token=await fs.createPersistentToken(chosen);saveSettings({...settings,directoryToken:token,directoryPath:chosen.nativePath});}await listFolder(chosen);}break;}
      case 'refresh':if(folder)await listFolder(folder);else send('error',{message:'Choose a directory first.'});break;
      case 'load':{const entry=files.get(message.id);if(!entry)throw Error('This profile list is stale. Refresh and select it again.');await loadFile(entry,message.slot==='comparison'?'comparison':'primary');break;}
      case 'document':documentInfo();break;
      case 'saveSettings':{const allowed=['categories','membership','theme','sort','density','intent'];const next={...settings};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(message.values||{},key))next[key]=message.values[key];saveSettings(next);break;}
      case 'export':{if(typeof message.csv!=='string'||message.csv.length>32*1024*1024)throw Error('Invalid export data.');const dest=await fs.getFileForSaving('gamut-samples.csv',{types:['csv']});if(dest){await dest.write(message.csv);send('notice',{message:'Gamut samples exported.'});}break;}
    }
  }catch(e){send('error',{message:e.message||String(e)});}
});
