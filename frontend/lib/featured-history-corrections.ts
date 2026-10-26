/** User-reported corrections are separate from immutable saved selections.
 * Identity and final TD: official game 401873018, player 2576925.
 * Original featured designation, sportsbook, odds and timestamp remain unverified.
 */
export function reportedFeaturedOriginal(sport:string,day:string,key:string){
 if(sport!=='nfl'||day!=='2026-10-25'||key!=='long')return null;
 return {playerId:'2576925',playerName:'Darren Waller',teamName:'Carolina Panthers',gameId:'401873018',gameTime:'2026-10-25T17:00:00Z',market:'anytime_td',prediction:'YES',sportsbookLine:0.5,originalOdds:null,originalSportsbook:null,selectedAt:null,selectionSource:'user_reported_correction',originalSelectionVerified:false,officialTouchdowns:1,
 note:'Original reported by Sach · saved featured selection and original odds not yet recovered.',resultNote:'Official final: 1 touchdown. Excluded from verified performance totals until the original selection is authenticated.'};
}
