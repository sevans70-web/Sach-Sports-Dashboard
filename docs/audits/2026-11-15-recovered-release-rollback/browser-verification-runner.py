import json,os,time,re,traceback
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
out=Path('/workspace/work/recovered-deploy-2026-11-15/live');out.mkdir(exist_ok=True);base='https://sach-sports-cloudflare-test.sevans70.workers.dev';report={'errors':[],'hydrationErrors':[],'nfl':{},'nhl':{},'nba':{},'responses':[],'scope':'Actual production browser, no replay, no clock changes, TLS verification enabled'};boards={}
try:
 with sync_playwright() as p:
  proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY');b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],**({'proxy':{'server':proxy}} if proxy else {}));page=b.new_page(viewport={'width':1440,'height':1100},user_agent='SachSports-ReleaseAudit/1.0',timezone_id='America/Toronto')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  def console(m):
   if m.type=='error' and ('hydrat' in m.text.lower() or re.search(r'Minified React error #(418|419|423|425)',m.text)):report['hydrationErrors'].append(m.text)
  page.on('console',console)
  def response(r):
   if '/rankings?' in r.url:
    sport=urlparse(r.url).path.split('/')[2];market=parse_qs(urlparse(r.url).query).get('market',[''])[0];report['responses'].append({'sport':sport,'market':market,'status':r.status})
    if r.status==200:
     try:boards[(sport,market)]=r.json()
     except:pass
  page.on('response',response)
  def choose(sport,label):
   group=page.get_by_role('group',name=sport.upper()+' player prop markets');buttons=group.get_by_role('button');names=buttons.all_text_contents();matches=[i for i,n in enumerate(names) if re.fullmatch('[^A-Za-z]*'+re.escape(label),n.strip())];assert len(matches)==1,(sport,label,names);buttons.nth(matches[0]).click()
  def expand():
   button=page.get_by_role('button',name='View All Rankings',exact=True)
   if button.count():button.click()
   collapsed=page.locator('section.rankings button').filter(has_text=re.compile(r'Expand'))
   for _ in range(8):
    if not collapsed.count():break
    collapsed.first.click()
  def check(sport,market,label):
   tick=time.monotonic();choose(sport,label);ready=False
   for _ in range(180):
    expand();cards=page.locator('section.rankings article');ids=cards.evaluate_all('es=>es.map(e=>e.dataset.rankingMarket)');board=boards.get((sport,market));text=page.locator('section.rankings').inner_text()
    if board is not None:
     desired=board.get('nflCoverage',{}).get('displayableRows') if sport=='nfl' else board.get('displayableRows') if sport=='nhl' else None
     if sport=='nba':ready=bool(ids) and all(x==market for x in ids)
     else:ready=(desired is not None and len(ids)==desired and all(x==market for x in ids) and (desired>0 or bool(board.get('coverageNotice')) and board['coverageNotice'] in text))
     if ready:break
    page.wait_for_timeout(250)
   assert ready,('live browser/API mismatch',sport,market,len(ids),text[-1000:]);assert not report['errors'] and not report['hydrationErrors'],report['errors']+report['hydrationErrors']
   result={'cards':cards.count(),'seconds':round(time.monotonic()-tick,3),'coverage':board.get('nflCoverage'),'explanationVisible':'Forecast status:' in text or bool(board.get('coverageNotice')) and board['coverageNotice'] in text}
   if sport=='nba':
    ev=cards.locator('[data-ev-status]').evaluate_all('es=>es.map(e=>({status:e.dataset.evStatus,value:e.previousElementSibling.textContent,reason:e.textContent}))');assert ev and all(e['value'] and e['reason'] for e in ev),(market,'EV missing');result['ev']=ev
   report[sport][market]=result;(out/'browser-verification.json').write_text(json.dumps(report,indent=2));print(sport,market,result['cards'],result['seconds'],flush=True)
  start=time.monotonic();r=page.goto(base+'/nfl',wait_until='domcontentloaded',timeout=45000);assert r.status==200;page.get_by_role('group',name='NFL player prop markets').wait_for(timeout=30000)
  for market,label in [('passing_yards','Passing Yards'),('passing_tds','Passing TDs'),('passing_interceptions','Interceptions'),('qb_rushing_yards','QB Rushing Yards'),('passing_rushing_yards','Pass + Rush Yards'),('anytime_td','Anytime TD'),('first_td','First TD'),('receiving_yards','Receiving Yards'),('receptions','Receptions'),('rushing_yards','Rushing Yards'),('rushing_receiving_yards','Rush + Receiving'),('sacks','Sacks'),('tackles','Solo Tackles'),('tackles_assists','Tackles + Assists'),('q1_passing_yards','Q1 Passing Yards'),('q1_receiving_yards','Q1 Receiving Yards'),('q1_rushing_yards','Q1 Rushing Yards')]:check('nfl',market,label)
  page.screenshot(path=str(out/'live-nfl.png'),full_page=True)
  page.goto(base+'/nhl',wait_until='domcontentloaded',timeout=45000);page.get_by_role('group',name='NHL player prop markets').wait_for(timeout=30000)
  for market,label in [('shots_on_goal','Shots on Goal'),('points','Points'),('assists','Assists'),('goalie_saves','Goalie Saves')]:check('nhl',market,label)
  reloads=[]
  for i in range(2):
   t=time.monotonic();page.goto(base+'/nhl',wait_until='domcontentloaded',timeout=45000);page.locator('section.rankings article').first.wait_for(timeout=30000);reloads.append(round(time.monotonic()-t,3));assert not report['errors'] and not report['hydrationErrors']
  report['nhlReloadSeconds']=reloads;page.screenshot(path=str(out/'live-nhl.png'),full_page=True)
  page.goto(base+'/nba',wait_until='domcontentloaded',timeout=45000);page.get_by_role('group',name='NBA player prop markets').wait_for(timeout=30000)
  for market,label in [('points','Points'),('rebounds','Rebounds'),('assists','Assists'),('threes_made','3-Pointers Made'),('pts_rebs_asts','Points + Rebounds + Assists'),('pts_rebs','Points + Rebounds'),('pts_asts','Points + Assists')]:check('nba',market,label)
  report['totalSeconds']=round(time.monotonic()-start,3);page.screenshot(path=str(out/'live-nba.png'),full_page=True);b.close()
 (out/'browser-verification.json').write_text(json.dumps(report,indent=2));(out/'browser-success.json').write_text(json.dumps({'success':True,'at':time.time()}));print('All real live browser checks passed',flush=True)
except Exception as e:
 (out/'browser-failure.json').write_text(json.dumps({'error':str(e),'at':time.time(),'report':report},indent=2));traceback.print_exc();raise
