import json,time,os,datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
p=Path('/workspace/work/nba-fresh-recovery-2026-11-21');athlete=json.load(open(p/'team-2-roster.json'))['athletes'][0]['id'];results=[]
paths=['/api/game-slate-detail?sport=nba&gameId=401910028','/api/game-slate-detail?sport=nba&gameId=401910015','/api/player-card-context?sport=nba&id='+athlete+'&team=BOS&before=2026-11-22T03%3A00%3A00Z']
if os.environ.get('MARKET_ONLY'):paths=['/api/market-coverage?sport=nba&mode=feed-sample']
with sync_playwright() as pl:
 proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY');b=pl.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],**({'proxy':{'server':proxy}} if proxy else {}));page=b.new_page()
 for i,path in enumerate(paths):
  at=datetime.datetime.now(datetime.timezone.utc).isoformat();tick=time.monotonic()
  try:
   r=page.goto('https://sach-sports-cloudflare-test.sevans70.workers.dev'+path,wait_until='domcontentloaded',timeout=30000);body=json.loads(page.locator('body').inner_text());(p/(('cloudflare-market-sample' if os.environ.get('MARKET_ONLY') else 'cloudflare-response-'+str(i))+'.json')).write_text(json.dumps(body));results.append({'path':path,'at':at,'status':r.status,'seconds':round(time.monotonic()-tick,3),'success':body.get('success'),'error':body.get('error'),'teams':len(body.get('rosters',[])),'players':sum(len(t.get('players',[]))for t in body.get('rosters',[])),'games':len(body.get('games',[]))})
  except Exception as e:results.append({'path':path,'at':at,'error':str(e)});break
 b.close()
(p/'cloudflare-market-results.json' if os.environ.get('MARKET_ONLY') else 'cloudflare-readonly-results.json').write_text(json.dumps({'scope':'Actual production fallback read-only GET routes; no preview, deployment or history/capture endpoint; TLS verification enabled','results':results},indent=2));print(json.dumps(results))
