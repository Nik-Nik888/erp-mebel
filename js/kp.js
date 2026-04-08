// ══════════════════════════════════════════════════════
// KP CALCULATOR
// ══════════════════════════════════════════════════════
function initKp(){
  const today=new Date().toISOString().split('T')[0];
  const valid=new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  $('kp-date').value=today;
  $('kp-valid').value=valid;
  addMat(); addMat();
  addWork(); addWork();
}

function matPrice(name){
  if(!name) return 0;
  const n=name.toLowerCase().replace(/\s*\([\d.,]+\s*кв\.?м\s*→.*\)/i,'').trim();
  // Точное совпадение в складе
  let si=skladItems.find(i=>(i.name||'').toLowerCase()===n);
  if(si&&si.buy_price) return parseFloat(si.buy_price);
  // Поиск по вхождению
  si=skladItems.find(i=>{
    const sn=(i.name||'').toLowerCase();
    return sn&&(n.includes(sn)||sn.includes(n));
  });
  if(si&&si.buy_price) return parseFloat(si.buy_price);
  return 0;
}
function workDefaults(name){
  const n=(name||'').toLowerCase();
  const r=payRates.find(w=>(w.work_name||'').toLowerCase()===n);
  if(r) return [r.unit||'шт.',parseFloat(r.rate)||0];
  // Частичное совпадение
  const r2=payRates.find(w=>(w.work_name||'').toLowerCase().includes(n)||n.includes((w.work_name||'').toLowerCase()));
  if(r2) return [r2.unit||'шт.',parseFloat(r2.rate)||0];
  return ['шт.',0];
}

function getWorkOptions(){
  // Работы из дерева расценок (payRates)
  const names=new Set();
  const opts=[];
  payRates.forEach(r=>{
    if(r.work_name&&!names.has(r.work_name)){
      names.add(r.work_name);
      opts.push({name:r.work_name,unit:r.unit||'шт.',price:parseFloat(r.rate)||0});
    }
  });
  return opts;
}

function tdinput(type,val,cls){
  return`<td style="padding:0"><input type="${type}" value="${val}" class="${cls}" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" oninput="kpCalc()"></td>`;
}

function getMatOptions(){
  // Материалы из базы склада
  const names=new Set();
  const opts=[];
  skladItems.forEach(i=>{
    if(i.name&&!String(i.item_id||'').startsWith('pending_')&&!names.has(i.name)){
      names.add(i.name);
      opts.push(i.name);
    }
  });
  return opts;
}

function addMat(name='', qty=1, price=0){
  const i=kpMats++;
  const allMats=getMatOptions();
  const n=name||(allMats[0]||'ЛДСП Белый 16мм');
  const p=price||matPrice(n);
  const dlId='dl-mat-'+i;
  const opts=allMats.map(m=>`<option value="${m}">`).join('');
  const tr=document.createElement('tr'); tr.id='km'+i;
  tr.innerHTML=`<td style="padding:0">
    <datalist id="${dlId}">${opts}</datalist>
    <input type="text" value="${n}" list="${dlId}" class="km-name" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" oninput="onMatInput(this,'km${i}')" onchange="onMatInput(this,'km${i}')" onfocus="this.select()">
    </td>
    ${tdinput('number',qty,'km-qty')}
    <td style="padding:0" class="hide-mob"><input type="number" value="${p}" class="km-price" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" oninput="kpCalc()"></td>
    <td id="km${i}c" style="padding:6px 8px;font-size:12px;color:var(--text2)" class="hide-mob">—</td>
    <td id="km${i}l" style="padding:6px 8px;font-size:12px;font-weight:500;color:var(--accent-text)">—</td>
    <td style="text-align:center;padding:2px"><button onclick="document.getElementById('km${i}').remove();kpCalc()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1">×</button></td>`;
  $('kp-mat').appendChild(tr); kpCalc();
}

