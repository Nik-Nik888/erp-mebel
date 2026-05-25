// ══════════════════════════════════════════════════════
// КАНБАН-ДОСКА
// ══════════════════════════════════════════════════════
let kanbanZoomLevel=0;
const KANBAN_SIZES=[
  {col:'200px',colMax:'240px',mobCol:'52vw',font:'11px',pad:'8px'},
  {col:'300px',colMax:'340px',mobCol:'85vw',font:'13px',pad:'12px'}
];

function kanbanZoomToggle(){
  kanbanZoomLevel=kanbanZoomLevel?0:1;
  // Переключаем + / - в лупе
  const vLine=$('kb-zoom-v');
  if(vLine) vLine.style.display=kanbanZoomLevel?'none':'';
  renderKanban();
}

// ── Настройки — Supabase + localStorage cache ──
let _appSettings={};

async function loadAppSettings(){
  try{_appSettings=JSON.parse(localStorage.getItem('k2_app_settings')||'{}')}catch(e){_appSettings={}}
  try{
    const {data,error}=await sb.from('app_settings').select('*');
    if(error){console.log('Settings load error:',error.message);return}
    if(data&&data.length){
      data.forEach(r=>{
        try{_appSettings[r.key]=typeof r.value==='string'?JSON.parse(r.value):r.value}
        catch(e){_appSettings[r.key]=r.value}
      });
      localStorage.setItem('k2_app_settings',JSON.stringify(_appSettings));
      console.log('Settings synced:',Object.keys(_appSettings).join(', '));
    }
  }catch(e){console.log('Settings load error:',e)}
}

function getSetting(key,defaultVal){
  return _appSettings[key]!==undefined?_appSettings[key]:defaultVal;
}

async function saveSetting(key,value){
  _appSettings[key]=value;
  localStorage.setItem('k2_app_settings',JSON.stringify(_appSettings));
  try{
    const {error}=await sb.from('app_settings').upsert(
      {key, value:JSON.stringify(value), updated_at:new Date().toISOString()},
      {onConflict:'key'}
    );
    if(error) console.log('Settings save error:',error.message);
  }catch(e){console.log('Settings save error:',e)}
}

// ── Поля отображения на карточке ──
function getKanbanFields(){
  return getSetting('kanban_fields',{description:true,deadline:true,sum:true,payment:true,prepay:false,dopay:false,manager:false,source:true,phone:false,address:false,date:false,expenses:false,comment:false,chat:true,label_color:true});
}
function saveKanbanFields(f){saveSetting('kanban_fields',f)}

// ── Цвета источников ──
function getSourceColors(){
  return getSetting('source_colors',{'Авито':'#3b82f6','Instagram':'#e1306c','ВКонтакте':'#4a76a8','Телеграм':'#0088cc','Обзвон':'#8b5cf6','Рекомендация':'#16a34a','Повторный':'#854F0B','Другое':'#6b6a64'});
}
function saveSourceColors(c){saveSetting('source_colors',c)}

// ── Настройки колонок канбана ──
function getKanbanColumns(){
  return getSetting('kanban_columns',['Отправлено КП','Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт']);
}
function saveKanbanColumns(cols){saveSetting('kanban_columns',cols)}

// ── Проверка оплаты при перемещении в колонку ──
function getPaymentCheckCols(){
  return getSetting('payment_check',{'Закрыт':true});
}

// ── Pending (draft) state for settings modal ──
let _pendingFields=null;
let _pendingCols=null;
let _pendingSrcColors=null;
let _pendingMatRules=null;
let _pendingMatKeywords=null;
let _pendingPayCheck=null;

function _initPending(){
  _pendingFields={...getKanbanFields()};
  _pendingCols=[...getKanbanColumns()];
  _pendingSrcColors={...getSourceColors()};
  _pendingMatRules={...getMatCheckRules()};
  _pendingMatKeywords=[...getMatKeywords()];
  _pendingPayCheck={...getPaymentCheckCols()};
}

