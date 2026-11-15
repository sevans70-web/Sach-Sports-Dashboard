// Framework adapter only: business routes, sources, models and job code are real.
import {AsyncLocalStorage} from 'node:async_hooks';
const requests=new AsyncLocalStorage();
export class NextRequest extends Request{get nextUrl(){return new URL(this.url)}}
export const NextResponse=Response;
export function after(work){const context=requests.getStore();if(!context)throw Error('No request context');context.waitUntil(Promise.resolve().then(work));}
export function withinRequest(context,work){return requests.run(context,work)}
