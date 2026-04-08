// ══════════════════════════════════════════════════════
// GANTT ПРОИЗВОДСТВА
// ══════════════════════════════════════════════════════
let ganttStart=new Date();
ganttStart.setDate(ganttStart.getDate()-3);
ganttStart.setHours(0,0,0,0);

const STATUS_COLORS={'Отправлено КП':'#185FA5','Новый':'#534AB7','Материал заказан':'#854F0B',
  'В работе':'#2a5c3f','Готов к выдаче':'#16a34a','Отгружен':'#3b82f6',
  'Закрыт':'#6b6a64','Приостановлен':'#8a7340','Рекламация':'#A32D2D','Отказались':'#A32D2D'};

function ganttPrev(){const d=parseInt($('gantt-view').value)||30;ganttStart.setDate(ganttStart.getDate()-d);renderGantt()}
function ganttNext(){const d=parseInt($('gantt-view').value)||30;ganttStart.setDate(ganttStart.getDate()+d);renderGantt()}
function ganttToday(){ganttStart=new Date();ganttStart.setDate(ganttStart.getDate()-3);ganttStart.setHours(0,0,0,0);renderGantt()}

function getActiveStages(o){
  const stages=getOrderStages(o);
  return PROD_STAGES.filter(s=>!stages[s.key]||!stages[s.key].skip);
}

function getCurrentStageGantt(o){
  const stages=getOrderStages(o);
  for(const st of PROD_STAGES){
    if(stages[st.key]&&stages[st.key].skip) continue;
    if(!stages[st.key]||!stages[st.key].done) return st;
  }
  return null; // все завершены
}

function getStageDoneCount(o){
  const stages=getOrderStages(o);
  const active=PROD_STAGES.filter(s=>!stages[s.key]||!stages[s.key].skip);
  const done=active.filter(s=>stages[s.key]&&stages[s.key].done);
  return {done:done.length,total:active.length};
}

