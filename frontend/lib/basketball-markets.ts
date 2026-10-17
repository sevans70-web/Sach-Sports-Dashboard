const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases:Record<string,string[]>={points:["points","playerpoints"],rebounds:["rebounds","playerrebounds"],assists:["assists","playerassists"],threes_made:["threesmade","threepointersmade","threepointfieldgoalsmade","3pointersmade"],pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],pts_rebs:["ptsrebs","pointsrebounds"],pts_asts:["ptsasts","pointsassists"],rebs_asts:["rebsasts","reboundsassists"],steals:["steals"],blocks:["blocks"],first_basket:["firstbasket","firstscorer","firstpointscorer"]};
/** Period is mandatory for quarter props; never reuse full-game lines. */
export function basketballMarketMatches(prop:any,market:string){
 const quarter=market.startsWith("q1_"),base=quarter?market.slice(3):market;
 const category=norm(prop.category??prop.market??prop.statID??prop.type);
 const period=norm(prop.periodID??prop.periodId??prop.period??prop.periodName);
 const q1=["1q","q1","1stquarter","firstquarter","1"].includes(period);
 if(period&&!(quarter?q1:["game","fullgame","0"].includes(period)))return false;
 const names=aliases[base]||[];
 if(quarter)return names.some(n=>["q1"+n,n+"1q",n+"q1","1stquarter"+n,n+"firstquarter"].includes(category))||(q1&&names.includes(category));
 return names.includes(category);
}
export function verifiedNbaPrediction(row:any,market:string){
 if(row.marketBacked!==true||row.resultStatus==="void")return false;
 return market==="first_basket"?row.prediction==="FIRST BASKET"&&Number(row.modelProbability)>0:row.sportsbookLine!=null&&row.modelProjection!=null&&["OVER","UNDER"].includes(row.prediction);
}
