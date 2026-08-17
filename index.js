(()=>{"use strict";

let V=null;
let GuildStore=null;
let storage=null;
let unpatchers=[];
let successShown=false;
let fastListPatched=false;
let navPatched=false;

const VERSION="1.3-fastlist";

const DEFAULTS={
  width:112,
  height:24,
  fontSize:10,
  iconSize:20,
  padding:4
};

const LIMITS={
  width:[72,240],
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
  const range=LIMITS[key];
  let n=Number(value);
  if(!Number.isFinite(n))n=fallback;
  n=Math.round(n);
  return Math.max(range[0],Math.min(range[1],n));
}

function ensureSettings(){
  if(!storage)return;
  for(const key of Object.keys(DEFAULTS)){
    if(storage[key]==null || !Number.isFinite(Number(storage[key]))){
      storage[key]=DEFAULTS[key];
    }else{
      storage[key]=clampNumber(storage[key],key);
    }
  }
}

function cfg(){
  return {
    width:clampNumber(storage?.width,"width"),
    height:clampNumber(storage?.height,"height"),
    fontSize:clampNumber(storage?.fontSize,"fontSize"),
    iconSize:clampNumber(storage?.iconSize,"iconSize"),
    padding:clampNumber(storage?.padding,"padding")
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

function afterGuildRender(args,ret){
  try{
    const props=args?.[0];
    const guild=getGuild(props?.guildId);
    if(!guild)return;

    const React=ReactObj();
    const R=RN();
    if(!React || !R?.View)return;

    const c=cfg();
    const touchHeight=c.height+(c.padding*2);

    if(!successShown){
      successShown=true;
      setTimeout(()=>toast(`Server Names ${VERSION}: guild rows active.`),200);
    }

    return React.createElement(
      R.View,
      {
        style:{
          width:c.width,
          height:touchHeight,
          position:"relative",
          alignItems:"center",
          justifyContent:"center",
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
            width:c.width,
            height:touchHeight,
            opacity:0,
            overflow:"hidden",
            zIndex:0,
            elevation:0
          }
        },
        ret
      ),

      React.createElement(
        R.View,
        {
          pointerEvents:"none",
          style:{
            position:"absolute",
            left:0,
            top:c.padding,
            width:c.width,
            height:c.height,
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

function widenedStyle(style){
  const c=cfg();
  const w=c.width+8;
  return [
    style,
    {
      width:w,
      minWidth:w,
      maxWidth:w
    }
  ];
}

function patchItemSize(original){
  const c=cfg();
  const target=c.height+(c.padding*2);

  if(typeof original==="number"){
    return target;
  }

  if(typeof original==="function"){
    // Discord's guild-bar FastList uses a precomputed item-size callback on
    // some builds. For this specific guild-list FastList, use our configured
    // compact row height consistently so its recycler geometry matches what
    // GuildsBarGuild actually renders.
    return function(){
      return target;
    };
  }

  // Current FastList accepts itemSize as number/function. If Discord changes
  // the representation, leave it untouched rather than risking the list.
  return original;
}

function isGuildFastList(props){
  if(!props || typeof props!=="object")return false;
  return (
    "sections" in props &&
    "itemSize" in props &&
    typeof props.renderItem==="function" &&
    typeof props.renderSection==="function" &&
    typeof props.getRecyclerKey==="function" &&
    ("persistantKeys" in props || "disableRecyclingOnFullCompute" in props)
  );
}

function widenElement(element){
  const React=ReactObj();
  if(!React || !element || typeof element!=="object")return element;
  try{
    return React.cloneElement(element,{
      style:widenedStyle(element.props?.style)
    });
  }catch{
    return element;
  }
}

function afterJsx(args,ret){
  try{
    const C=args?.[0];
    const props=args?.[1] ?? ret?.props ?? {};
    const name=componentName(C);

    if(name==="FastList" && isGuildFastList(props)){
      fastListPatched=true;
      const React=ReactObj();
      if(!React || !ret || typeof ret!=="object")return;

      return React.cloneElement(ret,{
        itemSize:patchItemSize(props.itemSize),
        style:widenedStyle(props.style)
      });
    }

    if(name==="GuildsOnly"){
      const React=ReactObj();
      if(!React || !ret || typeof ret!=="object")return;
      return React.cloneElement(ret,{
        style:widenedStyle(props.style)
      });
    }

    if(name==="NavigationContent"){
      navPatched=true;
      const React=ReactObj();
      if(!React || !ret || typeof ret!=="object")return;

      const originalRender=props.render;
      const nextProps={
        style:widenedStyle(props.style)
      };

      // NavigationContent owns the outer content slot on this Discord build.
      // If it renders its child through a render prop, widen that returned root
      // too so a stock-width parent does not clip the guild list.
      if(typeof originalRender==="function"){
        nextProps.render=function(){
          return widenElement(originalRender.apply(this,arguments));
        };
      }

      return React.cloneElement(ret,nextProps);
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
  const c=cfg();
  const touchHeight=c.height+(2*c.padding);

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
      `Touch target: ${touchHeight}px tall. Sidebar target width: ${c.width+8}px. Fully reload Discord after layout changes so FastList recomputes virtualization.`
    ),

    React.createElement(NumericSetting,{key:"w"+c.width,label:"Width",settingKey:"width",suffix:" px"}),
    React.createElement(NumericSetting,{key:"h"+c.height,label:"Height",settingKey:"height",suffix:" px"}),
    React.createElement(NumericSetting,{key:"f"+c.fontSize,label:"Font size",settingKey:"fontSize",suffix:" px"}),
    React.createElement(NumericSetting,{key:"i"+c.iconSize,label:"Icon size",settingKey:"iconSize",suffix:" px"}),
    React.createElement(NumericSetting,{key:"p"+c.padding,label:"Vertical padding",settingKey:"padding",suffix:" px"}),

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

  const c=cfg();
  toast(
    `Server Names ${VERSION}: ${c.width}×${c.height}, `+
    `touch ${c.height+c.padding*2}px. Fully reload if just updated.`
  );

  // One delayed status toast without any private data.
  setTimeout(()=>{
    toast(
      `Server Names layout hooks: FastList ${fastListPatched?"yes":"not seen yet"}, `+
      `NavigationContent ${navPatched?"yes":"not seen yet"}.`
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
  fastListPatched=false;
  navPatched=false;
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