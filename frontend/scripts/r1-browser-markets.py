"""Recorded API replay of the frozen UI; not live production verification."""
import json,re,datetime,gzip,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright
app=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);mobile='--mobile' in sys.argv;
fixtures=json.loads(gzip.decompress((app.parent/'docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz').read_bytes()))['files'];fixtures.update(json.loads(gzip.decompress((app/'tests/fixtures/r1-browser-extra-nhl-2026-11-15.json.gz').read_bytes()))['files']);
report={'scope':'LOCAL compiled candidate; recorded real November 15 responses, frozen 15:52 UTC; API replay, no live writes','markets':[],'errors':[],'featured':[],'historyResponses':[]};failed=False

def api(route):
 global failed
 u=urlsplit(route.request.url);q=parse_qs(u.query);sport=q.get('sport',['nba'])[0];kind=u.path.split('/')[-1];p=None
 if '/api/nba/' in u.path:sport='nba'
 if '/api/nhl/' in u.path:sport='nhl'
 if kind=='rankings':p=f"{sport}-{q.get('market',['points'])[0]}.json"
 elif kind=='game-slate':p=f'{sport}-slate.json'
 elif kind=='dashboard-summary':p=f'{sport}-summary.json'
 elif kind in ['featured','top-plays']:p=f'{sport}-featured.json'
 elif kind=='performance':p=f'{sport}-history.json'
 d=fixtures[p] if p in fixtures else {'success':True,'rows':[],'games':[],'results':[]}
 if failed and kind=='rankings' and sport=='nba':route.fulfill(status=503,headers={'Retry-After':'1'},content_type='application/json',body='{"success":false,"reason":"nba_ranking_deadline"}');return
 if kind=='performance' and p in fixtures:report['historyResponses'].append({'sport':sport,'success':d.get('success'),'completed':d.get('researchSummary',{}).get('completed')})
 route.fulfill(status=200,content_type='application/json',body=json.dumps(d))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844} if mobile else {'width':1440,'height':1100});page.clock.install(time=datetime.datetime.fromisoformat('2026-11-15T15:52:00+00:00'));page.route('**/api/**',api);page.on('pageerror',lambda e:report['errors'].append(str(e)));page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' and ('hydrat' in m.text.lower() or re.search(r'Minified React error #(418|419|423|425)',m.text)) else None)
 for sport,markets in [('nba',[('points','Points'),('rebounds','Rebounds'),('assists','Assists'),('threes_made','3-Pointers Made'),('pts_rebs_asts','Points + Rebounds + Assists'),('pts_asts','Points + Assists'),('pts_rebs','Points + Rebounds')]),('nhl',[('shots_on_goal','Shots on Goal'),('points','Points'),('assists','Assists'),('goals','Goals'),('blocked_shots','Blocked Shots'),('goalie_saves','Goalie Saves')])]:
  page.goto('http://127.0.0.1:3027/'+sport,wait_until='domcontentloaded',timeout=60000);page.get_by_role('group',name=sport.upper()+' player prop markets').wait_for(timeout=30000)
  for market,label in markets:
   group=page.get_by_role('group',name=sport.upper()+' player prop markets');buttons=group.get_by_role('button');names=buttons.all_text_contents();at=[i for i,n in enumerate(names) if re.fullmatch('[^A-Za-z]*'+re.escape(label),n.strip())];assert len(at)==1,(label,names);buttons.nth(at[0]).click();page.wait_for_timeout(1000)
   full=page.get_by_role('button',name='View All Rankings',exact=True)
   if full.count():full.click();page.wait_for_timeout(100)
   cards=page.locator('section.rankings article');ids=cards.evaluate_all('es=>es.map(e=>e.dataset.rankingMarket)');assert all(i==market for i in ids),(market,ids)
   text=page.locator('section.rankings').inner_text();assert cards.count()>0 or (sport=='nhl' and market in ['assists','goals','blocked_shots'] and ('validation' in text.lower() or 'unavailable' in text.lower() or 'hold' in text.lower() or 'withheld' in text.lower() or 'model' in text.lower())),(market,text[-1500:])
   ev=cards.locator('[data-ev-status]').count();report['markets'].append({'sport':sport,'market':market,'cards':cards.count(),'evLabels':ev});print(sport,market,cards.count(),flush=True)
   if sport=='nba' and market=='pts_rebs':
    before=cards.count();failed=True;page.clock.fast_forward(60000);page.wait_for_timeout(2200);retained=page.locator('section.rankings article').count();text=page.locator('section.rankings').inner_text();assert retained==before,(before,retained);assert 'retained rankings' in text.lower() or 'may be stale' in text.lower() or 'prices may have changed' in text.lower(),text[-1500:];report['prFailureRecovery']={'retained':retained,'staleExplained':True};failed=False
  featured=page.locator(f'section[aria-labelledby="featured-picks-{sport}"]')
  featured.wait_for();page.wait_for_timeout(200)
  expected=fixtures[f'{sport}-featured.json']['plays'];assert featured.locator('article').count()==len(expected)
  text=featured.inner_text()
  for item in expected:
   if item.get('pick'):assert item['pick']['row']['playerName'] in text,(sport,item['title'],text)
  report['featured'].append({'sport':sport,'cards':len(expected),'recordedPlayersPreserved':True})
 assert not report['errors'],report['errors'];(out/('browser-markets-mobile.json' if mobile else 'browser-markets.json')).write_text(json.dumps(report,indent=2));b.close()
