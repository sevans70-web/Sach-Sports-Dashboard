import sqlite3,json,collections,datetime,pathlib,math,sys
assert len(sys.argv)==3,'Usage: inventory-backup.py VERIFIED_SQLITE NEW_PRIVATE_WORKDIR'
work=pathlib.Path(sys.argv[2]).resolve();repo=pathlib.Path(__file__).resolve().parents[4]
assert not work.is_relative_to(repo),'Private output must be outside the repository'
work.mkdir();db=sqlite3.connect('file:'+str(pathlib.Path(sys.argv[1]).resolve())+'?mode=ro&immutable=1',uri=True);assert db.execute('SELECT COUNT(*) FROM records').fetchone()[0]==20904;db.execute('PRAGMA query_only=ON');counts=collections.Counter();cases={};finals={};markets={'passing_yards','rushing_yards','receiving_yards','receptions'}
def ts(v):
 try:return datetime.datetime.fromisoformat(str(v).replace('Z','+00:00')).timestamp()
 except:return float('nan')
def walk(v,market,doc):
 if isinstance(v,list):
  for x in v:walk(x,market,doc)
 elif isinstance(v,dict):
  h=v.get('header')or{};comp=(h.get('competitions')or[{}])[0]
  if h.get('id')and comp.get('status',{}).get('type',{}).get('completed')is True and isinstance(v.get('boxscore'),dict):
   gid=str(h['id']);prior=finals.get(gid)
   if prior is None or ts(prior['sourceTime'])<ts(doc['source_updated_at']):finals[gid]={'sourceTime':doc['source_updated_at'],'payload':v}
  if v.get('success')is True and v.get('state')=='post' and v.get('gameId')and isinstance(v.get('rows'),list)and doc['stream'].startswith(('official_final_','protected_final_')):
   gid=str(v['gameId']);prior=finals.get(gid)
   if prior is None or ts(prior['sourceTime'])<ts(doc['source_updated_at']):finals[gid]={'sourceTime':doc['source_updated_at'],'sourceStream':doc['stream'],'payload':v}
  m=v.get('market',market);f=v.get('researchForecast')or{};p=f.get('priceComparison')or{}
  if m in markets and v.get('playerId')and v.get('gameId'):
   counts['candidateRows']+=1;ps=[p.get(k)for k in ['overProbability','underProbability','pushProbability']]
   if all(isinstance(x,(int,float))and not isinstance(x,bool)and 0<=x<=1 for x in ps)and abs(sum(ps)-1)<1e-6:
    counts['normalizedProbabilityRows']+=1;b=p.get('quoteEvidence')or{}
    mapping={'sport':'sport','market':'market','gameId':'gameId','playerId':'playerId','quoteId':'quoteId','sportsbookKey':'sportsbookKey','line':'sportsbookLine','overPrice':'overPrice','underPrice':'underPrice'}
    binding=all(str(b.get(k))==str(v.get(rowkey))for k,rowkey in mapping.items()) and v.get('lineType')=='main' and v.get('quoteMarket',m)==m and v.get('quotePeriod','game')=='game' and all(isinstance(v.get(k),(int,float))and abs(v[k])>=100 for k in ['overPrice','underPrice'])
    at=ts(f.get('calculatedAt'));start=ts(v.get('gameTime'));updated=ts(v.get('quoteUpdatedAt'));received=ts(doc.get('source_updated_at'))
    if binding and math.isfinite(at)and math.isfinite(start)and math.isfinite(updated)and updated<=at<start and at-updated<=900 and ts(b.get('calculatedAt'))==at:
     counts['quoteMatchedTimelyProbabilityRows']+=1
     if received>=at and received<start:
      counts['sourceStoredBeforeKickoffRows']+=1;k='|'.join([m,str(v['gameId']),str(v['playerId'])]);item={'market':m,'gameId':str(v['gameId']),'playerId':str(v['playerId']),'quoteId':v['quoteId'],'line':v['sportsbookLine'],'overPrice':v['overPrice'],'underPrice':v['underPrice'],'quoteUpdatedAt':v['quoteUpdatedAt'],'quoteCapturedAt':v.get('capturedAt'),'decisionAt':f['calculatedAt'],'gameTime':v['gameTime'],'sourceStoredAt':doc['source_updated_at'],'snapshotSha256':f.get('snapshotSha256'),'modelId':f.get('modelId'),'inputReceipt':f.get('inputReceipt'),'probabilities':dict(zip(['over','under','push'],ps)),'sourceStream':doc['stream']}
      if k in cases and received==ts(cases[k]['sourceStoredAt']) and (item['probabilities'],item['quoteId'],item['line'],item['inputReceipt'])!=(cases[k]['probabilities'],cases[k]['quoteId'],cases[k]['line'],cases[k]['inputReceipt']):counts['conflictingEqualFirstReceipts']+=1
      if k not in cases or received<ts(cases[k]['sourceStoredAt']):cases[k]=item
  for x in v.values():
   if isinstance(x,(dict,list)):walk(x,m,doc)
rows=0
for(s,)in db.execute("SELECT row_json FROM records WHERE table_name='history_documents' AND json_extract(row_json,'$.sport')='nfl'"):
 r=json.loads(s);rows+=1;walk(r.get('payload'),r.get('stream'),r)
public={'historyDocumentsInspected':rows,'candidateCounts':dict(counts),'uniquePregameProbabilityDecisions':len(cases),'distinctGames':len({c['gameId']for c in cases.values()}),'byMarket':dict(collections.Counter(c['market']for c in cases.values())),'withInputReceipt':sum(bool(c.get('inputReceipt'))for c in cases.values()),'officialFinalGamesAvailable':len(finals),'productionReads':0,'productionWrites':0,'backupOpenedReadOnly':True}
(work/'backup-evidence-inventory.json').write_text(json.dumps(public,indent=2)+'\n');(work/'backup-evidence-private.json').write_text(json.dumps({'cases':list(cases.values()),'finals':finals},separators=(',',':')));print(json.dumps(public));db.close()
