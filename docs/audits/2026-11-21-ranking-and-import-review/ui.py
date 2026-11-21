import os,json,time,re,sys,hashlib
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
out=Path('/workspace/work/sach-ranking-audit-2026-11-21');mode=sys.argv[1];base='https://sach-sports-cloudflare-test.sevans70.workers.dev' if mode=='live' else 'http://localhost:3001';reg=json.loads((out/'markets.json').read_text());fixturesPath=out/'context-fixtures.json';fixtures=json.loads(fixturesPath.read_text()) if fixturesPath.exists() else {};report={'mode':mode,'scope':'Actual live production UI; read-only auxiliary history/settlement calls suppressed' if mode=='live' else 'Local candidate UI with recorded real November21 API boards and declared18:17snapshot clock. Not production acceptance.','viewports':{},'errors':[],'hydrationErrors':[],'suppressed':[],'apiStatuses':[],'historyRequests':[]}
clean=lambda s:re.sub('[^a-z0-9]','',re.sub(r'[0-9]\ufe0f?\u20e3','',s.lower()));aliases={'passing_interceptions':'Interceptions','passing_rushing_yards':'Pass + Rush Yards','rushing_receiving_yards':'Rush + Receiving'}
with sync_playwright() as p:
 proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY');browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],**({'proxy':{'server':proxy}} if proxy and mode=='live' else {}))
 for view,size in [('desktop',{'width':1440,'height':1100}),('mobile',{'width':390,'height':844})]:
  if os.environ.get('AUDIT_VIEW') and os.environ['AUDIT_VIEW']!=view:continue
  context=browser.new_context(viewport=size,timezone_id='America/Toronto');page=context.new_page()
  if mode!='live':page.clock.install(time=__import__('datetime').datetime.fromisoformat('2026-11-21T18:17:00+00:00'))
  page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['hydrationErrors'].append(m.text) if m.type=='error' and ('hydrat' in m.text.lower() or 'Minified React error' in m.text) else None)
  def intercept(route):
   u=urlparse(route.request.url);q=parse_qs(u.query);path=u.path
   if '/player/' in path and path.endswith('/history'):report['historyRequests'].append({'viewport':view,'url':path+'?'+u.query})
   if mode=='live':
    if path.endswith('/rankings') or path.endswith('/dashboard-summary') or path.endswith('/schedule') or path=='/api/game-slate':route.continue_();return
   else:
    if path.endswith('/rankings'):
     sport=path.split('/')[2];market=q.get('market',['points'])[0];f=out/(sport+'-'+market+'.json')
     if f.exists():route.fulfill(status=200,content_type='application/json',body=f.read_text());return
    key=path+'?sport='+q.get('sport',[''])[0]
    if key in fixtures:route.fulfill(status=200,content_type='application/json',body=json.dumps(fixtures[key]));return
   report['suppressed'].append(path);route.fulfill(status=503,content_type='application/json',body=json.dumps({'success':False,'error':'Auxiliary endpoint omitted by the read-only audit','rows':[],'points':[]}))
  page.route('**/api/**',intercept)
  def observe(response):
   u=urlparse(response.url)
   if '/api/' not in u.path:return
   report['apiStatuses'].append({'path':u.path,'status':response.status})
   if mode=='live' and response.status==200 and (u.path.endswith('/dashboard-summary') or u.path.endswith('/schedule') or u.path=='/api/game-slate'):
    try:fixtures[u.path+'?sport='+parse_qs(u.query).get('sport',[''])[0]]=response.json();fixturesPath.write_text(json.dumps(fixtures))
    except:pass
  page.on('response',observe);report['viewports'][view]={}
  for sport in ([os.environ['AUDIT_SPORT']] if os.environ.get('AUDIT_SPORT') else reg):
   try:
    t=time.monotonic();response=page.goto(base+'/'+sport,wait_until='domcontentloaded',timeout=90000);
    if sport=='nfl':
     day=page.locator('[aria-label="NFL game day"]').get_by_role('button',name='Sun, Nov 22',exact=True);day.wait_for(timeout=60000);day.click();page.wait_for_timeout(250)
    group=page.get_by_role('group',name=sport.upper()+' player prop markets');group.wait_for(timeout=60000);buttons=group.get_by_role('button');labels=buttons.all_text_contents();bylabel={clean(aliases.get(e['key'],e['label'])):e['key'] for e in reg[sport]};checks=[]
    for i,label in enumerate(labels):
     expected=bylabel.get(clean(label));tick=time.monotonic()
     try:
      buttons.nth(i).click(timeout=10000)
      for wait in range(100):
       busy=page.locator('section.rankings [aria-busy]').first.get_attribute('aria-busy');cards=page.locator('section.rankings article');ids=cards.evaluate_all('es=>es.map(e=>e.dataset.rankingMarket)')
       if busy=='false' and all(x==expected for x in ids):break
       page.wait_for_timeout(150)
      more=page.get_by_role('button',name='View All Rankings',exact=True)
      if more.count():more.click();page.wait_for_timeout(100)
      articles=page.locator('section.rankings article').evaluate_all('es=>es.map(e=>({market:e.dataset.rankingMarket,player:e.dataset.rankingPlayer,text:e.innerText,link:e.querySelector("a[href*=player]")?.getAttribute("href"),ev:e.querySelector("[data-ev-status]")?.dataset.evStatus}))')
      checks.append({'label':label,'expectedMarket':expected,'cards':articles,'count':len(articles),'ready':busy=='false','allMarketsMatch':all(c['market']==expected for c in articles),'seconds':round(time.monotonic()-tick,3),'notice':page.locator('section.rankings').inner_text()[-850:],'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')})
     except Exception as e:checks.append({'label':label,'error':str(e)})
     (out/(mode+('-'+os.environ['AUDIT_SPORT'] if os.environ.get('AUDIT_SPORT') else '')+('-'+os.environ['AUDIT_VIEW'] if os.environ.get('AUDIT_VIEW') else '')+'-ui.json')).write_text(json.dumps(report,indent=2));print(mode,view,sport,label,checks[-1].get('count'),flush=True)
    report['viewports'][view][sport]={'http':response.status,'categories':checks,'initialSeconds':round(time.monotonic()-t,3),'declaredCategories':len(reg[sport])};page.screenshot(path=str(out/(mode+'-'+view+'-'+sport+'.png')),full_page=True)
   except Exception as e:report['viewports'][view][sport]={'error':str(e)};print(mode,view,sport,'ERROR',str(e),flush=True)
   (out/(mode+('-'+os.environ['AUDIT_SPORT'] if os.environ.get('AUDIT_SPORT') else '')+('-'+os.environ['AUDIT_VIEW'] if os.environ.get('AUDIT_VIEW') else '')+'-ui.json')).write_text(json.dumps(report,indent=2))
  context.close()
 browser.close()
(out/(mode+('-'+os.environ['AUDIT_SPORT'] if os.environ.get('AUDIT_SPORT') else '')+('-'+os.environ['AUDIT_VIEW'] if os.environ.get('AUDIT_VIEW') else '')+'-ui.json')).write_text(json.dumps(report,indent=2))
