import json,os,time,re,traceback,datetime
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
out=Path('/workspace/work/sach-ranking-audit-2026-11-21');markets=json.loads((out/'markets.json').read_text());base='https://sach-sports-cloudflare-test.sevans70.workers.dev'
report={'scope':'Actual production browser and same-origin API, real clock, TLS enabled, no replay','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'api':{},'browser':{},'errors':[],'consoleErrors':[]}
if (out/'live-report.json').exists(): report=json.loads((out/'live-report.json').read_text())
with sync_playwright() as p:
 proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY');browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],**({'proxy':{'server':proxy}} if proxy else {}))
 page=browser.new_page(viewport={'width':1440,'height':1100},timezone_id='America/Toronto');page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' and ('hydrat' in m.text.lower() or 'Minified React error' in m.text) else None)
 for sport,entries in markets.items():
  report['api'].setdefault(sport,{});page.goto(base+'/'+sport,wait_until='domcontentloaded',timeout=45000)
  for entry in entries:
   market=entry['key'];
   if market in report['api'][sport]:continue
   url='/api/'+sport+'/rankings?market='+market
   try:
    result=page.evaluate('''async u=>{const t=performance.now();try{const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(30000)});const body=await r.text();return {status:r.status,seconds:(performance.now()-t)/1000,body}}catch(e){return {error:String(e),seconds:(performance.now()-t)/1000}}}''',url)
    if 'body' in result:
     try:data=json.loads(result.pop('body'));(out/(sport+'-'+market+'.json')).write_text(json.dumps(data));result.update({'rows':len(data.get('rows',[])),'success':data.get('success'),'dataState':data.get('dataState'),'observedAt':data.get('observedAt'),'updatedAt':data.get('updatedAt'),'error':data.get('error'),'coverageNotice':data.get('coverageNotice'),'warnings':data.get('warnings')})
     except:result['bodyPrefix']=result.pop('body','')[:180]
    report['api'][sport][market]=result;print(sport,market,result.get('status'),result.get('rows'),round(result['seconds'],2),flush=True)
   except Exception as e:report['api'][sport][market]={'error':str(e)}
   (out/'live-report.json').write_text(json.dumps(report,indent=2))
 browser.close()
(out/'live-report.json').write_text(json.dumps(report,indent=2))
