import React from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster,toast} from 'sonner';
const target=document.getElementById('notifications');
if(target){createRoot(target).render(<Toaster theme="light" position="bottom-right" richColors closeButton duration={4500} mobileOffset={16}/>);}
window.portalToast={success:message=>toast.success(message),error:message=>toast.error(message),info:message=>toast.info(message),promise:(value,options)=>toast.promise(value,options)};
