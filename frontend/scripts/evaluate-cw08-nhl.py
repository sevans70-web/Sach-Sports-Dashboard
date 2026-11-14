"""CW08 offline count comparison: frozen date splits, no production writes."""
import gzip,hashlib,json,pathlib,platform,os
import numpy as np, scipy, sklearn
from scipy.optimize import minimize,minimize_scalar
from scipy.special import expit,gammaln
from scipy.stats import poisson,nbinom
from sklearn.linear_model import PoissonRegressor,LogisticRegression
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'model-research/cw08-nhl-expanded'
P=json.loads((OUT/'protocol.json').read_text());R=json.loads((OUT/'feature-receipt.json').read_text())
WORK=pathlib.Path(os.environ.get('CW08_WORK_DIR',str(ROOT.parent/'work/cw08-nhl-expanded')))
raw=(WORK/'features.json.gz').read_bytes();assert hashlib.sha256(raw).hexdigest()==R['featureSha256']
assert hashlib.sha256((OUT/'protocol.json').read_bytes()).hexdigest()==R['protocolSha256']
allrows=json.loads(gzip.decompress(raw));artifacts={};report={};EPS=1e-12

def cmean(lam):return lam/(-np.expm1(-lam))
def fit_positive(X,y):
    # Fit the zero-truncated likelihood, not plain Poisson on positive counts.
    def loss(beta):
        eta=np.clip(beta[0]+X@beta[1:],-20,20);lam=np.exp(eta)
        value=np.mean(lam-y*eta+gammaln(y+1)+np.log(-np.expm1(-lam)))+.5*np.sum(beta[1:]**2)
        error=cmean(lam)-y
        return value,np.r_[np.mean(error),X.T@error/len(y)+beta[1:]]
    fit=minimize(loss,np.zeros(X.shape[1]+1),jac=True,method='L-BFGS-B',options={'maxiter':500,'ftol':1e-12,'gtol':1e-7})
    if not fit.success:raise ValueError('Positive-count fit failed: '+fit.message)
    return fit.x

def summarize(y,mu,p05,p15,logpmf=None):
    z=(y>0).astype(float);p=np.clip(p05,EPS,1-EPS);bins=[]
    for lo in np.arange(0,1,.1):
        keep=(p05>=lo)&(p05<lo+.1 if lo<.9 else p05<=1)
        if keep.any():bins.append({'lower':round(float(lo),1),'n':int(keep.sum()),'predicted':float(p05[keep].mean()),'observed':float(z[keep].mean())})
    result={'n':len(y),'meanPrediction':float(mu.mean()),'meanActual':float(y.mean()),'meanBias':float((mu-y).mean()),'observedOver05':float(z.mean()),'predictedOver05':float(p05.mean()),'brier05':float(np.mean((p05-z)**2)),'brier15':float(np.mean((p15-(y>1))**2)),'logLoss05':float(-np.mean(z*np.log(p)+(1-z)*np.log1p(-p))),'calibrationBins':bins}
    if logpmf is not None:result['countNll']=float(-np.mean(logpmf))
    return result

def cluster_interval(diff,games):
    ids,ix=np.unique(games,return_inverse=True);sums=np.bincount(ix,weights=diff);counts=np.bincount(ix)
    rng=np.random.default_rng(20261113);draw=rng.integers(0,len(ids),size=(1000,len(ids)))
    boots=sums[draw].sum(axis=1)/counts[draw].sum(axis=1)
    return {'fixtures':len(ids),'replicates':1000,'candidateMinusLegacy':float(diff.mean()),'lower95':float(np.quantile(boots,.025)),'upper95':float(np.quantile(boots,.975))}

