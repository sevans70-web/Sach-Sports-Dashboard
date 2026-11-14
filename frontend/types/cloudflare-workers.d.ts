/** Only the binding surface consumed by this app. Values are narrowed by readers;
 * declaring unknown prevents accidental assumptions about secrets or KV bindings.
 * This declaration does not load or polyfill the Workers runtime in Node. */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
