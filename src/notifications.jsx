import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster,toast} from 'sonner';
const target=document.getElementById('notifications');
function Notifications(){const [theme,setTheme]=useState(document.documentElement.dataset.theme||'light');useEffect(()=>{const change=()=>setTheme(document.documentElement.dataset.theme||'light');window.addEventListener('portal-theme-change',change);return()=>window.removeEventListener('portal-theme-change',change);},[]);return <Toaster theme={theme} position="bottom-right" richColors closeButton duration={3500} visibleToasts={2} mobileOffset={{bottom:20,left:16,right:16}}/>;}
if(target){createRoot(target).render(<Notifications/>);}
window.portalToast={success:message=>toast.success(message,{id:'success:'+message}),error:message=>toast.error(message,{id:'error:'+message,duration:6000}),info:message=>toast.info(message,{id:'info:'+message}),promise:(value,options)=>toast.promise(value,options)};
