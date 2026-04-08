// ══════════════════════════════════════════════════════
// ЧАТ КОМАНДЫ
// ══════════════════════════════════════════════════════
let chatMessages=[];
let chatLinkedOrder='';
let chatSubscription=null;
let chatLoaded=false;
let chatWidgetOpen=false;
let chatUnreadCount=0;
let chatMobileOpen=false;

function isMobile(){return window.innerWidth<641}

function toggleChatWidget(){
  if(isMobile()){openMobileChat();return}
  chatWidgetOpen=!chatWidgetOpen;
  $('chat-widget').style.display=chatWidgetOpen?'flex':'none';
  if(chatWidgetOpen){
    if(!chatLoaded) initChat();
    chatUnreadCount=0;
    updateChatUnread();
    updateFaviconBadge(false);
    renderChatMessages();
    scrollChatBottom();
    $('chat-input')?.focus();
  }
}

function openMobileChat(){
  if(!chatLoaded) initChat();
  chatMobileOpen=true;
  chatUnreadCount=0;
  updateChatUnread();
  updateFaviconBadge(false);
  
  // Создаём полноэкранный чат если нет
  let mob=$('chat-mobile');
  if(!mob){
    mob=document.createElement('div');
    mob.id='chat-mobile';
    mob.style.cssText='position:fixed;inset:0;z-index:300;background:var(--surface);display:flex;flex-direction:column';
    mob.innerHTML=`
      <div style="background:var(--text);color:#fff;flex-shrink:0">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px">
          <div style="font-size:15px;font-weight:600">💬 Чат K2</div>
          <button onclick="closeMobileChat()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:4px">×</button>
        </div>
        <div style="display:flex;gap:6px;padding:0 12px 10px;align-items:center">
          <input type="text" id="chat-search-mob" placeholder="🔍 Поиск..." oninput="renderChatMessages()" style="flex:1;background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-family:'Geologica',sans-serif;outline:none;min-width:0">
          <select id="chat-filter-order-mob" onchange="$('chat-filter-order').value=this.value;renderChatMessages()" style="background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-family:'Geologica',sans-serif">
            <option value="">Все</option>
          </select>
          <select id="chat-filter-user-mob" onchange="renderChatMessages()" style="background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-family:'Geologica',sans-serif">
            <option value="">Все</option>
          </select>
        </div>
      </div>
      <div id="chat-messages-mob" style="flex:1;overflow-y:auto;padding:10px 12px"></div>
      <div id="chat-link-bar-mob" style="display:none;background:var(--accent-light);padding:4px 12px;font-size:11px;align-items:center;gap:6px;flex-shrink:0">
        <span>📎</span><span id="chat-link-num-mob" style="font-weight:600"></span>
        <button onclick="chatUnlink()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;margin-left:auto">×</button>
      </div>
      <div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0;padding-bottom:max(10px,env(safe-area-inset-bottom))">
        <button onclick="openChatLinkPicker()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:15px;flex-shrink:0">📎</button>
        <input type="text" id="chat-input-mob" placeholder="Сообщение..." onkeydown="if(event.key==='Enter')sendChatMsgMob()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;font-family:'Geologica',sans-serif;color:var(--text);outline:none;min-width:0">
        <button onclick="sendChatMsgMob()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:14px;font-family:'Geologica',sans-serif;font-weight:500;flex-shrink:0">→</button>
      </div>`;
    document.body.appendChild(mob);
  }
  mob.style.display='flex';
  // Синхронизируем фильтры
  const mobSel=$('chat-filter-order-mob');
  if(mobSel){const mainSel=$('chat-filter-order');if(mainSel) mobSel.innerHTML=mainSel.innerHTML}
  // Заполняем фильтр по пользователям
  const userSel=$('chat-filter-user-mob');
  if(userSel){
    const users=[...new Set(chatMessages.map(m=>m.user_name).filter(Boolean))];
    userSel.innerHTML='<option value="">Все</option>';
    users.forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;userSel.appendChild(o)});
  }
  renderChatMessages();
  scrollChatBottom();
  history.pushState(null,'',location.href);
}

function closeMobileChat(){
  chatMobileOpen=false;
  const mob=$('chat-mobile');
  if(mob) mob.style.display='none';
}

function sendChatMsgMob(){
  // Копируем текст из мобильного поля в основное и отправляем
  const mobInput=$('chat-input-mob');
  const mainInput=$('chat-input');
  if(mainInput&&mobInput){mainInput.value=mobInput.value}
  sendChatMsg();
  if(mobInput) mobInput.value='';
}

