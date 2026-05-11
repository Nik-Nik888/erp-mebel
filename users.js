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
  if(hour<10) return;
  
  // ── АТОМАРНАЯ БЛОКИРОВКА ──
  // Используем app_settings.overdue_last_sent как глобальный замок.
  // 1. Сначала пробуем UPDATE — обновится только если value != todayKey
  //    Это атомарная операция на стороне БД.
  // 2. Если затронута 1 строка — мы выиграли гонку, отправляем уведомление.
  // 3. Если 0 строк — либо запись с todayKey уже есть (уже отправлено),
  //    либо вообще нет записи (тогда делаем INSERT).
  const todayValue=JSON.stringify(todayKey);
  let weWonTheRace=false;
  
  try{
    // Атомарный UPDATE: обновится только если значение НЕ сегодняшнее
    const {data:updated,error:updErr}=await sb
      .from('app_settings')
      .update({value:todayValue,updated_at:new Date().toISOString()})
      .eq('key','overdue_last_sent')
      .neq('value',todayValue)
      .select();
    
    if(updErr){console.log('Overdue lock update error:',updErr);return}
    
    if(updated && updated.length>0){
      // Мы успешно захватили замок — обновили запись с другого дня
      weWonTheRace=true;
    } else {
      // 0 строк обновлено — либо нет записи, либо уже стоит сегодняшняя дата
      // Пробуем INSERT — если получится, мы первые сегодня
      const {error:insErr}=await sb
        .from('app_settings')
        .insert({key:'overdue_last_sent',value:todayValue,updated_at:new Date().toISOString()});
      
      if(!insErr){
        weWonTheRace=true; // INSERT прошёл — мы первые
      }
      // Если INSERT упал с duplicate key — значит запись с todayKey уже есть,
      // и кто-то другой уже отправил уведомление сегодня. Молча выходим.
    }
  }catch(e){console.log('Overdue lock error:',e);return}
  
  if(!weWonTheRace) return; // Другое устройство нас опередило
  
  // ── Загружаем СВЕЖИЕ заказы из БД ──
  let freshOrders=[];
  try{
    const {data,error}=await sb.from('orders').select('order_num,client,status,deadline');
    if(error||!data) return;
    freshOrders=data;
    // Обновляем локальный кэш
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

async function checkLowStockNotify(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayKey=localDateStr(today);
  
  // Проверяем что сейчас >= 10:00 по Москве
  const mskNow=new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow',hour:'numeric',hour12:false});
  const hour=parseInt(mskNow)||0;
  if(hour<10) return;
  
  // ── АТОМАРНАЯ БЛОКИРОВКА (одно уведомление в день со всех устройств) ──
  const todayValue=JSON.stringify(todayKey);
  let weWonTheRace=false;
  
  try{
    const {data:updated,error:updErr}=await sb
      .from('app_settings')
      .update({value:todayValue,updated_at:new Date().toISOString()})
      .eq('key','lowstock_last_sent')
      .neq('value',todayValue)
      .select();
    
    if(updErr){console.log('Low stock lock update error:',updErr);return}
    
    if(updated && updated.length>0){
      weWonTheRace=true;
    } else {
      const {error:insErr}=await sb
        .from('app_settings')
        .insert({key:'lowstock_last_sent',value:todayValue,updated_at:new Date().toISOString()});
      
      if(!insErr) weWonTheRace=true;
    }
  }catch(e){console.log('Low stock lock error:',e);return}
  
  if(!weWonTheRace) return;
  
  // ── Загружаем СВЕЖИЕ данные склада из БД ──
  let freshItems=[], freshMoves=[];
  try{
    const [iRes,mRes]=await Promise.all([
      sb.from('sklad_items').select('*'),
      sb.from('sklad_moves').select('*')
    ]);
    if(iRes.data) freshItems=iRes.data;
    if(mRes.data) freshMoves=mRes.data;
  }catch(e){return}
  
  // Считаем остатки локально по свежим данным
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
  
  if(!low.length) return;
  
  // Отправляем единое уведомление вместо нескольких
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

