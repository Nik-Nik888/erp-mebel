// ── PERIOD ────────────────────────────────────────────
function setPeriod(mode){
  const now=new Date();
  if(mode==='month'){
    const from=new Date(now.getFullYear(),now.getMonth(),1);
    const to=new Date(now.getFullYear(),now.getMonth()+1,0);
    $('p-from').value=from.toISOString().split('T')[0];
    $('p-to').value=to.toISOString().split('T')[0];
  } else if(mode==='prev'){
    const from=new Date(now.getFullYear(),now.getMonth()-1,1);
    const to=new Date(now.getFullYear(),now.getMonth(),0);
    $('p-from').value=from.toISOString().split('T')[0];
    $('p-to').value=to.toISOString().split('T')[0];
  } else { $('p-from').value=''; $('p-to').value=''; }
  updateStats();
  renderKanban();
}

// ── STATS ─────────────────────────────────────────────
function getFilteredByPeriod(){
  const q=($('q')?.value||'').toLowerCase();
  const mgr=$('f-mgr')?.value||'';
  const src=$('f-src')?.value||'';
  const from=$('p-from')?.value?new Date($('p-from').value):null;
  const to=$('p-to')?.value?new Date($('p-to').value+'T23:59:59'):null;
  return orders.filter(o=>{
    if(mgr&&(o.manager||'').trim()!==mgr) return false;
    if(src&&(o.source||'').trim()!==src) return false;
    if(q){
      if(!(o.client||'').toLowerCase().includes(q)&&
         !(o.description||'').toLowerCase().includes(q)&&
         !(o.order_num||'').toLowerCase().includes(q)) return false;
    }
    if(from||to){
      const d=pDate(o.order_date); if(!d) return false;
      if(from&&d<from) return false;
      if(to&&d>to) return false;
    }
    return true;
  });
}

function updateStats(){
  const today=new Date(); today.setHours(0,0,0,0);
  const INACTIVE=['Закрыт','Отгружен','Отправлено КП','Отказались'];
  const active=orders.filter(o=>{ const s=(o.status||'').trim(); return !INACTIVE.includes(s)&&s!=='' });
  const over=orders.filter(o=>{
    const d=pDate(o.deadline); if(!d) return false; d.setHours(0,0,0,0);
    const s=(o.status||'').trim(); return d<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались';
  });
  const ready=orders.filter(o=>(o.status||'').trim()==='Готов к выдаче');
  const po=getFilteredByPeriod().filter(o=>{const s=(o.status||'').trim();return s!=='Отправлено КП'&&s!=='Отказались'});
  const contracts=po.reduce((s,o)=>s+(parseFloat(o.order_sum)||0),0);
  const received=po.reduce((s,o)=>s+(parseFloat(o.prepay)||0),0);

  $('s-active').textContent=active.length;
  $('s-over').textContent=over.length;
  $('s-ready').textContent=ready.length;
  $('s-count').textContent=po.length;
  $('s-contracts').textContent=fmtK(contracts);
  $('s-received').textContent=fmtK(received);

  const pAll=getFilteredByPeriod().length;
  const pDone=getFilteredByPeriod().filter(o=>(o.status||'').trim()==='Закрыт').length;
  const cnt={kp:0,new:0,matorder:0,work:0,ready:0,ship:0,pause:0,reclam:0,refuse:0};
  orders.forEach(o=>{
    const s=(o.status||'').trim();
    if(s==='Отправлено КП')cnt.kp++;
    else if(s==='Новый')cnt.new++;
    else if(s==='Материал заказан')cnt.matorder++;
    else if(s==='В работе')cnt.work++;
    else if(s==='Готов к выдаче')cnt.ready++;
    else if(s==='Отгружен')cnt.ship++;
    else if(s==='Приостановлен')cnt.pause++;
    else if(s==='Рекламация')cnt.reclam++;
    else if(s==='Отказались')cnt.refuse++;
  });
  const tc=$('tc-all'); if(tc)tc.textContent=pAll;
  const td=$('tc-done'); if(td)td.textContent=pDone;
  const to2=$('tc-over2'); if(to2)to2.textContent=over.length;
  ['kp','new','matorder','work','ready','ship','pause','reclam','refuse'].forEach(k=>{const el=$('tc-'+k);if(el)el.textContent=cnt[k]});
}

// ══════════════════════════════════════════════════════
// LOAD ORDERS (Supabase)
// ══════════════════════════════════════════════════════
async function loadOrders(){
  try{
    const {data,error} = await sb.from('orders').select('*').order('id',{ascending:false});
    if(error) throw error;
    // Сортируем: сначала по номеру заказа (З-XXX) по убыванию
    orders = (data || []).sort((a,b)=>{
      const na=parseInt((String(a.order_num||'').match(/(\d+)/)||[0,'0'])[1])||0;
      const nb=parseInt((String(b.order_num||'').match(/(\d+)/)||[0,'0'])[1])||0;
      if(na!==nb) return nb-na;
      return (b.id||0)-(a.id||0);
    });
    // Защита: если статус пустой — ставим "Новый"
    for(const o of orders){
      if(!(o.status||'').trim()){
        o.status='Новый';
        sb.from('orders').update({status:'Новый'}).eq('id',o.id).then(()=>{});
      }
    }
    fillDataLists();
    fillManagerFilter();
    setPeriod('all');
    render();
  }catch(e){
    $('kanban-body').innerHTML='<div class="empty-state">Не удалось загрузить: '+e.message+'</div>';
  }
}

function fillDataLists(){
  const cl=[...new Set(orders.map(o=>(o.client||'').trim()).filter(Boolean))];
  const clEl=$('cl-list'); if(clEl){clEl.innerHTML='';cl.forEach(c=>{const o=document.createElement('option');o.value=c;clEl.appendChild(o)})}
  const mg=[...new Set(orders.map(o=>(o.manager||'').trim()).filter(Boolean))];
  const mgEl=$('mgr-list'); if(mgEl){mgEl.innerHTML='';mg.forEach(m=>{const o=document.createElement('option');o.value=m;mgEl.appendChild(o)})}
}
function fillManagerFilter(){
  const mg=[...new Set(orders.map(o=>(o.manager||'').trim()).filter(Boolean))];
  const sel=$('f-mgr'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Все менеджеры</option>';
  mg.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;if(m===cur)o.selected=true;sel.appendChild(o)});
  // Фильтр источников
  const sr=[...new Set(orders.map(o=>(o.source||'').trim()).filter(Boolean))];
  const ssel=$('f-src'); if(!ssel) return;
  const scur=ssel.value;
  ssel.innerHTML='<option value="">Все источники</option>';
  sr.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(s===scur)o.selected=true;ssel.appendChild(o)});
}

