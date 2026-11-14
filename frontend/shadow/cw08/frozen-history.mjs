/** Build-time provenance only. A shallow manual checkout must contain the exact
 * historic objects before the existing byte-for-byte artifact guard can run. */
import {execFileSync} from 'node:child_process';
export const frozenCommits=Object.freeze([
 '007c02ba5a061def47d290fe599de337bea73061',
 '396af7437e725b186fa13614adfbf1bfa7f8a695',
 '27324da5795ce8255406a8951e6ea39b6b26b61b',
]);
export function ensureFrozenHistory(repo,commits=frozenCommits){
 if(!commits.every(c=>/^[a-f0-9]{40}$/.test(c)))throw Error('Full pinned frozen commit IDs required');
 const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const head=git(['rev-parse','HEAD']).trim(),fetched=[];
 for(const commit of new Set(commits)){
  try{git(['cat-file','-e',commit+'^{commit}']);continue;}catch{}
  try{git(['fetch','--no-tags','--no-write-fetch-head','--depth=1','origin',commit]);git(['cat-file','-e',commit+'^{commit}']);}catch{throw Error('Frozen reference unavailable: '+commit);}
  fetched.push(commit);
 }
 if(git(['rev-parse','HEAD']).trim()!==head)throw Error('Checkout changed while preparing frozen history');
 return {head,fetched};
}
