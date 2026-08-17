(()=>{"use strict";
let V=null;
let unpatchers=[];
let timer=null;
let jsxCalls=0;
let namedCalls=0;
let candidates=new Map();
let errors=[];

const VERSION="0.5-obfuscated";

function api(){return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;}

function toast(msg){
  try{(V??api())?.ui?.toasts?.showToast?.(String(msg));}
  catch(e){console.error("[ServerNames Probe] toast failed",e);}
}

function alertReport(text){
  const v=V??api();
  try{
    v?.ui?.alerts?.showConfirmationAlert?.({
      title:"Server Names probe report",
      content:text,
      confirmText:"OK",
      onConfirm:()=>{},
      secondaryConfirmText:"Copy",
      onConfirmSecondary:()=>{
        try{
          const cb=v?.metro?.common?.clipboard;
          const r=cb?.setString?.(text);
          if(r?.catch)r.catch(()=>{});
          toast("Probe report copied.");
        }catch(e){console.error("[ServerNames Probe] copy failed",e);}
      },
      isDismissable:true
    });
  }catch(e){
    console.error("[ServerNames Probe] alert failed",e);
    toast(text.slice(0,240));
  }
}

// Non-cryptographic, one-way short hash used only to correlate repeated values
// in the diagnostic report without exposing actual guild names/IDs.
function obfuscate(value){
  if(value==null)return null;
  const s=String(value);
  let h=2166136261;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return "ref_"+(h>>>0).toString(16).padStart(8,"0");
}

function cname(C){
  try{return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "(anonymous)";}
  catch{return "(name-error)";}
}

function safeKeys(o){
  try{return o && typeof o==="object" ? Object.keys(o).slice(0,35) : [];}
  catch{return [];}
}

function looksInteresting(name,props){
  if(!props||typeof props!=="object") return false;

  const keys=safeKeys(props);
  const keyText=keys.join("|").toLowerCase();
  const nameText=String(name).toLowerCase();

  if(/guild|server|avatar|icon/.test(nameText)) return true;
  if(/guild|server|avatar|icon/.test(keyText)) return true;

  const direct=[props.guild,props.server,props.guildNode,props.node?.guild,props.item?.guild];
  if(direct.some(x=>x&&typeof x==="object")) return true;

  return false;
}

function summarize(name,props){
  let guildName=null;
  let guildId=null;

  try{
    const g=props?.guild ?? props?.server ?? props?.guildNode?.guild ?? props?.node?.guild ?? props?.item?.guild;
    guildName=g?.name ?? null;
    guildId=g?.id ?? props?.guildId ?? props?.guildID ?? props?.serverId ?? null;
  }catch{}

  const keys=safeKeys(props).join(",");
  return {
    name:String(name),
    keys,
    guildNameRef:obfuscate(guildName),
    guildIdRef:obfuscate(guildId)
  };
}

function hook(args,ret){
  jsxCalls++;
  try{
    const C=args?.[0];
    const props=args?.[1] ?? ret?.props;
    const name=cname(C);

    if(name && name!=="(anonymous)") namedCalls++;

    if(looksInteresting(name,props)){
      const s=summarize(name,props);
      const key=`${s.name}|${s.keys}|${s.guildNameRef??""}|${s.guildIdRef??""}`;
      if(!candidates.has(key) && candidates.size<80) candidates.set(key,s);
    }
  }catch(e){
    if(errors.length<10) errors.push(String(e?.stack??e));
  }
}

function report(){
  const rows=[...candidates.values()];
  const lines=[
    `Version: ${VERSION}`,
    `JSX calls observed: ${jsxCalls}`,
    `Named component calls: ${namedCalls}`,
    `Interesting candidates: ${rows.length}`,
    "",
    "Privacy: guild/server names and IDs are obfuscated before being stored in this report.",
    ""
  ];

  if(rows.length===0){
    lines.push("NO CANDIDATES FOUND.");
    lines.push("");
    lines.push(
      jsxCalls===0
        ? "The patched JSX runtime is not being used by the live Discord UI."
        : "The JSX hook is active, but the current server list does not expose obvious guild/server/icon props through this runtime."
    );
  }else{
    rows.forEach((r,i)=>{
      lines.push(
        `${i+1}. ${r.name}` +
        `${r.guildNameRef ? ` | guild=${r.guildNameRef}` : ""}` +
        `${r.guildIdRef ? ` | id=${r.guildIdRef}` : ""}`
      );
      lines.push(`   props: ${r.keys || "(none)"}`);
    });
  }

  if(errors.length){
    lines.push("","HOOK ERRORS:");
    errors.forEach((e,i)=>lines.push(`${i+1}. ${e}`));
  }

  const text=lines.join("\n");
  console.log("[ServerNames Probe report]\n"+text);
  alertReport(text);
}

function start(){
  V=api();
  if(!V?.metro) throw new Error("Revenge Metro API not found.");

  const patcher=V.patcher ?? V.api?.patcher;
  if(!patcher?.after) throw new Error("Revenge patcher.after not found.");

  const jsxRuntime=
    V.metro.findByProps?.("jsx","jsxs") ??
    V.metro.findByProps?.("jsx","jsxDEV");

  if(!jsxRuntime) throw new Error("Discord JSX runtime not found.");

  if(typeof jsxRuntime.jsx==="function")
    unpatchers.push(patcher.after("jsx",jsxRuntime,hook));
  if(typeof jsxRuntime.jsxs==="function")
    unpatchers.push(patcher.after("jsxs",jsxRuntime,hook));
  if(typeof jsxRuntime.jsxDEV==="function")
    unpatchers.push(patcher.after("jsxDEV",jsxRuntime,hook));

  if(!unpatchers.length) throw new Error("No JSX functions could be patched.");

  toast("Server Names obfuscated probe active — open the server list now. Report appears in 15 seconds.");
  timer=setTimeout(report,15000);
}

function stop(){
  if(timer){clearTimeout(timer);timer=null;}
  for(const u of unpatchers.splice(0)){try{u?.();}catch{}}
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()