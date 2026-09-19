/**
 * Active-slate rollover rule.
 *
 * A sport does NOT roll to a new calendar date at midnight while a game from
 * the previous slate is still live.  The previous slate remains authoritative
 * until every game has reached a terminal state.
 */
export type SlateGameLike = {
  date?: string | null;
  gameDate?: string | null;
  tipoff?: string | null;
  state?: string | null;
  statusGroup?: string | null;
  isLive?: boolean | null;
  isFinal?: boolean | null;
  completed?: boolean | null;
};

const TZ="America/Toronto";

export function localDateKey(date=new Date(),timeZone=TZ){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
}

export function previousDateKey(day:string){
  const [y,m,d]=day.split("-").map(Number);
  const x=new Date(Date.UTC(y,m-1,d,12));
  x.setUTCDate(x.getUTCDate()-1);
  return x.toISOString().slice(0,10);
}

export function isLiveSlateGame(game:SlateGameLike){
  const state=String(game.state||game.statusGroup||"").toLowerCase();
  return Boolean(game.isLive)||state==="in"||state==="live";
}

export function isFinalSlateGame(game:SlateGameLike){
  const state=String(game.state||game.statusGroup||"").toLowerCase();
  return Boolean(game.completed)||Boolean(game.isFinal)||state==="post"||state==="final"||state==="closed";
}

/**
 * Call this with the previous calendar day's schedule.  If ANY previous-slate
 * game is still live, return yesterday. Otherwise return today.
 */
export function activeSlateDate(previousSlateGames:SlateGameLike[],now=new Date(),timeZone=TZ){
  const today=localDateKey(now,timeZone);
  const yesterday=previousDateKey(today);
  return previousSlateGames.some(isLiveSlateGame)?yesterday:today;
}

/**
 * Use for UI movement/snapshot keys. Rankings stay attached to the active slate,
 * so midnight alone cannot turn the entire ranking into NEW.
 */
export function slateSnapshotKey(sport:string,slateDate:string,market:string){
  return `${sport.toLowerCase()}|${slateDate}|${market}`;
}
