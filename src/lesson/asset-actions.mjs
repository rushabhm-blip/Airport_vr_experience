/** Works with Three.js Object3D. Call update(seconds) every frame. */
export class AssetActions {
 constructor(root,definitions=[]){
  this.root=root;this.items=definitions.map(d=>{
   let object=root.getObjectByName(d.node);if(!object)root.traverse(o=>{if(o.userData?.name===d.node)object=o;});if(!object)throw Error('Missing interactive node: '+d.node);
   return {...d,object,base:object[d.kind][d.axis],current:0,target:0};
  });
 }
 toggle(index){const a=this.items[index];if(a)a.target=a.target?0:1;}
 reset(){for(const a of this.items){a.current=0;a.target=0;a.object[a.kind][a.axis]=a.base;}}
 update(dt){for(const a of this.items){const step=Math.max(0,Math.min(dt,.05))/(a.duration||.8);a.current+=Math.sign(a.target-a.current)*Math.min(step,Math.abs(a.target-a.current));const e=a.current*a.current*(3-2*a.current);a.object[a.kind][a.axis]=a.kind==='scale'?a.base*(1+(a.end-1)*e):a.base+a.end*e;}}
}
