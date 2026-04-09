// ══════════════════════════════════════════════════════
// СКЛАД (Supabase)
// ══════════════════════════════════════════════════════
let skladItems=[], skladLog=[], skladMoveType='in', editSkladId=null;
let matTypes=[];
const MOVE_LABELS={in:'Приход',out:'Расход',reserve:'Резерв',scrap:'Обрезок'};
const MOVE_COLORS={in:'var(--accent)',out:'var(--red)',reserve:'var(--amber)',scrap:'var(--text3)'};
const treeOpen={groups:{},subs:{}};
let currentSkladTab='stock';

async function loadSklad(){
  try{
    const [iRes,mRes,tRes]=await Promise.all([
      sb.from('sklad_items').select('*').order('name'),
      sb.from('sklad_moves').select('*').order('id'),
      sb.from('material_types').select('*').order('sort_order')
    ]);
    if(iRes.error) throw iRes.error;
    if(mRes.error) throw mRes.error;
    skladItems=iRes.data||[];
    skladLog=mRes.data||[];
    matTypes=tRes.data||[];
    // Авто-объединение дубликатов
    await autoMergeSkladDuplicates();
    fillMatTypeSelects();
    renderSkladKpi();
    renderSkladCards();
    renderSkladBase();
    renderSkladLog();
    fillSkladMatFilter();
    fillOrdersDatalist();
  }catch(e){
    $('sklad-cards').innerHTML='<div class="empty-state">Ошибка: '+e.message+'</div>';
  }
}

async function autoMergeSkladDuplicates(){
  // Находим дубликаты по точному имени
  const byName={};
  skladItems.forEach(i=>{
    const n=(i.name||'').trim().toLowerCase();
    if(!byName[n]) byName[n]=[];
    byName[n].push(i);
  });
  
  for(const [name,items] of Object.entries(byName)){
    if(items.length<2) continue;
    // Оставляем НЕ-pending позицию (предпочтительно), остальные вливаем
    items.sort((a,b)=>{
      const ap=String(a.item_id||'').startsWith('pending_')?1:0;
      const bp=String(b.item_id||'').startsWith('pending_')?1:0;
      return ap-bp;
    });
    const keep=items[0];
    for(let j=1;j<items.length;j++){
      const dup=items[j];
      try{
        // Переносим движения
        await sb.from('sklad_moves').update({item_id:keep.item_id}).eq('item_id',dup.item_id);
        // Удаляем дубль
        await sb.from('sklad_items').delete().eq('id',dup.id);
        console.log('Auto-merged sklad: "'+dup.name+'" → "'+keep.name+'"');
      }catch(e){console.log('Auto-merge error:',e)}
    }
  }
  
  // Перезагружаем если были мерджи
  const totalDups=Object.values(byName).filter(a=>a.length>1).length;
  if(totalDups>0){
    const {data:iData}=await sb.from('sklad_items').select('*').order('name');
    const {data:mData}=await sb.from('sklad_moves').select('*').order('id');
    if(iData) skladItems=iData;
    if(mData) skladLog=mData;
    showToast('🔗 Объединено '+totalDups+' дубликат(ов) на складе');
  }
}

function skladStock(itemId){
  const sid=String(itemId).trim().toLowerCase();
  let total=0;
  skladLog.forEach(r=>{
    const pos=String(r.item_id||'').trim().toLowerCase();
    if(pos!==sid) return;
    const q=parseFloat(r.qty)||0;
    const t=String(r.move_type||'').trim();
    if(t==='in'||t==='scrap_return') total+=q;
    else if(t==='out'||t==='reserve'||t==='scrap') total-=q;
  });
  return Math.max(0,Math.round(total*100)/100);
}

