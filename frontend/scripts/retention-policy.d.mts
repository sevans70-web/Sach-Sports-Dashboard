export const SPORTS:Set<string>;
export function retentionCutoff(now?:Date):string;
export function historyFileInfo(rel:string):{sport:string;day:string;stream:string;document:boolean}|null;
export function expiredHistory(rel:string,now?:Date):boolean;

export function orphanArchiveInfo(rel:string):{sport:string;day:string;stream:string;document:boolean}|null;
