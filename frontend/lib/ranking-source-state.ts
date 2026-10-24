/** An available but empty board is distinct from a failed provider. */
export function rankingSourceState(rowCount:number,providerError?:string|null){
 const empty=rowCount===0&&!providerError;
 return {success:rowCount>0||!providerError,empty,message:empty?'No Qualified Picks':undefined,error:rowCount>0?undefined:providerError||undefined};
}
