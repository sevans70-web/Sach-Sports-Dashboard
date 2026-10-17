import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/soccer-history.ts',import.meta.url),'utf8');
const dep=ts.transpileModule(await readFile(new URL('../lib/owls-soccer.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('@/lib/owls-soccer','data:text/javascript;base64,'+Buffer.from(dep).toString('base64'));
const {extractRosterPlayers,soccerPosition}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('ESPN goalkeeper objects and aliases enter the saves candidate pool',()=>{
 const roster=extractRosterPlayers({athletes:[{id:'1',displayName:'Test Keeper',position:{displayName:'Goalkeeper',name:'Goalkeeper',abbreviation:'G'}}]},{teamId:'1',team:'Test Club'});
 assert.equal(roster.length,1);assert.equal(roster[0].position,'GK');
 for(const name of ['G','GK','Goalkeeper','Goalie'])assert.equal(soccerPosition(name),'GK');
 assert.equal(soccerPosition('Forward'),'FORWARD');
});
