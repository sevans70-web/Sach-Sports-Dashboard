import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballQuarterObservations:parse}=await loadTs(new URL('../lib/basketball-quarter-observations.ts',import.meta.url));
const at='2026-10-29T20:00Z';
function source(){
 const a=(id,name,stats)=>({athlete:{id,displayName:name},stats,didNotPlay:false,starter:id!=='bench'}),g=(team,athletes)=>({team:{id:team},statistics:[{labels:['MIN','PTS','REB','AST','3PT'],athletes}]}),play=(id,q,text,team,ids,score=0,type='Jump Shot',clock='5:00')=>({id,period:{number:q},clock:{displayValue:clock},text,team:{id:team},participants:ids.map(id=>({athlete:{id}})),type:{text:type},scoringPlay:score>0,scoreValue:score});
 return {header:{id:'g',season:{year:2026,type:2},competitions:[{date:'2026-04-01T00:00Z',status:{type:{completed:true}},competitors:[{team:{id:'A'},score:'5',linescores:[{displayValue:'3'}]},{team:{id:'B'},score:'2',linescores:[{displayValue:'2'}]}]}]},boxscore:{players:[g('A',[a('alice','Alice Smith',['30','3','1','1','1-2']),a('bench','Bench Player',['10','2','0','0','0-0']),{...a('dnp','DNP',['0','0','0','0','0-0']),didNotPlay:true}]),g('B',[a('bob','Bob Jones',['30','2','1','0','0-0'])])]},plays:[
 play('start',1,'Jump ball','A',[],0,'Jumpball','12:00'),play('a',1,'Alice Smith makes 3-pointer','A',['alice'],3),play('b',1,'Bob Jones makes layup','B',['bob'],2),play('br',1,'Bob Jones defensive rebound','B',['bob'],0,'Defensive Rebound'),play('end',1,'End of the 1st Quarter','A',[],0,'End Period','0.0'),play('c',2,'Bench Player makes layup (Alice Smith assists)','A',['bench','alice'],2),play('ar',2,'Alice Smith defensive rebound','A',['alice'],0,'Defensive Rebound')
 ]};
}
const rows=p=>parse(p,'g','official-source',at),value=(rs,id,m)=>rs.find(r=>r.playerId===id&&r.market===m)?.actual;
test('bench full-game participants receive certified Q1 zeros; DNPs stay excluded and later actions stay out',()=>{
 const rs=rows(source());assert.equal(rs.length,12);assert.equal(value(rs,'alice','q1_points'),3);assert.equal(value(rs,'bench','q1_points'),0);assert.equal(value(rs,'alice','q1_assists'),0);assert.equal(value(rs,'bob','q1_rebounds'),1);assert.equal(rs.some(r=>r.playerId==='dnp'),false);
});
test('each market reconciles full-game totals, so missing non-scoring tape cannot masquerade as a zero',()=>{
 const p=source();p.plays=p.plays.filter(x=>x.id!=='br');const rs=rows(p);assert.equal(value(rs,'bob','q1_rebounds'),undefined);assert.equal(value(rs,'bob','q1_points'),2);
 p.boxscore.players[0].statistics[0].athletes[1].stats[1]='3';assert.equal(value(rows(p),'bench','q1_points'),undefined);
});
test('team Q1/full-game score mismatch, truncated period, duplicate conflicts, wrong identity or recent game fail closed',()=>{
 for(const mutate of [p=>p.header.id='wrong',p=>p.header.competitions[0].competitors[0].linescores[0].displayValue='4',p=>p.header.competitions[0].competitors[1].score='4',p=>p.plays.shift(),p=>p.plays.splice(4,1),p=>p.plays.push({...p.plays[1],scoreValue:2}),p=>p.header.competitions[0].date='2026-10-29T00:00Z']){const p=source();mutate(p);assert.deepEqual(rows(p),[])}
});
test('identical duplicate plays are counted once and duplicate display names are withheld',()=>{
 const p=source();p.plays.push(structuredClone(p.plays[1]));assert.equal(value(rows(p),'alice','q1_points'),3);
 p.boxscore.players[0].statistics[0].athletes[1].athlete.displayName='Alice Smith';assert.deepEqual(rows(p),[]);
});
