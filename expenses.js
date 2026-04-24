// ══════════════════════════════════════════════════════
// РАСХОДЫ
// ══════════════════════════════════════════════════════
let expenses=[], expCategories=[], expEditId=null, expCurrentTab='list';
let expensesLoaded=false;

function setExpPeriod(mode){
  const now=new Date();
  if(mode==='month'){
    $('exp-from').value=localDateStr(new Date(now.getFullYear(),now.getMonth(),1));
    $('exp-to').value=localDateStr(new Date(now.getFullYear(),now.getMonth()+1,0));
  } else if(mode==='quarter'){
    const qm=Math.floor(now.getMonth()/3)*3;
    $('exp-from').value=localDateStr(new Date(now.getFullYear(),qm,1));
    $('exp-to').value=localDateStr(new Date(now.getFullYear(),qm+3,0));
  } else if(mode==='year'){
    $('exp-from').value=localDateStr(new Date(now.getFullYear(),0,1));
    $('exp-to').value=localDateStr(new Date(now.getFullYear(),11,31));
  } else { $('exp-from').value=''; $('exp-to').value=''; }
  renderExpenses();
}

async function loadExpenses(){
  try{
    const [eRes,cRes]=await Promise.all([
      sb.from('expenses').select('*').order('expense_date',{ascending:false}),
      sb.from('expense_categories').select('*').order('id')
    ]);
    if(eRes.data) expenses=eRes.data;
    if(cRes.data) expCategories=cRes.data;
    fillExpCatFilter();
    await processRecurringExpenses(); // Автосоздание регулярных за текущий месяц
    if(!expensesLoaded){ setExpPeriod('month'); expensesLoaded=true; }
    else renderExpenses();
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── Автосоздание регулярных расходов за текущий месяц ──
async function processRecurringExpenses(){
  const recur=expenses.filter(e=>e.is_recurring);
  if(!recur.length) return;
  
  const now=new Date();
  const yearMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const today=now.getDate();
  let created=0;
  
  for(const r of recur){
    const day=r.recurring_day||1;
    if(today<day) continue; // ещё не наступил день списания
    
    const expDate=yearMonth+'-'+String(day).padStart(2,'0');
    
    // Проверяем — уже есть расход за этот месяц от этого регулярного?
    const exists=expenses.find(e=>
      !e.is_recurring &&
      e.expense_date===expDate &&
      e.category===r.category &&
      e.description===r.description &&
      Math.abs((parseFloat(e.amount)||0)-(parseFloat(r.amount)||0))<0.01
    );
    if(exists) continue;
    
    const row={
      expense_date:expDate,
      category:r.category,
      amount:parseFloat(r.amount)||0,
      description:(r.description||'')+(r.description?' ':'')+'🔄',
      order_num:r.order_num||null,
      is_recurring:false,
      recurring_day:null
    };
    
    try{
      const {data,error}=await sb.from('expenses').insert(row).select().single();
      if(!error&&data){
        expenses.unshift(data);
        created++;
      }
    }catch(e){console.log('Recurring create error:',e)}
  }
  
  if(created) showToast('🔄 Создано '+created+' регулярных расходов');
}

function getExpFiltered(){
  const from=$('exp-from').value?new Date($('exp-from').value):null;
  const to=$('exp-to').value?new Date($('exp-to').value+'T23:59:59'):null;
  return expenses.filter(e=>{
    if(!from&&!to) return true;
    const d=new Date(e.expense_date);
    if(from&&d<from) return false;
    if(to&&d>to) return false;
    return true;
  });
}

function getCatInfo(catName){
  const c=expCategories.find(c=>c.name===catName);
  return c||{name:catName,icon:'📁',color:'#6b6a64'};
}

function fillExpCatFilter(){
  const sel=$('exp-filter-cat'); if(!sel) return;
  sel.innerHTML='<option value="">Все категории</option>';
  expCategories.forEach(c=>{
    const opt=document.createElement('option');
    opt.value=c.name; opt.textContent=c.icon+' '+c.name;
    sel.appendChild(opt);
  });
  // Заполняем select в модалке
  const catSel=$('exp-cat');
  if(catSel){
    catSel.innerHTML=expCategories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  }
}

function renderExpenses(){
  const filtered=getExpFiltered();
  
  // Собираем себестоимость из заказов за тот же период
  const from=$('exp-from').value?new Date($('exp-from').value):null;
  const to=$('exp-to').value?new Date($('exp-to').value+'T23:59:59'):null;
  const orderCosts=[];
  orders.forEach(o=>{
    const d=pDate(o.order_date);if(!d)return;
    if(from&&d<from)return;if(to&&d>to)return;
    const s=(o.status||'').trim();
    if(s==='Отправлено КП'||s==='Отказались')return;
    try{
      const sp=JSON.parse(o.specification||'');
      let matCost=0,workCost=0;
      if(sp&&sp.mats) sp.mats.forEach(m=>{matCost+=(parseFloat(m.price)||0)*(parseFloat(m.qty)||0)});
      if(sp&&sp.works) sp.works.forEach(w=>{workCost+=(parseFloat(w.price)||0)*(parseFloat(w.qty)||0)});
      if(matCost>0) orderCosts.push({type:'mat',date:o.order_date,order_num:o.order_num,client:o.client,amount:matCost});
      if(workCost>0) orderCosts.push({type:'work',date:o.order_date,order_num:o.order_num,client:o.client,amount:workCost});
    }catch(e){}
  });
  const totalOrderMatCost=orderCosts.filter(c=>c.type==='mat').reduce((s,c)=>s+c.amount,0);
  const totalOrderWorkCost=orderCosts.filter(c=>c.type==='work').reduce((s,c)=>s+c.amount,0);
  
  // KPI
  const total=filtered.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const matSum=filtered.filter(e=>e.category==='Материалы').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const salarySum=filtered.filter(e=>e.category==='Зарплата').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const fixedCats=['Аренда','Коммуналка','Связь'];
  const fixedSum=filtered.filter(e=>fixedCats.includes(e.category)).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const recurCount=expenses.filter(e=>e.is_recurring).length;

  $('exp-total').textContent=fmt(total+totalOrderMatCost+totalOrderWorkCost);
  $('exp-mat').textContent=fmt(matSum+totalOrderMatCost);
  $('exp-salary').textContent=fmt(salarySum+totalOrderWorkCost);
  $('exp-fixed').textContent=fmt(fixedSum);
  $('exp-recur').textContent=recurCount;

  renderExpList(orderCosts);
  renderExpByCat();
  renderExpRecurring();
}

function setExpTab(tab,el){
  expCurrentTab=tab;
  document.querySelectorAll('#page-expenses .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  $('exp-tab-list').style.display=tab==='list'?'':'none';
  $('exp-tab-by-cat').style.display=tab==='by-cat'?'':'none';
  $('exp-tab-recurring').style.display=tab==='recurring'?'':'none';
  $('exp-tab-template').style.display=tab==='template'?'':'none';
  if(tab==='template') renderExpTemplate();
}

function renderExpList(orderCosts){
  const q=($('exp-search')?.value||'').toLowerCase();
  const catFilter=$('exp-filter-cat')?.value||'';
  let list=getExpFiltered();
  if(catFilter) list=list.filter(e=>e.category===catFilter);
  if(q) list=list.filter(e=>(e.description||'').toLowerCase().includes(q)||(e.category||'').toLowerCase().includes(q)||(e.order_num||'').toLowerCase().includes(q));

  // Объединяем с себестоимостью заказов
  const costRows=(orderCosts||[]).filter(c=>{
    if(catFilter&&catFilter!=='Себестоимость') return false;
    if(q){
      const s=(c.client||'').toLowerCase()+(c.order_num||'').toLowerCase()+(c.type==='mat'?'материалы':'работа');
      if(!s.includes(q)) return false;
    }
    return true;
  }).map(c=>({
    _isCost:true,
    expense_date:c.date,
    category:c.type==='mat'?'📦 Материалы (себест.)':'🔧 Работа (себест.)',
    description:(c.client||'—'),
    order_num:c.order_num,
    amount:c.amount
  }));

  const merged=[...list.map(e=>({...e,_isCost:false})),...costRows];
  merged.sort((a,b)=>new Date(b.expense_date)-new Date(a.expense_date));

  if(!merged.length){$('exp-list-body').innerHTML='<div class="empty-state">Расходов не найдено</div>';return}
  let h=`<table><thead><tr><th>Дата</th><th>Категория</th><th>Описание</th><th>Заказ</th><th style="text-align:right">Сумма</th><th></th></tr></thead><tbody>`;
  merged.forEach(e=>{
    const d=e.expense_date?new Date(e.expense_date).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    if(e._isCost){
      h+=`<tr style="background:var(--accent-light)">
        <td style="color:var(--text3);font-size:11px;white-space:nowrap">${d}</td>
        <td><span style="background:var(--accent-light);color:var(--accent-text);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${e.category}</span></td>
        <td style="font-size:12px">${e.description}</td>
        <td style="font-size:11px;color:var(--blue);cursor:pointer" onclick="showPage('orders');setTimeout(()=>openEdit('${e.order_num}'),200)">${e.order_num||'—'}</td>
        <td style="text-align:right;font-weight:600;color:var(--amber);font-size:13px">${(parseFloat(e.amount)||0).toLocaleString('ru-RU')} ₽</td>
        <td></td>
      </tr>`;
    } else {
      const ci=getCatInfo(e.category);
      h+=`<tr>
        <td style="color:var(--text3);font-size:11px;white-space:nowrap">${d}</td>
        <td><span style="background:${ci.color}18;color:${ci.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${ci.icon} ${e.category}</span></td>
        <td style="font-size:12px">${e.description||'—'}${e.is_recurring?'<span style="margin-left:4px;font-size:10px;color:var(--blue)">🔄</span>':''}</td>
        <td style="font-size:11px;color:var(--blue)">${e.order_num||'—'}</td>
        <td style="text-align:right;font-weight:600;color:var(--red);font-size:13px">${(parseFloat(e.amount)||0).toLocaleString('ru-RU')} ₽</td>
        <td><button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="openExpense(${e.id})">Изм.</button></td>
      </tr>`;
    }
  });
  h+='</tbody></table>';
  $('exp-list-body').innerHTML=h;
}

function renderExpByCat(){
  const filtered=getExpFiltered();
  const cats={};
  filtered.forEach(e=>{
    const c=e.category||'Прочее';
    cats[c]=(cats[c]||0)+(parseFloat(e.amount)||0);
  });
  const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const total=sorted.reduce((s,[,v])=>s+v,0);
  if(!sorted.length){$('exp-cat-cards').innerHTML='<div class="empty-state">Нет данных</div>';return}
  let h='';
  sorted.forEach(([cat,sum])=>{
    const ci=getCatInfo(cat);
    const pct=total>0?sum/total*100:0;
    h+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${ci.icon}</span>
          <span style="font-size:14px;font-weight:500">${cat}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:600;color:var(--red)">${sum.toLocaleString('ru-RU')} ₽</div>
          <div style="font-size:11px;color:var(--text3)">${Math.round(pct)}% от общих</div>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${ci.color};border-radius:3px"></div></div>
    </div>`;
  });
  $('exp-cat-cards').innerHTML=h;
}

function renderExpRecurring(){
  const recur=expenses.filter(e=>e.is_recurring);
  if(!recur.length){$('exp-recur-body').innerHTML='<div class="empty-state">Нет регулярных платежей. Отметьте расход как "Регулярный" при создании.</div>';return}
  const monthTotal=recur.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  let h=`<div style="background:var(--blue-light);border-radius:var(--r);padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:13px;color:var(--blue);font-weight:500">Ежемесячная сумма регулярных расходов</span>
    <span style="font-size:20px;font-weight:600;color:var(--blue)">${monthTotal.toLocaleString('ru-RU')} ₽</span>
  </div>`;
  h+=`<div class="table-wrap"><table><thead><tr><th>Категория</th><th>Описание</th><th>День месяца</th><th style="text-align:right">Сумма</th><th></th></tr></thead><tbody>`;
  recur.forEach(e=>{
    const ci=getCatInfo(e.category);
    h+=`<tr>
      <td><span style="background:${ci.color}18;color:${ci.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${ci.icon} ${e.category}</span></td>
      <td style="font-size:12px">${e.description||'—'}</td>
      <td style="font-size:12px;text-align:center">${e.recurring_day||1}-го числа</td>
      <td style="text-align:right;font-weight:600;color:var(--red)">${(parseFloat(e.amount)||0).toLocaleString('ru-RU')} ₽</td>
      <td><button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="openExpense(${e.id})">Изм.</button></td>
    </tr>`;
  });
  h+='</tbody></table></div>';
  $('exp-recur-body').innerHTML=h;
}

// ── EXPENSE MODAL ──────────────────────────────────
function toggleRecur(){
  const checked=$('exp-is-recur').checked;
  $('exp-recur-day-wrap').style.display=checked?'flex':'none';
}

function openExpense(id=null){
  expEditId=id;
  $('exp-modal-title').textContent=id?'Редактировать расход':'Новый расход';
  $('exp-del-btn').style.display=id?'inline-flex':'none';
  $('exp-date').value=localDateStr(new Date());
  $('exp-amount').value='';
  $('exp-desc').value='';
  $('exp-order').value='';
  $('exp-is-recur').checked=false;
  $('exp-recur-day').value=1;
  $('exp-recur-day-wrap').style.display='none';
  fillExpCatFilter();

  if(id){
    const e=expenses.find(x=>x.id===id);
    if(e){
      $('exp-date').value=e.expense_date||'';
      $('exp-cat').value=e.category||'';
      $('exp-amount').value=e.amount||'';
      $('exp-desc').value=e.description||'';
      $('exp-order').value=e.order_num||'';
      $('exp-is-recur').checked=!!e.is_recurring;
      $('exp-recur-day').value=e.recurring_day||1;
      toggleRecur();
    }
  }
  $('m-expense').classList.add('open');
}

function closeExpense(){ $('m-expense').classList.remove('open'); expEditId=null }

async function saveExpense(){
  const amount=parseFloat($('exp-amount').value)||0;
  if(amount<=0){showToast('Укажите сумму');return}
  const row={
    expense_date:$('exp-date').value||localDateStr(new Date()),
    category:$('exp-cat').value||'Прочее',
    amount:amount,
    description:$('exp-desc').value||'',
    order_num:$('exp-order').value.split('—')[0].trim()||null,
    is_recurring:$('exp-is-recur').checked,
    recurring_day:$('exp-is-recur').checked?(parseInt($('exp-recur-day').value)||1):null
  };
  try{
    if(expEditId){
      const {error}=await sb.from('expenses').update(row).eq('id',expEditId);
      if(error) throw error;
      auditLog('update','expense',String(expEditId),{amount:row.amount,desc:row.description});
      showToast('Расход обновлён');
    } else {
      const {error}=await sb.from('expenses').insert(row);
      if(error) throw error;
      auditLog('create','expense','',{amount:row.amount,desc:row.description,category:row.category});
      showToast('Расход добавлен');
    }
    closeExpense();
    await loadExpenses();
    render(); // обновляем колонку расходов в заказах
  }catch(e){ showToast('Ошибка: '+e.message) }
}

async function deleteExpense(){
  if(!expEditId) return;
  if(!confirm('Удалить этот расход?')) return;
  try{
    const {error}=await sb.from('expenses').delete().eq('id',expEditId);
    if(error) throw error;
    closeExpense();
    await loadExpenses();
    render(); // обновляем колонку расходов в заказах
    showToast('Расход удалён');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

function addExpenseForOrder(orderNum){
  openExpense();
  setTimeout(()=>{$('exp-order').value=orderNum},50);
}

function showOrderExpenses(orderNum){
  const list=getOrderExpenses(orderNum);
  if(!list.length){showToast('Нет расходов');return}
  const total=list.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  let overlay=$('m-block');
  if(!overlay){
    overlay=document.createElement('div');overlay.className='overlay';overlay.id='m-block';
    overlay.innerHTML=`<div class="modal" style="max-width:520px"><div class="modal-hd"><div class="modal-title">Расходы</div><button class="modal-close" onclick="this.closest('.overlay').classList.remove('open')">×</button></div><div class="modal-body" id="m-block-body"></div></div>`;
    document.body.appendChild(overlay);
  }
  let html=`<div style="font-size:14px;font-weight:600;margin-bottom:14px">Расходы по заказу ${orderNum}</div>`;
  html+=`<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px"><thead><tr>
    <th style="text-align:left;padding:6px 8px;background:var(--surface2);border:1px solid var(--border)">Дата</th>
    <th style="text-align:left;padding:6px 8px;background:var(--surface2);border:1px solid var(--border)">Категория</th>
    <th style="text-align:left;padding:6px 8px;background:var(--surface2);border:1px solid var(--border)">Описание</th>
    <th style="text-align:right;padding:6px 8px;background:var(--surface2);border:1px solid var(--border)">Сумма</th>
  </tr></thead><tbody>`;
  list.forEach(e=>{
    const ci=getCatInfo(e.category);
    const d=e.expense_date?new Date(e.expense_date).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    html+=`<tr>
      <td style="padding:7px 8px;border:1px solid var(--border);font-size:11px;color:var(--text3)">${d}</td>
      <td style="padding:7px 8px;border:1px solid var(--border)"><span style="font-size:11px">${ci.icon} ${e.category}</span></td>
      <td style="padding:7px 8px;border:1px solid var(--border)">${e.description||'—'}</td>
      <td style="padding:7px 8px;border:1px solid var(--border);text-align:right;font-weight:600;color:var(--red)">${(parseFloat(e.amount)||0).toLocaleString('ru-RU')} ₽</td>
    </tr>`;
  });
  html+=`</tbody></table>`;
  html+=`<div style="display:flex;justify-content:space-between;align-items:center;background:var(--red-light);border-radius:var(--rs);padding:10px 14px">
    <span style="font-size:13px;font-weight:500;color:var(--red)">Итого расходов</span>
    <span style="font-size:18px;font-weight:600;color:var(--red)">${total.toLocaleString('ru-RU')} ₽</span>
  </div>`;
  html+=`<div style="display:flex;gap:8px;margin-top:14px">
    <button class="btn btn-primary" onclick="document.getElementById('m-block').classList.remove('open');addExpenseForOrder('${orderNum}')" style="flex:1;justify-content:center">+ Добавить расход</button>
    <button class="btn btn-ghost" onclick="document.getElementById('m-block').classList.remove('open')" style="flex:1;justify-content:center">Закрыть</button>
  </div>`;
  $('m-block-body').innerHTML=html;
  overlay.classList.add('open');
}

// ── EXPENSE CATEGORIES ─────────────────────────────
function openExpCategories(){
  renderExpCatsList();
  $('m-exp-cats').classList.add('open');
}
function closeExpCategories(){ $('m-exp-cats').classList.remove('open') }

function renderExpCatsList(){
  const el=$('exp-cats-list');
  if(!expCategories.length){el.innerHTML='<div style="color:var(--text3);font-size:13px">Нет категорий</div>';return}
  el.innerHTML=expCategories.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:16px;width:24px;text-align:center">${c.icon}</span>
    <span style="flex:1;font-size:13px;font-weight:500">${c.name}</span>
    <div style="width:14px;height:14px;border-radius:50%;background:${c.color}"></div>
    <button onclick="removeExpCategory(${c.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button>
  </div>`).join('');
}

async function addExpCategory(){
  const name=$('exp-new-cat-name').value.trim();
  const icon=$('exp-new-cat-icon').value.trim()||'📁';
  if(!name){showToast('Укажите название');return}
  try{
    const {error}=await sb.from('expense_categories').insert({name,icon,color:'#6b6a64'});
    if(error) throw error;
    $('exp-new-cat-name').value='';$('exp-new-cat-icon').value='';
    const {data}=await sb.from('expense_categories').select('*').order('id');
    if(data) expCategories=data;
    renderExpCatsList();
    fillExpCatFilter();
    showToast('Категория добавлена');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

async function removeExpCategory(id){
  if(!confirm('Удалить категорию?')) return;
  try{
    await sb.from('expense_categories').delete().eq('id',id);
    expCategories=expCategories.filter(c=>c.id!==id);
    renderExpCatsList();
    fillExpCatFilter();
    showToast('Категория удалена');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── EXPENSE TEMPLATES (авто-расходы при создании заказа) ──
function getExpTemplates(){
  try{return JSON.parse(localStorage.getItem('k2_exp_templates')||'[]')}catch(e){return[]}
}
function saveExpTemplates(tpls){
  localStorage.setItem('k2_exp_templates',JSON.stringify(tpls));
}

function renderExpTemplate(){
  const tpls=getExpTemplates();
  const el=$('exp-template-list');
  // Заполняем select категорий
  const catSel=$('tpl-cat');
  if(catSel) catSel.innerHTML=expCategories.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');

  if(!tpls.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px 0">Нет шаблонов. Добавьте расходы которые повторяются в каждом заказе.</div>';
    return;
  }
  let h='';
  tpls.forEach((t,i)=>{
    const ci=getCatInfo(t.category);
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="background:${ci.color}18;color:${ci.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${ci.icon} ${t.category}</span>
      <span style="flex:1;font-size:13px">${t.description||'—'}</span>
      <span style="font-size:13px;font-weight:600;color:var(--red)">${(t.amount||0).toLocaleString('ru-RU')} ₽</span>
      <button onclick="removeExpTemplate(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">×</button>
    </div>`;
  });
  const total=tpls.reduce((s,t)=>s+(t.amount||0),0);
  h+=`<div style="text-align:right;padding:8px 0;font-size:12px"><span style="color:var(--text3)">Итого на заказ:</span> <b style="color:var(--red)">${total.toLocaleString('ru-RU')} ₽</b></div>`;
  el.innerHTML=h;
}

function addExpTemplate(){
  const cat=$('tpl-cat')?.value||'Прочее';
  const desc=$('tpl-desc').value.trim();
  const amount=parseFloat($('tpl-amount').value)||0;
  if(!desc){showToast('Укажите описание');return}
  if(amount<=0){showToast('Укажите сумму');return}
  const tpls=getExpTemplates();
  tpls.push({category:cat,description:desc,amount});
  saveExpTemplates(tpls);
  $('tpl-desc').value=''; $('tpl-amount').value='';
  renderExpTemplate();
  showToast('Шаблон добавлен');
}

function removeExpTemplate(idx){
  const tpls=getExpTemplates();
  tpls.splice(idx,1);
  saveExpTemplates(tpls);
  renderExpTemplate();
}

async function autoCreateExpenses(orderNum){
  const tpls=getExpTemplates();
  if(!tpls.length) return;
  const today=localDateStr(new Date());
  const rows=tpls.map(t=>({
    expense_date:today,
    category:t.category,
    amount:t.amount,
    description:t.description,
    order_num:orderNum,
    is_recurring:false
  }));
  try{
    await sb.from('expenses').insert(rows);
    expenses.push(...rows);
    showToast('Авто-расходы: '+rows.length+' добавлено к '+orderNum);
  }catch(e){}
}

