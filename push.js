// ══════════════════════════════════════════════════════
// AUTH & INIT
// ══════════════════════════════════════════════════════
let currentUser=null, currentProfile=null;
const ROLE_LABELS={admin:'Администратор',manager:'Менеджер',production:'Производство',accounting:'Бухгалтерия'};

async function doLogin(){
  const email=$('login-email').value.trim();
  const pass=$('login-pass').value;
  const err=$('login-error');
  const btn=$('login-btn');
  if(!email||!pass){err.textContent='Введите email и пароль';err.style.display='';return}
  btn.textContent='Вхожу...'; btn.disabled=true;
  err.style.display='none';
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error) throw error;
    await initApp(data.user);
  }catch(e){
    err.textContent='Ошибка: '+(e.message==='Invalid login credentials'?'Неверный email или пароль':e.message);
    err.style.display='';
  }
  btn.textContent='Войти'; btn.disabled=false;
}

async function doLogout(){
  await sb.auth.signOut();
  currentUser=null; currentProfile=null;
  $('app').classList.remove('visible');
  $('login-screen').style.display='flex';
  $('login-pass').value='';
}

async function checkAuth(){
  const {data:{session}}=await sb.auth.getSession();
  if(session&&session.user){
    $('login-screen').style.display='none';
    await initApp(session.user);
  }
}

