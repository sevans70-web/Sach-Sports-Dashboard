/** A healthy response without eligible rows is different from a feed failure.
 * Never synthesize quotes or replace an immutable saved board here. */
export function nbaEmptyMarket(market:string,feedAvailable:boolean){
 return feedAvailable?{success:true,market,rows:[],saved:false,verifiedPredictions:0,noQualifyingRows:true,source:'Current NBA feed',warning:'No qualifying rows are available for this market and slate.',updatedAt:new Date().toISOString()}:null;
}
