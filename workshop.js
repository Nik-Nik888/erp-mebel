// ══════════════════════════════════════════════════════
// ЦЕХ — интерфейс для планшетов на участках
// ══════════════════════════════════════════════════════
let wsWorker=null; // текущий рабочий на смене

function getWsVisibleStages(){
  return getSetting('ws_visible_stages',null);
}

function getWsStages(){
  const visible=getWsVisibleStages();
  if(!visible) return PROD_STAGES;
  return PROD_STAGES.filter(s=>visible.includes(s.key));
}

function openWsSettings(){
  let ov=$('m-ws-settings');
  if(!ov){
    ov=document.createElement('div');ov.className='overlay';ov.id='m-ws-settings';
    ov.innerHTML=`<div class="modal" style="max-width:400px"><div class="modal-hd"><div class="modal-title">⚙ Настройки цеха</div><button class="modal-close" onclick="$('m-ws-settings').classList.remove('open')">×</button></div><div class="modal-body" id="m-ws-settings-body"></div></div>`;
    document.body.appendChild(ov);
  }
  const visible=getWsVisibleStages();
  let h='<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Выберите этапы которые будут видны в Цехе.</div>';
  PROD_STAGES.forEach(st=>{
    const checked=!visible||visible.includes(st.key);
    h+=`<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${checked?'checked':''} onchange="toggleWsStage('${st.key}',this.checked)" style="margin:0;width:16px;height:16px">
      <span style="font-size:15px">${st.icon}</span>
      <span style="flex:1">${st.name}</span>
    </label>`;
  });
  h+=`<div style="display:flex;gap:8px;margin-top:12px">
    <button class="btn btn-ghost" onclick="setWsAllStages()" style="flex:1;font-size:11px;justify-content:center">Все</button>
    <button class="btn btn-ghost" onclick="setWsProductionOnly()" style="flex:1;font-size:11px;justify-content:center">Только производство</button>
  </div>`;
  $('m-ws-settings-body').innerHTML=h;
  ov.classList.add('open');
}

function toggleWsStage(key,show){
  let visible=getWsVisibleStages()||PROD_STAGES.map(s=>s.key);
  if(show){if(!visible.includes(key))visible.push(key)}
  else{visible=visible.filter(k=>k!==key)}
  saveSetting('ws_visible_stages',visible);
  updateWsFilter();openWsSettings();
}

function setWsAllStages(){
  saveSetting('ws_visible_stages',PROD_STAGES.map(s=>s.key));
  updateWsFilter();openWsSettings();
}

function setWsProductionOnly(){
  const prodKeys=['material','raskroy','kromka','prisadka','sborka','upakovka','otgruzka'];
  saveSetting('ws_visible_stages',PROD_STAGES.filter(s=>prodKeys.includes(s.key)).map(s=>s.key));
  updateWsFilter();openWsSettings();
}

function updateWsFilter(){
  const sel=$('ws-filter');
  if(!sel) return;
  const cur=sel.value;
  const stages=getWsStages();
  sel.innerHTML='<option value="">Все участки</option>';
  stages.forEach(st=>{
    const o=document.createElement('option');o.value=st.key;o.textContent=st.icon+' '+st.name;
    if(st.key===cur) o.selected=true;
    sel.appendChild(o);
  });
}

