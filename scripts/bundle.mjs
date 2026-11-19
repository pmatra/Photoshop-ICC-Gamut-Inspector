import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('plugin/web/vendor',{recursive:true});
await build({entryPoints:['src/viewer.mjs'],bundle:true,format:'esm',outfile:'plugin/web/viewer.mjs',target:'es2020',legalComments:'eof'});
await build({entryPoints:['src/worker.mjs'],bundle:true,format:'iife',outfile:'plugin/web/worker.js',target:'es2020',external:['./engine.mjs'],legalComments:'eof'});
await copyFile('node_modules/three/LICENSE','plugin/web/vendor/Three-LICENSE.txt');