function renderGantt(){
  const days=parseInt($('gantt-view').value)||30;
  const filter=$('gantt-filter').value;
  const today=new Date();today.setHours(0,0,0,0);
  const DAY=86400000;
  const end=new Date(ganttStart.getTime()+days*DAY);
  
  // Период label
  const fmt=d=>d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'});
  $('gantt-period-label').textContent=fmt(ganttStart)+' — '+fmt(end);
  
  // Легенда
  let leg='';
  PROD_STAGES.forEach(s=>{
    leg+=`<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:8px;height:8px;border-radius:2px;background:${s.color}"></span>${s.icon}</span>`;
  });
  $('gantt-legend').innerHTML=leg;
  
  // Фильтр заказов
  const INACTIVE=['Закрыт','Отгружен','Отказались'];
  let filtered=orders.filter(o=>{
    const st=(o.status||'').trim();
    if(filter==='active') return !INACTIVE.includes(st)&&st!=='';
    if(filter==='overdue'){
      const dl=pDate(o.deadline);
      return dl&&dl<today&&!INACTIVE.includes(st);
    }
    return true;
  });
  
  // Только заказы в видимом диапазоне
  filtered=filtered.filter(o=>{
    const od=pDate(o.order_date)||pDate(o.deadline);
    const dl=pDate(o.deadline)||pDate(o.order_date);
    if(!od&&!dl) return false;
    const oStart=od||dl, oEnd=dl||od;
    return oEnd>=ganttStart&&oStart<=end;
  });
  
  // Сортировка: просроченные сверху, потом по дате
  filtered.sort((a,b)=>{
    const da=pDate(a.deadline),db=pDate(b.deadline);
    const oa=da&&da<today?0:1, ob=db&&db<today?0:1;
    if(oa!==ob) return oa-ob;
    const sa=pDate(a.order_date)||new Date(0),sb2=pDate(b.order_date)||new Date(0);
    return sa-sb2;
  });
  
  // Загрузка по дням
  const dayLoad={};
  orders.forEach(o=>{
    const st=(o.status||'').trim();
    if(INACTIVE.includes(st)) return;
    const od=pDate(o.order_date),dl=pDate(o.deadline);
    if(!od||!dl) return;
    for(let d=new Date(Math.max(od,ganttStart));d<=Math.min(dl,end);d=new Date(d.getTime()+DAY)){
      const k=d.toISOString().split('T')[0];
      dayLoad[k]=(dayLoad[k]||0)+1;
    }
  });
  
  let loadH='<div style="display:flex;margin-left:160px">';
  for(let i=0;i<days;i++){
    const d=new Date(ganttStart.getTime()+i*DAY);
    const k=d.toISOString().split('T')[0];
    const load=dayLoad[k]||0;
    const isWe=d.getDay()===0||d.getDay()===6;
    const color=isWe?'var(--surface2)':load>4?'#A32D2D':load>2?'#b45309':load>0?'var(--accent)':'var(--surface2)';
    loadH+=`<div style="flex:1;height:14px;background:${color};display:flex;align-items:center;justify-content:center;font-size:7px;color:#fff;font-weight:600" title="${d.toLocaleDateString('ru-RU')}: ${load}">${load||''}</div>`;
  }
  loadH+='</div>';
  $('gantt-load').innerHTML=loadH;
  
  // Gantt table
  const colW=Math.max(24,Math.min(40,Math.floor(600/days)));
  let h=`<div style="min-width:${160+days*colW}px">`;
  
  // Header — дни
  h+=`<div style="display:flex;position:sticky;top:0;z-index:2;background:var(--surface)">`;
  h+=`<div style="min-width:160px;max-width:160px;padding:4px 8px;font-size:10px;font-weight:600;color:var(--text3)">Заказ</div>`;
  for(let i=0;i<days;i++){
    const d=new Date(ganttStart.getTime()+i*DAY);
    const isToday=d.getTime()===today.getTime();
    const isWe=d.getDay()===0||d.getDay()===6;
    const isMon=d.getDay()===1;
    h+=`<div style="width:${colW}px;min-width:${colW}px;text-align:center;font-size:${colW>30?'9':'7'}px;padding:2px 0;color:${isToday?'var(--accent-text)':isWe?'var(--text3)':'var(--text2)'};font-weight:${isToday||isMon?'700':'400'};background:${isToday?'var(--accent-light)':'transparent'};border-left:${isMon?'1px solid var(--border)':'none'}">${d.getDate()}${isMon?'<br>'+['','Пн','Вт','Ср','Чт','Пт','Сб','Вс'][d.getDay()]:''}</div>`;
  }
  h+=`</div>`;
  
  // Rows — заказы
  if(!filtered.length){
    h+=`<div style="padding:20px;color:var(--text3);text-align:center">Нет заказов в этом периоде</div>`;
  }
  
  filtered.forEach(o=>{
    const od=pDate(o.order_date);
    const dl=pDate(o.deadline);
    const st=(o.status||'').trim();
    const isOverdue=dl&&dl<today&&!INACTIVE.includes(st);
    const curStage=getCurrentStageGantt(o);
    const {done,total}=getStageDoneCount(o);
    const pct=total?Math.round(done/total*100):0;
    const srcColors=getSourceColors();
    const srcColor=srcColors[(o.source||'').trim()]||'#6b6a64';
    
    h+=`<div style="display:flex;border-bottom:1px solid var(--border);${isOverdue?'background:var(--red-light)':''}" onclick="openEdit('${o.order_num}')" class="gantt-row">`;
    
    // Левая колонка — инфо заказа
    h+=`<div style="min-width:160px;max-width:160px;padding:6px 8px;cursor:pointer;border-right:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:11px;font-weight:600">${o.order_num}</span>
        ${curStage?`<span style="font-size:10px">${curStage.icon}</span>`:'<span style="font-size:9px;color:var(--accent)">✅</span>'}
      </div>
      <div style="font-size:10px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${o.client||'—'}</div>
      <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
        <div style="flex:1;background:var(--surface2);border-radius:2px;height:3px;overflow:hidden;max-width:60px"><div style="height:100%;width:${pct}%;background:var(--accent)"></div></div>
        <span style="font-size:8px;color:var(--text3)">${done}/${total}</span>
      </div>
    </div>`;
    
    // Правая часть — дни с полоской
    h+=`<div style="display:flex;flex:1;position:relative">`;
    
    // Фоновые ячейки дней
    for(let i=0;i<days;i++){
      const d=new Date(ganttStart.getTime()+i*DAY);
      const isToday2=d.getTime()===today.getTime();
      const isWe2=d.getDay()===0||d.getDay()===6;
      const isMon2=d.getDay()===1;
      h+=`<div style="width:${colW}px;min-width:${colW}px;height:100%;${isToday2?'background:var(--accent-light)':isWe2?'background:var(--surface2)':''};${isMon2?'border-left:1px solid var(--border)':''}"></div>`;
    }
    
    // Bar overlay
    if(od&&dl){
      const barStart=Math.max(0,Math.floor((od-ganttStart)/DAY));
      const barEnd=Math.min(days,Math.ceil((dl-ganttStart)/DAY)+1);
      const barLeft=barStart*colW;
      const barWidth=Math.max(colW,(barEnd-barStart)*colW);
      const barColor=curStage?curStage.color:'var(--accent)';
      
      // Этапы внутри бара — мини-сегменты
      const activeStages=getActiveStages(o);
      const stages=getOrderStages(o);
      let segH='';
      if(barWidth>40&&activeStages.length>0){
        const segW=Math.floor(barWidth/activeStages.length);
        activeStages.forEach((s,si)=>{
          const sd=stages[s.key];
          const isDone=sd&&sd.done;
          segH+=`<div style="width:${segW}px;height:100%;background:${isDone?s.color+'cc':s.color+'22'};display:flex;align-items:center;justify-content:center;font-size:${segW>20?'9':'7'}px" title="${s.name}${isDone?' ✓':''}">${segW>16?s.icon:''}</div>`;
        });
      }
      
      h+=`<div style="position:absolute;top:4px;bottom:4px;left:${barLeft}px;width:${barWidth}px;border-radius:4px;overflow:hidden;display:flex;border:1px solid ${isOverdue?'var(--red)':barColor+'44'};cursor:pointer" title="${o.order_num} — ${o.client}\n${curStage?curStage.name:'Завершён'} (${pct}%)">`;
      if(segH) h+=segH;
      else h+=`<div style="flex:1;background:${barColor}33"></div>`;
      h+=`</div>`;
      
      // Дедлайн маркер
      const dlDay=Math.floor((dl-ganttStart)/DAY);
      if(dlDay>=0&&dlDay<days){
        h+=`<div style="position:absolute;top:0;bottom:0;left:${dlDay*colW+colW-1}px;width:2px;background:${isOverdue?'var(--red)':'var(--amber)'}" title="Дедлайн"></div>`;
      }
    }
    
    h+=`</div></div>`;
  });
  
  h+=`</div>`;
  $('gantt-body').innerHTML=h;
}

