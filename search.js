// ══════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ ПОИСК (Ctrl+K)
// ══════════════════════════════════════════════════════
function openGlobalSearch(){
  let ov=$('m-global-search');
  if(!ov){
    ov=document.createElement('div');
    ov.id='m-global-search';
    ov.style.cssText='position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.5);display:flex;align-items:flex-start;justify-content:center;padding-top:15vh';
    ov.onclick=e=>{if(e.target===ov)closeGlobalSearch()};
    ov.innerHTML=`<div style="width:100%;max-width:520px;background:var(--surface);border-radius:var(--r);box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;max-height:70vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border)">
        <span style="font-size:16px;color:var(--text3)">🔍</span>
        <input type="text" id="gs-input" placeholder="Поиск по всему — клиент, телефон, номер, материал..." oninput="doGlobalSearch(this.value)" style="flex:1;border:none;outline:none;font-size:15px;font-family:'Geologica',sans-serif;color:var(--text);background:transparent">
        <kbd style="font-size:10px;color:var(--text3);background:var(--surface2);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">Esc</kbd>
      </div>
      <div id="gs-results" style="overflow-y:auto;padding:6px;max-height:50vh"></div>
    </div>`;
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  $('gs-input').value='';
  $('gs-results').innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Начните вводить для поиска</div>';
  setTimeout(()=>$('gs-input')?.focus(),50);
}

function closeGlobalSearch(){
  const ov=$('m-global-search');
  if(ov) ov.style.display='none';
}

function doGlobalSearch(q){
  q=(q||'').toLowerCase().trim();
  const results=$('gs-results');
  if(!q||q.length<2){
    results.innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Минимум 2 символа</div>';
    return;
  }
  
  let h='';
  let count=0;
  
  // Заказы
  const matchOrders=orders.filter(o=>
    (o.order_num||'').toLowerCase().includes(q)||
    (o.client||'').toLowerCase().includes(q)||
    (o.phone||'').includes(q)||
    (o.description||'').toLowerCase().includes(q)||
    (o.manager||'').toLowerCase().includes(q)||
    (o.comment||'').toLowerCase().includes(q)
  ).slice(0,8);
  
  if(matchOrders.length){
    h+=`<div style="font-size:10px;font-weight:600;color:var(--text3);padding:6px 10px;text-transform:uppercase">Заказы (${matchOrders.length})</div>`;
    matchOrders.forEach(o=>{
      count++;
      h+=`<div onclick="closeGlobalSearch();showPage('orders');setTimeout(()=>openEdit('${o.order_num}'),200)" style="padding:8px 12px;cursor:pointer;border-radius:var(--rs);display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <span style="font-size:12px;font-weight:600;min-width:55px">${o.order_num}</span>
        <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.client||'—'}</span>
        <span class="badge ${badgeClass((o.status||'').trim())}" style="font-size:9px">${(o.status||'').trim()}</span>
      </div>`;
    });
  }
  
  // Клиенты
  const matchClients=(typeof clients!=='undefined'?clients:[]).filter(c=>
    (c.name||'').toLowerCase().includes(q)||
    (c.phone||'').includes(q)||
    (c.email||'').toLowerCase().includes(q)
  ).slice(0,5);
  
  if(matchClients.length){
    h+=`<div style="font-size:10px;font-weight:600;color:var(--text3);padding:6px 10px;text-transform:uppercase;margin-top:4px">Клиенты (${matchClients.length})</div>`;
    matchClients.forEach(c=>{
      count++;
      h+=`<div onclick="closeGlobalSearch();showPage('crm');setTimeout(()=>openClient(${c.id}),200)" style="padding:8px 12px;cursor:pointer;border-radius:var(--rs);display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <span style="font-size:14px">👤</span>
        <span style="font-size:12px;flex:1">${c.name||'—'}</span>
        <span style="font-size:11px;color:var(--text3)">${c.phone||''}</span>
      </div>`;
    });
  }
  
  // Склад
  const matchSklad=(typeof skladItems!=='undefined'?skladItems:[]).filter(i=>
    (i.name||'').toLowerCase().includes(q)
  ).slice(0,5);
  
  if(matchSklad.length){
    h+=`<div style="font-size:10px;font-weight:600;color:var(--text3);padding:6px 10px;text-transform:uppercase;margin-top:4px">Склад (${matchSklad.length})</div>`;
    matchSklad.forEach(i=>{
      count++;
      h+=`<div onclick="closeGlobalSearch();showPage('sklad')" style="padding:8px 12px;cursor:pointer;border-radius:var(--rs);display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <span style="font-size:14px">📦</span>
        <span style="font-size:12px;flex:1">${i.name||'—'}</span>
        <span style="font-size:11px;color:var(--text3)">${i.unit||'шт'}</span>
      </div>`;
    });
  }
  
  if(!count) h='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Ничего не найдено</div>';
  results.innerHTML=h;
}

// Ctrl+K shortcut
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openGlobalSearch()}
  if(e.key==='Escape') closeGlobalSearch();
});

