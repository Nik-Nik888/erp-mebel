// ══════════════════════════════════════════════════════
// АНАЛИТИКА
// ══════════════════════════════════════════════════════
let aChartRevenue=null, aChartFunnel=null, aChartSources=null;
let analyticsInited=false;

function setAPeriod(mode){
  const now=new Date();
  if(mode==='month'){
    $('a-from').value=localDateStr(new Date(now.getFullYear(),now.getMonth(),1));
    $('a-to').value=localDateStr(new Date(now.getFullYear(),now.getMonth()+1,0));
  } else if(mode==='quarter'){
    const qm=Math.floor(now.getMonth()/3)*3;
    $('a-from').value=localDateStr(new Date(now.getFullYear(),qm,1));
    $('a-to').value=localDateStr(new Date(now.getFullYear(),qm+3,0));
  } else if(mode==='year'){
    $('a-from').value=localDateStr(new Date(now.getFullYear(),0,1));
    $('a-to').value=localDateStr(new Date(now.getFullYear(),11,31));
  } else {
    $('a-from').value=''; $('a-to').value='';
  }
  renderAnalytics();
}

function getAOrders(){
  const from=$('a-from').value?new Date($('a-from').value):null;
  const to=$('a-to').value?new Date($('a-to').value+'T23:59:59'):null;
  return orders.filter(o=>{
    if(!from&&!to) return true;
    const d=pDate(o.order_date); if(!d) return false;
    if(from&&d<from) return false;
    if(to&&d>to) return false;
    return true;
  });
}

async function renderAnalytics(){
  const ao=getAOrders();
  const closed=ao.filter(o=>(o.status||'').trim()==='Закрыт');
  const refused=ao.filter(o=>(o.status||'').trim()==='Отказались');
  const working=ao.filter(o=>{const s=(o.status||'').trim();return s!=='Отправлено КП'&&s!=='Отказались'});

  // Договоров — сумма всех заказов (кроме КП и отказов) с датой ЗАКАЗА в периоде
  const contracts=working.reduce((s,o)=>s+(parseFloat(o.order_sum)||0),0);
  
  // Период
  const aFrom=$('a-from').value?new Date($('a-from').value):null;
  const aTo=$('a-to').value?new Date($('a-to').value+'T23:59:59'):null;
  
  // Получено — по таблице payments (по фактической дате оплаты)
  await loadPayments();
  const received=paymentsInPeriod(aFrom,aTo);
  
  // Какие заказы получили оплаты в этом периоде — для расчёта себестоимости
  const paidOrderNums=[...new Set(
    paymentsCache.filter(p=>{
      if(!p.payment_date) return false;
      const d=new Date(p.payment_date);
      if(aFrom&&d<aFrom) return false;
      if(aTo&&d>aTo) return false;
      return (parseFloat(p.amount)||0)>0;
    }).map(p=>p.order_num)
  )];
  
  // Себестоимость заказов, в которые поступали деньги в этот период
  let totalCost=0;
  paidOrderNums.forEach(oNum=>{
    const o=orders.find(x=>x.order_num===oNum);
    if(!o) return;
    const s=(o.status||'').trim();
    if(s==='Отправлено КП'||s==='Отказались') return;
    try{
      const sp=JSON.parse(o.specification||'');
      if(sp&&sp.mats) sp.mats.forEach(m=>{totalCost+=(parseFloat(m.price)||0)*(parseFloat(m.qty)||0)});
    }catch(e){}
  });
  
  // Расходы за период
  const periodExpenses=expenses.filter(e=>{
    const d=new Date(e.expense_date);
    if(aFrom&&d<aFrom) return false;
    if(aTo&&d>aTo) return false;
    return true;
  });
  const totalExpenses=periodExpenses.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  // Прибыль = полученные деньги − себестоимость − расходы
  const profit=received-totalCost-totalExpenses;
  const avgCheck=closed.length?closed.reduce((s,o)=>s+(parseFloat(o.order_sum)||0),0)/closed.length:0;
  const totalAll=ao.filter(o=>{const s=(o.status||'').trim();return s!=='Отправлено КП'}).length;
  const convRate=totalAll>0?(closed.length/totalAll*100):0;

  $('a-contracts').textContent=fmt(contracts);
  $('a-received').textContent=fmt(received);
  $('a-cost').textContent=fmt(totalCost);
  $('a-expenses').textContent=fmt(totalExpenses);
  $('a-profit').textContent=fmt(profit);
  $('a-profit').style.color=profit>=0?'var(--accent)':'var(--red)';
  $('a-avg').textContent=fmt(avgCheck);
  $('a-conv').textContent=Math.round(convRate)+'%';
  $('a-refuse').textContent=refused.length;

  renderRevenueChart(ao);
  renderFunnelChart(ao);
  renderSourcesChart(ao);
  renderManagersTable(ao);
  renderMatUsage();
  renderMatLow();
  renderStatusTiming();
  renderProfitabilityTable(ao);
}

