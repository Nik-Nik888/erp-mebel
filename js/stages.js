async function autoCreateExpenses(orderNum){
  const tpls=getExpTemplates();
  if(!tpls.length) return;
  const today=new Date().toISOString().split('T')[0];
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

// ══════════════════════════════════════════════════════
// ЭТАПЫ ПРОИЗВОДСТВА
// ══════════════════════════════════════════════════════
const DEFAULT_PROD_STAGES=[
  {key:'kp',name:'КП / Заявка',icon:'📋',color:'#185FA5',kanban:'Отправлено КП'},
  {key:'zamer',name:'Замер',icon:'📏',color:'#6366f1',kanban:''},
  {key:'project',name:'Проектирование',icon:'📐',color:'#8b5cf6',kanban:''},
  {key:'soglasovanie',name:'Согласование',icon:'✅',color:'#534AB7',kanban:''},
  {key:'material',name:'Заказ материалов',icon:'📦',color:'#854F0B',kanban:'Материал заказан'},
  {key:'raskroy',name:'Раскрой',icon:'🪚',color:'#b45309',kanban:'В работе'},
  {key:'kromka',name:'Кромка',icon:'🔲',color:'#a16207',kanban:''},
  {key:'prisadka',name:'Присадка',icon:'🔩',color:'#78716c',kanban:''},
  {key:'sborka',name:'Сборка',icon:'🔧',color:'#2a5c3f',kanban:''},
  {key:'upakovka',name:'Упаковка',icon:'📦',color:'#16a34a',kanban:'Готов к выдаче'},
  {key:'otgruzka',name:'Отгрузка',icon:'🚛',color:'#0d9488',kanban:'Отгружен'},
  {key:'dostavka',name:'Доставка',icon:'🚚',color:'#0284c7',kanban:''},
  {key:'montazh',name:'Монтаж',icon:'🏠',color:'#3b82f6',kanban:''}
];

// Динамические этапы — из Supabase settings или default
let PROD_STAGES=[...DEFAULT_PROD_STAGES];

function getProdStages(){
  return getSetting('prod_stages',null);
}
function loadProdStages(){
  const saved=getProdStages();
  if(saved&&Array.isArray(saved)&&saved.length>0) PROD_STAGES=saved;
}

// Авто-отметка этапов по статусу канбана
async function autoMarkStages(o,newStatus){
  let stages=getOrderStages(o);
  let changed=false;
  
  // Находим все этапы привязанные к этому статусу канбана и ранее
  let matched=false;
  for(const st of PROD_STAGES){
    if(stages[st.key]&&stages[st.key].skip) continue;
    if(st.kanban===newStatus){matched=true}
    if(matched) break;
    // Отмечаем все этапы до совпавшего
    if(!stages[st.key]||!stages[st.key].done){
      // Проверяем — следующий этап совпадает?
    }
  }
  
  // Более точная логика: отметить все этапы до привязанного к этому статусу
  for(let i=0;i<PROD_STAGES.length;i++){
    const st=PROD_STAGES[i];
    if(stages[st.key]&&stages[st.key].skip) continue;
    if(st.kanban===newStatus){
      // Отмечаем этот и все предыдущие активные
      for(let j=0;j<=i;j++){
        const prev=PROD_STAGES[j];
        if(stages[prev.key]&&stages[prev.key].skip) continue;
        if(!stages[prev.key]||!stages[prev.key].done){
          stages[prev.key]={done:true,date:new Date().toISOString()};
          changed=true;
        }
      }
      break;
    }
  }
  
  if(changed){
    o.stages=stages;
    try{await sb.from('orders').update({stages}).eq('id',o.id)}catch(e){}
  }
}

// ── Настройки этапов ──
function openStagesSettings(){
  let overlay=$('m-stages-settings');
  if(!overlay){
    overlay=document.createElement('div');overlay.className='overlay';overlay.id='m-stages-settings';
    overlay.innerHTML=`<div class="modal" style="max-width:500px"><div class="modal-hd"><div class="modal-title">Настройка этапов производства</div><button class="modal-close" onclick="$('m-stages-settings').classList.remove('open')">×</button></div><div class="modal-body" id="m-stages-settings-body" style="max-height:70vh;overflow-y:auto"></div><div class="modal-ft"><div style="display:flex;gap:8px;width:100%"><input class="finput" id="new-stage-name" placeholder="Новый этап..."><input class="finput" id="new-stage-icon" placeholder="🔧" style="width:50px"><button class="btn btn-primary" onclick="addProdStage()">+</button></div></div></div>`;
    document.body.appendChild(overlay);
  }
  renderStagesSettings();
  overlay.classList.add('open');
}

function renderStagesSettings(){
  const kanbanCols=getKanbanColumns();
  let h='<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Порядок, названия и привязка к колонкам канбана. Перетащите для изменения порядка.</div>';
  
  PROD_STAGES.forEach((st,i)=>{
    h+=`<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)">
      <button onclick="moveProdStage(${i},-1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 5px;cursor:pointer;font-size:10px;color:var(--text3)">↑</button>
      <button onclick="moveProdStage(${i},1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 5px;cursor:pointer;font-size:10px;color:var(--text3)">↓</button>
      <span style="font-size:14px;flex-shrink:0">${st.icon}</span>
      <input value="${st.name}" onchange="updateProdStage(${i},'name',this.value)" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:12px;font-family:'Geologica',sans-serif;background:var(--surface);color:var(--text)">
      <select onchange="updateProdStage(${i},'kanban',this.value)" style="font-size:11px;border:1px solid var(--border);border-radius:4px;padding:3px;font-family:'Geologica',sans-serif;background:var(--surface);color:var(--text2);max-width:110px">
        <option value="">— нет —</option>
        ${kanbanCols.map(c=>`<option value="${c}"${st.kanban===c?' selected':''}>${c}</option>`).join('')}
      </select>
      <input type="color" value="${st.color}" onchange="updateProdStage(${i},'color',this.value)" style="width:24px;height:22px;border:none;padding:0;cursor:pointer;background:none">
      <button onclick="removeProdStage(${i})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button>
    </div>`;
  });
  $('m-stages-settings-body').innerHTML=h;
}

function updateProdStage(i,field,val){
  PROD_STAGES[i][field]=val;
  saveSetting('prod_stages',PROD_STAGES);
  renderStagesSettings();
}

function moveProdStage(i,dir){
  const ni=i+dir;
  if(ni<0||ni>=PROD_STAGES.length) return;
  [PROD_STAGES[i],PROD_STAGES[ni]]=[PROD_STAGES[ni],PROD_STAGES[i]];
  saveSetting('prod_stages',PROD_STAGES);
  renderStagesSettings();
}

function removeProdStage(i){
  if(!confirm('Удалить этап "'+PROD_STAGES[i].name+'"?')) return;
  PROD_STAGES.splice(i,1);
  saveSetting('prod_stages',PROD_STAGES);
  renderStagesSettings();
}

function addProdStage(){
  const name=$('new-stage-name').value.trim();
  const icon=$('new-stage-icon').value.trim()||'⚙';
  if(!name){showToast('Укажите название');return}
  const key=name.toLowerCase().replace(/[^a-zа-яё0-9]/g,'_').slice(0,20)+'_'+Date.now().toString(36).slice(-4);
  PROD_STAGES.push({key,name,icon,color:'#6b6a64',kanban:''});
  saveSetting('prod_stages',PROD_STAGES);
  $('new-stage-name').value='';$('new-stage-icon').value='';
  renderStagesSettings();
  showToast('Этап "'+name+'" добавлен');
}

let stagesCollapsed=false;
function toggleStagesSection(){
  stagesCollapsed=!stagesCollapsed;
  const body=$('f-stages-body');
  const arrow=$('f-stages-arrow');
  if(body) body.style.display=stagesCollapsed?'none':'';
  if(arrow) arrow.style.transform=stagesCollapsed?'rotate(0deg)':'rotate(90deg)';
}

function getOrderStages(o){
  if(!o||!o.stages) return {};
  if(typeof o.stages==='string') try{return JSON.parse(o.stages)}catch(e){return {}}
  return o.stages||{};
}

function renderStagesForm(stages){
  const body=$('f-stages-body');
  if(!body) return;
  
  // Считаем только активные (не пропущенные) этапы
  const activeStages=PROD_STAGES.filter(st=>!stages[st.key]||!stages[st.key].skip);
  const done=activeStages.filter(st=>stages[st.key]&&stages[st.key].done).length;
  const total=activeStages.length;
  const prog=$('f-stages-progress');
  if(prog) prog.textContent=done+'/'+total;
  
  // Найти текущий этап (первый активный не завершённый)
  let currentKey='';
  for(const st of PROD_STAGES){
    if(stages[st.key]&&stages[st.key].skip) continue;
    if(!stages[st.key]||!stages[st.key].done){currentKey=st.key;break}
  }
  
  let h='<div style="display:flex;flex-direction:column;gap:2px">';
  PROD_STAGES.forEach((st,i)=>{
    const data=stages[st.key]||{};
    const isSkip=!!data.skip;
    const isDone=!!data.done&&!isSkip;
    const doneDate=data.date||'';
    const isCurrent=st.key===currentKey;
    
    if(isSkip){
      // Пропущенный этап — серый, маленький
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:3px 10px;border-radius:var(--rs);border:1px solid var(--border);background:var(--surface2);opacity:0.4">
        <span style="font-size:11px;flex-shrink:0">${st.icon}</span>
        <span style="font-size:11px;flex:1;text-decoration:line-through;color:var(--text3)">${st.name}</span>
        <button type="button" onclick="setStageSkip('${st.key}',false)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:9px;cursor:pointer;font-family:'Geologica',sans-serif;color:var(--accent)">вернуть</button>
      </div>`;
    } else {
      const bg=isDone?`${st.color}12`:isCurrent?'var(--accent-light)':'var(--surface2)';
      const border=isCurrent?'border:1px solid var(--accent)':'border:1px solid var(--border)';
      const opacity=!isDone&&!isCurrent?'opacity:0.6':'';
      
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:var(--rs);${border};background:${bg};${opacity}">
        <input type="checkbox" ${isDone?'checked':''} onchange="toggleStage('${st.key}',this.checked)" style="margin:0;flex-shrink:0;width:16px;height:16px;cursor:pointer">
        <span style="font-size:13px;flex-shrink:0">${st.icon}</span>
        <span style="font-size:12px;flex:1;font-weight:${isCurrent?'600':'400'};color:${isDone?st.color:'var(--text)'}">${st.name}</span>
        ${isDone&&doneDate?`<span style="font-size:10px;color:var(--text3)">${new Date(doneDate).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</span>`:''}
        ${isCurrent?'<span style="font-size:9px;color:var(--accent-text);font-weight:500">← сейчас</span>':''}
        ${!isDone?`<button type="button" onclick="setStageSkip('${st.key}',true)" title="Пропустить этап" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;padding:2px">✕</button>`:''}
      </div>`;
    }
  });
  
  // Прогресс-бар
  const pct=total?Math.round(done/total*100):0;
  h+=`<div style="margin-top:6px;background:var(--surface2);border-radius:4px;height:6px;overflow:hidden">
    <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width 0.3s"></div>
  </div>
  <div style="font-size:10px;color:var(--text3);text-align:right;margin-top:2px">${pct}% выполнено (${done} из ${total})</div>`;
  h+='</div>';
  body.innerHTML=h;
}

function setStageSkip(key,skip){
  const stagesJson=$('f-stages-data');
  let stages={};
  try{stages=JSON.parse(stagesJson.value||'{}')}catch(e){}
  
  if(skip){
    stages[key]={skip:true};
  } else {
    delete stages[key];
  }
  
  stagesJson.value=JSON.stringify(stages);
  renderStagesForm(stages);
  if(editId) saveStagesNow(stages);
}

function toggleStage(key,checked){
  const stagesJson=$('f-stages-data');
  let stages={};
  try{stages=JSON.parse(stagesJson.value||'{}')}catch(e){}
  
  if(checked){
    stages[key]={done:true,date:new Date().toISOString()};
    // Автоматически отмечаем все предыдущие активные этапы
    for(const st of PROD_STAGES){
      if(st.key===key) break;
      if(stages[st.key]&&stages[st.key].skip) continue; // пропущенные не трогаем
      if(!stages[st.key]||!stages[st.key].done){
        stages[st.key]={done:true,date:stages[st.key]?.date||new Date().toISOString()};
      }
    }
  } else {
    delete stages[key];
    // Снимаем все последующие активные этапы
    let found=false;
    for(const st of PROD_STAGES){
      if(st.key===key) found=true;
      if(found&&stages[st.key]&&!stages[st.key].skip) delete stages[st.key];
    }
  }
  
  stagesJson.value=JSON.stringify(stages);
  renderStagesForm(stages);
  if(editId) saveStagesNow(stages);
}

async function saveStagesNow(stages){
  if(!editId) return;
  try{
    await sb.from('orders').update({stages}).eq('id',editId);
  }catch(e){console.log('Stages save error:',e)}
}

// ── Виды работ в карточке заказа ──
let worksCollapsed=true;

function toggleWorksSection(){
  worksCollapsed=!worksCollapsed;
  const body=$('f-works-body');
  const arrow=$('f-works-arrow');
  if(body) body.style.display=worksCollapsed?'none':'';
  if(arrow) arrow.style.transform=worksCollapsed?'rotate(0deg)':'rotate(90deg)';
}

function getOrderWorks(o){
  if(!o||!o.works) return {};
  if(typeof o.works==='string') try{return JSON.parse(o.works)}catch(e){return {}}
  return o.works||{};
}

function renderWorksForm(works,stages){
  const body=$('f-works-body');
  if(!body) return;
  
  // Активные этапы (не пропущенные)
  const activeStages=PROD_STAGES.filter(st=>!stages[st.key]||!stages[st.key].skip);
  
  // Считаем общее кол-во выбранных работ
  let totalSelected=0;
  Object.values(works).forEach(arr=>{if(Array.isArray(arr)) totalSelected+=arr.length});
  const badge=$('f-works-count');
  if(badge) badge.textContent=totalSelected;
  
  let h='<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Отметьте виды работ и укажите количество. Только отмеченные будут доступны рабочим на планшете.</div>';
  
  let hasAnyWorks=false;
  
  activeStages.forEach(st=>{
    const stageWorks=payRates.filter(r=>r.stage_key===st.key);
    if(!stageWorks.length) return;
    hasAnyWorks=true;
    
    const stageData=works[st.key]||[];
    // Поддержка обоих форматов: [{id,qty}] и [id,id]
    const getWorkData=(rId)=>{
      if(!stageData.length) return null;
      if(typeof stageData[0]==='object') return stageData.find(w=>w.id===rId)||null;
      return stageData.includes(rId)?{id:rId,qty:1}:null;
    };
    const selectedCount=stageWorks.filter(r=>getWorkData(r.id)).length;
    const stageTotal=stageWorks.reduce((s,r)=>{const d=getWorkData(r.id);return d?s+(parseFloat(r.rate)||0)*(d.qty||1):s},0);
    
    h+=`<div style="margin-bottom:8px">