function setSkladTab(tab,el){
  currentSkladTab=tab;
  document.querySelectorAll('#page-sklad .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  $('sklad-tab-stock').style.display=tab==='stock'?'':'none';
  $('sklad-tab-base').style.display=tab==='base'?'':'none';
  $('sklad-tab-log').style.display=tab==='log'?'':'none';
  const addBtn=$('btn-sklad-add-item');
  if(addBtn) addBtn.style.display=tab==='base'?'':'none';
  const grpBtn=$('btn-sklad-add-group');
  if(grpBtn) grpBtn.style.display=tab==='base'?'':'none';
  if(tab==='base') renderSkladBase();
  if(tab==='log') renderSkladLog();
}

function renderSkladKpi(){
  const kpi=$('sklad-kpi');
  if(!kpi) return;
  
  // Считаем статистику
  let totalPositions=0, totalStock=0, totalValue=0, lowCount=0, emptyCount=0, pendingCount=0;
  
  skladItems.forEach(item=>{
    const isPending=String(item.item_id||'').startsWith('pending_');
    if(isPending){pendingCount++;return}
    if(!(item.name||'').trim()) return;
    totalPositions++;
    const stock=skladStock(item.item_id);
    const price=parseFloat(item.buy_price)||0;
    const min=parseFloat(item.min_stock)||0;
    totalStock+=stock;
    totalValue+=stock*price;
    if(stock<=0) emptyCount++;
    else if(min>0&&stock<=min) lowCount++;
  });
  
  kpi.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:8px 10px;text-align:center">
      <div style="font-size:9px;color:var(--text3)">Позиций</div>
      <div style="font-size:15px;font-weight:600">${totalPositions}</div>
    </div>
    <div style="background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--rs);padding:8px 10px;text-align:center">
      <div style="font-size:9px;color:var(--accent-text)">В наличии на складе</div>
      <div style="font-size:14px;font-weight:700;color:var(--accent-text)">${totalValue?Math.round(totalValue).toLocaleString('ru-RU')+' ₽':'0 ₽'}</div>
    </div>
    ${lowCount?`<div style="background:var(--amber-light);border:1px solid var(--amber);border-radius:var(--rs);padding:8px 10px;text-align:center;cursor:pointer" onclick="$('sklad-sort').value='alert';renderSkladCards()">
      <div style="font-size:9px;color:var(--amber)">Заканчивается</div>
      <div style="font-size:15px;font-weight:600;color:var(--amber)">${lowCount}</div>
    </div>`:''}
    ${emptyCount?`<div style="background:var(--red-light);border:1px solid var(--red);border-radius:var(--rs);padding:8px 10px;text-align:center;cursor:pointer" onclick="$('sklad-sort').value='alert';renderSkladCards()">
      <div style="font-size:9px;color:var(--red)">Нет в наличии</div>
      <div style="font-size:15px;font-weight:600;color:var(--red)">${emptyCount}</div>
    </div>`:''}
    ${!lowCount&&!emptyCount?`<div style="background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--rs);padding:8px 10px;text-align:center">
      <div style="font-size:9px;color:var(--accent-text)">Статус</div>
      <div style="font-size:12px;font-weight:600;color:var(--accent-text)">✓ Всё в норме</div>
    </div>`:''}
  `;
  
  // Ожидают оформления
  const bar=$('sklad-pending-bar');
  if(!bar) return;
  if(pendingCount>0){
    bar.style.display='';
    bar.innerHTML=`<div style="background:var(--amber-light);border:1px solid var(--amber);border-radius:var(--rs);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:pointer" onclick="setSkladTab('base',document.getElementById('stab-base'))">
      <span style="font-size:12px;color:var(--amber);font-weight:500">📦 Ожидают оформления: <b>${pendingCount}</b> позиций</span>
      <span style="font-size:11px;color:var(--amber)">Перейти →</span>
    </div>`;
  } else {
    bar.style.display='none';
    bar.innerHTML='';
  }
}

function renderSkladCards(){
  const container=$('sklad-cards');
  const q=($('sklad-search')?.value||'').toLowerCase().trim();
  const groupFilter=$('sklad-filter-group')?.value||'';
  const sort=$('sklad-sort')?.value||'alert';

  let items=skladItems
    .filter(item=>(item.name||'').trim())
    .filter(item=>!q||(item.name||'').toLowerCase().includes(q))
    .filter(item=>!groupFilter||(item.type||'').toLowerCase()===groupFilter)
    .map(item=>{
      const stock=skladStock(item.item_id);
      const min=parseFloat(item.min_stock)||0;
      return {...item,_stock:stock,_min:min,_isEmpty:stock<=0,_isLow:stock>0&&min>0&&stock<=min};
    })
    .filter(item=>item._stock>0);

  if(!items.length){container.innerHTML=`<div class="empty-state">${q||groupFilter?'Ничего не найдено':'Нет материалов в наличии'}</div>`;return;}

  items.sort((a,b)=>{
    if(sort==='alert'){const pa=a._isEmpty?0:a._isLow?1:2,pb=b._isEmpty?0:b._isLow?1:2;if(pa!==pb)return pa-pb;return(a.name||'').localeCompare(b.name||'','ru');}
    if(sort==='name') return(a.name||'').localeCompare(b.name||'','ru');
    if(sort==='stock-asc') return a._stock-b._stock;
    if(sort==='stock-desc') return b._stock-a._stock;
    return 0;
  });

  const GROUP_ORDER=matTypes.map(t=>t.name);
  const tree={};
  items.forEach(item=>{
    const g=(item.type||'прочее').toLowerCase().trim();
    const words=(item.name||'').trim().split(' ');
    const sub=words.slice(0,2).join(' ');
    if(!tree[g])tree[g]={};if(!tree[g][sub])tree[g][sub]=[];
    tree[g][sub].push(item);
  });

  const GROUP_COLORS={'лист':'#854F0B','кромка':'#185FA5','фурнитура':'#534AB7'};
  const allGroups=[...GROUP_ORDER,...Object.keys(tree).filter(g=>!GROUP_ORDER.includes(g))];
  let html='';
  allGroups.forEach(g=>{
    if(!tree[g]) return;
    const subs=tree[g];
    const allItems=Object.values(subs).flat();
    const alerts=allItems.filter(i=>i._isEmpty||i._isLow).length;
    const gLabel=getTypeLabel(g);
    const gIcon=getTypeIcon(g);
    const gColor=GROUP_COLORS[g]||matTypes.find(t=>t.name===g)?.color||'#6b6a64';
    const gValue=allItems.reduce((s,i)=>s+(i._stock*(parseFloat(i.buy_price)||0)),0);
    const gKey='g_'+g;
    if(!(gKey in treeOpen.groups)) treeOpen.groups[gKey]=true;
    const gOpen=treeOpen.groups[gKey];

    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px;overflow:hidden">
      <div onclick="toggleTree('group','${gKey}',this)" style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;background:${gColor}10;border-bottom:${gOpen?'1px solid var(--border)':'none'};transition:all 0.15s">
        <span style="font-size:20px">${gIcon}</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;color:var(--text)">${gLabel.replace(gIcon,'').trim()}</div>
          <div style="font-size:11px;color:var(--text3)">${allItems.length} в наличии${alerts?' · <span style="color:var(--red)">'+alerts+' заканчивается</span>':''}${gValue?' · <span style="color:var(--accent-text)">'+Math.round(gValue).toLocaleString('ru-RU')+' ₽</span>':''}</div>
        </div>
        <span class="tree-arrow" style="font-size:12px;color:var(--text3);transition:transform 0.2s;${gOpen?'transform:rotate(90deg)':''}">▶</span>
      </div>
      <div class="tree-group-body${gOpen?' open':''}" style="padding:${gOpen?'4px 8px 8px':'0 8px'}">`;
    const subKeys=Object.keys(subs);
    subKeys.forEach((sub,si)=>{
      const subItems=subs[sub];
      const sKey='s_'+g+'_'+si;
      if(!(sKey in treeOpen.subs)) treeOpen.subs[sKey]=true;
      const sOpen=treeOpen.subs[sKey];
      const useSubGroup=subKeys.length>1||subItems.length>3;
      if(useSubGroup){
        html+=`<div style="margin-top:6px"><div onclick="toggleTree('sub','${sKey}',this)" style="display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;border-radius:var(--rs);background:var(--surface2)"><span class="tree-arrow" style="font-size:10px;color:var(--text3);transition:transform 0.2s;${sOpen?'transform:rotate(90deg)':''}">▶</span><span style="font-size:12px;font-weight:500;flex:1;color:var(--text2)">${sub}</span><span style="font-size:11px;color:var(--text3)">${subItems.length}</span></div><div class="tree-sub-body${sOpen?' open':''}">`;
      } else { html+=`<div><div class="tree-sub-body open">`; }
      subItems.forEach(item=>{
        const iid=(item.item_id||'').replace(/'/g,"\\'");
        const color=item._isEmpty?'var(--red)':item._isLow?'var(--amber)':'var(--accent-text)';
        const bg=item._isEmpty?'background:var(--red-light);':item._isLow?'background:var(--amber-light);':'background:var(--surface);';
        const price=parseFloat(item.buy_price)||0;
        const itemValue=price*item._stock;
        html+=`<div style="display:flex;gap:6px;align-items:center;${bg}border:1px solid var(--border);border-radius:var(--rs);padding:6px 10px;margin-top:4px">
          ${item._isEmpty||item._isLow?`<span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>`:''}
          <span style="font-size:12px;flex:1;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name||'—'}</span>
          <span style="font-size:12px;font-weight:700;color:${color};min-width:28px;text-align:right">${item._stock}</span>
          <span style="font-size:10px;color:var(--text3)">${item.unit||'шт'}</span>
          ${price?`<span style="font-size:9px;color:var(--text3)">×${price.toLocaleString('ru-RU')}</span>`:''}
          ${itemValue?`<span style="font-size:10px;font-weight:500;color:var(--accent-text);min-width:50px;text-align:right">${Math.round(itemValue).toLocaleString('ru-RU')}₽</span>`:''}
          <button onclick="openSkladMove('in','${iid}')" style="background:var(--accent-light);color:var(--accent-text);border:none;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600;font-family:'Geologica',sans-serif">+</button>
          <button onclick="openSkladMove('out','${iid}')" style="background:var(--red-light);color:var(--red);border:none;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600;font-family:'Geologica',sans-serif">−</button>
        </div>`;
      });
      html+=`</div></div>`;
    });
    html+=`</div></div>`;
  });
  container.innerHTML=html;
}

