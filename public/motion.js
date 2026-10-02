// Motion communicates a user's action; polling never starts an animation.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let modality='keyboard';
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