function renderWorkshop(){
  // Если сотрудники не загружены — ждём
  if(!payWorkers.length&&!payrollLoaded){
    loadPayroll().then(()=>{payrollLoaded=true;renderWorkshop()});
    $('ws-body').innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Загрузка...</div>';
    return;
  }
  
  if(!wsWorker){
    renderWsLogin();
    return;
  }
  $('ws-sub').textContent='Смена: '+wsWorker.name;
  $('ws-logout-btn').style.display='inline-flex';
  $('ws-login').innerHTML='';
  
  const filter=$('ws-filter')?.value||'';
  const today=new Date();today.setHours(0,0,0,0);
  const INACTIVE=['Закрыт','Отгружен','Отказались','Отправлено КП'];
  
  const sel=$('ws-filter');
  if(sel&&sel.options.length<=1){
    getWsStages().forEach(st=>{
      const o=document.createElement('option');o.value=st.key;o.textContent=st.icon+' '+st.name;
      sel.appendChild(o);
    });
  }
  
  let active=orders.filter(o=>{
    const s=(o.status||'').trim();
    return !INACTIVE.includes(s)&&s!=='';
  });
  
  let cards=[];
  active.forEach(o=>{
    const stages=getOrderStages(o);
    const activeStages=PROD_STAGES.filter(s=>!stages[s.key]||!stages[s.key].skip);
    let current=null;
    for(const st of activeStages){
      if(!stages[st.key]||!stages[st.key].done){current=st;break}
    }
    if(!current) return;
    
    let prevDone=null;
    for(let i=PROD_STAGES.indexOf(current)-1;i>=0;i--){
      const ps=PROD_STAGES[i];
      if(stages[ps.key]&&stages[ps.key].skip) continue;
      if(stages[ps.key]&&stages[ps.key].done){prevDone=ps;break}
    }
    
    let nextStage=null;
    let foundCurrent=false;
    for(const st of activeStages){
      if(st.key===current.key){foundCurrent=true;continue}
      if(foundCurrent){nextStage=st;break}
    }
    
    const dl=pDate(o.deadline);
    const isOverdue=dl&&dl<today;
    const {done,total}=getStageDoneCount(o);
    
    cards.push({order:o,current,prevDone,nextStage,isOverdue,done,total,stages});
  });
  
  // Фильтр по видимым этапам цеха
  const wsStageKeys=getWsStages().map(s=>s.key);
  cards=cards.filter(c=>wsStageKeys.includes(c.current.key));
  
  if(filter) cards=cards.filter(c=>c.current.key===filter);
  
  cards.sort((a,b)=>{
    if(a.isOverdue&&!b.isOverdue) return -1;
    if(!a.isOverdue&&b.isOverdue) return 1;
    const da=pDate(a.order.deadline)||new Date('2099-01-01');
    const db=pDate(b.order.deadline)||new Date('2099-01-01');
    return da-db;
  });
  
  if(!cards.length){
    $('ws-body').innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);font-size:15px">Нет активных заказов на этом участке</div>';
    return;
  }
  
  let h='';
  cards.forEach(c=>{
    const o=c.order;
    const dl=pDate(o.deadline);
    const dlStr=dl?dl.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}):'—';
    const pct=c.total?Math.round(c.done/c.total*100):0;
    
    // Виды работ для текущего этапа — только назначенные менеджером
    const allStageWorks=payRates.filter(r=>r.stage_key===c.current.key);
    const orderWorks=getOrderWorks(o);
    const assignedData=orderWorks[c.current.key]||[];
    // Поддержка обоих форматов
    const getAssigned=(rId)=>{
      if(!assignedData.length) return null;
      if(typeof assignedData[0]==='object') return assignedData.find(w=>w.id===rId);
      return assignedData.includes(rId)?{id:rId,qty:1}:null;
    };
    const stageWorks=assignedData.length?allStageWorks.filter(r=>getAssigned(r.id)):[];
    
    h+=`<div style="background:var(--surface);border:1px solid ${c.isOverdue?'var(--red)':'var(--border)'};border-radius:var(--r);padding:16px;margin-bottom:12px;${c.isOverdue?'border-left:4px solid var(--red);background:var(--red-light)':'border-left:4px solid '+c.current.color}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:16px;font-weight:600">${o.order_num} — ${o.client||'—'}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">${o.description||''} ${c.isOverdue?'<span style="color:var(--red);font-weight:600">⚠ ПРОСРОЧЕН</span>':''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text3)">Дедлайн</div>
          <div style="font-size:15px;font-weight:600;color:${c.isOverdue?'var(--red)':'var(--text)'}">${dlStr}</div>
        </div>
      </div>
      
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <div style="flex:1;background:var(--surface2);border-radius:4px;height:8px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px"></div>
        </div>
        <span style="font-size:12px;color:var(--text3);font-weight:500">${c.done}/${c.total}</span>
      </div>
      
      <!-- Текущий этап -->
      <div style="background:${c.current.color}15;border:2px solid ${c.current.color};border-radius:var(--r);padding:14px;margin-bottom:10px">
        <div style="text-align:center;margin-bottom:10px">
          <span style="font-size:24px">${c.current.icon}</span>
          <div style="font-size:16px;font-weight:600;color:${c.current.color}">${c.current.name}</div>
        </div>`;
    
    // Виды работ — только назначенные, без галочек по умолчанию
    if(stageWorks.length){
      h+=`<div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--amber);margin-bottom:6px;font-weight:500">Отметьте работу которую выполняете:</div>`;
      stageWorks.forEach(r=>{
        const wd=getAssigned(r.id);
        const qty=wd?wd.qty||1:1;
        const lineTotal=(parseFloat(r.rate)||0)*qty;
        h+=`<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);margin-bottom:4px;cursor:pointer;font-size:13px">
          <input type="checkbox" class="ws-work-cb" data-order="${o.order_num}" data-rate-id="${r.id}" data-rate="${lineTotal}" data-name="${r.work_name}" style="margin:0;width:18px;height:18px">
          <span style="flex:1">${r.work_name}</span>
          <span style="font-size:11px;color:var(--text3)">${qty} ${r.unit||'шт'} × ${(parseFloat(r.rate)||0)} ₽</span>
          <span style="font-weight:600;color:var(--accent-text)">${lineTotal.toLocaleString('ru-RU')} ₽</span>
        </label>`;
      });
      h+=`</div>`;
    } else if(!assignedData.length&&allStageWorks.length){
      h+=`<div style="font-size:11px;color:var(--text3);padding:8px;text-align:center">Менеджер не назначил виды работ для этого заказа</div>`;
    }
    
    h+=`<button onclick="wsMarkDone('${o.order_num}','${c.current.key}')" style="width:100%;padding:14px;font-size:16px;font-weight:600;background:${c.current.color};color:#fff;border:none;border-radius:var(--r);cursor:pointer;font-family:'Geologica',sans-serif">✓ Завершить${stageWorks.length?' и начислить':''}</button>
      </div>
      
      <div style="display:flex;gap:3px;flex-wrap:wrap">`;
    
    const activeStages2=PROD_STAGES.filter(s=>!c.stages[s.key]||!c.stages[s.key].skip);
    activeStages2.forEach(st=>{
      const d=c.stages[st.key];
      const isDone2=d&&d.done;
      const isCur2=st.key===c.current.key;
      const bg2=isDone2?st.color:isCur2?st.color+'33':'var(--surface2)';
      const txtCol2=isDone2?'#fff':isCur2?st.color:'var(--text3)';
      h+=`<div style="padding:3px 6px;border-radius:4px;font-size:10px;background:${bg2};color:${txtCol2};font-weight:${isCur2?'600':'400'}" title="${st.name}">${st.icon}</div>`;
    });
    
    h+=`</div>
      ${c.prevDone?`<div style="font-size:10px;color:var(--text3);margin-top:8px">Предыдущий: ${c.prevDone.icon} ${c.prevDone.name} ✓</div>`:''}
      ${c.nextStage?`<div style="font-size:10px;color:var(--text3)">Следующий: ${c.nextStage.icon} ${c.nextStage.name}</div>`:''}
    </div>`;
  });
  
  $('ws-body').innerHTML=h;
}

