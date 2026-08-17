(()=>{"use strict";
let V=null;
let GuildStore=null;
let unpatchers=[];
let successShown=false;

const VERSION="0.8-compact";

// Compact text-list geometry.
// ~2x the old width and ~1/3 the old height.
const SIDEBAR_WIDTH=120;
const ROW_WIDTH=112;
const ROW_HEIGHT=22;
const ICON_SIZE=22;
const NAME_GAP=5;
const NAME_RIGHT_PAD=5;

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

function getGuild(guildId){
  if(!guildId || !GuildStore)return null;
  try{return GuildStore.getGuild?.(String(guildId)) ?? null;}
  catch{return null;}
}

function iconUrl(guild){
  if(!guild)return null;

  try{
    if(typeof guild.getIconURL==="function"){
      const u=guild.getIconURL(64,false) ?? guild.getIconURL();
      if(typeof u==="string" && u)return u;
    }
  }catch{}

  // Fallback to Discord's normal CDN icon location.
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

function CompactGuildRow({guild}){
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
        height:ROW_HEIGHT,
        flexDirection:"row",
        alignItems:"center",
        backgroundColor:"#2b2d31",
        borderRadius:4,
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

function compactOriginal(ret){
  const React=ReactObj();
  if(!React || !ret || typeof ret!=="object")return ret;

  try{
    return React.cloneElement(ret,{
      style:[
        ret.props?.style,
        {
          width:ROW_WIDTH,
          height:ROW_HEIGHT,
          minWidth:ROW_WIDTH,
          maxWidth:ROW_WIDTH,
          minHeight:ROW_HEIGHT,
          maxHeight:ROW_HEIGHT
        }
      ]
    });
  }catch{
    return ret;
  }
}

function afterGuildRender(args,ret){
  try{
    const props=args?.[0];
    const guild=getGuild(props?.guildId);
    if(!guild)return;

    const React=ReactObj();
    const R=RN();
    if(!React || !R?.View)return;

    if(!successShown){
      successShown=true;
      setTimeout(()=>toast(`Server Names ${VERSION}: compact rows active.`),200);
    }

    // Keep Discord's original interactive row in place (transparent) so its
    // tap/long-press/accessibility behavior remains owned by Discord. The
    // compact visual row sits above it and ignores pointer events.
    const original=compactOriginal(ret);

    return React.createElement(
      R.View,
      {
        style:{
          width:ROW_WIDTH,
          height:ROW_HEIGHT,
          minWidth:ROW_WIDTH,
          maxWidth:ROW_WIDTH,
          minHeight:ROW_HEIGHT,
          maxHeight:ROW_HEIGHT,
          position:"relative",
          overflow:"visible"
        }
      },
      React.createElement(
        R.View,
        {
          style:{
            position:"absolute",
            left:0,
            top:0,
            width:ROW_WIDTH,
            height:ROW_HEIGHT,
            opacity:0.01,
            overflow:"hidden"
          }
        },
        original
      ),
      React.createElement(
        R.View,
        {
          pointerEvents:"none",
          style:{
            position:"absolute",
            left:0,
            top:0,
            width:ROW_WIDTH,
            height:ROW_HEIGHT,
            zIndex:1000,
            elevation:20
          }
        },
        React.createElement(CompactGuildRow,{guild})
      )
    );
  }catch(error){
    console.error("[ServerNames] GuildsBarGuild patch failed:",error);
  }
}

function afterAnimatedItemRender(args,ret){
  try{
    const props=args?.[0];
    const id=props?.id;

    // Only compress wrappers that correspond to an actual guild. This avoids
    // changing folders, Home/DMs, separators, or other special guild-bar rows.
    if(!getGuild(id))return;

    const React=ReactObj();
    if(!React || !ret || typeof ret!=="object")return;

    return React.cloneElement(ret,{
      style:[
        ret.props?.style,
        {
          width:ROW_WIDTH,
          height:ROW_HEIGHT,
          minWidth:ROW_WIDTH,
          maxWidth:ROW_WIDTH,
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

function afterGuildsOnlyRender(args,ret){
  try{return widenRoot(ret);}
  catch(error){console.error("[ServerNames] GuildsOnly width patch failed:",error);}
}

function afterUnreadBarsRender(args,ret){
  try{return widenRoot(ret);}
  catch(error){console.error("[ServerNames] unread-bar width patch failed:",error);}
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

  // The row patch is the core behavior and is required.
  patchTypeByName("GuildsBarGuild",afterGuildRender,true);

  // These sizing patches are best-effort because Discord occasionally changes
  // which wrappers own the list geometry.
  const itemPatched=patchTypeByName(
    "GuildsBarAnimatedItemWrapper",
    afterAnimatedItemRender,
    false
  );

  const sidebarPatched=patchTypeByName(
    "GuildsOnly",
    afterGuildsOnlyRender,
    false
  );

  patchTypeByName(
    "GuildsBarUnreadBars",
    afterUnreadBarsRender,
    false
  );

  toast(
    `Server Names ${VERSION}: ` +
    `row patch on; sidebar ${sidebarPatched?"widened":"width fallback"}; ` +
    `item spacing ${itemPatched?"compact":"fallback"}.`
  );
}

function stop(){
  for(const u of unpatchers.splice(0)){
    try{u?.();}catch(e){console.error("[ServerNames] unpatch failed:",e);}
  }

  GuildStore=null;
  successShown=false;
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()