function onMatInput(input,rowId){
  const tr=$(rowId); if(!tr) return;
  const p=matPrice(input.value);
  if(p){const pi=tr.querySelector('.km-price');if(pi)pi.value=p;}
  kpCalc();
}

function addWork(name='',qty=1,price=0,unit=''){
  const i=kpWorks++;
  const allWorks=getWorkOptions();
  const n=name||((allWorks[0]||{}).name||'');
  const [defUnit,defPrice]=workDefaults(n);
  const p=price||defPrice;
  const u=unit||defUnit;
  const dlId='dl-work-'+i;
  const opts=allWorks.map(w=>`<option value="${w.name}">`).join('');
  const tr=document.createElement('tr'); tr.id='kw'+i;
  tr.innerHTML=`<td style="padding:0">
    <datalist id="${dlId}">${opts}</datalist>
    <input type="text" value="${n}" list="${dlId}" class="kw-name" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" oninput="onWorkInput(this,'kw${i}')" onchange="onWorkInput(this,'kw${i}')" onfocus="this.select()">
    </td>
    ${tdinput('number',qty,'kw-qty')}
    <td style="padding:0"><input type="text" value="${u}" class="kw-unit" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)"></td>
    <td style="padding:0" class="hide-mob"><input type="number" value="${p}" class="kw-price" style="width:100%;padding:6px 8px;border:none;outline:none;background:transparent;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" oninput="kpCalc()"></td>
    <td id="kw${i}s" style="padding:6px 8px;font-size:12px;font-weight:500;color:var(--accent-text)">—</td>
    <td style="text-align:center;padding:2px"><button onclick="document.getElementById('kw${i}').remove();kpCalc()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1">×</button></td>`;
  $('kp-work').appendChild(tr); kpCalc();
}

function onWorkInput(input,rowId){
  const tr=$(rowId); if(!tr) return;
  const [unit,price]=workDefaults(input.value);
  if(price){
    const u=tr.querySelector('.kw-unit'); if(u) u.value=unit;
    const p=tr.querySelector('.kw-price'); if(p) p.value=price;
  }
  kpCalc();
}

function kpCalc(){
  const coef=parseFloat($('kp-coef').value)||1;
  const disc=Math.min(Math.max(parseFloat($('kp-discount').value)||0,0),50);
  const prepayPct=Math.min(Math.max(parseFloat($('kp-prepay-pct').value)||50,0),100);
  let mc=0,ml=0;
  document.querySelectorAll('#kp-mat tr').forEach(tr=>{
    const qty=parseFloat(tr.querySelector('.km-qty')?.value)||0;
    const pr=parseFloat(tr.querySelector('.km-price')?.value)||0;
    const c=qty*pr, l=c*coef; mc+=c; ml+=l;
    const ci=tr.id.replace('km','');
    const ce=$('km'+ci+'c'); if(ce) ce.textContent=fmt(c);
    const le=$('km'+ci+'l'); if(le) le.textContent=fmt(l);
  });
  let wt=0;
  document.querySelectorAll('#kp-work tr').forEach(tr=>{
    const qty=parseFloat(tr.querySelector('.kw-qty')?.value)||0;
    const pr=parseFloat(tr.querySelector('.kw-price')?.value)||0;
    const s=qty*pr; wt+=s;
    const wi=tr.id.replace('kw','');
    const se=$('kw'+wi+'s'); if(se) se.textContent=fmt(s);
  });
  const beforeDisc=ml+wt, discSum=beforeDisc*disc/100, lt=beforeDisc-discSum;
  const ct=mc+wt, profit=lt-ct, margin=lt>0?profit/lt*100:0;
  const prepayAmt=lt*prepayPct/100, restAmt=lt-prepayAmt;
  $('k-mc').textContent=fmt(mc); $('k-wc').textContent=fmt(wt); $('k-tc').textContent=fmt(ct);
  $('k-ml').textContent=fmt(beforeDisc); $('k-disc-pct').textContent=disc;
  $('k-disc-sum').textContent='— '+fmt(discSum); $('k-tl').textContent=fmt(lt);
  $('k-total').textContent=fmt(lt); $('k-profit').textContent=fmt(profit);
  const me=$('k-margin'); me.textContent=Math.round(margin)+'%'; me.style.color=margin<20?'var(--red)':'var(--accent-text)';
  $('k-prepay-pct2').textContent=prepayPct;
  $('k-prepay').textContent=fmt(prepayAmt); $('k-rest').textContent=fmt(restAmt);
}

