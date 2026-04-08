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