// Открыть чат с фильтром по заказу
function openChatForOrder(orderNum){
  if(isMobile()){
    openMobileChat();
    setTimeout(()=>{
      const sel=$('chat-filter-order-mob');
      if(sel){
        let found=false;
        for(const o of sel.options){if(o.value===orderNum){found=true;break}}
        if(!found){const opt=document.createElement('option');opt.value=orderNum;opt.textContent='📎 '+orderNum;sel.appendChild(opt)}
        sel.value=orderNum;
        $('chat-filter-order').value=orderNum;
      }
      renderChatMessages();
      scrollChatBottom();
    },100);
    return;
  }
  chatWidgetOpen=true;
  $('chat-widget').style.display='flex';
  if(!chatLoaded) initChat();
  const sel=$('chat-filter-order');
  if(sel){
    let found=false;
    for(const o of sel.options){if(o.value===orderNum){found=true;break}}
    if(!found){const opt=document.createElement('option');opt.value=orderNum;opt.textContent='📎 '+orderNum;sel.appendChild(opt)}
    sel.value=orderNum;
  }
  renderChatMessages();
  scrollChatBottom();
}

function updateChatUnread(){
  const badge=$('chat-unread');
  if(badge){badge.style.display=chatUnreadCount>0?'flex':'none';badge.textContent=chatUnreadCount}
  const mobBadge=$('chat-unread-mob');
  if(mobBadge){mobBadge.style.display=chatUnreadCount>0?'block':'none';mobBadge.textContent=chatUnreadCount}
}

async function initChat(){
  await loadChatMessages();
  subscribeChatRealtime();
  updateChatOrderFilter();
  chatLoaded=true;
  renderChatMessages();
  scrollChatBottom();
}

async function loadChatMessages(){
  try{
    const {data}=await sb.from('messages').select('*').order('created_at',{ascending:true}).limit(200);
    chatMessages=data||[];
  }catch(e){console.log('Chat load error:',e)}
}

function subscribeChatRealtime(){
  if(chatSubscription){
    try{sb.removeChannel(chatSubscription)}catch(e){}
    chatSubscription=null;
  }
  chatSubscription=sb.channel('chat-realtime')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{
      chatMessages.push(payload.new);
      const msg=payload.new;
      const isMe=msg.user_id===currentProfile?.id;
      
      if(chatWidgetOpen||chatMobileOpen){
        renderChatMessages();
        scrollChatBottom();
        if(!isMe) playChatSound();
      } else {
        chatUnreadCount++;
        updateChatUnread();
        updateFaviconBadge(true);
        if(!isMe){
          playChatSound();
          showLocalNotification(
            '💬 '+(msg.user_name||'Сообщение'),
            msg.text+(msg.order_num?' [📎'+msg.order_num+']':''),
            'chat-'+msg.id
          );
        }
      }
    })
    .subscribe((status)=>{
      console.log('Realtime status:',status);
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
        // Переподключение через 3 секунды
        setTimeout(()=>{
          console.log('Realtime reconnecting...');
          chatSubscription=null;
          subscribeChatRealtime();
        },3000);
      }
    });
}

// Переподключение при возврате вкладки в фокус
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&chatLoaded){
    // Перезагружаем свежие сообщения
    loadChatMessages().then(()=>{
      if(chatWidgetOpen||chatMobileOpen){renderChatMessages();scrollChatBottom()}
    });
  }
});

// Переподключение при восстановлении сети
window.addEventListener('online',()=>{
  console.log('Network online — reconnecting realtime');
  chatSubscription=null;
  subscribeChatRealtime();
  // Перезагружаем данные
  loadChatMessages().then(()=>{
    if(chatWidgetOpen||chatMobileOpen){renderChatMessages();scrollChatBottom()}
  });
});

// Звук уведомления чата
function playChatSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type='sine';
    // Два коротких тона — "дин-дон"
    osc.frequency.setValueAtTime(880,ctx.currentTime);
    osc.frequency.setValueAtTime(1100,ctx.currentTime+0.1);
    gain.gain.setValueAtTime(0.3,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime+0.25);
    // Вибрация на мобильном
    if(navigator.vibrate) navigator.vibrate([100,50,100]);
  }catch(e){}
}

// Бейдж на favicon — красная точка
const originalFavicon=document.querySelector('link[rel="icon"]')?.href||'';
function updateFaviconBadge(show){
  const link=document.querySelector('link[rel="icon"]');
  if(!link) return;
  if(!show){link.href=originalFavicon;document.title='K2 — ERP Мебель';return}
  // Меняем title
  document.title='('+chatUnreadCount+') K2 — ERP Мебель';
  // Рисуем красную точку на favicon
  try{
    const canvas=document.createElement('canvas');
    canvas.width=32;canvas.height=32;
    const ctx2=canvas.getContext('2d');
    // Жёлтый фон
    ctx2.fillStyle='#F5C518';
    ctx2.beginPath();ctx2.roundRect(0,0,32,32,[6]);ctx2.fill();
    // K2 текст
    ctx2.fillStyle='#1c1b18';ctx2.font='bold 16px sans-serif';
    ctx2.textAlign='center';ctx2.textBaseline='middle';
    ctx2.fillText('K2',16,16);
    // Красный кружок
    ctx2.fillStyle='#e11d48';
    ctx2.beginPath();ctx2.arc(26,6,6,0,Math.PI*2);ctx2.fill();
    link.href=canvas.toDataURL();
  }catch(e){}
}

