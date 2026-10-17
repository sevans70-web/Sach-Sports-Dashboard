type Photo = {ready:boolean; image:HTMLImageElement; promise:Promise<boolean>};
const photos = new Map<string,Photo>();

export function prepareRankingImage(url:string,timeoutMs=1800):Promise<boolean>{
  if (!url || typeof Image === "undefined") return Promise.resolve(false);
  const cached = photos.get(url);
  if (cached) return cached.promise;
  const image = new Image();
  const entry:Photo = {ready:false,image,promise:Promise.resolve(false)};
  entry.promise = new Promise(resolve=>{
    let done=false;
    const finish=(ready:boolean)=>{
      if(done)return;done=true;clearTimeout(timer);entry.ready=ready;
      if(!ready)photos.delete(url);
      resolve(ready);
    };
    const timer=setTimeout(()=>finish(false),timeoutMs);
    image.onload=()=>{Promise.resolve(image.decode?.()).then(()=>finish(true),()=>finish(image.naturalWidth>0));};
    image.onerror=()=>finish(false);
    image.src=url;
  });
  if(photos.size>=200)photos.delete(photos.keys().next().value!);
  photos.set(url,entry);
  return entry.promise;
}

/** Publish a category once its photos are decoded. A failed image becomes a
 * stable initials avatar rather than an empty image that appears later. */
export async function stageRankingImages<T extends {headshot:string;teamLogo:string}>(cards:T[],timeoutMs=1800):Promise<T[]>{
  const ordered=[...cards].sort((a:any,b:any)=>Number(a.gameState==='post')-Number(b.gameState==='post'));
  const urls=[...new Set(ordered.flatMap(card=>[card.headshot,card.teamLogo]).filter(Boolean))];
  const ready=new Map(await Promise.all(urls.map(async url=>[url,await prepareRankingImage(url,timeoutMs)] as const)));
  return cards.map(card=>({...card,headshot:ready.get(card.headshot)?card.headshot:"",teamLogo:ready.get(card.teamLogo)?card.teamLogo:""}));
}
