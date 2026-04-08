// ══════════════════════════════════════════════════════
// INIT — Параллельная загрузка всего
// ══════════════════════════════════════════════════════
async function loadSkladSilent(){
  try{
    const [iRes,mRes,tRes]=await Promise.all([
      sb.from('sklad_items').select('*').order('name'),
      sb.from('sklad_moves').select('*').order('id'),
      sb.from('material_types').select('*').order('sort_order')
    ]);
    if(iRes.data) skladItems=iRes.data;
    if(mRes.data) skladLog=mRes.data;
    if(tRes.data) matTypes=tRes.data;
  }catch(e){}
}

async function loadExpensesSilent(){
  try{
    const [eRes,cRes]=await Promise.all([
      sb.from('expenses').select('*').order('expense_date',{ascending:false}),
      sb.from('expense_categories').select('*').order('id')
    ]);
    if(eRes.data) expenses=eRes.data;
    if(cRes.data) expCategories=cRes.data;
  }catch(e){}
}

async function loadClientsSilent(){
  try{
    const {data}=await sb.from('clients').select('*').order('name');
    if(data) clients=data;
  }catch(e){}
}

// ── OVERDUE & LOW STOCK NOTIFICATIONS ──────────────────
async function checkOverdueNotify(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayKey=today.toISOString().split('T')[0];
  
  // Проверяем что сейчас >= 10:00 по Москве
  const mskNow=new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow',hour:'numeric',hour12:false});
  const hour=parseInt(mskNow)||0;
  if(hour<10) return;
  
  // Проверяем НАПРЯМУЮ в Supabase — уже отправляли сегодня?
  try{
    const {data}=await sb.from('app_settings').select('value').eq('key','overdue_last_sent').single();
    if(data){
      const val=data.value;
      const stored=(typeof val==='string'&&val.startsWith('"'))?JSON.parse(val):val;
      if(stored===todayKey) return; // уже отправлено с другого устройства
    }
  }catch(e){} // записи нет — продолжаем
  
  // Сразу помечаем как отправленное ДО отправки — чтобы другие устройства не дублировали
  try{
    await sb.from('app_settings').upsert({key:'overdue_last_sent',value:JSON.stringify(todayKey),updated_at:new Date().toISOString()},{onConflict:'key'});
  }catch(e){}
  
  const overdue=orders.filter(o=>{
    const d=pDate(o.deadline);if(!d)return false;d.setHours(0,0,0,0);
    const s=(o.status||'').trim();
    return d<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  if(!overdue.length) return;
  
  let msg='⚠️ <b>Просроченные заказы ('+overdue.length+')</b>\n';
  overdue.slice(0,10).forEach(o=>{
    const d=pDate(o.deadline);
    const days=Math.floor((today-d)/(86400000));
    msg+='\n📋 '+o.order_num+' — '+(o.client||'—')+'\n';
    msg+='   Дедлайн: '+(d?d.toLocaleDateString('ru-RU'):'—')+' ('+days+' дн. назад)\n';
    msg+='   Статус: '+o.status;
  });
  if(overdue.length>10) msg+='\n\n...и ещё '+(overdue.length-10)+' заказов';
  tgSend(msg);
}

setInterval(()=>{checkOverdueNotify()},30*60*1000);

function checkLowStockNotify(){
  const key='k2_lowstock_notified_'+new Date().toISOString().split('T')[0];
  if(localStorage.getItem(key)) return;
  const low=skladItems.filter(item=>{
    const stock=skladStock(item.item_id);
    const min=parseFloat(item.min_stock)||0;
    return min>0&&stock<=min&&!String(item.item_id||'').startsWith('pending_');
  });
  if(low.length){
    low.slice(0,5).forEach(item=>{
      tgNotify('low_stock',{name:item.name,stock:skladStock(item.item_id),min:item.min_stock});
    });
    if(low.length>5) tgSend('📦 ...и ещё '+(low.length-5)+' позиций заканчиваются');
    localStorage.setItem(key,'1');
  }
}

