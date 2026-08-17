(()=>{"use strict";
let V=null;
let GuildStore=null;
let unpatchers=[];
let replacements=0;
let reportedSuccess=false;

const VERSION="0.6-targeted";
const WRAPPER_SIZE=56;
const TILE_SIZE=48;

function api(){
  return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;
}

function toast(msg){
  try{(V??api())?.ui?.toasts?.showToast?.(String(msg));}
  catch(e){console.error("[ServerNames] toast failed:",e);}
}

function cname(C){
  try{return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "";}
  catch{return "";}
}

function ReactObj(){
  return V?.metro?.common?.React ?? globalThis.React ?? null;
}

function RN(){
  return V?.metro?.common?.ReactNative ?? globalThis.ReactNative ?? null;
}

function guildName(guildId){
  if(!guildId || !GuildStore)return null;
  try{return GuildStore.getGuild?.(String(guildId))?.name ?? null;}
  catch{return null;}
}

function NameOverlay({name}){
  const React=ReactObj();
  const ReactNative=RN();
  const {View,Text}=ReactNative;

  return React.createElement(
    View,
    {
      pointerEvents:"none",
      accessibilityElementsHidden:true,
      importantForAccessibility:"no-hide-descendants",
      style:{
        position:"absolute",
        left:(WRAPPER_SIZE-TILE_SIZE)/2,
        top:(WRAPPER_SIZE-TILE_SIZE)/2,
        width:TILE_SIZE,
        height:TILE_SIZE,
        borderRadius:12,
        backgroundColor:"#2b2d31",
        alignItems:"center",
        justifyContent:"center",
        paddingHorizontal:3,
        paddingVertical:2,
        zIndex:1000,
        elevation:20
      }
    },
    React.createElement(
      Text,
      {
        numberOfLines:4,
        ellipsizeMode:"tail",
        adjustsFontSizeToFit:true,
        minimumFontScale:0.45,
        allowFontScaling:false,
        style:{
          width:TILE_SIZE-6,
          color:"#f2f3f5",
          fontSize:9,
          lineHeight:10,
          fontWeight:"600",
          textAlign:"center"
        }
      },
      name
    )
  );
}

function GuildNameWrapped({original,guildId}){
  const React=ReactObj();
  const ReactNative=RN();
  const {View}=ReactNative;
  const name=guildName(guildId);

  if(!name)return original;

  replacements++;
  if(!reportedSuccess && replacements>=1){
    reportedSuccess=true;
    setTimeout(()=>toast(`Server Names ${VERSION}: replacing guild icons.`),250);
  }

  return React.createElement(
    View,
    {
      style:{
        width:WRAPPER_SIZE,
        height:WRAPPER_SIZE,
        position:"relative",
        alignItems:"center",
        justifyContent:"center"
      }
    },
    original,
    React.createElement(NameOverlay,{name})
  );
}

function hook(args,ret){
  try{
    const Component=args?.[0];
    const props=args?.[1] ?? ret?.props;
    if(cname(Component)!=="GuildsBarGuild")return;

    const guildId=props?.guildId;
    if(!guildId)return;

    const React=ReactObj();
    if(!React)return;

    return React.createElement(GuildNameWrapped,{
      original:ret,
      guildId:String(guildId)
    });
  }catch(error){
    console.error("[ServerNames] GuildsBarGuild hook failed:",error);
  }
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  const patcher=V.patcher ?? V.api?.patcher;
  if(!patcher?.after)throw new Error("Revenge patcher.after not found.");

  const ReactNative=RN();
  if(!ReactObj() || !ReactNative?.View || !ReactNative?.Text){
    throw new Error("React/React Native components unavailable.");
  }

  GuildStore=
    V.metro.findByStoreName?.("GuildStore") ??
    V.metro.findByProps?.("getGuild","getGuilds") ??
    null;

  if(!GuildStore)throw new Error("GuildStore not found.");

  const jsxRuntime=
    V.metro.findByProps?.("jsx","jsxs") ??
    V.metro.findByProps?.("jsx","jsxDEV");

  if(!jsxRuntime)throw new Error("Discord JSX runtime not found.");

  if(typeof jsxRuntime.jsx==="function")
    unpatchers.push(patcher.after("jsx",jsxRuntime,hook));
  if(typeof jsxRuntime.jsxs==="function")
    unpatchers.push(patcher.after("jsxs",jsxRuntime,hook));
  if(typeof jsxRuntime.jsxDEV==="function")
    unpatchers.push(patcher.after("jsxDEV",jsxRuntime,hook));

  if(!unpatchers.length)throw new Error("No JSX runtime functions could be patched.");

  toast(`Server Names ${VERSION} enabled. Open the server list.`);
}

function stop(){
  for(const u of unpatchers.splice(0)){
    try{u?.();}catch(e){console.error("[ServerNames] unpatch failed:",e);}
  }
  GuildStore=null;
  replacements=0;
  reportedSuccess=false;
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()