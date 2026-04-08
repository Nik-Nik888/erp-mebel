// ══════════════════════════════════════════════════════
// SUPABASE INIT
// ══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://vrqjjpcaisgbxhwvhezo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZycWpqcGNhaXNnYnhod3ZoZXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTgyMjQsImV4cCI6MjA4OTI3NDIyNH0.U3gMK5cUczd9nIG9s5c7oZZg5OjFuB2AGxxVbMvKmvY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── TELEGRAM NOTIFICATIONS ────────────────────────────
const TG_BOT_TOKEN='8375207009:AAHT2F6tIkG1IbYwbWl1ig-490cDy61P9mM';
const TG_CHAT_ID='-5177480365';

async function tgSend(text){
  try{
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:TG_CHAT_ID,text,parse_mode:'HTML',disable_web_page_preview:true})
    });
  }catch(e){console.log('TG error:',e)}
}

function tgNotify(type,data){
  const who=currentProfile?.full_name||'Система';
  let msg='';
  switch(type){
    case 'new_order':
      msg=`📋 <b>Новый заказ</b>\n${data.order_num} — ${data.client||'—'}\n${data.description||''}\n👤 ${who}`;
      break;
    case 'new_kp':
      msg=`📄 <b>Новое КП</b>\n${data.order_num} — ${data.client||'—'}\nСумма: ${data.sum||'—'}\n👤 ${who}`;
      break;
    case 'status_change':
      msg=`🔄 <b>Статус изменён</b>\n${data.order_num} — ${data.client||'—'}\n${data.oldStatus} → <b>${data.newStatus}</b>\n👤 ${who}`;
      break;
    case 'payment':
      msg=`💰 <b>Оплата</b>\n${data.order_num} — ${data.client||'—'}\n+${data.amount} ₽ (всего ${data.total} ₽ из ${data.sum} ₽)\n👤 ${who}`;
      break;
    case 'overdue':
      msg=`⚠️ <b>Просрочка!</b>\n${data.order_num} — ${data.client||'—'}\nДедлайн: ${data.deadline}\nСтатус: ${data.status}`;
      break;
    case 'low_stock':
      msg=`📦 <b>Мало на складе</b>\n${data.name}: осталось ${data.stock} (мин. ${data.min})\nНужно заказать!`;
      break;
    case 'reminder':
      msg=data.text;
      break;
  }
  if(msg) tgSend(msg);
}

// ── STATUS LOG ────────────────────────────────────────
async function logStatusChange(orderNum, oldStatus, newStatus){
  const who=currentProfile?.full_name||currentProfile?.email||'—';
  try{
    await sb.from('order_status_log').insert({
      order_num:orderNum, old_status:oldStatus||'', new_status:newStatus, changed_by:who
    });
  }catch(e){}
  // Также пишем в audit_log
  auditLog('status_change','order',orderNum,{old:oldStatus,new:newStatus});
}

// ── AUDIT LOG — единая система логирования ──
async function auditLog(action,entity,entityId,details){
  try{
    await sb.from('audit_log').insert({
      user_id:currentProfile?.id||null,
      user_name:currentProfile?.full_name||currentProfile?.email||'—',
      action,
      entity,
      entity_id:String(entityId||''),
      details:details||{}
    });
  }catch(e){console.log('Audit error:',e)}
}

async function getStatusLog(orderNum){
  try{
    const {data}=await sb.from('order_status_log').select('*').eq('order_num',orderNum).order('changed_at',{ascending:true});
    return data||[];
  }catch(e){return[]}
}

function formatDuration(ms){
  if(ms<0) ms=0;
  const mins=Math.floor(ms/60000);
  const hrs=Math.floor(mins/60);
  const days=Math.floor(hrs/24);
  if(days>0) return days+'д '+(hrs%24)+'ч';
  if(hrs>0) return hrs+'ч '+(mins%60)+'м';
  return mins+'м';
}

let orders = [], tab = 'all', editId = null, commentId = null, prepayId = null;
let kpMats = 0, kpWorks = 0, kpInited = false;
let MAT_CATALOG = [], WORK_CATALOG = [];

