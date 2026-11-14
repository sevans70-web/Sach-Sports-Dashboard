"""Independent official game-log cross-check of the bulk Stats REST records."""
import gzip,json,pathlib,subprocess,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'model-research/cw08-nhl-expanded'
rows=json.loads(gzip.decompress((OUT/'player-games.json.gz').read_bytes()));receipts=[];responses=[]
for season in sorted({r['season'] for r in rows}):
    ids=sorted({r['playerId'] for r in rows if r['season']==season},key=lambda p:hashlib.sha256(str(p).encode()).hexdigest())[:2]
    for player in ids:
        url=f'https://api-web.nhle.com/v1/player/{player}/game-log/{season}/2'
        raw=subprocess.run(['curl','-fSs','--max-time','60','--retry','2',url],check=True,capture_output=True).stdout
        payload=json.loads(raw);games={g['gameId']:g for g in payload['gameLog']}
        sample=[r for r in rows if r['season']==season and r['playerId']==player]
        for r in sample:
            g=games[r['gameId']]
            assert g['goals']==r['goals'] and g['assists']==r['assists']
            assert g['teamAbbrev']==r['teamAbbrev'] and g['opponentAbbrev']==r['opponentTeamAbbrev']
            assert g['gameDate']==r['gameDate']
            minute,second=map(int,g['toi'].split(':'));assert abs(minute*60+second-r['timeOnIcePerGame'])<1e-6
        receipt={'season':season,'playerId':player,'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'matchedGames':len(sample)}
        receipts.append(receipt);responses.append({'receipt':receipt,'payload':payload});print(season,player,len(sample),flush=True)
(OUT/'gamelog-crosschecks.json.gz').write_bytes(gzip.compress(json.dumps(responses,separators=(',',':')).encode(),mtime=0))
(OUT/'source-crosscheck.json').write_text(json.dumps({'method':'Deterministic hash-selected two skaters per season; official Stats REST versus official player game logs','checks':['goals','assists','team','opponent','date','ice-time seconds versus MM:SS'],'matchedGames':sum(r['matchedGames'] for r in receipts),'receipts':receipts},indent=2)+'\n')
