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
  const todayKey=localDateStr(today);
  
  // Проверяем что сейчас >= 10:00 по Москве
  const mskNow=new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow',hour:'numeric',hour12:false});
  const hour=parseInt(mskNow)||0;
  if(hour<10){console.log('[overdue] skip: time<10:00 MSK, hour=',hour);return}
  
  // ── БЛОКИРОВКА через app_settings ──
  // Шаг 1: читаем текущее значение
  let currentStored=null;
  try{
    const {data,error}=await sb.from('app_settings').select('value').eq('key','overdue_last_sent').maybeSingle();
    if(error){console.log('[overdue] read error:',error);return}
    if(data){
      let v=data.value;
      // value может быть jsonb (объект/строка) или text-обёрнутый JSON
      if(typeof v==='string'){
        // text-поле с JSON-строкой типа '"2026-05-11"'
        try{v=JSON.parse(v)}catch(e){}
      }
      currentStored=v;
    }
  }catch(e){console.log('[overdue] read exception:',e);return}
  
  console.log('[overdue] currentStored=',currentStored,'todayKey=',todayKey);
  
  // Если уже отправляли сегодня — выходим
  if(currentStored===todayKey){
    console.log('[overdue] already sent today, skipping');
    return;
  }
  
  // Шаг 2: пишем сегодняшнее значение (upsert)
  // Гонка маловероятна — но если несколько устройств запишут одновременно, 
  // запись в БД будет последняя, остальные клиенты при следующей проверке
  // увидят todayKey и не отправят повторно (но один-два дубля в первую минуту возможны)
  try{
    const {error}=await sb.from('app_settings').upsert(
      {key:'overdue_last_sent',value:JSON.stringify(todayKey),updated_at:new Date().toISOString()},
      {onConflict:'key'}
    );
    if(error){console.log('[overdue] write error:',error);return}
    console.log('[overdue] lock acquired, sending notification');
  }catch(e){console.log('[overdue] write exception:',e);return}
  
  // ── Загружаем СВЕЖИЕ заказы из БД ──
  let freshOrders=[];
  try{
    const {data,error}=await sb.from('orders').select('order_num,client,status,deadline');
    if(error||!data) return;
    freshOrders=data;
    if(typeof orders!=='undefined' && Array.isArray(orders)){
      data.forEach(fresh=>{
        const local=orders.find(o=>o.order_num===fresh.order_num);
        if(local){local.status=fresh.status;local.deadline=fresh.deadline}
      });
    }
  }catch(e){return}
  
  const overdue=freshOrders.filter(o=>{
    const d=pDate(o.deadline);if(!d)return false;d.setHours(0,0,0,0);
    const s=(o.status||'').trim();
    return d<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  if(!overdue.length){console.log('[overdue] no overdue orders');return}
  
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

async function checkLowStockNotify(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayKey=localDateStr(today);
  
  const mskNow=new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow',hour:'numeric',hour12:false});
  const hour=parseInt(mskNow)||0;
  if(hour<10){console.log('[lowstock] skip: time<10:00 MSK');return}
  
  // Читаем текущее значение блокировки
  let currentStored=null;
  try{
    const {data,error}=await sb.from('app_settings').select('value').eq('key','lowstock_last_sent').maybeSingle();
    if(error){console.log('[lowstock] read error:',error);return}
    if(data){
      let v=data.value;
      if(typeof v==='string'){try{v=JSON.parse(v)}catch(e){}}
      currentStored=v;
    }
  }catch(e){console.log('[lowstock] read exception:',e);return}
  
  console.log('[lowstock] currentStored=',currentStored,'todayKey=',todayKey);
  
  if(currentStored===todayKey){
    console.log('[lowstock] already sent today, skipping');
    return;
  }
  
  // Пишем блокировку
  try{
    const {error}=await sb.from('app_settings').upsert(
      {key:'lowstock_last_sent',value:JSON.stringify(todayKey),updated_at:new Date().toISOString()},
      {onConflict:'key'}
    );
    if(error){console.log('[lowstock] write error:',error);return}
    console.log('[lowstock] lock acquired, sending notification');
  }catch(e){console.log('[lowstock] write exception:',e);return}
  
  // Свежие данные склада из БД
  let freshItems=[], freshMoves=[];
  try{
    const [iRes,mRes]=await Promise.all([
      sb.from('sklad_items').select('*'),
      sb.from('sklad_moves').select('*')
    ]);
    if(iRes.data) freshItems=iRes.data;
    if(mRes.data) freshMoves=mRes.data;
  }catch(e){return}
  
  const stockMap={};
  freshMoves.forEach(m=>{
    const id=m.item_id;
    stockMap[id]=(stockMap[id]||0)+(parseFloat(m.qty)||0);
  });
  
  const low=freshItems.filter(item=>{
    const stock=stockMap[item.item_id]||0;
    const min=parseFloat(item.min_stock)||0;
    return min>0 && stock<=min && !String(item.item_id||'').startsWith('pending_');
  });
  
  if(!low.length){console.log('[lowstock] no low stock items');return}
  
  let msg='📦 <b>Заканчиваются на складе ('+low.length+')</b>\n';
  low.slice(0,10).forEach(item=>{
    const stock=stockMap[item.item_id]||0;
    const min=parseFloat(item.min_stock)||0;
    msg+='\n• '+item.name+': '+stock+' '+(item.unit||'шт')+' (мин. '+min+')';
  });
  if(low.length>10) msg+='\n\n...и ещё '+(low.length-10)+' позиций';
  tgSend(msg);
}

setInterval(()=>{checkLowStockNotify()},30*60*1000);

