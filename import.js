// ══════════════════════════════════════════════════════
// ИМПОРТ СПЕЦИФИКАЦИИ (фото/PDF/текст)
// ══════════════════════════════════════════════════════
let importFile=null;
let importTab='file';

function openSpecImport(){
  importFile=null; importTab='file';
  // Полный сброс файлового инпута (пересоздаём чтобы убрать кэш)
  const oldInput=$('imp-file-input');
  if(oldInput){const newInput=oldInput.cloneNode(true);newInput.value='';oldInput.parentNode.replaceChild(newInput,oldInput);}
  $('imp-file-preview').style.display='none';
  $('imp-drop-zone').style.display='';
  $('imp-drop-zone').style.borderColor='var(--border2)';
  $('imp-drop-zone').style.background='var(--surface2)';
  $('imp-text').value='';
  $('imp-status').style.display='none';
  $('imp-file-section').style.display='';
  $('imp-text-section').style.display='none';
  $('imp-go-btn').textContent='🔍 Распознать';
  $('imp-go-btn').disabled=false;
  // Сброс табов
  document.querySelectorAll('#m-spec-import .tab').forEach(t=>t.classList.remove('active'));
  $('imp-tab-file').classList.add('active');
  $('m-spec-import').classList.add('open');
}
function closeSpecImport(){ $('m-spec-import').classList.remove('open'); importFile=null; }

function setImportTab(tab,el){
  importTab=tab;
  document.querySelectorAll('#m-spec-import .tab').forEach(t=>t.classList.remove('active'));
  if(el) el.classList.add('active');
  $('imp-file-section').style.display=tab==='file'?'':'none';
  $('imp-text-section').style.display=tab==='text'?'':'none';
  $('imp-go-btn').textContent=tab==='file'?'🔍 Распознать':'📋 Разобрать текст';
}

function handleImportFile(file){
  if(!file) return;
  importFile=file;
  $('imp-file-name').textContent=file.name+' ('+Math.round(file.size/1024)+' КБ)';
  $('imp-file-preview').style.display='';
  $('imp-drop-zone').style.display='none';
}
function clearImportFile(){
  importFile=null;
  $('imp-file-input').value='';
  $('imp-file-preview').style.display='none';
  $('imp-drop-zone').style.display='';
}

function setImportStatus(msg,type){
  const el=$('imp-status');
  el.style.display='';
  el.style.background=type==='loading'?'var(--amber-light)':type==='ok'?'var(--accent-light)':'var(--red-light)';
  el.style.color=type==='loading'?'var(--amber)':type==='ok'?'var(--accent-text)':'var(--red)';
  el.innerHTML=msg;
}