// ── FILTER / RENDER ───────────────────────────────────
function getFiltered(){
  const q=($('q')?.value||'').toLowerCase();
  const mgr=$('f-mgr')?.value||'';
  const src=$('f-src')?.value||'';
  const from=$('p-from')?.value?new Date($('p-from').value):null;
  const to=$('p-to')?.value?new Date($('p-to').value+'T23:59:59'):null;
  const today=new Date(); today.setHours(0,0,0,0);
  return orders.filter(o=>{
    const s=(o.status||'').trim();
    if(tab==='overdue'){
      const ddl=pDate(o.deadline); if(!ddl) return false; ddl.setHours(0,0,0,0);
      if(!(ddl<today&&s!=='Закрыт'&&s!=='Отгружен'&&s!=='Отказались')) return false;
    } else if(tab!=='all'&&s!==tab) return false;
    if(mgr&&(o.manager||'').trim()!==mgr) return false;
    if(src&&(o.source||'').trim()!==src) return false;
    if(q){
      if(!(o.client||'').toLowerCase().includes(q)&&
         !(o.description||'').toLowerCase().includes(q)&&
         !(o.order_num||'').toLowerCase().includes(q)) return false;
    }
    if(from||to){
      const d=pDate(o.order_date); if(!d) return false;
      if(from&&d<from) return false;
      if(to&&d>to) return false;
    }
    return true;
  });
}

function setTab(t,el){
  tab=t;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  if(el) el.classList.add('active');
  render();
}

function findO(numOrId){
  const s=String(numOrId).trim();
  return orders.find(o=>String(o.order_num).trim()===s || String(o.id)===s);
}

function getOrderExpenses(orderNum){
  return expenses.filter(e=>(e.order_num||'').trim()===orderNum);
}
function getOrderExpTotal(orderNum){
  return getOrderExpenses(orderNum).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
}

function render(){
  updateStats();
  renderKanban();
}

// ── ORDER MODAL ───────────────────────────────────────
function nextOrderNum(){
  const now=new Date();
  const yy=String(now.getFullYear()).slice(2); // 26
  const mm=now.getMonth()+1; // 1-12
  const prefix=yy+'.'+mm+'-'; // "26.4-"
  
  // Считаем максимальный номер в текущем году+месяце
  let max=0;
  orders.forEach(o=>{
    const num=o.order_num||'';
    if(num.startsWith(prefix)){
      const n=parseInt(num.slice(prefix.length))||0;
      if(n>max) max=n;
    }
  });
  return prefix+String(max+1).padStart(3,'0');
}

function openAdd(){
  editId=null;
  $('m-title').textContent='Новый заказ';
  $('save-btn').textContent='Добавить заказ';
  $('del-btn').style.display='none';
  $('chat-order-btn').style.display='none';
  $('reminder-btn').style.display='none';
  $('f-num').value=nextOrderNum();
  $('f-num').readOnly=false;
  ['f-date','f-client','f-phone','f-desc','f-ddl','f-manager','f-spec','f-comment'].forEach(f=>{const el=$(f);if(el)el.value=''});
  $('f-spec-json').value='';
  updateSourceSelects();
  $('f-sum').value=''; $('f-prepay').value=''; $('f-dopay').value='';
  $('f-status').value='Новый'; $('f-src2').value='Авито';
  $('f-src-custom').value=''; $('f-src-custom').style.display='none';
  // Сбрасываем материалы
  $('f-mats-wrap').innerHTML='';
  orderMatCounter=0;
  matsCollapsed=false;
  if($('f-mats-body'))$('f-mats-body').style.display='';
  if($('f-mats-arrow'))$('f-mats-arrow').style.transform='rotate(90deg)';
  updateOrderMatsEmpty();
  // Файлы — скрываем для нового заказа
  $('f-files-section').style.display='none';
  $('f-files-list').innerHTML='';
  $('f-files-empty').style.display='';
  // Этапы — скрываем для нового
  $('f-stages-section').style.display='none';
  $('f-stages-data').value='{}';
  // Виды работ — скрываем для нового
  $('f-works-section').style.display='none';
  $('f-works-data').value='{}';
  $('m-order').classList.add('open');history.pushState(null,'',location.href);
}

function openEdit(rid){
  const o=findO(rid); if(!o) return;
  editId=o.id;
  $('m-title').textContent='Редактировать '+rid;
  $('save-btn').textContent='Сохранить';
  $('del-btn').style.display='inline-flex';
  $('chat-order-btn').style.display='inline-flex';
  $('reminder-btn').style.display='inline-flex';
  $('f-num').value=o.order_num||''; $('f-num').readOnly=true;
  $('f-client').value=o.client||'';
  $('f-phone').value=o.phone||'';
  $('f-desc').value=o.description||'';
  $('f-manager').value=o.manager||'';
  $('f-comment').value=o.comment||'';
  updateSourceSelects();

  const specRaw=o.specification||'';
  let isKpSpec=false;
  try{const sp=JSON.parse(specRaw);if(sp&&sp.kp){isKpSpec=true;$('f-spec-json').value=specRaw;}else{$('f-spec-json').value='';}}
  catch(e){$('f-spec-json').value='';}
  $('f-spec').value='';
  

  // Заполняем материалы из спецификации
  populateOrderMats(isKpSpec?specRaw:'');

  const sum=parseFloat(o.order_sum)||0, prep=parseFloat(o.prepay)||0;
  $('f-sum').value=sum||'';
  $('f-prepay').value=prep||'';
  $('f-dopay').value=sum>0?Math.max(0,sum-prep):'';
  const ddl=pDate(o.deadline); $('f-ddl').value=ddl?ddl.toISOString().split('T')[0]:'';
  const dt=pDate(o.order_date); $('f-date').value=dt?dt.toISOString().split('T')[0]:'';
  $('f-status').value=(o.status||'').trim()||'Новый';
  setSourceValue(o.source||'Авито');
  // Файлы — показываем и загружаем
  $('f-files-section').style.display='';
  loadOrderFiles(rid);
  // Этапы производства
  $('f-stages-section').style.display='';
  const stages=getOrderStages(o);
  $('f-stages-data').value=JSON.stringify(stages);
  stagesCollapsed=true;
  $('f-stages-body').style.display='none';
  $('f-stages-arrow').style.transform='rotate(0deg)';
  renderStagesForm(stages);
  // Виды работ
  $('f-works-section').style.display='';
  const works=o.works||{};
  $('f-works-data').value=JSON.stringify(works);
  worksCollapsed=true;
  $('f-works-body').style.display='none';
  $('f-works-arrow').style.transform='rotate(0deg)';
  renderWorksForm(works,stages);
  // Материалы тоже свёрнуты
  matsCollapsed=true;
  if($('f-mats-body'))$('f-mats-body').style.display='none';
  if($('f-mats-arrow'))$('f-mats-arrow').style.transform='rotate(0deg)';
  $('m-order').classList.add('open');history.pushState(null,'',location.href);
  // На мобильном убираем автофокус чтобы не открывалась клавиатура/календарь
  if(window.innerWidth<641) setTimeout(()=>{document.activeElement?.blur()},50);
}

