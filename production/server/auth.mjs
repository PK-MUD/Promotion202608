import {randomBytes,createHash,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const cookieName='__Host-gd-session';
const maxAge=8*60*60;
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const denied=()=>json({error:'กรุณาเข้าสู่ระบบ'},401);
const secureCookie=(token,age=maxAge)=>`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function tokenFrom(request){
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  return /^[a-f0-9]{64}$/.test(token||'')?token:null;
}
export async function passwordRecord(password){
  const salt=randomBytes(16).toString('hex');
  const digest=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return {salt,digest:digest.toString('hex')};
}
export async function matches(password,record){
  if(typeof password!=='string'||password.length>128||!record) return false;
  const digest=await scrypt(password,record.salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(digest,Buffer.from(record.digest,'hex'));
}
export function validatePassword(password,confirmation){
  if(typeof password!=='string'||!password.trim()) return 'กรุณากรอกรหัสผ่านใหม่';
  if(password.length>128) return 'รหัสผ่านยาวได้ไม่เกิน 128 ตัวอักษร';
  if(password!==confirmation) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
  return '';
}
// A strong-consistency conditional write counts concurrent attempts across instances.
async function permit(store,ip,now){
  const key='rate/'+hash(ip||'unknown');
  for(let i=0;i<8;i++){
    const old=await store.getWithMetadata(key,{type:'json'});
    const fresh=!old||old.data.until<=now;
    if(!fresh&&old.data.count>=12) return false;
    const data={count:fresh?1:old.data.count+1,until:fresh?now+60_000:old.data.until};
    const result=await store.setJSON(key,data,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});
    if(result.modified) return true;
  }
  return false;
}
async function session(request,store,now){
  const token=tokenFrom(request);
  if(!token) return null;
  const [value,settings]=await Promise.all([store.get('session/'+hash(token),{type:'json'}),store.get('settings',{type:'json'})]);
  if(!value||!settings||value.expires<=now||value.version!==settings.version) return null;
  return value;
}
export function createHandler({getStore,bootstrapHash,readDashboard,clock=Date.now}){
  return async function handle(request,context={}){
    try{
      const path=new URL(request.url).pathname;
      const allowed=['/api/status','/api/session','/api/login','/api/logout','/api/password','/dashboard'];
      if(!allowed.includes(path)) return json({error:'ไม่พบหน้า'},404);
      const isPost=['/api/login','/api/logout','/api/password'].includes(path);
      if(request.method!==(isPost?'POST':'GET')) return json({error:'Method not allowed'},405);
      if(isPost){
        if(request.headers.get('origin')!==new URL(request.url).origin) return json({error:'คำขอไม่ถูกต้อง'},403);
        if(!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'คำขอไม่ถูกต้อง'},415);
        if(Number(request.headers.get('content-length')||0)>4096) return json({error:'คำขอมีขนาดใหญ่เกินไป'},413);
      }
      const store=getStore(),now=clock();
      if(path==='/api/status') return json({configured:!!await store.get('settings',{type:'json'})});
      if(path==='/api/session') return await session(request,store,now)?json({authenticated:true}):denied();
      if(path==='/dashboard'){
        if(!await session(request,store,now)) return new Response(null,{status:302,headers:{Location:'/'+new URL(request.url).search,'Cache-Control':'no-store'}});
        return new Response(await readDashboard(),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','Vary':'Cookie','X-Frame-Options':'SAMEORIGIN','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
      }
      if(path==='/api/logout'){
        const token=tokenFrom(request);
        if(token) await store.delete('session/'+hash(token));
        return json({ok:true},200,{'Set-Cookie':secureCookie('',0)});
      }
      if(!await permit(store,context.ip,now)) return json({error:'ลองหลายครั้งเกินไป กรุณารอ 1 นาที'},429,{'Retry-After':'60'});
      const raw=await request.text();
      if(Buffer.byteLength(raw)>4096) return json({error:'คำขอมีขนาดใหญ่เกินไป'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({error:'คำขอไม่ถูกต้อง'},400);}
      if(!body||typeof body!=='object') return json({error:'คำขอไม่ถูกต้อง'},400);
      const current=await store.getWithMetadata('settings',{type:'json'});
      if(path==='/api/login'){
        if(!current) return json({error:'ยังไม่ได้ตั้งรหัสผ่าน กรุณาติดต่อผู้ดูแล'},403);
        if(!await matches(body.password,current.data.password)) return json({error:'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง'},401);
        const token=randomBytes(32).toString('hex');
        await store.setJSON('session/'+hash(token),{version:current.data.version,expires:now+maxAge*1000});
        return json({ok:true},200,{'Set-Cookie':secureCookie(token)});
      }
      // First setup requires an owner-only random code. After setup it is disabled.
      const valid=current?await matches(body.currentPassword,current.data.password):typeof body.currentPassword==='string'&&bootstrapHash&&hash(body.currentPassword)===bootstrapHash;
      if(!valid) return json({error:current?'รหัสผ่านปัจจุบันไม่ถูกต้อง':'รหัสตั้งค่าครั้งแรกไม่ถูกต้อง'},401);
      const error=validatePassword(body.password,body.confirmation);
      if(error) return json({error},400);
      const record={password:await passwordRecord(body.password),version:randomBytes(16).toString('hex'),updatedAt:new Date(now).toISOString()};
      const saved=await store.setJSON('settings',record,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
      if(!saved.modified) return json({error:'มีการเปลี่ยนรหัสจากอีกหน้า กรุณาลองใหม่'},409);
      return json({ok:true},200,{'Set-Cookie':secureCookie('',0)});
    }catch{
      // Never expose request bodies, passwords, cookie values, or storage details.
      return json({error:'ระบบยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง'},503);
    }
  };
}
