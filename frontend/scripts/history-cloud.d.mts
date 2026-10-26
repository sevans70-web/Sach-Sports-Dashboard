export function canonical(value:any):string;
export function checksum(value:any):string;
export function cloudConfigured():boolean;
export function cloudRequest(route:string,options?:any):Promise<any>;
export function saveCloudDocument(sport:string,stream:string,day:string,payload:any,bytes?:number,sourceUpdatedAt?:string):Promise<boolean>;
export function readCloudDocument(sport:string,stream:string,day:string):Promise<any>;
export function listCloudDocuments(sport:string):Promise<any[]>;

export function readCloudDocumentsForDay(sport:string,streams:string[],day:string):Promise<any[]>;
export function listCloudPerformanceDocuments(sport:string):Promise<{rows:any[];errors:string[]}>;
export function readCloudDocumentRange(sport:string,stream:string,first:string,last:string):Promise<any[]>;