function renderWsLogin(){
  $('ws-sub').textContent='Вход на смену';
  $('ws-logout-btn').style.display='none';
  $('ws-body').innerHTML='';
  
  const activeWorkers=payWorkers.filter(w=>w.is_active);
  
  let h=`<div style="max-width:400px;margin:40px auto;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">👷</div>
    <div style="font-size:18px;font-weight:600;margin-bottom:6px">Начало смены</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:24px">Выберите себя и введите PIN-код</div>
    
    <select class="fsel" id="ws-worker-select" style="width:100%;font-size:15px;padding:12px;margin-bottom:12px;text-align:center" onchange="$('ws-pin').focus()">
      <option value="">— Выберите сотрудника —</option>
      ${activeWorkers.map(w=>`<option value="${w.id}">${w.name} (${w.role||'цех'})</option>`).join('')}
    </select>
    
    <input type="password" id="ws-pin" placeholder="PIN-код" maxlength="6" 
      onkeydown="if(event.key==='Enter')wsLogin()"
      style="width:100%;font-size:24px;text-align:center;letter-spacing:12px;padding:14px;border:2px solid var(--border);border-radius:var(--r);outline:none;font-family:'JetBrains Mono',monospace;box-sizing:border-box;background:var(--surface);color:var(--text)">
    
    <button onclick="wsLogin()" style="width:100%;margin-top:12px;padding:14px;font-size:16px;font-weight:600;background:var(--accent);color:#fff;border:none;border-radius:var(--r);cursor:pointer;font-family:'Geologica',sans-serif">Войти в смену →</button>
    
    <div id="ws-login-error" style="margin-top:10px;color:var(--red);font-size:13px;display:none"></div>
  </div>`;
  
  $('ws-login').innerHTML=h;
}

let wsCurrentShiftId=null;