function kpReset(){
  $('kp-client').value=''; $('kp-desc').value='';
  $('kp-coef').value='2.5'; $('kp-discount').value='0'; $('kp-prepay-pct').value='50';
  $('kp-mat').innerHTML=''; $('kp-work').innerHTML='';
  kpMats=0; kpWorks=0;
  addMat(); addMat(); addWork(); addWork();
}

function kpSaveAsOrder(){
  const client=$('kp-client').value.trim();
  const desc=$('kp-desc').value.trim();
  const dateVal=$('kp-date').value;
  const total=parseFloat($('k-total').textContent.replace(/[^\d]/g,''))||0;
  const prepay=parseFloat($('k-prepay').textContent.replace(/[^\d]/g,''))||0;
  if(!client){showToast('Укажите клиента');return}
  if(!dateVal){showToast('Укажите дату КП');return}
  const existing=orders.find(o=>(o.client||'').trim()===client);
  const phone=existing?existing.phone||'':'';
  const mats=[],works=[];
  document.querySelectorAll('#kp-mat tr').forEach(tr=>{
    const name=(tr.querySelector('.km-name')?.value||'').trim();
    const qty=parseFloat(tr.querySelector('.km-qty')?.value)||0;
    const price=parseFloat(tr.querySelector('.km-price')?.value)||0;
    const ci=tr.id.replace('km','');
    const clientSum=$('km'+ci+'l')?.textContent||'';
    if(qty>0&&name) mats.push({name,qty,price,sum:clientSum});
  });
  document.querySelectorAll('#kp-work tr').forEach(tr=>{
    const name=(tr.querySelector('.kw-name')?.value||'').trim();
    const qty=parseFloat(tr.querySelector('.kw-qty')?.value)||0;
    const unit=(tr.querySelector('.kw-unit')?.value||'').trim();
    const price=parseFloat(tr.querySelector('.kw-price')?.value)||0;
    const wi=tr.id.replace('kw','');
    const sum=$('kw'+wi+'s')?.textContent||'';
    if(qty>0&&name) works.push({name,qty,unit,price,sum});
  });
  const specData={
    kp:true,date:dateVal,
    coef:parseFloat($('kp-coef').value)||1,
    disc:parseFloat($('kp-discount').value)||0,
    prepayPct:parseFloat($('kp-prepay-pct').value)||50,
    mats,works,
    total:$('k-total').textContent,
    profit:$('k-profit').textContent,
    margin:$('k-margin').textContent
  };
  showPage('orders',document.querySelector('.nav-item'));
  setTimeout(()=>{
    openAdd();
    $('f-client').value=client;
    if(phone) $('f-phone').value=phone;
    $('f-desc').value=desc; $('f-date').value=dateVal;
    $('f-sum').value=total; $('f-prepay').value=prepay;
    $('f-status').value='Отправлено КП';
    $('f-spec').value='';
    $('f-spec-json').value=JSON.stringify(specData);
    
    // Заполняем материалы в форме заказа из КП
    populateOrderMats(JSON.stringify(specData));
    calcDopay();
    showToast('КП перенесено в форму заказа');
  },200);
}

