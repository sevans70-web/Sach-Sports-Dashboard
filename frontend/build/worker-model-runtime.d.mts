import type {Plugin} from 'vite';
export function partitionModelRuntime(root:string):Record<string,{bytes:string;sha256:string}>;
export function workerModelRuntimePlugin():Plugin;
