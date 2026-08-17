(()=>{"use strict";

let V=null;
let GuildStore=null;
let storage=null;
let unpatchers=[];
let successShown=false;
let fastListSeen=false;
let guildPressablesPatched=0;

const VERSION="1.7";

const DEFAULTS={
  width:112,
  sidebarWidth:120,
  height:24,
  fontSize:10,
  iconSize:20,
  padding:4
};

const LIMITS={
  width:[72,240],
  sidebarWidth:[72,280],
  height:[18,56],
  fontSize:[7,20],
  iconSize:[12,48],
  padding:[0,18]
};

function api(){
  try{if(typeof vendetta!=="undefined"&&vendetta)return vendetta;}catch{}
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

function clampNumber(value,key){
  const fallback=DEFAULTS[key];
  const [min,max]=LIMITS[key];
  let n=Number(value);
  if(!Number.isFinite(n))n=fallback;
  n=Math.round(n);
  return Math.max(min,Math.min(max,n));
}

function ensureSettings(){
  if(!storage)return;
  for(const key of Object.keys(DEFAULTS)){
    storage[key]=clampNumber(storage[key] ?? DEFAULTS[key],key);
  }
}

function cfg(){
  return {
    width:clampNumber(storage?.width,"width"),
    sidebarWidth:clampNumber(storage?.sidebarWidth,"sidebarWidth"),
    height:clampNumber(storage?.height,"height"),
    fontSize:clampNumber(storage?.fontSize,"fontSize"),
    iconSize:clampNumber(storage?.iconSize,"iconSize"),
    padding:clampNumber(storage?.padding,"padding")
  };
}

function dimensions(){
  const c=cfg();
  return {
    ...c,
    touchHeight:c.height+(c.padding*2),
    sidebarWidth:Math.max(c.sidebarWidth,c.width)
  };
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

function CompactVisual({guild}){
  const React=ReactObj();
  const R=RN();
  if(!React || !R?.View || !R?.Text)return null;

  const c=cfg();
  const iconSize=Math.min(c.iconSize,c.height);
  const url=iconUrl(guild);

  const icon=url && R.Image
    ? React.createElement(R.Image,{
        source:{uri:url},
        resizeMode:"cover",
        style:{
          width:iconSize,
          height:iconSize,
          borderRadius:3,
          flexShrink:0
        }
      })
    : React.createElement(
        R.View,
        {
          style:{
            width:iconSize,
            height:iconSize,
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
              fontSize:Math.max(6,Math.min(c.fontSize-1,9)),
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
        width:c.width,
        height:c.height,
        flexDirection:"row",
        alignItems:"center",
        paddingHorizontal:4,
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
          marginLeft:5,
          marginRight:5,
          color:"#f2f3f5",
          fontSize:c.fontSize,
          lineHeight:Math.max(c.fontSize+3,12),
          fontWeight:"600"
        }
      },
      guild.name
    )
  );
}

/*
 * Proven full-list patch from the v0.7 line: patch GuildsBarGuild.type itself.
 * The stock interactive content stays mounted and invisible beneath our row.
 */
function afterGuildRender(args,ret){
  try{
    const props=args?.[0];
    const guild=getGuild(props?.guildId);
    if(!guild)return;

    const React=ReactObj();
    const R=RN();
    if(!React || !R?.View)return;

    const d=dimensions();

    if(!successShown){
      successShown=true;
      setTimeout(()=>toast(`Server Names ${VERSION}: guild rows active.`),150);
    }

    return React.createElement(
      R.View,
      {
        style:{
          width:d.sidebarWidth,
          height:d.touchHeight,
          position:"relative",
          alignItems:"center",
          justifyContent:"center",
          overflow:"visible"
        }
      },

      // Original Discord control: invisible, but still receives touch/long-press.
      React.createElement(
        R.View,
        {
          style:{
            position:"absolute",
            left:0,
            top:0,
            width:d.sidebarWidth,
            height:d.touchHeight,
            opacity:0,
            overflow:"hidden",
            zIndex:0,
            elevation:0
          }
        },
        ret
      ),

      // Visible compact record centered in the wider hit/rail area.
      React.createElement(
        R.View,
        {
          pointerEvents:"none",
          style:{
            position:"absolute",
            left:Math.max(0,(d.sidebarWidth-d.width)/2),
            top:d.padding,
            width:d.width,
            height:d.height,
            zIndex:10,
            elevation:10
          }
        },
        React.createElement(CompactVisual,{guild})
      )
    );
  }catch(error){
    console.error("[ServerNames] GuildsBarGuild patch failed:",error);
  }
}

function componentName(C){
  try{
    return C?.displayName ?? C?.name ?? C?.type?.displayName ?? C?.type?.name ?? "";
  }catch{return "";}
}

function flattenStyle(style){
  try{
    const SS=RN()?.StyleSheet;
    if(SS?.flatten)return SS.flatten(style) ?? {};
  }catch{}

  if(Array.isArray(style)){
    const out={};
    for(const part of style){
      const flat=flattenStyle(part);
      if(flat&&typeof flat==="object")Object.assign(out,flat);
    }
    return out;
  }

  return style&&typeof style==="object" ? style : {};
}

function near(a,b,tolerance=0.5){
  return typeof a==="number" && Math.abs(a-b)<=tolerance;
}

/*
 * Probe v1.5 identified the stock guild pressable by this exact layout:
 * width 72, height 60, paddingTop/Bottom 6, paddingLeft 12.
 * This element effectively defines the guild rail's stock width.
 */
function isStockGuildPressable(props){
  if(!props || typeof props!=="object")return false;

  const s=flattenStyle(props.style);
  return (
    near(s.width,72) &&
    near(s.height,60) &&
    near(s.paddingTop,6) &&
    near(s.paddingBottom,6) &&
    near(s.paddingLeft,12) &&
    props.accessibilityState!=null &&
    Array.isArray(props.accessibilityActions) &&
    typeof props.onAccessibilityAction==="function" &&
    (
      typeof props.onClick==="function" ||
      typeof props.onResponderRelease==="function"
    )
  );
}

function patchGuildPressable(ret,props){
  const React=ReactObj();
  if(!React || !ret || typeof ret!=="object")return ret;

  const d=dimensions();
  guildPressablesPatched++;

  return React.cloneElement(ret,{
    style:[
      props.style,
      {
        width:d.sidebarWidth,
        minWidth:d.sidebarWidth,
        maxWidth:d.sidebarWidth,
        height:d.touchHeight,
        minHeight:d.touchHeight,
        maxHeight:d.touchHeight,
        paddingTop:0,
        paddingBottom:0,
        paddingLeft:0,
        paddingRight:0
      }
    ]
  });
}

function widenedStyle(style){
  const d=dimensions();
  return [
    style,
    {
      width:d.sidebarWidth,
      minWidth:d.sidebarWidth,
      maxWidth:d.sidebarWidth
    }
  ];
}

/*
 * Preserve FastList's special rows. The stock guild row is 60px; separators
 * in the probe were 13px. Only replace ~60px results with our configured
 * touch height.
 */
function patchItemSize(original){
  const target=dimensions().touchHeight;

  if(typeof original==="number"){
    return near(original,60,2) ? target : original;
  }

  if(typeof original==="function"){
    return function(){
      const old=original.apply(this,arguments);
      return near(old,60,2) ? target : old;
    };
  }

  return original;
}

function isGuildFastList(props){
  return !!(
    props &&
    typeof props==="object" &&
    "sections" in props &&
    "itemSize" in props &&
    typeof props.renderItem==="function" &&
    typeof props.renderSection==="function" &&
    typeof props.getRecyclerKey==="function" &&
    ("persistantKeys" in props || "disableRecyclingOnFullCompute" in props)
  );
}

function afterJsx(args,ret){
  try{
    const C=args?.[0];
    const props=args?.[1] ?? ret?.props ?? {};
    const name=componentName(C);
    const React=ReactObj();

    if(isStockGuildPressable(props)){
      return patchGuildPressable(ret,props);
    }

    if(name==="FastList" && isGuildFastList(props)){
      fastListSeen=true;
      if(!React || !ret || typeof ret!=="object")return;

      return React.cloneElement(ret,{
        itemSize:patchItemSize(props.itemSize),
        style:widenedStyle(props.style)
      });
    }

    if(name==="GuildsOnly"){
      if(!React || !ret || typeof ret!=="object")return;
      return React.cloneElement(ret,{
        style:widenedStyle(props.style)
      });
    }
  }catch(error){
    console.error("[ServerNames] JSX layout patch failed:",error);
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

function NumericSetting({label,settingKey,suffix}){
  const React=ReactObj();
  const R=RN();
  const current=clampNumber(storage?.[settingKey],settingKey);
  const [text,setText]=React.useState(String(current));

  const commit=(raw)=>{
    const value=clampNumber(raw,settingKey);
    storage[settingKey]=value;
    setText(String(value));
    toast(`${label}: ${value}${suffix??""}. Fully reload Discord to apply.`);
  };

  return React.createElement(
    R.View,
    {
      style:{
        marginHorizontal:16,
        marginVertical:6,
        padding:12,
        borderRadius:8,
        backgroundColor:"#2b2d31",
        flexDirection:"row",
        alignItems:"center"
      }
    },
    React.createElement(
      R.View,
      {style:{flex:1,paddingRight:12}},
      React.createElement(
        R.Text,
        {style:{color:"#f2f3f5",fontSize:15,fontWeight:"600"}},
        label
      ),
      React.createElement(
        R.Text,
        {style:{color:"#b5bac1",fontSize:12,marginTop:2}},
        `Allowed: ${LIMITS[settingKey][0]}–${LIMITS[settingKey][1]}${suffix??""}`
      )
    ),
    React.createElement(R.TextInput,{
      value:text,
      onChangeText:setText,
      onEndEditing:()=>commit(text),
      onSubmitEditing:()=>commit(text),
      keyboardType:"number-pad",
      selectTextOnFocus:true,
      maxLength:4,
      style:{
        width:70,
        minHeight:38,
        paddingHorizontal:8,
        paddingVertical:6,
        borderRadius:6,
        backgroundColor:"#1e1f22",
        color:"#f2f3f5",
        fontSize:15,
        textAlign:"center"
      }
    })
  );
}

function SettingsPage(){
  const React=ReactObj();
  const R=RN();
  if(!React || !R?.ScrollView || !R?.Text || !R?.TextInput)return null;

  const [,rerender]=React.useReducer(x=>x+1,0);
  const d=dimensions();

  const reset=()=>{
    for(const [key,value] of Object.entries(DEFAULTS))storage[key]=value;
    rerender();
    toast("Server Names settings reset. Fully reload Discord to apply.");
  };

  return React.createElement(
    R.ScrollView,
    {
      style:{flex:1,backgroundColor:"#111214"},
      contentContainerStyle:{paddingVertical:12,paddingBottom:36}
    },

    React.createElement(
      R.Text,
      {
        style:{
          marginHorizontal:16,
          marginBottom:4,
          color:"#f2f3f5",
          fontSize:20,
          fontWeight:"700"
        }
      },
      "Server Names"
    ),

    React.createElement(
      R.Text,
      {
        style:{
          marginHorizontal:16,
          marginBottom:10,
          color:"#b5bac1",
          fontSize:13,
          lineHeight:18
        }
      },
      `Visible row: ${d.width}×${d.height}px. Touch height: ${d.touchHeight}px. Sidebar width: ${d.sidebarWidth}px. Fully reload Discord after layout changes.`
    ),

    React.createElement(NumericSetting,{key:"w"+d.width,label:"Row width",settingKey:"width",suffix:" px"}),
    React.createElement(NumericSetting,{key:"sw"+d.sidebarWidth,label:"Sidebar width",settingKey:"sidebarWidth",suffix:" px"}),
    React.createElement(NumericSetting,{key:"h"+d.height,label:"Height",settingKey:"height",suffix:" px"}),
    React.createElement(NumericSetting,{key:"f"+d.fontSize,label:"Font size",settingKey:"fontSize",suffix:" px"}),
    React.createElement(NumericSetting,{key:"i"+d.iconSize,label:"Icon size",settingKey:"iconSize",suffix:" px"}),
    React.createElement(NumericSetting,{key:"p"+d.padding,label:"Vertical padding",settingKey:"padding",suffix:" px"}),

    React.createElement(
      R.View,
      {style:{marginHorizontal:16,marginTop:12}},
      React.createElement(
        R.Pressable ?? R.TouchableOpacity,
        {
          onPress:reset,
          style:{
            minHeight:44,
            borderRadius:8,
            backgroundColor:"#4e5058",
            alignItems:"center",
            justifyContent:"center",
            paddingHorizontal:14
          }
        },
        React.createElement(
          R.Text,
          {style:{color:"#fff",fontSize:14,fontWeight:"600"}},
          "Reset defaults"
        )
      )
    )
  );
}

function start(){
  V=api();
  if(!V?.metro)throw new Error("Revenge Metro API not found.");

  storage=V.plugin?.storage ?? null;
  if(!storage)throw new Error("Revenge plugin storage was not provided.");
  ensureSettings();

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

  patchTypeByName("GuildsBarGuild",afterGuildRender,true);

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

  const d=dimensions();
  toast(
    `Server Names ${VERSION}: row ${d.width}×${d.height}, `+
    `sidebar ${d.sidebarWidth}px. Fully reload if just updated.`
  );

  setTimeout(()=>{
    toast(
      `Server Names ${VERSION}: FastList ${fastListSeen?"yes":"not seen"}, `+
      `guild-width controls patched ${guildPressablesPatched}.`
    );
  },2500);
}

function stop(){
  for(const u of unpatchers.splice(0)){
    try{u?.();}catch(e){console.error("[ServerNames] unpatch failed:",e);}
  }

  GuildStore=null;
  storage=null;
  successShown=false;
  fastListSeen=false;
  guildPressablesPatched=0;
  V=null;
}

return {
  default:{
    onLoad:start,
    onUnload:stop,
    settings:SettingsPage
  }
};
})()