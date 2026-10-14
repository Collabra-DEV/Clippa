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

/* Real upload + FFmpeg progress. Gemini ETA is explicitly an estimate. */
const progressPanel=document.createElement('section');
progressPanel.className='processing-panel';progressPanel.hidden=true;
progressPanel.innerHTML=`<div class="processing-heading"><span class="processing-star" aria-hidden="true">✦</span><div><span class="tag">CLIPPA IS WORKING</span><h2 id="progressTitle">Uploading your video</h2></div><strong id="progressPercent">0%</strong></div><progress id="overallProgress" max="100" value="0" aria-label="Estimated workflow progress"></progress><p id="progressDetail" role="status">Starting…</p><div class="processing-times"><span>Elapsed <b id="elapsedTime">0:00</b></span><span id="remainingTime">Estimating time…</span></div><ol class="processing-stages"><li data-stage="upload">Upload</li><li data-stage="prepare">Prepare</li><li data-stage="analyze">Find highlights</li><li data-stage="cut">Cut clips</li></ol><p class="muted">Overall progress follows the workflow stages. Time remaining is an estimate and may change. Keep this tab open.</p>`;
$('#studio .heading').after(progressPanel);
const clock=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
let progressStart=0,progressTimer=null;
function paintProgress(stage,percent,title,detail,eta){
  $('#progressTitle').textContent=title;$('#progressDetail').textContent=detail;
  $('#overallProgress').value=Math.max(Number($('#overallProgress').value),percent);
  $('#progressPercent').textContent=Math.round($('#overallProgress').value)+'%';
  $('#remainingTime').textContent=eta==null?'Estimating time remaining…':(stage==='upload'?'Upload remaining: ~':'Estimated remaining: ~')+clock(eta);
  const stages=['upload','prepare','analyze','cut'];
  document.querySelectorAll('.processing-stages li').forEach(li=>{li.classList.toggle('active',li.dataset.stage===stage);li.classList.toggle('done',stages.indexOf(li.dataset.stage)<stages.indexOf(stage)||stage==='ready')});
  progressPanel.classList.toggle('analyzing',stage==='analyze');
}
function startProgress(){progressPanel.hidden=false;$('#overallProgress').value=0;progressStart=Date.now();clearInterval(progressTimer);progressTimer=setInterval(()=>{$('#elapsedTime').textContent=clock((Date.now()-progressStart)/1000)},1000);paintProgress('upload',0,'Uploading your video','Connecting to the server…',null);progressPanel.scrollIntoView({behavior:'smooth',block:'center'})}
function uploadWithProgress(form){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();const started=Date.now();
  xhr.upload.addEventListener('progress',e=>{if(!e.lengthComputable)return;const fraction=e.loaded/e.total;const elapsed=(Date.now()-started)/1000;const eta=e.loaded>0&&elapsed>1?(e.total-e.loaded)/(e.loaded/elapsed):null;paintProgress('upload',fraction*20,'Uploading your video',Math.round(fraction*100)+'% uploaded · '+(e.loaded/1048576).toFixed(1)+' / '+(e.total/1048576).toFixed(1)+' MB',eta)});
  xhr.upload.addEventListener('load',()=>paintProgress('upload',20,'Checking your video','Upload sent. The server is validating the file…',null));
  xhr.addEventListener('load',()=>{let data;try{data=JSON.parse(xhr.responseText)}catch{return reject(new Error('Unexpected server response. Check your Render logs.'))}if(xhr.status<200||xhr.status>=300)return reject(new Error(typeof data.detail==='string'?data.detail:'Upload failed (HTTP '+xhr.status+').'));resolve(data)});
  xhr.addEventListener('error',()=>reject(new Error('Connection lost during upload. Please check your internet and Render status.')));
  xhr.addEventListener('timeout',()=>reject(new Error('Upload timed out after 20 minutes. Please try a smaller video.')));
  xhr.open('POST','/api/clips');xhr.timeout=20*60*1000;xhr.send(form);
})}
let jobRunning=false;
$('#generate').onclick=async()=>{
  if(jobRunning)return;
  const f=$('#file').files[0];if(!f)return toast('Choose your video file first.');
  if(f.size>200*1024*1024)return toast('Choose a video no larger than 200 MB.');
  if(!$('#aiConsent').checked)return toast('Please confirm permission to send this video to Gemini.');
  const form=new FormData();form.append('video',f);form.append('length',{'15–30 seconds':30,'30–60 seconds':60,'60–90 seconds':90}[$('#length').value]);form.append('format',$('#format').value);
  jobRunning=true;$('#generate').disabled=true;$('#file').disabled=true;$('#account').disabled=true;
  $('#clipResults').replaceChildren();$('#jobStatus').textContent='';startProgress();
  try{
    const data=await uploadWithProgress(form);if(!data.job)throw new Error('Server did not return a job.');
    const deadline=Date.now()+35*60*1000;let failures=0;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,2000));let job;
      try{const res=await fetch('/api/jobs/'+encodeURIComponent(data.job),{cache:'no-store',signal:AbortSignal.timeout(20000)});job=await res.json();if(!res.ok)throw new Error(job.detail||'Job expired or server restarted.');failures=0}catch(e){if(++failures>=4)throw e;$('#progressDetail').textContent='Connection interrupted. Retrying…';continue}
      if(job.status==='error')throw new Error(job.message);
      const stage=job.stage||'prepare';
      paintProgress(stage,job.progress||20,job.message||'Processing…',stage==='analyze'?'Gemini is reviewing your video. Its completion time is estimated.':job.stageProgress==null?'Waiting for progress…':job.stageProgress+'% of this stage complete',job.etaSeconds);
      if(job.status==='ready'){
        for(const [i,c] of job.clips.entries()){const card=document.createElement('article');card.className='card';const title=document.createElement('h3');title.textContent=c.title;const meta=document.createElement('p');meta.textContent=Number(c.start).toFixed(1)+'s – '+Number(c.end).toFixed(1)+'s';const player=document.createElement('video');player.controls=true;player.playsInline=true;player.preload='metadata';player.src=c.url;const link=document.createElement('a');link.className='primary';link.href=c.url;link.download='clippa-clip-'+(i+1)+'.mp4';link.textContent='Download MP4';card.append(title,meta,player,link);$('#clipResults').append(card)}
        paintProgress('ready',100,'Your clips are ready!','Download your clips below. Temporary exports expire in about an hour.',0);$('#jobStatus').textContent='Your clips are ready to download.';return;
      }
    }
    throw new Error('Processing took too long. Try a shorter video.');
  }catch(e){$('#progressTitle').textContent='Processing stopped';$('#progressDetail').textContent=e.message;$('#remainingTime').textContent='Please try again';progressPanel.classList.remove('analyzing');$('#jobStatus').textContent=e.message}
  finally{clearInterval(progressTimer);jobRunning=false;$('#generate').disabled=false;$('#file').disabled=false;$('#account').disabled=false}
};
fetch('/api/status',{cache:'no-store'}).then(r=>r.json()).then(s=>{if(!jobRunning&&s.version!=='progress-2026-10-11')$('#jobStatus').textContent='Deploy the new server.py to activate processing progress.'}).catch(()=>{if(!jobRunning)$('#jobStatus').textContent='Check your Render Web Service connection.'});

$('#homeSignIn').onclick=()=>{if(session){show('projects');loadProjects()}else authOpen()};

window.addEventListener("beforeunload",event=>{if(jobRunning){event.preventDefault();event.returnValue=""}});
