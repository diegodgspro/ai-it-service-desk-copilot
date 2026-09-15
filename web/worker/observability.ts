type SafeEvent = { requestId:string; route:string; status:number; durationMs:number; resultCount?:number; abstention?:boolean; filterCount?:number; outcome?:string; reason?:string };
export function logSafeEvent(event: SafeEvent) { console.log(JSON.stringify({ event:"deskpilot_request", ...event })); }