async function processImport(){
  if(importTab==='text'){
    processTextImport();
    return;
  }
  if(!importFile){showToast('Выберите файл');return;}
  const btn=$('imp-go-btn');
  btn.textContent='⏳ Обработка...'; btn.disabled=true;
  setImportStatus('🔄 Читаю файл...','loading');

  try{
    const mediaType=importFile.type||'';
    const isPdf=mediaType.includes('pdf')||importFile.name.endsWith('.pdf');

    if(isPdf){
      // PDF — извлекаем текст через pdf.js
      setImportStatus('🔄 Извлекаю текст из PDF...','loading');
      const arrayBuf=await importFile.arrayBuffer();
      if(typeof pdfjsLib==='undefined'){
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const pdf=await pdfjsLib.getDocument({data:arrayBuf}).promise;
      let fullText='';
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);
        const tc=await page.getTextContent();
        // Группируем по строкам через Y-координату
        let lastY=null;
        let line='';
        tc.items.forEach(item=>{
          const y=Math.round(item.transform[5]);
          if(lastY!==null && Math.abs(y-lastY)>3){
            fullText+=line.trim()+'\n';
            line='';
          }
          line+=item.str+' ';
          lastY=y;
        });
        if(line.trim()) fullText+=line.trim()+'\n';
      }
      console.log('=== PDF RAW TEXT ===');
      console.log(fullText);
      console.log('=== END PDF TEXT ===');
      // Парсим текст из К3
      const mats=parseK3Text(fullText);
      console.log('Parsed materials:',mats);
      if(!mats.length) throw new Error('Не удалось найти материалы в PDF. Откройте консоль (F12) чтобы увидеть извлечённый текст.');
      mats.forEach(m=>addOrderMat(m.name,m.qty,m.price));
      calcOrderSum();
      setImportStatus(`✅ Из PDF загружено ${mats.length} материал(ов)`,'ok');
      setTimeout(()=>closeSpecImport(),1500);
      showToast('Загружено '+mats.length+' материалов из PDF');
    } else {
      // Изображение — пробуем через Claude API (может не работать без VPN)
      setImportStatus('🔄 Отправляю на распознавание...','loading');
      const base64=await fileToBase64(importFile);
      const content=[
        {type:'image', source:{type:'base64',media_type:mediaType||'image/jpeg',data:base64}},
        {type:'text', text:`Это спецификация из К3-Мебель. Извлеки материалы. Ответь ТОЛЬКО JSON: [{"name":"...","qty":1,"unit":"шт","price":0},...]`}
      ];
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,messages:[{role:'user',content}]})
      });
      if(!response.ok) throw new Error('API недоступен (нужен VPN). Скопируйте текст из PDF и вставьте во вкладку "Вставить текст"');
      const data=await response.json();
      const text=data.content?.map(c=>c.text||'').join('')||'';
      const jsonMatch=text.match(/\[[\s\S]*\]/);
      if(!jsonMatch) throw new Error('Не удалось распознать');
      const mats=JSON.parse(jsonMatch[0]);
      if(!mats.length) throw new Error('Материалов не найдено');
      mats.forEach(m=>addOrderMat(m.name,m.qty||1,m.price||matPrice(m.name)||0));
      calcOrderSum();
      setImportStatus(`✅ Распознано ${mats.length} материал(ов)`,'ok');
      setTimeout(()=>closeSpecImport(),1500);
      showToast('Загружено '+mats.length+' материалов');
    }
  }catch(e){
    setImportStatus('❌ '+e.message,'error');
  }
  btn.textContent='🔍 Распознать'; btn.disabled=false;
}

function loadScript(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}

function parseK3Text(text){
  const mats=[];
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  
  const UNITS_RX=/^(шт|кв\.?\s*м|п[\/.]?\s*м|пог\.?\s*м|п\/м|компл\.?|упак\.?|рул\.?|лист|м\.?\s*п|м2|м²)$/i;
  const SKIP_LINES=/^(Заказ|Дата|Наименование|Материалы заказа|№|п\.?п\.?|Ед\.?|изм|Кол-во|Цена|Стоимость)$/i;
  const SECTION_RX=/^(Панели|Комплектующие|Кромки)$/i;
  const ITOGO_RX=/^Итого/i;
  
  const blocks=[];
  let currentBlock=null;
  
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(SKIP_LINES.test(line)) continue;
    if(SECTION_RX.test(line)) continue;
    if(ITOGO_RX.test(line)) continue;
    
    const inlineMatch=line.match(/^(\d{1,3})\s{2,}(.+?)\s{2,}(шт|кв\.?\s*м|п[\/.]?\s*м|пог\.?\s*м|п\/м|компл\.?|упак\.?|рул\.?|лист)\s{2,}([\d.,\s]+)$/i);
    if(inlineMatch){
      if(currentBlock) blocks.push(currentBlock);
      blocks.push({lines:[line], type:'inline'});
      currentBlock=null;
      continue;
    }
    
    if(/^\d{1,3}$/.test(line) && parseInt(line)<200){
      if(currentBlock) blocks.push(currentBlock);
      currentBlock={lines:[], type:'multi'};
      continue;
    }
    
    if(currentBlock){
      currentBlock.lines.push(line);
    }
  }
  if(currentBlock) blocks.push(currentBlock);
  
  blocks.forEach(block=>{
    const bl=block.lines;
    if(!bl.length) return;
    
    if(block.type==='inline'){
      const m=bl[0].match(/^(\d{1,3})\s{2,}(.+?)\s{2,}(шт|кв\.?\s*м|п[\/.]?\s*м|пог\.?\s*м|п\/м|компл\.?|упак\.?|рул\.?|лист)\s{2,}([\d.,\s]+)$/i);
      if(!m) return;
      const name=m[2].replace(/\s*,?\s*Артикул:?\s*.*/gi,'').trim();
      const unit=m[3].replace(/\s/g,'');
      const nums=m[4].split(/\s+/).map(n=>parseFloat(n.replace(',','.'))).filter(n=>!isNaN(n)&&n>=0);
      if(name.length>=3 && nums.length>=1 && nums[0]>0){
        mats.push({name, unit, qty:nums[0], price:nums.length>=2?nums[1]:0});
      }
      return;
    }
    
    let name='', unit='', nums=[];
    
    for(let i=0;i<bl.length;i++){
      const l=bl[i];
      
      const unitLine=l.match(/^(шт|кв\.?\s*м|п[\/.]?\s*м|пог\.?\s*м|п\/м|компл\.?|упак\.?|рул\.?|лист)\s+([\d.,\s]+)$/i);
      if(unitLine){
        unit=unitLine[1].replace(/\s/g,'');
        nums=unitLine[2].split(/\s+/).map(n=>parseFloat(n.replace(',','.'))).filter(n=>!isNaN(n)&&n>=0);
        break;
      }
      if(UNITS_RX.test(l)){
        unit=l.replace(/\s/g,'');
        for(let j=i+1;j<bl.length;j++){
          if(/^[\d.,\s]+$/.test(bl[j])){
            nums.push(...bl[j].split(/\s+/).map(n=>parseFloat(n.replace(',','.'))).filter(n=>!isNaN(n)&&n>=0));
          } else break;
        }
        break;
      }
      if(/^[\d.,\s]+$/.test(l) && !name){continue;}
      if(/^[\d.,\s]+$/.test(l) && name){
        nums=l.split(/\s+/).map(n=>parseFloat(n.replace(',','.'))).filter(n=>!isNaN(n)&&n>=0);
        break;
      }
      name+=(name?' ':'')+l;
    }
    
    name=name.replace(/\s*,?\s*Артикул:?\s*.*/gi,'').replace(/\s+/g,' ').trim();
    if(name.length<3||!nums.length) return;
    const qty=nums[0]||0;
    const price=nums.length>=2?nums[1]:0;
    if(qty>0) mats.push({name,unit:unit||'шт',qty,price});
  });
  
  // Пост-обработка: конвертация кв.м → листы (1 лист ≈ 4.5 кв.м, округление вверх)
  const SHEET_AREA=4.5;
  mats.forEach(m=>{
    if(m.unit&&m.unit.match(/^кв\.?м$/i)){
      m.qtyOriginal=m.qty;
      m.unitOriginal=m.unit;
      m.qty=Math.ceil(m.qty/SHEET_AREA);
      m.unit='шт';
      // Не добавляем конвертацию в название — чтобы не создавать дубли на складе
    }
  });
  
  return mats;
}

