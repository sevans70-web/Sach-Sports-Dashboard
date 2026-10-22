/** Server-to-server captures stay on this instance, independent of proxy host
 * headers, external DNS and Railway's public routing. */
export function internalAppOrigin(port=process.env.PORT||'3000'){
 const value=Number(port);
 if(!/^\d+$/.test(port)||!Number.isInteger(value)||value<1||value>65535)throw new Error('Invalid application port');
 return `http://127.0.0.1:${value}`;
}
