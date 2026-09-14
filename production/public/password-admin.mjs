const $=s=>document.querySelector(s);
let configured=false;
async function refresh(){
  const response=await fetch('/api/status',{cache:'no-store'});
  if(!response.ok)throw new Error('ติดต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  configured=(await response.json()).configured;
  $('#title').textContent=configured?'เปลี่ยนรหัสผ่าน':'ตั้งรหัสผ่าน';
  $('#current-label').textContent=configured?'รหัสผ่านปัจจุบัน':'รหัสตั้งค่าครั้งแรก';
  $('#current-password').autocomplete=configured?'current-password':'off';
  $('#first-setup-hint').hidden=configured;
}
$('#show-setup').addEventListener('change',e=>{for(const id of ['#current-password','#new-password','#confirm-password'])$(id).type=e.target.checked?'text':'password';});
$('#setup').addEventListener('input',()=>{$('#setup-error').textContent='';$('#saved').hidden=true;});
$('#setup').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#save-password');button.disabled=true;
  try{
    const password=$('#new-password').value,confirmation=$('#confirm-password').value;
    if(!password.trim())throw new Error('กรุณากรอกรหัสผ่านใหม่');
    if(password!==confirmation)throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    const response=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:$('#current-password').value,password,confirmation}),credentials:'same-origin'});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'บันทึกไม่สำเร็จ');
    $('#setup').reset();for(const id of ['#current-password','#new-password','#confirm-password'])$(id).type='password';
    await refresh();$('#saved').textContent='บันทึกแล้ว รหัสใหม่นี้ใช้เข้าแดชบอร์ดได้ทุกเครื่อง ผู้ใช้งานเดิมต้องเข้าสู่ระบบใหม่';$('#saved').hidden=false;
  }catch(e){$('#setup-error').textContent=e.message||'ติดต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง';}
  finally{button.disabled=false;}
});
$('#save-password').disabled=true;
try{await refresh();$('#save-password').disabled=false;$('#current-password').focus();}catch(e){$('#setup-error').textContent=e.message;}