function openKanbanSettings(){
  _initPending();
  const allStatuses=['Отправлено КП','Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт','Приостановлен','Рекламация','Отказались'];
  
  let overlay=$('m-kb-settings');
  if(!overlay){
    overlay=document.createElement('div');overlay.className='overlay';overlay.id='m-kb-settings';
    overlay.innerHTML=`<div class="modal" style="max-width:440px"><div class="modal-hd"><div class="modal-title">Настройки канбана</div><button class="modal-close" onclick="$('m-kb-settings').classList.remove('open')">×</button></div><div class="modal-body" id="m-kb-settings-body" style="max-height:70vh;overflow-y:auto"></div><div class="modal-ft" style="flex-direction:column;gap:8px"><div style="display:flex;gap:8px;width:100%"><input class="finput" id="kb-new-col" placeholder="Новый этап..."><button class="btn btn-ghost" onclick="addKanbanColumn()">+ Добавить</button></div><button class="btn btn-primary" id="kb-save-all-btn" onclick="saveAllKanbanSettings()" style="width:100%;justify-content:center;padding:10px;font-size:14px">💾 Сохранить настройки</button></div></div>`;
    document.body.appendChild(overlay);
  }
  
  _renderKbSettingsBody();
  overlay.classList.add('open');
}

function _renderKbSettingsBody(){
  const allStatuses=['Отправлено КП','Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт','Приостановлен','Рекламация','Отказались'];
  const fields=_pendingFields;
  const cols=_pendingCols;
  const srcColors=_pendingSrcColors;
  const matRules=_pendingMatRules;
  const matKeywords=_pendingMatKeywords;

  // Секция 1: Что показывать на карточке
  let h=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px">📋 Поля на карточке</div>`;
  const FIELD_LABELS={description:'Описание',deadline:'Дедлайн',sum:'Сумма заказа',payment:'Полоска оплаты',prepay:'Предоплата',dopay:'Остаток',expenses:'Расходы',manager:'Менеджер',source:'Источник',label_color:'🔴 Цветовая метка',phone:'Телефон',address:'Адрес',date:'Дата создания',comment:'Комментарий',chat:'💬 Чат (если есть)'};
  Object.entries(FIELD_LABELS).forEach(([key,label])=>{
    h+=`<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px">
      <input type="checkbox" ${fields[key]?'checked':''} onchange="_pendingFields['${key}']=this.checked" style="margin:0"> ${label}
    </label>`;
  });
  
  // Секция 2: Цвета источников
  const allSources=Object.keys(srcColors);
  h+=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-top:16px;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">🎨 Источники заказов</div>`;
  allSources.forEach(src=>{
    const c=srcColors[src]||'#6b6a64';
    const DEFAULT_SOURCES=['Авито','Instagram','ВКонтакте','Телеграм','Обзвон','Рекомендация','Повторный','Другое'];
    const isCustom=!DEFAULT_SOURCES.includes(src);
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <input type="color" value="${c}" onchange="_pendingSrcColors['${src}']=this.value" style="width:28px;height:24px;border:none;padding:0;cursor:pointer;background:none">
      <span style="font-size:13px;flex:1">${src}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${c}18;color:${c};font-weight:500">${src}</span>
      ${isCustom?`<button onclick="delete _pendingSrcColors['${src}'];_renderKbSettingsBody()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button>`:'<span style="width:20px"></span>'}
    </div>`;
  });
  h+=`<div style="display:flex;gap:6px;margin-top:8px;align-items:center">
    <input type="color" id="new-src-color" value="#8b5cf6" style="width:28px;height:24px;border:none;padding:0;cursor:pointer;background:none">
    <input class="finput" id="new-src-name" placeholder="Новый источник..." style="flex:1">
    <button class="btn btn-primary" onclick="addSource()" style="padding:4px 12px">+</button>
  </div>`;
  
  // Секция 3: Колонки
  h+=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-top:16px;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">🗂 Колонки (этапы)</div>`;
  h+=`<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Порядок и видимость колонок</div>`;
  cols.forEach((col,i)=>{
    h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" checked onchange="toggleKanbanCol('${col}',this.checked)" style="margin:0">
      <span style="font-size:13px;flex:1;font-weight:500">${col}</span>
      <button onclick="moveKanbanCol(${i},-1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 6px;cursor:pointer;font-size:11px;color:var(--text3)">↑</button>
      <button onclick="moveKanbanCol(${i},1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 6px;cursor:pointer;font-size:11px;color:var(--text3)">↓</button>
      <button onclick="removeKanbanCol('${col}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px">×</button>
    </div>`;
  });
  const hidden=allStatuses.filter(s=>!cols.includes(s));
  if(hidden.length){
    h+='<div style="font-size:11px;color:var(--text3);margin-top:8px;margin-bottom:4px">Скрытые:</div>';
    hidden.forEach(col=>{
      h+=`<label style="display:flex;align-items:center;gap:8px;padding:3px 0;opacity:0.5;cursor:pointer;font-size:12px">
        <input type="checkbox" onchange="toggleKanbanCol('${col}',this.checked)" style="margin:0"> ${col}
      </label>`;
    });
  }
  
  // Секция 4: Проверка оплаты при перемещении
  const payCheck=_pendingPayCheck;
  h+=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-top:16px;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">💰 Проверка оплаты</div>`;
  h+=`<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Не пускать заказ в колонку если не оплачен полностью</div>`;
  cols.forEach(col=>{
    h+=`<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px">
      <input type="checkbox" ${payCheck[col]?'checked':''} onchange="_pendingPayCheck['${col}']=this.checked" style="margin:0"> ${col}
    </label>`;
  });

  // Секция 5: Проверка материалов при перемещении
  h+=`<div style="font-size:12px;font-weight:600;color:var(--text);margin-top:16px;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px">📦 Проверка материалов при перемещении</div>`;
  h+=`<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Для каждой колонки задайте какие материалы проверять перед перемещением карточки</div>`;
  
  cols.forEach(col=>{
    const rule=matRules[col]||'none';
    h+=`<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;flex:1;min-width:80px">${col}</span>
      <select onchange="_pendingMatRules['${col}']=this.value" style="font-size:11px;border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-family:'Geologica',sans-serif;background:var(--surface);color:var(--text2)">
        <option value="none"${rule==='none'?' selected':''}>Без проверки</option>
        <option value="sheets"${rule==='sheets'?' selected':''}>Листовые + кромка</option>
        <option value="all"${rule==='all'?' selected':''}>Все материалы</option>
      </select>
    </div>`;
  });
  
  // Ключевые слова для листовых
  h+=`<div style="margin-top:12px;font-size:11px;color:var(--text3)">Ключевые слова для "Листовые + кромка":</div>`;
  h+=`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">`;
  matKeywords.forEach((kw,i)=>{
    h+=`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;gap:4px">${kw}<button onclick="_pendingMatKeywords.splice(${i},1);_renderKbSettingsBody()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;padding:0 2px">×</button></span>`;
  });
  h+=`</div>`;
  h+=`<div style="display:flex;gap:6px;margin-top:6px"><input class="finput" id="new-mat-kw" placeholder="Новое слово..." style="flex:1;font-size:12px"><button class="btn btn-ghost" onclick="addMatKeyword()" style="font-size:11px;padding:3px 10px">+</button></div>`;

  $('m-kb-settings-body').innerHTML=h;
}

// ── Сохранение ВСЕХ настроек одной кнопкой ──
async function saveAllKanbanSettings(){
  const btn=$('kb-save-all-btn');
  btn.textContent='⏳ Сохранение...'; btn.disabled=true;
  
  const settings={
    kanban_fields:_pendingFields,
    kanban_columns:_pendingCols,
    source_colors:_pendingSrcColors,
    mat_check_rules:_pendingMatRules,
    mat_keywords:_pendingMatKeywords,
    payment_check:_pendingPayCheck
  };
  
  let hasError=false;
  for(const [key,value] of Object.entries(settings)){
    _appSettings[key]=value;
    try{
      const {error}=await sb.from('app_settings').upsert(
        {key, value:JSON.stringify(value), updated_at:new Date().toISOString()},
        {onConflict:'key'}
      );
      if(error){console.log('Settings save error ['+key+']:',error.message);hasError=true}
    }catch(e){console.log('Settings save error ['+key+']:',e);hasError=true}
  }
  
  localStorage.setItem('k2_app_settings',JSON.stringify(_appSettings));
  updateSourceSelects();
  renderKanban();
  
  if(hasError){
    btn.textContent='⚠️ Ошибка — попробуйте ещё раз';
    btn.disabled=false;
    setTimeout(()=>{btn.textContent='💾 Сохранить настройки'},3000);
  } else {
    btn.textContent='✅ Сохранено!';
    setTimeout(()=>{
      btn.textContent='💾 Сохранить настройки'; btn.disabled=false;
      $('m-kb-settings').classList.remove('open');
    },1000);
    showToast('Настройки сохранены');
  }
}

// ── Действия в модалке — только меняют pending state ──
function toggleKanbanField(key,show){
  _pendingFields[key]=show;
}

// ── Правила проверки материалов ──
function getMatCheckRules(){
  return getSetting('mat_check_rules',{
    'Отправлено КП':'none','Новый':'none','Материал заказан':'none',
    'В работе':'sheets','Готов к выдаче':'all','Отгружен':'all',
    'Закрыт':'all','Приостановлен':'none','Рекламация':'none','Отказались':'none'
  });
}

function setMatCheckRule(col,rule){
  _pendingMatRules[col]=rule;
}

function getMatKeywords(){
  return getSetting('mat_keywords',['лдсп','хдф','мдф','фанера','дсп','двп','лист','кромка','кром.','abs','пвх кромка']);
}

function addMatKeyword(){
  const kw=($('new-mat-kw')?.value||'').trim().toLowerCase();
  if(!kw){showToast('Укажите слово');return}
  if(_pendingMatKeywords.includes(kw)){showToast('Уже есть');return}
  _pendingMatKeywords.push(kw);
  _renderKbSettingsBody();
}

function removeMatKeyword(i){
  _pendingMatKeywords.splice(i,1);
  _renderKbSettingsBody();
}

function setSourceColor(src,color){
  _pendingSrcColors[src]=color;
}

function addSource(){
  const name=$('new-src-name').value.trim();
  const color=$('new-src-color').value||'#8b5cf6';
  if(!name){showToast('Укажите название');return}
  if(_pendingSrcColors[name]){showToast('Такой источник уже есть');return}
  _pendingSrcColors[name]=color;
  _renderKbSettingsBody();
  showToast('Источник "'+name+'" добавлен');
}

function removeSource(src){
  if(!confirm('Удалить источник "'+src+'"?')) return;
  delete _pendingSrcColors[src];
  _renderKbSettingsBody();
}

function updateSourceSelects(){
  const srcColors=getSourceColors();
  let opts='';
  Object.keys(srcColors).forEach(s=>{
    if(s==='Другое') return;
    opts+=`<option>${s}</option>`;
  });
  opts+=`<option value="__other">Другое...</option>`;
  // Модалка заказа
  const sel=$('f-src2');
  if(sel){const cur=sel.value;sel.innerHTML=opts;if(cur)sel.value=cur}
  // Модалка CRM
  const sel2=$('cl-source');
  if(sel2){const cur=sel2.value;sel2.innerHTML=opts;if(cur)sel2.value=cur}
}

function toggleKanbanCol(col,show){
  if(show&&!_pendingCols.includes(col)) _pendingCols.push(col);
  else if(!show) _pendingCols=_pendingCols.filter(c=>c!==col);
  _renderKbSettingsBody();
}

function moveKanbanCol(idx,dir){
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=_pendingCols.length) return;
  [_pendingCols[idx],_pendingCols[newIdx]]=[_pendingCols[newIdx],_pendingCols[idx]];
  _renderKbSettingsBody();
}

function removeKanbanCol(col){
  if(!confirm('Удалить этап "'+col+'"?')) return;
  _pendingCols=_pendingCols.filter(c=>c!==col);
  _renderKbSettingsBody();
}

function addKanbanColumn(){
  const name=$('kb-new-col').value.trim();
  if(!name){showToast('Укажите название');return}
  if(_pendingCols.includes(name)){showToast('Такой этап уже есть');return}
  _pendingCols.push(name);
  $('kb-new-col').value='';
  _renderKbSettingsBody();
  showToast('Этап "'+name+'" добавлен');
}

let kanbanStatFilter='';

function setKanbanFilter(type){
  // Toggle — если уже выбран, сбрасываем
  kanbanStatFilter=(kanbanStatFilter===type)?'':type;
  // Подсвечиваем активный stat-бокс
  document.querySelectorAll('.stat').forEach(s=>s.style.outline='');
  if(kanbanStatFilter){
    const idx={active:0,overdue:1,ready:2}[kanbanStatFilter];
    const stats=document.querySelectorAll('.stat');
    if(stats[idx]) stats[idx].style.outline='2px solid var(--accent)';
  }
  renderKanban();
}

function renderKanban(){
  const COLUMNS=getKanbanColumns();
  const STATUS_COL_COLORS={'Отправлено КП':'#185FA5','Новый':'#534AB7','Материал заказан':'#854F0B','В работе':'#2a5c3f','Готов к выдаче':'#16a34a','Отгружен':'#3b82f6','Закрыт':'#6b6a64','Приостановлен':'#8a7340','Рекламация':'#A32D2D','Отказались':'#A32D2D'};
  
  const today=new Date();today.setHours(0,0,0,0);
  const sz=KANBAN_SIZES[kanbanZoomLevel]||KANBAN_SIZES[1];
  const isMob=window.innerWidth<768;
  const q=($('q')?.value||'').toLowerCase();
  const mgr=$('f-mgr')?.value||'';
  const src=$('f-src')?.value||'';
  
  // Период фильтр
  const pFrom=$('p-from')?.value?new Date($('p-from').value):null;
  const pTo=$('p-to')?.value?new Date($('p-to').value+'T23:59:59'):null;
  
  // Stat-фильтр
  const INACTIVE=['Закрыт','Отгружен','Отправлено КП','Отказались'];
  
  let h=`<div class="kanban" style="--kb-font:${sz.font};--kb-pad:${sz.pad};--kb-col:${sz.col};--kb-col-mob:${sz.mobCol}">`;
  COLUMNS.forEach(col=>{
    let colOrders=orders.filter(o=>(o.status||'').trim()===col);
    if(q) colOrders=colOrders.filter(o=>
      (o.client||'').toLowerCase().includes(q)||
      (o.order_num||'').toLowerCase().includes(q)||
      (o.description||'').toLowerCase().includes(q)||
      (o.phone||'').includes(q)||
      (o.manager||'').toLowerCase().includes(q)
    );
    if(mgr) colOrders=colOrders.filter(o=>(o.manager||'').trim()===mgr);
    if(src) colOrders=colOrders.filter(o=>(o.source||'').trim()===src);
    // Период
    if(pFrom||pTo){
      colOrders=colOrders.filter(o=>{
        const d=pDate(o.order_date);if(!d) return false;
        if(pFrom&&d<pFrom) return false;
        if(pTo&&d>pTo) return false;
        return true;
      });
    }
    // Stat-фильтр
    if(kanbanStatFilter==='active') colOrders=colOrders.filter(o=>!INACTIVE.includes((o.status||'').trim()));
    if(kanbanStatFilter==='overdue') colOrders=colOrders.filter(o=>{const d=pDate(o.deadline);return d&&d<today&&!['Закрыт','Отгружен','Отказались'].includes((o.status||'').trim())});
    if(kanbanStatFilter==='ready') colOrders=colOrders.filter(o=>(o.status||'').trim()==='Готов к выдаче');
    // Просроченные наверх
    colOrders.sort((a,b)=>{
      const da=pDate(a.deadline),db=pDate(b.deadline);
      const oa=da&&da<today&&col!=='Закрыт'&&col!=='Отгружен'?0:1;
      const ob=db&&db<today&&col!=='Закрыт'&&col!=='Отгружен'?0:1;
      return oa-ob;
    });
    const color=STATUS_COL_COLORS[col]||'#6b6a64';
    
    h+=`<div class="kanban-col" data-status="${col}"  
      ondragover="kanbanDragOver(event,this)" ondragleave="kanbanDragLeave(this)" ondrop="kanbanDrop(event,this)">
      <div class="kanban-col-hd" style="font-size:var(--kb-font)">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="flex:1">${col}</span>
        <span style="background:var(--surface);padding:1px 7px;border-radius:10px;font-size:10px;color:var(--text3)">${colOrders.length}</span>
      </div>
      <div class="kanban-col-body">`;
    
    colOrders.forEach(o=>{
      try{
      const sum=parseFloat(o.order_sum)||0;
      const paid=parseFloat(o.prepay)||0;
      const deadline=pDate(o.deadline);
      const orderDate=pDate(o.order_date);
      const isOverdue=deadline&&deadline<today&&col!=='Закрыт'&&col!=='Отгружен';
      const paidPct=sum>0?Math.round(paid/sum*100):0;
      const dop=sum>0?Math.max(0,sum-paid):0;
      const fields=getKanbanFields();
      const srcColors=getSourceColors();
      const srcColor=srcColors[(o.source||'').trim()]||'#6b6a64';
      const orderExp=getOrderExpTotal(o.order_num);
      
      h+=`<div class="kanban-card" draggable="true" data-id="${o.order_num}" 
        ondragstart="kanbanDragStart(event,this)" ondragend="kanbanDragEnd(this)"
        ontouchstart="kanbanTouchStart(event,this)" ontouchmove="kanbanTouchMove(event)" ontouchend="kanbanTouchEnd(event,this)"
        onclick="if(event.target.tagName==='BUTTON')return;openEdit('${o.order_num}')"
        style="border-left-color:${color};padding:var(--kb-pad);font-size:var(--kb-font);cursor:pointer;${isOverdue?'background:var(--red-light);border-left-color:var(--red);border-color:rgba(163,45,45,0.3)':''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-weight:600">${o.order_num}</span>
          <div style="display:flex;gap:4px;align-items:center">
            ${fields.label_color&&o.label_color?`<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${o.label_color};flex-shrink:0" title="Метка"></span>`:''}
            ${fields.source&&o.source?`<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${srcColor}18;color:${srcColor};font-weight:500">${o.source}</span>`:''}
            ${isOverdue?'<span style="color:var(--red);font-weight:500;font-size:10px">⚠</span>':''}
          </div>
        </div>
        <div style="font-weight:500;margin-bottom:2px">${o.client||'—'}</div>
        ${fields.address&&o.address?`<div style="font-size:10px;color:var(--text3)">📍 ${o.address}</div>`:''}
        ${fields.phone&&o.phone?`<div style="font-size:10px;color:var(--text3)">📱 ${o.phone}</div>`:''}
        ${fields.description&&o.description?`<div style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${o.description}</div>`:''}
        ${fields.date&&orderDate?`<div style="font-size:10px;color:var(--text3)">📅 ${orderDate.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>`:''}
        ${fields.deadline||fields.sum?`<div style="display:flex;justify-content:space-between;align-items:center;color:var(--text3);font-size:10px">
          ${fields.deadline?`<span>${deadline?'⏰'+deadline.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}):'—'}</span>`:''}
          ${fields.sum&&sum?`<span style="font-weight:500;color:var(--text)">${sum.toLocaleString('ru-RU')}₽</span>`:''}
        </div>`:''}
        ${fields.prepay?`<div style="font-size:10px;color:var(--accent-text)">💰 Предоплата: ${paid.toLocaleString('ru-RU')} ₽</div>`:''}
        ${fields.dopay&&dop>0?`<div style="font-size:10px;color:var(--red)">📌 Остаток: ${dop.toLocaleString('ru-RU')} ₽</div>`:''}
        ${fields.expenses&&orderExp>0?`<div style="font-size:10px;color:var(--red)">💸 Расходы: ${orderExp.toLocaleString('ru-RU')} ₽</div>`:''}
        ${fields.payment&&sum?`<div style="background:var(--surface2);border-radius:2px;height:3px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${paidPct}%;background:${paidPct>=100?'var(--accent)':'var(--amber)'}"></div></div>
        <div style="font-size:9px;color:var(--text3);text-align:right">${paidPct}%</div>`:''}
        ${fields.manager&&o.manager?`<div style="font-size:10px;color:var(--text3)">👤 ${o.manager}</div>`:''}
        ${fields.comment&&(o.comment||'').trim()?`<div style="font-size:10px;color:var(--text2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">💬 ${o.comment}</div>`:''}
        ${fields.chat&&chatMessages.some(m=>m.order_num===o.order_num)?`<div onclick="event.stopPropagation();openChatForOrder('${o.order_num}')" style="font-size:10px;color:var(--blue);margin-top:2px;cursor:pointer;font-weight:500">💬 ${chatMessages.filter(m=>m.order_num===o.order_num).length} сообщ.</div>`:''}
        <div class="kb-card-btns" style="display:flex;gap:4px;margin-top:5px;position:relative;z-index:2">
          <button onclick="event.stopPropagation();if(!window._scrolling)openPrepay('${o.order_num}')" style="flex:1;background:var(--accent-light);border:none;border-radius:4px;padding:6px 0;font-size:11px;cursor:pointer;font-family:'Geologica',sans-serif;color:var(--accent-text);font-weight:500">₽ Оплата</button>
          <button onclick="event.stopPropagation();if(!window._scrolling)addExpenseForOrder('${o.order_num}')" style="flex:1;background:var(--red-light);border:none;border-radius:4px;padding:6px 0;font-size:11px;cursor:pointer;font-family:'Geologica',sans-serif;color:var(--red);font-weight:500">+ Расход</button>
        </div>
      </div>`;
      }catch(cardErr){console.log('Card render error:',o?.order_num,cardErr)}
    });
    
    h+=`</div></div>`;
  });
  h+='</div>';
  $('kanban-body').innerHTML=h;
}

// Scroll detection — prevents accidental button taps during scroll
window._scrolling=false;
let _scrollTimer=null;
document.addEventListener('scroll',()=>{
  window._scrolling=true;
  clearTimeout(_scrollTimer);
  _scrollTimer=setTimeout(()=>{window._scrolling=false},300);
},true);
document.addEventListener('touchmove',()=>{
  window._scrolling=true;
  clearTimeout(_scrollTimer);
  _scrollTimer=setTimeout(()=>{window._scrolling=false},300);
},true);

// Desktop Drag & Drop
var draggedOrderNum=null;

function kanbanDragStart(e,el){
  draggedOrderNum=el.dataset.id;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
}
function kanbanDragEnd(el){
  el.classList.remove('dragging');
  document.querySelectorAll('.kanban-col').forEach(c=>c.classList.remove('drag-over'));
}
function kanbanDragOver(e,col){e.preventDefault();col.classList.add('drag-over')}
function kanbanDragLeave(col){col.classList.remove('drag-over')}

// Автоскролл канбана — при ЛЮБОМ drag у края окна
(function(){
  var scrolling=0;
  var raf=null;
  function doScroll(){
    if(!scrolling){raf=null;return}
    var kb=document.getElementById('kanban-body');
    var k=kb&&kb.firstElementChild;
    if(k){k.scrollLeft+=scrolling}
    raf=requestAnimationFrame(doScroll);
  }
  document.addEventListener('dragover',function(e){
    e.preventDefault();
    var x=e.clientX;
    var w=window.innerWidth;
    var oldScrolling=scrolling;
    if(x>w-150) scrolling=Math.round(20*((x-(w-150))/150))+5;
    else if(x<150) scrolling=-Math.round(20*((150-x)/150))-5;
    else scrolling=0;
    if(scrolling&&!raf) raf=requestAnimationFrame(doScroll);
  });
  document.addEventListener('dragend',function(){scrolling=0});
  document.addEventListener('drop',function(){scrolling=0});
})();

async function kanbanDrop(e,col){
  e.preventDefault();col.classList.remove('drag-over');
  if(!draggedOrderNum) return;
  const newStatus=col.dataset.status;
  const o=findO(draggedOrderNum);
  if(!o||(o.status||'').trim()===newStatus) return;
  // Сохраняем позицию скролла
  const kanban=$('kanban-body')?.firstElementChild;
  const scrollPos=kanban?kanban.scrollLeft:0;
  await quickStatus(draggedOrderNum,newStatus);
  renderKanban();
  // Восстанавливаем позицию скролла после полного рендера
  setTimeout(()=>{
    const k=$('kanban-body')?.firstElementChild;
    if(k) k.scrollLeft=scrollPos;
  },50);
}

// Mobile Touch Drag & Drop — long press to activate
let touchDragEl=null, touchClone=null, touchStartX=0, touchStartY=0, touchMoved=false;
let touchHoldTimer=null, touchDragActive=false;

function kanbanTouchStart(e,el){
  touchDragEl=el;
  touchMoved=false;
  touchDragActive=false;
  const t=e.touches[0];
  touchStartX=t.clientX;
  touchStartY=t.clientY;
  
  // Долгое нажатие — 500мс для активации перетаскивания
  touchHoldTimer=setTimeout(()=>{
    touchDragActive=true;
    // Вибрация если поддерживается
    if(navigator.vibrate) navigator.vibrate(50);
    el.style.opacity='0.6';
    el.style.transform='scale(0.95)';
  },500);
}

function kanbanTouchMove(e){
  if(!touchDragEl) return;
  const t=e.touches[0];
  const dx=Math.abs(t.clientX-touchStartX), dy=Math.abs(t.clientY-touchStartY);
  
  // Если палец сдвинулся до срабатывания long-press — отменяем (это скролл)
  if(!touchDragActive&&(dx>8||dy>8)){
    clearTimeout(touchHoldTimer);
    touchDragEl.style.opacity='';
    touchDragEl.style.transform='';
    touchDragEl=null;
    return; // Разрешаем обычный скролл
  }
  
  if(!touchDragActive) return;
  
  touchMoved=true;
  e.preventDefault();
  
  if(!touchClone){
    touchClone=touchDragEl.cloneNode(true);
    touchClone.style.cssText='position:fixed;z-index:9999;opacity:0.85;pointer-events:none;width:'+touchDragEl.offsetWidth+'px;transform:rotate(2deg);box-shadow:0 8px 24px rgba(0,0,0,0.2)';
    document.body.appendChild(touchClone);
    touchDragEl.classList.add('dragging');
  }
  touchClone.style.left=(t.clientX-touchDragEl.offsetWidth/2)+'px';
  touchClone.style.top=(t.clientY-30)+'px';
  
  // Подсветка колонки
  document.querySelectorAll('.kanban-col').forEach(c=>{
    const r=c.getBoundingClientRect();
    c.classList.toggle('drag-over',t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom);
  });
}

async function kanbanTouchEnd(e,el){
  clearTimeout(touchHoldTimer);
  if(!touchDragEl){return}
  touchDragEl.style.opacity='';
  touchDragEl.style.transform='';
  
  if(touchClone){
    touchClone.remove();touchClone=null;
    touchDragEl.classList.remove('dragging');
    const target=document.querySelector('.kanban-col.drag-over');
    document.querySelectorAll('.kanban-col').forEach(c=>c.classList.remove('drag-over'));
    if(target){
      const newStatus=target.dataset.status;
      const orderNum=touchDragEl.dataset.id;
      const o=findO(orderNum);
      if(o&&(o.status||'').trim()!==newStatus){
        const kanban=$('kanban-body')?.firstElementChild;
        const scrollPos=kanban?kanban.scrollLeft:0;
        await quickStatus(orderNum,newStatus);
        renderKanban();
        setTimeout(()=>{const k=$('kanban-body')?.firstElementChild;if(k)k.scrollLeft=scrollPos},50);
      }
    }
  } else if(!touchMoved&&!touchDragActive){
    // Простой тап — открыть заказ (но не если тапнули на кнопку)
    const tag=(e.target||{}).tagName;
    if(tag!=='BUTTON') openEdit(el.dataset.id);
  }
  touchDragEl=null;touchMoved=false;touchDragActive=false;
}

// ══════════════════════════════════════════════════════
// ФАЙЛЫ ЗАКАЗОВ
// ══════════════════════════════════════════════════════
let orderFiles=[];

async function loadOrderFiles(orderNum){
  $('f-files-list').innerHTML='';
  $('f-files-empty').style.display='';
  try{
    const {data}=await sb.from('order_files').select('*').eq('order_num',orderNum).order('created_at',{ascending:false});
    orderFiles=data||[];
    renderOrderFiles();
  }catch(e){}
}

function renderOrderFiles(){
  const list=$('f-files-list');
  const empty=$('f-files-empty');
  if(!orderFiles.length){list.innerHTML='';empty.style.display='';return}
  empty.style.display='none';
  
  let h='<div style="display:flex;flex-wrap:wrap;gap:8px">';
  orderFiles.forEach(f=>{
    const isImg=(f.file_type||'').startsWith('image');
    const size=f.file_size?Math.round(f.file_size/1024)+'КБ':'';
    
    if(isImg){
      h+=`<div style="position:relative;width:90px;border:1px solid var(--border);border-radius:var(--rs);overflow:hidden;background:var(--surface2)">
        <img src="${f.file_url}" style="width:100%;height:70px;object-fit:cover;display:block;cursor:pointer" onclick="window.open('${f.file_url}','_blank')" title="${f.file_name}">
        <div style="padding:3px 5px;font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.file_name}</div>
        <button onclick="deleteOrderFile(${f.id},'${f.file_url}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1">×</button>
      </div>`;
    } else {
      const icon=f.file_name.endsWith('.pdf')?'📄':f.file_name.endsWith('.xlsx')||f.file_name.endsWith('.xls')?'📊':'📁';
      h+=`<div style="position:relative;border:1px solid var(--border);border-radius:var(--rs);padding:8px 12px;background:var(--surface2);min-width:120px">
        <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="window.open('${f.file_url}','_blank')">
          <span style="font-size:18px">${icon}</span>
          <div>
            <div style="font-size:11px;font-weight:500;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.file_name}</div>
            <div style="font-size:9px;color:var(--text3)">${size}</div>
          </div>
        </div>
        <button onclick="deleteOrderFile(${f.id},'${f.file_url}')" style="position:absolute;top:2px;right:2px;background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer">×</button>
      </div>`;
    }
  });
  h+='</div>';
  list.innerHTML=h;
}

async function uploadOrderFiles(fileList){
  if(!fileList||!fileList.length) return;
  const orderNum=$('f-num').value.trim();
  if(!orderNum){showToast('Сначала сохраните заказ');return}
  
  let uploaded=0;
  for(const file of fileList){
    const ext=file.name.split('.').pop().toLowerCase();
    // Транслитерация для storage (кириллица → латиница)
    const safeOrder=orderNum.replace(/[А-Яа-яЁё]/g,c=>{
      const map={'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya','а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
      return map[c]||c;
    });
    const fileName=safeOrder+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)+'.'+ext;
    const filePath='orders/'+safeOrder+'/'+fileName;
    
    try{
      // Загружаем в Supabase Storage
      const {error:upErr}=await sb.storage.from('order-files').upload(filePath,file,{contentType:file.type});
      if(upErr) throw upErr;
      
      // Получаем публичный URL
      const {data:urlData}=sb.storage.from('order-files').getPublicUrl(filePath);
      const fileUrl=urlData.publicUrl;
      
      // Сохраняем запись в таблицу
      const row={
        order_num:orderNum,
        file_name:file.name,
        file_url:fileUrl,
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

