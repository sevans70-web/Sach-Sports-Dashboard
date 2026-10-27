/** Parse a JSON array one object at a time, including escaped strings and nested
 * objects. Yield between chunks so archive reads cannot monopolize Node. */
export async function visitJsonObjects(source,visit){
 let parts=[],objectChars=0,depth=0,inString=false,escaped=false,started=false,root='',expect='value',ended=false;
 for await(const chunk of source){
  let segmentStart=started?0:-1;
  for(let i=0;i<chunk.length;i++){
   const char=chunk[i];
   if(!started){
    if(/\s/.test(char))continue;if(ended)throw Error('Unexpected archive trailing data');
    if(!root){if(char==='['){root='array';continue;}if(char!=='{')throw Error('Invalid archive root');root='object';}
    else if(root==='array'){
     if(char===']'&&expect!=='required'){ended=true;continue;}
     if(char===','&&expect==='separator'){expect='required';continue;}
     if(char!=='{'||expect==='separator')throw Error('Invalid archive array');
    }
    started=true;depth=1;segmentStart=i;continue;
   }
   if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;}
   else if(char==='"')inString=true;else if(char==='{')depth++;else if(char==='}')depth--;
   if(depth===0){
    const part=chunk.slice(segmentStart,i+1);objectChars+=part.length;if(objectChars>32*1024*1024)throw Error('Archive object exceeds safe read size');parts.push(part);
    visit(JSON.parse(parts.join('')));parts=[];objectChars=0;started=false;segmentStart=-1;expect='separator';if(root==='object')ended=true;
   }
  }
  // Retain whole slices, rather than allocating a concatenation node for every
  // character in multi-megabyte legacy snapshots.
  if(started){const part=chunk.slice(segmentStart);objectChars+=part.length;if(objectChars>32*1024*1024)throw Error('Archive object exceeds safe read size');parts.push(part);}
  await new Promise(resolve=>setImmediate(resolve));
 }
 if(started||!ended)throw Error('Incomplete archive object');
}
