// These are presentation/update policies, not traffic or connection limits.
export const SUBSCRIPTION_UPDATE_MINUTES=720;
export const UI_REFRESH_SECONDS=60;
export const DISPLAY_ALLOWANCE_BYTES=100*1024**3;
export function monthlyPeriod(now=Date.now()){
 const date=new Date(now+8*3600000),year=date.getUTCFullYear(),month=date.getUTCMonth();
 return {start:Date.UTC(year,month,1)-8*3600000,end:Date.UTC(year,month+1,1)-8*3600000,label:`${year}-${String(month+1).padStart(2,'0')}`,timezone:'Asia/Shanghai'};
}
