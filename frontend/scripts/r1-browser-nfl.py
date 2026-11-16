"""Recorded API replay of the frozen UI; not live production verification."""
import os,json,re,time,gzip,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright
app=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);mobile='--mobile' in sys.argv
data=json.loads(gzip.decompress((app/'tests/fixtures/nfl-live-2026-11-15.json.gz').read_bytes()))
def api(route):
 u=urlsplit(route.request.url);q=parse_qs(u.query);path=u.path;x=None
 if path=='/api/nfl/rankings':x=data.get(q.get('market',['passing_yards'])[0],{'success':True,'rows':[]})
 elif path=='/api/game-slate':x=data['schedule']
 elif path=='/api/top-plays':x=data['featured']
 elif path=='/api/dashboard-summary':x={'success':True,'sport':'nfl','scheduleAvailable':True,'rankingsAvailable':True,'games':11,'gameCount':11,'pickCount':0,'previewGames':data['schedule']['games'],'market':'passing_yards'}
 else:x={'success':True,'rows':[],'results':[],'predictions':[],'games':[]}
 route.fulfill(status=200,content_type='application/json',body=json.dumps(x))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844} if mobile else {'width':1400,'height':1100});page.clock.install(time=__import__('datetime').datetime.fromisoformat('2026-11-15T12:00:00+00:00'));page.route('**/api/**',api);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('hydrat' in m.text.lower() or re.search(r'Minified React error #(418|419|423|425)',m.text)) else None);page.goto('http://127.0.0.1:3027/nfl',wait_until='domcontentloaded',timeout=90000);page.wait_for_timeout(3500)
 outcomes=[]
 for name,market,expected in [('Passing Yards','passing_yards',16),('Passing TDs','passing_tds',16),('Interceptions','passing_interceptions',16),('QB Rushing Yards','qb_rushing_yards',16),('Pass + Rush Yards','passing_rushing_yards',16),('Rushing Yards','rushing_yards',25),('Receiving Yards','receiving_yards',25),('Receptions','receptions',25),('Rush + Receiving','rushing_receiving_yards',21),('Anytime TD','anytime_td',25),('First TD','first_td',25),('Sacks','sacks',24),('Solo Tackles','tackles',25),('Tackles + Assists','tackles_assists',25),('Q1 Passing Yards','q1_passing_yards',16),('Q1 Receiving Yards','q1_receiving_yards',25),('Q1 Rushing Yards','q1_rushing_yards',25)]:
  button=page.locator('section.rankings button').filter(has_text=re.compile('^[^A-Za-z]*'+re.escape(name)+'$')).first
  button.click();page.wait_for_timeout(650)
  full=page.get_by_role('button',name='View All Rankings',exact=True)
  if full.count():full.click();page.wait_for_timeout(150)
  text=page.locator('section.rankings').inner_text();cards=page.locator('section.rankings article').count();assert f'{expected} rankings' in text,(market,text[:1300]);assert cards==expected,(market,cards,text[:1000]);assert '0 picks' in text,(market,text[-1200:]);print('verified',market,cards,flush=True);outcomes.append({'market':market,'displayed':cards,'picks':0,'explained':('Forecast status:' in text)})
 assert not errors,errors
 result={'environment':'LOCAL compiled production candidate; captured actual live November 15 API responses; no outbound database or provider writes','markets':outcomes,'pageErrors':errors};(out/('browser-nfl-mobile.json' if mobile else 'browser-nfl.json')).write_text(json.dumps(result,indent=2));page.screenshot(path=str(out/('browser-nfl-mobile.png' if mobile else 'browser-nfl.png')),full_page=True);print(json.dumps(result));b.close()
