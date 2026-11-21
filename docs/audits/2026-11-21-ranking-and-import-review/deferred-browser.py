import json
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from datetime import datetime
from playwright.sync_api import sync_playwright
p=Path('/workspace/work/sach-ranking-audit-2026-11-21');fixtures=json.loads((p/'context-fixtures.json').read_text());reports=[]
with sync_playwright() as pl:
 browser=pl.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for view,width in [('desktop',1440),('mobile',390)]:
  ctx=browser.new_context(viewport={'width':width,'height':1000});page=ctx.new_page();ctx.clock.install(time=datetime.fromisoformat('2026-11-21T18:17:00+00:00'));history=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   u=urlparse(r.request.url);q=parse_qs(u.query)
   if '/player/' in u.path and u.path.endswith('/history'):history.append(u.path)
   key=u.path+'?sport='+q.get('sport',[''])[0]
   if u.path.endswith('/rankings'):body=json.loads((p/('nhl-'+q.get('market',['shots_on_goal'])[0]+'.json')).read_text());status=200
   elif key in fixtures:body=fixtures[key];status=200
   else:body={'success':False,'error':'Auxiliary feed omitted by offline browser verification','rows':[],'points':[]};status=503
   r.fulfill(status=status,content_type='application/json',body=json.dumps(body))
  page.route('**/api/**',route);page.goto('http://localhost:3001/nhl',wait_until='domcontentloaded');group=page.get_by_role('group',name='NHL player prop markets');group.wait_for(timeout=60000);page.locator('section.rankings article').first.wait_for(timeout=60000);page.wait_for_timeout(500);group.get_by_role('button',name='Goalie Saves',exact=False).click();page.wait_for_timeout(1000);cards=page.locator('section.rankings article[data-ranking-market=goalie_saves]');page.wait_for_function("document.querySelectorAll('section.rankings article[data-ranking-market=goalie_saves]').length===3");assert cards.count()==3;assert not history;assert 'Loading recent player results' not in cards.first.inner_text();assert 'Expand quick analysis to load recent player results.' in cards.first.inner_text();assert '-2.1%' in cards.all_text_contents()[-1];collapsed=len(history);cards.first.get_by_role('button',name='Expand quick analysis',exact=False).click();page.wait_for_timeout(700);assert len(history)==1,history;assert not errors;reports.append({'viewport':view,'cards':cards.count(),'signedNegativeEv':'-2.1%','collapsedHistoryRequests':collapsed,'expandedHistoryRequests':len(history),'noFalseLoadingMessage':True,'pageErrors':errors});page.locator('section.rankings').screenshot(path=str(p/('verified-'+view+'-saves.png')));ctx.close()
 browser.close()
(p/'deferred-browser.json').write_text(json.dumps({'scope':'Local Cloudflare Vite candidate with recorded real boards at declared snapshot clock; not live production acceptance','checks':reports},indent=2));print(json.dumps(reports))
