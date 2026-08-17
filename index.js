(()=>{"use strict";

let V=null;
let unpatchers=[];
let timer=null;

const VERSION="1.5-width-sequence-probe";
const ring=[];
const windows=[];
const widthEntries=[];
let activeWindows=[];
let seq=0;

const TRIGGERS=new Set([
  "GuildsOnly",
  "NavigationContent",
  "ChatPanelNativeStackNavigator",
  "FastList"
]);

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
  const allowed=/^(width|height|minWidth|maxWidth|minHeight|maxHeight|flex|flexGrow|flexShrink|flexBasis|left|right|top|bottom|margin.*|padding.*|overflow|position|transform)$/;
  for(const [k,v] of Object.entries(flat??{})){
    if(!allowed.test(k))continue;
    if(typeof v==="number" || typeof v==="string" || typeof v==="boolean")out[k]=v;
    else if(k==="transform" && Array.isArray(v)){
      const safe=[];
      for(const t of v){
        if(!t||typeof t!=="object")continue;
        const small={};
        for(const [tk,tv] of Object.entries(t)){
          if(/^(translateX|translateY|scale|scaleX|scaleY)$/.test(tk) && typeof tv==="number")small[tk]=tv;
        }
        if(Object.keys(small).length)safe.push(small);
      }
      if(safe.length)out[k]=safe;
    }
  }
  return out;
}

function safeLayoutProps(props){
  const out={};
  if(!props||typeof props!=="object")return out;

  const exact=/^(width|height|minWidth|maxWidth|minHeight|maxHeight|drawerWidth|sidebarWidth|panelWidth|contentWidth|barWidth|itemSize|estimatedItemSize|layoutSize|chunkBase|insetStart|insetEnd|footerSize|sectionSize)$/i;

  for(const [k,v] of Object.entries(props)){
    if(!exact.test(k))continue;

    if(typeof v==="number" || typeof v==="boolean"){
      out[k]=v;
    }else if(typeof v==="string"){
      if(/^-?\d+(?:\.\d+)?%?$/.test(v))out[k]=v;
    }else if(typeof v==="function"){
      out[k]="[function]";
    }else if(v&&typeof v==="object"){
      // Numeric layout object only.
      const small={};
      for(const [sk,sv] of Object.entries(v)){
        if(/width|height|size|offset|length|start|end/i.test(sk) && typeof sv==="number")small[sk]=sv;
      }
      if(Object.keys(small).length)out[k]=small;
    }
  }

  for(const styleKey of ["style","contentContainerStyle","containerStyle","drawerStyle","sceneContainerStyle"]){
    if(props[styleKey]!=null){
      const s=safeStyle(props[styleKey]);
      if(Object.keys(s).length)out[styleKey]=s;
    }
  }

  // screenOptions is common on React Navigation. Record key names only, plus
  // any static layout numbers/styles if it is an object. Never execute it.
  if(props.screenOptions && typeof props.screenOptions==="object"){
    const so={};
    for(const [k,v] of Object.entries(props.screenOptions)){
      if(/width|height|drawer|contentStyle|sceneStyle|presentation/i.test(k)){
        if(typeof v==="number" || typeof v==="boolean" || typeof v==="string")so[k]=v;
        else if(/style/i.test(k)){
          const s=safeStyle(v);
          if(Object.keys(s).length)so[k]=s;
        }
      }
    }
    if(Object.keys(so).length)out.screenOptions=so;
  }else if(typeof props.screenOptions==="function"){
    out.screenOptions="[function]";
  }

  return out;
}

function entryFrom(args,ret){
  const C=args?.[0];
  const props=args?.[1] ?? ret?.props ?? {};
  const name=cname(C);
  const layout=safeLayoutProps(props);
  return {
    seq:++seq,
    name,
    layout,
    propNames:Object.keys(props)
      .filter(k=>![
        "children","id","guildId","guild","name","label","text","title",
        "source","uri","url","user","userId","channel","channelId","message"
      ].includes(k))
      .slice(0,24)
  };
}

function isLayoutRelevant(e){
  return (
    TRIGGERS.has(e.name) ||
    /drawer|panel|sidebar|navigation|stack|content|container|guild|fastlist|scroll|view/i.test(e.name) ||
    Object.keys(e.layout).length>0
  );
}

function pushRing(e){
  ring.push(e);
  if(ring.length>35)ring.shift();
}

function beginWindow(trigger,e){
  if(windows.length>=8)return;
  const w={
    trigger,
    triggerSeq:e.seq,
    entries:ring.slice(-25),
    remaining:35
  };
  windows.push(w);
  activeWindows.push(w);
}

function feedWindows(e){
  const still=[];
  for(const w of activeWindows){
    if(w.remaining>0){
      w.entries.push(e);
      w.remaining--;
    }
    if(w.remaining>0)still.push(w);
  }
  activeWindows=still;
}

function afterJsx(args,ret){
  try{
    const e=entryFrom(args,ret);

    // Feed existing capture windows before possibly starting a new one.
    feedWindows(e);

    if(isLayoutRelevant(e)){
      pushRing(e);

      const hasWidth=
        ["width","minWidth","maxWidth","drawerWidth","sidebarWidth","panelWidth","contentWidth","barWidth"]
          .some(k=>k in e.layout) ||
        ["style","containerStyle","drawerStyle","sceneContainerStyle","contentContainerStyle"]
          .some(k=>e.layout[k] && (
            "width" in e.layout[k] ||
            "minWidth" in e.layout[k] ||
            "maxWidth" in e.layout[k]
          ));

      if(hasWidth && widthEntries.length<80){
        widthEntries.push(e);
      }
    }

    if(TRIGGERS.has(e.name)){
      const already=windows.some(w=>w.trigger===e.name);
      if(!already)beginWindow(e.name,e);
    }
  }catch(error){
    console.error("[ServerNames Width Sequence Probe] hook failed:",error);
  }
}

function fmtEntry(e){
  let line=`#${e.seq} ${e.name}`;
  if(Object.keys(e.layout).length)line+=` layout=${JSON.stringify(e.layout)}`;
  if(e.propNames.length)line+=` props=[${e.propNames.join(",")}]`;
  return line;
}

function report(){
  const lines=[
    `Version: ${VERSION}`,
    "",
    "PRIVACY:",
    "Only React component names, prop NAMES, and layout-related numeric/style values are included.",
    "Server/guild names and IDs, usernames, channels, messages, labels, image URLs, and text values are excluded.",
    "",
    `JSX sequence observed: ${seq}`,
    `Trigger windows captured: ${windows.length}`,
    `Width-bearing entries captured: ${widthEntries.length}`,
    "",
    "=== WIDTH-BEARING COMPONENTS ==="
  ];

  if(!widthEntries.length){
    lines.push("No explicit width-bearing JSX props/styles were observed.");
  }else{
    for(const e of widthEntries)lines.push(fmtEntry(e));
  }

  for(const w of windows){
    lines.push("","");
    lines.push(`=== WINDOW AROUND ${w.trigger} (#${w.triggerSeq}) ===`);
    for(const e of w.entries){
      lines.push(fmtEntry(e));
    }
  }

  const text=lines.join("\n");

  try{
    V?.ui?.alerts?.showConfirmationAlert?.({
      title:"Server Names width sequence probe",
      content:text,
      confirmText:"OK",
      onConfirm:()=>{},
      secondaryConfirmText:"Copy",
      onConfirmSecondary:()=>{
        try{
          const cb=V?.metro?.common?.clipboard;
          const r=cb?.setString?.(text);
          if(r?.catch)r.catch(()=>{});
          toast("Width sequence report copied.");
        }catch{}
      },
      isDismissable:true
    });
  }catch{
    console.log("[ServerNames Width Sequence Probe]\n"+text);
  }
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  const patcher=V.patcher ?? V.api?.patcher;
  if(!patcher?.after)throw new Error("Revenge patcher.after not found.");

  const jsxRuntime=
    V.metro.findByProps?.("jsx","jsxs") ??
    V.metro.findByProps?.("jsx","jsxDEV");

  if(!jsxRuntime)throw new Error("Discord JSX runtime not found.");

  if(typeof jsxRuntime.jsx==="function")
    unpatchers.push(patcher.after("jsx",jsxRuntime,afterJsx));
  if(typeof jsxRuntime.jsxs==="function")
    unpatchers.push(patcher.after("jsxs",jsxRuntime,afterJsx));
  if(typeof jsxRuntime.jsxDEV==="function")
    unpatchers.push(patcher.after("jsxDEV",jsxRuntime,afterJsx));

  toast("Width sequence probe active. Open the server sidebar and leave it visible; report appears in 15 seconds.");
  timer=setTimeout(report,15000);
}

function stop(){
  if(timer){clearTimeout(timer);timer=null;}
  for(const u of unpatchers.splice(0)){try{u?.();}catch{}}
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()