export function drivePerformanceConfigured():boolean;
export function listDrivePerformanceDocuments(sport:string,firstDay?:string,projectSnapshot?:(sport:string,stream:string,day:string,snapshot:any)=>any[]):Promise<{rows:any[];errors:string[]}>;