// ── Таблица прибыльности заказов ──
function renderProfitabilityTable(ao){
  const el=$('a-profitability');
  if(!el) return;
  
  // Берём заказы с спецификацией или с предоплатой
  const list=ao.filter(o=>{
    const s=(o.status||'').trim();
    if(s==='Отправлено КП'||s==='Отказались') return false;
    const sum=parseFloat(o.order_sum)||0;
    return sum>0;
  });
  
  if(!list.length){el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:20px;text-align:center">Нет данных за период</div>';return}
  
  const rows=list.map(o=>{
    const f=calcOrderFinance(o);
    return {o,f};
  }).filter(r=>r.f);
  
  // Сортируем по чистой прибыли убывание
  rows.sort((a,b)=>b.f.netProfit-a.f.netProfit);
  
  // Итоги
  const totalRevenue=rows.reduce((s,r)=>s+r.f.prepay,0);
  const totalCost=rows.reduce((s,r)=>s+r.f.totalCost,0);
  const totalOverhead=rows.reduce((s,r)=>s+r.f.overheadShare,0);
  const totalGross=rows.reduce((s,r)=>s+r.f.grossProfit,0);
  const totalNet=rows.reduce((s,r)=>s+r.f.netProfit,0);
  const avgNetPct=totalRevenue>0?(totalNet/totalRevenue*100):0;
  
  let h=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
    <div style="background:var(--surface);padding:10px;border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Поступления</div>
      <div style="font-size:16px;font-weight:600;color:var(--accent-text)">${fmt(totalRevenue)}</div>
    </div>
    <div style="background:var(--surface);padding:10px;border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Затраты</div>
      <div style="font-size:16px;font-weight:600">${fmt(totalCost+totalOverhead)}</div>
    </div>
    <div style="background:var(--surface);padding:10px;border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Валовая прибыль</div>
      <div style="font-size:16px;font-weight:600;color:${totalGross>=0?'var(--accent-text)':'var(--red)'}">${fmt(totalGross)}</div>
    </div>
    <div style="background:var(--surface);padding:10px;border-radius:var(--rs)">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Чистая прибыль</div>
      <div style="font-size:16px;font-weight:700;color:${totalNet>=0?'var(--accent-text)':'var(--red)'}">${fmt(totalNet)} <span style="font-size:11px;font-weight:400;color:var(--text3)">(${avgNetPct.toFixed(1)}%)</span></div>
    </div>
  </div>`;
  
  h+=`<table style="width:100%;font-size:12px;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:1px solid var(--border);color:var(--text3);text-transform:uppercase;font-size:10px">
        <th style="text-align:left;padding:8px 6px;font-weight:500">№</th>
        <th style="text-align:left;padding:8px 6px;font-weight:500">Клиент</th>
        <th style="text-align:left;padding:8px 6px;font-weight:500">Статус</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500">Договор</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500">Получено</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500">Затраты</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500">Валовая</th>
        <th style="text-align:right;padding:8px 6px;font-weight:500">Чистая</th>
      </tr>
    </thead>
    <tbody>`;
  
  rows.forEach(({o,f})=>{
    let rowColor='';
    if(f.netProfit<0) rowColor='background:var(--red-light)';
    else if(f.netProfitPct<10) rowColor='background:#fef3c7'; // жёлто-янтарный
    
    h+=`<tr style="${rowColor};border-bottom:1px solid var(--border);cursor:pointer" onclick="showPage('orders');setTimeout(()=>openEdit('${o.order_num}'),200)">
      <td style="padding:8px 6px;font-weight:500;color:var(--blue)">${o.order_num||'—'}</td>
      <td style="padding:8px 6px">${o.client||'—'}</td>
      <td style="padding:8px 6px;font-size:11px;color:var(--text2)">${o.status||'—'}</td>
      <td style="padding:8px 6px;text-align:right">${fmt(f.sum)}</td>
      <td style="padding:8px 6px;text-align:right;color:var(--accent-text)">${fmt(f.prepay)}</td>
      <td style="padding:8px 6px;text-align:right">${fmt(f.totalCost+f.overheadShare)}</td>
      <td style="padding:8px 6px;text-align:right;color:${f.grossProfit>=0?'var(--accent-text)':'var(--red)'}">${fmt(f.grossProfit)}</td>
      <td style="padding:8px 6px;text-align:right;font-weight:600;color:${f.netProfit>=0?'var(--accent-text)':'var(--red)'}">${fmt(f.netProfit)} <span style="font-size:10px;font-weight:400;color:var(--text3)">(${f.netProfitPct.toFixed(0)}%)</span></td>
    </tr>`;
  });
  
  h+='</tbody></table>';
  
  el.innerHTML=h;
}

function renderRevenueChart(ao){
  const months={};
  
  // Доход — группируем платежи из payments по месяцу payment_date
  paymentsCache.forEach(p=>{
    if(!p.payment_date) return;
    const d=new Date(p.payment_date);
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!months[key]) months[key]={rev:0,cost:0,exp:0};
    months[key].rev+=(parseFloat(p.amount)||0);
  });
  
  // Себестоимость — по заказам, в которые поступали платежи в этом месяце
  const orderPaidMonths={}; // order_num -> Set месяцев когда был платёж
  paymentsCache.forEach(p=>{
    if(!p.payment_date||!p.order_num) return;
    const d=new Date(p.payment_date);
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!orderPaidMonths[p.order_num]) orderPaidMonths[p.order_num]=new Set();
    orderPaidMonths[p.order_num].add(key);
  });
  
  const working=ao.filter(o=>{const s=(o.status||'').trim();return s!=='Отправлено КП'&&s!=='Отказались'});
  working.forEach(o=>{
    const paidMonths=orderPaidMonths[o.order_num];
    if(!paidMonths||!paidMonths.size) return;
    let cost=0;
    try{
      const sp=JSON.parse(o.specification||'');
      if(sp&&sp.mats) sp.mats.forEach(m=>{cost+=(parseFloat(m.price)||0)*(parseFloat(m.qty)||0)});
    }catch(e){}
    if(!cost) return;
    // Себестоимость относим к первому месяцу платежа
    const firstMonth=[...paidMonths].sort()[0];
    if(!months[firstMonth]) months[firstMonth]={rev:0,cost:0,exp:0};
    months[firstMonth].cost+=cost;
  });
  
  // Добавляем расходы из expenses по месяцам
  expenses.forEach(e=>{
    const d=new Date(e.expense_date); if(isNaN(d)) return;
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    if(!months[key]) months[key]={rev:0,cost:0,exp:0};
    months[key].exp+=(parseFloat(e.amount)||0);
  });
  const labels=Object.keys(months).sort();
  const revData=labels.map(k=>months[k].rev);
  const costData=labels.map(k=>months[k].cost);
  const expData=labels.map(k=>months[k].exp);
  const profitData=labels.map(k=>months[k].rev-months[k].cost-months[k].exp);
  const monthNames=labels.map(k=>{const [y,m]=k.split('-');return['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][parseInt(m)-1]+' '+y.slice(2)});

  if(aChartRevenue) aChartRevenue.destroy();
  aChartRevenue=new Chart($('a-chart-revenue'),{
    type:'bar',
    data:{
      labels:monthNames,
      datasets:[
        {label:'Получено',data:revData,backgroundColor:'rgba(42,92,63,0.7)',borderRadius:4},
        {label:'Себестоимость',data:costData,backgroundColor:'rgba(133,79,11,0.5)',borderRadius:4},
        {label:'Расходы',data:expData,backgroundColor:'rgba(163,45,45,0.5)',borderRadius:4},
        {label:'Прибыль',data:profitData,backgroundColor:'rgba(22,163,74,0.65)',borderRadius:4}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11,family:'Geologica'},usePointStyle:true,padding:12}}},scales:{y:{ticks:{callback:v=>v>=1000?(v/1000)+'к':''+v,font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}},x:{ticks:{font:{size:10}},grid:{display:false}}}}
  });
}

function renderFunnelChart(ao){
  const counts={
    'Отправлено КП':0,'Новый':0,'В работе':0,'Готов к выдаче':0,
    'Отгружен':0,'Закрыт':0,'Приостановлен':0,'Отказались':0
  };
  ao.forEach(o=>{const s=(o.status||'').trim();if(s in counts) counts[s]++});
  const labels=['КП','Новый','В работе','Готов','Отгружен','Закрыт','Пауза','Отказ'];
  const data=Object.values(counts);
  const colors=['#185FA5','#534AB7','#854F0B','#2a5c3f','#3b82f6','#16a34a','#A32D2D','#8a7340'];

  if(aChartFunnel) aChartFunnel.destroy();
  aChartFunnel=new Chart($('a-chart-funnel'),{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:colors.map(c=>c+'cc'),borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}},y:{ticks:{font:{size:11,family:'Geologica'}},grid:{display:false}}}}
  });
}

function renderSourcesChart(ao){
  const src={};
  ao.forEach(o=>{const s=(o.source||'Другое').trim();src[s]=(src[s]||0)+1});
  const labels=Object.keys(src);
  const data=Object.values(src);
  const colors=['#2a5c3f','#185FA5','#534AB7','#854F0B','#A32D2D','#3b82f6','#8a7340','#16a34a'];

  if(aChartSources) aChartSources.destroy();
  aChartSources=new Chart($('a-chart-sources'),{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors.slice(0,labels.length).map(c=>c+'cc'),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11,family:'Geologica'},usePointStyle:true,padding:10}}}}
  });
}

function renderManagersTable(ao){
  const mgrs={};
  ao.forEach(o=>{
    const m=(o.manager||'Без менеджера').trim();
    if(!mgrs[m]) mgrs[m]={count:0,sum:0,closed:0,closedSum:0,refused:0};
    mgrs[m].count++;
    mgrs[m].sum+=(parseFloat(o.order_sum)||0);
    const st=(o.status||'').trim();
    if(st==='Закрыт'){mgrs[m].closed++;mgrs[m].closedSum+=(parseFloat(o.order_sum)||0)}
    if(st==='Отказались') mgrs[m].refused++;
  });
  const sorted=Object.entries(mgrs).sort((a,b)=>b[1].closedSum-a[1].closedSum);
  if(!sorted.length){$('a-managers').innerHTML='<div style="color:var(--text3);font-size:13px">Нет данных</div>';return}
  let h=`<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
    <th style="text-align:left;padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border)">Менеджер</th>
    <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);text-align:center">Заказы</th>
    <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);text-align:center">Закрыто</th>
    <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);text-align:right">Выручка</th>
    <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);text-align:center">Отказы</th>
    <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);text-align:center">Конв.</th>
  </tr></thead><tbody>`;
  sorted.forEach(([name,d])=>{
    const conv=d.count>0?Math.round(d.closed/d.count*100):0;
    h+=`<tr>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);font-weight:500">${name}</td>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center">${d.count}</td>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--accent);font-weight:500">${d.closed}</td>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:right;font-weight:500">${d.closedSum?d.closedSum.toLocaleString('ru-RU')+' ₽':'—'}</td>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:${d.refused?'var(--red)':'var(--text3)'}">${d.refused}</td>
      <td style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center"><span style="background:${conv>=50?'var(--accent-light)':'var(--amber-light)'};color:${conv>=50?'var(--accent-text)':'var(--amber)'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${conv}%</span></td>
    </tr>`;
  });
  h+='</tbody></table>';
  $('a-managers').innerHTML=h;
}

function renderMatUsage(){
  const from=$('a-from').value?new Date($('a-from').value):null;
  const to=$('a-to').value?new Date($('a-to').value+'T23:59:59'):null;
  const matName=iid=>{const it=skladItems.find(i=>i.item_id===iid);return it?it.name:iid};
  const usage={};
  skladLog.filter(r=>r.move_type==='out').forEach(r=>{
    const d=new Date(r.move_date);
    if(from&&d<from) return;
    if(to&&d>to) return;
    const name=matName(r.item_id||'');
    usage[name]=(usage[name]||0)+(parseFloat(r.qty)||0);
  });
  const sorted=Object.entries(usage).sort((a,b)=>b[1]-a[1]);
  if(!sorted.length){$('a-mat-usage').innerHTML='<div style="color:var(--text3);font-size:13px">Нет расходов за период</div>';return}
  const maxVal=sorted[0][1];
  let h='';
  sorted.forEach(([name,qty])=>{
    const pct=maxVal>0?qty/maxVal*100:0;
    h+=`<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:var(--text)">${name}</span><span style="font-weight:600;color:var(--text)">${qty}</span></div>
      <div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--red);border-radius:3px;transition:width 0.5s"></div></div>
    </div>`;
  });
  $('a-mat-usage').innerHTML=h;
}

function renderMatLow(){
  const items=skladItems.map(item=>{
    const stock=skladStock(item.item_id);
    const min=parseFloat(item.min_stock)||0;
    return {...item,_stock:stock,_min:min};
  }).filter(i=>i._min>0&&i._stock<=i._min).sort((a,b)=>a._stock-b._stock);

  if(!items.length){$('a-mat-low').innerHTML='<div style="color:var(--accent);font-size:13px">✓ Все материалы в норме</div>';return}
  let h='';
  items.forEach(item=>{
    const pct=item._min>0?Math.min(item._stock/item._min*100,100):100;
    const empty=item._stock<=0;
    h+=`<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="color:${empty?'var(--red)':'var(--text)'};${empty?'font-weight:600':''}">${item.name}</span>
        <span style="font-weight:600;color:${empty?'var(--red)':'var(--amber)'}">${item._stock} / ${item._min} ${item.unit||'шт'}</span>
      </div>
      <div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${empty?'var(--red)':'var(--amber)'};border-radius:3px;transition:width 0.5s"></div></div>
    </div>`;
  });
  $('a-mat-low').innerHTML=h;
}

async function renderStatusTiming(){
  const el=$('a-status-timing');
  if(!el) return;
  el.innerHTML='<div style="color:var(--text3);font-size:12px">Загрузка данных...</div>';
  
  try{
    // Загружаем всю историю статусов
    const {data:allLogs}=await sb.from('order_status_log').select('*').order('changed_at',{ascending:true});
    if(!allLogs||!allLogs.length){
      el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px 0">Нет данных. Статусы начнут записываться при изменениях заказов.</div>';
      return;
    }
    
    // Группируем по заказам
    const byOrder={};
    allLogs.forEach(log=>{
      if(!byOrder[log.order_num]) byOrder[log.order_num]=[];
      byOrder[log.order_num].push(log);
    });
    
    // Считаем среднее время в каждом статусе
    const statusDurations={};
    const statusCounts={};
    
    Object.values(byOrder).forEach(logs=>{
      for(let i=0;i<logs.length;i++){
        const entry=logs[i];
        const next=logs[i+1];
        const dur=next?new Date(next.changed_at)-new Date(entry.changed_at):Date.now()-new Date(entry.changed_at);
        const st=entry.new_status;
        statusDurations[st]=(statusDurations[st]||0)+dur;
        statusCounts[st]=(statusCounts[st]||0)+1;
      }
    });
    
    // Считаем средние
    const avgData=Object.entries(statusDurations).map(([status,totalMs])=>{
      const count=statusCounts[status]||1;
      return {status, avgMs:totalMs/count, count, totalMs};
    }).sort((a,b)=>{
      // Сортируем в порядке жизненного цикла
      const ORDER=['Отправлено КП','Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт','Приостановлен','Рекламация','Отказались'];
      return ORDER.indexOf(a.status)-ORDER.indexOf(b.status);
    });
    
    const maxAvg=Math.max(...avgData.map(d=>d.avgMs),1);
    
    let h=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">`;
    
    // Левая часть — средние по статусам
    h+=`<div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Среднее время нахождения</div>`;
    avgData.forEach(d=>{
      const pct=maxAvg>0?d.avgMs/maxAvg*100:0;
      const bc=badgeClass(d.status);
      h+=`<div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
          <span class="badge ${bc}" style="font-size:10px">${d.status}</span>
          <span style="font-size:12px;font-weight:600">${formatDuration(d.avgMs)}</span>
        </div>
        <div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width 0.5s"></div></div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${d.count} заказ(ов)</div>
      </div>`;
    });
    h+=`</div>`;
    
    // Правая часть — топ долгих заказов
    h+=`<div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Самые долгие заказы (общее время)</div>`;
    const orderTotals=Object.entries(byOrder).map(([orderNum,logs])=>{
      const first=new Date(logs[0].changed_at);
      const lastStatus=logs[logs.length-1].new_status;
      const totalMs=(lastStatus==='Закрыт'||lastStatus==='Отказались')?
        new Date(logs[logs.length-1].changed_at)-first : Date.now()-first;
      return {orderNum,totalMs,lastStatus,client:''};
    }).sort((a,b)=>b.totalMs-a.totalMs).slice(0,7);
    
    // Дополняем именами клиентов
    orderTotals.forEach(ot=>{
      const o=findO(ot.orderNum);
      if(o) ot.client=o.client||'';
    });
    
    orderTotals.forEach(ot=>{
      const bc=badgeClass(ot.lastStatus);
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:500;color:var(--text);min-width:50px">${ot.orderNum}</span>
        <span style="font-size:11px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ot.client}</span>
        <span class="badge ${bc}" style="font-size:9px">${ot.lastStatus}</span>
        <span style="font-size:11px;font-weight:600;min-width:55px;text-align:right">${formatDuration(ot.totalMs)}</span>
      </div>`;
    });
    
    h+=`</div></div>`;
    el.innerHTML=h;
  }catch(e){
    el.innerHTML='<div style="color:var(--red);font-size:12px">Ошибка: '+e.message+'</div>';
  }
}

