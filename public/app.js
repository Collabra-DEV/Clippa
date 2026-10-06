const $=s=>document.querySelector(s),cfg=window.CLIPPA_CONFIG||{};
let session=null,signup=false,videoUrl=null;
const configured=()=>/^https:\/\//.test(cfg.supabaseUrl)&&!!cfg.supabaseAnonKey;
try{session=JSON.parse(sessionStorage.getItem('clippa-session')||'null')}catch{}
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}
function show(id){$('#backHome').hidden=id==='home';for(const s of document.querySelectorAll('main>section'))s.hidden=s.id!==id;window.scrollTo(0,0)}
function clearWork(){if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null;$('#video').removeAttribute('src');$('#video').hidden=true;$('#file').value='';$('#filename').textContent='';$('#name').value='';$('#result').hidden=true;$('#clipResults').replaceChildren();$('#jobStatus').textContent='';$('#projectList').replaceChildren()}
function applySession(){ $('#account').textContent=session?'Sign out':'Sign in';$('#projectsNav').hidden=!session;$('#save').textContent=session?'Save project settings':'Sign in to save';$('#saveHint').textContent=session?'Your account can save project titles and settings.':'Guest mode: your work disappears when you refresh or leave.'}
function authOpen(){ $('#authStatus').textContent=configured()?'':'Accounts are not connected yet. You can continue as a guest.';$('#authSubmit').disabled=!configured();$('#auth').showModal()}
async function request(path,{method='GET',body,token=null}={}){let response=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method,headers:{apikey:cfg.supabaseAnonKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});let data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||'Request failed. Please try again.');return data}
async function activeToken(){if(!session)throw new Error('Please sign in.');if(session.expires_at<Date.now()/1000+60){try{const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});session=next;session.expires_at=Date.now()/1000+next.expires_in;sessionStorage.setItem('clippa-session',JSON.stringify(session));}catch(e){session=null;sessionStorage.removeItem('clippa-session');clearWork();applySession();show('home');throw new Error('Your session expired. Please sign in again.')}}return session.access_token}
for(const b of document.querySelectorAll('[data-go]'))b.onclick=()=>show(b.dataset.go);
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$('#'+b.dataset.close).close();
$('#termsLink').onclick=$('#authTerms').onclick=()=>$('#terms').showModal();
$('#contactText').textContent=cfg.contactEmail?'Contact: '+cfg.contactEmail:'Operator contact has not been configured. This preview is not ready for public account registration.';
$('#year').textContent=new Date().getFullYear();
$('#account').onclick=async()=>{if(!session)return authOpen();try{await request('/auth/v1/logout',{method:'POST',token:await activeToken()})}catch{}session=null;sessionStorage.removeItem('clippa-session');clearWork();applySession();show('home');toast('Signed out. Your saved settings stay in your account.')};
$('#toggleAuth').onclick=()=>{signup=!signup;$('#authTitle').textContent=signup?'Create your account.':'Welcome back.';$('#displayLabel').hidden=!signup;$('#consentLabel').hidden=!signup;$('#consent').required=signup;$('#password').autocomplete=signup?'new-password':'current-password';$('#authSubmit').textContent=signup?'Create account':'Sign in';$('#toggleAuth').textContent=signup?'Already have an account? Sign in':'New here? Create an account';$('#authStatus').textContent=''};
$('#authForm').onsubmit=async e=>{e.preventDefault();if(!configured())return;if(signup&&!cfg.contactEmail){$('#authStatus').textContent='Account registration opens after the operator configures a support contact.';return}$('#authSubmit').disabled=true;try{const body={email:$('#email').value.trim(),password:$('#password').value};if(signup)body.data={display_name:$('#displayName').value.trim(),terms_accepted_at:new Date().toISOString(),terms_version:'2026-10-05'};const data=await request(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body});const result=data.access_token?data:data.session;if(!result?.access_token){$('#authStatus').textContent='Check your email to confirm your account, then come back and sign in.';$('#password').value='';return}clearWork();session=result;session.expires_at=Date.now()/1000+result.expires_in;sessionStorage.setItem('clippa-session',JSON.stringify(session));applySession();$('#auth').close();$('#password').value='';show('studio');toast('Signed in. You can now save project settings.')}catch(err){$('#authStatus').textContent=err.message}finally{$('#authSubmit').disabled=false}};
$('#file').onchange=()=>{const f=$('#file').files[0];if(!f)return;if(!f.type.startsWith('video/'))return toast('Please choose a video file.');if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(f);$('#video').src=videoUrl;$('#video').hidden=false;$('#filename').textContent=f.name;if(!$('#name').value)$('#name').value=f.name.slice(0,100)};
$('#video').onerror=()=>toast('Your browser cannot preview this video format. Try MP4 or WebM.');
function settings(){return {title:$('#name').value.trim()||'Untitled project',clip_length:$('#length').value,caption_style:$('#caption').value}}
$('#preview').onclick=()=>{if(!videoUrl)return toast('Choose a video first.');const s=settings();$('#resultText').textContent=s.title+' · '+s.clip_length+' · '+s.caption_style+' captions';$('#result').hidden=false};
$('#save').onclick=async()=>{if(!session)return authOpen();$('#save').disabled=true;try{const token=await activeToken();await request('/rest/v1/projects',{method:'POST',token,body:{...settings(),user_id:session.user.id}});toast('Project settings saved. Video files are not saved.')}catch(e){toast(e.message)}finally{$('#save').disabled=false}};
$('#projectsNav').onclick=()=>{show('projects');loadProjects()};
async function loadProjects(){const list=$('#projectList');list.textContent='Loading your projects…';try{const token=await activeToken();const rows=await request('/rest/v1/projects?select=id,title,clip_length,caption_style,created_at&order=created_at.desc',{token});list.replaceChildren();if(!rows.length){list.textContent='No saved projects yet. Create a clip setup and choose Save project settings.';return}for(const p of rows){const row=document.createElement('article');row.className='card project-row';const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('p');title.textContent=p.title;meta.textContent=p.clip_length+' · '+p.caption_style+' · '+new Date(p.created_at).toLocaleDateString();info.append(title,meta);const actions=document.createElement('div'),open=document.createElement('button'),del=document.createElement('button');open.textContent='Open settings';open.className='outline';open.onclick=()=>{clearWork();$('#name').value=p.title;$('#length').value=p.clip_length;$('#caption').value=p.caption_style;show('studio');toast('Settings opened. Choose the original video again to preview it.')};del.textContent='Delete';del.onclick=async()=>{if(!confirm('Delete this saved project?'))return;del.disabled=true;try{await request('/rest/v1/projects?id=eq.'+encodeURIComponent(p.id),{method:'DELETE',token:await activeToken()});loadProjects()}catch(e){toast(e.message);del.disabled=false}};actions.append(open,del);row.append(info,actions);list.append(row)}}catch(e){list.textContent=e.message}}
applySession();

