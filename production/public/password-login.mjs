const $=s=>document.querySelector(s);
const password=$('#password'),error=$('#error'),show=$('#show'),button=$('#login button[type="submit"]');
async function api(path,body){
  const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'ระบบยังไม่พร้อมใช้งาน');return data;
}
async function refresh(){
  button.disabled=true;
  try{const state=await api('status');button.disabled=!state.configured;error.textContent=state.configured?'':'ยังไม่ได้ตั้งรหัสผ่าน กรุณาติดต่อผู้ดูแล';}
  catch(e){error.textContent=e.message||'ติดต่อระบบไม่สำเร็จ กรุณารีเฟรชหน้า';}
}
function openDashboard(){
  $('#gate').hidden=true;$('#workspace').hidden=false;
  const frame=document.createElement('iframe');frame.title='GD Promotion Dashboard';frame.src='/dashboard'+location.search;
  $('#dashboard').replaceChildren(frame);$('#logout').focus();
}
show.addEventListener('click',()=>{const visible=password.type==='password';password.type=visible?'text':'password';show.setAttribute('aria-label',visible?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน');show.setAttribute('aria-pressed',String(visible));});
password.addEventListener('input',()=>{error.textContent='';password.removeAttribute('aria-invalid');});
$('#login').addEventListener('submit',async event=>{
  event.preventDefault();button.disabled=true;
  try{await api('login',{password:password.value});password.value='';error.textContent='';openDashboard();}
  catch(e){error.textContent=e.message||'ติดต่อระบบไม่สำเร็จ';password.setAttribute('aria-invalid','true');password.focus();password.select();}
  finally{button.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{
  $('#logout').disabled=true;
  try{await api('logout',{});location.reload();}
  catch{alert('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');$('#logout').disabled=false;}
});
async function checkSession(){
  try{await api('session');return true;}catch{return false;}
}
// Hide loaded data if another page changed the password or the session expired.
setInterval(async()=>{if(!$('#workspace').hidden&&!await checkSession()){ $('#dashboard').replaceChildren();$('#workspace').hidden=true;$('#gate').hidden=false;await refresh(); }},60000);
await refresh();
if(await checkSession())openDashboard();
