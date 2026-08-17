(()=>{"use strict";

let V=null;
let unpatchers=[];
let timer=null;
let samples=[];
const VERSION="1.4-outer-width-probe";

function api(){
  try{if(typeof vendetta!=="undefined"&&vendetta)return vendetta;}catch{}
  return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;
}

function toast(msg){
  try{(V??api())?.ui?.toasts?.showToast?.(String(msg));}catch{}
}

function cname(C){
  try{return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "(anonymous)";}
  catch{return "(name-error)";}
}

function flattenStyle(style){
  try{
    const SS=V?.metro?.common?.ReactNative?.StyleSheet;
    if(SS?.flatten)return SS.flatten(style) ?? {};
  }catch{}
  if(Array.isArray(style)){
    const o={};
    for(const p of style){
      const f=flattenStyle(p);
      if(f&&typeof f==="object")Object.assign(o,f);
    }
    return o;
  }
  return style&&typeof style==="object"?style:{};
}

function safeStyle(style){
  const flat=flattenStyle(style);
  const out={};
  const allowed=/^(width|height|minWidth|maxWidth|minHeight|maxHeight|flex|flexGrow|flexShrink|flexBasis|left|right|top|bottom|margin.*|padding.*|overflow|position)$/;
  for(const [k,v] of Object.entries(flat??{})){
    if(allowed.test(k) && (typeof v==="number" || typeof v==="string")) out[k]=v;
  }
  return out;
}

function safeProps(props){
  const out={};
  for(const k of Object.keys(props??{})){
    if(/^(style|contentContainerStyle|containerStyle|drawerStyle|sceneContainerStyle|screenOptions|layout|presentation|orientation|headerShown|gestureEnabled)$/i.test(k)){
      if(k.toLowerCase().includes("style")){
        out[k]=safeStyle(props[k]);
      }else if(typeof props[k]==="number" || typeof props[k]==="boolean" || typeof props[k]==="string"){
        out[k]=props[k];
      }else if(props[k]&&typeof props[k]==="object" && !Array.isArray(props[k])){
        const small={};
        for(const [sk,sv] of Object.entries(props[k])){
          if(/width|height|style|headerShown|gestureEnabled|presentation/i.test(sk)){
            small[sk]=sk.toLowerCase().includes("style")?safeStyle(sv):(
              typeof sv==="number"||typeof sv==="boolean"||typeof sv==="string"?sv:"[object]"
            );
          }
        }
        if(Object.keys(small).length)out[k]=small;
      }
    }
  }
  return out;
}

function walk(node,path="root",depth=0,out=[]){
  if(node==null||depth>7||out.length>=120)return out;
  if(Array.isArray(node)){
    for(let i=0;i<Math.min(node.length,16);i++)walk(node[i],`${path}[${i}]`,depth+1,out);
    return out;
  }
  if(typeof node!=="object")return out;

  if(node.type){
    const name=cname(node.type);
    const props=node.props??{};
    const s=safeStyle(props.style);
    const p=safeProps(props);

    if(
      /navigation|stack|drawer|panel|guild|sidebar|content|view|container/i.test(name) ||
      Object.keys(s).length ||
      Object.keys(p).length
    ){
      out.push({path,name,style:s,props:p});
    }

    walk(props.children,`${path}>${name}`,depth+1,out);
  }
  return out;
}

function capture(label,ret){
  try{
    samples.push({label,tree:walk(ret)});
  }catch(e){
    console.error("[ServerNames Width Probe] capture failed:",e);
  }
}

function patchType(name){
  const p=V.patcher??V.api?.patcher;
  const w=V.metro.findByTypeName?.(name);
  if(w&&typeof w.type==="function"){
    unpatchers.push(p.after("type",w,(args,ret)=>capture(name,ret)));
    return true;
  }
  return false;
}

function report(){
  const lines=[
    `Version: ${VERSION}`,
    "",
    "PRIVACY:",
    "Only component names and layout/style metadata are included.",
    "No server names, guild IDs, usernames, channels, messages, labels, URLs, or text content are included.",
    "",
    `Captured render samples: ${samples.length}`,
    ""
  ];

  if(!samples.length){
    lines.push("No target renders captured. Fully reload Discord with this plugin already enabled.");
  }else{
    samples.slice(0,8).forEach((sample,si)=>{
      lines.push(`=== SAMPLE ${si+1}: ${sample.label} ===`);
      sample.tree.forEach((x,i)=>{
        lines.push(`${i+1}. ${x.path} :: ${x.name}`);
        if(Object.keys(x.style).length) lines.push(`   style=${JSON.stringify(x.style)}`);
        if(Object.keys(x.props).length) lines.push(`   props=${JSON.stringify(x.props)}`);
      });
      lines.push("");
    });
  }

  const text=lines.join("\n");
  try{
    V?.ui?.alerts?.showConfirmationAlert?.({
      title:"Server Names outer-width probe",
      content:text,
      confirmText:"OK",
      onConfirm:()=>{},
      secondaryConfirmText:"Copy",
      onConfirmSecondary:()=>{
        try{
          const cb=V?.metro?.common?.clipboard;
          const r=cb?.setString?.(text);
          if(r?.catch)r.catch(()=>{});
          toast("Outer-width report copied.");
        }catch{}
      },
      isDismissable:true
    });
  }catch{
    console.log("[ServerNames Width Probe]\n"+text);
  }
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  const targets=[
    "NavigationContent",
    "ChatPanelNativeStackNavigator",
    "GuildsOnly"
  ];
  const found=targets.map(n=>`${n}=${patchType(n)?"yes":"no"}`).join(", ");

  toast(`Outer-width probe active (${found}). Fully reload Discord, open server list; report in 12 seconds.`);
  timer=setTimeout(report,12000);
}

function stop(){
  if(timer){clearTimeout(timer);timer=null;}
  for(const u of unpatchers.splice(0)){try{u?.();}catch{}}
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()