// ── UTILS ──────────────────────────────────────────────
function $(x){ return document.getElementById(x) }
function fmt(n){ return Math.round(n).toLocaleString('ru-RU')+' ₽' }
function fmtK(n){ return n>=1000?Math.round(n/1000)+'к ₽':Math.round(n)+' ₽' }
function pDate(v){ if(!v)return null; const d=new Date(v); return isNaN(d)?null:d }
function badgeClass(st){ return{'Отправлено КП':'b-kp',Новый:'b-new','Материал заказан':'b-kp','В работе':'b-work','Готов к выдаче':'b-ready',Отгружен:'b-ship',Закрыт:'b-done',Приостановлен:'b-pause',Рекламация:'b-refuse',Отказались:'b-refuse'}[st]||'b-done' }
function showToast(msg){ const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500) }
function sync(state,txt){
  // Используется только при первой загрузке (initApp)
  console.log('Sync:',state,txt);
}

async function refreshWith(btn,fn){
  if(btn.classList.contains('loading')) return; // уже обновляется
  btn.classList.remove('done','fail');
  btn.classList.add('loading');
  btn.textContent='↻';
  try{
    await fn();
    btn.classList.remove('loading');
    btn.classList.add('done');
    btn.textContent='✓';
    setTimeout(()=>{btn.classList.remove('done');btn.textContent='↻'},2000);
  }catch(e){
    btn.classList.remove('loading');
    btn.classList.add('fail');
    btn.textContent='✗';
    setTimeout(()=>{btn.classList.remove('fail');btn.textContent='↻'},3000);
  }
}

// ── NAV ───────────────────────────────────────────────
function toggleSidebar(){
  const sb2=$('sidebar');
  sb2.classList.toggle('collapsed');
  localStorage.setItem('k2_sidebar_collapsed',sb2.classList.contains('collapsed')?'1':'0');
}
// Восстанавливаем состояние из localStorage
if(localStorage.getItem('k2_sidebar_collapsed')==='1'){
  document.addEventListener('DOMContentLoaded',()=>{const s=$('sidebar');if(s)s.classList.add('collapsed')});
}

function showPage(p, el){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item,.mnav-btn').forEach(x=>x.classList.remove('active'));
  $('page-'+p).classList.add('active');
  if(el) el.classList.add('active');
  if(p==='kp'){
    if(!kpInited){ initKp(); kpInited=true }
    // Убедимся что данные склада загружены для материалов КП
    if(!skladItems.length) loadSkladSilent();
  }
  if(p==='sklad') loadSklad();
  if(p==='expenses') loadExpenses();
  if(p==='analytics'){
    if(!analyticsInited){ setAPeriod('year'); analyticsInited=true; }
    else renderAnalytics();
  }
  if(p==='users') loadUsers();
  if(p==='crm') loadClients();
  if(p==='dashboard') renderDashboard();
  if(p==='calendar') renderGantt();
  if(p==='workshop') renderWorkshop();
  if(p==='payroll') initPayroll();
  if(p==='audit') loadAuditLog();
}
function syncMobNav(p){
  document.querySelectorAll('.mnav-btn').forEach(x=>x.classList.remove('active'));
  const el=$('mn-'+p); if(el) el.classList.add('active');
  // Закрываем меню "Ещё"
  const more=$('mob-more-menu');if(more)more.style.display='none';
}

function toggleMobMore(){
  const m=$('mob-more-menu');
  if(!m) return;
  const show=m.style.display==='none';
  m.style.display=show?'':'none';
  if(show){
    setTimeout(()=>{
      document.addEventListener('click',function closeMobMore(e){
        if(!m.contains(e.target)&&e.target.id!=='mn-more'){
          m.style.display='none';
          document.removeEventListener('click',closeMobMore);
        }
      });
    },10);
  }
}