function renderSkladBase(){
  const container=$('sklad-base-tree'); if(!container) return;
  const q=($('sklad-base-search')?.value||'').toLowerCase().trim();
  const typeFilter=$('sklad-base-filter')?.value||'';
  // Сортируем: pending сверху, потом по алфавиту
  let items=skladItems.filter(i=>(i.name||'').trim()).filter(i=>!q||(i.name||'').toLowerCase().includes(q)).filter(i=>!typeFilter||(i.type||'').toLowerCase()===typeFilter).sort((a,b)=>{
    const ap=String(a.item_id||'').startsWith('pending_')?0:1;
    const bp=String(b.item_id||'').startsWith('pending_')?0:1;
    if(ap!==bp) return ap-bp;
    return(a.name||'').localeCompare(b.name||'','ru');
  });
  if(!items.length){container.innerHTML='<div class="empty-state">Позиций не найдено</div>';return;}

  // Считаем pending
  const pendingItems=items.filter(i=>String(i.item_id||'').startsWith('pending_'));
  const normalItems=items.filter(i=>!String(i.item_id||'').startsWith('pending_'));
  let html='';

  // Секция pending — отдельно сверху
  if(pendingItems.length){
    html+=`<div style="background:var(--amber-light);border:2px solid rgba(133,79,11,0.25);border-radius:var(--r);padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:18px">⏳</span>
        <span style="font-size:13px;color:var(--amber);font-weight:600">Ожидают оформления (${pendingItems.length})</span>
      </div>`;
    pendingItems.forEach(item=>{
      const price=parseFloat(item.buy_price)||0;
      html+=`<div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.6);border:1px solid rgba(133,79,11,0.15);border-radius:var(--rs);padding:6px 10px;margin-bottom:4px">
        <span style="font-size:12px;flex:1;font-weight:500;color:var(--text)">${item.name||'—'}</span>
        <span style="font-size:11px;color:var(--text3)">${item.type||'—'}</span>
        ${price?`<span style="font-size:11px;color:var(--text2)">${price.toLocaleString('ru-RU')} ₽</span>`:''}
        <button onclick='openSkladItem(${JSON.stringify(item).replace(/'/g,"&#39;")})' style="background:var(--amber);color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;font-family:'Geologica',sans-serif;font-weight:500">✓ Оформить</button>
      </div>`;
    });
    html+=`</div>`;
  }

  // Обычные группы — только нормальные позиции
  const GROUP_ORDER=matTypes.map(t=>t.name);
  const tree={};
  normalItems.forEach(item=>{const g=(item.type||'прочее').toLowerCase().trim();if(!tree[g])tree[g]=[];tree[g].push(item);});
  const GROUP_COLORS={'лист':'#854F0B','кромка':'#185FA5','фурнитура':'#534AB7'};
  const allGroups=[...GROUP_ORDER,...Object.keys(tree).filter(g=>!GROUP_ORDER.includes(g))];
  allGroups.forEach(g=>{
    if(!tree[g]) return;
    const gLabel=getTypeLabel(g);
    const gIcon=getTypeIcon(g);
    const gColor=GROUP_COLORS[g]||matTypes.find(t=>t.name===g)?.color||'#6b6a64';
    const gKey='base_g_'+g;
    if(!(gKey in treeOpen.groups)) treeOpen.groups[gKey]=true;
    const gOpen=treeOpen.groups[gKey];
    const count=tree[g].length;
    const lowCount=tree[g].filter(i=>{const s=skladStock(i.item_id);const m=parseFloat(i.min_stock)||0;return m>0&&s<=m}).length;

    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:10px;overflow:hidden">
      <div onclick="toggleTree('group','${gKey}',this)" style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;background:${gColor}10;border-bottom:${gOpen?'1px solid var(--border)':'none'};transition:all 0.15s">
        <span style="font-size:20px">${gIcon}</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;color:var(--text)">${gLabel.replace(gIcon,'').trim()}</div>
          <div style="font-size:11px;color:var(--text3)">${count} позиций${lowCount?' · <span style="color:var(--red)">'+lowCount+' заканчивается</span>':''}</div>
        </div>
        <span class="tree-arrow" style="font-size:12px;color:var(--text3);transition:transform 0.2s;${gOpen?'transform:rotate(90deg)':''}">▶</span>
      </div>
      <div class="tree-group-body${gOpen?' open':''}" style="padding:${gOpen?'4px 8px 8px':'0 8px'}">`;
    tree[g].forEach(item=>{
      const iid=item.item_id||'';
      const isPending=iid.startsWith('pending_');
      const stock=skladStock(iid);
      const min=parseFloat(item.min_stock)||0;
      const isEmpty=stock<=0, isLow=!isEmpty&&min>0&&stock<=min;
      const color=isEmpty?'var(--red)':isLow?'var(--amber)':'var(--text3)';
      const price=parseFloat(item.buy_price)||0;
      const itemValue=price*stock;
      const bg=isPending?'background:var(--amber-light);':isEmpty?'background:var(--red-light);':'background:var(--surface);';
      html+=`<div style="display:flex;gap:6px;align-items:center;${bg}border:1px solid var(--border);border-radius:var(--rs);padding:6px 10px;margin-top:4px">
        ${isPending?'<span style="font-size:12px" title="Ожидает подтверждения">⏳</span>':''}
        <span style="font-size:12px;flex:1;font-weight:${isEmpty||isPending?'500':'400'};color:${isEmpty?'var(--red)':'var(--text)'};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name||'—'}</span>
        <span style="font-size:12px;font-weight:700;color:${color};min-width:28px;text-align:right">${isEmpty?'0':stock}</span>
        <span style="font-size:10px;color:var(--text3)">${item.unit||'шт'}</span>
        ${price?`<span style="font-size:9px;color:var(--text3)">×${price.toLocaleString('ru-RU')}</span>`:''}
        ${itemValue?`<span style="font-size:10px;font-weight:500;color:var(--accent-text);min-width:50px;text-align:right">${Math.round(itemValue).toLocaleString('ru-RU')}₽</span>`:''}
        <button onclick='openSkladItem(${JSON.stringify(item).replace(/'/g,"&#39;")})' style="background:${isPending?'var(--amber)':'var(--surface2)'};color:${isPending?'#fff':'var(--text2)'};border:1px solid ${isPending?'var(--amber)':'var(--border)'};border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;font-family:'Geologica',sans-serif;font-weight:${isPending?'600':'400'}">${isPending?'✓ Оформить':'Изм.'}</button>
      </div>`;
    });
    html+=`</div></div>`;
  });
  container.innerHTML=html;
}

function toggleTree(type,key,el){
  if(type==='group'){treeOpen.groups[key]=!treeOpen.groups[key];const body=el.nextElementSibling;el.classList.toggle('open',treeOpen.groups[key]);body.classList.toggle('open',treeOpen.groups[key]);}
  else{treeOpen.subs[key]=!treeOpen.subs[key];const body=el.nextElementSibling;el.classList.toggle('open',treeOpen.subs[key]);body.classList.toggle('open',treeOpen.subs[key]);}
}

function renderSkladLog(){
  const filterType=$('sklad-filter-type')?.value||'';
  const filterMat=$('sklad-filter-mat')?.value||'';
  const fromVal=$('sklad-log-from')?.value||'';
  const toVal=$('sklad-log-to')?.value||'';
  const q=($('sklad-log-search')?.value||'').toLowerCase().trim();
  const from=fromVal?new Date(fromVal):null;
  const to=toVal?new Date(toVal+'T23:59:59'):null;
  // Хелпер: найти название материала по item_id
  const matName=iid=>{const it=skladItems.find(i=>i.item_id===iid);return it?it.name:iid;};
  let list=skladLog.slice().reverse();
  if(filterType) list=list.filter(r=>r.move_type===filterType);
  if(filterMat) list=list.filter(r=>(r.item_id||'').trim()===filterMat);
  if(from) list=list.filter(r=>{const d=new Date(r.move_date);return d>=from;});
  if(to) list=list.filter(r=>{const d=new Date(r.move_date);return d<=to;});
  if(q) list=list.filter(r=>{
    const name=matName(r.item_id||'').toLowerCase();
    const orderNum=String(r.order_num||'').toLowerCase();
    const comment=String(r.comment||'').toLowerCase();
    const typeLabel=(MOVE_LABELS[r.move_type]||r.move_type||'').toLowerCase();
    return name.includes(q)||
      (r.item_id||'').toLowerCase().includes(q)||
      orderNum.includes(q)||
      comment.includes(q)||
      typeLabel.includes(q);
  });
  if(!list.length){$('sklad-log').innerHTML='<div class="empty-state">Движений нет</div>';return;}
  let h=`<table><thead><tr><th>Дата</th><th>Операция</th><th>Материал</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th>Заказ</th><th>Комментарий</th></tr></thead><tbody>`;
  list.forEach(r=>{
    const t=(r.move_type||'').trim();
    const lbl=MOVE_LABELS[t]||t;
    const color=MOVE_COLORS[t]||'var(--text2)';
    const qty=parseFloat(r.qty)||0;
    const sign=(t==='in'||t==='scrap_return')?'+':'−';
    const d=r.move_date?new Date(r.move_date).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    const price=parseFloat(r.price)||0;
    const name=matName(r.item_id||'');
    h+=`<tr><td style="color:var(--text3);font-size:11px;white-space:nowrap">${d}</td><td><span style="background:${MOVE_COLORS[t]+'22'||'#eee'};color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${lbl}</span></td><td style="font-size:12px">${name||'—'}</td><td style="font-weight:600;color:${color}">${sign}${qty}</td><td style="font-size:11px;color:var(--text3)">${r.unit||''}</td><td style="font-size:11px;color:var(--text2)">${price?price.toLocaleString('ru-RU')+' ₽':'—'}</td><td style="font-size:11px;color:var(--blue)">${r.order_num||'—'}</td><td style="font-size:11px;color:var(--text2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.comment||''}</td></tr>`;
  });
  h+='</tbody></table>';
  $('sklad-log').innerHTML=h;
}

function fillSkladMatFilter(){
  const sel=$('sklad-filter-mat'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Все материалы</option>';
  skladItems.forEach(item=>{
    const opt=document.createElement('option');
    opt.value=item.item_id; opt.textContent=item.name||item.item_id;
    if(item.item_id===cur) opt.selected=true;
    sel.appendChild(opt);
  });
}

function fillOrdersDatalist(){
  const dl=$('cl-orders'); if(!dl) return;
  dl.innerHTML=orders.map(o=>`<option value="${o.order_num||''}">${o.order_num||''}${o.client?' — '+o.client:''}</option>`).join('');
}

// ── MATERIAL TYPES (группы) ───────────────────────────
function getTypeLabel(typeName){
  const t=matTypes.find(t=>t.name===typeName);
  return t?(t.icon+' '+t.name.charAt(0).toUpperCase()+t.name.slice(1)):('📦 '+typeName);
}

function getTypeIcon(typeName){
  const t=matTypes.find(t=>t.name===typeName);
  return t?t.icon:'📦';
}

function fillMatTypeSelects(){
  // Заполняем все select-ы типов динамически
  const opts=matTypes.map(t=>`<option value="${t.name}">${t.icon} ${t.name}</option>`).join('');
  // Фильтр на вкладке "В наличии"
  const fg=$('sklad-filter-group');
  if(fg){const cur=fg.value;fg.innerHTML='<option value="">Все типы</option>'+opts;fg.value=cur}
  // Фильтр на вкладке "База"
  const bf=$('sklad-base-filter');
  if(bf){const cur=bf.value;bf.innerHTML='<option value="">Все типы</option>'+opts;bf.value=cur}
  // Select в модалке позиции
  const si=$('si-type');
  if(si){const cur=si.value;si.innerHTML=opts||'<option value="лист">Лист</option>';if(cur)si.value=cur}
}

function openMatTypes(){
  renderMatTypesList();
  $('m-mat-types').classList.add('open');
}

function renderMatTypesList(){
  const el=$('mat-types-list');
  if(!matTypes.length){el.innerHTML='<div style="color:var(--text3);font-size:13px">Нет групп</div>';return}
  el.innerHTML=matTypes.map((t,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:18px;width:28px;text-align:center">${t.icon}</span>
    <span style="flex:1;font-size:13px;font-weight:500">${t.name}</span>
    <span style="font-size:11px;color:var(--text3)">${skladItems.filter(si=>(si.type||'')==t.name).length} поз.</span>
    <button onclick="moveMatType(${t.id},-1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 6px;cursor:pointer;font-size:11px;color:var(--text3)">↑</button>
    <button onclick="moveMatType(${t.id},1)" style="background:none;border:1px solid var(--border);border-radius:4px;padding:1px 6px;cursor:pointer;font-size:11px;color:var(--text3)">↓</button>
    <button onclick="removeMatType(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px">×</button>
  </div>`).join('');
}

