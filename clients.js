// ══════════════════════════════════════════════════════
// ДАШБОРД
// ══════════════════════════════════════════════════════
async function renderDashboard(){
  const today=new Date();today.setHours(0,0,0,0);
  const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
  const hr=new Date().getHours();
  const greeting=hr<12?'Доброе утро':hr<18?'Добрый день':'Добрый вечер';
  const name=currentProfile?.full_name||'';
  $('dash-greeting').textContent=greeting+(name?', '+name.split(' ')[0]:'')+'!';
  $('dash-date').textContent=today.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  
  const ACTIVE_ST=['Новый','Материал заказан','В работе','Готов к выдаче'];
  const active=orders.filter(o=>ACTIVE_ST.includes((o.status||'').trim()));
  const overdue=orders.filter(o=>{
    const d=pDate(o.deadline);if(!d)return false;d.setHours(0,0,0,0);
    const s=(o.status||'').trim();return d<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  const ready=orders.filter(o=>(o.status||'').trim()==='Готов к выдаче');
  const deadlineTomorrow=orders.filter(o=>{
    const d=pDate(o.deadline);if(!d)return false;d.setHours(0,0,0,0);
    const s=(o.status||'').trim();return d.getTime()===tomorrow.getTime()&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  const deadlineToday=orders.filter(o=>{
    const d=pDate(o.deadline);if(!d)return false;d.setHours(0,0,0,0);
    const s=(o.status||'').trim();return d.getTime()===today.getTime()&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  
  // Неоплаченные
  const unpaid=orders.filter(o=>{
    const sum=parseFloat(o.order_sum)||0,paid=parseFloat(o.prepay)||0;
    const s=(o.status||'').trim();
    return sum>0&&paid<sum&&s!=='Отказались';
  });
  const unpaidSum=unpaid.reduce((s,o)=>s+Math.max(0,(parseFloat(o.order_sum)||0)-(parseFloat(o.prepay)||0)),0);
  
  // Месяц — расходы из expenses
  const monthStart=new Date(today.getFullYear(),today.getMonth(),1);
  const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0); // последний день месяца
  const monthExpense=expenses.filter(e=>{const d=new Date(e.expense_date);return d>=monthStart&&d<=monthEnd}).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  
  // Месяц — доходы из payments
  let monthIncome=0;
  try{
    const mStartStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-01';
    const mEndStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(monthEnd.getDate()).padStart(2,'0');
    const {data:pmts}=await sb.from('payments').select('amount').gte('payment_date',mStartStr).lte('payment_date',mEndStr);
    if(pmts) monthIncome=pmts.reduce((s,p)=>s+Math.max(0,parseFloat(p.amount)||0),0);
  }catch(e){}
  
  // KPI
  $('d-active').textContent=active.length;
  $('d-overdue').textContent=overdue.length;
  $('d-overdue').parentElement.style.background=overdue.length?'var(--red-light)':'';
  $('d-ready').textContent=ready.length;
  $('d-unpaid').textContent=unpaid.length;
  $('d-month-income').textContent=fmt(monthIncome);
  $('d-month-expense').textContent=fmt(monthExpense);
  
  // ═══ СРОЧНОЕ (красная плашка если есть) ═══
  const urgentItems=[];
  if(overdue.length) urgentItems.push({icon:'🔴',text:overdue.length+' просроченных заказов',color:'var(--red)'});
  if(deadlineToday.length) urgentItems.push({icon:'⏰',text:deadlineToday.length+' заказов — дедлайн СЕГОДНЯ',color:'var(--amber)'});
  if(deadlineTomorrow.length) urgentItems.push({icon:'📅',text:deadlineTomorrow.length+' заказов — дедлайн завтра',color:'var(--text2)'});
  
  const lowStock=skladItems.filter(item=>{
    const stock=skladStock(item.item_id);const min=parseFloat(item.min_stock)||0;
    return min>0&&stock<=min&&!String(item.item_id||'').startsWith('pending_');
  });
  if(lowStock.length) urgentItems.push({icon:'📦',text:lowStock.length+' материалов заканчиваются',color:'var(--amber)'});
  
  if(urgentItems.length){
    $('d-urgent').innerHTML=`<div style="background:var(--red-light);border:1px solid var(--red);border-radius:var(--r);padding:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <span style="font-size:14px;font-weight:700;color:var(--red)">Срочно:</span>
      ${urgentItems.map(i=>`<span style="font-size:12px;color:${i.color}">${i.icon} ${i.text}</span>`).join('<span style="color:var(--border)">·</span>')}
    </div>`;
  } else {
    $('d-urgent').innerHTML=`<div style="background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--r);padding:12px;text-align:center;font-size:13px;color:var(--accent-text);font-weight:500">✓ Всё под контролем — срочных задач нет</div>`;
  }
  
  // ═══ ТРЕБУЮТ ВНИМАНИЯ ═══
  const attention=[];
  overdue.forEach(o=>{const d=pDate(o.deadline);const days=d?Math.floor((today-d)/86400000):0;attention.push({o,icon:'⏰',text:'Просрочен '+days+' дн.',color:'var(--red)'})});
  deadlineToday.forEach(o=>attention.push({o,icon:'🔥',text:'Дедлайн сегодня!',color:'var(--amber)'}));
  ready.forEach(o=>{const sum=parseFloat(o.order_sum)||0,paid=parseFloat(o.prepay)||0;
    if(sum>0&&paid<sum) attention.push({o,icon:'💰',text:'Готов, не оплачен: '+fmt(sum-paid),color:'var(--amber)'});
    else attention.push({o,icon:'✅',text:'Готов к выдаче',color:'var(--accent)'});
  });
  orders.filter(o=>(o.status||'').trim()==='Материал заказан').forEach(o=>attention.push({o,icon:'📦',text:'Ждёт материал',color:'var(--blue)'}));
  
  if(attention.length){
    let ah='';
    attention.slice(0,10).forEach(a=>{
      ah+=`<div onclick="showPage('orders');setTimeout(()=>openEdit('${a.o.order_num}'),200)" style="display:flex;align-items:center;gap:6px;padding:5px 8px;margin-bottom:3px;background:${a.color}08;border-left:3px solid ${a.color};border-radius:0 var(--rs) var(--rs) 0;cursor:pointer;font-size:11px">
        <span>${a.icon}</span>
        <span style="font-weight:500;min-width:45px">${a.o.order_num}</span>
        <span style="flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.o.client||'—'}</span>
        <span style="color:${a.color};flex-shrink:0">${a.text}</span>
      </div>`;
    });
    if(attention.length>10) ah+=`<div style="font-size:10px;color:var(--text3);padding:4px 0;text-align:center">...и ещё ${attention.length-10}</div>`;
    $('d-attention').innerHTML=ah;
  } else {
    $('d-attention').innerHTML='<div style="color:var(--accent);font-size:12px;text-align:center;padding:10px">✓ Нет проблем</div>';
  }
  
  // ═══ ФИНАНСЫ ═══
  const profit=monthIncome-monthExpense;
  let fh=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
    <div style="text-align:center;padding:8px;background:var(--accent-light);border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--accent-text)">Доход</div>
      <div style="font-size:14px;font-weight:700;color:var(--accent-text)">${fmt(monthIncome)}</div>
    </div>
    <div style="text-align:center;padding:8px;background:var(--red-light);border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--red)">Расходы</div>
      <div style="font-size:14px;font-weight:700;color:var(--red)">${fmt(monthExpense)}</div>
    </div>
  </div>
  <div style="text-align:center;padding:6px;background:${profit>=0?'var(--accent-light)':'var(--red-light)'};border-radius:var(--rs);margin-bottom:8px">
    <span style="font-size:10px;color:var(--text3)">Прибыль: </span>
    <span style="font-size:14px;font-weight:700;color:${profit>=0?'var(--accent-text)':'var(--red)'}">${profit>=0?'+':''}${fmt(profit)}</span>
  </div>`;
  if(unpaid.length){
    fh+=`<div style="font-size:11px;color:var(--amber);margin-bottom:4px">Ожидают оплаты: ${unpaid.length} заказов</div>
    <div style="font-size:13px;font-weight:600;color:var(--amber)">${fmt(unpaidSum)} ₽ долг</div>`;
  }
  $('d-finance').innerHTML=fh;
  
  // ═══ ПРОИЗВОДСТВО ═══
  const inWork=orders.filter(o=>(o.status||'').trim()==='В работе');
  const matOrdered=orders.filter(o=>(o.status||'').trim()==='Материал заказан');
  let ph='';
  const stageCounts={};
  inWork.forEach(o=>{
    const stages=getOrderStages(o);
    const activeStages=PROD_STAGES.filter(s=>!stages[s.key]||!stages[s.key].skip);
    const cur=activeStages.find(s=>!stages[s.key]||!stages[s.key].done);
    if(cur) stageCounts[cur.key]=(stageCounts[cur.key]||0)+1;
  });
  if(Object.keys(stageCounts).length){
    ph+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
    Object.entries(stageCounts).forEach(([key,cnt])=>{
      const st=PROD_STAGES.find(s=>s.key===key);
      if(st) ph+=`<span style="font-size:10px;padding:3px 6px;border-radius:6px;background:${st.color}15;color:${st.color};font-weight:500">${st.icon} ${cnt}</span>`;
    });
    ph+='</div>';
  }
  ph+=`<div style="font-size:12px"><span style="font-weight:600">${inWork.length}</span> <span style="color:var(--text3)">в работе</span></div>`;
  ph+=`<div style="font-size:12px"><span style="font-weight:600">${matOrdered.length}</span> <span style="color:var(--text3)">ждут материал</span></div>`;
  ph+=`<div style="font-size:12px"><span style="font-weight:600">${ready.length}</span> <span style="color:var(--text3)">готовы</span></div>`;
  $('d-production').innerHTML=ph;
  
  // ═══ СМЕНЫ ═══
  const openShifts=payShifts.filter(s=>!s.ended_at);
  if(openShifts.length){
    let sh='';
    openShifts.forEach(s=>{
      const start=new Date(s.started_at);
      const dur=Math.round((new Date()-start)/60000);
      const hrs=Math.floor(dur/60),mins=dur%60;
      sh+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="font-weight:500">${s.worker_name||'—'}</span>
        <span style="flex:1;color:var(--text3)">${s.station||''}</span>
        <span style="color:var(--accent)">${hrs}ч ${mins}м</span>
      </div>`;
    });
    $('d-shifts').innerHTML=sh;
  } else {
    $('d-shifts').innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Никого на смене</div>';
  }
  
  // ═══ СКЛАД ═══
  if(lowStock.length){
    let sh='';
    lowStock.slice(0,6).forEach(item=>{
      const stock=skladStock(item.item_id);
      const empty=stock<=0;
      sh+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="flex:1;color:${empty?'var(--red)':'var(--text)'};${empty?'font-weight:500':''};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</span>
        <span style="font-weight:600;color:${empty?'var(--red)':'var(--amber)'}">🪣${stock}/${item.min_stock}</span>
      </div>`;
    });
    if(lowStock.length>6) sh+=`<div style="font-size:10px;color:var(--text3);text-align:center;padding:2px">...ещё ${lowStock.length-6}</div>`;
    $('d-low-stock').innerHTML=sh;
  } else {
    $('d-low-stock').innerHTML='<div style="color:var(--accent);font-size:12px;text-align:center;padding:10px">✓ Всё в норме</div>';
  }
  
  // ═══ ВОРОНКА ═══
  const STATUS_ORDER=['Отправлено КП','Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт','Рекламация','Отказались'];
  const statusCounts={};
  orders.forEach(o=>{const s=(o.status||'').trim();statusCounts[s]=(statusCounts[s]||0)+1});
  const maxSC=Math.max(...Object.values(statusCounts),1);
  let ffh='';
  STATUS_ORDER.forEach(s=>{
    const cnt=statusCounts[s]||0;if(!cnt) return;
    const pct=cnt/maxSC*100;
    const bc=badgeClass(s);
    ffh+=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer" onclick="showPage('orders')">
      <span class="badge ${bc}" style="font-size:9px;width:90px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center">${s}</span>
      <div style="flex:1;background:var(--surface2);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px"></div></div>
      <span style="font-size:11px;font-weight:600;min-width:18px;text-align:right">${cnt}</span>
    </div>`;
  });
  $('d-funnel').innerHTML=ffh||'<div style="color:var(--text3);font-size:12px">Нет заказов</div>';
  
  // ═══ НАПОМИНАНИЯ ═══
  const todayReminders=(typeof reminders!=='undefined'?reminders:[]).filter(r=>{
    if(r.is_done) return false;
    const d=new Date(r.remind_at);d.setHours(0,0,0,0);
    return d<=today;
  });
  if(todayReminders.length){
    let rh='';
    todayReminders.slice(0,5).forEach(r=>{
      const t=new Date(r.remind_at);
      rh+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span>🔔</span>
        <span style="font-weight:500">${r.order_num||''}</span>
        <span style="flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.text||''}</span>
        <span style="color:var(--text3)">${t.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>`;
    });
    $('d-reminders').innerHTML=rh;
  } else {
    $('d-reminders').innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Нет напоминаний</div>';
  }
  
  // ═══ ПОСЛЕДНИЕ СООБЩЕНИЯ ═══
  const lastMsgs=(typeof chatMessages!=='undefined'?chatMessages:[]).slice(-5);
  if(lastMsgs.length){
    let ch='';
    lastMsgs.reverse().forEach(m=>{
      const t=new Date(m.created_at);
      const isMe=m.user_id===currentProfile?.id;
      ch+=`<div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="font-weight:500;color:${isMe?'var(--accent-text)':'var(--text)'};min-width:50px">${(m.user_name||'').split(' ')[0]}</span>
        <span style="flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.text||''}</span>
        <span style="color:var(--text3);flex-shrink:0">${t.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>`;
    });
    $('d-last-chat').innerHTML=ch;
  } else {
    $('d-last-chat').innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Нет сообщений</div>';
  }
}

