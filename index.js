(()=>{"use strict";
let V=null;
let GuildStore=null;
let unpatchers=[];
let iconToGuild=new Map();
let successShown=false;
let unresolvedSeen=0;

const VERSION="1.0-recycled-cells";

// Wider text list, but with a larger hit target than v0.8/v0.9.
const SIDEBAR_WIDTH=128;
const ROW_WIDTH=120;
const ROW_HEIGHT=32;
const VISUAL_HEIGHT=28;
const ICON_SIZE=20;
const H_PAD=4;
const NAME_GAP=5;
const NAME_RIGHT_PAD=6;

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

function guilds(){
  try{
    const all=GuildStore?.getGuilds?.();
    return all && typeof all==="object" ? Object.values(all) : [];
  }catch{
    return [];
  }
}

function rebuildGuildIndex(){
  iconToGuild.clear();
  for(const g of guilds()){
    if(!g?.id)continue;

    iconToGuild.set(String(g.id),g);

    if(g.icon){
      const key=String(g.icon);
      // Only use an icon hash if it maps unambiguously.
      if(!iconToGuild.has(key))iconToGuild.set(key,g);
      else if(iconToGuild.get(key)!==g)iconToGuild.set(key,null);
    }

    try{
      const u=typeof g.getIconURL==="function" ? (g.getIconURL(64,false) ?? g.getIconURL()) : null;
      if(typeof u==="string" && u)iconToGuild.set(u,g);
    }catch{}
  }
}

function byId(id){
  if(id==null)return null;
  try{return GuildStore?.getGuild?.(String(id)) ?? null;}
  catch{return null;}
}

function resolveString(s){
  if(typeof s!=="string" || !s)return null;

  const direct=byId(s);
  if(direct)return direct;

  const cdn=s.match(/\/icons\/(\d{15,22})\//);
  if(cdn){
    const g=byId(cdn[1]);
    if(g)return g;
  }

  const mapped=iconToGuild.get(s);
  return mapped || null;
}

function resolveGuild(value,depth=0,seen=new Set()){
  if(value==null || depth>3)return null;

  if(typeof value==="string")return resolveString(value);
  if(typeof value==="number")return byId(value);

  if(typeof value!=="object")return null;
  if(seen.has(value))return null;
  seen.add(value);

  const directIds=[
    value.guildId,
    value.guildID,
    value.id,
    value.guild?.id
  ];

  for(const id of directIds){
    const g=byId(id);
    if(g)return g;
  }

  if(value.guild?.name && value.guild?.id)return value.guild;
  if(value.name && value.id){
    const g=byId(value.id);
    if(g)return g;
  }

  const likely=[
    value.uri,
    value.url,
    value.icon,
    value.iconHash,
    value.source,
    value.value,
    value.image,
    value.asset
  ];

  for(const child of likely){
    const g=resolveGuild(child,depth+1,seen);
    if(g)return g;
  }

  return null;
}

function iconUrl(guild){
  if(!guild)return null;

  try{
    if(typeof guild.getIconURL==="function"){
      const u=guild.getIconURL(64,false) ?? guild.getIconURL();
      if(typeof u==="string" && u)return u;
    }
  }catch{}

  if(guild.id && guild.icon){
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64`;
  }

  return null;
}

function initials(name){
  const parts=String(name??"").trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return "?";
  if(parts.length===1)return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function CompactGuildVisual({guild}){
  const React=ReactObj();
  const R=RN();
  if(!React || !R?.View || !R?.Text)return null;

  const url=iconUrl(guild);

  const icon = url && R.Image
    ? React.createElement(R.Image,{
        source:{uri:url},
        resizeMode:"cover",
        style:{
          width:ICON_SIZE,
          height:ICON_SIZE,
          borderRadius:3,
          flexShrink:0
        }
      })
    : React.createElement(
        R.View,
        {
          style:{
            width:ICON_SIZE,
            height:ICON_SIZE,
            borderRadius:3,
            flexShrink:0,
            alignItems:"center",
            justifyContent:"center",
            backgroundColor:"#404249"
          }
        },
        React.createElement(
          R.Text,
          {
            allowFontScaling:false,
            numberOfLines:1,
            style:{
              color:"#f2f3f5",
              fontSize:8,
              lineHeight:10,
              fontWeight:"700",
              textAlign:"center"
            }
          },
          initials(guild.name)
        )
      );

  return React.createElement(
    R.View,
    {
      pointerEvents:"none",
      accessibilityElementsHidden:true,
      importantForAccessibility:"no-hide-descendants",
      style:{
        width:ROW_WIDTH,
        height:VISUAL_HEIGHT,
        flexDirection:"row",
        alignItems:"center",
        paddingHorizontal:H_PAD,
        backgroundColor:"#2b2d31",
        borderRadius:5,
        overflow:"hidden"
      }
    },
    icon,
    React.createElement(
      R.Text,
      {
        numberOfLines:1,
        ellipsizeMode:"tail",
        allowFontScaling:false,
        style:{
          flex:1,
          marginLeft:NAME_GAP,
          marginRight:NAME_RIGHT_PAD,
          color:"#f2f3f5",
          fontSize:10,
          lineHeight:13,
          fontWeight:"600"
        }
      },
      guild.name
    )
  );
}

// This is the key v1.0 change: patch the component that actually changes when
// Discord recycles a guild-bar cell, rather than decorating only the first
// GuildsBarGuild render associated with that native cell.
function afterGuildIconInner(args,ret){
  try{
    const props=args?.[0];
    let guild=resolveGuild(props?.value);

    if(!guild && props){
      guild=resolveGuild(props);
    }

    if(!guild){
      unresolvedSeen++;
      if(unresolvedSeen===25){
        // No identifying values are exposed on this build; keep original icon
        // rather than breaking it. No private values are logged.
        console.warn("[ServerNames] Some GuildIconInner values could not be mapped to GuildStore.");
      }
      return;
    }

    if(!successShown){
      successShown=true;
      setTimeout(()=>toast(`Server Names ${VERSION}: recycled-cell icon patch active.`),200);
    }

    const React=ReactObj();
    const R=RN();
    if(!React || !R?.View)return;

    return React.createElement(
      R.View,
      {
        style:{
          width:ROW_WIDTH,
          height:ROW_HEIGHT,
          alignItems:"center",
          justifyContent:"center",
          overflow:"visible"
        }
      },
      React.createElement(CompactGuildVisual,{guild})
    );
  }catch(error){
    console.error("[ServerNames] GuildIconInner patch failed:",error);
  }
}

// Geometry only. The visual content now comes from GuildIconInner, so this
// wrapper can safely be recycled without carrying a stale guild name.
function afterGuildRender(args,ret){
  try{
    const React=ReactObj();
    if(!React || !ret || typeof ret!=="object")return;

    return React.cloneElement(ret,{
      style:[
        ret.props?.style,
        {
          width:ROW_WIDTH,
          minWidth:ROW_WIDTH,
          maxWidth:ROW_WIDTH,
          height:ROW_HEIGHT,
          minHeight:ROW_HEIGHT,
          maxHeight:ROW_HEIGHT
        }
      ]
    });
  }catch(error){
    console.error("[ServerNames] GuildsBarGuild geometry patch failed:",error);
  }
}

function afterAnimatedItemRender(args,ret){
  try{
    const props=args?.[0];
    const id=props?.id;

    // Avoid compressing folders / DMs / separators.
    if(!byId(id))return;

    const React=ReactObj();
    if(!React || !ret || typeof ret!=="object")return;

    return React.cloneElement(ret,{
      style:[
        ret.props?.style,
        {
          width:ROW_WIDTH,
          minWidth:ROW_WIDTH,
          maxWidth:ROW_WIDTH,
          height:ROW_HEIGHT,
          minHeight:ROW_HEIGHT,
          maxHeight:ROW_HEIGHT
        }
      ]
    });
  }catch(error){
    console.error("[ServerNames] animated-item sizing patch failed:",error);
  }
}

function widenRoot(ret){
  const React=ReactObj();
  if(!React || !ret || typeof ret!=="object")return ret;

  try{
    return React.cloneElement(ret,{
      style:[
        ret.props?.style,
        {
          width:SIDEBAR_WIDTH,
          minWidth:SIDEBAR_WIDTH,
          maxWidth:SIDEBAR_WIDTH
        }
      ]
    });
  }catch{
    return ret;
  }
}

function patchTypeByName(name,callback,required=false){
  const patcher=V.patcher ?? V.api?.patcher;
  const wrapper=V.metro.findByTypeName?.(name);

  if(wrapper && typeof wrapper.type==="function"){
    unpatchers.push(patcher.after("type",wrapper,callback));
    return true;
  }

  if(required)throw new Error(`${name} component was not found.`);
  return false;
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  const patcher=V.patcher ?? V.api?.patcher;
  if(!patcher?.after)throw new Error("Revenge patcher.after not found.");

  const R=RN();
  if(!ReactObj() || !R?.View || !R?.Text){
    throw new Error("React/React Native components unavailable.");
  }

  GuildStore=
    V.metro.findByStoreName?.("GuildStore") ??
    V.metro.findByProps?.("getGuild","getGuilds") ??
    null;

  if(!GuildStore)throw new Error("GuildStore not found.");
  rebuildGuildIndex();

  // Required: actual recycled icon renderer.
  patchTypeByName("GuildIconInner",afterGuildIconInner,true);

  // Layout geometry.
  patchTypeByName("GuildsBarGuild",afterGuildRender,false);

  const itemPatched=patchTypeByName(
    "GuildsBarAnimatedItemWrapper",
    afterAnimatedItemRender,
    false
  );

  const sidebarPatched=patchTypeByName(
    "GuildsOnly",
    (args,ret)=>widenRoot(ret),
    false
  );

  patchTypeByName(
    "GuildsBarUnreadBars",
    (args,ret)=>widenRoot(ret),
    false
  );

  toast(
    `Server Names ${VERSION}: ` +
    `sidebar ${sidebarPatched?"widened":"width fallback"}; ` +
    `32px touch rows ${itemPatched?"active":"fallback"}.`
  );
}

function stop(){
  for(const u of unpatchers.splice(0)){
    try{u?.();}catch(e){console.error("[ServerNames] unpatch failed:",e);}
  }

  iconToGuild.clear();
  GuildStore=null;
  successShown=false;
  unresolvedSeen=0;
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()