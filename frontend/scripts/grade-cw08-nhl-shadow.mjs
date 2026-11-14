import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gradeNhlShadow,canonical} from './nhl-shadow-evidence.mjs';
const [receiptFile,officialFile,directory]=process.argv.slice(2);
if(!receiptFile||!officialFile||!directory)throw Error('Usage: node scripts/grade-cw08-nhl-shadow.mjs RECEIPT OFFICIAL_FINAL_JSON NEW_GRADE_DIRECTORY');
const receipt=JSON.parse(await readFile(receiptFile,'utf8')),official=JSON.parse(await readFile(officialFile,'utf8'));
const grade=gradeNhlShadow(receipt,official);await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,receipt.sha256+'.json'),canonical({...grade,official})+'\n',{flag:'wx',mode:0o444});
console.log(JSON.stringify({status:grade.status,receiptSha256:receipt.sha256,production:false}));