function wsLogin(){
  const wId=parseInt($('ws-worker-select')?.value);
  const pin=$('ws-pin')?.value||'';
  
  if(!wId){
    $('ws-login-error').textContent='Выберите сотрудника';
    $('ws-login-error').style.display='block';
    return;
  }
  
  const worker=payWorkers.find(w=>w.id===wId);
  if(!worker){showToast('Сотрудник не найден');return}
  
  if(worker.pin&&worker.pin!==pin){
    $('ws-login-error').textContent='Неверный PIN-код';
    $('ws-login-error').style.display='block';
    $('ws-pin').value='';
    $('ws-pin').focus();
    if(navigator.vibrate) navigator.vibrate(200);
    return;
  }
  
  wsWorker=worker;
  
  // Определяем участок из URL или фильтра
  const urlParams=new URLSearchParams(window.location.search);
  const station=urlParams.get('station')||$('ws-filter')?.value||'';
  const stationName=station?PROD_STAGES.find(s=>s.key===station)?.name||station:'Все';
  
  // Создаём запись смены
  sb.from('shifts').insert({
    worker_id:worker.id,
    worker_name:worker.name,
    station:stationName,
    started_at:new Date().toISOString()
  }).select().then(({data})=>{
    if(data&&data[0]) wsCurrentShiftId=data[0].id;
  });
  
  showToast('👷 Смена начата — '+worker.name);
  auditLog('login','worker',String(worker.id),{name:worker.name,station:stationName});
  renderWorkshop();
}

async function wsLogout(){
  if(!confirm('Завершить смену?')) return;
  
  // Закрываем запись смены
  if(wsCurrentShiftId){
    const now=new Date();
    const shift=payShifts.find(s=>s.id===wsCurrentShiftId);
    const startedAt=shift?new Date(shift.started_at):now;
    const durationMin=Math.round((now-startedAt)/60000);
    
    // Считаем заработок за смену
    const todayStr=now.toISOString().split('T')[0];
    const shiftEarned=payEntries.filter(e=>
      e.worker_id===wsWorker.id&&e.work_date===todayStr&&e.note!=='бонус'&&e.note!=='штраф'
    ).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    
    // Считаем этапов завершено
    const shiftStages=payEntries.filter(e=>
      e.worker_id===wsWorker.id&&e.work_date===todayStr&&e.stage_key
    ).length;
    
    try{
      await sb.from('shifts').update({
        ended_at:now.toISOString(),
        duration_min:durationMin,
        stages_done:shiftStages,
        earned:shiftEarned
      }).eq('id',wsCurrentShiftId);
    }catch(e){console.log('Shift close error:',e)}
    
    const hrs=Math.floor(durationMin/60);
    const mins=durationMin%60;
    showToast('Смена завершена — '+wsWorker.name+' ('+hrs+'ч '+mins+'мин, '+shiftEarned.toLocaleString('ru-RU')+' ₽)');
  } else {
    showToast('Смена завершена — '+wsWorker.name);
  }
  
  wsWorker=null;
  wsCurrentShiftId=null;
  renderWorkshop();
}

async function wsMarkDone(orderNum,stageKey){
  const o=findO(orderNum);if(!o) return;
  let stages=getOrderStages(o);
  
  stages[stageKey]={done:true,date:new Date().toISOString()};
  
  for(const st of PROD_STAGES){
    if(st.key===stageKey) break;
    if(stages[st.key]&&stages[st.key].skip) continue;
    if(!stages[st.key]||!stages[st.key].done){
      stages[st.key]={done:true,date:stages[st.key]?.date||new Date().toISOString()};
    }
  }
  
  o.stages=stages;
  try{
    await sb.from('orders').update({stages}).eq('id',o.id);
    showToast(PROD_STAGES.find(s=>s.key===stageKey)?.icon+' Этап завершён');
    auditLog('stage_done','order',orderNum,{stage:stageKey,worker:wsWorker?.name});
    
    // АВТО-НАЧИСЛЕНИЕ ЗАРПЛАТЫ
    if(wsWorker){
      const checkboxes=document.querySelectorAll('.ws-work-cb[data-order="'+orderNum+'"]');
      let totalPay=0;
      const workNames=[];
      checkboxes.forEach(cb=>{
        if(cb.checked){
          totalPay+=parseFloat(cb.dataset.rate)||0;
          workNames.push(cb.dataset.name);
        }
      });
      
      if(totalPay>0){
        try{
          await sb.from('payroll_entries').insert({
            worker_id:wsWorker.id,
            order_num:orderNum,
            stage_key:stageKey,
            amount:totalPay,
            note:workNames.join(', '),
            work_date:new Date().toISOString().split('T')[0]
          });
          showToast('💰 Начислено '+totalPay.toLocaleString('ru-RU')+' ₽ → '+wsWorker.name);
        }catch(e){console.log('Payroll auto error:',e)}
      }
    }
    
    // Автосмена статуса канбана
    const stage=PROD_STAGES.find(s=>s.key===stageKey);
    if(stage&&stage.kanban){
      // статус уже был установлен при входе в колонку
    }
    
    renderWorkshop();
  }catch(e){showToast('Ошибка: '+e.message)}
}

