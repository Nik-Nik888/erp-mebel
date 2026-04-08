// ══════════════════════════════════════════════════════
let auditData=[];

async function loadAuditLog(){
  const entity=$('audit-entity')?.value||'';
  const action=$('audit-action')?.value||'';
  
  let q=sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(200);
  if(entity) q=q.eq('entity',entity);
  if(action) q=q.eq('action',action);
  
  try{
    const {data,error}=await q;
    if(error) throw error;
    auditData=data||[];
    renderAuditLog();
  }catch(e){
    $('audit-body').innerHTML='<div class="empty-state">Ошибка: '+e.message+'</div>';
  }
}

function filterAuditLog(){
  renderAuditLog();
}

function renderAuditLog(){
  const search=($('audit-search')?.value||'').toLowerCase();
  let filtered=auditData;
  if(search){
    filtered=filtered.filter(r=>
      (r.entity_id||'').toLowerCase().includes(search)||
      (r.user_name||'').toLowerCase().includes(search)||
      JSON.stringify(r.details||{}).toLowerCase().includes(search)
    );
  }
  
  if(!filtered.length){
    $('audit-body').innerHTML='<div style="padding:30px;text-align:center;color:var(--text3)">Нет записей</div>';
    return;
  }
  
  const ACTION_ICONS={create:'🟢',update:'✏️',delete:'🗑',status_change:'🔄',payment:'💰',stage_done:'✅',login:'🔑',income:'📥',expense:'📤',merge:'🔗'};
  const ACTION_LABELS={create:'Создание',update:'Изменение',delete:'Удаление',status_change:'Смена статуса',payment:'Оплата',stage_done:'Этап завершён',login:'Вход',income:'Приход',expense:'Расход',writeoff:'Списание',merge:'Объединение'};
  const ENTITY_LABELS={order:'Заказ',sklad:'Склад',expense:'Расход',client:'Клиент',worker:'Сотрудник'};
  
  let h='';
  let lastDate='';
  
  filtered.forEach(r=>{
    const d=new Date(r.created_at);
    const dateStr=d.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'});
    const timeStr=d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    
    if(dateStr!==lastDate){
      lastDate=dateStr;
      h+=`<div style="font-size:11px;font-weight:600;color:var(--text3);padding:10px 0 4px;border-bottom:1px solid var(--border);margin-top:8px">${dateStr}</div>`;
    }
    
    const icon=ACTION_ICONS[r.action]||'📝';
    const actionLabel=ACTION_LABELS[r.action]||r.action;
    const entityLabel=ENTITY_LABELS[r.entity]||r.entity;
    
    // Детали
    let detailStr='';
    const det=r.details||{};
    if(r.action==='status_change') detailStr=`${det.old||'—'} → ${det.new||'—'}`;
    else if(r.action==='payment') detailStr=`${det.amount>0?'+':''}${(det.amount||0).toLocaleString('ru-RU')} ₽ (итого: ${(det.total||0).toLocaleString('ru-RU')} ₽)`;
    else if(r.action==='stage_done') detailStr=`${det.stage||''} ${det.worker?'— '+det.worker:''}`;
    else if(r.action==='create') detailStr=`${det.client||''} ${det.status||''} ${det.sum?det.sum.toLocaleString('ru-RU')+' ₽':''}`;
    else if(r.action==='delete') detailStr=`${det.client||''} ${det.status||''}`;
    else if(det.qty) detailStr=`${det.type||''} ${det.qty} ${det.unit||''} ${det.order_num?'→ '+det.order_num:''}`;
    
    const isClickable=r.entity==='order'&&r.entity_id&&r.action!=='delete';
    
    h+=`<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);font-size:12px;${isClickable?'cursor:pointer':''}" ${isClickable?`onclick="showPage('orders');setTimeout(()=>openEdit('${r.entity_id}'),200)"`:''}>
      <span style="font-size:14px;flex-shrink:0;margin-top:1px">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="font-weight:500;color:var(--accent-text)">${actionLabel}</span>
          <span style="color:var(--text3)">${entityLabel}</span>
          ${r.entity_id?`<span style="font-weight:600">${r.entity_id}</span>`:''}
        </div>
        ${detailStr?`<div style="color:var(--text2);margin-top:2px;font-size:11px">${detailStr}</div>`:''}
      </div>
      <div style="flex-shrink:0;text-align:right">
        <div style="color:var(--text3);font-size:11px">${timeStr}</div>
        <div style="color:var(--text3);font-size:10px">${(r.user_name||'').split('@')[0]}</div>
      </div>
    </div>`;
  });
  
  $('audit-body').innerHTML=h;
}

// НАПОМИНАНИЯ