function closeOrder(){ $('m-order').classList.remove('open');history.pushState(null,'',location.href) }

// Android back button — закрывает модалки вместо выхода из браузера
window.addEventListener('popstate',function(){
  // Закрываем мобильный чат
  if(chatMobileOpen){closeMobileChat();history.pushState(null,'',location.href);return}
  const openModal=document.querySelector('.overlay.open');
  if(openModal){
    openModal.classList.remove('open');
    history.pushState(null,'',location.href);
  }
});
// Пушим начальное состояние
history.pushState(null,'',location.href);
function calcDopay(){
  const s=parseFloat($('f-sum').value)||0, p=parseFloat($('f-prepay').value)||0;
  $('f-dopay').value=s>0?Math.max(0,s-p):'';
}
function fillPhone(){
  const v=$('f-client').value.trim();
  const match=orders.find(o=>(o.client||'').trim()===v);
  if(match&&match.phone&&!$('f-phone').value) $('f-phone').value=match.phone;
}

// ── SOURCE HELPERS ────────────────────────────────────
const KNOWN_SOURCES=['Авито','Instagram','ВКонтакте','Телеграм','Обзвон','Рекомендация','Повторный'];

function toggleCustomSource(){
  const sel=$('f-src2');
  const inp=$('f-src-custom');
  inp.style.display=sel.value==='__other'?'':'none';
  if(sel.value==='__other') setTimeout(()=>inp.focus(),50);
}

function getSourceValue(){
  const sel=$('f-src2').value;
  if(sel==='__other') return $('f-src-custom').value.trim()||'Другое';
  return sel;
}

function setSourceValue(val){
  const sel=$('f-src2');
  const inp=$('f-src-custom');
  if(KNOWN_SOURCES.includes(val)){
    sel.value=val; inp.style.display='none'; inp.value='';
  } else {
    sel.value='__other'; inp.style.display=''; inp.value=val;
  }
}

// ── AUTO-SUGGEST NEW MATERIALS TO SKLAD ───────────────
async function suggestNewMaterials(mats){
  // Проверяем какие материалы из заказа отсутствуют в базе склада
  const newMats=[];
  for(const mat of mats){
    const exists=skladItems.find(i=>(i.name||'').toLowerCase()===(mat.name||'').toLowerCase());
    if(!exists && mat.name) newMats.push(mat);
  }
  if(!newMats.length) return;

  // Создаём записи-черновики в sklad_items с пометкой pending
  for(const mat of newMats){
    const item={
      item_id:'pending_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      name:mat.name,
      type:'лист',
      unit:'шт',
      min_stock:0,
      buy_price:mat.price||0
    };
    try{
      const {error}=await sb.from('sklad_items').insert(item);
      if(!error) skladItems.push(item);
    }catch(e){}
  }
  showToast('⚡ '+newMats.length+' новых материал(ов) добавлено в базу склада — проверьте и оформите');
}

// ── ORDER MATERIAL PICKER ─────────────────────────────
let orderMatCounter=0;

function addOrderMat(name='', qty=1, price=0){
  // Убираем конвертацию из названия (0.20 кв.м → 1 лист.)
  name=(name||'').replace(/\s*\(\d+[\.,]\d+\s*кв\.?м?\s*→\s*\d+\s*лист\.?\)\s*$/,'').trim();
  
  // Проверяем дубликат — если материал уже есть, суммируем количество
  if(name){
    const existing=$('f-mats-wrap').querySelectorAll('[id^="omat-"]');
    for(const row of existing){
      const nameInput=row.querySelector('.omat-name');
      if(nameInput&&nameInput.value.trim()===name.trim()){
        const qtyInput=row.querySelector('.omat-qty');
        if(qtyInput){
          qtyInput.value=parseFloat(qtyInput.value||0)+parseFloat(qty||0);
          calcOrderSum();
          return; // не создаём новую строку
        }
      }
    }
  }
  
  const i=orderMatCounter++;
  const allMats=getMatOptions();
  const n=name||(allMats.length?allMats[0]:'');
  const p=price||matPrice(n);
  const stock=n?getMatStock(n):'—';
  const matSum=p*qty;
  const dlId='dl-omat-'+i;
  const opts=allMats.map(m=>`<option value="${m}">`).join('');
  const wrap=$('f-mats-wrap');
  const row=document.createElement('div');
  row.id='omat-'+i;
  row.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);padding:6px 8px;position:relative';
  row.innerHTML=`
    <datalist id="${dlId}">${opts}</datalist>
    <button type="button" onclick="document.getElementById('omat-${i}').remove();updateOrderMatsEmpty();calcOrderSum()" style="position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:2px 4px">×</button>
    <input type="text" value="${n}" list="${dlId}" class="omat-name" placeholder="Материал..." autocomplete="off"
      oninput="onOrderMatChange(this,${i})" onchange="onOrderMatChange(this,${i})" onfocus="this.select()"
      style="width:100%;background:transparent;border:none;outline:none;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text);margin-bottom:4px;padding-right:20px">
    <div style="display:flex;gap:6px;align-items:center">
      <input type="number" value="${qty}" class="omat-qty" min="0.5" step="0.5" placeholder="Кол"
        oninput="calcOrderSum()" onchange="calcOrderSum()"
        style="width:50px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 4px;font-size:11px;outline:none;text-align:center;font-family:'Geologica',sans-serif;color:var(--text)">
      <span style="font-size:10px;color:var(--text3)">×</span>
      <input type="number" value="${p}" class="omat-price" min="0" placeholder="Цена"
        oninput="calcOrderSum()" onchange="calcOrderSum()"
        style="width:60px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 4px;font-size:11px;outline:none;text-align:right;font-family:'Geologica',sans-serif;color:var(--text2)">
      <span style="font-size:10px;color:var(--text3)">=</span>
      <span class="omat-sum" id="omat-sum-${i}" style="font-size:11px;font-weight:500;color:var(--accent-text);flex:1;text-align:right">${matSum?matSum.toLocaleString('ru-RU')+'₽':'—'}</span>
      <span class="omat-stock" id="omat-stock-${i}" style="font-size:10px;color:var(--text3)">${stock!=='—'?(stock>0?'✓'+stock:'⚠0'):'—'}</span>
    </div>`;
  wrap.appendChild(row);
  expandMatsSection();
  updateOrderMatsEmpty();
  calcOrderSum();
}