function processTextImport(){
  const text=$('imp-text').value.trim();
  if(!text){showToast('Вставьте текст');return;}
  setImportStatus('🔄 Разбираю текст...','loading');
  
  try{
    // Сначала пробуем K3 формат
    const k3mats=parseK3Text(text);
    if(k3mats.length){
      k3mats.forEach(m=>{
        const p=m.price||matPrice(m.name)||0;
        addOrderMat(m.name,m.qty,p);
      });
      calcOrderSum();
      setImportStatus(`✅ Загружено ${k3mats.length} материал(ов) (формат К3)`,'ok');
      setTimeout(()=>closeSpecImport(),1500);
      showToast('Загружено '+k3mats.length+' материалов');
      return;
    }
    
    // Обычный табличный формат
    const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
    let count=0;
    
    lines.forEach(line=>{
      if(line.match(/^(название|материал|наименование|#|№|итого|п\.?п|ед|кол|цена|стоимость)/i)) return;
      const parts=line.split(/\t|;|\s{2,}/).map(p=>p.trim()).filter(Boolean);
      if(parts.length<2) return;
      
      const name=parts[0];
      let qty=1, price=0;
      for(let i=1;i<parts.length;i++){
        const num=parseFloat(parts[i].replace(',','.'));
        if(!isNaN(num)&&num>0){
          if(qty===1&&!parts[i].match(/[₽р]/i)){ qty=num; }
          else { price=num; }
        }
      }
      
      const p=price||matPrice(name)||0;
      addOrderMat(name, qty, p);
      count++;
    });
    
    if(count===0) throw new Error('Не удалось разобрать строки. Проверьте формат.');
    calcOrderSum();
    setImportStatus(`✅ Загружено ${count} материал(ов)`,'ok');
    setTimeout(()=>closeSpecImport(),1500);
    showToast('Загружено '+count+' материалов');
  }catch(e){
    setImportStatus('❌ '+e.message,'error');
  }
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

