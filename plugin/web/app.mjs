import {parseICC,decodeTag} from './icc.mjs';
import {cleanSettings,visibleRows,removeCategory,renameCategory} from './catalog.mjs';
import {GamutViewer} from './viewer.mjs';
const $=id=>document.getElementById(id), hasHost=!!window.uxpHost;
let settings=cleanSettings(),rows=[],selected=new Set(),closed=new Set(),sequence=0;
const profiles={},results={},jobs={};
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function send(type,data={}){if(hasHost)window.uxpHost.postMessage({namespace:'icc-inspector',type,...data});else if(type!=='ready')notice('This operation is available inside Photoshop.',true);}
function save(){send('saveSettings',{values:settings});}
const viewer=new GamutViewer($('viewport'),m=>notice(m,true));
const worker=new Worker('./worker.js');
worker.onerror=e=>notice(`Color worker failed: ${e.message}. Check the packaged engine files.`,true);
worker.onmessage=({data:d})=>{
  if(jobs[d.slot]!==d.id)return;
  if(d.type==='progress'){notice(`${d.slot==='primary'?'Primary':'Comparison'}: ${d.label} · ${Math.round(d.value*100)}%`);return;}
  if(d.type==='error'){notice(d.error,true);return;}
  if(d.type==='result'){
    results[d.slot]=d;viewer.set(d.slot,d);$('export').disabled=!results.primary;
    const p=results.primary,c=results.comparison;
    const version=p?`${Math.floor(p.engineVersion/1000)}.${Math.floor(p.engineVersion%1000/10)}${p.engineVersion%10?'.'+p.engineVersion%10:''}`:'';
    $('statistics').textContent=p?`${p.total.toLocaleString()} full samples · hull ${Math.round(p.volume).toLocaleString()} Lab³${c?` · comparison ${Math.round(c.volume).toLocaleString()} Lab³`:''} · LittleCMS ${version} · D50 CIELAB`:'';
    notice(d.hullError||'Ready. Drag to orbit; scroll to zoom. Display points are decimated; CSV retains every sample.');legend();
  }
};
function legend(){
  $('primaryLegend').textContent=`● Primary: ${profiles.primary?.name||'none'}${profiles.primary?' · depth tested':''}`;
  $('comparisonLegend').textContent=`◇ Comparison: ${profiles.comparison?.name||'none'}${profiles.comparison?($('xray').checked?' · cyan X-ray':' · cyan, depth tested'):''}`;
}
function tab(list){$('inspectPage').hidden=list;$('listPage').hidden=!list;$('inspectTab').setAttribute('aria-selected',String(!list));$('listTab').setAttribute('aria-selected',String(list));if(!list)viewer.resize();}
function sample(slot){
  const p=profiles[slot];if(!p)return;delete results[slot];viewer.clear(slot);if(slot==='primary')$('export').disabled=true;
  const id=++sequence;jobs[slot]=id;worker.postMessage({slot,id,bytes:p.bytes,density:settings.density,intent:settings.intent,space:p.meta.colorSpace});notice(`Sampling ${p.name}…`);
}
function acceptProfile(p){
  const bytes=new Uint8Array(p.bytes),meta=parseICC(bytes),slot=p.slot==='comparison'?'comparison':'primary';profiles[slot]={...p,bytes,meta};
  if(slot==='primary'){const dl=$('metadata');dl.replaceChildren();for(const [key,value] of Object.entries({Filename:p.name,Description:meta.description||'—',Version:meta.version,'Device class':meta.deviceClass,'Device color space':meta.colorSpace,PCS:meta.pcs,Created:meta.created,'File size':`${meta.size.toLocaleString()} bytes`,'ICC tags':meta.tags.length})){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;dl.append(dt,dd);}
    $('tagSelect').replaceChildren(...meta.tags.map((t,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${t.signature} · ${t.type} · ${t.length} bytes`;return o;}));showTag();}
  legend();tab(false);sample(slot);
}
function showTag(){
  const p=profiles.primary;if(!p)return;const tag=p.meta.tags[Number($('tagSelect').value)];$('curve').hidden=true;
  try{const decoded=decodeTag(p.bytes,tag),{samples,...info}=decoded;$('tagDetails').textContent=JSON.stringify(info,null,2);
    if(samples){const canvas=$('curve');canvas.hidden=false;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#7b879655';ctx.lineWidth=1;for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(25+i*(w-40)/4,10);ctx.lineTo(25+i*(w-40)/4,h-25);ctx.moveTo(25,10+i*(h-35)/4);ctx.lineTo(w-15,10+i*(h-35)/4);ctx.stroke();}ctx.strokeStyle='#4ca6ff';ctx.lineWidth=3;ctx.beginPath();samples.forEach(([x,y],i)=>{const px=25+x*(w-40),py=h-25-y*(h-35);if(Number.isFinite(py))i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();}
  }catch(e){$('tagDetails').textContent=`Could not decode this tag: ${e.message}`;}
}
function applySettings(){const theme=settings.theme;if(theme==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=theme;$('theme').value=theme;$('density').value=settings.density;$('intent').value=settings.intent;$('sort').value=settings.sort.column;$('sortDirection').textContent=settings.sort.direction===1?'↑':'↓';renderList();}
function cell(text){const td=document.createElement('td');td.textContent=text;return td;}
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;return b;}
function renderList(){
  $('selectedCount').textContent=`${selected.size} selected`;
  const target=$('profiles');target.replaceChildren();
  for(const category of [...settings.categories,'Uncategorized']){
    const group=document.createElement('details');group.className='category';group.open=!closed.has(category);group.ontoggle=()=>group.open?closed.delete(category):closed.add(category);
    const summary=document.createElement('summary'),name=document.createElement('span');name.className='category-name';const found=visibleRows(rows,settings,category,$('search').value);name.textContent=`${category} (${found.length})`;
    summary.append(name);if(category!=='Uncategorized'){
      name.ondblclick=e=>{e.preventDefault();categoryDialog(category);};
      const rename=button('Rename',e=>{e.preventDefault();e.stopPropagation();categoryDialog(category);});rename.className='remove-category';summary.append(rename);
      const remove=button('Remove',e=>{e.preventDefault();e.stopPropagation();confirmRemove(category);});remove.className='remove-category';summary.append(remove);
      summary.oncontextmenu=e=>{e.preventDefault();confirmRemove(category);};
    }
    summary.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-icc-profile-ids')){e.preventDefault();summary.classList.add('dragover');}};summary.ondragleave=()=>summary.classList.remove('dragover');
    summary.ondrop=e=>{e.preventDefault();summary.classList.remove('dragover');try{const ids=JSON.parse(e.dataTransfer.getData('application/x-icc-profile-ids'));for(const row of rows)if(ids.includes(row.id)){if(category==='Uncategorized')delete settings.membership[row.path];else settings.membership[row.path]=category;}save();renderList();}catch{notice('Invalid profile drag data.',true);}};
    const table=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr');for(const title of ['','Filename','Version','Space','Created']){const th=document.createElement('th');th.textContent=title;head.append(th);}thead.append(head);table.append(thead);
    const tbody=document.createElement('tbody');
    for(const row of found){const tr=document.createElement('tr');tr.draggable=true;tr.ondragstart=e=>{const ids=selected.has(row.id)?[...selected]:[row.id];e.dataTransfer.setData('application/x-icc-profile-ids',JSON.stringify(ids));e.dataTransfer.effectAllowed='move';};
      const checkCell=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.id);check.setAttribute('aria-label',`Select ${row.name}`);check.onchange=()=>{check.checked?selected.add(row.id):selected.delete(row.id);$('selectedCount').textContent=`${selected.size} selected`;};checkCell.append(check);
      const nameCell=cell(row.name);nameCell.title=row.error||row.meta?.description||row.path;const actions=document.createElement('div');actions.className='row-actions';if(!row.error){actions.append(button('Inspect',()=>send('load',{id:row.id,slot:'primary'})),button('Compare',()=>send('load',{id:row.id,slot:'comparison'})));}else{const err=document.createElement('small');err.textContent=row.error;actions.append(err);}nameCell.append(actions);
      tr.append(checkCell,nameCell,cell(row.meta?.version||'—'),cell(row.meta?.colorSpace||'—'),cell(row.meta?.created||'—'));tbody.append(tr);
    }
    table.append(tbody);group.append(summary,table);target.append(group);
  }
}
async function nameDialog(title,value='',removing=false){const dialog=$('categoryDialog');$('categoryTitle').textContent=title;$('categoryName').value=value;$('categoryName').hidden=removing;$('categoryName').required=!removing;$('categoryConfirm').textContent=removing?'Remove category':'Save';dialog.returnValue='';dialog.showModal();if(!removing)$('categoryName').focus();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'?(removing?true:$('categoryName').value.trim()):null),{once:true}));}
async function categoryDialog(oldName){const name=await nameDialog(oldName?'Rename category':'Create category',oldName||'');if(name===null||name===oldName)return;try{if(oldName)renameCategory(settings,oldName,name);else{if(!name||name.length>100||name==='Uncategorized'||settings.categories.includes(name))throw Error('Choose a unique category name.');settings.categories.push(name);for(const row of rows)if(selected.has(row.id))settings.membership[row.path]=name;selected.clear();}save();renderList();}catch(e){notice(e.message,true);}}
async function confirmRemove(category){if(await nameDialog(`Remove “${category}”? Profiles return to Uncategorized. Files stay in place.`,'',true)){removeCategory(settings,category);closed.delete(category);save();renderList();}}
window.addEventListener('message',({data:d,source})=>{if(!hasHost||source!==window.uxpHost||d?.namespace!=='icc-inspector')return;try{
  if(d.type==='settings'){settings=cleanSettings(d.values);applySettings();}
  if(d.type==='profile')acceptProfile(d);
  if(d.type==='directoryStart'){rows=[];selected.clear();$('directoryPath').textContent=d.path;renderList();}
  if(d.type==='directoryBatch'){for(const e of d.entries){try{rows.push({...e,bytes:undefined,meta:e.error?null:parseICC(new Uint8Array(e.bytes))});}catch(err){rows.push({...e,bytes:undefined,error:err.message});}}renderList();}
  if(d.type==='directoryEnd')notice(`${rows.length} profiles in directory.`);
  if(d.type==='document')$('documentInfo').textContent=`${d.name}${d.profile?` · ${d.profile}`:''}${d.mode?` · ${d.mode}`:''}`;
  if(d.type==='notice'||d.type==='error')notice(d.message,d.type==='error');
}catch(e){notice(e.message,true);}});
$('inspectTab').onclick=()=>tab(false);$('listTab').onclick=()=>tab(true);$('open').onclick=()=>send('open',{slot:'primary'});$('compare').onclick=()=>send('open',{slot:'comparison'});
$('clearCompare').onclick=()=>{jobs.comparison=++sequence;worker.postMessage({slot:'comparison',id:jobs.comparison,cancel:true});delete profiles.comparison;delete results.comparison;viewer.clear('comparison');legend();};
$('documentRefresh').onclick=()=>send('document');$('directory').onclick=()=>send('directory',{makeDefault:$('makeDefault').checked});$('refresh').onclick=()=>send('refresh');
$('density').onchange=()=>{settings.density=Number($('density').value);save();for(const slot of Object.keys(profiles))sample(slot);};$('intent').onchange=()=>{settings.intent=Number($('intent').value);save();for(const slot of Object.keys(profiles))sample(slot);};
$('renderMode').onchange=$('xray').onchange=()=>{viewer.configure($('renderMode').value,$('xray').checked);legend();};$('reset').onclick=()=>viewer.reset();$('tagSelect').onchange=showTag;
$('settingsButton').onclick=()=>{$('settings').hidden=!$('settings').hidden;};$('theme').onchange=()=>{settings.theme=$('theme').value;applySettings();save();};$('search').oninput=renderList;$('newCategory').onclick=()=>categoryDialog();
$('sort').onchange=()=>{settings.sort.column=$('sort').value;save();renderList();};$('sortDirection').onclick=()=>{settings.sort.direction*=-1;save();applySettings();};
$('export').onclick=()=>{const d=results.primary,p=profiles.primary;if(!d||!p)return;const lines=['# ICC / Gamut Inspector; D50 Lab; convex hull is an approximation',`# Profile SHA-256: ${d.digest}; density: ${settings.density}; intent: ${settings.intent}`,'index,L_star,a_star,b_star,sRGB_R,sRGB_G,sRGB_B'];for(let i=0;i<d.total;i++)lines.push(`${i},${Array.from(d.samples.subarray(i*6,i*6+6)).map(n=>n.toFixed(6)).join(',')}`);send('export',{csv:lines.join('\n')});};
applySettings();send('ready');