async function initApp(user){
  currentUser=user;
  $('login-screen').style.display='none';
  $('app').classList.add('visible');
  
  // Загружаем профиль
  const {data:profile,error:profErr}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(profErr) console.error('Profile load error:',profErr);
  console.log('Profile loaded:',profile);
  currentProfile=profile||{role:'manager',full_name:user.email};
  
  // Обновляем UI профиля
  const initials=(currentProfile.full_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  $('user-avatar').textContent=initials;
  $('user-name').textContent=currentProfile.full_name;
  $('user-role-label').textContent=ROLE_LABELS[currentProfile.role]||currentProfile.role;
  
  // Скрываем/показываем меню по роли
  applyRoleVisibility();
  
  // Загружаем данные
  sync('loading','Загрузка...');
  try{
    await Promise.all([loadCatalog(), loadOrders(), loadSkladSilent(), loadExpensesSilent(), loadClientsSilent(), loadAppSettings()]);
    loadProdStages();
    // Предзагрузка расценок и сотрудников для Цеха и карточки заказа
    try{
      const [rR,uR,wR]=await Promise.all([
        sb.from('work_rates').select('*').order('stage_key').order('sort_order'),
        sb.from('rate_units').select('*').order('id'),
        sb.from('workers').select('*').order('name')
      ]);
      payRates=rR.data||[];rateUnits=uR.data||[];payWorkers=wR.data||[];
    }catch(e){}
    sync('ok','K2 ✓');
    await loadChatMessages();
    subscribeChatRealtime();chatLoaded=true;updateChatOrderFilter();
    subscribeOrdersRealtime(); // Realtime подписка на изменения заказов
    renderDashboard();
    renderKanban();
    showChatFab();
    initPushNotifications();
    // Блокируем поворот экрана на мобильных
    try{if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('portrait').catch(()=>{})}catch(e){}
    // Проверяем просрочки и нехватку — уведомляем раз при входе
    checkOverdueNotify();
    checkLowStockNotify();
    checkRemindersNotify();
  }catch(e){
    sync('error','Ошибка загрузки');
  }
}

function applyRoleVisibility(){
  const role=currentProfile?.role||'manager';
  // Сайдбар
  document.querySelectorAll('.sidebar [data-roles]').forEach(el=>{
    const roles=el.dataset.roles.split(',');
    el.classList.toggle('nav-hidden',!roles.includes(role));
  });
  // Мобильная навигация
  document.querySelectorAll('.mob-nav [data-roles]').forEach(el=>{
    const roles=el.dataset.roles.split(',');
    el.style.display=roles.includes(role)?'':'none';
  });
  // Кнопки удаления — только для админа
  const delBtns=document.querySelectorAll('#del-btn');
  delBtns.forEach(b=>{if(role!=='admin')b.style.display='none'});
}

function hasRole(...roles){return roles.includes(currentProfile?.role)}

// ── USERS MANAGEMENT (Admin) ──────────────────────────
let allProfiles=[];

async function loadUsers(){
  const {data}=await sb.from('profiles').select('*').order('created_at');
  allProfiles=data||[];
  renderUsers();
}

function renderUsers(){
  if(!allProfiles.length){$('users-body').innerHTML='<div class="empty-state">Нет пользователей</div>';return}
  let h=`<table><thead><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Статус</th><th></th></tr></thead><tbody>`;
  allProfiles.forEach(p=>{
    const isMe=p.id===currentUser?.id;
    const roleBadge={admin:'b-kp',manager:'b-new',production:'b-work',accounting:'b-ship'}[p.role]||'b-done';
    h+=`<tr>
      <td style="font-weight:500">${p.full_name||'—'} ${isMe?'<span style="font-size:10px;color:var(--accent)">(вы)</span>':''}</td>
      <td style="font-size:12px;color:var(--text2)">${p.email}</td>
      <td><select class="inline-status ${roleBadge}" onchange="changeUserRole('${p.id}',this.value)" ${isMe?'disabled':''}>
        <option value="admin" ${p.role==='admin'?'selected':''}>Админ</option>
        <option value="manager" ${p.role==='manager'?'selected':''}>Менеджер</option>
        <option value="production" ${p.role==='production'?'selected':''}>Производство</option>
        <option value="accounting" ${p.role==='accounting'?'selected':''}>Бухгалтерия</option>
      </select></td>
      <td><span class="badge ${p.is_active?'b-ready':'b-pause'}">${p.is_active?'Активен':'Отключён'}</span></td>
      <td>${!isMe?`<button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="toggleUserActive('${p.id}',${!p.is_active})">${p.is_active?'Откл.':'Вкл.'}</button>`:''}</td>
    </tr>`;
  });
  h+='</tbody></table>';
  $('users-body').innerHTML=h;
}

async function changeUserRole(uid,newRole){
  try{
    const {error}=await sb.from('profiles').update({role:newRole}).eq('id',uid);
    if(error) throw error;
    const p=allProfiles.find(x=>x.id===uid);if(p)p.role=newRole;
    renderUsers();
    showToast('Роль изменена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function toggleUserActive(uid,active){
  try{
    const {error}=await sb.from('profiles').update({is_active:active}).eq('id',uid);
    if(error) throw error;
    const p=allProfiles.find(x=>x.id===uid);if(p)p.is_active=active;
    renderUsers();
    showToast(active?'Пользователь активирован':'Пользователь отключён');
  }catch(e){showToast('Ошибка: '+e.message)}
}

function openAddUser(){
  $('nu-name').value=''; $('nu-email').value=''; $('nu-pass').value=''; $('nu-role').value='manager';
  $('m-add-user').classList.add('open');
}

async function createUser(){
  const name=$('nu-name').value.trim();
  const email=$('nu-email').value.trim();
  const pass=$('nu-pass').value;
  const role=$('nu-role').value;
  if(!name||!email||!pass){showToast('Заполните все поля');return}
  if(pass.length<6){showToast('Пароль минимум 6 символов');return}
  try{
    // Создаём через Supabase Auth Admin API (используем service_role если есть,
    // или через обычный signUp + потом обновляем)
    const {data,error}=await sb.auth.signUp({
      email,password:pass,
      options:{data:{full_name:name,role:role}}
    });
    if(error) throw error;
    // Обновляем роль в профиле
    if(data.user){
      await sb.from('profiles').update({role,full_name:name}).eq('id',data.user.id);
    }
    $('m-add-user').classList.remove('open');
    await loadUsers();
    showToast('Пользователь '+name+' создан');
  }catch(e){showToast('Ошибка: '+e.message)}
}


