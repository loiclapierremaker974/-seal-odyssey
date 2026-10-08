const BASE_URL=import.meta.env?.BASE_URL||'/';
const SHORT_NAMES={rivage:'Aelys',lagune:'Murmures',ruines:'Site Ancien'};
let navigators=0,ownsBodyClass=false;
function assetURL(path){if(!path)return '';const value=String(path);if(/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(value))return value;return BASE_URL.replace(/\/?$/,'/')+value.replace(/^\.\//,'');}
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
/** The world owns travel and selection. Clicking requests travel without changing it. */
export class IslandNavigator{
 constructor({mount=document.body,islands=[],onTravel=null}={}){
  if(!mount||typeof mount.append!=='function')throw new TypeError('IslandNavigator requires a DOM mount.');
  if(!Array.isArray(islands)||!islands.length)throw new TypeError('IslandNavigator requires island definitions.');
  Object.assign(this,{onTravel,currentIsland:null,echoIds:new Set(),siteRestored:false,busy:false,visible:false,destroyed:false,abortController:new AbortController(),islands:new Map(),buttons:new Map()});
  for(const i of islands){
   if(!i?.id||this.islands.has(String(i.id)))throw new TypeError('Island ids must be nonempty and unique.');
   const id=String(i.id);this.islands.set(id,{id,name:String(i.name||id),shortName:String(i.shortName||SHORT_NAMES[id]||i.name||id),kicker:String(i.kicker||'Exploration d’Aqualys'),travelLabel:i.travelLabel?String(i.travelLabel):null,image:assetURL(i.image||i.texture),echoIds:(Array.isArray(i.echoes)?i.echoes:[]).map(e=>typeof e==='string'?e:e?.id).filter(id=>id!=null).map(String),hasSite:Boolean(i.site)});
  }
  const element=node('nav','island-navigator');element.dataset.islandNavigation='';element.setAttribute('aria-label','Voyager entre les îles d’Aqualys');element.hidden=true;element.inert=true;this.element=element;
  const heading=node('div','island-navigator__heading');this.kicker=node('span','island-navigator__kicker','Les îles d’Aqualys');this.title=node('h2','island-navigator__title','Choisir une île');heading.append(this.kicker,this.title);
  this.list=node('div','island-navigator__routes');this.list.setAttribute('aria-busy','false');this.live=node('p','sr-only');this.live.setAttribute('role','status');this.live.setAttribute('aria-live','polite');this.live.setAttribute('aria-atomic','true');
  for(const i of this.islands.values()){
   const button=node('button','island-route');button.type='button';button.dataset.travel=i.id;const portrait=node('span','island-route__portrait');portrait.setAttribute('aria-hidden','true');
   const glyphs={rivage:'<path d="M3 15c4-5 6 5 10 0s6 5 10 0M4 20c4-4 6 4 10 0s5 4 8 0"/><circle cx="18" cy="6" r="3"/>',lagune:'<path d="M13 22V11M13 15C4 15 3 8 4 4c8 0 10 6 9 11ZM13 18c9 0 10-7 9-11-8 0-10 6-9 11Z"/>',ruines:'<path d="M4 22V10a9 9 0 0 1 18 0v12M9 22V10a4 4 0 0 1 8 0v12M2 22h9m4 0h9"/>'};
   portrait.innerHTML='<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+(glyphs[i.id]||glyphs.rivage)+'</svg>';
   const copy=node('span','island-route__copy'),name=node('span','island-route__name',i.shortName),status=node('span','island-route__status');copy.append(name,status);
   const marker=node('span','island-route__marker');marker.setAttribute('aria-hidden','true');button.append(portrait,copy,marker);
   button.addEventListener('click',()=>this.requestTravel(i.id),{signal:this.abortController.signal});this.buttons.set(i.id,{button,status});this.list.append(button);
  }
  element.append(heading,this.list,this.live);mount.append(element);
  if(navigators===0){ownsBodyClass=!document.body.classList.contains('island-exploration');document.body.classList.add('island-exploration');}navigators++;this.refresh();
 }
 requestTravel(id){
  if(this.destroyed||!this.visible||this.busy||id===this.currentIsland||!this.islands.has(id)||typeof this.onTravel!=='function')return;this.live.textContent='';
  try{const result=this.onTravel(id);if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{if(!this.destroyed)this.live.textContent='Le voyage n’a pas abouti.';});}catch{this.live.textContent='Le voyage n’a pas abouti.';}
 }
 setIsland(id){if(this.destroyed)return false;const i=this.islands.get(String(id));if(!i)return false;const changed=this.currentIsland!==i.id;this.currentIsland=i.id;this.element.dataset.island=i.id;this.title.textContent=i.name;this.kicker.textContent=i.kicker;this.refresh();if(changed&&this.visible)this.live.textContent=i.name+'.';return true;}
 setProgress({echoIds,siteRestored}={}){if(this.destroyed)return;if(echoIds!==undefined){const ids=Array.isArray(echoIds)||echoIds instanceof Set?echoIds:[];this.echoIds=new Set(Array.from(ids,String));}if(siteRestored!==undefined)this.siteRestored=Boolean(siteRestored);this.refresh();}
 refresh(){for(const i of this.islands.values()){
  const {button,status}=this.buttons.get(i.id),current=this.currentIsland===i.id,found=i.echoIds.filter(id=>this.echoIds.has(id)).length,complete=i.echoIds.length>0&&found===i.echoIds.length,restored=i.hasSite&&this.siteRestored;
  let summary=current?'Vous êtes ici':'À explorer';if(i.echoIds.length>1)summary=found+'/'+i.echoIds.length+' Échos';else if(complete)summary='Écho retrouvé';if(restored)summary='Site réveillé';
  status.textContent=summary;button.classList.toggle('is-current',current);button.classList.toggle('is-complete',complete||restored);button.dataset.current=String(current);button.dataset.complete=String(complete||restored);
  if(current)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
  button.setAttribute('aria-label',(i.travelLabel||'Voyager vers '+i.name)+'. '+summary+'.');button.disabled=this.busy;
 }}
 setVisible(visible){if(this.destroyed)return;this.visible=Boolean(visible);this.element.hidden=!this.visible;this.element.inert=!this.visible;}
 setBusy(busy){if(this.destroyed)return;this.busy=Boolean(busy);this.element.dataset.busy=String(this.busy);this.list.setAttribute('aria-busy',String(this.busy));this.refresh();}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.abortController.abort();this.element.remove();this.buttons.clear();this.islands.clear();navigators=Math.max(0,navigators-1);if(navigators===0&&ownsBodyClass){document.body.classList.remove('island-exploration');ownsBodyClass=false;}}
}
export default IslandNavigator;
