"""Score frozen CW08 v3. No fitting or tuning in evaluation."""
import gzip,json,pathlib,hashlib
import numpy as np
from scipy.special import expit
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'model-research/cw08-nhl-v3';W=ROOT.parent/'work/cw08-v3'
M=json.loads((D/'models.json').read_text());V2=json.loads((ROOT/'model-research/cw08-nhl-expanded/candidate-models.json').read_text());receipt=json.loads((D/'evaluation-input-receipt.json').read_text());raw=(W/'evaluation-inputs.json.gz').read_bytes();assert hashlib.sha256(raw).hexdigest()==receipt['inputSha256'];assert hashlib.sha256((D/'models.json').read_bytes()).hexdigest()==receipt['modelsSha256']
rows=json.loads(gzip.decompress(raw));report={};EPS=1e-12

def metrics(y,p,game,legacy):
 y=np.asarray(y)>0;p=np.asarray(p);diff=(p-y)**2-(legacy-y)**2;ids,ix=np.unique(game,return_inverse=True);sums=np.bincount(ix,weights=diff);counts=np.bincount(ix);rng=np.random.default_rng(20261114);draw=rng.integers(0,len(ids),(1000,len(ids)));boot=sums[draw].sum(1)/counts[draw].sum(1)
 return {'n':len(y),'fixtures':len(ids),'observed':float(y.mean()),'predicted':float(p.mean()),'brier':float(np.mean((p-y)**2)),'logLoss':float(-np.mean(y*np.log(np.clip(p,EPS,1-EPS))+(1-y)*np.log(np.clip(1-p,EPS,1-EPS)))),'differenceVsLegacy':float(diff.mean()),'differenceCluster95':[float(np.quantile(boot,.025)),float(np.quantile(boot,.975))]}
for market in ['goals','assists']:
 model=M[market];old=V2[market];rs=[r for r in rows if r['market']==market];X=np.array([r['features'] for r in rs]);S=(X-model['means'])/model['scales'];b=np.array(model['eventCoefficients']);score=b[0]+S@b[1:];globalp=expit(score+model['globalOffset']);rolep=expit(score+np.array(model['roleOffsets'])[np.digitize(X[:,0],[12,18])]);candidate=rolep if model['calibrationPolicy']=='role' else globalp
 c=np.array(model['positiveCoefficients']);lam=np.exp(np.clip(c[0]+S@c[1:],-20,20))*model['positiveFactor']
 oldx=(X[:,:10]-old['featureMeans'])/old['featureScales'];h=old['hurdle'];oldscore=h['eventIntercept']+oldx@np.array(h['eventCoefficients']);v2=expit(oldscore+h['eventCalibrationIntercept']);uncal=expit(oldscore)
 probs={'legacy':np.array([r['legacyP05'] for r in rs]),'v2_uncalibrated_diagnostic':uncal,'v2':v2,'v3_global_diagnostic':globalp,'v3_role_diagnostic':rolep,'v3_frozen':candidate};groups={};kind=np.array([r['kind'] for r in rs]);original=np.array([r['originalPlayer'] for r in rs]);y=np.array([r['y'] for r in rs]);games=np.array([r['game'] for r in rs]);
 for name,keep in [('old_original_ten_diagnostic',(kind=='inspected_diagnostic')&original),('fresh_all',kind=='fresh'),('fresh_original_ten',(kind=='fresh')&original),('fresh_other_players',(kind=='fresh')&~original)]:
  groups[name]={k:metrics(y[keep],p[keep],games[keep],probs['legacy'][keep]) for k,p in probs.items()}
 priced=[]
 for i,r in enumerate(rs):
  if r['kind']!='priced_diagnostic':continue
  q=r['quote'];line=q['line'];p0=1-candidate[i];positive=candidate[i]*np.exp(-lam[i])/(-np.expm1(-lam[i]));masses=[p0];pk=positive
  for k in range(1,100):pk*=lam[i]/k;masses.append(pk)
  mass=np.array(masses);mass/=mass.sum();over=float(mass[np.arange(100)>line].sum());under=float(mass[np.arange(100)<line].sum());push=float(mass[np.arange(100)==line].sum())
  payout=lambda price:price/100 if price>0 else 100/-price
  oe=over*payout(q['overPrice'])-under;ue=under*payout(q['underPrice'])-over;side='OVER' if oe>=ue else 'UNDER';ev=max(oe,ue);selected=ev>=.03
  won=(r['y']>line if side=='OVER' else r['y']<line);profit=0 if r['y']==line else payout(q['overPrice'] if side=='OVER' else q['underPrice']) if won else -1
  priced.append({'game':r['game'],'player':r['player'],'market':market,'quote':q,'actual':r['y'],'over':over,'under':under,'push':push,'overEv':oe,'underEv':ue,'researchSide':side if selected else None,'researchProfit':profit if selected else None,'sourceOriginalChecksum':r['sourceOriginalChecksum'],'retrospective':True,'selectionApproved':False,'baselineOver':r['legacyProbabilities']['over']})
 kept=[r for r in priced if r['researchSide']];pricing={'rows':len(priced),'selectedResearchOnly':len(kept),'over':sum(r['researchSide']=='OVER' for r in kept),'under':sum(r['researchSide']=='UNDER' for r in kept),'pushes':sum(r['actual']==r['quote']['line'] for r in priced),'unitProfitDiagnostic':sum(r['researchProfit'] for r in kept),'notIndependentValidation':True,'decisions':priced}
 pricing['brierAtOriginalLines']=float(np.mean([(r['over']-float(r['actual']>r['quote']['line']))**2 for r in priced]));pricing['legacyBrierAtOriginalLines']=float(np.mean([(r['baselineOver']-float(r['actual']>r['quote']['line']))**2 for r in priced]));pricing['selectedUnitRoiDiagnostic']=pricing['unitProfitDiagnostic']/len(kept) if kept else None
 report[market]={'calibrationPolicyFrozen':model['calibrationPolicy'],'groups':groups,'actualQuotePopulationReplay':pricing}
 print(market,flush=True)
 for g in ['old_original_ten_diagnostic','fresh_all','fresh_original_ten']:
  print(g,{k:round(v['brier'],6) for k,v in groups[g].items()},flush=True)
 print('priced',len(priced),'research candidates',len(kept),flush=True)
(D/'validation-report.json').write_text(json.dumps({'candidateFrozenCommit':'007c02b','modelsSha256':receipt['modelsSha256'],'freshProtocol':'November 1-8 outcomes fetched only after freezing candidate. No model changes after scoring. Actual quote period is explicitly retrospective.','markets':report,'releaseApproved':False,'limitation':'Fresh outcome-only period has no actual same-fixture sportsbook receipts; retrospective quote replay cannot substitute for prospective validation.'},indent=2)+'\n')
