/** Bounded diagnostics: never serialize raw provider payloads or credentials. */
export function owlsFeedSummary(payload: any) {
 const games=Array.isArray(payload?.data)?payload.data:[];
 const categories:Record<string,number>={};let props=0,books=0;
 for(const game of games)for(const book of Array.isArray(game?.books)?game.books:[]){
  books++;
  for(const prop of Array.isArray(book?.props)?book.props:[]){
   props++;
   const key=String(prop?.category??prop?.market??prop?.type??'unknown');
   // Category names only: do not reflect arbitrary provider text.
   if(/^[a-z0-9_]{1,64}$/i.test(key))categories[key]=(categories[key]||0)+1;
  }
 }
 return {games:games.length,books,props,categories,availability:props?'markets_available':'no_provider_markets'};
}