function getMatStock(matName){
  if(!matName) return '—';
  const n=(matName||'').toLowerCase().replace(/\s*\([\d.,]+\s*кв\.?м\s*→.*\)/i,'').trim();
  let si=skladItems.find(i=>(i.name||'').toLowerCase()===n);
  if(!si) si=skladItems.find(i=>{const sn=(i.name||'').toLowerCase();return sn&&(n.includes(sn)||sn.includes(n))});
  if(!si) return '—';
  return skladStock(si.item_id);
}

function onOrderMatChange(input, idx){
  const name=input.value.trim();
  const p=matPrice(name);
  const row=$('omat-'+idx);
  if(!row) return;
  const priceInput=row.querySelector('.omat-price');
  if(priceInput&&p) priceInput.value=p;
  // Обновляем остаток
  const stockEl=$('omat-stock-'+idx);
  if(stockEl){
    const stock=getMatStock(name);
    if(stock==='—') stockEl.innerHTML='—';
    else if(stock>0) stockEl.innerHTML='<span style="color:var(--accent)">✓'+stock+'</span>';
    else stockEl.innerHTML='<span style="color:var(--red)">⚠0</span>';
  }
  calcOrderSum();
}

function calcOrderSum(){
  let total=0;
  $('f-mats-wrap').querySelectorAll('[id^="omat-"]').forEach(row=>{
    const qty=parseFloat(row.querySelector('.omat-qty')?.value)||0;
    const price=parseFloat(row.querySelector('.omat-price')?.value)||0;
    const rowSum=qty*price;
    total+=rowSum;
    const idx=row.id.replace('omat-','');
    const sumEl=$('omat-sum-'+idx);
    if(sumEl) sumEl.textContent=rowSum?rowSum.toLocaleString('ru-RU')+' ₽':'—';
  });
  // Показываем/скрываем блок себестоимости
  const totalEl=$('f-mats-total');
  const costEl=$('f-mats-cost');
  if(totalEl){
    totalEl.style.display=total>0?'flex':'none';
  }
  if(costEl){
    costEl.textContent=total.toLocaleString('ru-RU')+' ₽';
  }
}

let matsCollapsed=true;
function toggleMatsSection(){
  matsCollapsed=!matsCollapsed;
  const body=$('f-mats-body');
  const arrow=$('f-mats-arrow');
  if(body) body.style.display=matsCollapsed?'none':'';
  if(arrow) arrow.style.transform=matsCollapsed?'rotate(0deg)':'rotate(90deg)';
}

function expandMatsSection(){
  matsCollapsed=false;
  const body=$('f-mats-body');
  const arrow=$('f-mats-arrow');
  if(body) body.style.display='';
  if(arrow) arrow.style.transform='rotate(90deg)';
}

function updateOrderMatsEmpty(){
  const wrap=$('f-mats-wrap');
  const empty=$('f-mats-empty');
  const count=wrap?wrap.children.length:0;
  if(empty) empty.style.display=count?'none':'';
  // Обновляем бейдж кол-ва
  const badge=$('f-mats-badge');
  if(badge){
    badge.style.display=count?'':'none';
    badge.textContent=count;
  }
}

function getOrderMatsFromForm(){
  const mats=[];
  $('f-mats-wrap').querySelectorAll('[id^="omat-"]').forEach(row=>{
    const name=(row.querySelector('.omat-name')?.value||'').trim();
    const qty=parseFloat(row.querySelector('.omat-qty')?.value)||0;
    const price=parseFloat(row.querySelector('.omat-price')?.value)||0;
    const rowSum=qty*price;
    if(name&&qty>0) mats.push({name, qty, price, sum:rowSum?rowSum.toLocaleString('ru-RU')+' ₽':''});
  });
  return mats;
}

function buildSpecJson(){
  const mats=getOrderMatsFromForm();
  if(!mats.length) return '';
  return JSON.stringify({
    kp:true, direct:true,
    date:$('f-date').value||new Date().toISOString().split('T')[0],
    coef:1, disc:0, prepayPct:50,
    mats:mats, works:[],
    total:'', profit:'', margin:''
  });
}

function populateOrderMats(specJson){
  // Заполняет форму материалами из спецификации
  const wrap=$('f-mats-wrap');
  wrap.innerHTML='';
  orderMatCounter=0;
  if(!specJson) { updateOrderMatsEmpty(); return; }
  try{
    const sp=JSON.parse(specJson);
    if(sp&&sp.kp&&sp.mats){
      sp.mats.forEach(m=>addOrderMat(m.name, m.qty, m.price));
    }
  }catch(e){}
  updateOrderMatsEmpty();
}

