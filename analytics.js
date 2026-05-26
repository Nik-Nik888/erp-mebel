// ══════════════════════════════════════════════════════
// CRM — КЛИЕНТЫ
// ══════════════════════════════════════════════════════
let clients=[], clientEditId=null;

async function loadClients(){
  try{
    const {data,error}=await sb.from('clients').select('*').order('name');
    if(error) throw error;
    clients=data||[];
    renderClients();
  }catch(e){$('crm-body').innerHTML='<div class="empty-state">Ошибка: '+e.message+'</div>'}
}

function getClientStats(cl){
  const clientOrders=orders.filter(o=>(o.client||'').trim().toLowerCase()===(cl.name||'').trim().toLowerCase());
  const totalSum=clientOrders.reduce((s,o)=>s+(parseFloat(o.order_sum)||0),0);
  const totalPaid=clientOrders.reduce((s,o)=>s+(parseFloat(o.prepay)||0),0);
  const closed=clientOrders.filter(o=>(o.status||'').trim()==='Закрыт').length;
  return {orders:clientOrders.length,totalSum,totalPaid,closed,list:clientOrders};
}

function renderClients(){
  const q=($('crm-search')?.value||'').toLowerCase();
  const sort=$('crm-sort')?.value||'name';
  
  let list=clients.map(cl=>{
    const stats=getClientStats(cl);
    return {...cl,...stats};
  });
  
  if(q) list=list.filter(cl=>
    (cl.name||'').toLowerCase().includes(q)||
    (cl.phone||'').includes(q)||
    (cl.email||'').toLowerCase().includes(q)
  );
  
  if(sort==='name') list.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru'));
  else if(sort==='orders') list.sort((a,b)=>b.orders-a.orders);
  else if(sort==='revenue') list.sort((a,b)=>b.totalPaid-a.totalPaid);
  else if(sort==='recent') list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  
  // KPI
  const totalClients=clients.length;
  const withOrders=clients.filter(cl=>getClientStats(cl).orders>0).length;
  const repeat=clients.filter(cl=>getClientStats(cl).orders>1).length;
  const totalRev=clients.reduce((s,cl)=>s+getClientStats(cl).totalPaid,0);
  
  $('crm-total').textContent=totalClients;
  $('crm-active').textContent=withOrders;
  $('crm-repeat').textContent=repeat;
  $('crm-revenue').textContent=fmt(totalRev);
  
  if(!list.length){$('crm-body').innerHTML='<div class="empty-state">Клиентов не найдено</div>';return}
  
  let h='';
  list.forEach(cl=>{
    const lastOrder=cl.list&&cl.list.length?cl.list[0]:null;
    const lastDate=lastOrder?pDate(lastOrder.order_date):null;
    const lastDateStr=lastDate?lastDate.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    
    const srcColors=getSourceColors();
    const srcColor=srcColors[(cl.source||'').trim()]||'#6b6a64';
    
    h+=`<div onclick="openClient(${cl.id})" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--accent-text);flex-shrink:0">${(cl.name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <span style="font-size:14px;font-weight:500">${cl.name||'—'}</span>
          ${cl.source?`<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:${srcColor}18;color:${srcColor};font-weight:500">${cl.source}</span>`:''}
        </div>
        <div style="font-size:12px;color:var(--text3);display:flex;gap:10px;flex-wrap:wrap">
          ${cl.phone?`<span>📱 ${cl.phone}</span>`:''}
          ${cl.manager?`<span>👤 ${cl.manager}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        ${cl.orders?`<div style="font-size:13px;font-weight:600">${cl.orders} заказ(ов)</div>`:'<div style="font-size:12px;color:var(--text3)">Нет заказов</div>'}
        ${cl.totalPaid?`<div style="font-size:12px;color:var(--accent)">${cl.totalPaid.toLocaleString('ru-RU')} ₽</div>`:''}
        <div style="font-size:10px;color:var(--text3)">${lastDateStr}</div>
      </div>
    </div>`;
  });
  $('crm-body').innerHTML=h;
}

function openClient(id=null){
  clientEditId=id;
  $('client-modal-title').textContent=id?'Карточка клиента':'Новый клиент';
  $('cl-del-btn').style.display=id?'inline-flex':'none';
  updateSourceSelects();
  $('cl-name').value='';$('cl-phone').value='';$('cl-email').value='';
  $('cl-address').value='';$('cl-source').value='Авито';$('cl-manager').value='';$('cl-notes').value='';
  $('cl-orders-section').style.display='none';
  $('cl-orders-list').innerHTML='';
  
  if(id){
    const cl=clients.find(c=>c.id===id);
    if(cl){
      $('cl-name').value=cl.name||'';
      $('cl-phone').value=cl.phone||'';
      $('cl-email').value=cl.email||'';
      $('cl-address').value=cl.address||'';
      $('cl-source').value=cl.source||'Авито';
      $('cl-manager').value=cl.manager||'';
      $('cl-notes').value=cl.notes||'';
      
      // История заказов
      const stats=getClientStats(cl);
      if(stats.list.length){
        $('cl-orders-section').style.display='';
        // Считаем общую прибыль с клиента
        let totalNet=0, totalGross=0;
        stats.list.forEach(o=>{
          const f=calcOrderFinance(o);
          if(f){totalNet+=f.netProfit;totalGross+=f.grossProfit}
        });
        let oh=`<div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <div style="background:var(--surface2);border-radius:var(--rs);padding:8px 12px;text-align:center">
            <div style="font-size:16px;font-weight:600">${stats.orders}</div><div style="font-size:10px;color:var(--text3)">заказов</div>
          </div>
          <div style="background:var(--accent-light);border-radius:var(--rs);padding:8px 12px;text-align:center">
            <div style="font-size:16px;font-weight:600;color:var(--accent-text)">${stats.totalPaid.toLocaleString('ru-RU')} ₽</div><div style="font-size:10px;color:var(--accent-text)">оплачено</div>
          </div>
          <div style="background:var(--surface2);border-radius:var(--rs);padding:8px 12px;text-align:center">
            <div style="font-size:16px;font-weight:600">${stats.totalSum.toLocaleString('ru-RU')} ₽</div><div style="font-size:10px;color:var(--text3)">сумма</div>
          </div>
          <div style="background:${totalNet>=0?'var(--accent-light)':'var(--red-light)'};border-radius:var(--rs);padding:8px 12px;text-align:center" title="Сумма чистой прибыли по всем заказам клиента">
            <div style="font-size:16px;font-weight:700;color:${totalNet>=0?'var(--accent-text)':'var(--red)'}">${totalNet.toLocaleString('ru-RU')} ₽</div><div style="font-size:10px;color:${totalNet>=0?'var(--accent-text)':'var(--red)'}">💼 чистая прибыль</div>
          </div>
        </div>`;
        stats.list.forEach(o=>{
          const d=pDate(o.order_date);
          const dateStr=d?d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
          const bc=badgeClass((o.status||'').trim());
          oh+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:12px;font-weight:500;min-width:55px">${o.order_num||'—'}</span>
            <span class="badge ${bc}" style="font-size:10px">${o.status||'—'}</span>
            <span style="flex:1;font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.description||'—'}</span>
            <span style="font-size:11px;color:var(--text3)">${dateStr}</span>
            <span style="font-size:12px;font-weight:500">${o.order_sum?(parseFloat(o.order_sum)).toLocaleString('ru-RU')+' ₽':'—'}</span>
          </div>`;
        });
        $('cl-orders-list').innerHTML=oh;
      }
    }
  }
  $('m-client').classList.add('open');
}

async function saveClient(){
  const name=$('cl-name').value.trim();
  if(!name){showToast('Укажите имя');return}
  const row={
    name,
    phone:$('cl-phone').value.trim()||null,
    email:$('cl-email').value.trim()||null,
    address:$('cl-address').value.trim()||null,
    source:$('cl-source').value==='__other'?'Другое':$('cl-source').value,
    manager:$('cl-manager').value.trim()||null,
    notes:$('cl-notes').value.trim()||null
  };
  try{
    if(clientEditId){
      const {error}=await sb.from('clients').update(row).eq('id',clientEditId);
      if(error) throw error;
      showToast('Клиент обновлён');
    } else {
      const {error}=await sb.from('clients').insert(row);
      if(error) throw error;
      showToast('Клиент добавлен');
    }
    $('m-client').classList.remove('open');
    await loadClients();
  }catch(e){showToast('Ошибка: '+e.message)}
}

async function deleteClient(){
  if(!clientEditId) return;
  const cl=clients.find(c=>c.id===clientEditId);
  const stats=getClientStats(cl||{});
  if(stats.orders>0){showToast('У клиента есть заказы — удаление невозможно');return}
  if(!confirm('Удалить клиента "'+((cl&&cl.name)||'')+'"?')) return;
  try{
    await sb.from('clients').delete().eq('id',clientEditId);
    $('m-client').classList.remove('open');
    await loadClients();
    showToast('Клиент удалён');
  }catch(e){showToast('Ошибка: '+e.message)}
}

// Автосоздание клиента при новом заказе
async function autoCreateClient(name,phone,source,manager){
  if(!name) return;
  const exists=clients.find(c=>(c.name||'').trim().toLowerCase()===name.trim().toLowerCase());
  if(exists) return;
  try{
    await sb.from('clients').insert({name:name.trim(),phone:phone||null,source:source||null,manager:manager||null});
    // Обновляем локальный массив
    const {data}=await sb.from('clients').select('*').eq('name',name.trim()).single();
    if(data) clients.push(data);
  }catch(e){}
}

