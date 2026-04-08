// НАПОМИНАНИЯ
// ══════════════════════════════════════════════════════
function openReminder(orderNum){
  const o=orderNum?findO(orderNum):null;
  
  let ov=$('m-reminder');
  if(!ov){
    ov=document.createElement('div');ov.className='overlay';ov.id='m-reminder';
    ov.innerHTML=`<div class="modal" style="max-width:420px"><div class="modal-hd"><div class="modal-title">🔔 Напоминание</div><button class="modal-close" onclick="$('m-reminder').classList.remove('open')">×</button></div><div class="modal-body" id="m-reminder-body"></div></div>`;
    document.body.appendChild(ov);
  }
  
  const now=new Date();
  const tomorrow=new Date(now.getTime()+86400000);
  const defDate=tomorrow.toISOString().split('T')[0];
  const defTime='10:00';
  
  let h=`
    <div style="margin-bottom:12px">
      <label class="flabel">Заказ</label>
      <input class="finput" id="rem-order" value="${orderNum||''}" placeholder="Номер заказа (необязательно)">
    </div>
    <div style="margin-bottom:12px">
      <label class="flabel">Клиент</label>
      <input class="finput" id="rem-client" value="${o?.client||''}" placeholder="Имя клиента">
    </div>
    <div style="margin-bottom:12px">
      <label class="flabel">Телефон</label>
      <input class="finput" id="rem-phone" value="${o?.phone||''}" placeholder="Телефон">
    </div>
    <div style="margin-bottom:12px">
      <label class="flabel">О чём напомнить</label>
      <textarea class="ftextarea" id="rem-text" rows="2" placeholder="Позвонить, предложить скидку, уточнить замер..."></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div><label class="flabel">Дата</label><input class="finput" type="date" id="rem-date" value="${defDate}"></div>
      <div><label class="flabel">Время</label><input class="finput" type="time" id="rem-time" value="${defTime}"></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn btn-ghost" style="font-size:11px" onclick="setRemQuick(0)">Сегодня</button>
      <button class="btn btn-ghost" style="font-size:11px" onclick="setRemQuick(1)">Завтра</button>
      <button class="btn btn-ghost" style="font-size:11px" onclick="setRemQuick(3)">Через 3 дня</button>
      <button class="btn btn-ghost" style="font-size:11px" onclick="setRemQuick(7)">Через неделю</button>
      <button class="btn btn-ghost" style="font-size:11px" onclick="setRemQuick(30)">Через месяц</button>
    </div>
    <button class="btn btn-primary" onclick="saveReminder()" style="width:100%;justify-content:center">🔔 Создать напоминание</button>
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px">Активные напоминания</div>
      <div id="rem-list"></div>
    </div>`;
  
  $('m-reminder-body').innerHTML=h;
  loadRemindersList(orderNum);
  ov.classList.add('open');
}

function setRemQuick(days){
  const d=new Date();d.setDate(d.getDate()+days);
  $('rem-date').value=d.toISOString().split('T')[0];
}

async function saveReminder(){
  const text=$('rem-text').value.trim();
  if(!text){showToast('Укажите текст напоминания');return}
  const date=$('rem-date').value;
  const time=$('rem-time').value||'10:00';
  if(!date){showToast('Укажите дату');return}
  
  const remindAt=new Date(date+'T'+time+':00');
  const row={
    order_num:$('rem-order').value.trim()||null,
    client_name:$('rem-client').value.trim()||null,
    phone:$('rem-phone').value.trim()||null,
    text:text,
    remind_at:remindAt.toISOString(),
    created_by:currentProfile?.full_name||'',
    is_done:false,
    notified:false
  };
  
  try{
    const {error}=await sb.from('reminders').insert(row);
    if(error) throw error;
    showToast('🔔 Напоминание создано на '+remindAt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})+' '+time);
    $('rem-text').value='';
    loadRemindersList($('rem-order').value.trim());
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function loadRemindersList(orderNum){
  const list=$('rem-list');
  if(!list) return;
  try{
    let q=sb.from('reminders').select('*').eq('is_done',false).order('remind_at',{ascending:true});
    if(orderNum) q=q.eq('order_num',orderNum);
    const {data}=await q.limit(20);
    if(!data||!data.length){
      list.innerHTML='<div style="font-size:12px;color:var(--text3)">Нет активных напоминаний</div>';
      return;
    }
    let h='';
    data.forEach(r=>{
      const d=new Date(r.remind_at);
      const isPast=d<new Date();
      const dateStr=d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);${isPast?'background:var(--red-light)':''}">
        <button onclick="completeReminder(${r.id})" style="background:none;border:1px solid var(--border);border-radius:4px;width:22px;height:22px;cursor:pointer;flex-shrink:0;font-size:12px;display:flex;align-items:center;justify-content:center" title="Выполнено">✓</button>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.text}</div>
          <div style="font-size:10px;color:${isPast?'var(--red)':'var(--text3)'}">${dateStr}${r.client_name?' · '+r.client_name:''}${r.order_num?' · '+r.order_num:''}</div>
        </div>
        <button onclick="deleteReminder(${r.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button>
      </div>`;
    });
    list.innerHTML=h;
  }catch(e){list.innerHTML='<div style="font-size:12px;color:var(--red)">Ошибка загрузки</div>'}
}

async function completeReminder(id){
  try{
    await sb.from('reminders').update({is_done:true}).eq('id',id);
    showToast('✓ Напоминание выполнено');
    loadRemindersList($('rem-order')?.value?.trim()||'');
  }catch(e){}
}

async function deleteReminder(id){
  if(!confirm('Удалить напоминание?')) return;
  try{
    await sb.from('reminders').delete().eq('id',id);
    loadRemindersList($('rem-order')?.value?.trim()||'');
  }catch(e){}
}

// Проверка просроченных напоминаний при входе
async function checkRemindersNotify(){
  try{
    const now=new Date().toISOString();
    const {data}=await sb.from('reminders').select('*').eq('is_done',false).eq('notified',false).lte('remind_at',now);
    if(!data||!data.length) return;
    
    for(const r of data){
      // Отправляем в Telegram
      const lines=['🔔 <b>НАПОМИНАНИЕ</b>','','📝 '+escHtmlTg(r.text)];
      if(r.client_name) lines.push('👤 Клиент: '+escHtmlTg(r.client_name));
      if(r.phone) lines.push('📱 '+r.phone);
      if(r.order_num) lines.push('📋 Заказ: '+r.order_num);
      if(r.created_by) lines.push('👤 Создал: '+escHtmlTg(r.created_by));
      tgSend(lines.join('\n'));
      
      // Push-уведомление
      showLocalNotification('🔔 Напоминание',r.text+(r.client_name?' — '+r.client_name:''),'rem-'+r.id);
      
      // Отмечаем как уведомлённое
      await sb.from('reminders').update({notified:true}).eq('id',r.id);
    }
    
    if(data.length) showToast('🔔 '+data.length+' напоминание(й) сработало');
  }catch(e){console.log('Reminders check error:',e)}
}

function escHtmlTg(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// Периодическая проверка напоминаний — каждые 60 секунд
setInterval(()=>{checkRemindersNotify()},60000);