async function saveOrder(){
  const btn=$('save-btn'); btn.textContent='Сохраняю...'; btn.disabled=true;
  const sum=parseFloat($('f-sum').value)||0;
  const prep=parseFloat($('f-prepay').value)||0;
  // Строим спецификацию из материалов формы
  const formMats=getOrderMatsFromForm();
  let specValue='';
  if(formMats.length>0){
    specValue=JSON.stringify({
      kp:true, direct:true,
      date:$('f-date').value||new Date().toISOString().split('T')[0],
      coef:1, disc:0, prepayPct:50,
      mats:formMats, works:[],
      total:'', profit:'', margin:''
    });
  }
  // Если материалов нет — specValue остаётся пустой строкой = очищаем спецификацию
  const row={
    order_num: $('f-num').value.trim()||nextOrderNum(),
    order_date: $('f-date').value||null,
    client: $('f-client').value||'',
    phone: $('f-phone').value||'',
    description: $('f-desc').value||'',
    deadline: $('f-ddl').value||null,
    status: $('f-status').value||'',
    manager: $('f-manager').value||'',
    prepay: prep,
    order_sum: sum,
    dopay: sum>0?Math.max(0,sum-prep):0,
    source: getSourceValue(),
    specification: specValue,
    comment: $('f-comment').value||'',
    stages: JSON.parse($('f-stages-data').value||'{}'),
    works: JSON.parse($('f-works-data').value||'{}')
  };
  try{
    if(editId){
      const {error}=await sb.from('orders').update(row).eq('id',editId);
      if(error) throw error;
      // Обновляем локальный объект
      const local=orders.find(x=>x.id===editId);
      if(local) Object.assign(local,row);
      auditLog('update','order',row.order_num,{fields:Object.keys(row)});
      showToast('Заказ обновлён');
    } else {
      const {error,data:inserted}=await sb.from('orders').insert(row).select();
      if(error) throw error;
      const newId=inserted&&inserted[0]?inserted[0].id:null;
      // Логируем создание + TG уведомление
      await logStatusChange(row.order_num, '', row.status);
      auditLog('create','order',row.order_num,{client:row.client,status:row.status,sum:row.order_sum});
      if(row.status==='Отправлено КП'){
        tgNotify('new_kp',{order_num:row.order_num,client:row.client,sum:row.order_sum?row.order_sum.toLocaleString('ru-RU')+' ₽':'—'});
      } else {
        tgNotify('new_order',{order_num:row.order_num,client:row.client,description:row.description});
      }
      // При новом заказе со статусом "Отправлено КП" — резервируем материалы
      if(row.status==='Отправлено КП' && row.specification){
        try{
          const sp=JSON.parse(row.specification);
          if(sp&&sp.kp&&sp.mats&&sp.mats.length){
            const warnings=await reserveMaterials(row.order_num, sp.mats);
            if(warnings.length){
              if(newId) await addMaterialWarningToComment(newId, row.order_num, warnings);
              showToast('Заказ добавлен. ⚠ Не хватает материала — пометка в комментарии');
            } else {
              showToast('Заказ добавлен, материалы зарезервированы');
            }
          } else { showToast('Заказ добавлен'); }
        }catch(e){ showToast('Заказ добавлен'); }
      } else if(WRITEOFF_STATUSES.includes(row.status) && row.specification){
        try{
          const sp=JSON.parse(row.specification);
          if(sp&&sp.kp&&sp.mats&&sp.mats.length){
            const warnings=await convertReserveToOut(row.order_num, sp.mats);
            if(warnings.length){
              if(newId) await addMaterialWarningToComment(newId, row.order_num, warnings);
              showToast('Заказ добавлен. ⚠ Не хватает материала — пометка в комментарии');
            } else { showToast('Заказ добавлен, материал списан'); }
          } else { showToast('Заказ добавлен'); }
        }catch(e){ showToast('Заказ добавлен'); }
      } else {
        showToast('Заказ добавлен');
      }
    }
    // Автодобавление новых материалов в базу склада
    const formMatsForSuggest=getOrderMatsFromForm();
    if(formMatsForSuggest.length) await suggestNewMaterials(formMatsForSuggest);
    // Авто-расходы для нового заказа (кроме КП)
    if(!editId && row.status!=='Отправлено КП'){
      await autoCreateExpenses(row.order_num);
      await autoCreateClient(row.client,row.phone,row.source,row.manager);
    }
    closeOrder();
    await loadOrders();
  }catch(e){ showToast('Ошибка: '+e.message) }
  btn.textContent=editId?'Сохранить':'Добавить заказ'; btn.disabled=false;
}

async function deleteOrder(){
  if(!editId) return;
  const o=orders.find(x=>x.id===editId);
  const rid=o?o.order_num:'';
  
  // Подтверждение
  let overlay=$('m-block');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.className='overlay';
    overlay.id='m-block';
    overlay.innerHTML=`<div class="modal" style="max-width:480px"><div class="modal-hd"><div class="modal-title">Удаление</div><button class="modal-close" onclick="this.closest('.overlay').classList.remove('open')">×</button></div><div class="modal-body" id="m-block-body"></div></div>`;
    document.body.appendChild(overlay);
  }
  $('m-block-body').innerHTML=`
    <div style="margin-bottom:14px;color:var(--red);font-weight:600;font-size:14px">🗑 Удалить заказ ${rid}?</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:18px">Заказ <b>${rid}</b>${o?' — '+o.client:''} будет удалён безвозвратно. Связанные движения на складе (резервы, списания) тоже будут удалены.</div>
    <div style="margin-bottom:16px">
      <label style="font-size:12px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px">Введите PIN-код для подтверждения</label>
      <input type="password" id="del-pin" maxlength="4" placeholder="••••" inputmode="numeric" style="width:120px;text-align:center;font-size:20px;font-family:'JetBrains Mono',monospace;letter-spacing:8px;padding:8px 12px;border:2px solid var(--border2);border-radius:var(--rs);outline:none;background:var(--surface2);color:var(--text)" oninput="checkDelPin()" onfocus="this.value=''">
      <div id="del-pin-err" style="font-size:11px;color:var(--red);margin-top:4px;display:none">Неверный PIN-код</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="document.getElementById('m-block').classList.remove('open')" style="flex:1;justify-content:center">Отмена</button>
      <button class="btn btn-primary" id="del-confirm-btn" onclick="confirmDeleteOrder()" style="flex:1;justify-content:center;background:var(--red);opacity:0.4;pointer-events:none">Удалить навсегда</button>
    </div>`;
  overlay.classList.add('open');
  setTimeout(()=>{const p=$('del-pin');if(p)p.focus()},100);
}

const DELETE_PIN='9955';

function checkDelPin(){
  const val=$('del-pin').value;
  const btn=$('del-confirm-btn');
  const err=$('del-pin-err');
  if(val.length===4&&val===DELETE_PIN){
    btn.style.opacity='1';btn.style.pointerEvents='auto';
    if(err)err.style.display='none';
  } else {
    btn.style.opacity='0.4';btn.style.pointerEvents='none';
    if(err) err.style.display=val.length===4?'':'none';
  }
}

