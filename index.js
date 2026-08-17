(()=>{"use strict";

let V=null;
let unpatchers=[];
let timer=null;
let guildsOnlySamples=[];
let animatedSamples=[];
let jsxNames=new Map();
let sampleCounts={guildsOnly:0,animated:0,jsx:0};

const VERSION="1.2-layout-probe";
const DIMENSION_KEYS=new Set([
  "width","height","minWidth","maxWidth","minHeight","maxHeight",
  "flex","flexGrow","flexShrink","flexBasis",
  "left","right","top","bottom",
  "margin","marginLeft","marginRight","marginTop","marginBottom",
  "marginHorizontal","marginVertical",
  "padding","paddingLeft","paddingRight","paddingTop","paddingBottom",
  "paddingHorizontal","paddingVertical",
  "gap","rowGap","columnGap",
  "itemSize","estimatedItemSize","size","length","offset"
]);

function api(){
  try{if(typeof vendetta!=="undefined"&&vendetta)return vendetta;}catch{}
  return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;
}

function toast(msg){
  try{(V??api())?.ui?.toasts?.showToast?.(String(msg));}
  catch(e){console.error("[ServerNames Layout Probe] toast failed:",e);}
}

function componentName(C){
  try{
    return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "(anonymous)";
  }catch{return "(name-error)";}
}

function flattenStyle(style){
  try{
    const StyleSheet=V?.metro?.common?.ReactNative?.StyleSheet;
    if(StyleSheet?.flatten)return StyleSheet.flatten(style) ?? {};
  }catch{}

  if(Array.isArray(style)){
    const out={};
    for(const part of style){
      const f=flattenStyle(part);
      if(f&&typeof f==="object")Object.assign(out,f);
    }
    return out;
  }
  return style&&typeof style==="object" ? style : {};
}

function safeDimensions(style){
  const flat=flattenStyle(style);
  const result={};
  if(!flat||typeof flat!=="object")return result;

  for(const [k,v] of Object.entries(flat)){
    if(DIMENSION_KEYS.has(k) && (typeof v==="number" || typeof v==="string")){
      // Only layout values; no colors, URIs, labels, IDs, or text.
      result[k]=v;
    }
  }
  return result;
}

function safeNumericObject(value,depth=0){
  if(value==null||depth>3)return undefined;
  if(typeof value==="number" || typeof value==="boolean")return value;
  if(typeof value==="string"){
    // Keep only strings that look like layout keywords/percentages, never IDs/text.
    if(/^-?\d+(?:\.\d+)?%$/.test(value))return value;
    if(/^(absolute|relative|row|column|center|stretch|auto|hidden|visible)$/.test(value))return value;
    return undefined;
  }
  if(Array.isArray(value)){
    const arr=value.slice(0,12).map(v=>safeNumericObject(v,depth+1)).filter(v=>v!==undefined);
    return arr.length?arr:undefined;
  }
  if(typeof value==="object"){
    const out={};
    for(const [k,v] of Object.entries(value)){
      // Whitelist layout-ish keys only.
      if(!/(width|height|size|layout|offset|length|margin|padding|gap|flex|left|right|top|bottom|position|translate|scale|x$|y$)/i.test(k))continue;
      const safe=safeNumericObject(v,depth+1);
      if(safe!==undefined)out[k]=safe;
    }
    return Object.keys(out).length?out:undefined;
  }
  return undefined;
}

function inspectTree(node,path="root",depth=0,out=[]){
  if(node==null || depth>6 || out.length>=80)return out;

  if(Array.isArray(node)){
    for(let i=0;i<Math.min(node.length,12);i++){
      inspectTree(node[i],`${path}[${i}]`,depth+1,out);
    }
    return out;
  }

  if(typeof node!=="object")return out;

  if(node.type){
    const name=componentName(node.type);
    const dims=safeDimensions(node.props?.style);
    const props=Object.keys(node.props??{})
      .filter(k=>!["children","guild","guildId","id","label","name","text","title","source","uri","url"].includes(k))
      .slice(0,25);

    if(
      /guild|list|scroll|flat|flash|bar|navigation|drawer|sidebar|panel/i.test(name) ||
      Object.keys(dims).length
    ){
      out.push({path,name,dims,props});
    }

    inspectTree(node.props?.children,`${path}>${name}`,depth+1,out);
  }

  return out;
}

function afterGuildsOnly(args,ret){
  try{
    sampleCounts.guildsOnly++;
    if(guildsOnlySamples.length<3){
      guildsOnlySamples.push(inspectTree(ret));
    }
  }catch(e){
    console.error("[ServerNames Layout Probe] GuildsOnly inspect failed:",e);
  }
}

function afterAnimated(args,ret){
  try{
    sampleCounts.animated++;
    if(animatedSamples.length>=8)return;

    const props=args?.[0]??{};
    animatedSamples.push({
      props:Object.keys(props)
        .filter(k=>!["id","label","children","externalChildren","expandedChildren"].includes(k))
        .slice(0,35),
      returnStyle:safeDimensions(ret?.props?.style),
      draggedItemSize:safeNumericObject(props.draggedItemSize),
      layout:safeNumericObject(props.layout),
      config:safeNumericObject(props.config),
      styles:safeNumericObject(props.styles),
      cutouts:safeNumericObject(props.cutouts)
    });
  }catch(e){
    console.error("[ServerNames Layout Probe] animated inspect failed:",e);
  }
}

function afterJsx(args,ret){
  try{
    sampleCounts.jsx++;
    const C=args?.[0];
    const name=componentName(C);
    if(!/guild|list|scroll|flat|flash|bar|navigation|drawer|sidebar|panel/i.test(name))return;

    if(!jsxNames.has(name) && jsxNames.size<80){
      const props=args?.[1]??ret?.props??{};
      jsxNames.set(name,{
        props:Object.keys(props)
          .filter(k=>!["id","guildId","guild","label","name","text","title","source","uri","url","children"].includes(k))
          .slice(0,35),
        style:safeDimensions(props.style)
      });
    }
  }catch{}
}

function formatObj(o){
  try{return JSON.stringify(o);}
  catch{return "{}";}
}

function report(){
  const lines=[
    `Version: ${VERSION}`,
    "",
    "PRIVACY:",
    "Only component names, prop NAMES, and layout-related numeric/style values are included.",
    "Server names, guild IDs, usernames, channels, messages, labels, image URLs, and text values are excluded.",
    "",
    `GuildsOnly renders sampled: ${sampleCounts.guildsOnly}`,
    `Animated-item renders observed: ${sampleCounts.animated}`,
    `JSX calls observed: ${sampleCounts.jsx}`,
    "",
    "=== GUILDS-ONLY RETURN TREE ==="
  ];

  if(!guildsOnlySamples.length){
    lines.push("No GuildsOnly sample captured.");
  }else{
    guildsOnlySamples[0].forEach((x,i)=>{
      lines.push(`${i+1}. ${x.path} :: ${x.name}`);
      if(Object.keys(x.dims).length)lines.push(`   dimensions=${formatObj(x.dims)}`);
      if(x.props.length)lines.push(`   props=${x.props.join(",")}`);
    });
  }

  lines.push("","=== GUILDS BAR ANIMATED ITEM ===");
  if(!animatedSamples.length){
    lines.push("No GuildsBarAnimatedItemWrapper sample captured.");
  }else{
    animatedSamples.slice(0,4).forEach((x,i)=>{
      lines.push(`${i+1}. props=${x.props.join(",")}`);
      if(Object.keys(x.returnStyle).length)lines.push(`   returnStyle=${formatObj(x.returnStyle)}`);
      for(const key of ["draggedItemSize","layout","config","styles","cutouts"]){
        if(x[key]!==undefined)lines.push(`   ${key}=${formatObj(x[key])}`);
      }
    });
  }

  lines.push("","=== GUILD/LIST COMPONENTS SEEN ===");
  let i=0;
  for(const [name,x] of jsxNames){
    i++;
    lines.push(`${i}. ${name}`);
    if(x.props.length)lines.push(`   props=${x.props.join(",")}`);
    if(Object.keys(x.style).length)lines.push(`   style=${formatObj(x.style)}`);
  }

  const text=lines.join("\n");
  console.log("[ServerNames Layout Probe]\n"+text);

  try{
    V?.ui?.alerts?.showConfirmationAlert?.({
      title:"Server Names layout probe",
      content:text,
      confirmText:"OK",
      onConfirm:()=>{},
      secondaryConfirmText:"Copy",
      onConfirmSecondary:()=>{
        try{
          const cb=V?.metro?.common?.clipboard;
          const r=cb?.setString?.(text);
          if(r?.catch)r.catch(()=>{});
          toast("Layout probe copied.");
        }catch(e){console.error("[ServerNames Layout Probe] copy failed:",e);}
      },
      isDismissable:true
    });
  }catch(e){
    console.error("[ServerNames Layout Probe] alert failed:",e);
    toast("Layout probe complete; alert API failed. See console.");
  }
}

function patchType(name,cb){
  const patcher=V.patcher ?? V.api?.patcher;
  const w=V.metro.findByTypeName?.(name);
  if(w&&typeof w.type==="function"){
    unpatchers.push(patcher.after("type",w,cb));
    return true;
  }
  return false;
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  const patcher=V.patcher ?? V.api?.patcher;
  if(!patcher?.after)throw new Error("Revenge patcher.after not found.");

  const a=patchType("GuildsOnly",afterGuildsOnly);
  const b=patchType("GuildsBarAnimatedItemWrapper",afterAnimated);

  const jsxRuntime=
    V.metro.findByProps?.("jsx","jsxs") ??
    V.metro.findByProps?.("jsx","jsxDEV");

  if(jsxRuntime){
    if(typeof jsxRuntime.jsx==="function")unpatchers.push(patcher.after("jsx",jsxRuntime,afterJsx));
    if(typeof jsxRuntime.jsxs==="function")unpatchers.push(patcher.after("jsxs",jsxRuntime,afterJsx));
    if(typeof jsxRuntime.jsxDEV==="function")unpatchers.push(patcher.after("jsxDEV",jsxRuntime,afterJsx));
  }

  toast(
    `Server Names layout probe active. `+
    `GuildsOnly=${a?"yes":"no"}, animated item=${b?"yes":"no"}. `+
    `Open and scroll the server list; report appears in 15 seconds.`
  );

  timer=setTimeout(report,15000);
}

function stop(){
  if(timer){clearTimeout(timer);timer=null;}
  for(const u of unpatchers.splice(0)){try{u?.();}catch{}}
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()