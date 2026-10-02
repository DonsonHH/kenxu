// Runs before styles are painted to avoid a light flash on a dark preference.
(()=>{
 const media=matchMedia('(prefers-color-scheme: dark)'),values=['system','light','dark'];let preference='system';
 try{const saved=localStorage.getItem('kenxu-theme');if(values.includes(saved))preference=saved;}catch{}
 function apply(){const resolved=preference==='system'?(media.matches?'dark':'light'):preference;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;const select=document.getElementById('theme-choice');if(select)select.value=preference;window.dispatchEvent(new CustomEvent('portal-theme-change',{detail:resolved}));}
 window.portalTheme={get resolved(){return document.documentElement.dataset.theme;},get preference(){return preference;},set:value=>{if(!values.includes(value))return;preference=value;try{localStorage.setItem('kenxu-theme',value);}catch{}apply();}};
 media.addEventListener('change',()=>{if(preference==='system')apply();});window.addEventListener('storage',event=>{if(event.key==='kenxu-theme'){preference=values.includes(event.newValue)?event.newValue:'system';apply();}});
 document.addEventListener('DOMContentLoaded',()=>{apply();document.getElementById('theme-choice')?.addEventListener('change',event=>window.portalTheme.set(event.target.value));});apply();
})();