function updateChatOrderFilter(){
  const sel=$('chat-filter-order');
  if(!sel) return;
  const orderNums=[...new Set(chatMessages.filter(m=>m.order_num).map(m=>m.order_num))];
  const cur=sel.value;
  sel.innerHTML='<option value="">Все</option>';
  orderNums.forEach(n=>{
    const opt=document.createElement('option');opt.value=n;opt.textContent='📎 '+n;
    if(n===cur) opt.selected=true;
    sel.appendChild(opt);
  });
  // User filter for PC
  const userSel=$('chat-filter-user-pc');
  if(userSel){
    const users=[...new Set(chatMessages.map(m=>m.user_name).filter(Boolean))];
    const curU=userSel.value;
    userSel.innerHTML='<option value="">Все</option>';
    users.forEach(u=>{const o=document.createElement('option');o.value=u;o.textContent=u;if(u===curU)o.selected=true;userSel.appendChild(o)});
  }
}

function renderChatMessages(){
  const container=$('chat-messages');
  if(!container) return;
  
  const filterOrder=$('chat-filter-order')?.value||'';
  const searchQ=($('chat-search-mob')?.value||$('chat-search-pc')?.value||'').toLowerCase();
  const filterUser=$('chat-filter-user-mob')?.value||$('chat-filter-user-pc')?.value||'';
  
  let msgs=chatMessages;
  if(filterOrder) msgs=msgs.filter(m=>m.order_num===filterOrder);
  if(searchQ) msgs=msgs.filter(m=>(m.text||'').toLowerCase().includes(searchQ)||(m.user_name||'').toLowerCase().includes(searchQ));
  if(filterUser) msgs=msgs.filter(m=>m.user_name===filterUser);
  
  if(!msgs.length){
    const emptyMsg=filterOrder?'Нет сообщений по заказу '+filterOrder:searchQ?'Ничего не найдено':'Нет сообщений';
    container.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">${emptyMsg}</div>`;
    const mc=$('chat-messages-mob');if(mc) mc.innerHTML=container.innerHTML;
    return;
  }
  
  let h='';
  let lastDate='';
  
  msgs.forEach(m=>{
    // Разделитель по дате
    const msgDate=new Date(m.created_at).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
    if(msgDate!==lastDate){
      lastDate=msgDate;
      h+=`<div style="text-align:center;margin:12px 0;font-size:10px;color:var(--text3)">${msgDate}</div>`;
    }
    
    const isMe=m.user_id===currentProfile?.id;
    const time=new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    const initials=(m.user_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const srcColors=getSourceColors();
    
    // Цвет аватара по имени
    const nameHash=(m.user_name||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const avatarColors=['#3b82f6','#8b5cf6','#16a34a','#b45309','#A32D2D','#0d9488','#6366f1'];
    const avatarColor=avatarColors[nameHash%avatarColors.length];
    
    h+=`<div style="display:flex;gap:8px;margin-bottom:8px;${isMe?'flex-direction:row-reverse':''}">
      <div style="width:32px;height:32px;border-radius:50%;background:${avatarColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${initials}</div>
      <div style="max-width:75%;${isMe?'text-align:right':''}">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${m.user_name||'—'} · ${time}</div>
        <div style="display:inline-block;background:${isMe?'var(--accent-light)':'var(--surface2)'};padding:8px 12px;border-radius:${isMe?'12px 12px 2px 12px':'12px 12px 12px 2px'};font-size:13px;color:var(--text);line-height:1.4;text-align:left;word-break:break-word">${escHtml(m.text)}`;
    
    // Привязка к заказу
    if(m.order_num){
      h+=`<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">
        <span onclick="event.stopPropagation();closeMobileChat();showPage('orders');setTimeout(()=>openEdit('${m.order_num}'),300)" style="font-size:10px;padding:2px 6px;border-radius:6px;background:var(--amber-light);color:var(--amber);font-weight:500;cursor:pointer">📎 ${m.order_num}</span>
      </div>`;
    }
    
    h+=`</div></div></div>`;
  });
  
  container.innerHTML=h;
  // Синхронизируем мобильный чат
  const mobContainer=$('chat-messages-mob');
  if(mobContainer) mobContainer.innerHTML=h;
}

function escHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function scrollChatBottom(){
  const c=$('chat-messages');
  if(c) setTimeout(()=>{c.scrollTop=c.scrollHeight},50);
  const cm=$('chat-messages-mob');
  if(cm) setTimeout(()=>{cm.scrollTop=cm.scrollHeight},50);
}

async function sendChatMsg(){
  const input=$('chat-input');
  const text=(input.value||'').trim();
  if(!text) return;
  
  const msg={
    user_id:currentProfile?.id||null,
    user_name:currentProfile?.full_name||'—',
    text:text,
    order_num:chatLinkedOrder||null
  };
  
  input.value='';
  chatUnlink();
  
  try{
    const {error}=await sb.from('messages').insert(msg);
    if(error) throw error;
    // Серверный push другим пользователям
    sendPushToAll('💬 '+(msg.user_name||'Сообщение'), text+(msg.order_num?' [📎'+msg.order_num+']':''));
  }catch(e){showToast('Ошибка: '+e.message)}
}

// Привязка к заказу
function chatUnlink(){
  chatLinkedOrder='';
  const lb=$('chat-link-bar');if(lb)lb.style.display='none';
  const lbm=$('chat-link-bar-mob');if(lbm)lbm.style.display='none';
}

function chatLinkOrder(orderNum){
  chatLinkedOrder=orderNum;
  const ln=$('chat-link-num');if(ln)ln.textContent=orderNum;
  const lb=$('chat-link-bar');if(lb)lb.style.display='flex';
  const lnm=$('chat-link-num-mob');if(lnm)lnm.textContent=orderNum;
  const lbm=$('chat-link-bar-mob');if(lbm)lbm.style.display='flex';
  const picker=$('chat-order-picker');
  if(picker) picker.remove();
  if(isMobile()){$('chat-input-mob')?.focus()}else{$('chat-input')?.focus()}
}

function openChatLinkPicker(){
  const old=$('chat-order-picker');
  if(old){old.remove();return}
  
  const INACTIVE=['Закрыт','Отгружен','Отказались'];
  const active=orders.filter(o=>!INACTIVE.includes((o.status||'').trim()));
  
  const picker=document.createElement('div');
  picker.id='chat-order-picker';
  
  if(isMobile()){
    // На мобильном — внизу экрана над клавиатурой
    picker.style.cssText='position:fixed;bottom:70px;left:12px;right:12px;max-height:250px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 -8px 24px rgba(0,0,0,0.15);z-index:310;padding:6px';
  } else {
    // На ПК — прямо над полем ввода в чат-виджете
    const widget=$('chat-widget');
    const wr=widget?widget.getBoundingClientRect():{right:400,bottom:140};
    picker.style.cssText=`position:fixed;bottom:${window.innerHeight-wr.bottom+50}px;right:${window.innerWidth-wr.right}px;width:${wr.width||360}px;max-height:250px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 -8px 24px rgba(0,0,0,0.15);z-index:310;padding:6px`;
  }
  
  let ph='<input type="text" id="chat-order-search" placeholder="Поиск заказа..." oninput="filterChatOrders(this.value)" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:14px;font-family:\'Geologica\',sans-serif;margin-bottom:6px;box-sizing:border-box;outline:none">';
  ph+='<div id="chat-order-list">';
  active.slice(0,20).forEach(o=>{
    ph+=`<div onclick="chatLinkOrder('${o.order_num}')" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:13px;display:flex;justify-content:space-between" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-weight:500">${o.order_num}</span>
      <span style="color:var(--text3)">${o.client||'—'}</span>
    </div>`;
  });
  ph+='</div>';
  picker.innerHTML=ph;
  document.body.appendChild(picker);
  setTimeout(()=>$('chat-order-search')?.focus(),50);
  
  setTimeout(()=>{
    document.addEventListener('click',function closePicker(e){
      if(!picker.contains(e.target)){
        picker.remove();
        document.removeEventListener('click',closePicker);
      }
    });
  },100);
}

function filterChatOrders(q){
  q=q.toLowerCase();
  const INACTIVE=['Закрыт','Отгружен','Отказались'];
  const filtered=orders.filter(o=>{
    if(INACTIVE.includes((o.status||'').trim())) return false;
    return (o.order_num||'').toLowerCase().includes(q)||(o.client||'').toLowerCase().includes(q);
  });
  const list=$('chat-order-list');
  if(!list) return;
  let h='';
  filtered.slice(0,15).forEach(o=>{
    h+=`<div onclick="chatLinkOrder('${o.order_num}')" style="padding:6px 10px;cursor:pointer;border-radius:4px;font-size:12px;display:flex;justify-content:space-between" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-weight:500">${o.order_num}</span>
      <span style="color:var(--text3)">${o.client||'—'}</span>
    </div>`;
  });
  list.innerHTML=h||'<div style="padding:10px;color:var(--text3);font-size:12px;text-align:center">Не найдено</div>';
}

