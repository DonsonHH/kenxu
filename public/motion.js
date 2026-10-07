// Motion communicates a user's action; polling never starts an animation.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let modality='idle';
const active=new Set();
document.addEventListener('pointerdown',()=>{modality='pointer';document.body.dataset.input='pointer';},{capture:true});
document.addEventListener('keydown',()=>{modality='keyboard';document.body.dataset.input='keyboard';for(const animation of active)animation.cancel();active.clear();},{capture:true});
reduced.addEventListener('change',()=>{for(const animation of active)animation.cancel();active.clear();});
export const pointerMotion=()=>modality==='pointer'&&!reduced.matches;
export function revealPanel(element){
 for(const animation of active)animation.cancel();active.clear();
 if(!element||modality!=='pointer'||!element.animate)return;
 const animation=element.animate(reduced.matches?[{opacity:.82},{opacity:1}]:[{opacity:.5,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
 active.add(animation);animation.finished.catch(()=>{}).finally(()=>active.delete(animation));
}
export function revealView(element,{initial=false}={}){
 if(!element||modality==='keyboard'||!initial&&modality!=='pointer'||!element.animate)return;
 for(const animation of active)animation.cancel();active.clear();
 const targets=element.id==='login-view'?[...element.children]:[element];
 for(const [index,target]of targets.entries()){
  const frames=reduced.matches?[{opacity:.9},{opacity:1}]:[{opacity:.72,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}];
  const animation=target.animate(frames,{duration:initial?200:160,delay:reduced.matches?0:Math.min(index,2)*30,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  active.add(animation);animation.finished.catch(()=>{}).finally(()=>active.delete(animation));
 }
}
