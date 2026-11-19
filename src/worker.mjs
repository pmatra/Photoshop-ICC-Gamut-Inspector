import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {Vector3} from 'three';
// Dynamic import keeps the self-contained Emscripten module separate from the worker bundle.
const ready=import('./engine.mjs').then(m=>m.createSampler());
const revisions={primary:0,comparison:0}, cache=new Map();
self.onmessage=async({data:job})=>{
  const {slot,id}=job;
  if(!['primary','comparison'].includes(slot))return;
  revisions[slot]=id;
  if(job.cancel)return;
  let sampler;
  try {
    const bytes=new Uint8Array(job.bytes), digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const key=`${digest}/${job.density}/${job.intent}`;
    let result=cache.get(key);
    if(!result){
      const engine=await ready;
      if(revisions[slot]!==id)return;
      sampler=engine.open(bytes,job.intent);
      const total=job.density**sampler.channels, samples=new Float32Array(total*6);
      for(let start=0;start<total;start+=2048){
        if(revisions[slot]!==id)return;
        const count=Math.min(2048,total-start); samples.set(sampler.sample(job.density,start,count),start*6);
        self.postMessage({type:'progress',slot,id,value:start/total,label:'Sampling ICC transform'});
        await new Promise(r=>setTimeout(r,0));
      }
      sampler.close();sampler=null;
      if(revisions[slot]!==id)return;
      self.postMessage({type:'progress',slot,id,value:0.95,label:'Constructing convex gamut hull'});
      const vertices=[], colors=[], points=[];
      for(let i=0;i<total;i++){const p=new Vector3(samples[i*6+1],samples[i*6]-50,samples[i*6+2]);p.sampleIndex=i;points.push(p);}
      let volume=0, hullError='';
      // A Gray profile is one-dimensional; do not invent a 3D surface for it.
      if(sampler?.channels!==1 && job.space!=='GRAY'){
        try {
          const hull=new ConvexHull().setFromPoints(points);
          for(const face of hull.faces){let edge=face.edge;const tri=[];do{tri.push(edge.head().point);edge=edge.next;}while(edge!==face.edge);
            for(let t=1;t+1<tri.length;t++){
              const a=tri[0],b=tri[t],c=tri[t+1]; volume+=a.dot(new Vector3().crossVectors(b,c))/6;
              for(const p of [a,b,c]){vertices.push(p.x,p.y,p.z);const off=p.sampleIndex*6+3;colors.push(samples[off],samples[off+1],samples[off+2]);}
            }
          }
          volume=Math.abs(volume);
        }catch(e){hullError=`Surface unavailable: ${e.message}`;}
      }
      result={samples,vertices:new Float32Array(vertices),colors:new Float32Array(colors),volume,hullError,total,digest,engineVersion:engine.version};
      cache.set(key,result); while(cache.size>3)cache.delete(cache.keys().next().value);
    }else{cache.delete(key);cache.set(key,result);}
    if(revisions[slot]===id)self.postMessage({type:'result',slot,id,...result});
  }catch(e){if(revisions[slot]===id)self.postMessage({type:'error',slot,id,error:e.message});}
  finally{sampler?.close();}
};
