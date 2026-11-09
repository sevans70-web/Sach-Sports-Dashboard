import {createHash} from 'node:crypto';
import {checksum,cloudRequest} from './history-cloud.mjs';
import {driveAuth} from './drive-auth.mjs';

const driveFiles = 'https://www.googleapis.com/drive/v3/files';
const uploadFiles = 'https://www.googleapis.com/upload/drive/v3/files';
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

export async function verifyWorkerDriveBackup(env, requestCloud = cloudRequest, authenticate = driveAuth) {
 const folder = env.BACKUP_DRIVE_FOLDER_ID;
 if(!/^[a-zA-Z0-9_-]+$/.test(folder??''))throw Error('Drive backup folder is unavailable');
 const rows = await requestCloud('history_documents?select=sport,stream,game_date,checksum,payload&sport=eq.nba&stream=eq.slate_board_points&source_bytes=lte.1048576&order=game_date.desc&limit=1');
 const doc = rows?.[0];
 if(!doc||doc.sport!=='nba'||doc.stream!=='slate_board_points'||!/^\d{4}-\d{2}-\d{2}$/.test(doc.game_date)||checksum(doc.payload)!==doc.checksum)throw Error('Backup source document did not verify');
 const body = JSON.stringify({version:1,documents:[doc]});
 const bytes = Buffer.byteLength(body);
 if(bytes>2*1024*1024)throw Error('Drive backup check exceeds its size limit');
 const digest = md5(body);
 const name = 'cloudflare-staging-backup-check-'+doc.game_date+'-'+digest+'.json';
 const {request} = authenticate({
  clientId:env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret:env.GOOGLE_OAUTH_CLIENT_SECRET,
  refreshToken:env.GOOGLE_OAUTH_REFRESH_TOKEN,
  fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)}),
 });
 const drive = async(url,options)=>{
  const response = await request(url,options);
  if(!response.ok)throw Error('Drive backup check returned HTTP '+response.status);
  return response;
 };
 const query = new URLSearchParams({q:"'"+folder+"' in parents and name = '"+name+"' and trashed = false",fields:'files(id,md5Checksum)',pageSize:'100'});
 const existing = await (await drive(driveFiles+'?'+query)).json();
 let file = existing.files?.find(item=>item.md5Checksum===digest);
 if(!file){
  const boundary = 'sach-backup-'+crypto.randomUUID();
  const meta = JSON.stringify({name,parents:[folder],mimeType:'application/json'});
  const multipart = '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--\r\n';
  file = await (await drive(uploadFiles+'?uploadType=multipart&fields=id,md5Checksum',{
   method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart,
  })).json();
 }
 if(!file.id||file.md5Checksum!==digest)throw Error('Drive backup checksum did not match');
 const restored = await (await drive(driveFiles+'/'+encodeURIComponent(file.id)+'?alt=media')).text();
 if(md5(restored)!==digest||restored!==body)throw Error('Drive backup readback did not match');
 return {sport:doc.sport,day:doc.game_date,documents:1,bytes};
}