async function confirmDeleteOrder(){
  if(!editId) return;
  const o=orders.find(x=>x.id===editId);
  const rid=o?o.order_num:'';
  try{
    if(rid){
      // Удаляем связанные данные
      await sb.from('sklad_moves').delete().eq('order_num',rid);
      await sb.from('payroll_entries').delete().eq('order_num',rid);
      await sb.from('order_files').delete().eq('order_num',rid);
      skladLog=skladLog.filter(r=>r.order_num!==rid);
    }
    // Удаляем платежи по order_id и order_num
    await sb.from('payments').delete().eq('order_id',editId);
    if(rid) await sb.from('payments').delete().eq('order_num',rid);
    // Удаляем заказ
    const {error}=await sb.from('orders').delete().eq('id',editId);
    if(error) throw error;
    auditLog('delete','order',rid,{client:o?.client,status:o?.status,sum:o?.order_sum});
    const block=$('m-block'); if(block) block.classList.remove('open');
    closeOrder();
    await loadOrders();
    showToast('Заказ '+rid+' удалён');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── QUICK STATUS with material logic ──────────────────
const KP_STATUS = 'Отправлено КП';
const RESERVE_STATUSES = [KP_STATUS]; // статусы где материал в резерве
const WRITEOFF_STATUSES = ['Новый','Материал заказан','В работе','Готов к выдаче','Отгружен','Закрыт','Рекламация']; // материал списан
const RELEASE_STATUSES = ['Отказались']; // снять резерв

function getSpecMats(o){
  // Извлекает массив материалов из спецификации КП заказа
  try{
    const sp=JSON.parse(o.specification||'');
    if(sp&&sp.kp&&sp.mats) return sp.mats; // [{name,qty,price,...}]
  }catch(e){}
  return [];
}

function findSkladItemId(matName){
  // Найти item_id по названию материала
  const si=skladItems.find(i=>(i.name||'').toLowerCase()===(matName||'').toLowerCase());
  return si?si.item_id:null;
}

async function reserveMaterials(orderNum, mats){
  // Создаёт записи резерва на складе
  const moves=[];
  const warnings=[];
  for(const mat of mats){
    const itemId=findSkladItemId(mat.name);
    if(!itemId){warnings.push(mat.name+' — нет на складе');continue;}
    const stock=skladStock(itemId);
    if(stock<mat.qty) warnings.push(mat.name+': в наличии '+stock+', нужно '+mat.qty);
    moves.push({
      move_date:new Date().toISOString().split('T')[0],
      move_type:'reserve',
      item_id:itemId,
      qty:mat.qty,
      unit:'шт',
      price:0,
      order_num:orderNum,
      comment:'Резерв по КП'
    });
  }
  if(moves.length){
    const {error}=await sb.from('sklad_moves').insert(moves);
    if(error) console.error('Reserve error:',error);
    else skladLog.push(...moves);
  }
  return warnings;
}

async function convertReserveToOut(orderNum, mats){
  // Снимаем резерв и создаём расход
  // 1) Удаляем все reserve по этому заказу
  await sb.from('sklad_moves').delete().eq('order_num',orderNum).eq('move_type','reserve');
  // 2) Убираем из локального массива
  skladLog=skladLog.filter(r=>!(r.order_num===orderNum&&r.move_type==='reserve'));
  // 3) Создаём расход
  const moves=[];
  const warnings=[];
  for(const mat of mats){
    const itemId=findSkladItemId(mat.name);
    if(!itemId){warnings.push(mat.name+' — нет на складе, нужно заказать!');continue;}
    const stock=skladStock(itemId);
    if(stock<mat.qty) warnings.push('⚠ '+mat.name+': в наличии '+stock+', нужно '+mat.qty+' — ЗАКАЖИТЕ!');
    moves.push({
      move_date:new Date().toISOString().split('T')[0],
      move_type:'out',
      item_id:itemId,
      qty:mat.qty,
      unit:'шт',
      price:0,
      order_num:orderNum,
      comment:'Списание по заказу'
    });
  }
  if(moves.length){
    const {error}=await sb.from('sklad_moves').insert(moves);
    if(error) console.error('Write-off error:',error);
    else skladLog.push(...moves);
  }
  return warnings;
}

async function releaseReserve(orderNum){
  // Снимаем резерв (клиент отказался) — просто удаляем записи reserve
  await sb.from('sklad_moves').delete().eq('order_num',orderNum).eq('move_type','reserve');
  skladLog=skladLog.filter(r=>!(r.order_num===orderNum&&r.move_type==='reserve'));
}

async function addMaterialWarningToComment(orderId, orderNum, warnings){
  // Добавляет предупреждение о нехватке материала в комментарий заказа
  if(!warnings.length) return;
  const o=orders.find(x=>x.id===orderId);
  const oldComment=(o?o.comment:'') || '';
  // Убираем старые пометки о материалах
  const cleaned=oldComment.replace(/\n?🔴 ЗАКАЗАТЬ:.*$/s,'').trim();
  const tag='\n🔴 ЗАКАЗАТЬ: '+warnings.map(w=>w.replace(/^⚠\s*/,'')).join('; ');
  const newComment=(cleaned?cleaned+tag:tag.trim());
  await sb.from('orders').update({comment:newComment}).eq('id',orderId);
  if(o) o.comment=newComment;
}

async function clearMaterialWarningFromComment(orderId){
  // Убирает пометки о заказе материала из комментария
  const o=orders.find(x=>x.id===orderId);
  const oldComment=(o?o.comment:'') || '';
  const cleaned=oldComment.replace(/\n?🔴 ЗАКАЗАТЬ:.*$/s,'').trim();
  if(cleaned!==oldComment){
    await sb.from('orders').update({comment:cleaned}).eq('id',orderId);
    if(o) o.comment=cleaned;
  }
}

function checkMaterialsAvailable(mats){
  // Проверяет хватает ли материала на складе. Возвращает массив нехваток.
  // Учитываем текущие остатки (свободные = stock - уже зарезервированные другими)
  const shortages=[];
  for(const mat of mats){
    const itemId=findSkladItemId(mat.name);
    if(!itemId){
      shortages.push({name:mat.name, need:mat.qty, have:0, missing:mat.qty, noItem:true});
      continue;
    }
    const stock=skladStock(itemId);
    if(stock<mat.qty){
      shortages.push({name:mat.name, need:mat.qty, have:stock, missing:Math.ceil(mat.qty-stock), noItem:false});
    }
  }
  return shortages;
}

function showMaterialBlockModal(shortages, orderNum){
  // Показываем модалку с информацией о нехватке
  let html=`<div style="margin-bottom:14px;color:var(--red);font-weight:600;font-size:14px">⛔ Невозможно перевести в работу</div>`;
  html+=`<div style="font-size:13px;color:var(--text2);margin-bottom:14px">Не хватает материала на складе для заказа <b>${orderNum}</b>. Оформите приход на складе, затем смените статус.</div>`;
  html+=`<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
    <thead><tr>
      <th style="text-align:left;padding:6px 8px;background:var(--red-light);border:1px solid var(--border);color:var(--red)">Материал</th>
      <th style="width:70px;padding:6px 8px;background:var(--red-light);border:1px solid var(--border);text-align:center;color:var(--red)">Нужно</th>
      <th style="width:70px;padding:6px 8px;background:var(--red-light);border:1px solid var(--border);text-align:center;color:var(--red)">Есть</th>
      <th style="width:80px;padding:6px 8px;background:var(--red-light);border:1px solid var(--border);text-align:center;color:var(--red)">Не хватает</th>
    </tr></thead><tbody>`;
  shortages.forEach(s=>{
    html+=`<tr>
      <td style="padding:7px 8px;border:1px solid var(--border);font-weight:500">${s.name}${s.noItem?' <span style="color:var(--red);font-size:10px">(нет на складе)</span>':''}</td>
      <td style="padding:7px 8px;border:1px solid var(--border);text-align:center">${s.need}</td>
      <td style="padding:7px 8px;border:1px solid var(--border);text-align:center;color:${s.have>0?'var(--accent)':'var(--red)'}">${s.have}</td>
      <td style="padding:7px 8px;border:1px solid var(--border);text-align:center;color:var(--red);font-weight:600">${s.missing}</td>
    </tr>`;
  });
  html+=`</tbody></table>`;
  html+=`<div style="display:flex;gap:8px">
    <button class="btn btn-primary" onclick="showPage('sklad',document.querySelectorAll('.nav-item')[2]);document.getElementById('m-block').classList.remove('open')" style="flex:1;justify-content:center">Перейти на склад →</button>
    <button class="btn btn-ghost" onclick="document.getElementById('m-block').classList.remove('open')" style="flex:1;justify-content:center">Закрыть</button>
  </div>`;

  // Создаём или переиспользуем модалку
  let overlay=$('m-block');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.className='overlay';
    overlay.id='m-block';
    overlay.innerHTML=`<div class="modal" style="max-width:480px"><div class="modal-hd"><div class="modal-title">Нехватка материала</div><button class="modal-close" onclick="this.closest('.overlay').classList.remove('open')">×</button></div><div class="modal-body" id="m-block-body"></div></div>`;
    document.body.appendChild(overlay);
  }
  $('m-block-body').innerHTML=html;
  overlay.classList.add('open');
}

async function quickStatus(rid,newSt){
  const o=findO(rid); if(!o) return;
  const oldSt=(o.status||'').trim();

  // ── БЛОКИРОВКА: нельзя закрыть заказ если не оплачен полностью ──
  if(newSt==='Закрыт'){
    const sum=parseFloat(o.order_sum)||0;
    const paid=parseFloat(o.prepay)||0;
    if(sum>0 && paid<sum){
      const debt=sum-paid;
      let overlay=$('m-block');
      if(!overlay){
        overlay=document.createElement('div');
        overlay.className='overlay';
        overlay.id='m-block';
        overlay.innerHTML=`<div class="modal" style="max-width:480px"><div class="modal-hd"><div class="modal-title">Нехватка материала</div><button class="modal-close" onclick="this.closest('.overlay').classList.remove('open')">×</button></div><div class="modal-body" id="m-block-body"></div></div>`;
        document.body.appendChild(overlay);
      }
      $('m-block-body').innerHTML=`
        <div style="margin-bottom:14px;color:var(--red);font-weight:600;font-size:14px">⛔ Невозможно закрыть заказ</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Заказ <b>${rid}</b> не оплачен полностью. Внесите остаток оплаты перед закрытием.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px;text-align:center">
          <div style="background:var(--surface2);border-radius:var(--rs);padding:12px 8px">
            <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Сумма договора</div>
            <div style="font-size:17px;font-weight:600">${sum.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div style="background:var(--accent-light);border-radius:var(--rs);padding:12px 8px">
            <div style="font-size:10px;color:var(--accent-text);margin-bottom:4px">Оплачено</div>
            <div style="font-size:17px;font-weight:600;color:var(--accent-text)">${paid.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div style="background:var(--red-light);border-radius:var(--rs);padding:12px 8px">
            <div style="font-size:10px;color:var(--red);margin-bottom:4px">Остаток</div>
            <div style="font-size:17px;font-weight:600;color:var(--red)">${debt.toLocaleString('ru-RU')} ₽</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="document.getElementById('m-block').classList.remove('open');openPrepay('${rid}')" style="flex:1;justify-content:center">Внести оплату →</button>
          <button class="btn btn-ghost" onclick="document.getElementById('m-block').classList.remove('open')" style="flex:1;justify-content:center">Закрыть</button>
        </div>`;
      overlay.classList.add('open');
      render();
      return;
    }
  }

  // ── БЛОКИРОВКА: проверяем материалы по правилам из настроек ──
  const SKIP_CHECK_STATUSES=['Отказались','Приостановлен','Рекламация'];
  const mats=getSpecMats(o);
  const matRules=getMatCheckRules();
  const checkRule=SKIP_CHECK_STATUSES.includes(newSt)?'none':(matRules[newSt]||'none');
  
  if(mats.length>0 && checkRule!=='none'){
    await loadSkladSilent();
    
    let checkMats=mats;
    
    if(checkRule==='sheets'){
      // Проверяем только материалы с ключевыми словами из настроек
      const keywords=getMatKeywords();
      checkMats=mats.filter(m=>{
        const n=(m.name||'').toLowerCase();
        return keywords.some(k=>n.includes(k));
      });
    }
    // checkRule==='all' — проверяем все материалы (checkMats = mats)
    
    if(checkMats.length>0){
      const shortages=checkMaterialsAvailable(checkMats);
      if(shortages.length>0){
        showMaterialBlockModal(shortages, rid);
        const warnings=shortages.map(s=>'⚠ '+s.name+': есть '+s.have+', нужно '+s.need);
        await addMaterialWarningToComment(o.id, rid, warnings);
        render();
        return;
      }
    }
  }

  try{
    const {error}=await sb.from('orders').update({status:newSt}).eq('id',o.id);
    if(error) throw error;
    o.status=newSt;

    // Авто-отметка этапов при смене статуса
    try{await autoMarkStages(o, newSt)}catch(e){console.log('autoMarkStages error:',e)}

    // Логируем смену статуса + TG уведомление
    await logStatusChange(rid, oldSt, newSt);
    tgNotify('status_change',{order_num:rid,client:o.client,oldStatus:oldSt,newStatus:newSt});

    // Логика материалов по КП
    if(mats.length>0){
      const wasReserve=RESERVE_STATUSES.includes(oldSt);
      const wasWriteOff=WRITEOFF_STATUSES.includes(oldSt);
      const nowWriteOff=WRITEOFF_STATUSES.includes(newSt);
      const nowRelease=RELEASE_STATUSES.includes(newSt);

      if(nowRelease && wasReserve){
        await releaseReserve(rid);
        await clearMaterialWarningFromComment(o.id);
        showToast('Статус: '+newSt+' — резерв снят');
      } else if(nowRelease && wasWriteOff){
        const moves=[];
        for(const mat of mats){
          const itemId=findSkladItemId(mat.name);
          if(!itemId) continue;
          moves.push({
            move_date:new Date().toISOString().split('T')[0],
            move_type:'in', item_id:itemId, qty:mat.qty, unit:'шт',
            price:0, order_num:rid, comment:'Возврат — клиент отказался'
          });
        }
        if(moves.length){
          await sb.from('sklad_moves').insert(moves);
          skladLog.push(...moves);
        }
        await clearMaterialWarningFromComment(o.id);
        showToast('Статус: '+newSt+' — материал возвращён на склад');
      } else if(nowWriteOff && (wasReserve || (!wasReserve && !wasWriteOff))){
        // Материал уже проверен выше — точно хватает
        const warnings=await convertReserveToOut(rid, mats);
        await clearMaterialWarningFromComment(o.id);
        showToast('Статус: '+newSt+' — материал списан');
      } else {
        showToast('Статус: '+newSt);
      }
    } else {
      showToast('Статус: '+newSt);
    }

    updateStats(); render();
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── COMMENT ───────────────────────────────────────────
function openComment(rid){
  commentId=rid;
  const o=findO(rid);
  $('mc-title').textContent='Комментарий — '+rid;
  $('mc-text').value=o?(o.comment||''):'';
  $('m-comment').classList.add('open');
}
function closeComment(){ $('m-comment').classList.remove('open'); commentId=null }
async function saveComment(){
  const o=findO(commentId); if(!o) return;
  const txt=$('mc-text').value;
  try{
    const {error}=await sb.from('orders').update({comment:txt}).eq('id',o.id);
    if(error) throw error;
    o.comment=txt; render(); closeComment(); showToast('Комментарий сохранён');
  }catch(e){ showToast('Ошибка') }
}

// ── DESCRIPTION ───────────────────────────────────────
let descId=null;
function openDesc(rid){
  descId=rid;
  const o=findO(rid);
  $('md-title').textContent='Описание — '+rid;
  $('md-text').value=o?(o.description||''):'';
  $('m-desc').classList.add('open');
}
function closeDesc(){ $('m-desc').classList.remove('open'); descId=null }
async function saveDesc(){
  const o=findO(descId); if(!o) return;
  const txt=$('md-text').value;
  try{
    const {error}=await sb.from('orders').update({description:txt}).eq('id',o.id);
    if(error) throw error;
    o.description=txt; render(); closeDesc(); showToast('Описание сохранено');
  }catch(e){ showToast('Ошибка') }
}

// ── PREPAY ────────────────────────────────────────────
let prepayMode='add';
function setPrepayMode(mode){
  prepayMode=mode;
  $('mp-btn-add').style.background=mode==='add'?'var(--accent-light)':'';
  $('mp-btn-add').style.color=mode==='add'?'var(--accent-text)':'';
  $('mp-btn-sub').style.background=mode==='sub'?'var(--red-light)':'';
  $('mp-btn-sub').style.color=mode==='sub'?'var(--red)':'';
  $('mp-input-label').textContent=mode==='add'?'Добавить сумму (₽)':'Вычесть сумму (₽)';
  $('mp-add').value='';
  previewPrepay();
}
function openPrepay(rid){
  prepayId=rid; prepayMode='add';
  const o=findO(rid); if(!o) return;
  const sum=parseFloat(o.order_sum)||0, paid=parseFloat(o.prepay)||0;
  $('mp-title').textContent='Оплата — '+rid;
  $('mp-sum').textContent=sum.toLocaleString('ru-RU')+' ₽';
  $('mp-paid').textContent=paid.toLocaleString('ru-RU')+' ₽';
  $('mp-rest').textContent=Math.max(0,sum-paid).toLocaleString('ru-RU')+' ₽';
  $('mp-add').value='';
  $('mp-new').textContent=paid.toLocaleString('ru-RU')+' ₽';
  $('mp-warn').style.display='none';
  $('mp-btn-add').style.background='var(--accent-light)';
  $('mp-btn-add').style.color='var(--accent-text)';
  $('mp-btn-sub').style.background=''; $('mp-btn-sub').style.color='';
  $('mp-input-label').textContent='Добавить сумму (₽)';
  $('mp-date').value=new Date().toISOString().split('T')[0];
  $('mp-note').value='';
  $('m-prepay').classList.add('open');
  // Загружаем историю платежей
  loadPaymentHistory(rid,o.id);
}
function closePrepay(){ $('m-prepay').classList.remove('open'); prepayId=null }
function previewPrepay(){
  const o=findO(prepayId); if(!o) return;
  const sum=parseFloat(o.order_sum)||0, paid=parseFloat(o.prepay)||0;
  const delta=parseFloat($('mp-add').value)||0;
  const newVal=prepayMode==='add'?paid+delta:paid-delta;
  const clamped=Math.min(Math.max(0,newVal),sum>0?sum:Infinity);
  $('mp-new').textContent=clamped.toLocaleString('ru-RU')+' ₽';
  if(sum>0&&newVal>sum){$('mp-warn').style.display='inline';$('mp-save-btn').disabled=true;}
  else{$('mp-warn').style.display='none';$('mp-save-btn').disabled=false;}
}
async function savePrepay(){
  const o=findO(prepayId); if(!o) return;
  const delta=parseFloat($('mp-add').value)||0;
  if(delta<=0){showToast('Введите сумму');return}
  const sum=parseFloat(o.order_sum)||0, paid=parseFloat(o.prepay)||0;
  let newPrepay=prepayMode==='add'?paid+delta:paid-delta;
  newPrepay=Math.max(0,newPrepay);
  if(sum>0&&newPrepay>sum){showToast('Сумма превышает договор');return}
  const newDopay=sum>0?Math.max(0,sum-newPrepay):0;
  const payDate=$('mp-date')?.value||new Date().toISOString().split('T')[0];
  const note=$('mp-note')?.value||'';
  try{
    // Записываем платёж в таблицу payments
    await sb.from('payments').insert({
      order_id:o.id,
      order_num:o.order_num,
      amount:prepayMode==='add'?delta:-delta,
      payment_date:payDate,
      note:note
    });
    // Обновляем prepay в заказе
    const {error}=await sb.from('orders').update({prepay:newPrepay,dopay:newDopay}).eq('id',o.id);
    if(error) throw error;
    o.prepay=newPrepay; o.dopay=newDopay;
    if(prepayMode==='add'){
      tgNotify('payment',{order_num:o.order_num,client:o.client,amount:delta.toLocaleString('ru-RU'),total:newPrepay.toLocaleString('ru-RU'),sum:sum?sum.toLocaleString('ru-RU'):'—'});
    }
    auditLog('payment','order',o.order_num,{amount:prepayMode==='add'?delta:-delta,total:newPrepay,note});
    closePrepay(); render(); updateStats(); showToast('Оплата обновлена');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

async function loadPaymentHistory(orderNum,orderId){
  const hist=$('mp-history');
  if(!hist) return;
  hist.innerHTML='<div style="font-size:11px;color:var(--text3)">Загрузка...</div>';
  try{
    const {data}=await sb.from('payments').select('*').eq('order_num',orderNum).order('payment_date',{ascending:false});
    if(!data||!data.length){
      hist.innerHTML='<div style="font-size:11px;color:var(--text3);text-align:center">Нет истории платежей</div>';
      return;
    }
    let h='<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px">История платежей</div>';
    data.forEach(p=>{
      const d=new Date(p.payment_date);
      const amt=parseFloat(p.amount)||0;
      const isPlus=amt>0;
      h+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text3);min-width:55px">${d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
        <span style="flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.note||''}</span>
        <span style="font-weight:600;color:${isPlus?'var(--accent-text)':'var(--red)'}">${isPlus?'+':''}${amt.toLocaleString('ru-RU')} ₽</span>
      </div>`;
    });
    hist.innerHTML=h;
  }catch(e){hist.innerHTML=''}
}