// ── PERIOD ────────────────────────────────────────────
function setPeriod(mode){
  const now=new Date();
  if(mode==='month'){
    const from=new Date(now.getFullYear(),now.getMonth(),1);
    const to=new Date(now.getFullYear(),now.getMonth()+1,0);
    $('p-from').value=from.toISOString().split('T')[0];
    $('p-to').value=to.toISOString().split('T')[0];
  } else if(mode==='prev'){
    const from=new Date(now.getFullYear(),now.getMonth()-1,1);
    const to=new Date(now.getFullYear(),now.getMonth(),0);
    $('p-from').value=from.toISOString().split('T')[0];
    $('p-to').value=to.toISOString().split('T')[0];
  } else { $('p-from').value=''; $('p-to').value=''; }
  updateStats();
  renderKanban();
}

// ── STATS ─────────────────────────────────────────────
function getFilteredByPeriod(){
  const q=($('q')?.value||'').toLowerCase();
  const mgr=$('f-mgr')?.value||'';
  const src=$('f-src')?.value||'';
  const from=$('p-from')?.value?new Date($('p-from').value):null;
  const to=$('p-to')?.value?new Date($('p-to').value+'T23:59:59'):null;
  return orders.filter(o=>{
    if(mgr&&(o.manager||'').trim()!==mgr) return false;
    if(src&&(o.source||'').trim()!==src) return false;
    if(q){
      if(!(o.client||'').toLowerCase().includes(q)&&
         !(o.description||'').toLowerCase().includes(q)&&
         !(o.order_num||'').toLowerCase().includes(q)) return false;
    }
    if(from||to){
      const d=pDate(o.order_date); if(!d) return false;
      if(from&&d<from) return false;
      if(to&&d>to) return false;
    }
    return true;
  });
}

function updateStats(){
  const today=new Date(); today.setHours(0,0,0,0);
  const INACTIVE=['Закрыт','Отгружен','Отправлено КП','Отказались'];
  const active=orders.filter(o=>{ const s=(o.status||'').trim(); return !INACTIVE.includes(s)&&s!=='' });
  const over=orders.filter(o=>{
    const d=pDate(o.deadline); if(!d) return false; d.setHours(0,0,0,0);
    const s=(o.status||'').trim(); return d<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  const ready=orders.filter(o=>(o.status||'').trim()==='Готов к выдаче');
  const po=getFilteredByPeriod().filter(o=>{const s=(o.status||'').trim();return s!=='Отправлено КП'&&s!=='Отказались'});
  const contracts=po.reduce((s,o)=>s+(parseFloat(o.order_sum)||0),0);
  const received=po.reduce((s,o)=>s+(parseFloat(o.prepay)||0),0);

  $('s-active').textContent=active.length;
  $('s-over').textContent=over.length;
  $('s-ready').textContent=ready.length;
  $('s-count').textContent=po.length;
  $('s-contracts').textContent=fmtK(contracts);
  $('s-received').textContent=fmtK(received);

  const pAll=getFilteredByPeriod().length;
  const pDone=getFilteredByPeriod().filter(o=>(o.status||'').trim()==='Закрыт').length;
  const cnt={kp:0,new:0,matorder:0,work:0,ready:0,ship:0,pause:0,reclam:0,refuse:0};
  orders.forEach(o=>{
    const s=(o.status||'').trim();
    if(s==='Отправлено КП')cnt.kp++;
    else if(s==='Новый')cnt.new++;
    else if(s==='Материал заказан')cnt.matorder++;
    else if(s==='В работе')cnt.work++;
    else if(s==='Готов к выдаче')cnt.ready++;
    else if(s==='Отгружен')cnt.ship++;
    else if(s==='Приостановлен')cnt.pause++;
    else if(s==='Рекламация')cnt.reclam++;
    else if(s==='Отказались')cnt.refuse++;
  });
  const tc=$('tc-all'); if(tc)tc.textContent=pAll;
  const td=$('tc-done'); if(td)td.textContent=pDone;
  const to2=$('tc-over2'); if(to2)to2.textContent=over.length;
  ['kp','new','matorder','work','ready','ship','pause','reclam','refuse'].forEach(k=>{const el=$('tc-'+k);if(el)el.textContent=cnt[k]});
}

