import createEngine from './vendor/lcms.mjs';
import { parseICC } from './icc.mjs';
export async function createSampler() {
  const m = await createEngine();
  return {
    version: m._engine_version(),
    open(bytes, intent=1) {
      const meta=parseICC(bytes);
      if (!['RGB','CMYK','GRAY'].includes(meta.colorSpace)) throw Error(`Gamut sampling does not support ${meta.colorSpace}.`);
      if (['link','abst'].includes(meta.deviceClass)) throw Error('Device-link and abstract profiles cannot be sampled as device gamuts.');
      const p=m._malloc(bytes.length); if(!p)throw Error('Not enough color-engine memory.');
      let handle=0;
      try {m.HEAPU8.set(bytes,p);handle=m._engine_open(p,bytes.length,intent);} finally {m._free(p);}
      if(!handle) throw Error('LittleCMS cannot construct a forward transform for this profile and intent.');
      const channels=m._engine_channels(handle);
      return {
        channels,
        sample(density,start,count) {
          if(!handle)throw Error('Sampler is closed.');
          if(!Number.isInteger(density)||density<3||density>21||!Number.isInteger(start)||start<0||!Number.isInteger(count)||count<1||count>4096||start+count>density**channels)throw Error('Invalid sample range.');
          const p=m._malloc(count*24); if(!p)throw Error('Not enough sampling memory.');
          try {if(m._engine_sample(handle,density,start,count,p)!==count)throw Error('ICC transform returned invalid samples.');return m.HEAPF32.slice(p/4,p/4+count*6);}finally{m._free(p);}
        },
        close(){if(handle){m._engine_close(handle);handle=0;}}
      };
    }
  };
}
