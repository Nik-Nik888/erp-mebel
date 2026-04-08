// ══════════════════════════════════════════════════════
// CATALOG (Supabase)
// ══════════════════════════════════════════════════════
async function loadCatalog(){
  try{
    const [mRes,wRes]=await Promise.all([
      sb.from('catalog_materials').select('*').order('id'),
      sb.from('catalog_works').select('*').order('id')
    ]);
    if(mRes.data) MAT_CATALOG=mRes.data;
    if(wRes.data) WORK_CATALOG=wRes.data;
  }catch(e){}
}

function openCatalog(){ renderCatMat(); renderCatWork(); $('m-catalog').classList.add('open'); }
function closeCatalog(){ $('m-catalog').classList.remove('open') }

function catInput(val,style=''){return`<input type="text" value="${(val||'').toString().replace(/"/g,'&quot;')}" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface2);color:var(--text);outline:none;${style}">`}
function catNumInput(val){return`<input type="number" value="${val||0}" min="0" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface2);color:var(--text);outline:none">`}

function renderCatMat(){
  // Материалы: сначала из склада (Базы), потом из каталога (без дублей)
  const names=new Set();
  const allMats=[];
  skladItems.forEach(i=>{
    if(i.name&&!names.has(i.name)){
      names.add(i.name);
      allMats.push({name:i.name, price:parseFloat(i.buy_price)||0, fromSklad:true});
    }
  });
  MAT_CATALOG.forEach(m=>{
    if(m.name&&!names.has(m.name)){
      names.add(m.name);
      allMats.push({name:m.name, price:m.price, fromSklad:false});
    }
  });
  $('cat-mat-body').innerHTML=allMats.map(m=>`<tr>
    <td style="padding:3px 4px;border:1px solid var(--border)">${catInput(m.name)}${m.fromSklad?'<div style="font-size:9px;color:var(--accent);margin-top:1px">📦 со склада</div>':''}</td>
    <td style="padding:3px 4px;border:1px solid var(--border)">${catNumInput(m.price)}</td>
    <td style="padding:3px;border:1px solid var(--border);text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button></td>
  </tr>`).join('');
}
function renderCatWork(){
  $('cat-work-body').innerHTML=WORK_CATALOG.map(w=>`<tr>
    <td style="padding:3px 4px;border:1px solid var(--border)">${catInput(w.name)}</td>
    <td style="padding:3px 4px;border:1px solid var(--border)">${catInput(w.unit)}</td>
    <td style="padding:3px 4px;border:1px solid var(--border)">${catNumInput(w.price)}</td>
    <td style="padding:3px;border:1px solid var(--border);text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button></td>
  </tr>`).join('');
}
function addCatMat(){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td style="padding:3px 4px;border:1px solid var(--border)">${catInput('')}</td><td style="padding:3px 4px;border:1px solid var(--border)">${catNumInput(0)}</td><td style="padding:3px;border:1px solid var(--border);text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button></td>`;
  $('cat-mat-body').appendChild(tr); tr.querySelector('input').focus();
}
function addCatWork(){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td style="padding:3px 4px;border:1px solid var(--border)">${catInput('')}</td><td style="padding:3px 4px;border:1px solid var(--border)">${catInput('шт.')}</td><td style="padding:3px 4px;border:1px solid var(--border)">${catNumInput(0)}</td><td style="padding:3px;border:1px solid var(--border);text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">×</button></td>`;
  $('cat-work-body').appendChild(tr); tr.querySelector('input').focus();
}

async function saveCatalog(){
  const newMats=[], newWorks=[];
  $('cat-mat-body').querySelectorAll('tr').forEach(tr=>{
    const inputs=tr.querySelectorAll('input');
    const name=inputs[0].value.trim(), price=parseFloat(inputs[1].value)||0;
    if(name) newMats.push({name,price});
  });
  $('cat-work-body').querySelectorAll('tr').forEach(tr=>{
    const inputs=tr.querySelectorAll('input');
    const name=inputs[0].value.trim(), unit=inputs[1].value.trim()||'шт.', price=parseFloat(inputs[2].value)||0;
    if(name) newWorks.push({name,unit,price});
  });
  try{
    await sb.from('catalog_materials').delete().neq('id',0);
    await sb.from('catalog_works').delete().neq('id',0);
    if(newMats.length) await sb.from('catalog_materials').insert(newMats);
    if(newWorks.length) await sb.from('catalog_works').insert(newWorks);
    MAT_CATALOG=newMats.map((m,i)=>({id:i,...m}));
    WORK_CATALOG=newWorks.map((w,i)=>({id:i,...w}));
    showToast('Справочник сохранён');
  }catch(e){ showToast('Ошибка: '+e.message) }
  closeCatalog();
}

