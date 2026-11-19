export const MAX_PROFILE_BYTES = 64 * 1024 * 1024;
const text = (bytes) => new TextDecoder('latin1').decode(bytes).replace(/\0.*$/s, '').trim();
export function parseICC(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 132 || bytes.length > MAX_PROFILE_BYTES) throw Error('ICC file must be between 132 bytes and 64 MiB.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = v.getUint32(0);
  if (size < 132 || size > bytes.length) throw Error('ICC declared size is outside the file.');
  const signature = (off) => text(bytes.subarray(off, off + 4));
  if (signature(36) !== 'acsp') throw Error('Not an ICC profile (missing acsp signature).');
  const count = v.getUint32(128);
  if (count > 4096 || 132 + count * 12 > size) throw Error('Invalid ICC tag table.');
  const tags = [];
  for (let i = 0; i < count; i++) {
    const pos = 132 + i * 12, offset = v.getUint32(pos + 4), length = v.getUint32(pos + 8);
    if (length < 8 || offset < 132 + count * 12 || offset > size || length > size - offset) throw Error(`Invalid bounds for tag ${signature(pos)}.`);
    tags.push({ signature: signature(pos), type: signature(offset), offset, length });
  }
  const date = Array.from({ length: 6 }, (_, i) => v.getUint16(24 + i * 2));
  const created = date[0] && date[1] >= 1 && date[1] <= 12 && date[2] >= 1 && date[2] <= 31 && date[3] < 24 && date[4] < 60 && date[5] < 60
    ? `${date[0]}-${String(date[1]).padStart(2,'0')}-${String(date[2]).padStart(2,'0')} ${date.slice(3).map(x => String(x).padStart(2,'0')).join(':')}` : 'Invalid date';
  const profile = { size, version: `${bytes[8]}.${bytes[9] >> 4}.${bytes[9] & 15}`, deviceClass: signature(12), colorSpace: signature(16), pcs: signature(20), created, intent: v.getUint32(64), tags };
  profile.description = '';
  for (const tag of tags.filter(t => t.signature === 'desc')) {
    try { profile.description = decodeTag(bytes, tag).text || ''; } catch { /* Header still useful when optional tag content is bad. */ }
  }
  return profile;
}
export function decodeTag(bytes, tag) {
  const b = bytes.subarray(tag.offset, tag.offset + tag.length), v = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const need = (n) => { if (n > b.length) throw Error('Truncated tag payload'); };
  const fixed = (off) => v.getInt32(off) / 65536;
  if (tag.type === 'text') return { text: text(b.subarray(8)) };
  if (tag.type === 'desc') { need(12); const n=v.getUint32(8); need(12+n); return {text: text(b.subarray(12,12+n))}; }
  if (tag.type === 'mluc') {
    need(16); const n=v.getUint32(8), stride=v.getUint32(12);
    if (n>4096 || stride<12) throw Error('Invalid mluc records'); need(16+n*stride);
    const records=[];
    for (let i=0;i<n;i++) { const p=16+i*stride, len=v.getUint32(p+4), off=v.getUint32(p+8); need(off+len); if (len%2) throw Error('Invalid UTF-16 length'); records.push({locale:text(b.subarray(p,p+2))+'-'+text(b.subarray(p+2,p+4)),text:new TextDecoder('utf-16be').decode(b.subarray(off,off+len))}); }
    return {text:(records.find(r=>r.locale==='en-US') || records[0] || {}).text || '',records};
  }
  if (tag.type === 'XYZ') {
    need(20); const xyz=[]; for(let p=8;p+12<=b.length;p+=12) xyz.push([fixed(p),fixed(p+4),fixed(p+8)]); return {xyz};
  }
  if (tag.type === 'curv') {
    need(12); const n=v.getUint32(8); if(n>1e6) throw Error('Curve too large'); need(12+n*2);
    const gamma=n===1?v.getUint16(12)/256:null, samples=[];
    for(let i=0;i<257;i++) { const x=i/256; if(n<2) samples.push([x,n===0?x:x**gamma]); else { const pos=x*(n-1), a=Math.floor(pos), f=pos-a; samples.push([x,((1-f)*v.getUint16(12+2*a)+f*v.getUint16(12+2*Math.min(a+1,n-1)))/65535]); } }
    return {kind:n===0?'Identity':n===1?'Gamma':'Sampled curve',gamma,entries:n,samples};
  }
  if (tag.type === 'para') {
    need(12); const fn=v.getUint16(8), counts=[1,3,4,5,7]; if(fn>4) throw Error('Unknown parametric curve'); need(12+4*counts[fn]);
    const params=Array.from({length:counts[fn]},(_,i)=>fixed(12+4*i)), [g,a,bp,c,d,e,f]=params;
    const curve=x=>fn===0?x**g:fn===1?(x>=-bp/a?(a*x+bp)**g:0):fn===2?(x>=-bp/a?(a*x+bp)**g+c:c):fn===3?(x>=d?(a*x+bp)**g:c*x):(x>=d?(a*x+bp)**g+e:c*x+f);
    return {kind:`Parametric curve ${fn}`,parameters:params,samples:Array.from({length:257},(_,i)=>[i/256,curve(i/256)])};
  }
  if (tag.type==='mft1'||tag.type==='mft2') {
    need(tag.type==='mft1'?48:52); return {kind:tag.type==='mft1'?'8-bit LUT':'16-bit LUT',inputChannels:b[8],outputChannels:b[9],gridPoints:b[10],matrix:Array.from({length:9},(_,i)=>fixed(12+4*i)),inputEntries:tag.type==='mft1'?256:v.getUint16(48),outputEntries:tag.type==='mft1'?256:v.getUint16(50)};
  }
  if (tag.type==='mAB'||tag.type==='mBA') {
    need(32); const names=['B curves','Matrix','M curves','CLUT','A curves'],stages={};
    names.forEach((name,i)=>{const off=v.getUint32(12+4*i);if(off && (off<32||off>=b.length))throw Error('Invalid LUT stage offset');stages[name]=off||null;});
    let grid=null; if(stages.CLUT){need(stages.CLUT+20);grid=Array.from(b.subarray(stages.CLUT,stages.CLUT+b[8]));}
    return {kind:tag.type,inputChannels:b[8],outputChannels:b[9],stages,grid};
  }
  return {kind:tag.type,bytes:tag.length,preview:Array.from(b.subarray(8,72)).map(n=>n.toString(16).padStart(2,'0')).join(' ')};
}
