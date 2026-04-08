        file_type:file.type,
        file_size:file.size,
        uploaded_by:currentProfile?.full_name||''
      };
      const {error:dbErr}=await sb.from('order_files').insert(row);
      if(dbErr) throw dbErr;
      
      orderFiles.unshift(row);
      uploaded++;
    }catch(e){
      showToast('Ошибка загрузки: '+e.message);
    }
  }
  
  if(uploaded){
    await loadOrderFiles(orderNum);
    showToast('Загружено '+uploaded+' файл(ов)');
  }
  // Сброс input
  $('f-file-input').value='';
}

async function deleteOrderFile(id,url){
  if(!confirm('Удалить файл?')) return;
  try{
    // Извлекаем путь из URL для удаления из storage
    const path=url.split('/order-files/')[1];
    if(path) await sb.storage.from('order-files').remove([decodeURIComponent(path)]);
    // Удаляем запись
    await sb.from('order_files').delete().eq('id',id);
    orderFiles=orderFiles.filter(f=>f.id!==id);
    renderOrderFiles();
    showToast('Файл удалён');
  }catch(e){showToast('Ошибка: '+e.message)}
}

// ══════════════════════════════════════════════════════
// ЗАРПЛАТА
// ══════════════════════════════════════════════════════
let payWorkers=[],payRates=[],payEntries=[],payTab='calc',payrollLoaded=false,rateUnits=[],payShifts=[];

async function loadPayroll(){
  const [wR,rR,eR,uR,sR]=await Promise.all([
    sb.from('workers').select('*').order('name'),
    sb.from('work_rates').select('*').order('stage_key').order('sort_order'),
    sb.from('payroll_entries').select('*').order('work_date',{ascending:false}),
    sb.from('rate_units').select('*').order('id'),
    sb.from('shifts').select('*').order('started_at',{ascending:false}).limit(200)
  ]);
  payWorkers=wR.data||[];payRates=rR.data||[];payEntries=eR.data||[];rateUnits=uR.data||[];payShifts=sR.data||[];
}

async function initPayroll(){
  if(!payrollLoaded){
    await loadPayroll();
    // Ставим текущий месяц
    const now=new Date();
    $('pay-month').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    // Загружаем модель
    const model=getSetting('pay_model','salary_plus');
    $('pay-model').value=model;
    payrollLoaded=true;
  }
  showPayTab(payTab);
}

function savePayModel(){saveSetting('pay_model',$('pay-model').value)}

function showPayTab(tab){
  payTab=tab;
  ['calc','workers','rates','entries','shifts'].forEach(t=>{
    const btn=$('pay-tab-'+t);
    if(btn){btn.style.background=t===tab?'var(--accent-light)':'';btn.style.color=t===tab?'var(--accent-text)':''}
  });
  if(tab==='calc') renderPayCalc();
  else if(tab==='workers') renderPayWorkers();
  else if(tab==='rates') renderPayRates();
  else if(tab==='entries') renderPayEntries();
  else if(tab==='shifts') renderPayShifts();
}