function kpPrint(){
  const client=$('kp-client').value||'—';
  const desc=$('kp-desc').value||'—';
  const dateKp=$('kp-date').value||'';
  const validTo=$('kp-valid').value||'';
  const disc=$('kp-discount').value;
  const prepayPct=$('kp-prepay-pct').value;
  let matRows='';
  document.querySelectorAll('#kp-mat tr').forEach(tr=>{
    const name=tr.querySelector('.km-name')?.value||'';
    const qty=parseFloat(tr.querySelector('.km-qty')?.value)||0;
    const price=tr.querySelector('.km-price')?.value||'0';
    const ci=tr.id.replace('km','');
    const clientSum=$('km'+ci+'l')?.textContent||'—';
    if(qty>0&&name) matRows+=`<tr><td>${name}</td><td style="text-align:center">${qty} л.</td><td style="text-align:right">${Number(price).toLocaleString('ru-RU')} ₽</td><td style="text-align:right;font-weight:500">${clientSum}</td></tr>`;
  });
  let workRows='';
  document.querySelectorAll('#kp-work tr').forEach(tr=>{
    const name=tr.querySelector('.kw-name')?.value||'';
    const qty=parseFloat(tr.querySelector('.kw-qty')?.value)||0;
    const unit=tr.querySelector('.kw-unit')?.value||'';
    const price=tr.querySelector('.kw-price')?.value||'0';
    const wi=tr.id.replace('kw','');
    const sum=$('kw'+wi+'s')?.textContent||'—';
    if(qty>0&&name) workRows+=`<tr><td>${name}</td><td style="text-align:center">${qty} ${unit}</td><td style="text-align:right">${Number(price).toLocaleString('ru-RU')} ₽/${unit}</td><td style="text-align:right;font-weight:500">${sum}</td></tr>`;
  });
  const total=$('k-total').textContent, prepay=$('k-prepay').textContent, rest=$('k-rest').textContent, discSum=$('k-disc-sum').textContent;
  const html=`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>КП — ${client}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Arial',sans-serif;font-size:13px;color:#1a1a18;padding:32px;max-width:780px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1a1a18}.logo{font-size:20px;font-weight:700}.logo-sub{font-size:11px;color:#888;margin-top:2px}.kp-title{font-size:22px;font-weight:700;margin-bottom:16px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:24px;background:#f7f6f2;padding:14px;border-radius:6px}.meta-item{font-size:12px}.meta-item span{color:#888}h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#888;margin-bottom:8px;margin-top:20px}table{width:100%;border-collapse:collapse;margin-bottom:4px}thead th{background:#f0efe8;padding:7px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#666;border-bottom:1px solid #ddd}tbody td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}.result{background:#1a1a18;color:#fff;border-radius:8px;padding:16px 20px;margin-top:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center}.result-item .lbl{font-size:10px;opacity:0.6;margin-bottom:4px;text-transform:uppercase}.result-item .val{font-size:16px;font-weight:700}.result-item .val.green{color:#4ade80}.footer{margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#888;text-align:center}@media print{body{padding:20px}button{display:none!important}}</style></head><body>
  <div class="header"><div><div class="logo" style="display:flex;align-items:center;gap:8px"><span style="background:#F5C518;color:#1a1a18;padding:3px 7px;border-radius:4px;font-family:monospace;letter-spacing:1px">K2</span></div><div class="logo-sub">Производство корпусной мебели</div></div><div style="text-align:right;font-size:12px;color:#888">${dateKp?`<div>Дата: ${new Date(dateKp).toLocaleDateString('ru-RU')}</div>`:''}${validTo?`<div>Действует до: ${new Date(validTo).toLocaleDateString('ru-RU')}</div>`:''}</div></div>
  <div class="kp-title">Коммерческое предложение</div>
  <div class="meta"><div class="meta-item"><span>Клиент:</span> <b>${client}</b></div><div class="meta-item"><span>Изделие:</span> ${desc}</div>${disc>0?`<div class="meta-item"><span>Скидка:</span> ${disc}%</div>`:''}<div class="meta-item"><span>Предоплата:</span> ${prepayPct}%</div></div>
  ${matRows?`<h3>Материалы</h3><table><thead><tr><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${matRows}</tbody></table>`:''}
  ${workRows?`<h3>Работы</h3><table><thead><tr><th>Наименование</th><th>Кол-во</th><th>Цена/ед.</th><th>Сумма</th></tr></thead><tbody>${workRows}</tbody></table>`:''}
  <div class="result"><div class="result-item"><div class="lbl">Итого</div><div class="val">${total}</div></div>${disc>0?`<div class="result-item"><div class="lbl">Скидка</div><div class="val" style="color:#f9a825">${discSum}</div></div>`:''}<div class="result-item"><div class="lbl">Предоплата ${prepayPct}%</div><div class="val green">${prepay}</div></div><div class="result-item"><div class="lbl">Остаток</div><div class="val">${rest}</div></div></div>
  <div class="footer">Данное предложение носит информационный характер и не является публичной офертой</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();}
  else showToast('Разрешите всплывающие окна');
}

// ── SPEC MODAL ────────────────────────────────────────
let specEditRid=null;
let specMatCounter=0, specWorkCounter=0;

async function openStatusHistory(rid){
  const o=findO(rid); if(!o) return;
  const log=await getStatusLog(rid);
  
  let overlay=$('m-history');
  if(!overlay){
    overlay=document.createElement('div');overlay.className='overlay';overlay.id='m-history';
    overlay.innerHTML=`<div class="modal" style="max-width:520px"><div class="modal-hd"><div class="modal-title" id="m-history-title">История</div><button class="modal-close" onclick="document.getElementById('m-history').classList.remove('open')">×</button></div><div class="modal-body" id="m-history-body" style="max-height:70vh;overflow-y:auto"></div></div>`;
    document.body.appendChild(overlay);
  }
  
  let html=`<div style="font-size:14px;font-weight:600;margin-bottom:14px">🕐 История статусов — ${rid}</div>`;
  
  if(!log.length){
    html+=`<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">История пока пуста. Статусы начнут записываться при следующем изменении.</div>`;
  } else {
    // Таймлайн
    html+=`<div style="position:relative;padding-left:24px">`;
    // Вертикальная линия
    html+=`<div style="position:absolute;left:8px;top:8px;bottom:8px;width:2px;background:var(--border2)"></div>`;
    
    for(let i=0;i<log.length;i++){
      const entry=log[i];
      const next=log[i+1];
      const dt=new Date(entry.changed_at);
      const dateStr=dt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'});
      const timeStr=dt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      
      // Длительность в этом статусе
      let duration='';
      if(next){
        const nextDt=new Date(next.changed_at);
        duration=formatDuration(nextDt-dt);
      } else {
        // Текущий статус — время с момента установки
        duration=formatDuration(Date.now()-dt);
        duration+=' (сейчас)';
      }
      
      const isLast=i===log.length-1;
      const bc=badgeClass(entry.new_status);
      
      html+=`<div style="position:relative;margin-bottom:${isLast?0:16}px">
        <div style="position:absolute;left:-20px;top:4px;width:12px;height:12px;border-radius:50%;background:${isLast?'var(--accent)':'var(--border2)'};border:2px solid var(--surface)"></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <span class="badge ${bc}" style="font-size:11px">${entry.new_status}</span>
            ${entry.old_status?`<span style="font-size:10px;color:var(--text3);margin-left:4px">← ${entry.old_status}</span>`:'<span style="font-size:10px;color:var(--text3);margin-left:4px">создан</span>'}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:11px;color:var(--text2)">${dateStr} ${timeStr}</div>
            <div style="font-size:11px;font-weight:600;color:${isLast?'var(--accent)':'var(--amber)'}">${duration}</div>
          </div>
        </div>
        ${entry.changed_by?`<div style="font-size:10px;color:var(--text3);margin-top:2px">👤 ${entry.changed_by}</div>`:''}
      </div>`;
    }
    html+=`</div>`;
    
    // Сводка по статусам
    const summary={};
    for(let i=0;i<log.length;i++){
      const entry=log[i];
      const next=log[i+1];
      const dur=next?new Date(next.changed_at)-new Date(entry.changed_at):Date.now()-new Date(entry.changed_at);
      summary[entry.new_status]=(summary[entry.new_status]||0)+dur;
    }
    
    const totalDur=Object.values(summary).reduce((s,v)=>s+v,0);
    html+=`<div style="margin-top:16px;background:var(--surface2);border-radius:var(--r);padding:12px 14px">
      <div style="font-size:11px;font-weight:500;color:var(--text2);margin-bottom:8px">Время в статусах</div>`;
    Object.entries(summary).sort((a,b)=>b[1]-a[1]).forEach(([status,dur])=>{
      const pct=totalDur>0?dur/totalDur*100:0;
      const bc2=badgeClass(status);
      html+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="badge ${bc2}" style="font-size:10px;min-width:100px">${status}</span>
        <div style="flex:1;background:var(--border);border-radius:3px;height:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px"></div></div>
        <span style="font-size:11px;font-weight:600;min-width:60px;text-align:right">${formatDuration(dur)}</span>
      </div>`;
    });
    html+=`</div>`;
  }
  
  html+=`<div style="display:flex;gap:8px;margin-top:14px">
    <button class="btn btn-ghost" onclick="document.getElementById('m-history').classList.remove('open')" style="flex:1;justify-content:center">Закрыть</button>
  </div>`;
  
  $('m-history-body').innerHTML=html;
  overlay.classList.add('open');
}

function openSpecModal(rid){
  const o=findO(rid); if(!o) return;
  let sp; try{sp=JSON.parse(o.specification||'');}catch(e){return;}
  if(!sp||!sp.kp) return;
  specEditRid=rid;
  specMatCounter=0; specWorkCounter=0;
  $('spec-title').textContent='Состав — '+rid;
  const meta=[];
  if(sp.coef&&sp.coef>1) meta.push('Коэф. '+sp.coef);
  if(sp.disc) meta.push('Скидка '+sp.disc+'%');
  $('spec-meta').textContent=meta.join(' · ');

  const allMats=getMatOptions();
  const matDl=allMats.map(m=>`<option value="${m}">`).join('');
  const workOpts=WORK_CATALOG.map(w=>`<option value="${w.name}">`).join('');

  let html='';
  // Материалы — редактируемые
  html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase">Материалы</div>
    <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px" onclick="addSpecMat()">+ материал</button>
  </div>`;
  html+=`<div id="spec-mats" style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px">`;
  if(sp.mats&&sp.mats.length){
    sp.mats.forEach(m=>{
      const i=specMatCounter++;
      const p=parseFloat(m.price)||0;
      const q=parseFloat(m.qty)||0;
      html+=specMatRow(i, m.name, q, p, matDl);
    });
  }
  html+=`</div>`;

  // Работы — редактируемые
  html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <div style="font-size:11px;font-weight:500;color:var(--text2);text-transform:uppercase">Работы</div>
    <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px" onclick="addSpecWork()">+ работа</button>
  </div>`;
  html+=`<div id="spec-works" style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px">`;
  if(sp.works&&sp.works.length){
    sp.works.forEach(w=>{
      const i=specWorkCounter++;
      const p=parseFloat(w.price)||0;
      const q=parseFloat(w.qty)||0;
      html+=specWorkRow(i, w.name, q, w.unit||'шт.', p, workOpts);
    });
  }
  html+=`</div>`;

  // Итого — пересчитывается
  html+=`<div id="spec-totals"></div>`;

  $('spec-body').innerHTML=html;
  recalcSpecTotals();
  $('m-spec').classList.add('open');
}

function specMatRow(i, name, qty, price, dlOpts){
  const sum=qty*price;
  return `<div id="spm-${i}" style="display:flex;gap:5px;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);padding:5px 8px">
    <datalist id="dl-spm-${i}">${dlOpts}</datalist>
    <input type="text" value="${name}" list="dl-spm-${i}" class="spm-name" style="flex:2;min-width:0;background:transparent;border:none;outline:none;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" onchange="onSpecMatChange(this,${i})" onfocus="this.select()">
    <input type="number" value="${qty}" class="spm-qty" min="0.5" step="0.5" oninput="recalcSpecTotals()" style="width:50px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:12px;outline:none;text-align:center;font-family:'Geologica',sans-serif">
    <input type="number" value="${price}" class="spm-price" min="0" oninput="recalcSpecTotals()" style="width:60px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:12px;outline:none;text-align:right;font-family:'Geologica',sans-serif;color:var(--text2)">
    <span class="spm-sum" style="font-size:11px;min-width:55px;text-align:right;font-weight:500;color:var(--accent-text)">${sum?sum.toLocaleString('ru-RU')+'₽':'—'}</span>
    <button onclick="document.getElementById('spm-${i}').remove();recalcSpecTotals()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;padding:0 2px">×</button>
  </div>`;
}

function specWorkRow(i, name, qty, unit, price, dlOpts){
  const sum=qty*price;
  return `<div id="spw-${i}" style="display:flex;gap:5px;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);padding:5px 8px">
    <datalist id="dl-spw-${i}">${dlOpts}</datalist>
    <input type="text" value="${name}" list="dl-spw-${i}" class="spw-name" style="flex:2;min-width:0;background:transparent;border:none;outline:none;font-size:12px;font-family:'Geologica',sans-serif;color:var(--text)" onchange="onSpecWorkChange(this,${i})" onfocus="this.select()">
    <input type="number" value="${qty}" class="spw-qty" min="0.5" step="0.5" oninput="recalcSpecTotals()" style="width:45px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:12px;outline:none;text-align:center;font-family:'Geologica',sans-serif">
    <input type="text" value="${unit}" class="spw-unit" style="width:40px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:11px;outline:none;text-align:center;font-family:'Geologica',sans-serif;color:var(--text3)">
    <input type="number" value="${price}" class="spw-price" min="0" oninput="recalcSpecTotals()" style="width:55px;background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 5px;font-size:12px;outline:none;text-align:right;font-family:'Geologica',sans-serif;color:var(--text2)">
    <span class="spw-sum" style="font-size:11px;min-width:55px;text-align:right;font-weight:500;color:var(--accent-text)">${sum?sum.toLocaleString('ru-RU')+'₽':'—'}</span>
    <button onclick="document.getElementById('spw-${i}').remove();recalcSpecTotals()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;padding:0 2px">×</button>
  </div>`;
}

function addSpecMat(){
  const allMats=getMatOptions();
  const dlOpts=allMats.map(m=>`<option value="${m}">`).join('');
  const i=specMatCounter++;
  const name=allMats[0]||'';
  const price=matPrice(name)||0;
  $('spec-mats').insertAdjacentHTML('beforeend',specMatRow(i,name,1,price,dlOpts));
  recalcSpecTotals();
}

function addSpecWork(){
  const dlOpts=WORK_CATALOG.map(w=>`<option value="${w.name}">`).join('');
  const i=specWorkCounter++;
  const w=WORK_CATALOG[0]||{name:'',unit:'шт.',price:0};
  $('spec-works').insertAdjacentHTML('beforeend',specWorkRow(i,w.name,1,w.unit,w.price,dlOpts));
  recalcSpecTotals();
}

function onSpecMatChange(input,idx){
  const row=$('spm-'+idx); if(!row) return;
  const p=matPrice(input.value);
  if(p){const pi=row.querySelector('.spm-price');if(pi)pi.value=p;}
  recalcSpecTotals();
}

function onSpecWorkChange(input,idx){
  const row=$('spw-'+idx); if(!row) return;
  const [unit,price]=workDefaults(input.value);
  if(price){
    const u=row.querySelector('.spw-unit');if(u)u.value=unit;
    const p=row.querySelector('.spw-price');if(p)p.value=price;
  }
  recalcSpecTotals();
}

function recalcSpecTotals(){
  let matTotal=0, workTotal=0;
  document.querySelectorAll('#spec-mats [id^="spm-"]').forEach(row=>{
    const q=parseFloat(row.querySelector('.spm-qty')?.value)||0;
    const p=parseFloat(row.querySelector('.spm-price')?.value)||0;
    const s=q*p; matTotal+=s;
    const se=row.querySelector('.spm-sum'); if(se) se.textContent=s?s.toLocaleString('ru-RU')+'₽':'—';
  });
  document.querySelectorAll('#spec-works [id^="spw-"]').forEach(row=>{
    const q=parseFloat(row.querySelector('.spw-qty')?.value)||0;
    const p=parseFloat(row.querySelector('.spw-price')?.value)||0;
    const s=q*p; workTotal+=s;
    const se=row.querySelector('.spw-sum'); if(se) se.textContent=s?s.toLocaleString('ru-RU')+'₽':'—';
  });
  const grand=matTotal+workTotal;
  const el=$('spec-totals');
  if(el) el.innerHTML=grand>0?`<div style="background:var(--accent-light);border-radius:var(--rs);padding:10px 14px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
    <div><div style="font-size:10px;color:var(--amber);margin-bottom:2px">Материалы</div><div style="font-size:15px;font-weight:600;color:var(--amber)">${matTotal.toLocaleString('ru-RU')} ₽</div></div>
    ${workTotal?`<div><div style="font-size:10px;color:var(--amber);margin-bottom:2px">Работы</div><div style="font-size:15px;font-weight:600;color:var(--amber)">${workTotal.toLocaleString('ru-RU')} ₽</div></div>`:''}
    <div><div style="font-size:10px;color:var(--accent-text);margin-bottom:2px">Итого себестоимость</div><div style="font-size:15px;font-weight:600;color:var(--accent-text)">${grand.toLocaleString('ru-RU')} ₽</div></div>
  </div>`:'';
}

async function saveSpecFromModal(){
  if(!specEditRid) return;
  const o=findO(specEditRid); if(!o) return;
  let sp; try{sp=JSON.parse(o.specification||'');}catch(e){sp={kp:true};}

  // Собираем материалы
  const mats=[];
  document.querySelectorAll('#spec-mats [id^="spm-"]').forEach(row=>{
    const name=(row.querySelector('.spm-name')?.value||'').trim();
    const qty=parseFloat(row.querySelector('.spm-qty')?.value)||0;
    const price=parseFloat(row.querySelector('.spm-price')?.value)||0;
    if(name&&qty>0) mats.push({name,qty,price,sum:(qty*price).toLocaleString('ru-RU')+' ₽'});
  });
  // Собираем работы
  const works=[];
  document.querySelectorAll('#spec-works [id^="spw-"]').forEach(row=>{
    const name=(row.querySelector('.spw-name')?.value||'').trim();
    const qty=parseFloat(row.querySelector('.spw-qty')?.value)||0;
    const unit=(row.querySelector('.spw-unit')?.value||'').trim();
    const price=parseFloat(row.querySelector('.spw-price')?.value)||0;
    if(name&&qty>0) works.push({name,qty,unit,price,sum:(qty*price).toLocaleString('ru-RU')+' ₽'});
  });

  sp.mats=mats;
  sp.works=works;
  const specJson=JSON.stringify(sp);

  try{
    const {error}=await sb.from('orders').update({specification:specJson}).eq('id',o.id);
    if(error) throw error;
    o.specification=specJson;
    // Автодобавление новых материалов
    if(mats.length) await suggestNewMaterials(mats);
    $('m-spec').classList.remove('open');
    render();
    showToast('Состав обновлён');
  }catch(e){ showToast('Ошибка: '+e.message) }
}

