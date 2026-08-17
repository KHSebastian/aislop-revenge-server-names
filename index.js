(()=>{"use strict";
let V=null;
let GuildStore=null;
let unpatchers=[];
let patchMode="none";
let successShown=false;

const VERSION="0.7-virtualized";
const WRAPPER_SIZE=56;
const TILE_SIZE=48;

function api(){
  return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;
}

function toast(msg){
  try{(V??api())?.ui?.toasts?.showToast?.(String(msg));}
  catch(e){console.error("[ServerNames] toast failed:",e);}
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
  if(!React || !ReactNative?.View || !ReactNative?.Text)return null;

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

function wrapGuildResult(ret,guildId){
  const React=ReactObj();
  const ReactNative=RN();
  if(!React || !ReactNative?.View || !ret)return ret;

  const name=guildName(guildId);
  if(!name)return ret;

  if(!successShown){
    successShown=true;
    setTimeout(()=>toast(`Server Names ${VERSION}: live row patch active.`),200);
  }

  return React.createElement(
    ReactNative.View,
    {
      style:{
        width:WRAPPER_SIZE,
        height:WRAPPER_SIZE,
        position:"relative",
        alignItems:"center",
        justifyContent:"center"
      }
    },
    ret,
    React.createElement(NameOverlay,{name})
  );
}

/**
 * Direct patch for React.memo / wrapper component.
 * Because this patches the underlying render function, it is invoked when
 * virtualized list cells are recycled for guilds that were not initially visible.
 */
function afterGuildRender(args,ret){
  try{
    const props=args?.[0];
    const guildId=props?.guildId;
    if(!guildId)return;
    return wrapGuildResult(ret,String(guildId));
  }catch(error){
    console.error("[ServerNames] direct GuildsBarGuild render patch failed:",error);
  }
}

/**
 * Fallback for Discord builds where GuildsBarGuild is not exposed as a
 * type-named wrapper. This is the older v0.6 behavior.
 */
function componentName(C){
  try{
    return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "";
  }catch{return "";}
}

function afterJsx(args,ret){
  try{
    const Component=args?.[0];
    const props=args?.[1] ?? ret?.props;
    if(componentName(Component)!=="GuildsBarGuild")return;

    const guildId=props?.guildId;
    if(!guildId)return;

    return wrapGuildResult(ret,String(guildId));
  }catch(error){
    console.error("[ServerNames] JSX fallback patch failed:",error);
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

  // Preferred path: Revenge exposes findByTypeName specifically for wrappers
  // whose underlying React component is in `.type`.
  const guildWrapper=V.metro.findByTypeName?.("GuildsBarGuild");

  if(guildWrapper && typeof guildWrapper.type==="function"){
    unpatchers.push(patcher.after("type",guildWrapper,afterGuildRender));
    patchMode="direct-type";
    toast(`Server Names ${VERSION}: direct virtualized-row patch installed.`);
    return;
  }

  // Fallback to the v0.6 JSX interception if this Discord build exposes the
  // component differently.
  const jsxRuntime=
    V.metro.findByProps?.("jsx","jsxs") ??
    V.metro.findByProps?.("jsx","jsxDEV");

  if(!jsxRuntime)throw new Error("GuildsBarGuild wrapper and Discord JSX runtime were both unavailable.");

  if(typeof jsxRuntime.jsx==="function")
    unpatchers.push(patcher.after("jsx",jsxRuntime,afterJsx));
  if(typeof jsxRuntime.jsxs==="function")
    unpatchers.push(patcher.after("jsxs",jsxRuntime,afterJsx));
  if(typeof jsxRuntime.jsxDEV==="function")
    unpatchers.push(patcher.after("jsxDEV",jsxRuntime,afterJsx));

  if(!unpatchers.length)throw new Error("No patchable GuildsBarGuild path was found.");

  patchMode="jsx-fallback";
  toast(`Server Names ${VERSION}: JSX fallback installed.`);
}

function stop(){
  for(const u of unpatchers.splice(0)){
    try{u?.();}catch(e){console.error("[ServerNames] unpatch failed:",e);}
  }

  GuildStore=null;
  patchMode="none";
  successShown=false;
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()