// ── Расчёт ──
function renderPayCalc(){
  const model=$('pay-model').value;
  const monthVal=$('pay-month').value;
  if(!monthVal){$('pay-body').innerHTML='<div style="padding:20px;color:var(--text3)">Выберите месяц</div>';return}
  const [y,mo]=monthVal.split('-').map(Number);
  const from=new Date(y,mo-1,1),to=new Date(y,mo,0,23,59,59);
  
  const mEntries=payEntries.filter(e=>{const d=new Date(e.work_date);return d>=from&&d<=to});
  const activeWorkers=payWorkers.filter(w=>w.is_active);
  
  // Считаем рабочие дни в месяце (Пн-Пт)
  let workDaysInMonth=0;
  for(let d=new Date(y,mo-1,1);d<=to;d.setDate(d.getDate()+1)){
    const dow=d.getDay();if(dow!==0&&dow!==6) workDaysInMonth++;
  }
  
  // Завершённые этапы за месяц
  const stagesDone=[];
  orders.forEach(o=>{
    const stages=getOrderStages(o);
    Object.entries(stages).forEach(([key,val])=>{
      if(val&&val.done&&val.date){
        const d=new Date(val.date);
        if(d>=from&&d<=to) stagesDone.push({order_num:o.order_num,client:o.client,stage_key:key,date:val.date,order_sum:parseFloat(o.order_sum)||0});
      }
    });
  });
  
  // Закрытые заказы за месяц
  const closedOrders=orders.filter(o=>{
    const s=(o.status||'').trim();
    if(s!=='Закрыт'&&s!=='Отгружен') return false;
    const stages=getOrderStages(o);
    const lastDone=Object.values(stages).filter(v=>v&&v.done&&v.date).map(v=>new Date(v.date)).sort((a,b)=>b-a)[0];
    return lastDone&&lastDone>=from&&lastDone<=to;
  });
  
  let h='';
  
  // Сводка
  const totalPiece=mEntries.filter(e=>e.note!=='штраф'&&e.note!=='бонус').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalBonuses=mEntries.filter(e=>e.note==='бонус').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalPenalties=mEntries.filter(e=>e.note==='штраф').reduce((s,e)=>s+Math.abs(parseFloat(e.amount)||0),0);
  const totalSalary=activeWorkers.reduce((s,w)=>s+(parseFloat(w.base_salary)||0),0);
  
  h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text3)">Рабочих дней</div>
      <div style="font-size:15px;font-weight:600">${workDaysInMonth}</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text3)">Этапов</div>
      <div style="font-size:15px;font-weight:600">${stagesDone.length}</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text3)">Заказов закрыто</div>
      <div style="font-size:15px;font-weight:600">${closedOrders.length}</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--text3)">Оклады</div>
      <div style="font-size:13px;font-weight:600">${totalSalary.toLocaleString('ru-RU')}₽</div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--accent)">Сдельная</div>
      <div style="font-size:13px;font-weight:600;color:var(--accent)">${totalPiece.toLocaleString('ru-RU')}₽</div>
    </div>
    ${totalBonuses?`<div style="background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--accent-text)">Бонусы</div>
      <div style="font-size:13px;font-weight:600;color:var(--accent-text)">+${totalBonuses.toLocaleString('ru-RU')}₽</div>
    </div>`:''}
    ${totalPenalties?`<div style="background:var(--red-light);border:1px solid var(--red);border-radius:var(--rs);padding:10px;text-align:center">
      <div style="font-size:10px;color:var(--red)">Штрафы</div>
      <div style="font-size:13px;font-weight:600;color:var(--red)">-${totalPenalties.toLocaleString('ru-RU')}₽</div>
    </div>`:''}
  </div>`;
  
  if(!activeWorkers.length){
    h+='<div style="padding:20px;text-align:center;color:var(--text3)">Добавьте сотрудников во вкладке "👷 Сотрудники"</div>';
  } else {
    activeWorkers.forEach(w=>{
      const wEntries=mEntries.filter(e=>e.worker_id===w.id);
      const wPiece=wEntries.filter(e=>e.note!=='штраф'&&e.note!=='бонус').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
      const wBonus=wEntries.filter(e=>e.note==='бонус').reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
      const wPenalty=wEntries.filter(e=>e.note==='штраф').reduce((s,e)=>s+Math.abs(parseFloat(e.amount)||0),0);
      const base=parseFloat(w.base_salary)||0;
      const daysWorked=parseInt(w.days_worked)||workDaysInMonth;
      const salaryProp=workDaysInMonth?Math.round(base*(daysWorked/workDaysInMonth)):base;
      
      let total=0;
      if(model==='salary') total=salaryProp+wBonus-wPenalty;
      else if(model==='salary_plus') total=salaryProp+wPiece+wBonus-wPenalty;
      else if(model==='piece') total=wPiece+wBonus-wPenalty;
      else if(model==='brigade') total=wPiece+wBonus-wPenalty;
      else if(model==='kpi') total=salaryProp+wPiece+wBonus-wPenalty;
      
      const ordersCount=new Set(wEntries.filter(e=>e.order_num).map(e=>e.order_num)).size;
      
      h+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:15px;font-weight:600">${w.name}</div>
            <div style="font-size:11px;color:var(--text3)">${w.role||'цех'} · ${ordersCount} заказов · ${wEntries.length} операций</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700;color:var(--accent-text)">${total.toLocaleString('ru-RU')} ₽</div>
          </div>
        </div>`;
      
      // Разбивка
      if(model!=='piece'&&model!=='brigade'){
        h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;margin-bottom:8px">
          <div style="background:var(--surface2);border-radius:var(--rs);padding:6px 8px;font-size:11px">
            <div style="color:var(--text3)">Оклад</div>
            <div style="font-weight:600">${salaryProp.toLocaleString('ru-RU')} ₽</div>
            ${daysWorked<workDaysInMonth?`<div style="font-size:9px;color:var(--amber)">${daysWorked}/${workDaysInMonth} дней</div>`:''}
          </div>
          <div style="background:var(--accent-light);border-radius:var(--rs);padding:6px 8px;font-size:11px">
            <div style="color:var(--accent-text)">Сдельная</div>
            <div style="font-weight:600;color:var(--accent-text)">${wPiece.toLocaleString('ru-RU')} ₽</div>
          </div>
          ${wBonus?`<div style="background:#16a34a15;border-radius:var(--rs);padding:6px 8px;font-size:11px">
            <div style="color:#16a34a">Бонус</div>
            <div style="font-weight:600;color:#16a34a">+${wBonus.toLocaleString('ru-RU')} ₽</div>
          </div>`:''}
          ${wPenalty?`<div style="background:var(--red-light);border-radius:var(--rs);padding:6px 8px;font-size:11px">
            <div style="color:var(--red)">Штраф</div>
            <div style="font-weight:600;color:var(--red)">-${wPenalty.toLocaleString('ru-RU')} ₽</div>
          </div>`:''}
        </div>`;
      }
      
      // Детализация по этапам
      if(wEntries.filter(e=>e.note!=='штраф'&&e.note!=='бонус').length){
        h+=`<div style="display:flex;flex-wrap:wrap;gap:3px">`;
        wEntries.filter(e=>e.note!=='штраф'&&e.note!=='бонус').forEach(e=>{
          const st=PROD_STAGES.find(s=>s.key===e.stage_key);
          h+=`<span style="font-size:9px;padding:2px 5px;border-radius:4px;background:${st?st.color+'15':'var(--surface2)'};color:${st?st.color:'var(--text2)'}">${st?st.icon:''} ${e.order_num||''} ${(parseFloat(e.amount)||0).toLocaleString('ru-RU')}₽</span>`;
        });
        h+=`</div>`;
      }
      h+=`</div>`;
    });
    
    // Итого
    const grandTotal=activeWorkers.reduce((s,w)=>{
      const wEntries=mEntries.filter(e=>e.worker_id===w.id);
      const wPiece=wEntries.filter(e=>e.note!=='штраф'&&e.note!=='бонус').reduce((ss,e)=>ss+(parseFloat(e.amount)||0),0);
      const wBonus=wEntries.filter(e=>e.note==='бонус').reduce((ss,e)=>ss+(parseFloat(e.amount)||0),0);
      const wPenalty=wEntries.filter(e=>e.note==='штраф').reduce((ss,e)=>ss+Math.abs(parseFloat(e.amount)||0),0);
      const base=parseFloat(w.base_salary)||0;
      if(model==='salary') return s+base+wBonus-wPenalty;
      if(model==='piece'||model==='brigade') return s+wPiece+wBonus-wPenalty;
      return s+base+wPiece+wBonus-wPenalty;
    },0);
    
    h+=`<div style="background:var(--text);color:#fff;border-radius:var(--r);padding:16px;display:flex;justify-content:space-between;align-items:center;margin-top:12px">
      <span style="font-size:13px;opacity:0.7">ИТОГО ЗА МЕСЯЦ</span>
      <span style="font-size:22px;font-weight:700">${grandTotal.toLocaleString('ru-RU')} ₽</span>
    </div>`;
  }
  
  $('pay-body').innerHTML=h;
}

// ── Сотрудники ──
function renderPayWorkers(){
  let h=`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <input class="finput" id="pw-name" placeholder="Имя сотрудника" style="flex:1;min-width:120px">
    <select class="fsel" id="pw-role" style="font-size:12px">
      <option value="цех">Цех</option>
      <option value="монтаж">Монтаж</option>
      <option value="офис">Офис</option>
    </select>
    <input class="finput" id="pw-salary" type="number" placeholder="Оклад ₽" style="width:80px">
    <input class="finput" id="pw-pin" type="text" placeholder="PIN" maxlength="4" style="width:55px;text-align:center;letter-spacing:4px">
    <button class="btn btn-primary" onclick="addWorker()">+</button>
  </div>`;
  
  payWorkers.forEach(w=>{
    h+=`<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);${w.is_active?'':'opacity:0.4'}">
      <span style="font-size:13px;font-weight:500;flex:1">${w.name}</span>
      <span style="font-size:10px;color:var(--text3);padding:2px 6px;border-radius:6px;background:var(--surface2)">${w.role||'цех'}</span>
      <span style="font-size:11px;min-width:65px;text-align:right">${(parseFloat(w.base_salary)||0).toLocaleString('ru-RU')} ₽</span>
      <span style="font-size:10px;color:var(--text3);min-width:35px;text-align:center;font-family:'JetBrains Mono',monospace">${w.pin?'••••':'—'}</span>
      <button onclick="editWorkerPin(${w.id})" style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 5px;cursor:pointer;font-size:9px" title="Изменить PIN">🔑</button>
      <button onclick="toggleWorkerActive(${w.id},${w.is_active?'false':'true'})" style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 5px;cursor:pointer;font-size:9px">${w.is_active?'🟢':'⏸'}</button>
      <button onclick="deleteWorker(${w.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px">×</button>
    </div>`;
  });
  if(!payWorkers.length) h+='<div style="padding:20px;text-align:center;color:var(--text3)">Нет сотрудников</div>';
  $('pay-body').innerHTML=h;
}

async function addWorker(){
  const name=$('pw-name').value.trim();
  if(!name){showToast('Укажите имя');return}
  const pin=$('pw-pin')?.value?.trim()||'';
  try{
    await sb.from('workers').insert({name,role:$('pw-role').value,base_salary:parseFloat($('pw-salary').value)||0,pin});
    $('pw-name').value='';$('pw-salary').value='';if($('pw-pin'))$('pw-pin').value='';
    await loadPayroll();renderPayWorkers();showToast('Сотрудник добавлен');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function editWorkerPin(id){
  const pin=prompt('Введите новый PIN-код (4 цифры):');
  if(pin===null) return;
  if(pin&&(pin.length<1||pin.length>6)){showToast('PIN от 1 до 6 символов');return}
  try{
    await sb.from('workers').update({pin}).eq('id',id);
    const w=payWorkers.find(ww=>ww.id===id);if(w) w.pin=pin;
    renderPayWorkers();showToast('PIN обновлён');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function toggleWorkerActive(id,active){
  try{await sb.from('workers').update({is_active:active}).eq('id',id);await loadPayroll();renderPayWorkers()}catch(e){}
}

async function deleteWorker(id){
  if(!confirm('Удалить сотрудника?')) return;
  try{await sb.from('workers').delete().eq('id',id);await loadPayroll();renderPayWorkers();showToast('Удалён')}catch(e){showToast('Ошибка: '+e.message)}
}

// ── Расценки (дерево: Этап → Виды работ) ──
function renderPayRates(){
  const units=rateUnits.map(u=>u.name);
  
  let h=`<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Этапы берутся из настроек заказов. Для каждого этапа добавьте виды работ с расценками.</div>`;
  
  // Управление единицами измерения
  h+=`<div style="display:flex;gap:6px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--text3)">Единицы:</span>
    ${units.map(u=>`<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--surface2);border:1px solid var(--border)">${u}</span>`).join('')}
    <input class="finput" id="new-rate-unit" placeholder="Новая ед.изм..." style="width:100px;font-size:11px">
    <button class="btn btn-ghost" onclick="addRateUnit()" style="font-size:10px;padding:2px 8px">+</button>
  </div>`;
  
  // Дерево этапов
  PROD_STAGES.forEach(st=>{
    const stageWorks=payRates.filter(r=>r.stage_key===st.key);
    const stageTotal=stageWorks.reduce((s,r)=>s+(parseFloat(r.rate)||0),0);
    const isOpen=stageWorks.length>0;
    
    h+=`<div style="border:1px solid var(--border);border-radius:var(--rs);margin-bottom:6px;overflow:hidden">
      <!-- Заголовок этапа -->
      <div onclick="toggleRateStage('${st.key}')" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${st.color}08;cursor:pointer;border-left:3px solid ${st.color}">
        <span id="rate-arrow-${st.key}" style="font-size:10px;color:var(--text3);transition:transform 0.2s;transform:rotate(${isOpen?'90':'0'}deg)">▶</span>
        <span style="font-size:15px">${st.icon}</span>
        <span style="font-size:13px;font-weight:600;flex:1;color:${st.color}">${st.name}</span>
        <span style="font-size:11px;color:var(--text3)">${stageWorks.length} работ</span>
        ${stageTotal?`<span style="font-size:12px;font-weight:600;color:var(--accent-text)">${stageTotal.toLocaleString('ru-RU')} ₽</span>`:''}
      </div>
      <!-- Виды работ -->
      <div id="rate-body-${st.key}" style="display:${isOpen?'block':'none'};padding:6px 12px 10px;background:var(--surface)">`;
    
    stageWorks.forEach(r=>{
      h+=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.work_name}</span>
        <input type="number" value="${r.rate||0}" onchange="updateWorkRate(${r.id},'rate',this.value)" style="width:65px;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:11px;text-align:right;font-family:'Geologica',sans-serif;outline:none">
        <select onchange="updateWorkRate(${r.id},'unit',this.value)" style="font-size:10px;border:1px solid var(--border);border-radius:4px;padding:3px;font-family:'Geologica',sans-serif;background:var(--surface);color:var(--text2);max-width:90px">
          ${units.map(u=>`<option value="${u}"${r.unit===u?' selected':''}>${u}</option>`).join('')}
        </select>
        <button onclick="deleteWorkRate(${r.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px">×</button>
      </div>`;
    });
    
    // Форма добавления
    h+=`<div style="display:flex;gap:4px;margin-top:6px;align-items:center">
        <input class="finput" id="new-work-${st.key}" placeholder="Вид работы..." style="flex:1;font-size:11px;padding:4px 8px">
        <input class="finput" id="new-rate-${st.key}" type="number" placeholder="₽" style="width:55px;font-size:11px;padding:4px 6px">
        <select id="new-unit-${st.key}" style="font-size:10px;border:1px solid var(--border);border-radius:4px;padding:3px;font-family:'Geologica',sans-serif;background:var(--surface);color:var(--text2)">
          ${units.map(u=>`<option value="${u}">${u}</option>`).join('')}
        </select>
        <button class="btn btn-primary" onclick="addWorkRate('${st.key}')" style="font-size:10px;padding:3px 10px">+</button>
      </div>
      </div>
    </div>`;
  });
  
  $('pay-body').innerHTML=h;
}