for market in ['goals','assists']:
    rows=[r for r in allrows if r['market']==market]
    date=np.array([r['date'] for r in rows]);y=np.array([r['y'] for r in rows],dtype=float);x=np.array([r['x'] for r in rows],dtype=float)
    train=date<=P['fitThrough'];cal=(date>=P['calibrationFrom'])&(date<=P['calibrationThrough'])
    test=(date>=P['testFrom'])&(date<=P['testThrough']);confirm=(date>=P['confirmationFrom'])&(date<=P['confirmationThrough'])
    assert not np.any(train&cal) and not np.any((train|cal)&(test|confirm))
    assert max(date[cal])<min(date[test])<min(date[confirm])
    means=x[train].mean(axis=0);scales=x[train].std(axis=0);scales[scales==0]=1;X=(x-means)/scales
    fit=PoissonRegressor(alpha=1.,max_iter=500,tol=1e-9).fit(X[train],y[train])
    baseMu=fit.predict(X);factor=y[cal].sum()/baseMu[cal].sum();mu=baseMu*factor
    alpha=max(0,float(np.sum((y[cal]-mu[cal])**2-y[cal])/np.sum(mu[cal]**2)))
    clf=LogisticRegression(C=1.,max_iter=500,tol=1e-9).fit(X[train],y[train]>0)
    logits=clf.decision_function(X)
    def event_loss(b):return np.mean(np.logaddexp(0,logits[cal]+b)-(y[cal]>0)*(logits[cal]+b))
    event=minimize_scalar(event_loss,bounds=(-5,5),method='bounded',options={'xatol':1e-10});assert event.success
    q=expit(logits+event.x)
    positive=train&(y>0);beta=fit_positive(X[positive],y[positive]);lam=np.exp(np.clip(beta[0]+X@beta[1:],-20,20))
    positiveCal=cal&(y>0)
    def positive_loss(logfactor):
        l=lam[positiveCal]*np.exp(logfactor);v=y[positiveCal]
        return np.mean(l-v*np.log(l)+gammaln(v+1)+np.log(-np.expm1(-l)))
    lf=minimize_scalar(positive_loss,bounds=(-5,5),method='bounded',options={'xatol':1e-10});assert lf.success
    lam*=np.exp(lf.x)
    legacy=np.array([r['legacyMean'] for r in rows]);models={}
    models['legacy']=(legacy,np.array([r['legacyP05'] for r in rows]),np.array([r['legacyP15'] for r in rows]),None)
    def add_poisson(name,m):models[name]=(m,poisson.sf(0,m),poisson.sf(1,m),poisson.logpmf(y,m))
    add_poisson('legacy_mean_poisson',legacy);add_poisson('expanded_poisson',mu)
    if alpha>0:
        n=1/alpha;p=n/(n+mu);models['expanded_negative_binomial']=(mu,nbinom.sf(0,n,p),nbinom.sf(1,n,p),nbinom.logpmf(y,n,p))
    else:models['expanded_negative_binomial']=models['expanded_poisson']
    p1=q*np.exp(-lam)*lam/(-np.expm1(-lam));hmean=q*cmean(lam)
    hlog=np.where(y==0,np.log1p(-np.clip(q,EPS,1-EPS)),np.log(np.clip(q,EPS,1-EPS))+poisson.logpmf(y,lam)-np.log(-np.expm1(-lam)))
    models['expanded_hurdle']=(hmean,q,np.maximum(0,q-p1),hlog)
    artifacts[market]={'featureMeans':means.tolist(),'featureScales':scales.tolist(),'poisson':{'intercept':float(fit.intercept_),'coefficients':fit.coef_.tolist(),'meanCalibrationFactor':float(factor)},'negativeBinomialDispersion':alpha,'hurdle':{'eventIntercept':float(clf.intercept_[0]),'eventCoefficients':clf.coef_[0].tolist(),'eventCalibrationIntercept':float(event.x),'positiveCoefficients':beta.tolist(),'positiveCalibrationFactor':float(np.exp(lf.x))},'trainingRows':int(train.sum()),'calibrationRows':int(cal.sum())}
    calibration={name:summarize(y[cal],m[cal],p05[cal],p15[cal],log[cal] if log is not None else None) for name,(m,p05,p15,log) in models.items()}
    # The research lead is fixed on calibration before inspecting test results.
    lead=min([n for n in models if n.startswith('expanded_')],key=lambda n:calibration[n]['brier05'])
    groups={};games=np.array([r['game'] for r in rows]);independent=np.array([not r['originalPlayer'] for r in rows])
    for window,mask in [('test',test),('confirmation',confirm)]:
      for cohort,cohortmask in [('all',np.ones(len(y),dtype=bool)),('outside_original_ten',independent),('original_ten_diagnostic',~independent),('prior_under12_diagnostic',x[:,0]<12),('prior12to18_diagnostic',(x[:,0]>=12)&(x[:,0]<18)),('prior18plus_diagnostic',x[:,0]>=18)]:
        keep=mask&cohortmask
        if not keep.any():raise ValueError('Empty independent evaluation')
        groups[window+'_'+cohort]={'players':len({rows[i]['player'] for i in np.flatnonzero(keep)}),'models':{}}
        z=(y[keep]>0);oldP=models['legacy'][1][keep];oldError=(oldP-z)**2
        for name,(m,p05,p15,log) in models.items():
          metrics=summarize(y[keep],m[keep],p05[keep],p15[keep],log[keep] if log is not None else None)
          metrics['brierDifferenceCluster95']=cluster_interval((p05[keep]-z)**2-oldError,games[keep])
          groups[window+'_'+cohort]['models'][name]=metrics
    report[market]={'trainingRows':int(train.sum()),'calibrationRows':int(cal.sum()),'trainingPlayers':len({rows[i]['player'] for i in np.flatnonzero(train)}),'calibrationLead':lead,'calibration':calibration,'evaluation':groups}
    print(market,'lead fixed on calibration:',lead,flush=True)
    for name,g in groups.items():print(name,{k:round(v['brier05'],6) for k,v in g['models'].items()},flush=True)
result={'task':'CW08','protocolSha256':hashlib.sha256((OUT/'protocol.json').read_bytes()).hexdigest(),'featureSha256':R['featureSha256'],'environment':{'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__,'scikitLearn':sklearn.__version__},'markets':report,'selectionApproved':False,'subgroupPolicy':'Original-ten and prior-minute subgroups are post-hoc diagnostics; no fitting, recalibration, or model choice uses their results.','exactPriceValidation':{'available':False,'reason':'Historical outcomes contain no frozen sportsbook quote/decision receipts. No EV, ROI, direction split or betting approval inferred.'},'productionRecommendation':'Suspend new NHL goals/assists model selections until independent count and exact-price validation pass. Preserve and grade originals.'}
(OUT/'candidate-models.json').write_text(json.dumps(artifacts,indent=2,allow_nan=False)+'\n')
(OUT/'comparison-report.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print('COMPLETE: research comparison only; no model promoted.',flush=True)
