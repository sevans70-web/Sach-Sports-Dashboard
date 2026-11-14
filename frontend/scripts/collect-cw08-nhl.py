"""Read-only official NHL regular-season player-game census; resumable raw receipts."""
import datetime as dt, gzip, hashlib, json, pathlib, subprocess, urllib.parse, concurrent.futures, os
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'model-research/cw08-nhl-expanded'
CACHE=pathlib.Path(os.environ.get('CW08_WORK_DIR',str(ROOT.parent/'work/cw08-nhl-expanded')))/'raw';CACHE.mkdir(parents=True,exist_ok=True)
protocol=json.loads((OUT/'protocol.json').read_text());cutoff=dt.date.fromisoformat(protocol['collectionCutoff'])
def fetch(job):
    season,start,end=job
    params={'isAggregate':'false','isGame':'true','start':0,'limit':-1,
      'cayenneExp':f'seasonId={season} and gameTypeId=2 and gameDate>="{start}" and gameDate<"{end}"',
      'sort':json.dumps([{'property':'gameId','direction':'ASC'},{'property':'playerId','direction':'ASC'}],separators=(',',':'))}
    url='https://api.nhle.com/stats/rest/en/skater/summary?'+urllib.parse.urlencode(params)
    path=CACHE/f'{season}-{start}-all.json.gz'
    if path.exists(): raw=gzip.decompress(path.read_bytes())
    else:
      result=subprocess.run(['curl','-fSs','--max-time','60','--retry','2',url],capture_output=True,check=True)
      raw=result.stdout;json.loads(raw);path.write_bytes(gzip.compress(raw,mtime=0))
    payload=json.loads(raw);data=payload['data']
    if len(data)>=10000 or payload.get('total')!=len(data):raise ValueError(f'Truncated {start}: {len(data)} / {payload.get("total")}')
    receipt={'season':season,'from':str(start),'before':str(end),'url':url,'rows':len(data),'sha256':hashlib.sha256(raw).hexdigest(),'retrievedAt':dt.datetime.fromtimestamp(path.stat().st_mtime,dt.timezone.utc).isoformat()}
    return receipt,[dict(r,season=str(season)) for r in data]
jobs=[]
for season in protocol['collectionSeasons']:
    year=season//10000
    for month in range(10,17):
      y=year+(month-1)//12;m=(month-1)%12+1;start=dt.date(y,m,1);end=dt.date(y+int(m==12),m%12+1,1)
      if start<=cutoff:jobs.append((season,start,end))
receipts=[];rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for receipt,data in pool.map(fetch,jobs):
    receipts.append(receipt);rows.extend(data);print(receipt['season'],receipt['from'],receipt['rows'],flush=True)
seen=set();clean=[]
for r in rows:
    if r['gameDate']>str(cutoff):continue
    key=(r['gameId'],r['playerId'])
    if key in seen:raise ValueError(f'Duplicate game/player {key}')
    seen.add(key)
    if not str(r['gameId']).startswith(r['season'][:4]+'02'):raise ValueError('Unexpected season/type')
    if r['gamesPlayed']!=1:raise ValueError('Not a player-game record')
    if any(not isinstance(r.get(k),(float,int)) or r[k]<0 for k in ['goals','assists','timeOnIcePerGame']):raise ValueError('Missing or invalid observation')
    clean.append({k:r[k] for k in ['season','gameId','gameDate','playerId','skaterFullName','teamAbbrev','opponentTeamAbbrev','homeRoad','positionCode','goals','assists','timeOnIcePerGame']})
clean.sort(key=lambda r:(r['gameDate'],r['gameId'],r['playerId']))
raw=json.dumps(clean,separators=(',',':')).encode();compressed=gzip.compress(raw,mtime=0)
(OUT/'player-games.json.gz').write_bytes(compressed)
manifest={'protocolSha256':hashlib.sha256((OUT/'protocol.json').read_bytes()).hexdigest(),'source':'Official NHL Stats REST skater/summary','recordSha256':hashlib.sha256(raw).hexdigest(),'compressedSha256':hashlib.sha256(compressed).hexdigest(),'rows':len(clean),'players':len({r['playerId'] for r in clean}),'timeOnIceUnit':'seconds (converted to minutes only when making features)','limitations':['Retrospectively revised official results, not frozen historical publication vintages.','Appeared skaters only; absent/DNP players are not observations.','The regular-season windows are October through April; postseason excluded.'],'receipts':receipts}
(OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('COMPLETE',len(clean),manifest['players'],flush=True)
