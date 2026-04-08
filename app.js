// ══════════════════════════════════════════════════════
// ЗАПУСК
// ══════════════════════════════════════════════════════
checkAuth();

// Floating chat widget — inject HTML
document.body.insertAdjacentHTML('beforeend',`
<!-- Плавающая кнопка чата -->
<div id="chat-fab" onclick="toggleChatWidget()" style="position:fixed;bottom:24px;right:24px;z-index:200;width:48px;height:48px;border-radius:50%;background:var(--text);color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);font-size:20px;transition:transform 0.2s">
  💬<span id="chat-unread" style="display:none;position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:var(--red);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center"></span>
</div>
<!-- Окно чата -->
<div id="chat-widget" style="display:none;position:fixed;bottom:80px;right:24px;z-index:201;width:380px;max-width:calc(100vw - 48px);height:500px;max-height:calc(100vh - 140px);background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 12px 40px rgba(0,0,0,0.2);flex-direction:column;overflow:hidden">
  <!-- Шапка -->
  <div style="background:var(--text);color:#fff;border-radius:var(--r) var(--r) 0 0;flex-shrink:0">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px">
      <div style="font-size:14px;font-weight:600">💬 Чат K2</div>
      <button onclick="toggleChatWidget()" style="background:none;border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;padding:2px">×</button>
    </div>
    <div style="display:flex;gap:4px;padding:0 10px 8px;align-items:center">
      <input type="text" id="chat-search-pc" placeholder="🔍" oninput="renderChatMessages()" style="flex:1;background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:4px;padding:4px 8px;font-size:11px;font-family:'Geologica',sans-serif;outline:none;min-width:0">
      <select id="chat-filter-order" onchange="renderChatMessages()" style="background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:4px;padding:4px;font-size:10px;font-family:'Geologica',sans-serif;max-width:90px">
        <option value="">Все</option>
      </select>
      <select id="chat-filter-user-pc" onchange="renderChatMessages()" style="background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:4px;padding:4px;font-size:10px;font-family:'Geologica',sans-serif;max-width:80px">
        <option value="">Все</option>
      </select>
    </div>
  </div>
  <!-- Сообщения -->
  <div id="chat-messages" style="flex:1;overflow-y:auto;padding:10px 12px"></div>
  <!-- Привязка -->
  <div id="chat-link-bar" style="display:none;background:var(--accent-light);padding:4px 12px;font-size:11px;align-items:center;gap:6px">
    <span>📎</span><span id="chat-link-num" style="font-weight:600"></span>
    <button onclick="chatUnlink()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;margin-left:auto">×</button>
  </div>
  <!-- Ввод -->
  <div style="display:flex;gap:6px;padding:8px 12px;border-top:1px solid var(--border)">
    <button onclick="openChatLinkPicker()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:13px;flex-shrink:0" title="Привязать к заказу">📎</button>
    <input type="text" id="chat-input" placeholder="Сообщение..." onkeydown="if(event.key==='Enter')sendChatMsg()" style="flex:1;border:none;outline:none;font-size:13px;font-family:'Geologica',sans-serif;color:var(--text);background:transparent;min-width:0">
    <button onclick="sendChatMsg()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:12px;font-family:'Geologica',sans-serif;font-weight:500;flex-shrink:0">→</button>
  </div>
</div>
`);

// Показываем кнопку чата после авторизации
function showChatFab(){
  if(!isMobile()) $('chat-fab').style.display='flex';
}

// ══════════════════════════════════════════════════════
// PUSH-УВЕДОМЛЕНИЯ (Web Push через Edge Function)
// ══════════════════════════════════════════════════════
const VAPID_PUBLIC_KEY='BMhHqA74__bsrNOryiA7hvhiCHGHy9gTb49LoVjmIiEAdJ5pb32S_t-CHld4prLhjisWoTwk0obsF29MQ-FROzE';
const PUSH_FUNCTION_URL='https://vrqjjpcaisgbxhwvhezo.supabase.co/functions/v1/send-push';

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
}

async function requestPushPermission(){
  if(!('Notification' in window)) return false;
  if(Notification.permission==='granted') return true;
  if(Notification.permission==='denied') return false;
  const result=await Notification.requestPermission();
  return result==='granted';
}

async function subscribePush(){
  try{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)) return null;
    const reg=await navigator.serviceWorker.ready;
    // Проверяем существующую подписку
    let sub=await reg.pushManager.getSubscription();
    if(sub) return sub;
    // Создаём новую
    sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    return sub;
  }catch(e){console.log('Push subscribe error:',e);return null}
}

async function savePushSubscription(sub){
  if(!sub||!currentProfile?.id) return;
  const key=sub.toJSON();
  try{
    // Upsert — обновляем или вставляем
    await sb.from('push_subscriptions').upsert({
      user_id:currentProfile.id,
      endpoint:key.endpoint,
      p256dh:key.keys.p256dh,
      auth:key.keys.auth
    },{onConflict:'endpoint'});
    console.log('Push subscription saved');
  }catch(e){console.log('Save push sub error:',e)}
}

async function initPushNotifications(){
  const granted=await requestPushPermission();
  if(!granted) return;
  const sub=await subscribePush();
  if(sub) await savePushSubscription(sub);
}

// Отправить push всем подписчикам (кроме отправителя)
async function sendPushToAll(title,body){
  try{
    const {data:subs}=await sb.from('push_subscriptions').select('endpoint,p256dh,auth,user_id');
    if(!subs||!subs.length) return;
    // Фильтруем себя
    const others=subs.filter(s=>s.user_id!==currentProfile?.id);
    if(!others.length) return;
    
    const subscriptions=others.map(s=>({
      endpoint:s.endpoint,
      keys:{p256dh:s.p256dh,auth:s.auth}
    }));
    
    await fetch(PUSH_FUNCTION_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,body,subscriptions})
    });
  }catch(e){console.log('Send push error:',e)}
}

function showLocalNotification(title,body,tag){
  if(Notification.permission!=='granted') return;
  if(document.hasFocus()) return;
  try{
    const n=new Notification(title,{
      body,icon:'icon-192.png',tag:tag||'k2-notification',
      badge:'icon-192.png',vibrate:[200,100,200],requireInteraction:false
    });
    n.onclick=()=>{window.focus();n.close()};
    setTimeout(()=>n.close(),5000);
  }catch(e){
    if(navigator.serviceWorker&&navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(title,{body,icon:'icon-192.png',tag:tag||'k2-notification',vibrate:[200,100,200]});
      });
    }
  }
}

// PWA Service Worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(r=>{console.log('SW ok')}).catch(e=>{});
}
