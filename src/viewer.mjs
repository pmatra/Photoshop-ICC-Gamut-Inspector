import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const displayColor=value=>THREE.ColorManagement.colorSpaceToWorking(new THREE.Color(Math.max(0,Math.min(1,value[0])),Math.max(0,Math.min(1,value[1])),Math.max(0,Math.min(1,value[2]))),THREE.SRGBColorSpace);
export class GamutViewer {
  constructor(container,onError){
    this.container=container;this.data={};this.meshes={};this.mode='surface';this.xray=true;this.pending=false;
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){onError(`WebGL unavailable: ${e.message}`);return;}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0x202329);container.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onError('GPU context lost. Reopen the panel to restore the viewer.');});
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(40,1,0.1,2000);this.camera.position.set(220,160,250);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) event.stopImmediatePropagation();
    }, {capture: true});
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.addEventListener('change',()=>this.draw());
    const grid=new THREE.GridHelper(240,12,0x606875,0x363c44);grid.position.y=-50;this.scene.add(grid);
    this.scene.add(new THREE.AxesHelper(110));
    for(const [label,pos] of [['a*',[123,-50,0]],['L*',[0,112,0]],['b*',[0,-50,123]]])this.label(label,pos);
    new ResizeObserver(()=>this.resize()).observe(container);this.resize();
  }
  label(text,pos){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d');ctx.font='bold 40px system-ui';ctx.fillStyle='#dddddd';ctx.textAlign='center';ctx.fillText(text,64,46);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.position.set(...pos);sprite.scale.set(25,12.5,1);this.scene.add(sprite);}
  resize(){if(!this.renderer)return;const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();}
  set(slot,result){this.data[slot]=result;this.rebuild(slot);}
  clear(slot){this.dispose(slot);delete this.data[slot];this.draw();}
  dispose(slot){const group=this.meshes[slot];if(!group)return;group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});this.scene.remove(group);delete this.meshes[slot];}
  rebuild(slot){
    if(!this.renderer)return;this.dispose(slot);const d=this.data[slot];if(!d)return;
    const group=new THREE.Group(),comparison=slot==='comparison';this.meshes[slot]=group;this.scene.add(group);
    if(this.mode==='points'||!d.vertices.length){
      const step=Math.max(1,Math.ceil(d.total/12000)),positions=[],colors=[];
      for(let i=0;i<d.total;i+=step){positions.push(d.samples[i*6+1],d.samples[i*6]-50,d.samples[i*6+2]);const c=displayColor(d.samples.subarray(i*6+3,i*6+6));colors.push(c.r,c.g,c.b);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      const m=new THREE.PointsMaterial({size:comparison?1.8:1.5,vertexColors:!comparison,color:comparison?0x5bd9ff:0xffffff,depthTest:!comparison||!this.xray,transparent:comparison,opacity:comparison?0.7:1});group.add(new THREE.Points(g,m));
    }else{
      const linearColors=new Float32Array(d.colors.length);for(let i=0;i<d.colors.length;i+=3){const c=displayColor(d.colors.subarray(i,i+3));linearColors.set([c.r,c.g,c.b],i);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(d.vertices,3));g.setAttribute('color',new THREE.BufferAttribute(linearColors,3));g.computeVertexNormals();
      const m=new THREE.MeshBasicMaterial({vertexColors:!comparison,color:comparison?0x5bd9ff:0xffffff,side:THREE.DoubleSide,wireframe:comparison||this.mode==='wire',transparent:comparison,opacity:comparison?0.48:1,depthTest:!comparison||!this.xray,depthWrite:!comparison});const mesh=new THREE.Mesh(g,m);mesh.renderOrder=comparison?2:0;group.add(mesh);
    }
    this.draw();
  }
  configure(mode,xray){this.mode=mode;this.xray=xray;for(const slot of Object.keys(this.data))this.rebuild(slot);}
  reset(){if(!this.renderer)return;this.camera.position.set(220,160,250);this.controls.target.set(0,0,0);this.controls.update();this.draw();}
  draw(){if(this.pending||!this.renderer)return;this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.renderer.render(this.scene,this.camera);});}
}
