import json,gzip,hashlib,pathlib,subprocess,concurrent.futures
D=pathlib.Path(__file__).resolve().parents[1]/'model-research/cw08-nhl-v3'
def fetch(day):
 url='https://api-web.nhle.com/v1/score/'+day
 raw=subprocess.run(['curl','-fsS','--max-time','40','--retry','1',url],check=True,capture_output=True).stdout
 return {'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'payload':json.loads(raw)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(fetch,[f'2026-11-{i:02}' for i in range(1,13)]))
(D/'official-finals.json.gz').write_bytes(gzip.compress(json.dumps(results,separators=(',',':')).encode(),mtime=0))
print('Official final-status sources saved:',len(results))
