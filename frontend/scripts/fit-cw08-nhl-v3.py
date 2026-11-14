"""Fit CW08 v3 using prior data only. Does not fetch or inspect fresh outcomes."""
import gzip,json,pathlib,hashlib,math,os
import numpy as np
from scipy.special import expit,gammaln
from scipy.optimize import minimize,minimize_scalar
from sklearn.linear_model import LogisticRegression
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'model-research/cw08-nhl-v3';P=json.loads((D/'protocol.json').read_text());OLD=ROOT/'model-research/cw08-nhl-expanded'
source=(OLD/'player-games.json.gz').read_bytes();rows=json.loads(gzip.decompress(source))
# Only prior-season fitting/calibration labels enter priors and model fitting.
raw=json.loads(gzip.decompress((ROOT.parent/'work/cw08-nhl-expanded/features.json.gz').read_bytes()))
models={};diagnostics={}
def positive_fit(X,y):
 def f(b):
  eta=np.clip(b[0]+X@b[1:],-20,20);l=np.exp(eta);e=l/(-np.expm1(-l))-y
  return np.mean(l-y*eta+gammaln(y+1)+np.log(-np.expm1(-l)))+.5*np.sum(b[1:]**2),np.r_[e.mean(),X.T@e/len(y)+b[1:]]
 r=minimize(f,np.zeros(X.shape[1]+1),jac=True,method='L-BFGS-B',options={'maxiter':500,'gtol':1e-7,'ftol':1e-12});assert r.success,r.message;return r.x
for market in ['goals','assists']:
 base=[r for r in raw if r['market']==market]
 t=[r for r in rows if r['gameDate']<=P['fitThrough']];event=sum(r[market]>0 for r in t)/len(t);rate=sum(r[market] for r in t)/sum(r['timeOnIcePerGame']/60 for r in t);minutes=sum(r['timeOnIcePerGame']/60 for r in t)/len(t)
 histories={}
 for r in rows:histories.setdefault(str(r['playerId']),[]).append(r)
 for h in histories.values():h.sort(key=lambda r:r['gameDate'])
 def augment(r):
  # Raw official dates are midnight UTC, matching the existing conservative lag.
  cutoff=np.datetime64(r['date'])-np.timedelta64(2,'D');h=[g for g in histories[r['player']] if np.datetime64(g['gameDate'])<cutoff][-60:]
  return extra(r['x'],h,market,event,rate,minutes)
 def extra(x,h,market,event,rate,minutes):
  q=(sum(g[market]>0 for g in h)+20*event)/(len(h)+20)
  pooled=(sum(g[market] for g in h)+20*minutes*rate)/(sum(g['timeOnIcePerGame']/60 for g in h)+20*minutes)
  return x+[math.log(q/(1-q)),math.log(pooled),x[0]*pooled,math.log1p(len(h))]
 # Only build fitting/calibration matrices here. Previously inspected tests are
 # diagnosed later with the frozen parameters; fresh outcomes are not loaded.
 fit=[r for r in base if r['date']<=P['fitThrough']];cal=[r for r in base if P['calibrationFrom']<=r['date']<=P['calibrationThrough']]
 X0=np.array([augment(r) for r in fit]);C0=np.array([augment(r) for r in cal]);y=np.array([r['y'] for r in fit]);z=np.array([r['y'] for r in cal]);mu=X0.mean(0);sd=X0.std(0);sd[sd==0]=1;X=(X0-mu)/sd;C=(C0-mu)/sd
 clf=LogisticRegression(C=1,max_iter=500,tol=1e-9).fit(X,y>0);logit=clf.decision_function(C)
 def offset(mask):
  r=minimize_scalar(lambda b:np.mean(np.logaddexp(0,logit[mask]+b)-(z[mask]>0)*(logit[mask]+b)),bounds=(-5,5),method='bounded');assert r.success;return float(r.x)
 global_offset=offset(np.ones(len(z),bool));bands=np.digitize(C0[:,0],[12,18]);offsets=[offset(bands==i) for i in range(3)]
 qg=expit(logit+global_offset);qr=expit(logit+np.array(offsets)[bands]);scores={'global':float(np.mean((qg-(z>0))**2)),'role':float(np.mean((qr-(z>0))**2))};policy=min(scores,key=scores.get)
 b=positive_fit(X[y>0],y[y>0]);l=np.exp(np.clip(b[0]+C@b[1:],-20,20));keep=z>0
 scale=minimize_scalar(lambda a:np.mean(l[keep]*np.exp(a)-z[keep]*np.log(l[keep]*np.exp(a))+gammaln(z[keep]+1)+np.log(-np.expm1(-l[keep]*np.exp(a)))),bounds=(-5,5),method='bounded');assert scale.success
 models[market]={'version':3,'market':market,'trainedThrough':P['fitThrough'],'calibratedThrough':P['calibrationThrough'],'means':mu.tolist(),'scales':sd.tolist(),'eventCoefficients':[float(clf.intercept_[0]),*clf.coef_[0].tolist()],'positiveCoefficients':b.tolist(),'positiveFactor':float(np.exp(scale.x)),'globalOffset':global_offset,'roleOffsets':offsets,'calibrationPolicy':policy,'skillPrior':{'event':event,'rate':rate,'minutes':minutes,'games':20,'historyGames':60},'selectionApproved':False}
 diagnostics[market]={'fitRows':len(fit),'calibrationRows':len(cal),'calibrationBrier':scores,'selectedBeforeFreshEvaluation':policy}
 print(market,diagnostics[market],flush=True)
(D/'models.json').write_text(json.dumps(models,indent=2)+'\n');(D/'fit-receipt.json').write_text(json.dumps({'protocolSha256':hashlib.sha256((D/'protocol.json').read_bytes()).hexdigest(),'priorSourceSha256':hashlib.sha256(source).hexdigest(),'modelsSha256':hashlib.sha256((D/'models.json').read_bytes()).hexdigest(),'diagnostics':diagnostics,'freshOutcomesRead':False},indent=2)+'\n')
