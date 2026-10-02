export function createGuideUI({root,onImport,reveal}){
 const positions=new Map();let selected;
 const sections=[...root.querySelectorAll('[data-device-guide]')];
 function highlight(section,number){
  const step=section.querySelector('[data-step="'+number+'"]');if(!step)return;
  positions.set(section.dataset.deviceGuide,number);
  for(const element of section.querySelectorAll('[data-step]'))element.classList.toggle('is-current',element===step);
  for(const button of section.querySelectorAll('[data-jump-step]'))button.setAttribute('aria-current',Number(button.dataset.jumpStep)===number?'step':'false');
  section.querySelector('.guide-reading-status').textContent='步骤导航 · '+number+' / 4 '+step.querySelector('h3').textContent;
  return step;
 }
 function select(platform,{animate=false,client}={}){
  const target=sections.find(section=>section.dataset.deviceGuide===platform);if(!target)return;
  const changed=selected!==platform;selected=platform;
  for(const section of sections)section.hidden=section!==target;
  for(const button of root.querySelectorAll('[data-guide-platform]'))button.setAttribute('aria-pressed',String(button.dataset.guidePlatform===platform));
  for(const slot of target.querySelectorAll('[data-policy-reference]'))if(!slot.dataset.loaded){slot.append(root.querySelector('#guide-policy-template').content.cloneNode(true));slot.dataset.loaded='true';}
  if(client&&platform==='ios')for(const detail of target.querySelectorAll('[data-ios-app]'))detail.open=detail.dataset.iosApp===client;
  highlight(target,positions.get(platform)||1);
  if(animate&&changed)reveal(target);
 }
 root.addEventListener('click',event=>{
  const platform=event.target.closest('[data-guide-platform]');if(platform){select(platform.dataset.guidePlatform,{animate:true});return;}
  const importer=event.target.closest('[data-guide-client]');if(importer){onImport(importer.dataset.guideClient);return;}
  const jump=event.target.closest('[data-jump-step]');if(!jump)return;const section=jump.closest('[data-device-guide]'),step=highlight(section,Number(jump.dataset.jumpStep));
  if(step){step.querySelector('h3').focus({preventScroll:true});step.scrollIntoView({block:'start',behavior:'instant'});reveal(step);}
 });
 root.addEventListener('change',event=>{const checks=event.target.closest('.guide-checks');if(!checks)return;const inputs=[...checks.querySelectorAll('input')],count=inputs.filter(input=>input.checked).length;checks.querySelector('.guide-check-status').textContent='你已确认 '+count+' / '+inputs.length+' 项';});
 return {select,reset:()=>{positions.clear();for(const input of root.querySelectorAll('.guide-checks input'))input.checked=false;for(const status of root.querySelectorAll('.guide-check-status'))status.textContent='勾选你已确认的项目';for(const section of sections)highlight(section,1);}};
}