async function addMatType(){
  const name=$('mt-new-name').value.trim().toLowerCase();
  const icon=$('mt-new-icon').value.trim()||'📦';
  if(!name){showToast('Укажите название');return}
  if(matTypes.find(t=>t.name===name)){showToast('Такая группа уже есть');return}
  const sortOrder=matTypes.length?Math.max(...matTypes.map(t=>t.sort_order||0))+1:1;
  try{
    const {data,error}=await sb.from('material_types').insert({name,icon,sort_order:sortOrder}).select();
    if(error) throw error;
    if(data&&data[0]) matTypes.push(data[0]);
    $('mt-new-name').value=''; $('mt-new-icon').value='';
    fillMatTypeSelects();
    renderMatTypesList();
    renderSkladBase(); renderSkladCards();
    showToast('Группа "'+name+'" добавлена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function removeMatType(id){
  const t=matTypes.find(x=>x.id===id);
  if(!t) return;
  const count=skladItems.filter(si=>(si.type||'')==t.name).length;
  if(count>0){showToast('В группе "'+t.name+'" есть '+count+' позиций — сначала переместите их');return}
  if(!confirm('Удалить группу "'+t.name+'"?')) return;
  try{
    await sb.from('material_types').delete().eq('id',id);
    matTypes=matTypes.filter(x=>x.id!==id);
    fillMatTypeSelects();
    renderMatTypesList();
    showToast('Группа удалена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function moveMatType(id,dir){
  const idx=matTypes.findIndex(x=>x.id===id);
  if(idx<0) return;
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=matTypes.length) return;
  // Меняем местами sort_order
  const a=matTypes[idx], b=matTypes[newIdx];
  const tmpSort=a.sort_order; a.sort_order=b.sort_order; b.sort_order=tmpSort;
  [matTypes[idx],matTypes[newIdx]]=[matTypes[newIdx],matTypes[idx]];
  try{
    await Promise.all([
      sb.from('material_types').update({sort_order:a.sort_order}).eq('id',a.id),
      sb.from('material_types').update({sort_order:b.sort_order}).eq('id',b.id)
    ]);
    renderMatTypesList();
    renderSkladBase(); renderSkladCards();
  }catch(e){}
}

// ── SKLAD MOVE MODAL ──────────────────────────────────
function openSkladMove(type,matId=''){
  skladMoveType=type;
  const titles={in:'Приход материала',out:'Расход на заказ',reserve:'Резерв под заказ',scrap:'Обрезок после раскроя'};
  $('sklad-move-title').textContent=titles[type]||'Движение';
  $('sm-qty').value=''; $('sm-price').value=''; $('sm-comment').value=''; $('sm-order').value='';
  $('sm-price-wrap').style.display=type==='in'?'':'none';
  $('sm-order-wrap').style.display=(type==='out'||type==='reserve')?'':'none';
  // Заполняем datalist для поиска материала
  const dl=$('sm-mat-list');
  dl.innerHTML=skladItems.map(item=>`<option value="${item.item_id}">${item.name||item.item_id}</option>`).join('');
  // Если передан matId — ставим его, иначе пусто
  const inp=$('sm-mat');
  if(matId){
    inp.value=matId;
    const item=skladItems.find(i=>i.item_id===matId);
    if(item) $('sm-unit').value=item.unit||'шт';
  } else {
    inp.value='';
  }
  $('m-sklad-move').classList.add('open');
  if(!matId) setTimeout(()=>inp.focus(),100);
}

function onSmMatInput(){
  const val=$('sm-mat').value.trim();
  const item=skladItems.find(i=>i.item_id===val);
  if(item){
    $('sm-unit').value=item.unit||'шт';
    if(item.buy_price && !$('sm-price').value) $('sm-price').value=item.buy_price;
  }
}

function closeSkladMove(){ $('m-sklad-move').classList.remove('open') }

async function saveSkladMove(){
  const mat=$('sm-mat').value;
  const qty=parseFloat($('sm-qty').value)||0;
  const unit=$('sm-unit').value;
  const price=parseFloat($('sm-price').value)||0;
  const orderNum=$('sm-order').value.split('—')[0].trim();
  const comment=$('sm-comment').value||'';
  if(!mat||qty<=0){showToast('Укажите материал и количество');return;}
  const row={
    move_date: new Date().toISOString().split('T')[0],
    move_type: skladMoveType,
    item_id: mat,
    qty: qty,
    unit: unit,
    price: price,
    order_num: orderNum,
    comment: comment
  };
  try{
    const {error}=await sb.from('sklad_moves').insert(row);
    if(error) throw error;
    skladLog.push(row);
    auditLog(skladMoveType,'sklad',mat,{qty,unit,order_num:orderNum,type:skladMoveType});
    closeSkladMove();
    renderSkladCards();
    renderSkladBase();
    renderSkladLog();
    fillSkladMatFilter();
    showToast(MOVE_LABELS[skladMoveType]+' сохранён');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── SKLAD ITEM MODAL ──────────────────────────────────
function openSkladItem(item=null){
  editSkladId=item?item.id:null;
  const isPending=item&&String(item.item_id||'').startsWith('pending_');
  $('sklad-item-title').textContent=item?(isPending?'Оформить материал':'Редактировать позицию'):'Новая позиция';
  $('si-name').value=item?item.name||'':'';
  $('si-type').value=item?item.type||'лист':'лист';
  $('si-unit').value=item?item.unit||'шт':'шт';
  $('si-min').value=item?item.min_stock||'':'';
  $('si-price').value=item?item.buy_price||'':'';
  $('si-stock').value='';
  $('si-del-btn').style.display=item?'inline-flex':'none';
  $('si-merge-btn').style.display=item?'inline-flex':'none';
  $('m-sklad-item').classList.add('open');
}
function closeSkladItem(){ $('m-sklad-item').classList.remove('open'); editSkladId=null }

async function deleteSkladItem(){
  if(!editSkladId) return;
  const item=skladItems.find(i=>i.id===editSkladId);
  const name=item?item.name:'';
  const iid=item?item.item_id:'';
  const stock=iid?skladStock(iid):0;

  if(stock>0){
    showToast('⚠ На складе есть остаток ('+stock+') — сначала спишите');
    return;
  }

  // Считаем движения с заказами и без
  const movesWithOrder=skladLog.filter(r=>r.item_id===iid&&(r.order_num||'').trim());
  const movesWithout=skladLog.filter(r=>r.item_id===iid&&!(r.order_num||'').trim());

  let msg='Удалить материал "'+name+'" из базы?';
  if(movesWithOrder.length){
    msg+='\n\n'+movesWithOrder.length+' записей в журнале привязаны к заказам — они сохранятся для истории.';
  }
  if(movesWithout.length){
    msg+='\n'+movesWithout.length+' записей без привязки к заказам — будут удалены.';
  }

  if(!confirm(msg)) return;

  try{
    // Удаляем только движения БЕЗ привязки к заказам
    if(iid&&movesWithout.length){
      const {error:mErr}=await sb.from('sklad_moves').delete()
        .eq('item_id',iid)
        .or('order_num.is.null,order_num.eq.');
      // Fallback: удаляем поштучно если or не сработал
      if(mErr){
        for(const m of movesWithout){
          if(m.id) await sb.from('sklad_moves').delete().eq('id',m.id);
        }
      }
      skladLog=skladLog.filter(r=>!(r.item_id===iid&&!(r.order_num||'').trim()));
    }
    // Удаляем позицию
    const {error}=await sb.from('sklad_items').delete().eq('id',editSkladId);
    if(error) throw error;
    closeSkladItem();
    await loadSklad();
    showToast('Материал "'+name+'" удалён'+(movesWithOrder.length?' (история заказов сохранена)':''));
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ── Объединение дубликатов на складе ──
function openMergeSklad(){
  if(!editSkladId) return;
  const current=skladItems.find(i=>i.id===editSkladId);
  if(!current) return;
  
  // Находим другие позиции для объединения (кроме текущей)
  const others=skladItems.filter(i=>i.id!==editSkladId);
  
  let ov=$('m-merge-sklad');
  if(!ov){
    ov=document.createElement('div');ov.className='overlay';ov.id='m-merge-sklad';
    ov.innerHTML=`<div class="modal" style="max-width:440px"><div class="modal-hd"><div class="modal-title">🔗 Объединить позиции</div><button class="modal-close" onclick="$('m-merge-sklad').classList.remove('open')">×</button></div><div class="modal-body" id="m-merge-body"></div></div>`;
    document.body.appendChild(ov);
  }
  
  let h=`<div style="margin-bottom:12px;font-size:13px">
    Текущая позиция: <b>${current.name}</b> (остаток: ${skladStock(current.item_id)})
  </div>
  <div style="margin-bottom:10px;font-size:12px;color:var(--text3)">Выберите позицию для объединения. Её остаток и история движений будут перенесены в "${current.name}", а дубль удалён.</div>
  <input type="text" id="merge-search" placeholder="Поиск..." oninput="filterMergeList()" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:13px;font-family:'Geologica',sans-serif;margin-bottom:10px;box-sizing:border-box;outline:none">
  <div id="merge-list" style="max-height:300px;overflow-y:auto">`;
  
  others.forEach(i=>{
    const stock=skladStock(i.item_id);
    h+=`<div class="merge-item" data-name="${(i.name||'').toLowerCase()}" onclick="doMergeSklad(${current.id},'${current.item_id}',${i.id},'${i.item_id}','${escHtml(i.name)}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);border-radius:4px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-size:12px">${i.name}</span>
      <span style="font-size:11px;color:var(--text3)">${stock} ${i.unit||'шт'}</span>
    </div>`;
  });
  h+='</div>';
  
  $('m-merge-body').innerHTML=h;
  ov.classList.add('open');
}

function filterMergeList(){
  const q=($('merge-search')?.value||'').toLowerCase();
  document.querySelectorAll('.merge-item').forEach(el=>{
    el.style.display=el.dataset.name.includes(q)?'':'none';
  });
}

async function doMergeSklad(keepId,keepItemId,removeId,removeItemId,removeName){
  if(!confirm('Объединить "'+removeName+'" → в текущую позицию?\n\nОстаток и все движения будут перенесены, дубль удалён.')) return;
  
  try{
    // 1. Переносим все движения со старого item_id на новый
    const {error:moveErr}=await sb.from('sklad_moves').update({item_id:keepItemId}).eq('item_id',removeItemId);
    if(moveErr) throw moveErr;
    
    // 2. Удаляем дубль из sklad_items
    const {error:delErr}=await sb.from('sklad_items').delete().eq('id',removeId);
    if(delErr) throw delErr;
    
    // 3. Перезагружаем склад
    $('m-merge-sklad').classList.remove('open');
    closeSkladItem();
    await loadSklad();
    showToast('✓ Позиции объединены — "'+removeName+'" удалена');
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function saveSkladItem(){
  const name=$('si-name').value.trim();
  if(!name){showToast('Укажите название');return;}
  // При редактировании pending-записи — заменяем item_id на нормальный
  let oldItemId=null;
  if(editSkladId){
    const existing=skladItems.find(i=>i.id===editSkladId);
    oldItemId=existing?.item_id||'';
  }
  const isPending=oldItemId&&oldItemId.startsWith('pending_');
  const newItemId=isPending?name:(editSkladId?oldItemId:name);
  
  const item={
    item_id: newItemId,
    name: name,
    type: $('si-type').value,
    unit: $('si-unit').value,
    min_stock: parseFloat($('si-min').value)||0,
    buy_price: parseFloat($('si-price').value)||0,
  };
  const initStock=parseFloat($('si-stock').value)||0;
  try{
    if(editSkladId){
      const {error}=await sb.from('sklad_items').update(item).eq('id',editSkladId);
      if(error) throw error;
      // Если был pending — обновляем item_id в движениях склада
      if(isPending&&oldItemId){
        await sb.from('sklad_moves').update({item_id:newItemId}).eq('item_id',oldItemId);
        skladLog.forEach(r=>{if(r.item_id===oldItemId) r.item_id=newItemId});
      }
      // Добавляем начальный остаток если указан (при оформлении pending)
      if(initStock>0){
        await sb.from('sklad_moves').insert({
          move_date:new Date().toISOString().split('T')[0],
          move_type:'in', item_id:newItemId, qty:initStock,
          unit:item.unit, price:item.buy_price, comment:isPending?'Начальный остаток (оформление)':'Приход'
        });
      }
    } else {
      const {error}=await sb.from('sklad_items').insert(item);
      if(error) throw error;
      if(initStock>0){
        await sb.from('sklad_moves').insert({
          move_date:new Date().toISOString().split('T')[0],
          move_type:'in', item_id:item.item_id, qty:initStock,
          unit:item.unit, price:item.buy_price, comment:'Начальный остаток'
        });
      }
    }
    closeSkladItem();
    await loadSklad();
    showToast(isPending?'Материал подтверждён ✓':'Позиция '+(editSkladId?'обновлена':'добавлена'));
  }catch(e){ showToast('Ошибка: '+e.message) }
}

// ══════════════════════════════════════════════════════
// ИМПОРТ ИЗ К3-МЕБЕЛЬ
// ══════════════════════════════════════════════════════
let k3CurrentTab='file', k3FileData=null;

function openK3Import(){
  k3FileData=null;
  $('k3-file-input').value='';
  $('k3-file-preview').style.display='none';
  $('k3-text').value='';
  $('k3-status').style.display='none';
  $('k3-import-btn').textContent='Распознать и загрузить';
  $('k3-import-btn').disabled=false;
  setK3Tab('file',$('k3tab-file'));
  $('m-k3import').classList.add('open');
}
function closeK3Import(){ $('m-k3import').classList.remove('open'); k3FileData=null; }

function setK3Tab(tab,el){
  k3CurrentTab=tab;
  document.querySelectorAll('#m-k3import .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  $('k3-tab-file').style.display=tab==='file'?'':'none';
  $('k3-tab-text').style.display=tab==='text'?'':'none';
}

function handleK3File(file){
  if(!file) return;
  const validTypes=['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if(!validTypes.includes(file.type)){showToast('Поддерживаются: JPG, PNG, PDF');return}
  if(file.size>10*1024*1024){showToast('Файл слишком большой (макс. 10МБ)');return}
  k3FileData=file;
  $('k3-file-name').textContent=file.name+' ('+Math.round(file.size/1024)+' КБ)';
  $('k3-file-preview').style.display='';
  $('k3-dropzone').style.borderColor='var(--accent)';
}
function clearK3File(){
  k3FileData=null;
  $('k3-file-input').value='';
  $('k3-file-preview').style.display='none';
  $('k3-dropzone').style.borderColor='var(--border2)';
}

function showK3Status(type,msg){
  const el=$('k3-status');
  el.style.display='';
  if(type==='loading'){el.style.background='var(--amber-light)';el.style.color='var(--amber)';el.innerHTML='⏳ '+msg}
  else if(type==='ok'){el.style.background='var(--accent-light)';el.style.color='var(--accent-text)';el.innerHTML='✅ '+msg}
  else{el.style.background='var(--red-light)';el.style.color='var(--red)';el.innerHTML='❌ '+msg}
}

async function processK3Import(){
  const btn=$('k3-import-btn');
  btn.textContent='Распознаю...'; btn.disabled=true;

  try{
    let mats=[];

    if(k3CurrentTab==='text'){
      // Парсинг текста
      const text=$('k3-text').value.trim();
      if(!text){showToast('Вставьте текст спецификации');btn.textContent='Распознать и загрузить';btn.disabled=false;return}
      mats=parseK3Text(text);
      if(!mats.length){
        // Если простой парсинг не сработал — отправляем в AI
        showK3Status('loading','AI анализирует текст...');
        mats=await recognizeWithAI(null,text);
      }
    } else {
      // Фото/PDF
      if(!k3FileData){showToast('Загрузите файл');btn.textContent='Распознать и загрузить';btn.disabled=false;return}
      showK3Status('loading','AI распознаёт изображение...');
      const base64=await fileToBase64(k3FileData);
      mats=await recognizeWithAI(base64,null);
    }

    if(mats.length){
      // Очищаем текущие материалы и заполняем новые
      $('f-mats-wrap').innerHTML='';
      orderMatCounter=0;
      mats.forEach(m=>addOrderMat(m.name, m.qty, m.price));
      updateOrderMatsEmpty();
      calcOrderSum();
      showK3Status('ok','Загружено '+mats.length+' материалов');
      setTimeout(()=>closeK3Import(),1200);
    } else {
      showK3Status('error','Не удалось распознать материалы. Проверьте файл или введите вручную.');
    }
  }catch(e){
    showK3Status('error','Ошибка: '+e.message);
  }
  btn.textContent='Распознать и загрузить'; btn.disabled=false;
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

async function recognizeWithAI(base64Image, textContent){
  const messages=[];
  const content=[];

  if(base64Image){
    const mediaType=k3FileData.type==='application/pdf'?'application/pdf':k3FileData.type;
    if(mediaType==='application/pdf'){
      content.push({type:'document',source:{type:'base64',media_type:'application/pdf',data:base64Image}});
    } else {
      content.push({type:'image',source:{type:'base64',media_type:mediaType,data:base64Image}});
    }
  }
  content.push({type:'text',text:`Извлеки список материалов из ${base64Image?'этого изображения/документа':'этого текста'}.
${textContent?'Текст:\n'+textContent:''}

Верни ТОЛЬКО JSON массив без markdown и пояснений. Формат:
[{"name":"ЛДСП Белый 16мм","qty":3,"price":1600},{"name":"Кромка ПВХ 2мм","qty":15,"price":65}]

Правила:
- name: полное название материала
- qty: количество (число)
- price: цена за единицу (число, если есть, иначе 0)
- Игнорируй заголовки таблицы
- Если цены нет, ставь 0`});

  messages.push({role:'user',content});

  const response=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:1000,
      messages:messages
    })
  });

  if(!response.ok){
    const err=await response.text();
    throw new Error('AI ошибка: '+response.status);
  }

  const data=await response.json();
  const text=data.content.map(c=>c.text||'').join('');
  // Парсим JSON
  try{
    const clean=text.replace(/```json|```/g,'').trim();
    const arr=JSON.parse(clean);
    if(Array.isArray(arr)){
      return arr.map(m=>({
        name:String(m.name||'').trim(),
        qty:parseFloat(m.qty)||0,
        price:parseFloat(m.price)||matPrice(String(m.name||'')),
      })).filter(m=>m.name&&m.qty>0);
    }
  }catch(e){}
  return [];
}

