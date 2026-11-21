import json,re,datetime
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
out=Path('/workspace/work/nba-seven-market-verification-2026-11-21');expected=json.load(open(out/'card-expectations.json'));labels={'points':'Points','rebounds':'Rebounds','assists':'Assists','threes_made':'3-Pointers Made','pts_rebs_asts':'Points + Rebounds + Assists','pts_rebs':'Points + Rebounds','pts_asts':'Points + Assists'};report={'scope':'Local Cloudflare Vite candidate with real November17 boards at original declared snapshot clock; not current live data/production acceptance','clock':expected['clock'],'viewports':{},'pageErrors':[],'hydrationErrors':[],'historyRequests':[]};failed=False
clean=lambda x:re.sub('[^a-z0-9]','',re.sub(r'[0-9]\ufe0f?\u20e3','',x.lower()))
def short(x):return str(int(x)) if float(x).is_integer() else f'{x:.1f}'
with sync_playwright() as pl:
 browser=pl.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for view,width in [('desktop',1440),('mobile',390)]:
  context=browser.new_context(viewport={'width':width,'height':1000},timezone_id='America/Toronto');page=context.new_page();page.clock.install(time=datetime.datetime.fromisoformat(expected['clock']));page.on('pageerror',lambda e:report['pageErrors'].append(str(e)));page.on('console',lambda m:report['hydrationErrors'].append(m.text) if m.type=='error' and ('hydrat' in m.text.lower() or 'Minified React error' in m.text) else None)
  def route(r):
   u=urlparse(r.request.url);q=parse_qs(u.query)
   if '/player/'in u.path and u.path.endswith('/history'):report['historyRequests'].append(u.path)
   if u.path=='/api/nba/rankings':
    m=q.get('market',['points'])[0];f=out/'boards'/('nba-'+m+'.json')
    if failed and m=='pts_rebs':r.fulfill(status=503,content_type='application/json',body='{"success":false,"reason":"recorded_pr_failure"}');return
    if f.exists():r.fulfill(status=200,content_type='application/json',body=f.read_text());return
   if u.path in ['/api/game-slate','/api/dashboard-summary']:
    f=Path('/workspace/work/r1-approved-2026-11-17/live')/('nba-slate.json' if u.path=='/api/game-slate' else 'nba-summary.json');r.fulfill(status=200,content_type='application/json',body=f.read_text());return
   r.fulfill(status=503,content_type='application/json',body='{"success":false,"error":"Auxiliary source omitted from isolated read-only card test","rows":[],"results":[],"points":[]}')
  page.route('**/api/**',route);page.goto('http://localhost:3001/nba',wait_until='domcontentloaded',timeout=90000);group=page.get_by_role('group',name='NBA player prop markets');group.wait_for(timeout=60000);page.locator('section.rankings article').first.wait_for(timeout=60000);checks=[]
  for market,label in labels.items():
   buttons=group.get_by_role('button');i=next(i for i,n in enumerate(buttons.all_text_contents()) if clean(n)==clean(label));buttons.nth(i).click();page.wait_for_function('(m)=>{const a=[...document.querySelectorAll("section.rankings article")];return a.length>0&&a.every(e=>e.dataset.rankingMarket===m)}',arg=market,timeout=30000)
   full=page.get_by_role('button',name='View All Rankings',exact=True)
   if full.count():full.click()
   page.wait_for_timeout(200);articles=page.locator('section.rankings article').evaluate_all('es=>es.map(e=>({playerId:e.dataset.rankingPlayer,market:e.dataset.rankingMarket,text:e.innerText,ev:e.querySelector("[data-ev-status]")?.previousElementSibling?.textContent,confidence:e.querySelector("[data-confidence-status]")?.textContent,confidenceStatus:e.querySelector("[data-confidence-status]")?.dataset.confidenceStatus,metrics:[...e.querySelectorAll("[class*=faceMetrics] > div")].map(x=>({label:x.querySelector("span")?.textContent,value:x.querySelector("strong")?.textContent}))}))');byid={r['playerId']:r for r in expected['markets'][market]};assert len(articles)==25,(view,market,len(articles));assert len({a['playerId']for a in articles})==25
   for a in articles:
    e=byid[a['playerId']];assert a['market']==market;assert e['name']in a['text'];assert e['matchup']in a['text'];assert a['ev']==e['ev'],(view,market,e['name'],a['ev'],e['ev']);assert a['confidenceStatus']=='available';assert ('Model confidence: '+e['confidence']+'% '+e['side'])in a['confidence'];metrics={m['label']:m['value']for m in a['metrics']};assert metrics['Sach Projection']==short(e['projection']),(market,e['name'],metrics);assert metrics['Sach Prediction']==e['side']+' '+short(e['line']);assert ('O/U '+short(e['line']))in a['text']
   assert [a['playerId']for a in articles]==[e['playerId']for e in expected['markets'][market]],'original ranking order changed'
   overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not overflow
   checks.append({'market':market,'cards':25,'allCardsMatchedIdentityAndMarket':True,'allProjectionsLinesSidesEvAndConfidenceMatched':True,'lowestVerifiedRank':25,'negativeEvs':sum(a['ev'].startswith('-')for a in articles),'zeroFormattedEvs':sum(a['ev']=='0.0%'for a in articles),'overflow':overflow});print(view,market,len(articles),'PASS',flush=True)
  # A timed failed refresh must retain the complete original PR list and explain staleness.
  buttons=group.get_by_role('button');i=next(i for i,n in enumerate(buttons.all_text_contents())if clean(n)==clean(labels['pts_rebs']));buttons.nth(i).click();page.wait_for_function('()=>[...document.querySelectorAll("section.rankings article")].every(e=>e.dataset.rankingMarket==="pts_rebs")');more=page.get_by_role('button',name='View All Rankings',exact=True)
  if more.count():more.click()
  failed=True;page.clock.fast_forward(60000);page.wait_for_timeout(1000);assert page.locator('section.rankings article').count()==25;notice=page.locator('section.rankings').inner_text();assert 'stale'in notice.lower() or 'retained'in notice.lower();failed=False;page.locator('section.rankings').screenshot(path=str(out/('cards-'+view+'-pr.png')))
  report['viewports'][view]={'markets':checks,'pr503Recovery':{'retained':25,'staleExplained':True}};context.close();(out/'cards-browser.json').write_text(json.dumps(report,indent=2))
 browser.close()
assert not report['pageErrors'],report['pageErrors'];assert not report['hydrationErrors'],report['hydrationErrors'];assert not report['historyRequests'];(out/'cards-browser.json').write_text(json.dumps(report,indent=2));print('ALL CARDS PASS',flush=True)