let jobRunning=false;
$('#generate').onclick=async()=>{
  if(jobRunning)return;
  const f=$('#file').files[0];
  if(!f)return toast('Choose your video file first.');
  if(f.size>12*1024*1024)return toast('Choose a video smaller than 12 MB.');
  if(!$('#aiConsent').checked)return toast('Please confirm permission to send this video to Gemini.');
  const form=new FormData();form.append('video',f);form.append('length',{'15–30 seconds':30,'30–60 seconds':60,'60–90 seconds':90}[$('#length').value]);form.append('format',$('#format').value);
  jobRunning=true;$('#generate').disabled=true;$('#clipResults').replaceChildren();$('#jobStatus').textContent='Uploading your video…';
  try{
    const res=await fetch('/api/clips',{method:'POST',body:form});const data=await res.json();if(!res.ok)throw new Error(data.detail||'Upload failed.');
    const deadline=Date.now()+15*60*1000;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,2500));const response=await fetch('/api/jobs/'+encodeURIComponent(data.job));const job=await response.json();if(!response.ok)throw new Error(job.detail||'Session expired.');
      $('#jobStatus').textContent=job.message;
      if(job.status==='error')throw new Error(job.message);
      if(job.status==='ready'){
        for(const c of job.clips){const card=document.createElement('article');card.className='card';const title=document.createElement('h3');title.textContent=c.title;const meta=document.createElement('p');meta.textContent=c.start.toFixed(1)+'s – '+c.end.toFixed(1)+'s';const player=document.createElement('video');player.controls=true;player.src=c.url;const link=document.createElement('a');link.className='primary';link.href=c.url;link.download='clippa-clip.mp4';link.textContent='Download MP4';card.append(title,meta,player,link);$('#clipResults').append(card)}
        $('#jobStatus').textContent='Ready! Download your clips now. Temporary exports expire in about an hour.';return;
      }
    }
    throw new Error('Processing took too long. Please try a shorter video.');
  }catch(e){$('#jobStatus').textContent=e.message}finally{jobRunning=false;$('#generate').disabled=false}
};
fetch('/api/status').then(r=>r.json()).then(s=>{if(!s.configured)$('#jobStatus').textContent='Add GEMINI_API_KEY in Render to activate clipping.'}).catch(()=>{$('#jobStatus').textContent='Clipping needs the included backend. Deploy this version as a Render Web Service.'});

$('#homeSignIn').onclick=()=>{if(session)show('projects'),loadProjects();else authOpen()};
