export function drivePerformanceConfigured():boolean;
export function listDrivePerformanceDocuments(sport:string,firstDay?:string,projectSnapshot?:(sport:string,stream:string,day:string,snapshot:any)=>any[],lastDay?:string,fullSeason?:boolean):Promise<{rows:any[];errors:string[]}>;
