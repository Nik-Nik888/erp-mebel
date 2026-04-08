// ── NAV ───────────────────────────────────────────────
function toggleSidebar(){
  const sb2=$('sidebar');
  sb2.classList.toggle('collapsed');
  localStorage.setItem('k2_sidebar_collapsed',sb2.classList.contains('collapsed')?'1':'0');
}
// Восстанавливаем состояние из localStorage
if(localStorage.getItem('k2_sidebar_collapsed')==='1'){
  document.addEventListener('DOMContentLoaded',()=>{const s=$('sidebar');if(s)s.classList.add('collapsed')});
}

function showPage(p, el){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item,.mnav-btn').forEach(x=>x.classList.remove('active'));
  $('page-'+p).classList.add('active');
  if(el) el.classList.add('active');
  if(p==='kp'){
    if(!kpInited){ initKp(); kpInited=true }
    // Убедимся что данные склада загружены для материалов КП
    if(!skladItems.length) loadSkladSilent();
  }
  if(p==='sklad') loadSklad();
  if(p==='expenses') loadExpenses();
  if(p==='analytics'){
    if(!analyticsInited){ setAPeriod('year'); analyticsInited=true; }
    else renderAnalytics();
  }
  if(p==='users') loadUsers();
  if(p==='crm') loadClients();
  if(p==='dashboard') renderDashboard();
  if(p==='calendar') renderGantt();
  if(p==='workshop') renderWorkshop();
  if(p==='payroll') initPayroll();
  if(p==='audit') loadAuditLog();
}
function syncMobNav(p){
  document.querySelectorAll('.mnav-btn').forEach(x=>x.classList.remove('active'));
  const el=$('mn-'+p); if(el) el.classList.add('active');
  // Закрываем меню "Ещё"
  const more=$('mob-more-menu');if(more)more.style.display='none';
}

function toggleMobMore(){
  const m=$('mob-more-menu');
  if(!m) return;
  const show=m.style.display==='none';
  m.style.display=show?'':'none';
  if(show){
    setTimeout(()=>{
      document.addEventListener('click',function closeMobMore(e){
        if(!m.contains(e.target)&&e.target.id!=='mn-more'){
          m.style.display='none';
          document.removeEventListener('click',closeMobMore);
        }
      });
    },10);
  }
}

