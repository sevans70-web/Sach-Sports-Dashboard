export function canonical(value:any):string;
export function checksum(value:any):string;
export function cloudConfigured():boolean;
export function cloudHistoryReadOnly():boolean;
export function cloudRequest(route:string,options?:any):Promise<any>;
export function saveCloudDocument(sport:string,stream:string,day:string,payload:any,bytes?:number,sourceUpdatedAt?:string):Promise<boolean>;
export function readCloudDocument(sport:string,stream:string,day:string):Promise<any>;
export function createProtectedCloudReceipt(sport:string,stream:string,day:string,payload:unknown):Promise<Array<{savedAt:string;payload:any}>>;
export function listCloudDocuments(sport:string):Promise<any[]>;

export function readCloudDocumentsForDay(sport:string,streams:string[],day:string):Promise<any[]>;
export function listCloudPerformanceDocuments(sport:string,firstDay?:string):Promise<{rows:any[];errors:string[]}>;
export function visitCloudPerformanceDocuments(sport:string,firstDay:string,visit:(doc:{stream:string;game_date:string;payload:any;checksum:string})=>void):Promise<{documents:number;dates:string[];errors:string[]}>;
export function readCloudDocumentRange(sport:string,stream:string,first:string,last:string):Promise<any[]>;

export function cloudWriteStatus():{configured:boolean;readOnly:boolean;pendingDocuments:number;activeSaves:number;queuedSaves:number;sports:Record<string,{attempted:number;verified:number;failed:number;coalesced:number;retried:number}>};
