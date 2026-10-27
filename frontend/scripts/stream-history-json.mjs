/** Parse a JSON array one object at a time, including escaped strings and nested
 * objects. Yield between chunks so archive reads cannot monopolize Node. */
export async function visitJsonObjects(source,visit){
 let text='',depth=0,inString=false,escaped=false,started=false,root='',expect='value',ended=false;
 for await(const chunk of source){
  for(const char of chunk){
   if(!started){
    if(/\s/.test(char))continue;if(ended)throw Error('Unexpected archive trailing data');
    if(!root){if(char==='['){root='array';continue;}if(char!=='{')throw Error('Invalid archive root');root='object';}
    else if(root==='array'){
     if(char===']'&&expect!=='required'){ended=true;continue;}
     if(char===','&&expect==='separator'){expect='required';continue;}
     if(char!=='{'||expect==='separator')throw Error('Invalid archive array');
    }
    started=true;depth=1;text='{';continue;
   }
   text+=char;
   if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;}
   else if(char==='"')inString=true;else if(char==='{')depth++;else if(char==='}')depth--;
   if(depth===0){visit(JSON.parse(text));text='';started=false;expect='separator';if(root==='object')ended=true;}
   if(text.length>32*1024*1024)throw Error('Archive object exceeds safe read size');
  }
  await new Promise(resolve=>setImmediate(resolve));
 }
 if(started||!ended)throw Error('Incomplete archive object');
}
