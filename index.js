(()=>{"use strict";
let unpatchers=[];
let GuildStore=null;
let seenGuildComponents=new Set();
let V=null;

const TILE_WIDTH=52;
const TILE_HEIGHT=46;
const FONT_SIZE=9;
const VERSION="0.3-diagnostic";

function api(){
  return globalThis.vendetta ?? globalThis.bunny ?? globalThis.revenge ?? null;
}

function errorText(error){
  if(error == null) return "Unknown error";
  const message = error?.message ? String(error.message) : String(error);
  const stack = error?.stack ? String(error.stack) : "";
  return stack && !stack.includes(message) ? `${message}\n\n${stack}` : (stack || message);
}

function showToast(message){
  try{
    const v=V ?? api();
    v?.ui?.toasts?.showToast?.(String(message));
  }catch(e){
    console.error("[ServerNames] toast failed:",e);
  }
}

function showDiagnosticAlert(title, content){
  const v=V ?? api();
  const text=String(content).slice(0,7000);

  try{
    const showAlert=v?.ui?.alerts?.showConfirmationAlert;
    if(typeof showAlert!=="function") throw new Error("showConfirmationAlert API unavailable");

    showAlert({
      title,
      content:text,
      confirmText:"OK",
      onConfirm:()=>{},
      secondaryConfirmText:"Copy",
      onConfirmSecondary:()=>{
        try{
          const clipboard=v?.metro?.common?.clipboard;
          const result=clipboard?.setString?.(text);
          if(result?.catch) result.catch(()=>{});
          showToast("Server Names diagnostic copied.");
        }catch(e){
          console.error("[ServerNames] copy failed:",e);
        }
      },
      isDismissable:true
    });
    return true;
  }catch(e){
    console.error("[ServerNames] alert failed:",e);
    showToast(`${title}: ${text.slice(0,240)}`);
    return false;
  }
}

function fail(stage,error){
  const details=errorText(error);
  console.error(`[ServerNames] FAILED at ${stage}:`,error);
  showToast(`Server Names failed at ${stage}: ${details.split("\n")[0]}`);
  showDiagnosticAlert(
    `Server Names startup failure`,
    `Version: ${VERSION}\nStage: ${stage}\n\n${details}`
  );
}

function ReactObj(){
  return V?.metro?.common?.React ?? globalThis.React ?? null;
}

function RN(){
  return V?.metro?.common?.ReactNative ?? globalThis.ReactNative ?? null;
}

function getComponentName(Component){
  return Component?.displayName ?? Component?.name ?? Component?.type?.displayName ?? Component?.type?.name ?? "";
}

function tryGuildById(id){
  if(!id||!GuildStore)return null;
  try{return GuildStore.getGuild?.(String(id)) ?? null;}catch{return null;}
}

function extractGuild(props){
  if(!props||typeof props!=="object")return null;

  const direct=[
    props.guild,
    props.server,
    props.item?.guild,
    props.node?.guild,
    props.guildNode?.guild
  ];

  for(const value of direct){
    if(value&&typeof value==="object"&&value.name&&value.id)return value;
  }

  const ids=[
    props.guildId,
    props.guildID,
    props.serverId,
    props.item?.guildId,
    props.node?.guildId,
    props.guildNode?.guildId,
    props.id
  ];

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
    const hasVisualProps=
      props?.size!=null ||
      props?.icon!=null ||
      props?.iconSource!=null ||
      props?.source!=null ||
      props?.animate!=null;
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
        width:TILE_WIDTH,
        height:TILE_HEIGHT,
        borderRadius:10,
        backgroundColor:"#2b2d31",
        alignItems:"center",
        justifyContent:"center",
        paddingHorizontal:3,
        paddingVertical:2
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
  let stage="initialization";

  try{
    V=api();

    stage="Revenge Classic API discovery";
    if(!V?.metro){
      throw new Error("Could not find the Revenge/Vendetta Metro API.");
    }

    showToast(`Server Names ${VERSION}: startup diagnostics running…`);

    stage="patcher discovery";
    const patcher=V.patcher ?? V.api?.patcher;
    if(!patcher || typeof patcher.after!=="function"){
      throw new Error("Could not find Revenge's patcher.after API.");
    }

    stage="React Native discovery";
    if(!ReactObj()){
      throw new Error("React was not exposed by Revenge.");
    }
    if(!RN()?.View || !RN()?.Text){
      throw new Error("React Native View/Text components were not exposed by Revenge.");
    }

    stage="GuildStore discovery";
    GuildStore=
      V.metro.findByStoreName?.("GuildStore") ??
      V.metro.findByProps?.("getGuild","getGuilds") ??
      null;

    if(!GuildStore){
      console.warn("[ServerNames] GuildStore not found; direct guild props will still be attempted.");
      showToast("Server Names warning: GuildStore not found; continuing.");
    }

    stage="Discord JSX runtime discovery";
    const jsxRuntime=
      V.metro.findByProps?.("jsx","jsxs") ??
      V.metro.findByProps?.("jsx","jsxDEV") ??
      null;

    if(!jsxRuntime){
      throw new Error(
        "Could not find Discord's JSX runtime (jsx/jsxs). " +
        "This Discord build likely needs a different guild-list patch target."
      );
    }

    stage="JSX patch installation";
    if(typeof jsxRuntime.jsx==="function"){
      unpatchers.push(patcher.after("jsx",jsxRuntime,transformJsx));
    }
    if(typeof jsxRuntime.jsxs==="function"){
      unpatchers.push(patcher.after("jsxs",jsxRuntime,transformJsx));
    }
    if(typeof jsxRuntime.jsxDEV==="function"){
      unpatchers.push(patcher.after("jsxDEV",jsxRuntime,transformJsx));
    }

    if(unpatchers.length===0){
      throw new Error("JSX runtime was found, but none of jsx/jsxs/jsxDEV was patchable.");
    }

    console.log(`[ServerNames] ${VERSION} started with ${unpatchers.length} patch(es).`);
    showToast(`Server Names ${VERSION}: startup checks passed (${unpatchers.length} patch${unpatchers.length===1?"":"es"}).`);
  }catch(error){
    fail(stage,error);
    throw error;
  }
}

function stop(){
  for(const unpatch of unpatchers.splice(0)){
    try{unpatch?.();}catch(error){console.error("[ServerNames] unpatch failed:",error);}
  }
  GuildStore=null;
  seenGuildComponents.clear();
  showToast(`Server Names ${VERSION}: stopped.`);
  V=null;
}

return {default:{onLoad:start,onUnload:stop}};
})()