function toggleRateStage(key){
  const body=$('rate-body-'+key);
  const arrow=$('rate-arrow-'+key);
  if(!body) return;
  const isOpen=body.style.display!=='none';
  body.style.display=isOpen?'none':'block';
  if(arrow) arrow.style.transform=isOpen?'rotate(0deg)':'rotate(90deg)';
}

async function addWorkRate(stageKey){
  const name=$('new-work-'+stageKey)?.value?.trim();
  if(!name){showToast('Укажите вид работы');return}
  const rate=parseFloat($('new-rate-'+stageKey)?.value)||0;
  const unit=$('new-unit-'+stageKey)?.value||'за заказ';
  const maxSort=payRates.filter(r=>r.stage_key===stageKey).reduce((m,r)=>Math.max(m,r.sort_order||0),0);
  try{
    const {data,error}=await sb.from('work_rates').insert({stage_key:stageKey,work_name:name,rate,unit,sort_order:maxSort+1}).select();
    if(error) throw error;
    if(data&&data[0]) payRates.push(data[0]);
    renderPayRates();
    showToast('Работа "'+name+'" добавлена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function updateWorkRate(id,field,val){
  try{
    const upd={};
    upd[field]=field==='rate'?parseFloat(val)||0:val;
    await sb.from('work_rates').update(upd).eq('id',id);
    const r=payRates.find(rr=>rr.id===id);
    if(r) r[field]=upd[field];
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function deleteWorkRate(id){
  if(!confirm('Удалить вид работы?')) return;
  try{
    await sb.from('work_rates').delete().eq('id',id);
    payRates=payRates.filter(r=>r.id!==id);
    renderPayRates();
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function addRateUnit(){
  const name=($('new-rate-unit')?.value||'').trim();
  if(!name){showToast('Укажите единицу');return}
  try{
    const {error}=await sb.from('rate_units').insert({name});
    if(error) throw error;
    rateUnits.push({name});
    $('new-rate-unit').value='';
    renderPayRates();
    showToast('Единица "'+name+'" добавлена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

// ── Начисления ──
function renderPayEntries(){
  const activeWorkers=payWorkers.filter(w=>w.is_active);
  const monthVal=$('pay-month').value;
  
  let h=`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Добавление сдельных начислений, бонусов и штрафов</div>`;
  
  // Сдельное начисление
  h+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:600;margin-bottom:8px">💰 Сдельное начисление</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <select class="fsel" id="pe-worker" style="font-size:12px;min-width:120px">
        <option value="">Сотрудник</option>
        ${activeWorkers.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
      </select>
      <select class="fsel" id="pe-order" style="font-size:12px;max-width:100px">
        <option value="">Заказ</option>
        ${orders.slice(0,30).map(o=>`<option value="${o.order_num}">${o.order_num}</option>`).join('')}
      </select>
      <select class="fsel" id="pe-stage" onchange="onPayStageChange()" style="font-size:12px;min-width:110px">
        <option value="">Этап</option>
        ${PROD_STAGES.map(s=>`<option value="${s.key}">${s.icon} ${s.name}</option>`).join('')}
      </select>
    </div>
    <!-- Виды работ этапа (появляются после выбора этапа) -->
    <div id="pe-works-list" style="margin-bottom:8px"></div>
    <div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:11px;color:var(--text3)">Итого:</span>
      <input class="finput" id="pe-amount" type="number" placeholder="₽" style="width:80px;font-size:13px;font-weight:600">
      <button class="btn btn-primary" onclick="addPayEntry()" style="font-size:12px;padding:5px 14px">+ Начислить</button>
    </div>
  </div>`;
  
  // Бонус / Штраф
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
    <div style="background:#16a34a10;border:1px solid #16a34a33;border-radius:var(--rs);padding:10px">
      <div style="font-size:11px;font-weight:600;color:#16a34a;margin-bottom:6px">🎁 Бонус</div>
      <div style="display:flex;gap:4px">
        <select class="fsel" id="pe-bonus-worker" style="font-size:11px;flex:1">
          <option value="">Кому</option>
          ${activeWorkers.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
        </select>
        <input class="finput" id="pe-bonus-amount" type="number" placeholder="₽" style="width:60px;font-size:11px">
        <button class="btn btn-ghost" onclick="addBonusPenalty('бонус')" style="font-size:11px;padding:3px 8px;color:#16a34a">+</button>
      </div>
    </div>
    <div style="background:var(--red-light);border:1px solid rgba(163,45,45,0.2);border-radius:var(--rs);padding:10px">
      <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:6px">⚠ Штраф</div>
      <div style="display:flex;gap:4px">
        <select class="fsel" id="pe-penalty-worker" style="font-size:11px;flex:1">
          <option value="">Кому</option>
          ${activeWorkers.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
        </select>
        <input class="finput" id="pe-penalty-amount" type="number" placeholder="₽" style="width:60px;font-size:11px">
        <button class="btn btn-ghost" onclick="addBonusPenalty('штраф')" style="font-size:11px;padding:3px 8px;color:var(--red)">+</button>
      </div>
    </div>
  </div>`;
  
  // Список начислений за месяц
  let filtered=payEntries;
  if(monthVal){
    const [y2,m2]=monthVal.split('-').map(Number);
    const from2=new Date(y2,m2-1,1),to2=new Date(y2,m2,0,23,59,59);
    filtered=payEntries.filter(e=>{const d=new Date(e.work_date);return d>=from2&&d<=to2});
  }
  
  if(filtered.length){
    h+=`<div style="font-size:12px;font-weight:600;margin-bottom:6px">Журнал за месяц (${filtered.length})</div>`;
    filtered.slice(0,50).forEach(e=>{
      const w=payWorkers.find(ww=>ww.id===e.worker_id);
      const st=PROD_STAGES.find(s=>s.key===e.stage_key);
      const isBonus=e.note==='бонус';
      const isPenalty=e.note==='штраф';
      const color=isPenalty?'var(--red)':isBonus?'#16a34a':'var(--text)';
      h+=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="min-width:50px;color:var(--text3);font-size:11px">${new Date(e.work_date).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</span>
        <span style="font-weight:500;min-width:80px">${w?w.name:'—'}</span>
        <span style="min-width:24px">${isPenalty?'⚠':isBonus?'🎁':st?st.icon:''}</span>
        <span style="flex:1;color:var(--text2)">${e.order_num||''}</span>
        <span style="font-weight:600;min-width:70px;text-align:right;color:${color}">${isPenalty?'-':''}${Math.abs(parseFloat(e.amount)||0).toLocaleString('ru-RU')} ₽</span>
        <button onclick="deletePayEntry(${e.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px">×</button>
      </div>`;
    });
  } else {
    h+='<div style="padding:20px;text-align:center;color:var(--text3)">Нет начислений за этот месяц</div>';
  }
  
  $('pay-body').innerHTML=h;
}

async function addBonusPenalty(type){
  const isBonus=type==='бонус';
  const workerId=parseInt($(isBonus?'pe-bonus-worker':'pe-penalty-worker').value);
  const amount=parseFloat($(isBonus?'pe-bonus-amount':'pe-penalty-amount').value)||0;
  if(!workerId){showToast('Выберите сотрудника');return}
  if(!amount){showToast('Укажите сумму');return}
  try{
    await sb.from('payroll_entries').insert({
      worker_id:workerId,
      amount:isBonus?amount:-amount,
      note:type,
      work_date:new Date().toISOString().split('T')[0]
    });
    await loadPayroll();renderPayEntries();
    showToast((isBonus?'🎁 Бонус':'⚠ Штраф')+' '+amount+' ₽ начислен');
    $(isBonus?'pe-bonus-amount':'pe-penalty-amount').value='';
  }catch(e){showToast('Ошибка: '+e.message)}
}

// ── Смены ──
function renderPayShifts(){
  const monthVal=$('pay-month').value;
  let filtered=payShifts;
  
  if(monthVal){
    const [y,m]=monthVal.split('-').map(Number);
    const from=new Date(y,m-1,1),to=new Date(y,m,0,23,59,59);
    filtered=payShifts.filter(s=>{const d=new Date(s.started_at);return d>=from&&d<=to});
  }
  
  let h=`<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
    <select class="fsel" id="shift-filter-worker" onchange="renderPayShifts()" style="font-size:12px">
      <option value="">Все сотрудники</option>
      ${payWorkers.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
    </select>
    <span style="font-size:12px;color:var(--text3)">${filtered.length} смен</span>
  </div>`;
  
  const filterW=parseInt($('shift-filter-worker')?.value)||0;
  if(filterW) filtered=filtered.filter(s=>s.worker_id===filterW);
  
  // Сводка по сотрудникам
  const byWorker={};
  filtered.forEach(s=>{
    const wn=s.worker_name||'—';
    if(!byWorker[wn]) byWorker[wn]={totalMin:0,shifts:0,earned:0};
    byWorker[wn].totalMin+=(s.duration_min||0);
    byWorker[wn].shifts++;
    byWorker[wn].earned+=(parseFloat(s.earned)||0);
  });
  
  if(Object.keys(byWorker).length){
    h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:14px">`;
    Object.entries(byWorker).forEach(([name,d])=>{
      const hrs=Math.floor(d.totalMin/60);
      const mins=d.totalMin%60;
      h+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px">
        <div style="font-size:13px;font-weight:600">${name}</div>
        <div style="font-size:11px;color:var(--text3)">${d.shifts} смен · ${hrs}ч ${mins}мин</div>
        <div style="font-size:12px;font-weight:600;color:var(--accent-text);margin-top:2px">${d.earned.toLocaleString('ru-RU')} ₽</div>
      </div>`;
    });
    h+=`</div>`;
  }
  
  // Таблица смен
  if(filtered.length){
    filtered.forEach(s=>{
      const start=new Date(s.started_at);
      const end=s.ended_at?new Date(s.ended_at):null;
      const dur=s.duration_min||0;
      const hrs=Math.floor(dur/60);
      const mins=dur%60;
      const isOpen=!s.ended_at;
      const dateStr=start.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});
      const startTime=start.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      const endTime=end?end.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'—';
      
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;${isOpen?'background:var(--accent-light);padding:8px;border-radius:var(--rs);margin-bottom:4px':''}">
        <span style="min-width:55px;color:var(--text3)">${dateStr}</span>
        <span style="font-weight:500;min-width:90px">${s.worker_name||'—'}</span>
        <span style="min-width:70px;color:var(--text2)">${s.station||'—'}</span>
        <span style="min-width:50px;text-align:center">${startTime}</span>
        <span style="color:var(--text3)">→</span>
        <span style="min-width:50px;text-align:center">${isOpen?'<span style="color:var(--accent);font-weight:600">сейчас</span>':endTime}</span>
        <span style="min-width:55px;text-align:right;font-weight:500;color:${isOpen?'var(--accent-text)':'var(--text)'}">${isOpen?'···':hrs+'ч '+mins+'м'}</span>
        <span style="min-width:60px;text-align:right;font-weight:500">${s.stages_done||0} эт.</span>
        <span style="min-width:65px;text-align:right;font-weight:600;color:var(--accent-text)">${(parseFloat(s.earned)||0).toLocaleString('ru-RU')} ₽</span>
      </div>`;
    });
  } else {
    h+='<div style="padding:20px;text-align:center;color:var(--text3)">Нет смен за этот период</div>';
  }
  
  $('pay-body').innerHTML=h;
}

function onPayStageChange(){
  const stageKey=$('pe-stage').value;
  const list=$('pe-works-list');
  if(!list) return;
  if(!stageKey){list.innerHTML='';$('pe-amount').value='';return}
  
  const works=payRates.filter(r=>r.stage_key===stageKey);
  if(!works.length){
    list.innerHTML='<div style="font-size:11px;color:var(--text3);padding:4px 0">Нет видов работ для этого этапа. Добавьте в "💰 Расценки".</div>';
    $('pe-amount').value='';
    return;
  }
  
  let h='<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Выберите виды работ:</div>';
  works.forEach(r=>{
    h+=`<label style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:var(--rs);cursor:pointer;font-size:12px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <input type="checkbox" class="pe-work-cb" data-rate="${r.rate||0}" data-id="${r.id}" data-name="${r.work_name}" onchange="calcPayTotal()" checked style="margin:0">
      <span style="flex:1">${r.work_name}</span>
      <span style="color:var(--accent-text);font-weight:500;min-width:50px;text-align:right">${(parseFloat(r.rate)||0).toLocaleString('ru-RU')} ₽</span>
      <span style="font-size:10px;color:var(--text3)">${r.unit||''}</span>
    </label>`;
  });
  list.innerHTML=h;
  calcPayTotal();
}

function calcPayTotal(){
  let total=0;
  document.querySelectorAll('.pe-work-cb:checked').forEach(cb=>{
    total+=parseFloat(cb.dataset.rate)||0;
  });
  $('pe-amount').value=total||'';
}

function autoCalcEntry(){
  onPayStageChange();
}

async function addPayEntry(){
  const worker_id=parseInt($('pe-worker').value);
  if(!worker_id){showToast('Выберите сотрудника');return}
  const amount=parseFloat($('pe-amount').value)||0;
  if(!amount){showToast('Укажите сумму');return}
  const stageKey=$('pe-stage').value||null;
  const orderNum=$('pe-order').value||null;
  
  // Собираем выбранные виды работ
  const selectedWorks=[];
  document.querySelectorAll('.pe-work-cb:checked').forEach(cb=>{
    selectedWorks.push(cb.dataset.name);
  });
  const note=selectedWorks.length?selectedWorks.join(', '):'';
  
  try{
    await sb.from('payroll_entries').insert({
      worker_id,
      order_num:orderNum,
      stage_key:stageKey,
      amount,
      note,
      work_date:new Date().toISOString().split('T')[0]
    });
    await loadPayroll();renderPayEntries();showToast('Начислено '+amount.toLocaleString('ru-RU')+' ₽');
    $('pe-amount').value='';
    $('pe-works-list').innerHTML='';
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function deletePayEntry(id){
  if(!confirm('Удалить начисление?')) return;
  try{await sb.from('payroll_entries').delete().eq('id',id);await loadPayroll();renderPayEntries()}catch(e){}
}
