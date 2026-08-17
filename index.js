(()=>{"use strict";
let unpatchers=[];
let GuildStore=null;
let seenGuildComponents=new Set();

const TILE_WIDTH=52;
const TILE_HEIGHT=46;
const FONT_SIZE=9;

function mod(){return vendetta;}
function ReactObj(){return globalThis.React ?? mod()?.metro?.common?.React;}
function RN(){return mod()?.metro?.common?.ReactNative ?? globalThis.ReactNative;}

function getComponentName(Component){
  return Component?.displayName ?? Component?.name ?? Component?.type?.displayName ?? Component?.type?.name ?? "";
}

function tryGuildById(id){
  if(!id||!GuildStore)return null;
  try{return GuildStore.getGuild?.(String(id)) ?? null;}catch{return null;}
}

function extractGuild(props){
  if(!props||typeof props!=="object")return null;
  const direct=[props.guild,props.server,props.item?.guild,props.node?.guild,props.guildNode?.guild];
  for(const value of direct){
    if(value&&typeof value==="object"&&value.name&&value.id)return value;
  }
  const ids=[props.guildId,props.guildID,props.serverId,props.item?.guildId,props.node?.guildId,props.guildNode?.guildId,props.id];
  for(const id of ids){
    const guild=tryGuildById(id);
    if(guild?.name)return guild;
  }
  return null;
}

function looksLikeGuildIcon(Component,props){
  const name=getComponentName(Component);
  if(/guild.*(icon|avatar)|(icon|avatar).*guild/i.test(name))return true;
  if(/guild/i.test(name)){
    const hasVisualProps=props?.size!=null||props?.icon!=null||props?.iconSource!=null||props?.source!=null||props?.animate!=null;
    if(hasVisualProps)return true;
  }
  return false;
}

function makeNameTile(guild){
  const React=ReactObj();
  const ReactNative=RN();
  if(!React||!ReactNative?.View||!ReactNative?.Text)return null;
  const {View,Text}=ReactNative;
  return React.createElement(
    View,
    {
      pointerEvents:"none",
      accessibilityElementsHidden:true,
      importantForAccessibility:"no-hide-descendants",
      style:{
        width:TILE_WIDTH,height:TILE_HEIGHT,borderRadius:10,
        backgroundColor:"#2b2d31",
        alignItems:"center",justifyContent:"center",
        paddingHorizontal:3,paddingVertical:2
      }
    },
    React.createElement(
      Text,
      {
        numberOfLines:3,
        ellipsizeMode:"tail",
        adjustsFontSizeToFit:true,
        minimumFontScale:0.55,
        allowFontScaling:false,
        style:{
          width:TILE_WIDTH-6,
          color:"#f2f3f5",
          fontSize:FONT_SIZE,
          lineHeight:11,
          fontWeight:"600",
          textAlign:"center"
        }
      },
      guild.name
    )
  );
}

function transformJsx(args,ret){
  try{
    const Component=args?.[0];
    const props=ret?.props ?? args?.[1];
    const name=getComponentName(Component);

    if(/guild/i.test(name)&&!seenGuildComponents.has(name)){
      seenGuildComponents.add(name);
      console.log(`[ServerNames] guild-like component: ${name}`);
    }

    if(!looksLikeGuildIcon(Component,props))return;
    const guild=extractGuild(props);
    if(!guild?.name)return;

    const replacement=makeNameTile(guild);
    if(replacement)return replacement;
  }catch(error){
    console.error("[ServerNames] JSX transform failed:",error);
  }
}

function start(){
  const v=mod();
  if(!v?.metro||!v?.api?.patcher)throw new Error("Revenge Classic API was not found.");

  GuildStore=v.metro.findByStoreName?.("GuildStore") ?? v.metro.findByProps?.("getGuild","getGuilds") ?? null;
  if(!GuildStore)console.warn("[ServerNames] GuildStore was not found; labels may not resolve by guildId.");

  const jsxRuntime=v.metro.findByProps?.("jsx","jsxs");
  if(!jsxRuntime)throw new Error("Discord JSX runtime was not found.");

  const after=v.api.patcher.after;
  if(typeof jsxRuntime.jsx==="function")unpatchers.push(after("jsx",jsxRuntime,transformJsx));
  if(typeof jsxRuntime.jsxs==="function")unpatchers.push(after("jsxs",jsxRuntime,transformJsx));

  if(unpatchers.length===0)throw new Error("Could not patch Discord's JSX runtime.");
  console.log("[ServerNames] started");
}

function stop(){
  for(const unpatch of unpatchers.splice(0)){
    try{unpatch?.();}catch(error){console.error("[ServerNames] unpatch failed:",error);}
  }
  GuildStore=null;
  seenGuildComponents.clear();
  console.log("[ServerNames] stopped");
}

return {default:{onLoad:start,onUnload:stop}};
})()