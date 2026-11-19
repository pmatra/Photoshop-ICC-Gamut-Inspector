export function cleanSettings(value={}) {
  const categories=Array.isArray(value.categories)?[...new Set(value.categories.filter(n=>typeof n==='string'&&n.trim()&&n.length<=100&&n!=='Uncategorized'))]:[];
  const membership={};for(const [path,name] of Object.entries(value.membership||{}))if(categories.includes(name))membership[path]=name;
  return {categories,membership,theme:['system','dark','light'].includes(value.theme)?value.theme:'system',sort:{column:['name','version','colorSpace','created'].includes(value.sort?.column)?value.sort.column:'name',direction:value.sort?.direction===-1?-1:1},density:[5,9,13,17,21].includes(value.density)?value.density:9,intent:[0,1,2,3].includes(value.intent)?value.intent:1};
}
export function visibleRows(rows,settings,category,query='') {
  const q=query.trim().toLocaleLowerCase(),col=settings.sort.column,dir=settings.sort.direction;
  return rows.filter(r=>(settings.membership[r.path]||'Uncategorized')===category&&(!q||[r.name,r.meta?.description,r.meta?.version,r.meta?.colorSpace,r.meta?.created,category,r.error].join(' ').toLocaleLowerCase().includes(q)))
    .sort((a,b)=>{const av=col==='name'?a.name:a.meta?.[col],bv=col==='name'?b.name:b.meta?.[col];const invalid=x=>!x||x==='Invalid date';if(invalid(av)!==invalid(bv))return invalid(av)?1:-1;return dir*(String(av||'').localeCompare(String(bv||''),undefined,{numeric:true})||a.name.localeCompare(b.name));});
}
export function removeCategory(settings,name) {
  settings.categories=settings.categories.filter(n=>n!==name);
  for(const path of Object.keys(settings.membership))if(settings.membership[path]===name)delete settings.membership[path];
}
export function renameCategory(settings,oldName,newName) {
  newName=newName.trim();if(!newName||newName.length>100||newName==='Uncategorized'||settings.categories.includes(newName))throw Error('Choose a unique category name (1–100 characters).');
  settings.categories=settings.categories.map(n=>n===oldName?newName:n);
  for(const path of Object.keys(settings.membership))if(settings.membership[path]===oldName)settings.membership[path]=newName;
}
