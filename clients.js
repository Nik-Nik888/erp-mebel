// ══════════════════════════════════════════════════════
// ДАШБОРД
// ══════════════════════════════════════════════════════
// ── Открыть историю платежей за текущий месяц (с дашборда) ──
async function showDashboardPayments(){
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);
  
  // Временно меняем фильтры заказов чтобы переиспользовать showPaymentsHistory
  // (но НЕ применяем — просто читаем как параметры)
  await loadPayments(true);
  
  const list=paymentsCache.filter(p=>{
    if(!p.payment_date) return false;
    const d=new Date(p.payment_date);
    return d>=monthStart && d<=new Date(monthEnd.getTime()+86400000-1);
  }).sort((a,b)=>new Date(b.payment_date)-new Date(a.payment_date));
  
  const total=list.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const monthName=now.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  
  let overlay=$('m-payments-hist');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.className='overlay';
    overlay.id='m-payments-hist';
    overlay.innerHTML=`<div class="modal" style="max-width:640px;max-height:85vh;display:flex;flex-direction:column"><div class="modal-hd"><div class="modal-title">📋 История поступлений</div><button class="modal-close" onclick="$('m-payments-hist').classList.remove('open')">×</button></div><div class="modal-body" id="m-payments-hist-body" style="overflow-y:auto;flex:1"></div></div>`;
    document.body.appendChild(overlay);
  }
  
  let h=`<div style="background:var(--accent-light);padding:12px;border-radius:var(--rs);margin-bottom:14px;text-align:center">
    <div style="font-size:11px;color:var(--accent-text);margin-bottom:4px">${monthName}</div>
    <div style="font-size:22px;font-weight:700;color:var(--accent-text)">${fmt(total)}</div>
    <div style="font-size:11px;color:var(--accent-text);margin-top:2px">${list.length} ${list.length===1?'платёж':list.length<5?'платежа':'платежей'}</div>
  </div>`;
  
  if(!list.length){
    h+=`<div style="text-align:center;color:var(--text3);padding:30px;font-size:13px">Платежей в этом месяце нет</div>`;
  } else {
    const byDate={};
    list.forEach(p=>{
      const dStr=new Date(p.payment_date).toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
      if(!byDate[dStr]) byDate[dStr]={items:[],total:0};
      byDate[dStr].items.push(p);
      byDate[dStr].total+=(parseFloat(p.amount)||0);
    });
    
    Object.entries(byDate).forEach(([date,info])=>{
      h+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;border-bottom:1px solid var(--border);margin-top:8px">
        <div style="font-size:12px;font-weight:600;color:var(--text2)">${date}</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${fmt(info.total)}</div>
      </div>`;
      info.items.forEach(p=>{
        const amount=parseFloat(p.amount)||0;
        const isReturn=amount<0;
        const ord=orders.find(o=>o.order_num===p.order_num);
        const client=ord?.client||'—';
        h+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border);cursor:${ord?'pointer':'default'}" ${ord?`onclick="$('m-payments-hist').classList.remove('open');showPage('orders');setTimeout(()=>openEdit('${p.order_num}'),200)"`:''}>
          <span style="font-size:14px">${isReturn?'↩️':'💰'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${p.order_num||'—'} · ${client}</div>
            ${p.note?`<div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.note}</div>`:''}
          </div>
          <div style="font-size:13px;font-weight:600;color:${isReturn?'var(--red)':'var(--accent-text)'};white-space:nowrap">${isReturn?'':'+'}${fmt(amount)}</div>
        </div>`;
      });
    });
  }
  
  $('m-payments-hist-body').innerHTML=h;
  overlay.classList.add('open');
}

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
  const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0,23,59,59);
  const monthExpense=expenses.filter(e=>{
    const d=new Date(e.expense_date);d.setHours(0,0,0,0);
    return d>=monthStart&&d<=monthEnd;
  }).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  
  // Загружаем актуальные платежи
  await loadPayments();
  
  // Месяц — поступления: ВСЕ платежи из таблицы payments с датой в этом месяце
  // (учёт по факту получения денег, а не по дате заказа)
  const monthIncome=paymentsInPeriod(monthStart,monthEnd);
  
  // Какие заказы были оплачены в этом месяце? — для расчёта себестоимости
  const monthPaidOrderNums=[...new Set(
    paymentsCache.filter(p=>{
      if(!p.payment_date) return false;
      const d=new Date(p.payment_date);
      return d>=monthStart&&d<=monthEnd && (parseFloat(p.amount)||0)>0;
    }).map(p=>p.order_num)
  )];
  
  // Себестоимость заказов, по которым были платежи в этом месяце
  // (учитываем полную себестоимость заказа — поскольку платежи относятся к нему)
  let monthMatCost=0, monthWorkCost=0;
  monthPaidOrderNums.forEach(oNum=>{
    const o=orders.find(x=>x.order_num===oNum);
    if(!o) return;
    const s=(o.status||'').trim();
    if(s==='Отправлено КП'||s==='Отказались') return;
    try{
      const sp=JSON.parse(o.specification||'');
      if(sp&&sp.mats) sp.mats.forEach(m=>{monthMatCost+=(parseFloat(m.price)||0)*(parseFloat(m.qty)||0)});
      if(sp&&sp.works) sp.works.forEach(w=>{monthWorkCost+=(parseFloat(w.price)||0)*(parseFloat(w.qty)||0)});
    }catch(e){}
  });
  const monthCost=monthMatCost+monthWorkCost;
  
  // KPI
  $('d-active').textContent=active.length;
  $('d-overdue').textContent=overdue.length;
  $('d-overdue').parentElement.style.background=overdue.length?'var(--red-light)':'';
  $('d-ready').textContent=ready.length;
  $('d-unpaid').textContent=unpaid.length;
  $('d-month-income').textContent=fmt(monthIncome);
  $('d-month-expense').textContent=fmt(monthCost+monthExpense);
  
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
  const totalExpWithCost=monthCost+monthExpense;
  const profit=monthIncome-totalExpWithCost;
  let fh=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
    <div style="text-align:center;padding:8px;background:var(--accent-light);border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--accent-text)">Поступления</div>
      <div style="font-size:14px;font-weight:700;color:var(--accent-text)">${fmt(monthIncome)}</div>
    </div>
    <div style="text-align:center;padding:8px;background:var(--red-light);border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--red)">Себестоимость</div>
      <div style="font-size:14px;font-weight:700;color:var(--red)">${fmt(monthCost)}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
    <div style="text-align:center;padding:6px;background:var(--surface2);border-radius:var(--rs)">
      <div style="font-size:9px;color:var(--text3)">Материалы</div>
      <div style="font-size:12px;font-weight:600;color:var(--text2)">${fmt(monthMatCost)}</div>
    </div>
    <div style="text-align:center;padding:6px;background:var(--surface2);border-radius:var(--rs)">
      <div style="font-size:9px;color:var(--text3)">Работа</div>
      <div style="font-size:12px;font-weight:600;color:var(--text2)">${fmt(monthWorkCost)}</div>
    </div>
  </div>
  ${monthExpense?`<div style="text-align:center;padding:6px;background:var(--surface2);border-radius:var(--rs);margin-bottom:8px">
    <div style="font-size:9px;color:var(--text3)">Расходы</div>
    <div style="font-size:12px;font-weight:600;color:var(--red)">${fmt(monthExpense)}</div>
  </div>`:''}
  <div style="text-align:center;padding:8px;background:${profit>=0?'var(--accent-light)':'var(--red-light)'};border-radius:var(--rs);margin-bottom:8px">
    <span style="font-size:10px;color:var(--text3)">Прибыль: </span>
    <span style="font-size:15px;font-weight:700;color:${profit>=0?'var(--accent-text)':'var(--red)'}">${profit>=0?'+':''}${fmt(profit)}</span>
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

