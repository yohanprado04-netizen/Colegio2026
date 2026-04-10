/**
 * app.js — EduSistema Pro v5  |  Lógica de UI y cálculos
 * ═══════════════════════════════════════════════════════
 *
 * Este archivo contiene SOLO la lógica de interfaz, cálculos académicos,
 * generación de PDF/Excel y renderizado de vistas.
 *
 * Las funciones marcadas con  "SOBREESCRITA por api-layer.js"
 * son stubs vacíos aquí.  La implementación real (con fetch al backend
 * Node.js/MongoDB) está en api-layer.js, que se carga DESPUÉS de este
 * archivo en el HTML.
 *
 * ─── Dependencias (cargadas antes en index.html) ────────────────
 *   SweetAlert2   →  alertas y modales
 *   SheetJS       →  exportar Excel
 *   html2pdf.js   →  boletines PDF
 *
 * ─── Variables globales que api-layer.js necesita ───────────────
 *   DB            →  objeto principal de datos
 *   CU            →  usuario actual (Current User)
 *   TokenStore    →  manejado desde api-layer.js
 *   _sessionTimer →  temporizador de inactividad
 */
'use strict';


/* ============================================================
   BASE DE DATOS — GUÍA DE INTEGRACIÓN EXTERNA
   ============================================================
   CON api-layer.js: La BD se guarda en MongoDB vía el backend Node.js.
   La clave de almacenamiento es: 'edusistema_v5'
   (Solo aplica en modo offline; con api-layer.js los datos van a MongoDB)

   PARA CONECTAR UNA BD EXTERNA (Firebase, Supabase, REST API):
   ============================================================
   HAY DOS FUNCIONES QUE DEBES REEMPLAZAR:

   1. dbLoad() — SE LLAMA AL INICIAR LA APP
      Reemplaza el contenido con una llamada a tu API:
      Ejemplo Firebase Firestore:
        const snap = await db.collection('edusistema').doc('datos').get();
        DB = snap.data();

   2. dbSave() — SE LLAMA CADA VEZ QUE HAY UN CAMBIO
      Reemplaza con escritura a tu API:
      Ejemplo Firebase Firestore:
        await db.collection('edusistema').doc('datos').set(DB);
      Ejemplo REST:
        await fetch('/api/db', {method:'PUT', body:JSON.stringify(DB)});

   ESTRUCTURA DEL OBJETO DB:
   ┌─────────────────────────────────────────────────────────┐
   │ DB.admin         → {id, nombre, ti, usuario, password, role}
   │ DB.profs[]       → [{id, nombre, ti, usuario, password, role,
   │                       salones[], materias[], ciclo}]
   │ DB.ests[]        → [{id, nombre, ti, usuario, password, role,
   │                       salon, ciclo, blocked}]
   │ DB.mP[]          → materias de primaria ['Matemáticas', ...]
   │ DB.mB[]          → materias de bachillerato
   │ DB.pers[]        → periodos ['Periodo 1', 'Periodo 2', ...]
   │ DB.sals[]        → salones [{nombre, ciclo, mats:{profId,mats[]}}]
   │ DB.notas{}       → {estId: {periodo: {materia: {a,c,r}}}}
   │                     a=aptitud(60%) c=actitud(20%) r=resp(20%)
   │ DB.dr            → {s:'YYYY-MM-DD', e:'YYYY-MM-DD'} rango global notas
   │ DB.drPer{}       → {periodo: {s, e, extPer}} rango por periodo
   │ DB.ext           → {on:bool, s:'YYYY-MM-DD', e:'YYYY-MM-DD'}
   │ DB.ups{}         → {estId: [{id, nombre, materia, periodo, profId,
   │                       profNombre, desc, fecha, size, type,
   │                       dataUrl, revisado, revisadoTs}]}
   │ DB.asist{}       → {fecha: {salon: {estId: bool}}}
   │ DB.exc[]         → [{id, estId, estNombre, salon, profId,
   │                       causa, texto, fecha, hora, leida}]
   │ DB.vclases[]     → [{id, salon, profId, titulo, url, fecha}]
   │ DB.recs[]        → recuperaciones ACTIVAS del periodo actual
   │ DB.planes[]      → planes de recuperación ACTIVOS
   │ DB.histRecs[]    → recuperaciones ARCHIVADAS de periodos anteriores
   │ DB.histPlanes[]  → planes ARCHIVADOS de periodos anteriores
   │ DB.audit[]       → [{ts, uid, user, role, accion, extra}]
   │ DB.blk{}         → {usuario: {on:bool, ts}}
   │ DB.estHist[]     → historial de estudiantes registrados
   └─────────────────────────────────────────────────────────┘

   NOTA: dataUrl contiene archivos en base64. Para BD externa
   se recomienda subir los archivos a un storage separado
   (Firebase Storage, S3, Cloudinary) y guardar solo la URL.
   ============================================================ */
const DBK='edusistema_v5'; // Solo usado en modo offline (sin api-layer.js)
let DB={},CU=null;
const FA={};

/* ── SOBREESCRITA por api-layer.js ── */
async function dbLoad(){ /* implementado en api-layer.js */ }
function dbSave(){ /* implementado en api-layer.js */ }
function dfP(){return['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'];}
function dfB(){return['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte'];}
function dfPer(){return['Periodo 1','Periodo 2','Periodo 3','Periodo 4'];}

function dbInit(){
  const ests=[];
  for(let i=1;i<=10;i++)
    ests.push({id:'est'+i,nombre:'Estudiante '+i,ti:'TI-'+String(100000+i),
      usuario:'est'+i,password:'est'+i+'123',role:'est',salon:'',blocked:false});
  const notas={};
  ests.forEach(e=>{notas[e.id]=mkN(dfPer(),[...dfP(),...dfB()]);});
  DB={
    // ─── CREDENCIALES DE ADMINISTRADOR ──────────────────────────
    // Usuario: admin  |  Contraseña: admin123
    // En MongoDB estas credenciales las crea scripts/seed.js del backend.
    // Este objeto solo se usa en modo OFFLINE (sin api-layer.js).
    admin:{id:'admin',nombre:'Administrador',ti:'CC-000001',
      usuario:'admin',password:'admin123',role:'admin'},
    profs:[],ests,mP:dfP(),mB:dfB(),pers:dfPer(),sals:[],notas,
    audit:[],blk:{},dr:{s:'',e:''},drPer:{},ext:{on:false,s:'',e:''},
    ups:{},asist:{},exc:[],vclases:[],recs:[],planes:[],histRecs:[],histPlanes:[],
    anoActual:String(new Date().getFullYear()),
    notasPorAno:{[String(new Date().getFullYear())]:JSON.parse(JSON.stringify(notas))},
    estHist:ests.map(e=>({id:e.id,nombre:e.nombre,ti:e.ti||'',salon:'',registrado:new Date().toLocaleDateString('es-CO'),activo:true}))
  };
  dbSave();
}

/* Scaffold: {per:{mat:{a,c,r}}} — a=aptitud60%, c=actitud20%, r=resp20% */
function mkN(pers,mats){
  const n={};
  pers.forEach(p=>{n[p]={};mats.forEach(m=>{n[p][m]={a:0,c:0,r:0};});});
  return n;
}

function syncN(eid){
  if(!DB.notas[eid]) DB.notas[eid]={};
  const mats=getMats(eid);
  DB.pers.forEach(p=>{
    if(!DB.notas[eid][p]) DB.notas[eid][p]={};
    mats.forEach(m=>{
      if(!DB.notas[eid][p][m]||typeof DB.notas[eid][p][m]!=='object')
        DB.notas[eid][p][m]={a:0,c:0,r:0};
    });
  });
}

function cicloOf(sname){return DB.sals.find(s=>s.nombre===sname)?.ciclo||'bachillerato';}

/* getMats: returns subjects for a student.
   For bachillerato: if any professor has salonMaterias[salon], use union of those materias.
   Otherwise fall back to global mB list. Primaria always uses mP. */
function getMats(eid){
  const e=DB.ests.find(x=>x.id===eid);
  if(!e) return[...DB.mB];
  const sal=DB.sals.find(s=>s.nombre===e.salon);
  /* If salon has its own custom subject list, use it (works for both ciclos) */
  if(sal?.mats&&sal.mats.length) return[...sal.mats];
  /* Fallback: ciclo-wide defaults */
  if(cicloOf(e.salon)==='primaria') return[...DB.mP];
  /* Bach: collect materias assigned to this specific salon via profs */
  const salonMats=getSalonMats(e.salon);
  return salonMats.length?salonMats:[...DB.mB];
}

/* Get list of subjects assigned to a specific salon (union across all professors) */
function getSalonMats(salon){
  const set=new Set();
  DB.profs.forEach(p=>{
    if(p.ciclo!=='bachillerato') return;
    const sm=p.salonMaterias||{};
    if(sm[salon]) sm[salon].forEach(m=>set.add(m));
    else if((p.salones||[]).includes(salon)&&(p.materias||[]).length)
      (p.materias||[]).forEach(m=>set.add(m)); /* legacy compat */
  });
  return[...set];
}

/* Get materias a specific professor teaches in a specific salon */
function getProfMatsSalon(profId,salon){
  const p=DB.profs.find(x=>x.id===profId);if(!p)return[];
  /* Check if salon has its own custom subjects */
  const sal=DB.sals.find(s=>s.nombre===salon);
  if(sal?.mats&&sal.mats.length){
    if(p.ciclo==='primaria') return[...sal.mats];
    /* Bach: intersect prof's salonMaterias with salon's mats */
    const sm=(p.salonMaterias||{})[salon]||[];
    const filtered=sm.filter(m=>sal.mats.includes(m));
    return filtered.length?filtered:sm;
  }
  if(p.ciclo==='primaria') return getMats(DB.ests.find(e=>e.salon===salon)?.id||'');
  const sm=p.salonMaterias||{};
  if(sm[salon]&&sm[salon].length) return sm[salon];
  return p.materias||[];
}

/* Definitiva = 60%a + 20%c + 20%r */
function def(t){return+((t.a||0)*.6+(t.c||0)*.2+(t.r||0)*.2).toFixed(2);}

function pprom(eid,per){
  syncN(eid);
  const mats=getMats(eid);
  if(!DB.notas[eid][per]) return 0;
  const ds=mats.map(m=>def(DB.notas[eid][per][m]||{a:0,c:0,r:0}));
  return+(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(2);
}
function gprom(eid){
  const act=DB.pers.filter(p=>pprom(eid,p)>0);
  if(!act.length) return 0;
  return+(act.reduce((s,p)=>s+pprom(eid,p),0)/act.length).toFixed(2);
}
function matPerd(eid){
  return getMats(eid).filter(m=>{
    const act=DB.pers.filter(p=>{const t=DB.notas[eid]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length) return false;
    return act.reduce((s,p)=>s+def(DB.notas[eid][p][m]),0)/act.length<3;
  });
}
function puestoS(eid){
  const e=DB.ests.find(x=>x.id===eid);if(!e?.salon) return'-';
  const c=ebySalon(e.salon).map(x=>({id:x.id,p:gprom(x.id)})).sort((a,b)=>b.p-a.p);
  const i=c.findIndex(x=>x.id===eid);return i>=0?i+1:'-';
}
function puestoP(eid,per){
  const e=DB.ests.find(x=>x.id===eid);if(!e?.salon) return'-';
  const c=ebySalon(e.salon).map(x=>({id:x.id,p:pprom(x.id,per)})).sort((a,b)=>b.p-a.p);
  const i=c.findIndex(x=>x.id===eid);return i>=0?i+1:'-';
}

/* ============================================================
   HELPERS
============================================================ */
function scC(n){n=+n;if(n===0)return'sc scz';if(n<3)return'sc scr';if(n<4)return'sc sco';if(n<=4.5)return'sc scg';return'sc scb';}
function scCol(n){n=+n;if(n===0)return'#a0aec0';if(n<3)return'var(--red)';if(n<4)return'var(--ora)';if(n<=4.5)return'var(--grn)';return'var(--nsc)';}
function today(){return new Date().toISOString().split('T')[0];}
function notasOk(per){
  if(CU?.role==='admin'||CU?.role==='superadmin') return true;
  const t=today();
  /* Extraordinary period active → only open the period mapped as extPer */
  if(CU?.role==='profe'&&DB.ext?.on){
    if(per){
      /* Find if this period is the ext-mapped target for ANY period config */
      const isExtTarget=Object.values(DB.drPer||{}).some(dp=>dp.extPer===per);
      if(isExtTarget) return true;
      /* If per has its own range that's still open, also allow */
      const dp=DB.drPer?.[per];
      if(dp?.s&&dp?.e) return t>=dp.s&&t<=dp.e;
      /* Not the ext target and no open range → blocked */
      return false;
    }
    /* No period specified → allow (backward compat for places that don't pass per) */
    return true;
  }
  /* Per-period range check */
  if(per&&DB.drPer?.[per]){
    const{s,e}=DB.drPer[per];
    if(s&&e) return t>=s&&t<=e;
  }
  /* Global range fallback */
  const dr=DB.dr||{};const{s,e}=dr;if(!s||!e) return true;
  return t>=s&&t<=e;
}
/* Excusas window: open 18:00–07:00 */
function excusasOk(){
  const h=new Date().getHours();
  return h>=18||h<7;
}
function ebySalon(salon){
  return DB.ests.filter(e=>e.salon===salon).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
function estsByCiclo(ciclo){
  const sn=DB.sals.filter(s=>s.ciclo===ciclo).map(s=>s.nombre);
  let list=ciclo==='primaria'
    ?DB.ests.filter(e=>!e.salon||sn.includes(e.salon))
    :DB.ests.filter(e=>sn.includes(e.salon));
  return list.sort((a,b)=>{
    if(a.salon!==b.salon) return(a.salon||'').localeCompare(b.salon||'','es');
    return a.nombre.localeCompare(b.nombre,'es');
  });
}
function profForMat(mat,salon){
  /* Bach: first check salonMaterias[salon], then global materias */
  const bp=DB.profs.find(p=>{
    if(p.ciclo!=='bachillerato') return false;
    if(!(p.salones||[]).includes(salon)) return false;
    const sm=(p.salonMaterias||{})[salon];
    if(sm&&sm.length) return sm.includes(mat);
    return(p.materias||[]).includes(mat);
  });
  if(bp) return bp;
  /* Primaria: any prof in that salon */
  return DB.profs.find(p=>p.ciclo==='primaria'&&(p.salones||[]).includes(salon))||null;
}
function profsInSalon(salon){
  return DB.profs.filter(p=>(p.salones||[]).includes(salon));
}
function uExists(u){
  return DB.admin.usuario===u||!!DB.profs.find(p=>p.usuario===u)||!!DB.ests.find(e=>e.usuario===u);
}
/* DOM */
function q(s){return document.querySelector(s);}
function qq(s){return[...document.querySelectorAll(s)];}
function gi(x){return document.getElementById(x);}
function sw(icon,title='',text='',timer=0){
  const o={icon,title,text};
  if(timer){o.timer=timer;o.showConfirmButton=false;o.timerProgressBar=true;}
  return Swal.fire(o);
}
function auditLog(estN,campo,oldV,newV){ /* implementado en api-layer.js */ }
function sF(fields){
  return fields.map(f=>`<div style="text-align:left;margin-bottom:10px">
    <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:4px">${f.lb}</label>
    <input id="${f.id}" type="${f.tp||'text'}" class="swal2-input"
      value="${f.val||''}" placeholder="${f.lb}"
      style="margin:0;width:100%;box-sizing:border-box;height:38px;font-size:13px">
  </div>`).join('');
}

/* ============================================================
   AUTH
============================================================ */
/* ============================================================
   SEGURIDAD — HASHING, SANITIZACIÓN, SESIÓN
============================================================ */
/* SHA-256 hash asíncrono (Web Crypto API, nativo en todos los browsers modernos) */
async function sha256(str){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
/* Sanitiza cualquier string antes de insertarlo en innerHTML — previene XSS */
function esc(str){
  if(str==null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;');
}
/* Hash de contraseña con sal estática de instancia — migración transparente */
const SALT='EduSistema_v5_2026';
async function hashPwd(raw){
  if(!raw) return '';
  /* Ya hasheado (64 hex chars) → retornar sin cambio */
  if(/^[0-9a-f]{64}$/.test(raw)) return raw;
  return sha256(SALT+raw);
}
async function verifyPwd(raw,stored){
  const h=await hashPwd(raw);
  /* Acepta tanto hash como plaintext durante migración */
  return h===stored||raw===stored;
}
/* Migrar contraseñas en texto plano a hash (solo en modo OFFLINE sin api-layer.js).
   Con api-layer.js el backend maneja el hashing en MongoDB. */
async function migratePasswords(){
  let changed=false;
  const migrate=async arr=>{
    for(const u of arr){
      if(u.password&&!/^[0-9a-f]{64}$/.test(u.password)){
        u.password=await hashPwd(u.password);changed=true;
      }
    }
  };
  if(DB.admin&&!/^[0-9a-f]{64}$/.test(DB.admin.password||'')){
    DB.admin.password=await hashPwd(DB.admin.password);changed=true;
  }
  await migrate(DB.profs||[]);
  await migrate(DB.ests||[]);
  if(changed) dbSave();
}

/* ---- Sesión con inactividad ---- */
let _sessionTimer=null;
const SESSION_TIMEOUT=20*60*1000; /* 20 minutos */
function resetSessionTimer(){
  clearTimeout(_sessionTimer);
  if(!CU) return;
  _sessionTimer=setTimeout(()=>{
    if(CU){
      logAudit('Sesión cerrada por inactividad');
      doLogout();
      Swal.fire({icon:'info',title:'Sesión expirada',
        text:'Tu sesión fue cerrada por inactividad (20 minutos).',confirmButtonText:'Aceptar'});
    }
  },SESSION_TIMEOUT);
}
/* Escuchar cualquier interacción del usuario */
['click','keydown','mousemove','touchstart'].forEach(ev=>
  document.addEventListener(ev,()=>{if(CU)resetSessionTimer();},{passive:true}));
/* ── 1. AGREGAR EN ROLE_MAP (reemplaza la línea de ROLE_MAP completa) ── */
const ROLE_MAP={
  superadmin:new Set(['sadash','sacolegios','saestadisticas','saauditoria','samantenimiento','saplan','sasug']),
  admin:new Set(['dash','asal','apri','abac','aprf','amat','anot','areh','afec','ablk','aaud','aexp','aexc','avcl','ahist','asug']),
  profe:new Set(['ph','pnot','past','pvir','ptar','prec','phist','psug']),
  est:new Set(['eb','east','etare','eexc','eprof','evir','ereh','ehist','esug'])
};
/* ── 2. REEMPLAZA canAccess ── */
function canAccess(pid){
  if(!CU) return false;
  if(CU.role==='superadmin') return ROLE_MAP.superadmin.has(pid);
  const role=CU.role==='admin'?'admin':CU.role==='profe'?'profe':'est';
  return ROLE_MAP[role]?.has(pid)??false;
}
/* Valida CU contra DB (protege contra manipulación de CU en consola) */
function validateSession(){
  if(!CU) return false;
  if(!window.TokenStore?.get()){ doLogout(); return false; }
  return true;
}

/* ── SOBREESCRITA por api-layer.js ── */
async function doLogin(){ /* implementado en api-layer.js */ }
async function findUser(u,p){
  /* Check admin */
  if(DB.admin.usuario===u&&await verifyPwd(p,DB.admin.password)) return DB.admin;
  /* Check profs */
  for(const x of DB.profs||[]){
    if(x.usuario===u&&await verifyPwd(p,x.password)) return x;
  }
  /* Check students */
  for(const x of DB.ests||[]){
    if(x.usuario===u&&await verifyPwd(p,x.password)) return x;
  }
  return null;
}
/* ── SOBREESCRITA por api-layer.js ── */
function doLogout(){ /* implementado en api-layer.js */ }
function logAuditAnon(usuario,msg){ /* implementado en api-layer.js */ }

/* ============================================================
   BOOT & NAVIGATION
============================================================ */
const PL={
  sadash:'Panel Global', sacolegios:'Colegios & Admins', saplan:'Plan de Estudios',
  saestadisticas:'Estadísticas Globales', saauditoria:'Auditoría Global',
  samantenimiento:'Mantenimiento', sasug:'Sugerencias Recibidas',
  dash:'Panel General',asal:'Salones & Grados',apri:'Primaria (1°-5°)',abac:'Bachillerato (6°-11°)',
  aprf:'Profesores',amat:'Materias & Periodos',anot:'Gestión de Notas',areh:'Recuperaciones',
  afec:'Control de Fechas',ablk:'Usuarios Bloqueados',aaud:'Auditoría',aexp:'Exportar',ahist:'Historial Estudiantes',
  aexc:'Excusas (Admin)',avcl:'Clases Virtuales (Admin)',asug:'Sugerencias',
  ph:'Mi Panel',pnot:'Ingresar Notas',past:'Asistencias',pvir:'Clases Virtuales',ptar:'Tareas Recibidas',prec:'Recuperaciones',phist:'Historial Recuperaciones',psug:'Sugerencias',
  eb:'Mi Boletín',east:'Mi Asistencia',etare:'Tareas & Talleres',
  eexc:'Excusas',eprof:'Mis Profesores',ereh:'Mi Recuperación',evir:'Mis Clases Virtuales',
  ehist:'Historial Recuperaciones',esug:'Sugerencias'
};

function bootApp(){
  if(!CU||!CU.role){console.error('[bootApp] CU no disponible');return;}
  if(!DB) DB={dr:{s:'',e:''},drPer:{},ext:{on:false,s:'',e:''},pers:[],mP:[],mB:[],sals:[],profs:[],ests:[],notas:{},asist:{},exc:[],vclases:[],recs:[],planes:[],histRecs:[],histPlanes:[],audit:[],blk:{},ups:{}};
  gi('tbDate').textContent=new Date().toLocaleDateString('es-CO',
    {weekday:'short',year:'numeric',month:'short',day:'numeric'});
  const st=gi('tbStatus');
  if(notasOk()){st.className='tbst tbop';st.textContent='✓ Notas Abiertas';}
  else{st.className='tbst tbcl';st.textContent='✗ Notas Cerradas';}
  gi('sbUser').innerHTML=`<div class="sbav">${(CU.nombre||'?')[0].toUpperCase()}</div>
  <div>
    <div class="sbun">${CU.nombre}</div>
    <div class="sbur">${CU.role==='superadmin'?'Super Admin':(CU.colegioNombre?CU.colegioNombre+' · '+CU.role:CU.role)}</div>
  </div>`;
  buildNav();
  goto(defPg());
  /* Notify student about extraordinary period changes */
  if(CU.role==='est') notifyExtPeriod();
}
/* Notify student if extraordinary period opened or closed since last login */
function notifyExtPeriod(){
  const mp=matPerd(CU.id);
  const esElegible=mp.length>=1&&mp.length<=2;
  const KEY='extSeen_'+CU.id;
  const prev=JSON.parse(localStorage.getItem(KEY)||'null');
  const curr={on:DB.ext.on,s:DB.ext.s,e:DB.ext.e};
  const now=new Date().toLocaleDateString('es-CO');

  /* Detect changes */
  const abrioAhora =!prev?.on && curr.on;
  const cerroAhora  = prev?.on && !curr.on;
  const fechasCambiaron = prev?.on && curr.on && (prev.s!==curr.s || prev.e!==curr.e);

  /* Save current state */
  localStorage.setItem(KEY, JSON.stringify(curr));

  if(!esElegible) return; /* Only notify students with ≤2 failed subjects */

  if(abrioAhora){
    Swal.fire({
      icon:'warning',
      title:'🔄 ¡Periodo de Recuperación Abierto!',
      html:`<div style="font-family:var(--fn);text-align:left">
        <p>Tienes <strong style="color:#c53030">${mp.length}</strong> materia(s) en recuperación:</p>
        <div style="margin:10px 0">${mp.map(m=>`<span class="bdg brd" style="margin:3px">${m}</span>`).join('')}</div>
        <p>📅 Periodo extraordinario:<br>
          <strong>${curr.s}</strong> → <strong>${curr.e}</strong>
        </p>
        <p style="font-size:13px;color:#718096">Ve a <em>Mi Recuperación</em> para enviar tus trabajos al docente.</p>
      </div>`,
      confirmButtonText:'Ir a Mi Recuperación',
      showCancelButton:true,cancelButtonText:'Más tarde',
      confirmButtonColor:'var(--nv)'
    }).then(r=>{if(r.isConfirmed) goto('ereh');});
  } else if(cerroAhora){
    Swal.fire({
      icon:'info',
      title:'🔒 Periodo de Recuperación Cerrado',
      html:`<div style="font-family:var(--fn)">
        <p>El periodo extraordinario de recuperación <strong>ha finalizado</strong>.</p>
        <p style="font-size:13px;color:#718096">Si tienes dudas sobre tu estado, consulta con tu docente o el administrador.</p>
      </div>`,
      confirmButtonText:'Entendido',confirmButtonColor:'var(--nv)'
    });
  } else if(fechasCambiaron){
    Swal.fire({
      icon:'info',
      title:'📅 Fechas de Recuperación Actualizadas',
      html:`<div style="font-family:var(--fn);text-align:left">
        <p>Las fechas del periodo de recuperación cambiaron:</p>
        <p>📅 Nuevo rango: <strong>${curr.s}</strong> → <strong>${curr.e}</strong></p>
        <p style="font-size:13px;color:#718096">Consulta <em>Mi Recuperación</em> para más detalles.</p>
      </div>`,
      confirmButtonText:'Ver Recuperación',
      showCancelButton:true,cancelButtonText:'OK',
      confirmButtonColor:'var(--nv)'
    }).then(r=>{if(r.isConfirmed) goto('ereh');});
  } else if(curr.on){
    /* Period already open — check for unread plans */
    const planesNuevos=(DB.planes||[]).filter(p=>p.estId===CU.id&&!p.visto);
    /* Deduplicate notification by materia for display only */
    const matsMostrar=[...new Set(planesNuevos.map(p=>p.materia))];
    const nb=gi('ni_ereh');
    if(planesNuevos.length){
      /* Show alert for new plan */
      Swal.fire({
        icon:'success',
        title:'📋 ¡Tu docente envió un Plan de Recuperación!',
        html:`<div style="font-family:var(--fn);text-align:left">
          <p>Tienes <strong>${planesNuevos.length}</strong> plan(es) nuevo(s) de recuperación:</p>
          <div style="margin:10px 0">${matsMostrar.map(mat=>{
            const pls=planesNuevos.filter(p=>p.materia===mat);
            return`<div style="padding:8px 12px;background:#f0fff4;border-radius:7px;border:1px solid #9ae6b4;margin-bottom:6px">
              <strong>${mat}</strong> — ${pls[0].profNombre}<br>
              <span style="font-size:12px;color:#276749">${pls.length} plan(es): ${pls.map(p=>p.titulo).join(' · ')}</span>
            </div>`;}).join('')}
          </div>
          <p style="font-size:13px;color:#718096">Ve a <em>Mi Recuperación</em> para ver el plan completo y enviar tu trabajo.</p>
        </div>`,
        confirmButtonText:'Ver Mi Recuperación',
        showCancelButton:true,cancelButtonText:'Más tarde',
        confirmButtonColor:'var(--nv)'
      }).then(r=>{if(r.isConfirmed)goto('ereh');});
    } else {
      /* No new plans — just show the dot if period is open */
      if(nb&&!nb.querySelector('.notif-dot')){
        nb.insertAdjacentHTML('beforeend','<span class="notif-dot" style="display:inline-block;width:8px;height:8px;background:#e53e3e;border-radius:50%;margin-left:6px;vertical-align:middle"></span>');
      }
    }
    /* Also add dot for unread plan regardless */
    if(planesNuevos.length&&nb&&!nb.querySelector('.notif-dot')){
      nb.insertAdjacentHTML('beforeend','<span class="notif-dot" style="display:inline-block;width:8px;height:8px;background:#38a169;border-radius:50%;margin-left:6px;vertical-align:middle"></span>');
    }
  }
}
function defPg(){
  if(CU.role==='superadmin') return 'sadash';
  return CU.role==='admin'?'dash':CU.role==='profe'?'ph':'eb';
}
function navItems(){
  if(CU.role==='superadmin') return[
    {s:'Super Admin'},{id:'sadash',ic:'🌐',lb:'Panel Global'},
    {id:'sacolegios',ic:'🏫',lb:'Colegios & Admins'},
    {s:'Académico'},{id:'saplan',ic:'📖',lb:'Plan de Estudios'},
    {s:'Supervisión'},{id:'saestadisticas',ic:'📊',lb:'Estadísticas'},
    {id:'saauditoria',ic:'🔍',lb:'Auditoría Global'},
    {s:'Sistema'},{id:'samantenimiento',ic:'⚙️',lb:'Mantenimiento'},
    {id:'sasug',ic:'💡',lb:'Sugerencias Recibidas'},
  ];

  if(CU.role==='admin') return[
    {s:'Principal'},{id:'dash',ic:'📊',lb:'Panel General'},
    {s:'Académico'},{id:'asal',ic:'🏫',lb:'Salones & Grados'},
    {id:'apri',ic:'📚',lb:'Primaria (1°-5°)'},{id:'abac',ic:'🎓',lb:'Bachillerato (6°-11°)'},
    {id:'aprf',ic:'👩‍🏫',lb:'Profesores'},{id:'amat',ic:'📖',lb:'Materias & Periodos'},
    {s:'Notas'},{id:'anot',ic:'📝',lb:'Gestión de Notas'},{id:'areh',ic:'🔄',lb:'Recuperaciones'},
    {s:'Comunicación'},{id:'aexc',ic:'✉️',lb:'Excusas'},{id:'avcl',ic:'💻',lb:'Clases Virtuales'},
    {s:'Sistema'},{id:'afec',ic:'📅',lb:'Control de Fechas'},
    {id:'ablk',ic:'🔒',lb:'Usuarios Bloqueados'},
    {id:'aaud',ic:'🔍',lb:'Auditoría'},{id:'aexp',ic:'📤',lb:'Exportar'},{id:'ahist',ic:'📚',lb:'Historial'},
    {s:'Comunicación Extra'},{id:'asug',ic:'💡',lb:'Sugerencias'},
  ];
  if(CU.role==='profe') return[
    {s:'Mi Panel'},{id:'ph',ic:'🏠',lb:'Inicio'},
    {id:'pnot',ic:'📝',lb:'Ingresar Notas'},{id:'past',ic:'✅',lb:'Asistencias'},
    {id:'pvir',ic:'💻',lb:'Clases Virtuales'},
    {id:'ptar',ic:'📂',lb:'Tareas Recibidas'},
    {id:'prec',ic:'🔄',lb:'Recuperaciones'},
    {id:'phist',ic:'📚',lb:'Historial Recuperaciones'},
    {id:'psug',ic:'💡',lb:'Sugerencias'},
  ];
  /* estudiante */
  const it=[
    {s:'Mi Perfil'},{id:'eb',ic:'📋',lb:'Mi Boletín'},{id:'east',ic:'✅',lb:'Mi Asistencia'},
    {id:'etare',ic:'📎',lb:'Tareas & Talleres'},{id:'eexc',ic:'✉️',lb:'Excusas'},
    {id:'eprof',ic:'👩‍🏫',lb:'Mis Profesores'},{id:'evir',ic:'💻',lb:'Mis Clases Virtuales'},
    {id:'ehist',ic:'📚',lb:'Historial Recuperaciones'},
    {id:'esug',ic:'💡',lb:'Sugerencias'},
  ];
  const mp=matPerd(CU.id);
  if(DB.ext.on&&mp.length>=1&&mp.length<=2) it.push({id:'ereh',ic:'🔄',lb:'Mi Recuperación'});
  return it;
}
function buildNav(){
  const nav=gi('sbNav');nav.innerHTML='';
  navItems().forEach(it=>{
    if(it.s){nav.insertAdjacentHTML('beforeend',`<div class="sbsc">${it.s}</div>`);}
    else{
      const b=document.createElement('button');b.className='sbi';b.id='ni_'+it.id;
      b.innerHTML=`<span class="ic">${it.ic}</span>${it.lb}`;
      b.onclick=()=>goto(it.id);nav.appendChild(b);
    }
  });
  /* Add notification dots after nav is built */
  if(CU.role==='profe'&&DB.ext.on){
    const pendRec=(DB.recs||[]).filter(r=>r.profId===CU.id&&!r.revisado).length;
    if(pendRec){const nb=gi('ni_prec');if(nb&&!nb.querySelector('.notif-dot'))
      nb.insertAdjacentHTML('beforeend',`<span class="notif-dot" style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:#e53e3e;border-radius:9px;margin-left:auto;font-size:10px;font-weight:800;color:#fff;padding:0 4px">${pendRec}</span>`);
    }
  }
}
function goto(pid){
  if(!validateSession()) return;
  if(!canAccess(pid)){
    logAudit('Acceso denegado a panel',`pid:${pid}`);
    sw('error','Acceso no autorizado');return;
  }
  qq('.sbi').forEach(b=>b.classList.remove('on'));
  const btn=gi('ni_'+pid);if(btn)btn.classList.add('on');
  gi('tbTitle').textContent=PL[pid]||pid;
  gi('contentArea').innerHTML=renderPg(pid);
  initPg(pid);
}
function renderPg(pid){
  const map={
    dash:pgDash,asal:pgASal,apri:()=>pgAEst('primaria'),abac:()=>pgAEst('bachillerato'),
    aprf:pgAPrf,amat:pgAMat,anot:pgANot,areh:pgAReh,afec:pgAFec,
    ablk:pgABlk,aaud:pgAAud,aexp:pgAExp,aexc:pgAExc,avcl:pgAVcl,ahist:pgAHist,
    ph:pgPH,pnot:pgPNot,past:pgPAst,pvir:pgPVir,ptar:pgPTar,prec:pgPRec,phist:pgPHist,
    eb:pgEB,east:pgEAst,etare:pgETare,eexc:pgEExc,eprof:pgEProf,
    evir:pgEVir,ereh:pgEReh,ehist:pgEHist,
    sadash:pgSADash,sacolegios:pgSAColegios,saplan:pgSAPlan,
    saestadisticas:pgSAEstadisticas,saauditoria:pgSAAuditoria,samantenimiento:pgSAMantenimiento,
    sasug:pgSASug,
    asug:pgSugerencias,psug:pgSugerencias,esug:pgSugerencias,
  };
  return(map[pid]||(() =>'<div class="card"><p>No disponible.</p></div>'))();
}
function initPg(pid){
  const map={
    dash:initDash,asal:initASal,apri:()=>initAEst('primaria'),abac:()=>initAEst('bachillerato'),
    aprf:initAPrf,amat:initAMat,anot:initANot,areh:initAReh,aexc:initAExc,avcl:initAVcl,
    past:initPAst,eb:initEB,
    ph:()=>{ setTimeout(renderPExcR,0); },
    sadash:initSADash,sacolegios:initSAColegios,saplan:initSAPlan,
    saestadisticas:initSAEstadisticas,saauditoria:initSAAuditoria,samantenimiento:initSAMantenimiento,
    sasug:initSASug,
    asug:initSugerencias,psug:initSugerencias,esug:initSugerencias,
  };
  if(map[pid]) map[pid]();
}


/* ============================================================
   DASHBOARD
============================================================ */
function pgDash(){
  return`<div class="ph"><h2>Panel General</h2><p>Resumen del sistema</p></div>
  <div class="sr" id="dSt"></div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">🏆 Mejores por Salón</span></div><div id="dTop"></div></div>
    <div class="card"><div class="chd"><span class="cti">🕐 Últimas Auditorías</span></div><div class="lw" id="dLog"></div></div>
  </div>`;
}
function initDash(){
  gi('dSt').innerHTML=[{v:DB.ests.length,l:'Estudiantes',i:'🎓'},
    {v:DB.profs.length,l:'Profesores',i:'👩‍🏫'},{v:DB.sals.length,l:'Salones',i:'🏫'},
    {v:DB.mB.length+DB.mP.length,l:'Materias',i:'📖'}]
    .map(s=>`<div class="scc" data-i="${s.i}"><div class="sv">${s.v}</div><div class="sl">${s.l}</div><div class="bar"></div></div>`).join('');
  let h='';
  DB.sals.forEach(sal=>{
    const ests=ebySalon(sal.nombre);if(!ests.length) return;
    const top=ests.map(e=>({n:e.nombre,p:gprom(e.id)})).sort((a,b)=>b.p-a.p).slice(0,3);
    h+=`<div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;color:var(--nv);margin-bottom:6px">${sal.nombre}
        <span class="bdg bgy">${ests.length} est.</span></div>
      ${top.map((e,i)=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bd);font-size:13px">
        <span>${['🥇','🥈','🥉'][i]} ${e.n}</span><span class="${scC(e.p)}">${e.p.toFixed(2)}</span>
      </div>`).join('')}
    </div>`;
  });
  gi('dTop').innerHTML=h||'<div class="mty"><div class="ei">🏫</div><p>Sin salones</p></div>';
  const rec=(DB.audit||[]).slice(-8).reverse();
  gi('dLog').innerHTML=rec.length?rec.map(l=>`<div class="le"><div class="lts">${l.ts}</div>
    <div><span class="lwho ${l.role==='admin'?'ladm':''}">${l.who}</span> → <strong>${l.est}</strong>
    | ${l.mat}: <span class="${scC(l.old)}">${l.old}</span>→<span class="${scC(l.nw)}">${l.nw}</span></div>
  </div>`).join(''):'<div class="mty" style="padding:20px"><div class="ei">📋</div><p>Sin registros</p></div>';
}

/* ============================================================
   SALONES
============================================================ */
function pgASal(){
  return`<div class="ph"><h2>Salones & Grados</h2></div>
  <div class="card"><div class="chd"><span class="cti">➕ Nuevo Salón</span></div>
    <div class="fg">
      <div class="fld"><label>Nombre (ej: 6A)</label><input id="nsn" placeholder="6A"></div>
      <div class="fld"><label>Ciclo</label><select id="nsc">
        <option value="primaria">Primaria (1°–5°)</option>
        <option value="bachillerato">Bachillerato (6°–11°)</option>
      </select></div>
      <div class="fld" style="display:flex;align-items:flex-end">
        <button class="btn bn" onclick="addSal()">Agregar</button>
      </div>
    </div>
  </div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">📚 Primaria</span></div><div id="slP"></div></div>
    <div class="card"><div class="chd"><span class="cti">🎓 Bachillerato</span></div><div id="slB"></div></div>
  </div>`;
}
function initASal(){renderSals();}
function renderSals(){
  ['primaria','bachillerato'].forEach(c=>{
    const el=gi(c==='primaria'?'slP':'slB');if(!el) return;
    const list=DB.sals.filter(s=>s.ciclo===c);
    if(!list.length){el.innerHTML='<div class="mty" style="padding:20px"><div class="ei">🏫</div><p>Sin salones</p></div>';return;}
    el.innerHTML=list.map(s=>{
      const nMats=s.mats&&s.mats.length;
      const dfMats=c==='primaria'?DB.mP:DB.mB;
      const matsLabel=nMats
        ?`<span class="bdg bgr" style="font-size:10px">🎯 ${s.mats.length} materias propias</span>`
        :`<span class="bdg bgy" style="font-size:10px">${dfMats.length} materias (${c==='primaria'?'global primaria':'global bach.'})</span>`;
      const matsList=nMats?s.mats:dfMats;
      return`<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--bd);padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <strong style="font-size:15px">${s.nombre}</strong>
            <span class="bdg bgy">${ebySalon(s.nombre).length} est.</span>
            ${matsLabel}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn xs bg" onclick="editSalMats('${s.nombre}')">🎯 Materias</button>
            <button class="btn xs bd" onclick="delSal('${s.nombre}')">🗑</button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
          ${matsList.map(m=>`<span style="font-size:11px;padding:2px 7px;background:#fff;border:1px solid var(--bd);border-radius:5px">${m}</span>`).join('')}
        </div>
      </div>`;
    }).join('');
  });
}
/* ── SOBREESCRITA por api-layer.js ── */
async function addSal(){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function delSal(n){ /* implementado en api-layer.js */ }

/* Assign/edit custom subject list for a salon */
function editSalMats(sname){
  const sal=DB.sals.find(s=>s.nombre===sname);if(!sal)return;
  const ciclo=sal.ciclo;
  const globalMats=ciclo==='primaria'?DB.mP:DB.mB;
  const current=sal.mats&&sal.mats.length?[...sal.mats]:[...globalMats];

  /* Build checkbox list from global defaults + any custom already added */
  const allMats=[...new Set([...globalMats,...current])];

  const rows=allMats.map(m=>`
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);
      border-radius:7px;border:1px solid var(--bd);cursor:pointer;font-size:13px">
      <input type="checkbox" class="smck" value="${m}" ${current.includes(m)?'checked':''}>
      <span>${m}</span>
    </label>`).join('');

  Swal.fire({
    title:`🎯 Materias del Salón ${sname}`,
    width:600,
    html:`<div style="text-align:left;font-family:var(--fn)">
      <div class="al alb" style="margin-bottom:12px;font-size:12px">
        Selecciona las materias que existen en este salón. Si no marcas ninguna, se usarán las materias globales del ciclo.
        <br>Puedes agregar materias personalizadas en el campo de abajo.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">${rows}</div>
      <div style="display:flex;gap:8px;align-items:center;padding:10px;background:#f7fafc;border-radius:8px;border:1px solid var(--bd)">
        <input id="newMat" placeholder="Nueva materia personalizada..."
          style="flex:1;padding:7px 10px;border:1.5px solid var(--bd);border-radius:7px;font-size:13px;outline:none">
        <button type="button" class="btn xs bn" onclick="addCustomMatRow()">➕ Agregar</button>
      </div>
      <div id="customMatsAdded"></div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:'Guardar Materias',
    cancelButtonText:'Cancelar',
    didOpen:()=>{
      /* Allow Enter to add custom mat */
      gi('newMat').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addCustomMatRow();}});
    },
    preConfirm:()=>{
      const checked=[...document.querySelectorAll('.smck:checked')].map(c=>c.value);
      return checked;
    }
  }).then(r=>{
    if(!r.isConfirmed) return;
    const chosen=r.value;
    sal.mats=chosen; /* empty array = use global */
    /* Patch existing student notes to include new mats */
    DB.ests.filter(e=>e.salon===sname).forEach(e=>{
      syncN(e.id);
      DB.pers.forEach(per=>{
        if(!DB.notas[e.id][per]) DB.notas[e.id][per]={};
        chosen.forEach(m=>{
          if(!DB.notas[e.id][per][m]) DB.notas[e.id][per][m]={a:0,c:0,r:0};
        });
      });
    });
    dbSave();renderSals();
    sw('success',`Materias de ${sname} actualizadas`,
      chosen.length?`${chosen.length} materias asignadas`:'Se usarán las materias globales del ciclo.',2000);
  });
}
/* Called from inside Swal to add a custom subject row */
function addCustomMatRow(){
  const inp=gi('newMat');const v=inp.value.trim();if(!v) return;
  /* Check not already present */
  if([...document.querySelectorAll('.smck')].some(c=>c.value===v)){inp.value='';return;}
  const d=gi('customMatsAdded');
  const lbl=document.createElement('label');
  lbl.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 10px;background:#ebf8ff;border-radius:7px;border:1px solid #90cdf4;cursor:pointer;font-size:13px;margin-top:6px';
  lbl.innerHTML=`<input type="checkbox" class="smck" value="${v}" checked><span>${v}</span> <span style="font-size:10px;color:#2b6cb0">(nueva)</span>`;
  d.appendChild(lbl);
  inp.value='';inp.focus();
}

/* ============================================================
   ESTUDIANTES (Admin)
============================================================ */
function pgAEst(ciclo){
  const tt=ciclo==='primaria'?'Primaria (1°-5°)':'Bachillerato (6°-11°)';
  const sOpts=DB.sals.filter(s=>s.ciclo===ciclo).map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');
  return`<div class="ph"><h2>Estudiantes — ${tt}</h2></div>
  <div class="card"><div class="chd"><span class="cti">➕ Agregar Estudiante</span>
    <button class="btn bg sm" onclick="abrirCSVEst('${ciclo}')" title="Cargar múltiples estudiantes desde archivo CSV">📂 Carga Masiva CSV</button>
  </div>
    <div class="fg">
      <div class="fld"><label>Nombre</label><input id="nen" placeholder="Nombre completo"></div>
      <div class="fld"><label>T.I.</label><input id="neti" placeholder="TI-000001"></div>
      <div class="fld"><label>Salón</label><select id="nes"><option value="">Sin salón</option>${sOpts}</select></div>
      <div class="fld"><label>Usuario</label><input id="neu" placeholder="usuario"></div>
      <div class="fld"><label>Contraseña</label><input id="nep" type="password" placeholder="contraseña"></div>
      <div class="fld" style="display:flex;align-items:flex-end">
        <button class="btn bn" onclick="addEst('${ciclo}')">Agregar</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="chd"><span class="cti">📋 Lista</span>
      <button class="btn bg sm" onclick="expEstXls('${ciclo}')">📤 Excel</button>
    </div>
    <div class="srch"><span style="color:var(--sl3);font-size:15px">🔍</span>
      <input id="se${ciclo}" placeholder="Buscar por nombre, T.I., salón..."
        oninput="filterEst('${ciclo}')">
    </div>
    <div id="et${ciclo}"></div>
  </div>`;
}
function initAEst(c){renderEstTabla(c);}
function filterEst(c){renderEstTabla(c,gi('se'+c)?.value||'');}
function renderEstTabla(ciclo,filter=''){
  const el=gi('et'+ciclo);if(!el) return;
  let list=estsByCiclo(ciclo);
  if(filter){const f=filter.toLowerCase();list=list.filter(e=>
    e.nombre.toLowerCase().includes(f)||(e.ti||'').toLowerCase().includes(f)||(e.salon||'').toLowerCase().includes(f));}
  if(!list.length){el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes</p></div>';return;}
  el.innerHTML=`<div class="tw"><table>
    <thead><tr><th>#</th><th>Nombre</th><th>T.I.</th><th>Salón</th><th>Usuario</th><th>Prom.</th><th>Acciones</th></tr></thead>
    <tbody>${list.map((e,i)=>{const pg=gprom(e.id);return`<tr>
      <td style="color:var(--sl3);font-family:var(--mn);font-size:11px">${i+1}</td>
      <td><strong>${e.nombre}</strong></td>
      <td style="font-family:var(--mn);font-size:12px">${e.ti||'—'}</td>
      <td>${e.salon?`<span class="bdg bbl">${e.salon}</span>`:'<span class="bdg bgy">Sin salón</span>'}</td>
      <td style="font-family:var(--mn);font-size:12px">${e.usuario}</td>
      <td><span class="${scC(pg)}">${pg.toFixed(2)}</span></td>
      <td><div style="display:flex;gap:5px">
        <button class="btn xs bg" onclick="editEst('${e.id}','${ciclo}')">✏️</button>
        <button class="btn xs bd" onclick="delEst('${e.id}','${ciclo}')">🗑</button>
        <button class="btn xs bb" onclick="dlBoletinUI('${e.id}')">📄</button>
      </div></td>
    </tr>`;}).join('')}</tbody></table></div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function addEst(ciclo){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function abrirCSVEst(ciclo){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function abrirCSVPrf(ciclo){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function delEst(eid,ciclo){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function editEst(eid,ciclo){ /* implementado en api-layer.js */ }
function expEstXls(ciclo){
  const list=estsByCiclo(ciclo);
  const ws=XLSX.utils.json_to_sheet(list.map(e=>({Nombre:e.nombre,TI:e.ti||'',Salon:e.salon||'',Usuario:e.usuario,Promedio:gprom(e.id).toFixed(2)})));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,ciclo);
  XLSX.writeFile(wb,`estudiantes_${ciclo}.xlsx`);
}

/* ============================================================
   PROFESORES
============================================================ */
function pgAPrf(){
  return`<div class="ph"><h2>Profesores</h2></div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">📚 Primaria</span>
      <div style="display:flex;gap:6px">
        <button class="btn bn sm" onclick="openAddPrf('primaria')">➕</button>
        <button class="btn bg sm" onclick="abrirCSVPrf('primaria')" title="Carga masiva CSV">📂 CSV</button>
      </div></div><div id="pfP"></div>
    </div>
    <div class="card"><div class="chd"><span class="cti">🎓 Bachillerato</span>
      <div style="display:flex;gap:6px">
        <button class="btn bn sm" onclick="openAddPrf('bachillerato')">➕</button>
        <button class="btn bg sm" onclick="abrirCSVPrf('bachillerato')" title="Carga masiva CSV">📂 CSV</button>
      </div></div><div id="pfB"></div>
    </div>
  </div>`;
}
function initAPrf(){renderPrfTbl();}
function renderPrfTbl(){
  ['primaria','bachillerato'].forEach(c=>{
    const el=gi(c==='primaria'?'pfP':'pfB');if(!el) return;
    const list=DB.profs.filter(p=>p.ciclo===c);
    if(!list.length){el.innerHTML='<div class="mty" style="padding:20px"><div class="ei">👩‍🏫</div><p>Sin profesores</p></div>';return;}
    el.innerHTML=`<div class="tw"><table>
      <thead><tr><th>Nombre</th><th>T.I.</th>${c==='bachillerato'?'<th>Salón → Materias</th>':'<th>Salones</th>'}<th></th></tr></thead>
      <tbody>${list.map(p=>`<tr>
        <td><strong>${p.nombre}</strong><br>
          <span style="font-family:var(--mn);font-size:11px;color:var(--sl3)">${p.usuario}</span></td>
        <td style="font-family:var(--mn);font-size:12px">${p.ti||'—'}</td>
        ${c==='bachillerato'?`<td style="font-size:12px">
          ${(p.salones||[]).length?`<div style="display:flex;flex-direction:column;gap:4px">
            ${(p.salones||[]).map(s=>{
              const ms=((p.salonMaterias||{})[s]||[]);
              return`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span class="bdg bgy">${s}</span>
                ${ms.length?ms.map(m=>`<span class="bdg bbl" style="font-size:10px">${m}</span>`).join('')
                  :'<span style="font-size:10px;color:var(--sl3)">Sin materias asignadas</span>'}
              </div>`;
            }).join('')}
          </div>`:'<span style="color:var(--sl3);font-size:12px">Sin salones</span>'}
          <button class="btn xs bg" style="margin-top:5px" onclick="openSalonMaterias('${p.id}',()=>renderPrfTbl())">🎯 Asignar materias</button>
        </td>`:`<td><div style="display:flex;flex-wrap:wrap;gap:3px">
          ${(p.salones||[]).map(s=>`<span class="bdg bgy">${s}</span>`).join('')||'—'}
        </div></td>`}
        <td><div style="display:flex;gap:5px">
          <button class="btn xs bg" onclick="editPrf('${p.id}')">✏️</button>
          <button class="btn xs bd" onclick="delPrf('${p.id}','${c}')">🗑</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>`;
  });
}
function openAddPrf(ciclo){
  const MAX=ciclo==='bachillerato'?Infinity:1;
  const sals=DB.sals.filter(s=>s.ciclo===ciclo);
  /* For primaria: only salones. For bach: salones checkboxes, then per-salon materia assignment */
  Swal.fire({title:`Nuevo Profesor — ${ciclo==='primaria'?'Primaria':'Bachillerato'}`,width:600,
    html:`<div style="text-align:left;font-family:var(--fn)">
      ${sF([{id:'npn',lb:'Nombre'},{id:'npti',lb:'T.I./CC'},{id:'npu',lb:'Usuario'},{id:'npp',lb:'Contraseña'}])}
      <div style="text-align:left;margin-bottom:0">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:6px">Salones (todos los disponibles para bachillerato, máx 1 para primaria)</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${sals.map(s=>`<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;
            background:var(--bg2);padding:5px 9px;border-radius:7px;border:1px solid var(--bd)">
            <input type="checkbox" class="nps" value="${s.nombre}"> ${s.nombre}</label>`).join('')
            ||'<p style="font-size:12px;color:var(--sl3)">Sin salones disponibles — créalos primero</p>'}
        </div>
      </div>
      ${ciclo==='bachillerato'?'<div class="al alb" style="margin-top:12px;font-size:12px">ℹ️ Después podrás asignar qué materia da en cada salón.</div>':''}
    </div>`,
    showCancelButton:true,confirmButtonText:'Guardar',
    preConfirm:()=>{
      const salones=qq('.nps:checked').map(c=>c.value);
      if(salones.length>MAX){Swal.showValidationMessage(MAX===Infinity?`Sin límite de salones`:`Máximo ${MAX} salón(es)`);return false;}
      return{nombre:gi('npn').value.trim(),ti:gi('npti').value.trim(),
        usuario:gi('npu').value.trim(),password:gi('npp').value.trim(),salones};
    }
  }).then(async r=>{
    if(!r.isConfirmed) return;
    const d=r.value;
    if(!d.nombre||!d.usuario||!d.password){sw('error','Campos obligatorios vacíos');return;}
    if(uExists(d.usuario)){sw('error','Ese usuario ya existe');return;}
    try{
      const newProf=await addPrf({id:'prf_'+Date.now(),...d,ciclo});
      const saved=DB.profs[DB.profs.length-1];
      if(ciclo==='bachillerato'&&d.salones.length) openSalonMaterias(saved.id,()=>{renderPrfTbl();});
      else{renderPrfTbl();sw('success','Profesor agregado','',1400);}
    }catch(e){sw('error','Error al guardar: '+e.message);}
  });
}

/* Dialog to assign which materias a prof teaches in each salon */
function openSalonMaterias(pid,cb){
  const p=DB.profs.find(x=>x.id===pid);if(!p)return;
  const salones=p.salones||[];
  if(!salones.length){if(cb)cb();return;}
  const rows=salones.map(s=>{
    const cur=(p.salonMaterias||{})[s]||[];
    const salObj=DB.sals.find(x=>x.nombre===s);
    const availMats=(salObj?.mats&&salObj.mats.length)?salObj.mats:DB.mB;
    return`<div style="margin-bottom:12px;padding:10px 12px;background:var(--bg2);border-radius:8px;border:1px solid var(--bd)">
      <div style="font-size:12px;font-weight:800;color:var(--nv);margin-bottom:7px">📍 ${s}
        ${salObj?.mats?.length?`<span style="font-size:10px;font-weight:400;color:var(--sl2);margin-left:6px">(${salObj.mats.length} materias del salón)</span>`:''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${availMats.map(m=>`<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;
          padding:4px 8px;background:#fff;border-radius:6px;border:1px solid var(--bd)">
          <input type="checkbox" class="sm_${s.replace(/\s/g,'_')}" value="${m}" ${cur.includes(m)?'checked':''}>
          ${m}</label>`).join('')}
      </div>
    </div>`;
  }).join('');
  Swal.fire({title:`Materias por Salón — ${p.nombre}`,width:620,
    html:`<div style="text-align:left;font-family:var(--fn)">
      <div class="al alb" style="margin-bottom:12px;font-size:12px">
        Selecciona qué materias imparte este profesor en <strong>cada salón específico</strong>.<br>
        Esto permite que cada salón tenga su propio plan de estudios.
      </div>
      ${rows}
    </div>`,
    showCancelButton:true,confirmButtonText:'Guardar Asignaciones',
    preConfirm:()=>{
      const sm={};
      salones.forEach(s=>{
        const key=s.replace(/\s/g,'_');
        sm[s]=qq(`.sm_${key}:checked`).map(c=>c.value);
      });
      /* Also union all as materias array for compat */
      const allMats=[...new Set(Object.values(sm).flat())];
      return{salonMaterias:sm,materias:allMats,materia:allMats[0]||''};
    }
  }).then(r=>{
    if(!r.isConfirmed){if(cb)cb();return;}
    Object.assign(p,r.value);dbSave();
    if(cb)cb();sw('success','Asignaciones guardadas','',1400);
  });
}

function editPrf(pid){
  const p=DB.profs.find(x=>x.id===pid);
  const MAX=p.ciclo==='bachillerato'?Infinity:1;
  const sals=DB.sals.filter(s=>s.ciclo===p.ciclo);
  Swal.fire({title:'Editar Profesor',width:600,
    html:`<div style="text-align:left;font-family:var(--fn)">
      ${sF([{id:'epn',lb:'Nombre',val:p.nombre},{id:'epti',lb:'T.I./CC',val:p.ti||''},
        {id:'epu',lb:'Usuario',val:p.usuario},{id:'epp',lb:'Nueva Contraseña (dejar vacío para no cambiar)',val:'',tp:'password'}])}
      <div style="text-align:left;margin-bottom:0">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:6px">Salones (todos los disponibles para bachillerato, máx 1 para primaria)</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${sals.map(s=>`<label style="font-size:13px;display:flex;align-items:center;gap:4px;cursor:pointer;
            background:var(--bg2);padding:5px 9px;border-radius:7px;border:1px solid var(--bd)">
            <input type="checkbox" class="eps" value="${s.nombre}" ${(p.salones||[]).includes(s.nombre)?'checked':''}> ${s.nombre}</label>`).join('')}
        </div>
      </div>
      ${p.ciclo==='bachillerato'?`<div style="margin-top:12px">
        <button type="button" class="btn bg sm" onclick="openSalonMaterias('${pid}',()=>renderPrfTbl())">
          🎯 Asignar Materias por Salón</button>
        ${(p.salones||[]).length?`<div style="margin-top:8px;font-size:11px;color:var(--sl2)">${
          Object.entries(p.salonMaterias||{}).filter(([,v])=>v.length).map(([s,ms])=>
            `<strong>${s}:</strong> ${ms.join(', ')}`).join(' · ')||'Sin materias asignadas por salón'
        }</div>`:''}
      </div>`:''}
    </div>`,
    showCancelButton:true,confirmButtonText:'Guardar',
    preConfirm:()=>{
      const salones=qq('.eps:checked').map(c=>c.value);
      if(salones.length>MAX){Swal.showValidationMessage(MAX===Infinity?`Sin límite de salones`:`Máximo ${MAX}`);return false;}
      return{nombre:gi('epn').value.trim(),ti:gi('epti').value.trim(),
        usuario:gi('epu').value.trim(),newPwd:gi('epp').value.trim(),salones};
    }
  }).then(async r=>{
    if(!r.isConfirmed)return;
    const d=r.value;
    p.nombre=d.nombre;p.ti=d.ti;p.usuario=d.usuario;p.salones=d.salones;
    const upd={nombre:d.nombre,ti:d.ti,usuario:d.usuario,salones:d.salones};
    if(d.newPwd) upd.password=d.newPwd;
    if(p.salonMaterias){
      Object.keys(p.salonMaterias).forEach(s=>{if(!(p.salones||[]).includes(s))delete p.salonMaterias[s];});
      upd.salonMaterias=p.salonMaterias;
    }
    try{
      await apiFetch(`/api/usuarios/${pid}`,{method:'PUT',body:JSON.stringify(upd)});
      renderPrfTbl();
    }catch(e){sw('error','Error al guardar: '+e.message);}
  });
}
function delPrf(pid,ciclo){
  const p=DB.profs.find(x=>x.id===pid);
  Swal.fire({title:'¿Eliminar?',text:p.nombre,icon:'warning',showCancelButton:true,
    confirmButtonColor:'#e53e3e'}).then(async r=>{
    if(!r.isConfirmed)return;
    try{
      await apiFetch(`/api/usuarios/${pid}`,{method:'DELETE'});
      DB.profs=DB.profs.filter(x=>x.id!==pid);renderPrfTbl();
    }catch(e){sw('error','Error al eliminar: '+e.message);}
  });
}

/* ============================================================
   MATERIAS & PERIODOS
============================================================ */
function pgAMat(){
  return`<div class="ph"><h2>Materias & Periodos</h2></div>
  <div class="g2">
    <div class="card">
      <div class="chd"><span class="cti">📚 Materias — Primaria</span></div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div class="fld" style="margin:0;flex:1"><input id="nmp" placeholder="Nueva materia primaria..."></div>
        <button class="btn bn sm" onclick="addMP()">➕</button>
      </div><div id="mlP"></div>
    </div>
    <div class="card">
      <div class="chd"><span class="cti">🎓 Materias — Bachillerato</span></div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div class="fld" style="margin:0;flex:1"><input id="nmb" placeholder="Nueva materia bachillerato..."></div>
        <button class="btn bn sm" onclick="addMB()">➕</button>
      </div><div id="mlB"></div>
    </div>
  </div>
  <div class="card">
    <div class="chd"><span class="cti">📅 Periodos</span></div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <div class="fld" style="margin:0;flex:1"><input id="nper" placeholder="Nuevo periodo..."></div>
      <button class="btn bn sm" onclick="addPer()">➕</button>
    </div><div id="perL"></div>
  </div>`;
}
function initAMat(){renderMats();}
function matItem(v,delFn,ciclo){
  return`<div style="display:flex;justify-content:space-between;align-items:center;
    padding:9px 12px;background:var(--bg2);border-radius:8px;margin-bottom:7px;border:1px solid var(--bd)">
    <span style="font-size:13px">${v}</span>
    <div style="display:flex;gap:5px">
      <button class="btn xs bg" onclick="renameMat('${ciclo}','${v}')">✏️</button>
      <button class="btn xs bd" onclick="${delFn}('${v}')">🗑</button>
    </div></div>`;
}
function renderMats(){
  const mp=gi('mlP');if(mp) mp.innerHTML=DB.mP.map(m=>matItem(m,'delMP','primaria')).join('');
  const mb=gi('mlB');if(mb) mb.innerHTML=DB.mB.map(m=>matItem(m,'delMB','bachillerato')).join('');
  const pl=gi('perL');if(pl) pl.innerHTML=DB.pers.map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:9px 12px;background:var(--bg2);border-radius:8px;margin-bottom:7px;border:1px solid var(--bd)">
      <span style="font-size:13px">${p}</span>
      <button class="btn xs bd" onclick="delPer('${p}')">🗑</button>
    </div>`).join('');
}
function addMP(){const v=gi('nmp').value.trim();if(!v||DB.mP.includes(v))return;DB.mP.push(v);patchMats('primaria',v);dbSave();gi('nmp').value='';renderMats();}
function addMB(){const v=gi('nmb').value.trim();if(!v||DB.mB.includes(v))return;DB.mB.push(v);patchMats('bachillerato',v);dbSave();gi('nmb').value='';renderMats();}
function delMP(m){if(DB.mP.length<=1){sw('error','Mínimo 1 materia');return;}DB.mP=DB.mP.filter(x=>x!==m);dbSave();renderMats();}
function delMB(m){if(DB.mB.length<=1){sw('error','Mínimo 1 materia');return;}DB.mB=DB.mB.filter(x=>x!==m);dbSave();renderMats();}
function patchMats(ciclo,m){
  DB.ests.forEach(e=>{
    if(cicloOf(e.salon)!==ciclo) return;
    DB.pers.forEach(p=>{if(DB.notas[e.id]?.[p]) DB.notas[e.id][p][m]={a:0,c:0,r:0};});
  });
}
function renameMat(ciclo,old){
  Swal.fire({title:'Renombrar Materia',input:'text',inputValue:old,showCancelButton:true,confirmButtonText:'Guardar'}).then(r=>{
    if(!r.isConfirmed||!r.value.trim()) return;
    const nw=r.value.trim();
    const arr=ciclo==='primaria'?DB.mP:DB.mB;
    const i=arr.indexOf(old);if(i<0)return;arr[i]=nw;
    DB.ests.forEach(e=>{DB.pers.forEach(p=>{
      if(DB.notas[e.id]?.[p]?.[old]){DB.notas[e.id][p][nw]=DB.notas[e.id][p][old];delete DB.notas[e.id][p][old];}
    });});
    dbSave();renderMats();sw('success','Renombrada','',1400);
  });
}
function addPer(){
  const v=gi('nper').value.trim();if(!v||DB.pers.includes(v))return;
  DB.pers.push(v);
  DB.ests.forEach(e=>{
    if(!DB.notas[e.id]) DB.notas[e.id]={};
    DB.notas[e.id][v]={};
    getMats(e.id).forEach(m=>{DB.notas[e.id][v][m]={a:0,c:0,r:0};});
  });
  dbSave();gi('nper').value='';renderMats();
}
function delPer(p){
  if(DB.pers.length<=1){sw('error','Mínimo 1 periodo');return;}
  DB.pers=DB.pers.filter(x=>x!==p);dbSave();renderMats();
}

/* ============================================================
   ADMIN — GESTIÓN DE NOTAS (tripartita)
============================================================ */
let _anE=[];
function pgANot(){
  const sO=DB.sals.map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');
  const pO=DB.pers.map(p=>`<option value="${p}">${p}</option>`).join('');
  return`<div class="ph"><h2>Gestión de Notas</h2><button class="btn xs bg" onclick="showHelp('anot')">❓ Ayuda</button></div>
  <div class="card">
    <div class="fg">
      <div class="fld"><label>Salón</label><select id="ans"><option value="">Seleccionar</option>${sO}</select></div>
      <div class="fld"><label>Periodo</label><select id="anp"><option value="">Seleccionar</option>${pO}</select></div>
      <div class="fld" style="display:flex;align-items:flex-end"><button class="btn bn" onclick="loadAN()">Cargar</button></div>
    </div>
    <div class="srch"><span style="color:var(--sl3)">🔍</span>
      <input id="anq" placeholder="Buscar estudiante..." oninput="filterAN()">
    </div>
    <div id="anW"></div>
  </div>`;
}
function initANot(){}
function loadAN(){const s=gi('ans')?.value,p=gi('anp')?.value;if(!s||!p){sw('warning','Selecciona salón y periodo');return;}_anE=ebySalon(s);renderANotTbl(s,p,_anE);}
function filterAN(){const s=gi('ans')?.value,p=gi('anp')?.value;if(!s||!p)return;const f=(gi('anq')?.value||'').toLowerCase();renderANotTbl(s,p,_anE.filter(e=>e.nombre.toLowerCase().includes(f)));}
function renderANotTbl(salon,per,list){
  const el=gi('anW');if(!el) return;
  if(!list.length){el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes</p></div>';return;}
  const mats=getMats(list[0].id);
  el.innerHTML=`<div class="tw"><table>
    <thead>
      <tr><th>Estudiante</th>
        ${mats.map(m=>`<th colspan="4" style="text-align:center;border-left:2px solid var(--bd)">${m}</th>`).join('')}
        <th>Disciplina</th><th>Prom.</th></tr>
      <tr><td></td>
        ${mats.map(()=>'<th style="font-size:9px;color:var(--sl2);border-left:2px solid var(--bd)">Apt.60%</th><th style="font-size:9px;color:var(--sl2)">Act.20%</th><th style="font-size:9px;color:var(--sl2)">Res.20%</th><th style="font-size:9px;background:#e8f4fd">Def.</th>').join('')}
        <td></td><td></td></tr>
    </thead>
    <tbody id="anB"></tbody>
  </table></div>`;
  const body=gi('anB');
  list.forEach(e=>{
    syncN(e.id);
    const tr=document.createElement('tr');tr.id='anr'+e.id;
    const pp=pprom(e.id,per);
    const cells=mats.map(m=>{
      const t=DB.notas[e.id][per][m]||{a:0,c:0,r:0};const d=def(t);
      const enc=encodeURIComponent,em=enc(m),ep=enc(per);
      return`<td style="border-left:2px solid var(--bd);padding:5px">
        <input type="number" class="ni" min="0" max="5" step="0.1" value="${t.a.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="a" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.c.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="c" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.r.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="r" onchange="saveTri(this)"></td>
        <td id="dc_${e.id}_${em}_${ep}" style="background:#f0f8ff;padding:5px">
          <span class="${scC(d)}" style="font-size:11px">${d.toFixed(2)}</span></td>`;
    }).join('');
    tr.innerHTML=`<td><strong>${e.nombre}</strong></td>${cells}
      <td><select class="ni" style="width:110px" onchange="saveDisc('${e.id}',this.value)">
        ${['Excelente','Bueno','Regular','Deficiente'].map(dd=>`<option ${(DB.notas[e.id].disciplina||'')==dd?'selected':''}>${dd}</option>`).join('')}
      </select></td>
      <td id="apr_${e.id}"><span class="${scC(pp)}">${pp.toFixed(2)}</span></td>`;
    body.appendChild(tr);
  });
}
/* ── SOBREESCRITA por api-layer.js ── */
async function saveTri(inp){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveDisc(eid,v){ /* implementado en api-layer.js */ }

/* ============================================================
   REHAB
============================================================ */
function pgAReh(){return`<div class="ph"><h2>Recuperaciones</h2></div><div id="arB"></div>`;}
function initAReh(){
  const el=gi('arB');if(!el)return;
  if(!DB.ext.on){el.innerHTML=`<div class="al aly">⚠️ Activa el Periodo Extraordinario en <strong>Control de Fechas</strong>.</div>`;return;}
  const list=DB.ests.filter(e=>{const mp=matPerd(e.id);return mp.length>=1&&mp.length<=2;});
  if(!list.length){el.innerHTML=`<div class="al alg">✅ Sin estudiantes en recuperación actualmente.</div>`;return;}
  /* Also show recovery submissions per student */
  el.innerHTML=`<div class="al aly">📅 Periodo Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></div>
  <div class="card"><div class="chd"><span class="cti">⚠️ Estudiantes Elegibles (${list.length})</span></div>
  <div class="tw"><table><thead><tr><th>Estudiante</th><th>Salón</th><th>Materia Perdida</th><th>Profesor Asignado</th><th>Recuperación Enviada</th></tr></thead>
  <tbody>${list.map(e=>{
    const mp=matPerd(e.id),pg=gprom(e.id);
    return mp.map(m=>{
      const prf=profForMat(m,e.salon);
      const recs=(DB.recs||[]).filter(r=>r.estId===e.id&&r.materia===m);
      return`<tr>
        <td><strong>${e.nombre}</strong><br><span class="sc ${scC(pg)}" style="font-size:11px">${pg.toFixed(2)}</span></td>
        <td>${e.salon?`<span class="bdg bbl">${e.salon}</span>`:'—'}</td>
        <td><span class="bdg brd">${m}</span></td>
        <td style="font-size:13px">${prf?prf.nombre:'<span style="color:var(--sl3)">Sin asignar</span>'}</td>
        <td>${recs.length?recs.map(r=>`<div style="font-size:11px;padding:3px 0">
          📎 ${r.nombre} <span style="color:var(--sl3)">${r.fecha}</span></div>`).join('')
          :'<span style="font-size:12px;color:var(--sl3)">Pendiente</span>'}
        </td>
      </tr>`;
    }).join('');
  }).join('')}</tbody></table></div></div>`;
}

/* ============================================================
   FECHAS
============================================================ */
function pgAFec(){
  const perRows=DB.pers.map(p=>{
    const dp=DB.drPer[p]||{s:'',e:'',extPer:''};
    return`<div style="padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--bd);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <strong style="font-size:13px">📅 ${p}</strong>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label style="font-size:11px;color:var(--sl2)">Inicio</label>
          <input type="date" id="dps_${p.replace(/\s/g,'_')}" value="${dp.s}"
            style="padding:5px 8px;border:1.5px solid var(--bd);border-radius:6px;font-size:12px">
          <label style="font-size:11px;color:var(--sl2)">Fin</label>
          <input type="date" id="dpe_${p.replace(/\s/g,'_')}" value="${dp.e}"
            style="padding:5px 8px;border:1.5px solid var(--bd);border-radius:6px;font-size:12px">
          <label style="font-size:11px;color:var(--sl2)">Periodo Ext.</label>
          <select id="dpex_${p.replace(/\s/g,'_')}"
            style="padding:5px 8px;border:1.5px solid var(--bd);border-radius:6px;font-size:12px">
            <option value="">— Ninguno —</option>
            ${DB.pers.map(pp=>`<option value="${pp}" ${dp.extPer===pp?'selected':''}>${pp}</option>`).join('')}
          </select>
          <button class="btn xs bn" onclick="saveDRPer('${p.replace(/\s/g,'_')}','${p}')">Guardar</button>
        </div>
      </div>
      ${dp.s&&dp.e?`<div style="font-size:11px;color:var(--sl3)">
        Abierto: <strong>${dp.s}</strong> → <strong>${dp.e}</strong>
        ${dp.extPer?`· Recuperación mapea a periodo: <strong>${dp.extPer}</strong>`:''}
      </div>`:'<div style="font-size:11px;color:var(--sl3)">Sin rango configurado — siempre abierto para este periodo</div>'}
    </div>`;
  }).join('');
  return`<div class="ph"><h2>Control de Fechas</h2>
    <button class="btn xs bg" style="margin-top:4px" onclick="showHelp('afec')">❓ Ayuda</button></div>
  <div class="card" style="border:2px solid var(--bl3)">
    <div class="chd"><span class="cti">🎓 Año Lectivo Activo</span></div>
    <div class="al alb" style="margin-bottom:14px;font-size:12px">
      El año lectivo aparece en los boletines PDF y en el historial académico de los estudiantes.
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div>
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:5px">Año en curso</label>
        <input type="number" id="anoActualInp" value="${DB.anoActual||new Date().getFullYear()}"
          min="2000" max="2099" step="1"
          style="width:110px;padding:8px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:15px;font-weight:800;text-align:center;outline:none">
      </div>
      <div style="padding-top:18px">
        <button class="btn bn" onclick="saveAno()">💾 Guardar Año</button>
      </div>
      <div style="padding-top:18px">
        <span style="font-size:13px;color:var(--sl2)">Año actual en el sistema:
          <strong style="color:var(--nv);font-size:15px"> ${DB.anoActual||new Date().getFullYear()}</strong>
        </span>
      </div>
    </div>
  </div>
  <div class="card"><div class="chd"><span class="cti">📅 Rangos por Periodo</span></div>
    <div class="al alb" style="margin-bottom:14px">
      ℹ️ Define cuándo puede ingresar notas cada periodo. Si no se configura un rango, el periodo permanece siempre abierto.
      El campo <strong>Periodo Ext.</strong> indica a qué periodo corresponden las notas de recuperación.
    </div>
    ${perRows||'<div class="mty"><p>Sin periodos configurados</p></div>'}
  </div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">📅 Rango Global (fallback)</span></div>
      <div style="font-size:12px;color:var(--sl2);margin-bottom:10px">Se aplica cuando un periodo no tiene rango propio configurado.</div>
      <div class="fld"><label>Fecha Inicio</label><input type="date" id="drs" value="${DB.dr.s}"></div>
      <div class="fld"><label>Fecha Fin</label><input type="date" id="dre" value="${DB.dr.e}"></div>
      <button class="btn bn" onclick="saveDR()">Guardar Rango Global</button>
    </div>
    <div class="card"><div class="chd"><span class="cti">🔄 Periodo Extraordinario</span></div>
      <div class="al aly" style="margin-bottom:10px">Solo para estudiantes con 1 o 2 materias perdidas.</div>
      <div class="fld"><label>Inicio</label><input type="date" id="exs" value="${DB.ext.s}"></div>
      <div class="fld"><label>Fin</label><input type="date" id="exe" value="${DB.ext.e}"></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer">
        <input type="checkbox" id="exon" ${DB.ext.on?'checked':''}> Activar Periodo Extraordinario
      </label>
      <button class="btn bw" onclick="saveExt()">Guardar</button>
      <div class="al alb" style="margin-top:10px;font-size:11px">Al cerrarse, los planes y recuperaciones activos se archivan automáticamente en el historial.</div>
    </div>
  </div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function saveAno(){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveDRPer(key,per){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveDR(){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveExt(){ /* implementado en api-layer.js */ }
/* Archive all current recovery data into history, then wipe active */
/* ── SOBREESCRITA por api-layer.js ── */
async function archivarYLimpiarRecuperacion(){ /* implementado en api-layer.js */ }
/* Called from old code path — alias */
function limpiarPeriodoRecuperacion(){ archivarYLimpiarRecuperacion(); }
/* Returns true if today is AFTER ext.e (period expired) */
function extExpirado(){
  if(!DB.ext.e) return false;
  return new Date().toISOString().slice(0,10)>DB.ext.e;
}
/* ============================================================
   SISTEMA DE AYUDA CONTEXTUAL
============================================================ */
const HELP={
  ph:`<b>📊 Panel Principal</b><br>Resumen de tus salones, materias y estado del periodo activo. Usa el menú lateral para navegar a cada sección.`,
  pnot:`<b>📝 Ingresar Notas</b><br>1. Selecciona el <b>Salón</b> y el <b>Periodo</b>.<br>2. Haz clic en <b>Cargar</b>.<br>3. Ingresa: <b>Aptitud (60%)</b>, <b>Actitud (20%)</b> y <b>Responsabilidad (20%)</b>.<br>La definitiva se calcula automáticamente.<br>⚠️ Solo puedes ingresar notas durante el rango de fechas configurado para ese periodo.`,
  past:`<b>✅ Pasar Asistencia</b><br>Selecciona el salón y la fecha, marca ✓ a los presentes y ✗ a los ausentes. Guarda al terminar.`,
  pvir:`<b>💻 Clases Virtuales</b><br>Publica enlaces de reuniones (Meet, Zoom, Teams) para tus salones. Los estudiantes ven el enlace activo en su sección.`,
  ptar:`<b>📂 Tareas Recibidas</b><br>Archivos que los estudiantes te enviaron. Ábrelos y márcalos como <b>✓ Revisado</b>. Solo puedes eliminar los ya revisados; los intentos de eliminar sin revisar quedan en Auditoría.`,
  prec:`<b>🔄 Recuperaciones</b><br>Activo durante el Periodo Extraordinario.<br>1. Envía un Plan de Recuperación al salón o individual.<br>2. Los estudiantes responden antes de la fecha límite.<br>3. Revisa sus respuestas aquí y márcalas como revisadas.<br>Puedes exportar el historial de planes en Excel.`,
  phist:`<b>📚 Historial Recuperaciones</b><br>Recuperaciones de periodos anteriores. Usa el buscador para filtrar por nombre de archivo, estudiante o materia. Puedes abrir cualquier archivo archivado.`,
  eb:`<b>📋 Mi Boletín</b><br>Tus notas de todos los periodos y materias. Descárgalo en PDF con el botón correspondiente.`,
  east:`<b>📆 Mi Asistencia</b><br>Historial de asistencia: días presentes, ausentes y con excusa presentada.`,
  etare:`<b>📎 Tareas & Talleres</b><br>1. Selecciona materia, periodo y docente.<br>2. Escribe una descripción breve.<br>3. Adjunta el archivo (PDF, Word, Excel — máx 5 MB) y haz clic en Subir.<br>En <em>Mis Archivos Enviados</em> verás si el docente ya lo revisó. Puedes eliminar los revisados.`,
  eexc:`<b>✉️ Excusas</b><br>Envía una excusa cuando faltaste. Solo en horario permitido (6:00 PM – 7:00 AM). Selecciona el motivo y el docente destinatario.`,
  ereh:`<b>🔄 Mi Recuperación</b><br>Disponible cuando tienes 1–2 materias perdidas y el Periodo Extraordinario está activo.<br>Cada plan de tu docente aparece aquí. Respóndelo adjuntando tu trabajo antes de la fecha límite.<br>Una vez que el docente lo revise, el formulario se bloquea y puedes eliminar el registro.`,
  ehist:`<b>📚 Historial Recuperaciones</b><br>Todos los trabajos de recuperación que enviaste en periodos anteriores, con su estado de revisión.`,
  afec:`<b>📅 Control de Fechas</b><br><b>Rangos por Periodo:</b> define cuándo puede cada periodo recibir notas. Si no se configura, el periodo permanece siempre abierto.<br><b>Periodo Ext.:</b> a qué periodo van las notas de recuperación.<br><b>Rango Global:</b> aplica cuando un periodo no tiene rango propio.<br>Al cerrar el rango de un periodo, el Periodo Extraordinario se activa automáticamente si tiene fechas.`,
  anot:`<b>📊 Gestión de Notas (Admin)</b><br>Ve y edita notas de cualquier salón y periodo sin restricción de fechas.`,
  aaud:`<b>🔍 Auditoría</b><br>Registro automático de acciones sensibles: intentos de eliminar talleres sin revisar, cambios críticos. Solo visible para el administrador.`,
};
function showHelp(panel){
  const txt=HELP[panel]||'Sin ayuda disponible para esta sección.';
  Swal.fire({title:'❓ Ayuda',html:`<div style="text-align:left;font-size:14px;line-height:1.8">${txt}</div>`,
    confirmButtonText:'Entendido',icon:'info'});
}
/* Log audit entry */
function logAudit(msg,extra){ /* implementado en api-layer.js */ }

/* ============================================================
   USUARIOS BLOQUEADOS
============================================================ */
function pgABlk(){
  const list=Object.entries(DB.blk).filter(([,v])=>v.on);
  return`<div class="ph"><h2>Usuarios Bloqueados</h2></div>
  <div class="card">${list.length?`<div class="tw"><table>
    <thead><tr><th>Usuario</th><th>Bloqueado en</th><th>Acción</th></tr></thead>
    <tbody>${list.map(([u,v])=>`<tr>
      <td><strong>${u}</strong></td>
      <td style="font-family:var(--mn);font-size:12px">${new Date(v.ts||'').toLocaleString('es-CO')}</td>
      <td><button class="btn sm bs" onclick="unblk('${u}')">🔓 Desbloquear</button></td>
    </tr>`).join('')}</tbody></table></div>`:'<div class="mty"><div class="ei">🔓</div><p>Sin bloqueados</p></div>'}
  </div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function unblk(u){ /* implementado en api-layer.js */ }
/* ============================================================
   AUDITORÍA
============================================================ */
function pgAAud(){
  const list=(DB.audit||[]).slice().reverse();
  return`<div class="ph"><h2>Historial de Auditoría</h2></div>
  <div class="card"><div class="chd">
    <span class="cti">📋 Cambios (${list.length})</span>
    <div style="display:flex;gap:8px">
      <button class="btn bg sm" onclick="expAudXls()">📤 Excel</button>
      <button class="btn br sm" onclick="clearAudit()">🗑️ Limpiar historial</button>
    </div>
  </div>
  <div class="tw"><table><thead>
    <tr><th>Timestamp</th><th>ID</th><th>Por</th><th>Estudiante</th><th>Campo</th><th>Anterior</th><th>Nueva</th><th>IP</th></tr>
  </thead><tbody>${list.length?list.map(l=>`<tr>
    <td style="font-family:var(--mn);font-size:11px">${l.ts}</td>
    <td style="font-family:var(--mn);font-size:11px">${l.uid}</td>
    <td><span class="bdg ${l.role==='admin'?'bor':'bbl'}">${l.who}</span></td>
    <td>${l.est||l.user||'—'}</td><td style="font-size:12px">${l.mat||l.accion||'—'}</td>
    <td><span class="${scC(l.old)}">${l.old||'—'}</span></td>
    <td><span class="${scC(l.nw)}">${l.nw||'—'}</span></td>
    <td style="font-family:var(--mn);font-size:11px">${l.ip||'—'}</td>
  </tr>`).join(''):'<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--sl3)">Sin registros</td></tr>'}
  </tbody></table></div></div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
function clearAudit(){ /* implementado en api-layer.js */ }
function expCons(){
  const wb=XLSX.utils.book_new();
  DB.pers.forEach(p=>{
    const data=DB.ests.map(e=>{
      const row={Nombre:e.nombre,TI:e.ti||'',Salon:e.salon||''};
      getMats(e.id).forEach(m=>{row[m]=(def(DB.notas[e.id]?.[p]?.[m]||{a:0,c:0,r:0})).toFixed(2);});
      row.Promedio=pprom(e.id,p).toFixed(2);
      return row;
    });
    const ws=XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb,ws,p.substring(0,31));
  });
  XLSX.writeFile(wb,'consolidado_notas.xlsx');
}
function expAudXls(){
  const ws=XLSX.utils.json_to_sheet((DB.audit||[]).map(l=>({Timestamp:l.ts,ID:l.uid,Quien:l.who,Rol:l.role,Estudiante:l.est,Campo:l.mat,Anterior:l.old,Nueva:l.nw,IP:l.ip||'—'})));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Auditoria');
  XLSX.writeFile(wb,'auditoria.xlsx');
}

/* ============================================================
   EXPORTAR
============================================================ */
function pgAExp(){
  const yr=new Date().getFullYear();
  const annos=Array.from({length:4},(_,i)=>yr-1+i);
  const salOpts=DB.sals.map(s=>`<option value="${s.nombre}">${s.nombre} (${cicloOf(s.nombre)==='primaria'?'Primaria':'Bach.'})</option>`).join('');
  return`<div class="ph"><h2>Exportar Datos</h2></div>
  <div class="g2">
    <!-- Excel exports -->
    <div class="card"><div class="chd"><span class="cti">📊 Exportar Excel</span></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn bn" onclick="expCons()">📊 Consolidado de Notas</button>
        <button class="btn bg" onclick="expAudXls()">📋 Historial Auditoría</button>
      </div>
    </div>
    <!-- Boletín por estudiante individual -->
    <div class="card"><div class="chd"><span class="cti">📄 Boletín PDF — Por Estudiante</span></div>
      <div class="fld"><label>Seleccionar Estudiante</label>
        <select id="expe" onchange="renderExpUI()">
          <option value="">Seleccionar...</option>
          ${DB.ests.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(e=>`<option value="${e.id}">${e.nombre} — ${e.salon||'Sin salón'}</option>`).join('')}
        </select>
      </div>
      <div id="expUI"></div>
    </div>
  </div>
  <!-- Boletín por salón -->
  <div class="card" style="margin-top:0"><div class="chd"><span class="cti">🏫 Boletín PDF — Por Salón</span></div>
    <div class="al alb" style="font-size:12px;margin-bottom:14px">
      Selecciona un salón para ver todos sus estudiantes y descargar sus boletines de manera individual.
    </div>
    <div class="fg" style="margin-bottom:14px">
      <div class="fld"><label>Salón</label>
        <select id="expSalon" onchange="renderExpSalon()">
          <option value="">Seleccionar salón...</option>${salOpts||'<option disabled>Sin salones creados</option>'}
        </select>
      </div>
      <div class="fld"><label>Año del Boletín</label>
        <select id="expSAnno">${annos.map(y=>`<option value="${y}" ${y===yr?'selected':''}>${y}</option>`).join('')}</select>
      </div>
      <div class="fld"><label>Periodo</label>
        <select id="expSPer">
          <option value="TODOS">Todos los periodos</option>
          ${DB.pers.map(p=>`<option value="${encodeURIComponent(p)}">${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="expSalonW"><div class="mty"><div class="ei">🏫</div><p>Selecciona un salón</p></div></div>
  </div>`;
}
function renderExpUI(){
  const eid=gi('expe')?.value,box=gi('expUI');
  if(!box)return;
  if(!eid){box.innerHTML='';return;}
  box.innerHTML=mkBoletinUI(eid,'admin');
}
function renderExpSalon(){
  const salon=gi('expSalon')?.value,box=gi('expSalonW');
  if(!box)return;
  if(!salon){box.innerHTML='<div class="mty"><div class="ei">🏫</div><p>Selecciona un salón</p></div>';return;}
  const ests=ebySalon(salon);
  if(!ests.length){box.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes en este salón</p></div>';return;}
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong style="font-size:14px;color:var(--nv)">${salon} — ${ests.length} estudiante(s)</strong>
      <button class="btn bs sm" onclick="dlSalonTodos()">📄 Descargar todos (zip individual)</button>
    </div>
    <div class="tw"><table><thead>
      <tr><th>Nombre</th><th>T.I.</th><th>Prom. General</th><th>Puesto</th><th>Descargar Boletín</th></tr>
    </thead><tbody>${ests.map(e=>{
      syncN(e.id);const pg=gprom(e.id),ps=puestoS(e.id);
      return`<tr>
        <td><strong>${e.nombre}</strong></td>
        <td style="font-family:var(--mn);font-size:12px">${e.ti||'—'}</td>
        <td><span class="${scC(pg)}">${pg.toFixed(2)}</span></td>
        <td style="font-weight:700">${ps}°</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn xs bg" onclick="dlBSalon('${e.id}','TODOS')">📄 Todos</button>
            ${DB.pers.map(p=>`<button class="btn xs bg" onclick="dlBSalon('${e.id}','${encodeURIComponent(p)}')">${p}</button>`).join('')}
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function dlBSalon(eid,perFilter){
  const anno=gi('expSAnno')?.value||String(new Date().getFullYear());
  dlBoletin(eid,perFilter,anno);
}
function dlSalonTodos(){
  const salon=gi('expSalon')?.value;
  if(!salon){sw('warning','Selecciona un salón');return;}
  const ests=ebySalon(salon);
  if(!ests.length){sw('info','Sin estudiantes en este salón');return;}
  const per=gi('expSPer')?.value||'TODOS';
  const anno=gi('expSAnno')?.value||String(new Date().getFullYear());
  /* Only download students who actually have data */
  const conDatos=ests.filter(e=>{
    const mats=getMats(e.id);syncN(e.id);
    const pers2check=per==='TODOS'?DB.pers:[per];
    return pers2check.some(p=>mats.some(m=>{const t=DB.notas[e.id]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);}));
  });
  if(!conDatos.length){sw('info','Sin datos',`Ningún estudiante de ${salon} tiene notas para ${per==='TODOS'?'ningún periodo':per}.`);return;}
  let i=0;
  function next(){
    if(i>=conDatos.length)return;
    dlBoletin(conDatos[i].id,per,anno);
    i++;setTimeout(next,2000);
  }
  sw('info',`Descargando ${conDatos.length} boletín(es)...`,
    ests.length-conDatos.length>0?`(${ests.length-conDatos.length} estudiante(s) sin notas omitidos)`:'');
  setTimeout(next,600);
}

/* ============================================================
   ADMIN — HISTORIAL DE ESTUDIANTES
============================================================ */
function pgAHist(){
  return`<div class="ph"><h2>Historial de Estudiantes</h2>
    <p>Registro de todos los estudiantes que alguna vez fueron dados de alta en el sistema.</p></div>
  <div class="card">
    <div class="chd">
      <span class="cti">📚 Registro Histórico (${(DB.estHist||[]).length})</span>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <input id="histQ" placeholder="🔍 Buscar por nombre, T.I. o salón..." style="flex:1;min-width:220px;padding:9px 14px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px;outline:none" oninput="filtrarHist()">
      <select id="histFiltro" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none" onchange="filtrarHist()">
        <option value="todos">Todos</option>
        <option value="activo">Solo Activos</option>
        <option value="inactivo">Solo Eliminados</option>
      </select>
    </div>
    <div id="histW">${renderHistTabla((DB.estHist||[]))}</div>
  </div>`;
}
function renderHistTabla(lista){
  if(!lista.length) return'<div class="mty"><div class="ei">📚</div><p>Sin registros</p></div>';
  return`<div class="tw"><table><thead>
    <tr><th>Nombre</th><th>T.I.</th><th>Salón</th><th>Registrado</th><th>Estado</th><th>Eliminado</th><th>Acciones</th></tr>
  </thead><tbody>${lista.map(h=>`<tr>
    <td><strong>${esc(h.nombre)}</strong></td>
    <td style="font-family:var(--mn);font-size:12px">${esc(h.ti||'—')}</td>
    <td>${esc(h.salon||'—')}</td>
    <td style="font-family:var(--mn);font-size:12px">${h.registrado||'—'}</td>
    <td><span class="bdg ${h.activo?'bgr':'brd'}">${h.activo?'Activo':'Eliminado'}</span></td>
    <td style="font-family:var(--mn);font-size:11px;color:var(--sl3)">${h.eliminado||'—'}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn xs bg" onclick="verHistAcademico('${h.id}')">📊 Ver notas</button>
      ${!h.activo?`<button class="btn xs bn" onclick="restaurarEst('${h.id}')">♻️ Restaurar</button>`:''}
    </td>
  </tr>`).join('')}</tbody></table></div>`;
}

/* ── SOBREESCRITA por api-layer.js ── */
async function restaurarEst(eid){ /* implementado en api-layer.js */ }
function verHistAcademico(eid){
  /* Source: active student or deleted snapshot */
  const h=( DB.estHist||[]).find(x=>x.id===eid);
  const eActive=DB.ests.find(x=>x.id===eid);

  const nombre=h?.nombre||eActive?.nombre||eid;
  const ti=h?.ti||eActive?.ti||'—';
  const salon=h?.snapSalon||eActive?.salon||h?.salon||'—';
  const disciplina=h?.snapDisciplina||DB.notas[eid]?.disciplina||'—';
  const estado=h?.activo!==false?'Activo':'Eliminado';
  const eliminado=h?.eliminado||'—';

  /* Get notas: active student uses DB.notas, deleted uses snapshot */
  const notas=eActive?DB.notas[eid]:(h?.snapNotas||{});
  /* Get materias */
  const mats=eActive?getMats(eid):(h?.snapMats||DB.mP);
  /* Get asistencia */
  const asistSnap=eActive
    ?Object.fromEntries(Object.entries(DB.asist||{}).filter(([,d])=>d[eid]!==undefined).map(([k,d])=>[k,d[eid]]))
    :(h?.snapAsist||{});

  if(!notas||!Object.keys(notas).length){
    sw('info','Sin datos académicos',`No hay notas guardadas para ${nombre}.`);return;
  }

  /* Build period rows */
  const pers=DB.pers||[];
  const perRows=pers.map(per=>{
    const pd=notas[per]||{};
    const matRows=mats.map((m,i)=>{
      const t=pd[m]||{a:0,c:0,r:0};
      const d=def(t);
      const bg=i%2===0?'#f7fafc':'#fff';
      return`<tr style="background:${bg}">
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;font-size:12px">${esc(m)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${t.a.toFixed(1)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${t.c.toFixed(1)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px">${t.r.toFixed(1)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:12px;color:${scCol(d)}">${d.toFixed(2)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${d===0?'#a0aec0':d>=3?'#276749':'#c53030'}">${d===0?'—':d>=3?'✓':'✗'}</td>
      </tr>`;
    }).join('');
    const prom=mats.length?+(mats.reduce((s,m)=>s+def(pd[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2):0;
    const tieneData=mats.some(m=>{const t=pd[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!tieneData) return`<div style="padding:6px 0;color:#a0aec0;font-size:12px;font-style:italic">· ${per}: Sin notas registradas</div>`;
    return`<div style="margin-bottom:14px">
      <div style="background:#1a3a5c;color:#fff;padding:7px 12px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:12px">${per}</strong>
        <span style="font-size:11px;opacity:.8">Promedio: <strong>${prom.toFixed(2)}</strong></span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#2d5286;color:#fff">
          <th style="padding:5px 9px;text-align:left;font-size:11px">Materia</th>
          <th style="padding:5px 9px;text-align:center;font-size:11px">Apt.</th>
          <th style="padding:5px 9px;text-align:center;font-size:11px">Act.</th>
          <th style="padding:5px 9px;text-align:center;font-size:11px">Res.</th>
          <th style="padding:5px 9px;text-align:center;font-size:11px">Def.</th>
          <th style="padding:5px 9px;text-align:center;font-size:11px">✓</th>
        </tr></thead>
        <tbody>${matRows}</tbody>
      </table>
    </div>`;
  }).join('');

  /* Asistencia summary */
  const asistEntries=Object.entries(asistSnap);
  const total=asistEntries.length;
  const ausentes=asistEntries.filter(([,v])=>v==='ausente').length;
  const tarde=asistEntries.filter(([,v])=>v==='tarde').length;
  const presentes=total-ausentes-tarde;
  const asistHTML=total
    ?`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <span style="background:#c6f6d5;color:#276749;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700">✓ Presente: ${presentes}</span>
        <span style="background:#fed7d7;color:#c53030;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700">✗ Ausente: ${ausentes}</span>
        <span style="background:#fefcbf;color:#744210;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700">⏰ Tarde: ${tarde}</span>
        <span style="background:#e2e8f0;color:#4a5568;padding:4px 10px;border-radius:6px;font-size:12px">Total registros: ${total}</span>
      </div>`
    :'<p style="color:#a0aec0;font-size:12px;margin-top:6px">Sin registros de asistencia.</p>';

  /* General average from snapshots */
  const persProm=pers.map(per=>{
    const pd=notas[per]||{};
    const ds=mats.map(m=>def(pd[m]||{a:0,c:0,r:0}));
    return+(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(2);
  }).filter(v=>v>0);
  const gpromVal=persProm.length?+(persProm.reduce((a,b)=>a+b,0)/persProm.length).toFixed(2):0;

  const anoSys=parseInt(DB.anoActual||new Date().getFullYear());

  /* For deleted students: build year list from snapNotasPorAno keys only.
     For active students: use the system year range. */
  let anosDisponibles=[];
  if(!eActive){
    const porAno=h?.snapNotasPorAno||{};
    anosDisponibles=Object.keys(porAno).sort();
    /* If no keyed data but legacy snapNotas exists, tag it with elimination year */
    if(!anosDisponibles.length&&h?.snapNotas&&Object.keys(h.snapNotas).length){
      const anoElim=h.eliminado
        ?String(new Date(h.eliminado.split('/').reverse().join('-')).getFullYear()||anoSys)
        :String(anoSys);
      anosDisponibles=[anoElim];
    }
  } else {
    /* Active student: show years around system year */
    anosDisponibles=Array.from({length:5},(_,i)=>String(anoSys-2+i));
  }

  /* Build annoOpts — only real years for deleted, full range for active */
  const annoOpts=anosDisponibles.length
    ?anosDisponibles.map(y=>`<option value="${y}" ${y===String(anoSys)||anosDisponibles.length===1?'selected':''}>${y}</option>`).join('')
    :`<option value="${anoSys}">${anoSys}</option>`;

  /* _dlHistBol needs the right notas for the selected year */
  const snapData=eActive?null:{notasPorAno:h?.snapNotasPorAno||{},snapNotas:h?.snapNotas||{},mats,salon,disciplina,nombre,ti};
  _histSnap[eid]=snapData;

  /* Only show periodo buttons for periods that actually have data (in any available year) */
  const persConDatos=DB.pers.filter(per=>
    mats.some(m=>{const t=notas[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);}));
  const hayDatos=persConDatos.length>0;

  const dlSection=hayDatos&&anosDisponibles.length
    ?`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0">
        ${!eActive?`<span style="font-size:11px;color:#c53030;font-weight:700;background:#fff5f5;padding:3px 8px;border-radius:5px;border:1px solid #fed7d7">📁 Archivo histórico</span>`:''}
        <label style="font-size:12px;font-weight:700;color:var(--sl)">Año lectivo:</label>
        <select id="haAnno" style="padding:6px 10px;border:1.5px solid var(--bd);border-radius:6px;font-size:13px;outline:none">${annoOpts}</select>
        ${persConDatos.length>1?`<button class="btn bb sm" onclick="_dlHistBol('${eid}','TODOS')">📋 Todos los Periodos</button>`:''}
        ${persConDatos.map(p=>`<button class="btn bg sm" onclick="_dlHistBol('${eid}','${encodeURIComponent(p)}')">📄 ${p}</button>`).join('')}
      </div>`
    :`<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:12px;color:#a0aec0;font-style:italic">
        📭 Sin notas registradas — no hay boletín disponible para descargar.
      </div>`;

  Swal.fire({
    title:`📊 Historial Académico`,
    width:700,
    html:`<div style="text-align:left;font-family:var(--fn);max-height:70vh;overflow-y:auto;padding-right:4px">
      <!-- Header info -->
      <div style="background:#eef2f7;padding:12px 16px;border-radius:8px;margin-bottom:14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">
          <div>
            <div style="font-size:13px;line-height:1.8"><strong>Nombre:</strong> ${esc(nombre)}</div>
            <div style="font-size:13px;line-height:1.8"><strong>T.I.:</strong> ${esc(ti)}</div>
            <div style="font-size:13px;line-height:1.8"><strong>Salón:</strong> ${esc(salon)}</div>
          </div>
          <div>
            <div style="font-size:13px;line-height:1.8"><strong>Estado:</strong>
              <span style="color:${h?.activo!==false?'#276749':'#c53030'};font-weight:700">${estado}</span>
              ${eliminado!=='—'?`<span style="font-size:11px;color:#718096"> (eliminado ${eliminado})</span>`:''}
            </div>
            <div style="font-size:13px;line-height:1.8"><strong>Promedio general:</strong>
              <span style="color:${scCol(gpromVal)};font-weight:900;font-size:16px"> ${gpromVal.toFixed(2)}</span>
            </div>
            <div style="font-size:13px;line-height:1.8"><strong>Disciplina:</strong> ${esc(disciplina)}</div>
          </div>
        </div>
        ${dlSection}
      </div>
      <!-- Asistencia -->
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:var(--sl);margin-bottom:4px">📅 Asistencia</div>
        ${asistHTML}
      </div>
      <!-- Notas por periodo -->
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:var(--sl);margin-bottom:8px">📝 Notas por Periodo</div>
      ${perRows}
    </div>`,
    showConfirmButton:false,
    showCloseButton:true
  });
}
const _histSnap={};
function _dlHistBol(eid,perFilter){
  const anno=gi('haAnno')?.value||String(DB.anoActual||new Date().getFullYear());
  const raw=_histSnap[eid];
  if(!raw){
    /* Active student — normal path */
    dlBoletin(eid,perFilter,anno,null);
    return;
  }
  /* Deleted student — pick notas for the selected year */
  const notasForYear=raw.notasPorAno?.[anno]||raw.snapNotas||{};
  const snap={notas:notasForYear,mats:raw.mats,salon:raw.salon,disciplina:raw.disciplina,nombre:raw.nombre,ti:raw.ti};
  dlBoletin(eid,perFilter,anno,snap);
}

function filtrarHist(){
  const q=(gi('histQ')?.value||'').toLowerCase().trim();
  const f=gi('histFiltro')?.value||'todos';
  const box=gi('histW');if(!box)return;
  let lista=(DB.estHist||[]).filter(h=>{
    if(f==='activo'&&!h.activo) return false;
    if(f==='inactivo'&&h.activo) return false;
    if(!q) return true;
    return(h.nombre||'').toLowerCase().includes(q)||(h.ti||'').toLowerCase().includes(q)||(h.salon||'').toLowerCase().includes(q);
  });
  box.innerHTML=renderHistTabla(lista);
}

/* ============================================================
   ADMIN — EXCUSAS
============================================================ */
function pgAExc(){return`<div class="ph"><h2>Excusas Recibidas</h2><p>Horario de envío: 18:00 – 07:00</p></div><div id="aexcB"></div>`;}
function initAExc(){
  const el=gi('aexcB');if(!el)return;
  const list=(DB.exc||[]).slice().reverse();
  if(!list.length){el.innerHTML='<div class="mty"><div class="ei">✉️</div><p>Sin excusas</p></div>';return;}
  el.innerHTML=`<div class="card"><div class="tw"><table>
    <thead><tr><th>Fecha</th><th>Estudiante</th><th>Dirigida a</th><th>Causa</th><th>Descripción</th><th>Hora</th></tr></thead>
    <tbody>${list.map(x=>`<tr>
      <td style="font-family:var(--mn);font-size:12px">${x.fecha}</td>
      <td><strong>${x.enombre}</strong><br><span style="font-size:11px;color:var(--sl3)">${x.salon||'—'}</span></td>
      <td><span class="bdg bbl">${x.dest}</span></td>
      <td><span class="bdg bor">${x.causa}</span></td>
      <td style="font-size:12px;color:var(--sl2);max-width:200px">${x.desc||'—'}</td>
      <td style="font-family:var(--mn);font-size:11px">${x.ts?.split(',')[1]?.trim()||'—'}</td>
    </tr>`).join('')}</tbody></table></div></div>`;
}

/* ============================================================
   ADMIN — CLASES VIRTUALES
============================================================ */
function pgAVcl(){return`<div class="ph"><h2>Clases Virtuales</h2></div><div id="avcB"></div>`;}
function initAVcl(){
  const el=gi('avcB');if(!el)return;
  const clases=(DB.vclases||[]).slice().reverse();
  el.innerHTML=`<div class="card"><div class="chd"><span class="cti">📅 Clases Programadas (${clases.length})</span></div>
  ${clases.length?`<div class="tw"><table><thead>
    <tr><th>Salón</th><th>Profesor</th><th>Materias del Prof.</th><th>Fecha</th><th>Hora</th><th>Enlace</th><th>Descripción</th></tr></thead>
    <tbody>${clases.map(c=>`<tr>
      <td><span class="bdg bgy">${c.salon}</span></td>
      <td>${c.profNombre||'—'}</td>
      <td style="font-size:11px;color:var(--sl2)">${c.materias||'—'}</td>
      <td style="font-family:var(--mn);font-size:12px">${c.fecha}</td>
      <td style="font-family:var(--mn);font-size:12px">${c.hora}</td>
      <td><a href="${c.link}" target="_blank" class="btn xs bb">🔗 Abrir</a></td>
      <td style="font-size:12px;color:var(--sl2)">${c.desc||'—'}</td>
    </tr>`).join('')}</tbody></table></div>`
    :'<div class="mty"><div class="ei">💻</div><p>Sin clases programadas</p></div>'}
  </div>`;
}

/* ============================================================
   PROFESOR — HOME
============================================================ */
function pgPH(){
  const p=CU;
  return`<div class="ph"><h2>Bienvenido, ${p.nombre}</h2><p>${p.ciclo==='bachillerato'?'Bachillerato':'Primaria'}</p></div>
  <div class="sr">
    <div class="scc" data-i="🏫"><div class="sv">${(p.salones||[]).length}</div><div class="sl">Mis Salones</div><div class="bar"></div></div>
    ${p.ciclo==='bachillerato'?`<div class="scc" data-i="📖"><div class="sv" style="font-size:14px;margin-top:2px">${(p.materias||[]).join(', ')||'—'}</div><div class="sl">Mis Materias</div><div class="bar"></div></div>`:''}
    <div class="scc" data-i="🎓"><div class="sv">${(p.salones||[]).reduce((t,s)=>t+ebySalon(s).length,0)}</div><div class="sl">Estudiantes</div><div class="bar"></div></div>
  </div>
  <div class="card"><div class="chd"><span class="cti">🏫 Mis Salones</span></div>
  ${(p.salones||[]).length?(p.salones||[]).map(sal=>{
    const ests=ebySalon(sal);
    return`<div style="margin-bottom:18px">
      <div style="font-size:13px;font-weight:800;color:var(--nv);margin-bottom:8px">${sal} <span class="bdg bgy">${ests.length} est.</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${ests.map(e=>`<span style="font-size:12px;padding:4px 10px;background:var(--bg2);border-radius:7px;border:1px solid var(--bd)">${e.nombre}</span>`).join('')}</div>
    </div>`;
  }).join(''):'<div class="mty"><div class="ei">🏫</div><p>Sin salones</p></div>'}
  </div>
  <div class="card"><div class="chd"><span class="cti">✉️ Excusas Recibidas</span></div>
  <div id="pExcR"></div></div>
  ${DB.ext.on?(()=>{const pendRec=(DB.recs||[]).filter(r=>r.profId===CU.id&&!r.revisado).length;
    return pendRec?`<div class="al aly" style="cursor:pointer" onclick="goto('prec')">
      🔄 Tienes <strong>${pendRec}</strong> recuperación(es) pendiente(s) de revisión. <span style="text-decoration:underline">Ver ahora →</span>
    </div>`:'';})():''}
  <div class="card"><div class="chd"><span class="cti">📥 Descargar Informe</span></div>
    <p style="font-size:13px;color:var(--sl2);margin-bottom:12px">Genera un PDF o Excel con las calificaciones de tu salón sin necesidad de cargar la tabla de notas.</p>
    <button class="btn bg" onclick="selRptProf((CU.salones||[])[0]||'',DB.pers[0]||'','pdf')">📄 Descargar PDF</button>
    <button class="btn bs" style="margin-left:10px" onclick="selRptProf((CU.salones||[])[0]||'',DB.pers[0]||'','xls')">📊 Descargar Excel</button>
  </div>`;
}

/* ============================================================
   PROFESOR — NOTAS
============================================================ */
function pgPNot(){
  const p=CU;
  const sO=(p.salones||[]).map(s=>`<option value="${s}">${s}</option>`).join('');
  const pO=DB.pers.map(per=>{
    const ok=notasOk(per);
    return`<option value="${per}" ${!ok?'style="color:#a0aec0"':''}>
      ${ok?'✓':'🔒'} ${per}${!ok?' (cerrado)':''}
    </option>`;
  }).join('');
  /* Banner describing current state */
  const extTarget=DB.ext?.on
    ?Object.entries(DB.drPer||{}).find(([,dp])=>dp.extPer)?.[1]?.extPer||null
    :null;
  const banner=DB.ext?.on
    ?`<div class="al aly" style="margin-bottom:14px">
        🔄 Periodo Extraordinario activo.
        ${extTarget
          ?`Solo <strong>${extTarget}</strong> está abierto para ingreso de notas de recuperación. Los demás periodos están cerrados.`
          :'Configura el campo "Periodo Ext." en Control de Fechas para habilitar el periodo de recuperación.'}
      </div>`
    :'';
  return`<div class="ph"><h2>Ingresar Notas</h2><button class="btn xs bg" onclick="showHelp('pnot')">❓ Ayuda</button></div>
  <div id="pnLockBanner"></div>
  ${banner}
  <div class="card">
    <div class="al alb" style="margin-bottom:14px">
      <div>ℹ️ <strong>Sistema tripartita:</strong> Aptitud 60% + Actitud 20% + Responsabilidad 20% = Definitiva.<br>
      Solo el periodo seleccionado se modifica; los demás quedan en 0 hasta que se ingresen.</div>
    </div>
    <div class="fg">
      <div class="fld"><label>Salón</label>
        <select id="pns" onchange="updatePNMats()">${sO?'<option value="">Seleccionar</option>'+sO:'<option>Sin salones</option>'}</select></div>
      <div class="fld"><label>Periodo</label><select id="pnp"><option value="">Seleccionar</option>${pO}</select></div>
      ${p.ciclo==='bachillerato'?`<div class="fld"><label>Materia del Salón</label><select id="pnm">
        <option value="">— Selecciona salón primero —</option>
      </select></div>`:''}
      <div class="fld" style="display:flex;align-items:flex-end"><button class="btn bn" onclick="loadPN()">Cargar</button></div>
    </div>
    <div id="pnW"></div>
  </div>`;
}
function updatePNMats(){
  const sel=gi('pnm');if(!sel) return;
  const salon=gi('pns')?.value;
  if(!salon){sel.innerHTML='<option value="">— Selecciona salón primero —</option>';return;}
  const mats=getProfMatsSalon(CU.id,salon);
  sel.innerHTML=`<option value="">Todas las materias del salón</option>
    ${mats.map(m=>`<option value="${m}">${m}</option>`).join('')}`;
}
function loadPN(){
  const salon=gi('pns')?.value,per=gi('pnp')?.value;
  if(!salon||!per){sw('warning','Selecciona salón y periodo');return;}
  if(!notasOk(per)){sw('error','Ingreso de notas cerrado para este periodo');return;}
  const matSel=gi('pnm')?.value;
  const ests=ebySalon(salon);
  let mats;
  if(CU.ciclo==='bachillerato'){
    /* Use per-salon assigned materias */
    const salonMats=getProfMatsSalon(CU.id,salon);
    mats=matSel?[matSel]:(salonMats.length?salonMats:getMats(ests[0]?.id||''));
  } else {
    mats=getMats(ests[0]?.id||'');
  }
  const el=gi('pnW');
  if(!ests.length){el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes</p></div>';return;}
  el.innerHTML=`<div class="tw"><table>
    <thead>
      <tr><th>Estudiante</th>
        ${mats.map(m=>`<th colspan="4" style="text-align:center;border-left:2px solid var(--bd)">${m}</th>`).join('')}
        <th>Disciplina</th><th>Prom.</th></tr>
      <tr><td></td>
        ${mats.map(()=>'<th style="font-size:9px;color:var(--sl2);border-left:2px solid var(--bd)">Apt.60%</th><th style="font-size:9px;color:var(--sl2)">Act.20%</th><th style="font-size:9px;color:var(--sl2)">Res.20%</th><th style="font-size:9px;background:#e8f4fd">Def.</th>').join('')}
        <td></td><td></td></tr>
    </thead>
    <tbody id="pnB"></tbody>
  </table></div>
  <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
    <button class="btn bg sm" onclick="selRptProf('${salon}','${per}','pdf')">📄 Reporte PDF</button>
    <button class="btn bs sm" onclick="selRptProf('${salon}','${per}','xls')">📊 Descargar Excel</button>
  </div>`;
  const body=gi('pnB');
  ests.forEach(e=>{
    syncN(e.id);
    const tr=document.createElement('tr');tr.id='pnr'+e.id;
    const pp=pprom(e.id,per);
    const cells=mats.map(m=>{
      const t=DB.notas[e.id][per][m]||{a:0,c:0,r:0};const d=def(t);
      const enc=encodeURIComponent,em=enc(m),ep=enc(per);
      return`<td style="border-left:2px solid var(--bd);padding:5px">
        <input type="number" class="ni" min="0" max="5" step="0.1" value="${t.a.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="a" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.c.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="c" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.r.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="r" onchange="saveTri(this)"></td>
        <td id="dc_${e.id}_${em}_${ep}" style="background:#f0f8ff;padding:5px">
          <span class="${scC(d)}" style="font-size:11px">${d.toFixed(2)}</span></td>`;
    }).join('');
    tr.innerHTML=`<td><strong>${e.nombre}</strong></td>${cells}
      <td><select class="ni" style="width:110px" onchange="saveDisc('${e.id}',this.value)">
        ${['Excelente','Bueno','Regular','Deficiente'].map(dd=>`<option ${(DB.notas[e.id].disciplina||'')==dd?'selected':''}>${dd}</option>`).join('')}
      </select></td>
      <td id="apr_${e.id}"><span class="${scC(pp)}">${pp.toFixed(2)}</span></td>`;
    body.appendChild(tr);
  });
}
/* ============================================================
   SELECTOR DE SALÓN + MATERIA PARA REPORTES (bachillerato)
============================================================ */
function selRptProf(defaultSalon,defaultPer,tipo){
  /* For primaria: go straight to report */
  if(CU.ciclo!=='bachillerato'){
    tipo==='pdf'?dlRptProf(defaultSalon,defaultPer,null):dlRptXls(defaultSalon,defaultPer,null);
    return;
  }
  /* For bachillerato: show salon+materia picker */
  const salOpts=(CU.salones||[]).map(s=>`<option value="${s}" ${s===defaultSalon?'selected':''}>${s}</option>`).join('');
  const perOpts=DB.pers.map(p=>`<option value="${p}" ${p===defaultPer?'selected':''}>${p}</option>`).join('');

  Swal.fire({
    title:`${tipo==='pdf'?'📄 Reporte PDF':'📊 Informe Excel'}`,
    width:440,
    html:`<div style="text-align:left;font-family:var(--fn)">
      <div class="al alb" style="margin-bottom:12px;font-size:12px">
        Elige el salón, periodo y materia para generar el reporte.
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="fld" style="margin:0">
          <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Salón</label>
          <select id="rptSalon" style="width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px" onchange="updateRptMats()">
            ${salOpts||'<option value="">Sin salones</option>'}
          </select>
        </div>
        <div class="fld" style="margin:0">
          <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Periodo</label>
          <select id="rptPer" style="width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px">
            ${perOpts||'<option value="">Sin periodos</option>'}
          </select>
        </div>
        <div class="fld" style="margin:0">
          <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Materia (opcional)</label>
          <select id="rptMat" style="width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:14px">
            <option value="">Todas mis materias del salón</option>
            ${getProfMatsSalon(CU.id,defaultSalon).map(m=>`<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:tipo==='pdf'?'📄 Generar PDF':'📊 Generar Excel',
    didOpen:()=>updateRptMats(),
    preConfirm:()=>({salon:gi('rptSalon')?.value,per:gi('rptPer')?.value,mat:gi('rptMat')?.value})
  }).then(r=>{
    if(!r.isConfirmed) return;
    const{salon,per,mat}=r.value;
    if(!salon||!per){sw('warning','Selecciona salón y periodo');return;}
    tipo==='pdf'?dlRptProf(salon,per,mat||null):dlRptXls(salon,per,mat||null);
  });
}
/* Update materia dropdown when salon changes in report selector */
function updateRptMats(){
  const sel=gi('rptMat');if(!sel) return;
  const salon=gi('rptSalon')?.value||'';
  const mats=getProfMatsSalon(CU.id,salon);
  sel.innerHTML=`<option value="">Todas mis materias del salón</option>
    ${mats.map(m=>`<option value="${m}">${m}</option>`).join('')}`;
}

function dlRptProf(salon,per,matFilter){
  const ests=ebySalon(salon);
  if(!ests.length){sw('info','Sin datos','No hay estudiantes en este salón.');return;}
  /* Get materias: if matFilter provided show only that one; else all salon's prof materias */
  let mats=CU.ciclo==='bachillerato'?getProfMatsSalon(CU.id,salon):getMats(ests[0]?.id||'');
  if(matFilter) mats=[matFilter];
  const box=gi('pdfBox');
  const fechaGen=new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});
  const cicloLabel=cicloOf(salon)==='primaria'?'Primaria (1°–5°)':'Bachillerato (6°–11°)';
  const promGrupo=ests.reduce((s,e)=>s+pprom(e.id,per),0)/ests.length;

  /* One card per student (boletín-style) */
  const estudiantesHTML=ests.map((e,idx)=>{
    syncN(e.id);
    const pp=pprom(e.id,per);
    const ppu=puestoP(e.id,per);
    const disc=DB.notas[e.id]?.disciplina||'—';
    const filas=mats.map((m,mi)=>{
      const d=def(DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0});
      return`<tr style="background:${mi%2===0?'#f7fafc':'#fff'}">
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:500">${m}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:13px;color:${scCol(d)}">${d.toFixed(2)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;color:${d===0?'#a0aec0':d>=3?'#276749':'#c53030'};font-weight:600">${d===0?'Sin nota':d>=3?'✓ Aprobado':'✗ Reprobado'}</td>
      </tr>`;
    }).join('');
    return`<div style="margin-bottom:18px;page-break-inside:avoid;border:1px solid #d8e2ef;border-radius:8px;overflow:hidden">
      <div style="background:#1a3a5c;color:#fff;padding:9px 14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong style="font-size:13px">${e.nombre}</strong>
          <span style="font-size:11px;opacity:.65;margin-left:10px">T.I.: ${e.ti||'—'}</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:12px;opacity:.8">Puesto: ${ppu}° &nbsp;|&nbsp;</span>
          <span style="font-size:14px;font-weight:900;color:${scCol(pp)}">${pp.toFixed(2)}</span>
          <span style="font-size:11px;opacity:.65;margin-left:6px">Disciplina: ${disc}</span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="background:#2d5286;color:#fff;padding:6px 10px;text-align:left;font-size:11px">Materia</th>
          <th style="background:#2d5286;color:#fff;padding:6px 10px;text-align:center;font-size:11px">Definitiva</th>
          <th style="background:#2d5286;color:#fff;padding:6px 10px;text-align:center;font-size:11px">Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }).join('');

  box.innerHTML=`<div style="font-family:'Outfit',sans-serif;background:#fff;max-width:780px">
    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#0b1e33,#1a3a5c);color:#fff;padding:24px 28px;position:relative;overflow:hidden">
      <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.07;line-height:1">🏛️</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.15em;opacity:.5;margin-bottom:5px">EduSistema Pro · Reporte Docente</div>
      <h1 style="font-size:19px;font-weight:900;margin-bottom:4px">Informe de Calificaciones</h1>
      <p style="font-size:12px;opacity:.7">Salón: ${salon} &nbsp;·&nbsp; ${per} &nbsp;·&nbsp; Prof. ${CU.nombre} &nbsp;·&nbsp; ${cicloLabel}</p>
    </div>
    <!-- SUMMARY BAR -->
    <div style="background:#eef2f7;padding:12px 28px;display:flex;flex-wrap:wrap;gap:24px;font-size:12px;border-bottom:2px solid #d8e2ef">
      <div><span style="color:#718096">Salón:</span> <strong>${salon}</strong></div>
      <div><span style="color:#718096">Periodo:</span> <strong>${per}</strong></div>
      <div><span style="color:#718096">Estudiantes:</span> <strong>${ests.length}</strong></div>
      <div><span style="color:#718096">Materias reportadas:</span> <strong>${mats.join(', ')}</strong></div>
      <div><span style="color:#718096">Promedio del grupo:</span> <strong style="color:${scCol(promGrupo)}">${promGrupo.toFixed(2)}</strong></div>
      <div style="margin-left:auto"><span style="color:#718096">Emitido:</span> <strong>${fechaGen}</strong></div>
    </div>
    <!-- STUDENT CARDS -->
    <div style="padding:16px 28px">
      ${estudiantesHTML}
    </div>
    <!-- SIGNATURES -->
    <div style="display:flex;justify-content:space-around;margin-top:30px;padding:0 28px 28px">
      <div style="text-align:center"><div style="width:155px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div><small style="font-size:10px;color:#718096">Prof. ${CU.nombre}</small></div>
      <div style="text-align:center"><div style="width:155px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div><small style="font-size:10px;color:#718096">Coordinador(a) Académico</small></div>
      <div style="text-align:center"><div style="width:155px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div><small style="font-size:10px;color:#718096">Rector(a)</small></div>
    </div>
  </div>`;
  box.classList.remove('hidden');
  html2pdf().set({margin:[4,4,4,4],
    filename:`reporte_${salon}_${per.replace(/\s+/g,'_')}_${CU.nombre.replace(/\s+/g,'_')}.pdf`,
    html2canvas:{scale:2.5,useCORS:true,logging:false,letterRendering:true},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}})
    .from(box).save().then(()=>box.classList.add('hidden'));
}

/* ============================================================
   PROFESOR — INFORME EXCEL
============================================================ */
function dlRptXls(salon,per,matFilter){
  const ests=ebySalon(salon);
  if(!ests.length){sw('info','Sin datos','No hay estudiantes en este salón.');return;}
  let mats=CU.ciclo==='bachillerato'?getProfMatsSalon(CU.id,salon):getMats(ests[0]?.id||'');
  if(matFilter) mats=[matFilter];
  const fechaGen=new Date().toLocaleDateString('es-CO');
  const wb=XLSX.utils.book_new();

  /* ── Hoja 1: Definitivas ── */
  const defRows=[];
  /* Header */
  const hdr=['Estudiante','T.I.','Salón'];
  mats.forEach(m=>hdr.push(m+' — Definitiva'));
  hdr.push('Promedio Periodo','Disciplina');
  defRows.push(hdr);
  ests.forEach(e=>{
    syncN(e.id);
    const row=[e.nombre,e.ti||'',e.salon||''];
    mats.forEach(m=>row.push(def(DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0})));
    row.push(pprom(e.id,per));
    row.push(DB.notas[e.id]?.disciplina||'—');
    defRows.push(row);
  });
  /* Totals row */
  const promGrupo=ests.reduce((s,e)=>s+pprom(e.id,per),0)/ests.length;
  const totRow=['PROMEDIO GRUPO','',''];
  mats.forEach(m=>{
    const avg=ests.reduce((s,e)=>s+def(DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0}),0)/ests.length;
    totRow.push(+avg.toFixed(2));
  });
  totRow.push(+promGrupo.toFixed(2),'');
  defRows.push(totRow);

  const wsD=XLSX.utils.aoa_to_sheet(defRows);
  /* Column widths */
  wsD['!cols']=[{wch:28},{wch:14},{wch:10},...mats.map(()=>({wch:20})),{wch:18},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wsD,`${per} — Definitivas`);

  /* ── Hoja 2: Tripartita completa ── */
  const triRows=[];
  const hdr2=['Estudiante','T.I.'];
  mats.forEach(m=>{hdr2.push(`${m} Apt.60%`,`${m} Act.20%`,`${m} Res.20%`,`${m} Def.`);});
  hdr2.push('Promedio','Disciplina');
  triRows.push(hdr2);
  ests.forEach(e=>{
    syncN(e.id);
    const row=[e.nombre,e.ti||''];
    mats.forEach(m=>{
      const t=DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0};
      const d=def(t);
      row.push(t.a,t.c,t.r,+d.toFixed(2));
    });
    row.push(+pprom(e.id,per).toFixed(2));
    row.push(DB.notas[e.id]?.disciplina||'—');
    triRows.push(row);
  });
  const wsT=XLSX.utils.aoa_to_sheet(triRows);
  wsT['!cols']=[{wch:28},{wch:14},...mats.flatMap(()=>[{wch:12},{wch:12},{wch:12},{wch:12}]),{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wsT,`${per} — Tripartita`);

  /* ── Hoja 3: Info del reporte ── */
  const infoRows=[
    ['REPORTE DOCENTE — INFORME DE CALIFICACIONES'],[''],
    ['Profesor:',CU.nombre],
    ['T.I./CC:',CU.ti||'—'],
    ['Ciclo:',CU.ciclo==='bachillerato'?'Bachillerato (6°–11°)':'Primaria (1°–5°)'],
    ['Materias reportadas:',mats.join(', ')||'Todas las del salón'],
    ['Salón:',salon],
    ['Periodo:',per],
    ['Total estudiantes:',ests.length],
    ['Promedio del grupo:',+promGrupo.toFixed(2)],
    ['Fecha de generación:',fechaGen],
  ];
  const wsI=XLSX.utils.aoa_to_sheet(infoRows);
  wsI['!cols']=[{wch:26},{wch:40}];
  XLSX.utils.book_append_sheet(wb,wsI,'Info');

  XLSX.writeFile(wb,`informe_${salon}_${per.replace(/\s+/g,'_')}_${CU.nombre.replace(/\s+/g,'_')}.xlsx`);
  sw('success','Excel descargado','',1500);
}

/* ============================================================
   PROFESOR — ASISTENCIA
============================================================ */
function pgPAst(){
  const sO=(CU.salones||[]).map(s=>`<option value="${s}">${s}</option>`).join('');
  return`<div class="ph"><h2>Asistencias</h2></div>
  <div class="card">
    <div class="fg">
      <div class="fld"><label>Salón</label><select id="pas">${sO||'<option>Sin salones</option>'}</select></div>
      <div class="fld"><label>Fecha</label><input type="date" id="pad" value="${today()}"></div>
      <div class="fld" style="display:flex;align-items:flex-end"><button class="btn bn" onclick="loadAst()">Cargar</button></div>
    </div><div id="paW"></div>
  </div>`;
}
function initPAst(){}
function loadAst(){
  const s=gi('pas')?.value,d=gi('pad')?.value;
  if(!s||!d){sw('warning','Selecciona salón y fecha');return;}
  const key=`${s}__${d}`;
  if(!DB.asist[key]) DB.asist[key]={};
  const ests=ebySalon(s);const el=gi('paW');
  if(!ests.length){el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes</p></div>';return;}
  el.innerHTML=`<div class="tw"><table><thead>
    <tr><th>Estudiante</th><th style="width:90px;text-align:center">Presente</th><th style="width:90px;text-align:center">Ausente</th></tr></thead>
    <tbody>${ests.map(e=>{const v=DB.asist[key][e.id]??'presente';return`<tr id="ar${e.id}">
      <td>${e.nombre}</td>
      <td style="text-align:center"><button class="btn xs ${v==='presente'?'bs':'bg'}" onclick="setAst('${key}','${e.id}','presente')">✓</button></td>
      <td style="text-align:center"><button class="btn xs ${v==='ausente'?'bd':'bg'}" onclick="setAst('${key}','${e.id}','ausente')">✗</button></td>
    </tr>`;}).join('')}</tbody></table></div>
    <button class="btn bs" style="margin-top:12px" onclick="saveAst('${key}')">💾 Guardar</button>`;
}
function setAst(key,eid,val){
  if(!DB.asist[key]) DB.asist[key]={};
  DB.asist[key][eid]=val;
  const row=gi('ar'+eid);if(!row)return;
  const[bp,ba]=row.querySelectorAll('button');
  bp.className=`btn xs ${val==='presente'?'bs':'bg'}`;
  ba.className=`btn xs ${val==='ausente'?'bd':'bg'}`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function saveAst(key){ /* implementado en api-layer.js */ }
/* ============================================================
   PROFESOR — CLASES VIRTUALES
============================================================ */
function pgPVir(){
  const sO=(CU.salones||[]).map(s=>`<option value="${s}">${s}</option>`).join('');
  const mis=(DB.vclases||[]).filter(c=>c.profId===CU.id).slice().reverse();
  return`<div class="ph"><h2>Clases Virtuales</h2></div>
  <div class="card"><div class="chd"><span class="cti">📅 Programar Clase Virtual</span></div>
    <div class="fg">
      <div class="fld"><label>Salón</label><select id="vcs">${sO||'<option value="">Sin salones asignados</option>'}</select></div>
      <div class="fld"><label>Fecha</label><input type="date" id="vcf" value="${today()}"></div>
      <div class="fld"><label>Hora</label><input type="time" id="vch" value="08:00"></div>
    </div>
    <div class="fld"><label>Enlace de la Clase (Meet, Zoom, Teams, etc.)</label>
      <input id="vcl" placeholder="https://meet.google.com/abc-def-ghi"></div>
    <div class="fld"><label>Tema / Descripción</label>
      <input id="vcd" placeholder="Clase sobre..."></div>
    <button class="btn bn" onclick="addVClase()">📅 Programar</button>
  </div>
  <div class="card"><div class="chd"><span class="cti">📋 Mis Clases Programadas (${mis.length})</span></div>
  ${mis.length?`<div class="tw"><table><thead>
    <tr><th>Salón</th><th>Fecha</th><th>Hora</th><th>Enlace</th><th>Descripción</th><th></th></tr></thead>
    <tbody>${mis.map(c=>`<tr>
      <td><span class="bdg bgy">${c.salon}</span></td>
      <td style="font-family:var(--mn);font-size:12px">${c.fecha}</td>
      <td style="font-family:var(--mn);font-size:12px">${c.hora}</td>
      <td><a href="${c.link}" target="_blank" class="btn xs bb">🔗 Enlace</a></td>
      <td style="font-size:12px;color:var(--sl2)">${c.desc||'—'}</td>
      <td><button class="btn xs bd" onclick="delVClase('${c.id}')">🗑</button></td>
    </tr>`).join('')}</tbody></table></div>`
    :'<div class="mty"><div class="ei">💻</div><p>Sin clases programadas aún</p></div>'}
  </div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function addVClase(){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
function delVClase(id){ /* implementado en api-layer.js */ }

/* ============================================================
   PROFESOR — TAREAS RECIBIDAS
============================================================ */
function pgPTar(){
  const todas=[];
  Object.values(DB.ups||{}).forEach(lista=>{
    lista.forEach(u=>{if(u.profId===CU.id) todas.push(u);});
  });
  todas.sort((a,b)=>(b.id||'').localeCompare(a.id||''));
  const sinRevisar=todas.filter(u=>!u.revisado).length;
  const sOpts=(CU.salones||[]).map(s=>`<option value="${s}">${s}</option>`).join('');
  return`<div class="ph"><h2>Tareas Recibidas</h2><button class="btn xs bg" style="margin-top:4px" onclick="showHelp('ptar')">❓ Ayuda</button><p>${todas.length} archivo(s) enviados a ti${sinRevisar?` · <strong style="color:var(--red)">${sinRevisar} sin revisar</strong>`:''}</p></div>
  <div class="card"><div class="chd">
    <span class="cti">📂 Archivos Recibidos (${todas.length})</span>
    <select id="ptarF" style="padding:7px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none" onchange="filtrarPTar()">
      <option value="">Todos los salones</option>${sOpts}
    </select>
  </div>
  ${todas.length?`<div class="tw"><table><thead>
    <tr><th>Estudiante</th><th>Salón</th><th>Archivo</th><th>Materia</th><th>Periodo</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead>
    <tbody id="ptarB">${todas.map((u,i)=>{
      const est=DB.ests.find(e=>e.id===u.estId);
      const canOpen=!!u.dataUrl;
      return`<tr data-salon="${est?.salon||''}" style="background:${!u.revisado?'':'#f9fff9'}">
        <td><strong style="font-size:13px">${u.estNombre||'—'}</strong></td>
        <td><span class="bdg bgy">${est?.salon||'—'}</span></td>
        <td><span style="font-size:12px;font-family:var(--mn)">📎 ${u.nombre}</span><br>
          <span style="font-size:10px;color:var(--sl3)">${u.size?(u.size/1024).toFixed(1)+' KB':'—'}</span></td>
        <td><span class="bdg bbl">${u.materia}</span></td>
        <td style="font-size:12px">${u.periodo}</td>
        <td style="font-size:12px;color:var(--sl2);max-width:110px">${u.desc||'—'}</td>
        <td style="font-family:var(--mn);font-size:11px">${u.fecha}</td>
        <td>
          <span class="bdg ${u.revisado?'bgr':'bwa'}">${u.revisado?'✓ Revisado':'Pendiente'}</span>
          ${u.revisado?`<div style="font-size:10px;color:var(--sl3);margin-top:3px">${u.revisadoTs||''}</div>`:''}
        </td>
        <td style="display:flex;flex-direction:column;gap:5px">
          ${canOpen?`<button class="btn xs bb" onclick="abrirArchivo(${i})">📂 Abrir</button>`:''}
          ${!u.revisado?`<button class="btn xs bs" onclick="marcarTareaRevisada('${u.id}')">✓ Revisado</button>`
            :`<button class="btn xs br" onclick="eliminarTallerProf('${u.id}')">🗑️ Eliminar</button>`}
        </td>
      </tr>`;}).join('')}</tbody></table></div>`
  :'<div class="mty"><div class="ei">📂</div><p>Sin tareas recibidas aún</p></div>'}
  </div>`;
}
/* Collect professor's received tasks for index-based access */
function getPTarList(){
  const todas=[];
  Object.values(DB.ups||{}).forEach(lista=>{
    lista.forEach(u=>{if(u.profId===CU.id) todas.push(u);});
  });
  return todas.sort((a,b)=>(b.id||'').localeCompare(a.id||''));
}
function abrirArchivo(idx){
  const lista=getPTarList();
  const u=lista[idx];if(!u||!u.dataUrl){sw('error','Archivo no disponible');return;}
  /* Open in new tab */
  const w=window.open();
  if(!w){sw('error','Bloqueo de popups. Permite ventanas emergentes.');return;}
  const isPdf=u.type==='application/pdf';
  const isImg=u.type&&u.type.startsWith('image/');
  if(isPdf||isImg){
    w.document.write(`<html><head><title>${u.nombre}</title></head>
      <body style="margin:0;background:#222">
      <${isPdf?'embed':'img'} src="${u.dataUrl}" style="width:100%;height:100vh;${isPdf?'':'max-height:100vh;object-fit:contain'}" 
        ${isPdf?'type="application/pdf"':''}></${isPdf?'embed':'img'}>
      </body></html>`);
  } else {
    /* For word/excel: trigger download */
    const a=w.document.createElement('a');
    a.href=u.dataUrl;a.download=u.nombre;
    w.document.body.appendChild(a);a.click();
    w.close();
  }
}
function filtrarPTar(){
  const sal=gi('ptarF')?.value||'';
  qq('#ptarB tr').forEach(tr=>{tr.style.display=!sal||tr.dataset.salon===sal?'':'none';});
}
/* ── SOBREESCRITA por api-layer.js ── */
async function marcarTareaRevisada(upId){ /* implementado en api-layer.js */ }
/* Professor: delete a taller — only if revisado; if not, log to audit */
/* ── SOBREESCRITA por api-layer.js ── */
async function eliminarTallerProf(upId){ /* implementado en api-layer.js */ }
/* Professor: export history of sent plans as Excel */
function exportarHistorialPlanes(){
  const misPlanes=(DB.planes||[]).filter(p=>p.profId===CU.id).slice().reverse();
  if(!misPlanes.length){sw('info','Sin planes enviados aún');return;}
  const rows=misPlanes.map(p=>({
    'Fecha':p.fecha,'Salón':p.salon,'Estudiante':p.esSalon?'(Todo el salón)':p.estNombre,
    'Materia':p.materia,'Título':p.titulo,'Descripción':p.desc,
    'Fecha Límite':p.fechaLimite||'—','Archivo Adjunto':p.archNombre||'—',
    'Tipo':p.esSalon?'Grupal':'Individual'
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Planes Enviados');
  XLSX.writeFile(wb,`Historial_Planes_${CU.nombre.replace(/\s+/g,'_')}_${new Date().toLocaleDateString('es-CO').replace(/\//g,'-')}.xlsx`);
  sw('success','Excel descargado','',1200);
}

/* ============================================================
   PROFESOR — RECUPERACIONES RECIBIDAS
============================================================ */
function pgPRec(){
  if(!DB.ext.on) return`<div class="ph"><h2>Recuperaciones</h2></div>
    <div class="al aly">⚠️ El periodo extraordinario no está activo. El admin debe habilitarlo en Control de Fechas.</div>`;

  /* ── Section 1: Students who need recovery plan from THIS professor ── */
  const misSalones=CU.salones||[];
  /* Find all students in my salons who lost a subject I teach */
  const elegibles=[];
  misSalones.forEach(salon=>{
    const matsProf=getProfMatsSalon(CU.id,salon);
    ebySalon(salon).forEach(est=>{
      const mp=matPerd(est.id);
      const misMateriasPerdidas=mp.filter(m=>matsProf.includes(m)||(CU.ciclo==='primaria'&&mp.length));
      if(misMateriasPerdidas.length>=1&&misMateriasPerdidas.length<=2){
        misMateriasPerdidas.forEach(mat=>{
          const planYaEnviado=(DB.planes||[]).find(p=>p.estId===est.id&&p.materia===mat&&p.profId===CU.id);
          elegibles.push({est,mat,salon,planYaEnviado:planYaEnviado||null});
        });
      }
    });
  });

  /* ── Section 2: Received recovery submissions from students ── */
  const recs=(DB.recs||[]).filter(r=>r.profId===CU.id).slice().reverse();
  const pendientes=recs.filter(r=>!r.revisado).length;

  /* Group elegibles by salon */
  const bySalon={};
  elegibles.forEach(item=>{
    if(!bySalon[item.salon]) bySalon[item.salon]=[];
    bySalon[item.salon].push(item);
  });

  const salonCards=Object.entries(bySalon).map(([salon,items])=>{
    /* All group plans sent to this salon by this prof */
    const planesGrupo=(DB.planes||[]).filter(p=>p.salon===salon&&p.profId===CU.id&&p.esSalon);
    /* Collect unique materias for this salon */
    const matsEnSalon=[...new Set(items.map(i=>i.mat))];
    return`
    <div style="margin-bottom:16px;padding:14px;background:var(--bg2);border-radius:10px;border:1px solid var(--bd)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <span style="font-size:13px;font-weight:800;color:var(--nv)">🏫 Salón ${salon}</span>
          <span class="bdg bgy" style="margin-left:8px">${items.length} estudiante(s)</span>
          ${matsEnSalon.map(m=>`<span class="bdg brd" style="margin-left:4px">${m}</span>`).join('')}
        </div>
        <button class="btn bn sm" onclick="abrirEnviarPlanSalon('${salon}','${matsEnSalon.join('|')}')">
          📤 ${planesGrupo.length?'Enviar Otro Plan al Salón':'Enviar Plan al Salón'}
        </button>
      </div>
      ${planesGrupo.length?`<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:800;color:var(--sl);text-transform:uppercase;margin-bottom:6px">Planes enviados al salón (${planesGrupo.length})</div>
        ${planesGrupo.slice().reverse().map(pl=>`<div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:7px;padding:8px 12px;font-size:12px;margin-bottom:5px">
          <span class="bdg bgr" style="margin-right:8px">✓ ${pl.fecha}</span>
          <strong>${pl.titulo}</strong>
          ${pl.archNombre?`<span style="margin-left:8px;color:var(--sl3)">📎 ${pl.archNombre}</span>`:''}
          <span style="margin-left:8px;color:var(--sl3)">📅 ${pl.fechaLimite||DB.ext.e||'—'}</span>
        </div>`).join('')}
      </div>`:''}
      <div class="tw" style="margin-top:10px"><table><thead>
        <tr><th>Estudiante</th><th>Materia</th><th>Planes Individuales</th><th>Enviar Individual</th></tr>
      </thead><tbody>
        ${items.map(({est,mat})=>{
          const planesInd=(DB.planes||[]).filter(p=>p.estId===est.id&&p.materia===mat&&p.profId===CU.id&&!p.esSalon);
          return`<tr>
            <td><strong>${est.nombre}</strong></td>
            <td><span class="bdg brd">${mat}</span></td>
            <td>${planesInd.length
              ?planesInd.slice().reverse().map(pl=>`<span class="bdg bgr" style="font-size:10px;margin:1px">✓ ${pl.fecha}</span>`).join('')
              :(planesGrupo.length?`<span class="bdg bgy" style="font-size:10px">${planesGrupo.length} via salón</span>`:'<span style="font-size:11px;color:var(--sl3)">—</span>')}
            </td>
            <td>
              <button class="btn xs bg" onclick="abrirEnviarPlan('${est.id}','${mat}','${salon}')">
                📤 ${planesInd.length?'Otro':'Enviar'}
              </button>
            </td>
          </tr>`;}).join('')}
      </tbody></table></div>
    </div>`;
  }).join('');

  return`<div class="ph"><h2>Recuperaciones</h2>
    <button class="btn xs bg" style="margin-top:4px" onclick="showHelp('prec')">❓ Ayuda</button>
    <p>Periodo Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></p>
    <button class="btn bg sm" style="margin-top:8px" onclick="exportarHistorialPlanes()">📊 Exportar Historial de Planes (Excel)</button></div>

  <!-- Plan de recuperación por salón -->
  <div class="card">
    <div class="chd"><span class="cti">📋 Estudiantes que Deben Recuperar tu Materia</span>
      <span class="bdg brd">${elegibles.length} estudiante(s)</span>
    </div>
    ${elegibles.length
      ?`<div class="al alb" style="font-size:12px;margin-bottom:12px">
          ℹ️ Usa <strong>"Enviar Plan al Salón"</strong> para enviar un plan a todos los estudiantes del salón de una vez (con archivo adjunto). O usa el botón individual 📤 por estudiante si prefieres planes personalizados.
        </div>${salonCards}`
      :'<div class="mty"><div class="ei">🎓</div><p>Ningún estudiante de tus salones tiene materias a recuperar contigo.</p></div>'}
  </div>

  <!-- Respuestas recibidas — agrupadas por estudiante -->
  <div class="card">
    <div class="chd">
      <span class="cti">📂 Respuestas de Recuperación por Estudiante</span>
      ${pendientes?`<span class="bdg brd">⚠️ ${pendientes} pendiente(s)</span>`:''}
    </div>
    ${recs.length?(()=>{
      /* Group by student */
      const porEst={};
      recs.forEach(r=>{
        if(!porEst[r.estId]) porEst[r.estId]={nombre:r.estNombre,salon:r.salon,recs:[]};
        porEst[r.estId].recs.push(r);
      });
      return Object.entries(porEst).map(([estId,data])=>{
        const pendEst=data.recs.filter(r=>!r.revisado).length;
        const recIdx=recs; /* for abrirRec index */
        return`<div style="margin-bottom:14px;padding:14px;background:${pendEst?'#fffff8':'var(--bg2)'};border-radius:10px;border:1.5px solid ${pendEst?'#f6e05e':'var(--bd)'}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
            <div>
              <strong style="font-size:14px">${data.nombre}</strong>
              <span class="bdg bgy" style="margin-left:8px">${data.salon||'—'}</span>
              <span class="bdg bbl" style="margin-left:6px">${data.recs.length} archivo(s)</span>
            </div>
            ${pendEst?`<span class="bdg brd">⚠️ ${pendEst} sin revisar</span>`:
              `<span class="bdg bgr">✓ Todo revisado</span>`}
          </div>
          <div class="tw"><table><thead>
            <tr><th>Archivo</th><th>Materia</th><th>Responde al Plan</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr>
          </thead><tbody>
            ${data.recs.map(r=>{
              const idx=recs.findIndex(x=>x.id===r.id);
              const planRef=r.planId?(DB.planes||[]).find(p=>p.id===r.planId):null;
              return`<tr style="background:${!r.revisado?'#fffff0':''}">
                <td><span style="font-size:12px;font-family:var(--mn)">📎 ${r.nombre}</span></td>
                <td><span class="bdg brd">${r.materia}</span></td>
                <td style="font-size:12px;max-width:140px">${planRef
                  ?`<span style="color:var(--nv);font-weight:700">${planRef.titulo}</span><br><span style="font-size:10px;color:var(--sl3)">${planRef.fecha}</span>`
                  :'<span style="color:var(--sl3)">—</span>'}
                </td>
                <td style="font-size:12px;color:var(--sl2);max-width:110px">${r.desc||'—'}</td>
                <td style="font-family:var(--mn);font-size:11px">${r.fecha}</td>
                <td>
                  <span class="bdg ${r.revisado?'bgr':'bwa'}">${r.revisado?'✓ Revisado':'Pendiente'}</span>
                  ${r.revisado?`<div style="font-size:10px;color:var(--sl3)">${r.revisadoTs||''}</div>`:''}
                </td>
                <td style="display:flex;flex-direction:column;gap:4px">
                  ${r.dataUrl?`<button class="btn xs bb" onclick="abrirRec(${idx})">📂 Abrir</button>`:''}
                  ${!r.revisado?`<button class="btn xs bs" onclick="marcarRecRevisado('${r.id}')">✓ Revisado</button>`:''}
                </td>
              </tr>`;}).join('')}
          </tbody></table></div>
        </div>`;
      }).join('');
    })()
    :'<div class="mty"><div class="ei">📂</div><p>Sin respuestas de recuperación aún</p></div>'}
  </div>`;
}

/* ── Shared plan dialog builder ── */
function _planDialog({titulo='',desc='',archNombre='',archDataUrl='',archType='',existing=null,destinatario='',onConfirm}){
  const fechaLimite=DB.ext.e||'';/* Always locked to admin-defined end date */
  const inputId='planFile_'+Date.now();
  Swal.fire({
    title:'📋 Plan de Recuperación',width:600,
    html:`<div style="text-align:left;font-family:var(--fn)">
      <div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">
        ${destinatario}
      </div>
      ${existing?`<div class="al alg" style="margin-bottom:10px;font-size:12px">
        ✓ Ya enviaste un plan el <strong>${existing.fecha}</strong>. Puedes reenviarlo.</div>`:''}
      <div class="fld" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl)">Título del Plan</label>
        <input id="planTitulo" value="${titulo}" placeholder="Ej: Plan de Nivelación — Matemáticas P3">
      </div>
      <div class="fld" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl)">Descripción / Actividades</label>
        <textarea id="planDesc" rows="5" style="width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;resize:vertical;outline:none;font-family:var(--fn);box-sizing:border-box" placeholder="Actividades, recursos, criterios de evaluación...">${desc}</textarea>
      </div>
      <div class="fld" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl)">Adjuntar Archivo (opcional — PDF, Word, Excel — máx 5 MB)</label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="cursor:pointer;padding:8px 14px;background:var(--nv);color:#fff;border-radius:var(--r);font-size:12px;font-weight:700">
            📎 Seleccionar archivo
            <input type="file" id="${inputId}" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" style="display:none" onchange="onPlanFilePick(this,'planFileLabel')">
          </label>
          <span id="planFileLabel" style="font-size:12px;color:var(--sl2)">${archNombre?'📎 '+archNombre:'Sin archivo seleccionado'}</span>
        </div>
      </div>
      <div class="fld" style="margin-bottom:0;background:#fff3cd;border-radius:8px;padding:10px 14px;border:1px solid #f6c343">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:#856404">📅 Fecha Límite de Entrega</label>
        <div style="font-size:15px;font-weight:800;color:#c53030;margin-top:4px">${fechaLimite||'No definida por el admin'}</div>
        <div style="font-size:11px;color:#856404;margin-top:2px">Definida por el administrador (fin del periodo extraordinario)</div>
      </div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:'📤 Enviar Plan',cancelButtonText:'Cancelar',confirmButtonColor:'var(--nv)',
    didOpen:()=>{/* store ref to file input */window._planFileInput=gi(inputId);},
    preConfirm:()=>{
      const t=gi('planTitulo').value.trim(),d=gi('planDesc').value.trim();
      if(!t||!d){Swal.showValidationMessage('Título y descripción son obligatorios');return false;}
      return{titulo:t,desc:d,fechaLimite};
    }
  }).then(r=>{
    if(!r.isConfirmed)return;
    const f=window._planFileInput?.files[0];
    if(f){
      if(f.size>5*1024*1024){sw('error','Archivo muy grande (máx 5 MB)');return;}
      const reader=new FileReader();
      reader.onload=ev=>onConfirm({...r.value,archNombre:f.name,archType:f.type,archDataUrl:ev.target.result});
      reader.onerror=()=>sw('error','Error al leer el archivo');
      reader.readAsDataURL(f);
    } else {
      onConfirm({...r.value,archNombre:archNombre,archType:archType,archDataUrl:archDataUrl});
    }
  });
}
window.onPlanFilePick=function(inp,labelId){
  const lb=gi(labelId);if(lb&&inp.files[0]) lb.textContent='📎 '+inp.files[0].name;
};

/* Send plan to entire salon */
function abrirEnviarPlanSalon(salon,matsStr){
  const mats=matsStr.split('|').filter(Boolean);
  const existing=(DB.planes||[]).filter(p=>p.salon===salon&&p.profId===CU.id&&p.esSalon);
  const last=existing.length?existing[existing.length-1]:null;
  _planDialog({
    titulo:last?.titulo||'',desc:last?.desc||'',
    archNombre:last?.archNombre||'',archDataUrl:last?.archDataUrl||'',archType:last?.archType||'',
    existing:last,
    destinatario:`<strong>Para todo el Salón ${salon}</strong> · Materias: ${mats.map(m=>`<span class="bdg brd" style="font-size:10px">${m}</span>`).join(' ')}`,
    onConfirm(vals){
      if(!DB.planes) DB.planes=[];
      /* Get all students in salon who need this prof's recovery */
      const matsProf=getProfMatsSalon(CU.id,salon);
      const estudiantesDestino=ebySalon(salon).filter(est=>{
        const mp=matPerd(est.id);
        return mp.some(m=>matsProf.includes(m)||(CU.ciclo==='primaria'));
      });
      const fecha=new Date().toLocaleDateString('es-CO');
      const planId='plan_'+Date.now();
      /* Create one plan entry per student (so each student sees it) */
      estudiantesDestino.forEach((est,idx)=>{
        mats.forEach(mat=>{
          /* Append new plan — keep all previous ones */
          DB.planes.push({
            id:planId+'_'+est.id+'_'+idx,
            estId:est.id,estNombre:est.nombre,salon,
            materia:mat,profId:CU.id,profNombre:CU.nombre,
            titulo:vals.titulo,desc:vals.desc,
            fechaLimite:vals.fechaLimite,
            archNombre:vals.archNombre||'',archDataUrl:vals.archDataUrl||'',archType:vals.archType||'',
            fecha,visto:false,esSalon:true,planId
          });
        });
      });
      dbSave();goto('prec');
      sw('success',`Plan enviado a ${estudiantesDestino.length} estudiante(s) del salón ${salon}`,'',1800);
    }
  });
}

/* Send plan to individual student */
function abrirEnviarPlan(estId,materia,salon){
  const est=DB.ests.find(x=>x.id===estId);if(!est)return;
  const existing=(DB.planes||[]).find(p=>p.estId===estId&&p.materia===materia&&p.profId===CU.id);
  _planDialog({
    titulo:existing?.titulo||'',desc:existing?.desc||'',
    archNombre:existing?.archNombre||'',archDataUrl:existing?.archDataUrl||'',archType:existing?.archType||'',
    existing,
    destinatario:`<strong>${est.nombre}</strong> · <span style="color:#c53030">${materia}</span> · Salón ${salon}`,
    onConfirm(vals){
      if(!DB.planes) DB.planes=[];
      /* Append new plan — keep all previous ones */
      DB.planes.push({
        id:'plan_'+Date.now(),
        estId,estNombre:est.nombre,salon,
        materia,profId:CU.id,profNombre:CU.nombre,
        titulo:vals.titulo,desc:vals.desc,
        fechaLimite:vals.fechaLimite,
        archNombre:vals.archNombre||'',archDataUrl:vals.archDataUrl||'',archType:vals.archType||'',
        fecha:new Date().toLocaleDateString('es-CO'),
        visto:false,esSalon:false
      });
      dbSave();goto('prec');sw('success','Plan enviado al estudiante','',1500);
    }
  });
}

function getRecList(){
  return(DB.recs||[]).filter(r=>r.profId===CU.id).slice().reverse();
}
function abrirRec(idx){
  const lista=getRecList();const r=lista[idx];
  if(!r||!r.dataUrl){sw('error','Archivo no disponible');return;}
  const w=window.open();if(!w){sw('error','Permite ventanas emergentes');return;}
  const isPdf=r.type==='application/pdf';const isImg=r.type?.startsWith('image/');
  if(isPdf||isImg){
    w.document.write(`<html><head><title>${r.nombre}</title></head>
      <body style="margin:0;background:#222">
      <${isPdf?'embed':'img'} src="${r.dataUrl}" style="width:100%;height:100vh" ${isPdf?'type="application/pdf"':''}></${isPdf?'embed':'img'}>
      </body></html>`);
  }else{const a=w.document.createElement('a');a.href=r.dataUrl;a.download=r.nombre;w.document.body.appendChild(a);a.click();w.close();}
}
/* ── SOBREESCRITA por api-layer.js ── */
async function marcarRecRevisado(id){ /* implementado en api-layer.js */ }

/* ============================================================
   ESTUDIANTE — HISTORIAL DE RECUPERACIONES (periodos pasados)
============================================================ */
function pgEHist(){
  const hist=(DB.histRecs||[]).filter(r=>r.estId===CU.id).slice().reverse();
  const periodos=[...new Set(hist.map(r=>r._periodo))];
  if(!hist.length) return`<div class="ph"><h2>Historial Recuperaciones</h2></div>
    <div class="al alb">📭 Aún no hay periodos de recuperación archivados.</div>`;
  const cards=periodos.map(per=>{
    const items=hist.filter(r=>r._periodo===per);
    return`<div class="card" style="margin-bottom:14px">
      <div class="chd"><span class="cti">📅 Periodo: ${per}</span>
        <span class="bdg bgy" style="font-size:11px">Archivado ${items[0]?._archivedAt||''}</span>
      </div>
      <div class="tw"><table><thead>
        <tr><th>Materia</th><th>Plan</th><th>Archivo enviado</th><th>Descripción</th><th>Fecha envío</th><th>Estado</th><th>Abrir</th></tr>
      </thead><tbody>
        ${items.map((r,i)=>{
          const planRef=r.planId?(DB.histPlanes||[]).find(p=>p.id===r.planId):null;
          return`<tr>
            <td><span class="bdg brd">${r.materia}</span></td>
            <td style="font-size:12px;max-width:130px">${planRef?`<strong>${planRef.titulo}</strong>`:'<span style="color:var(--sl3)">—</span>'}</td>
            <td><span style="font-size:12px;font-family:var(--mn)">📎 ${r.nombre}</span></td>
            <td style="font-size:12px;color:var(--sl2);max-width:110px">${r.desc||'—'}</td>
            <td style="font-family:var(--mn);font-size:11px">${r.fecha}</td>
            <td><span class="bdg ${r.revisado?'bgr':'brd'}">${r.revisado?`✓ Revisado ${r.revisadoTs||''}`:'✗ No revisado'}</span></td>
            <td>${r.dataUrl?`<button class="btn xs bb" onclick="abrirHistRec('histRecs',${(DB.histRecs||[]).indexOf(r)})">📂 Abrir</button>`:'—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
    </div>`;
  }).join('');
  return`<div class="ph"><h2>Historial de Recuperaciones</h2>
    <button class="btn xs bg" style="margin-top:4px" onclick="showHelp('ehist')">❓ Ayuda</button>
    <p>Registro de todos los trabajos enviados en periodos extraordinarios anteriores.</p></div>
  ${cards}`;
}

/* ============================================================
   PROFESOR — HISTORIAL DE RECUPERACIONES RECIBIDAS
============================================================ */
function pgPHist(){
  const hist=(DB.histRecs||[]).filter(r=>r.profId===CU.id).slice().reverse();
  const periodos=[...new Set(hist.map(r=>r._periodo))];
  const busqId='phistBusq_'+Date.now();
  if(!hist.length) return`<div class="ph"><h2>Historial Recuperaciones</h2></div>
    <div class="al alb">📭 Aún no hay periodos de recuperación archivados.</div>`;
  return`<div class="ph"><h2>Historial de Recuperaciones Recibidas</h2>
    <button class="btn xs bg" style="margin-top:4px" onclick="showHelp('phist')">❓ Ayuda</button>
    <p>Registro de todas las recuperaciones recibidas en periodos anteriores.</p></div>
  <div class="card">
    <div class="chd"><span class="cti">🔍 Buscar</span></div>
    <input id="phistQ" placeholder="Buscar por nombre de archivo, estudiante o materia..." 
      style="width:100%;padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none;box-sizing:border-box"
      oninput="filtrarHistProf()">
  </div>
  <div id="phistList">
    ${periodos.map(per=>{
      const items=hist.filter(r=>r._periodo===per);
      return`<div class="card phist-period" data-periodo="${per}" style="margin-bottom:14px">
        <div class="chd"><span class="cti">📅 Periodo: ${per}</span>
          <span class="bdg bgy" style="font-size:11px">Archivado ${items[0]?._archivedAt||''}</span>
          <span class="bdg bbl">${items.length} archivo(s)</span>
        </div>
        <div class="tw"><table><thead>
          <tr><th>Estudiante</th><th>Salón</th><th>Materia</th><th>Archivo</th><th>Plan</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th>Abrir</th></tr>
        </thead><tbody class="phist-body">
          ${items.map(r=>{
            const planRef=r.planId?(DB.histPlanes||[]).find(p=>p.id===r.planId):null;
            const globalIdx=(DB.histRecs||[]).indexOf(r);
            return`<tr class="phist-row" data-search="${(r.estNombre+' '+r.materia+' '+r.nombre+' '+(planRef?.titulo||'')).toLowerCase()}">
              <td><strong>${r.estNombre||'—'}</strong></td>
              <td><span class="bdg bgy">${r.salon||'—'}</span></td>
              <td><span class="bdg brd">${r.materia}</span></td>
              <td><span style="font-size:12px;font-family:var(--mn)">📎 ${r.nombre}</span></td>
              <td style="font-size:12px;max-width:130px">${planRef?`<strong>${planRef.titulo}</strong><br><span style="font-size:10px;color:var(--sl3)">${planRef.fecha}</span>`:'<span style="color:var(--sl3)">—</span>'}</td>
              <td style="font-size:12px;color:var(--sl2);max-width:100px">${r.desc||'—'}</td>
              <td style="font-family:var(--mn);font-size:11px">${r.fecha}</td>
              <td><span class="bdg ${r.revisado?'bgr':'brd'}">${r.revisado?`✓ Revisado`:'✗ Sin revisar'}</span>
                ${r.revisado?`<div style="font-size:10px;color:var(--sl3)">${r.revisadoTs||''}</div>`:''}</td>
              <td>${r.dataUrl?`<button class="btn xs bb" onclick="abrirHistRec('histRecs',${globalIdx})">📂 Abrir</button>`:'—'}</td>
            </tr>`;
          }).join('')}
        </tbody></table></div>
      </div>`;
    }).join('')}
  </div>`;
}
function filtrarHistProf(){
  const q=(gi('phistQ')?.value||'').toLowerCase().trim();
  qq('.phist-row').forEach(tr=>{
    const match=!q||tr.dataset.search.includes(q);
    tr.style.display=match?'':'none';
  });
  /* Hide period cards that have no visible rows */
  qq('.phist-period').forEach(card=>{
    const rows=[...card.querySelectorAll('.phist-row')];
    card.style.display=rows.some(r=>r.style.display!=='none')?'':'none';
  });
}
/* Open archived file */
function abrirHistRec(db,idx){
  const r=(DB[db]||[])[idx];
  if(!r||!r.dataUrl){sw('error','Archivo no disponible en el historial');return;}
  const w=window.open();if(!w){sw('error','Permite ventanas emergentes');return;}
  const isPdf=r.type==='application/pdf';const isImg=r.type?.startsWith('image/');
  if(isPdf||isImg){
    w.document.write(`<html><head><title>${r.nombre}</title></head>
      <body style="margin:0;background:#222">
      <${isPdf?'embed':'img'} src="${r.dataUrl}" style="width:100%;height:100vh" ${isPdf?'type="application/pdf"':''}></${isPdf?'embed':'img'}>
      </body></html>`);
  }else{const a=w.document.createElement('a');a.href=r.dataUrl;a.download=r.nombre;w.document.body.appendChild(a);a.click();w.close();}
}

function pgEB(){return`<div class="ph"><h2>Mi Boletín</h2><button class="btn xs bg" onclick="showHelp('eb')">❓ Ayuda</button></div><div id="ebB"></div>`;}

function initEB(){
  const e=CU;syncN(e.id);
  const pg=gprom(e.id),ps=puestoS(e.id),mp=matPerd(e.id);
  const anoLabel=DB.anoActual||String(new Date().getFullYear());
  const mats=getMats(e.id);

  /* Only render periods that have at least one real note */
  const persConDatos=DB.pers.filter(per=>
    mats.some(m=>{const t=DB.notas[e.id]?.[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);}));

  let h=`<div class="al alb" style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <span>📅 Año Lectivo: <strong style="font-size:15px;color:var(--nv)">${anoLabel}</strong></span>
    <span style="font-size:12px;color:var(--sl2)">Salón: <strong>${e.salon||'Sin asignar'}</strong></span>
  </div>`;

  if(!persConDatos.length){
    h+=`<div class="card"><div class="mty"><div class="ei">📭</div>
      <p>Aún no tienes notas registradas.</p>
      <p style="font-size:13px;color:var(--sl3)">Cuando tu profesor ingrese las calificaciones aparecerán aquí.</p>
    </div></div>`;
    gi('ebB').innerHTML=h+mkBoletinUI(e.id,'est');
    return;
  }

  h+=`<div class="sr">
    <div class="scc" data-i="📊"><div class="sv" style="color:${scCol(pg)}">${pg.toFixed(2)}</div><div class="sl">Prom. General</div><div class="bar"></div></div>
    <div class="scc" data-i="🏆"><div class="sv">${ps}</div><div class="sl">Puesto Salón</div><div class="bar"></div></div>
    <div class="scc" data-i="🏫"><div class="sv" style="font-size:${(e.salon||'—').length>4?'15px':'22px'};margin-top:2px">${e.salon||'—'}</div><div class="sl">Mi Salón</div><div class="bar"></div></div>
    <div class="scc" data-i="⚠️"><div class="sv" style="color:${mp.length>0?'var(--red)':'var(--grn)'}">${mp.length}</div><div class="sl">Mat. Perdidas</div><div class="bar"></div></div>
  </div>`;

  if(DB.ext.on&&mp.length>=1&&mp.length<=2){
    h+=`<div class="rbc"><h4>⚠️ Tienes ${mp.length} materia(s) en recuperación</h4>
      <p style="font-size:13px;margin-bottom:8px">${mp.map(m=>`<span class="bdg brd" style="margin:2px">${m}</span>`).join('')}</p>
      <p style="font-size:13px">Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></p></div>`;
  }

  persConDatos.forEach(per=>{
    const pp=pprom(e.id,per),ppu=puestoP(e.id,per);
    h+=`<div class="card"><div class="chd">
      <span class="cti">${per}</span>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:12px;color:var(--sl2)">Puesto: <strong>${ppu}</strong></span>
        <span class="${scC(pp)}" style="font-size:14px">Prom. ${pp.toFixed(2)}</span>
      </div></div>
      <div class="tw"><table><thead>
        <tr><th>Materia</th><th>Aptitud</th><th>Actitud</th><th>Resp.</th><th>Definitiva</th><th>Estado</th><th>Profesor</th></tr>
      </thead><tbody>${mats.map(m=>{
        const t=DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
        const prf=profForMat(m,e.salon);
        return`<tr><td>${m}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.a.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.c.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.r.toFixed(1)}</td>
          <td><span class="${scC(d)}">${d.toFixed(2)}</span></td>
          <td><span class="bdg ${d>=3?'bgr':'brd'}">${d===0?'Sin nota':d>=3?'Aprobado':'Reprobado'}</span></td>
          <td style="font-size:12px;color:var(--sl2)">${prf?prf.nombre:'Sin asignar'}</td>
        </tr>`;
      }).join('')}</tbody></table></div></div>`;
  });

  h+=mkBoletinUI(e.id,'est');
  gi('ebB').innerHTML=h;
}

/* ============================================================
   ESTUDIANTE — ASISTENCIA
============================================================ */
function pgEAst(){
  const e=CU;
  const recs=[];
  Object.entries(DB.asist).forEach(([key,data])=>{
    const[salon,...rest]=key.split('__');const fecha=rest.join('__');
    if(salon===e.salon) recs.push({fecha,val:data[e.id]??'presente'});
  });
  recs.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const pres=recs.filter(r=>r.val==='presente').length;
  const aus=recs.filter(r=>r.val==='ausente').length;
  return`<div class="ph"><h2>Mi Asistencia</h2><button class="btn xs bg" onclick="showHelp('east')">❓ Ayuda</button></div>
  <div class="sr">
    <div class="scc" data-i="✅"><div class="sv" style="color:var(--grn)">${pres}</div><div class="sl">Presente</div><div class="bar"></div></div>
    <div class="scc" data-i="❌"><div class="sv" style="color:var(--red)">${aus}</div><div class="sl">Ausente</div><div class="bar"></div></div>
    <div class="scc" data-i="📅"><div class="sv">${recs.length}</div><div class="sl">Total</div><div class="bar"></div></div>
  </div>
  <div class="card"><div class="chd"><span class="cti">Historial</span></div>
  ${recs.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Estado</th></tr></thead>
  <tbody>${recs.map(r=>`<tr><td style="font-family:var(--mn);font-size:13px">${r.fecha}</td>
    <td><span class="bdg ${r.val==='presente'?'bgr':'brd'}">${r.val}</span></td></tr>`).join('')}</tbody></table></div>`
  :'<div class="mty"><div class="ei">📅</div><p>Sin registros</p></div>'}
  </div>`;
}

/* ============================================================
   ESTUDIANTE — TAREAS
============================================================ */
function pgETare(){
  const e=CU;
  const prfsDelSalon=profsInSalon(e.salon);
  const profOpts=prfsDelSalon.length
    ?prfsDelSalon.map(p=>`<option value="${p.id}">${p.nombre}${p.materias?.length?' ('+p.materias.join(', ')+')':''}</option>`).join('')
    :'<option value="">Sin profesores asignados</option>';
  const mis=(DB.ups[e.id]||[]).slice().reverse();
  return`<div class="ph"><h2>Tareas & Talleres</h2><button class="btn xs bg" onclick="showHelp('etare')">❓ Ayuda</button></div>
  <div class="card"><div class="chd"><span class="cti">📎 Subir Archivo</span></div>
    <div class="fg">
      <div class="fld"><label>Materia</label><select id="utm"><option value="">Seleccionar</option>
        ${getMats(e.id).map(m=>`<option>${m}</option>`).join('')}</select></div>
      <div class="fld"><label>Periodo</label><select id="utp"><option value="">Seleccionar</option>
        ${DB.pers.map(p=>`<option>${p}</option>`).join('')}</select></div>
      <div class="fld"><label>Dirigido al Profesor</label><select id="utprof">
        <option value="">Seleccionar profesor...</option>${profOpts}
      </select></div>
    </div>
    <div class="fld"><label>Título / Descripción</label><input id="utd" placeholder="Taller unidad 3 — Descripción breve..."></div>
    <div class="uzone" onclick="gi('utf').click()">
      <div class="uzic">📎</div>
      <p><strong>Clic para seleccionar archivo</strong></p>
      <small>PDF, Word (.doc/.docx), Excel (.xls/.xlsx) — máx 10 MB</small>
      <input type="file" id="utf" accept=".pdf,.doc,.docx,.xls,.xlsx" style="display:none" onchange="onFPick(this)">
      <div id="utfn" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--nv)"></div>
    </div>
    <button class="btn bn" style="margin-top:14px" onclick="subirTarea()">📤 Subir</button>
  </div>
  <div class="card"><div class="chd"><span class="cti">📂 Mis Archivos Enviados</span></div>
  ${mis.length?`<div class="tw"><table><thead>
    <tr><th>Archivo</th><th>Materia</th><th>Periodo</th><th>Profesor</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead>
    <tbody>${mis.map(u=>`<tr>
      <td><strong>${u.nombre}</strong></td>
      <td><span class="bdg bbl">${u.materia}</span></td>
      <td><span class="bdg bgy">${u.periodo}</span></td>
      <td style="font-size:12px">${u.profNombre||'—'}</td>
      <td style="font-size:12px;color:var(--sl2)">${u.desc||'—'}</td>
      <td style="font-family:var(--mn);font-size:11px">${u.fecha}</td>
      <td>
        <span class="bdg ${u.revisado?'bgr':'bwa'}">${u.revisado?'✓ Revisado':'⏳ Pendiente'}</span>
        ${u.revisado?`<div style="font-size:10px;color:var(--sl3);margin-top:3px">${u.revisadoTs||''}</div>`:''}
      </td>
      <td>${u.revisado
        ?`<button class="btn xs br" onclick="eliminarTallerEst('${u.id}')">🗑️</button>`
        :'<span style="font-size:10px;color:var(--sl3)">—</span>'}
      </td>
    </tr>`).join('')}</tbody></table></div>`
  :'<div class="mty"><div class="ei">📂</div><p>Sin archivos subidos</p></div>'}
  </div>`;
}
function onFPick(inp){
  if(inp.files[0]) gi('utfn').textContent='📎 '+inp.files[0].name;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function subirTarea(){ /* implementado en api-layer.js */ }
/* Student: delete a taller — only if revisado */
/* ── SOBREESCRITA por api-layer.js ── */
async function eliminarTallerEst(upId){ /* implementado en api-layer.js */ }
/* Student: delete a recovery reply — only if revisado AND period not expired (must have responded) */
/* ── SOBREESCRITA por api-layer.js ── */
async function eliminarRecEst(recId){ /* implementado en api-layer.js */ }


const CAUSAS=['Enfermedad / malestar','Cita médica','Duelo familiar','Problemas de transporte',
  'Emergencia en el hogar','Diligencia personal','Problema con internet','Otro motivo'];
function pgEExc(){
  const e=CU;
  const prfsDelSalon=profsInSalon(e.salon);
  const destOpts=[{id:'admin',label:'Administrador'},...prfsDelSalon.map(p=>({id:p.id,label:p.nombre}))];
  const mis=DB.exc.filter(x=>x.eid===e.id).slice().reverse();
  const ventanaOk=excusasOk();
  return`<div class="ph"><h2>Módulo de Excusas</h2>
    <p>Horario de envío: 18:00 – 07:00 ${ventanaOk?'<span class="bdg bgr">✓ Abierto</span>':'<span class="bdg brd">✗ Cerrado</span>'}</p>
  </div>
  ${!ventanaOk?`<div class="al aly">⚠️ Las excusas solo pueden enviarse entre las 18:00 y las 07:00.</div>`:''}
  <div class="card"><div class="chd"><span class="cti">✉️ Redactar Excusa</span></div>
    <div class="fg">
      <div class="fld"><label>Fecha de la ausencia</label><input type="date" id="exd" value="${today()}"></div>
      <div class="fld"><label>Dirigir a</label><select id="exdst">
        ${destOpts.map(d=>`<option value="${d.label}">${d.label}</option>`).join('')}
      </select></div>
      <div class="fld"><label>Causa</label><select id="exc2">
        <option value="">Seleccionar causa...</option>
        ${CAUSAS.map(c=>`<option>${c}</option>`).join('')}
      </select></div>
    </div>
    <div class="fld"><label>Descripción adicional</label>
      <textarea id="exdesc" placeholder="Detalles adicionales..."></textarea></div>
    <button class="btn bn" ${!ventanaOk?'disabled':''} onclick="envExcusa()">📨 Enviar Excusa</button>
  </div>
  <div class="card"><div class="chd"><span class="cti">📬 Mis Excusas</span></div>
  ${mis.length?`<div class="tw"><table><thead>
    <tr><th>Fecha</th><th>Dirigida a</th><th>Causa</th><th>Descripción</th><th>Estado</th></tr></thead>
    <tbody>${mis.map(x=>`<tr>
      <td style="font-family:var(--mn);font-size:12px">${x.fecha}</td>
      <td><span class="bdg bbl">${x.dest}</span></td>
      <td><span class="bdg bor">${x.causa}</span></td>
      <td style="font-size:12px;color:var(--sl2)">${x.desc||'—'}</td>
      <td><span class="bdg bwa">Enviada</span></td>
    </tr>`).join('')}</tbody></table></div>`
  :'<div class="mty"><div class="ei">📬</div><p>Sin excusas</p></div>'}
  </div>`;
}
/* ── SOBREESCRITA por api-layer.js ── */
async function envExcusa(){ /* implementado en api-layer.js */ }

/* Show excusas to professor in their home panel */
function renderPExcR(){
  const el=gi('pExcR');if(!el)return;
  const mis=DB.exc.filter(x=>x.dest===CU.nombre||(CU.salones||[]).includes(x.salon)).slice(-10).reverse();
  el.innerHTML=mis.length?`<div class="tw"><table><thead>
    <tr><th>Fecha</th><th>Estudiante</th><th>Causa</th><th>Descripción</th></tr></thead>
    <tbody>${mis.map(x=>`<tr>
      <td style="font-family:var(--mn);font-size:12px">${x.fecha}</td>
      <td><strong>${x.enombre}</strong></td>
      <td><span class="bdg bor">${x.causa}</span></td>
      <td style="font-size:12px;color:var(--sl2)">${x.desc||'—'}</td>
    </tr>`).join('')}</tbody></table></div>`
  :'<div class="mty" style="padding:16px"><div class="ei">📬</div><p>Sin excusas recibidas</p></div>';
}

/* ============================================================
   ESTUDIANTE — MIS PROFESORES
============================================================ */
function pgEProf(){
  const e=CU;const prfs=profsInSalon(e.salon);
  return`<div class="ph"><h2>Mis Profesores</h2></div>
  <div class="card"><div class="chd"><span class="cti">Salón: <span class="bdg bbl">${e.salon||'Sin salón'}</span></span></div>
  ${e.salon&&prfs.length?`<div class="tw"><table><thead>
    <tr><th>Profesor</th><th>Ciclo</th><th>Materias</th><th>T.I./CC</th></tr></thead>
    <tbody>${prfs.map(p=>`<tr>
      <td><strong>${p.nombre}</strong></td>
      <td><span class="bdg ${p.ciclo==='bachillerato'?'bte':'bbl'}">${p.ciclo}</span></td>
      <td><div style="display:flex;flex-wrap:wrap;gap:3px">
        ${(p.materias||[]).map(m=>`<span class="bdg bbl" style="margin:1px">${m}</span>`).join('')||
          '<span style="font-size:12px;color:var(--sl3)">Todas (Primaria)</span>'}
      </div></td>
      <td style="font-family:var(--mn);font-size:12px">${p.ti||'—'}</td>
    </tr>`).join('')}</tbody></table></div>`
  :'<div class="mty"><div class="ei">👩‍🏫</div><p>Sin profesores asignados</p></div>'}
  </div>`;
}

/* ============================================================
   ESTUDIANTE — CLASES VIRTUALES
============================================================ */
function pgEVir(){
  const e=CU;
  const clases=(DB.vclases||[]).filter(c=>c.salon===e.salon)
    .sort((a,b)=>b.fecha.localeCompare(a.fecha));
  return`<div class="ph"><h2>Mis Clases Virtuales</h2><p>Salón: <strong>${e.salon||'Sin salón'}</strong></p></div>
  ${clases.length?clases.map(c=>`
    <div class="vc-card">
      <div>
        <h4>💻 Clase Virtual — Salón ${c.salon}</h4>
        <small>${c.fecha} a las ${c.hora} · Prof. ${c.profNombre||'—'}${c.materias&&c.materias!=='—'?' · '+c.materias:''}</small>
        ${c.desc?`<p style="font-size:12px;margin-top:5px;opacity:.8">${c.desc}</p>`:''}
      </div>
      <a href="${c.link}" target="_blank" class="btn bb sm">🔗 Unirse</a>
    </div>`).join('')
  :`<div class="card"><div class="mty"><div class="ei">💻</div><p>Sin clases programadas para tu salón</p></div></div>`}`;
}

/* ============================================================
   ESTUDIANTE — RECUPERACIÓN
============================================================ */
function pgEReh(){
  const e=CU;const mp=matPerd(e.id);
  if(!DB.ext.on) return`<div class="ph"><h2>Mi Recuperación</h2></div><div class="al aly">⚠️ El periodo extraordinario no está activo.</div>`;
  if(!mp.length) return`<div class="ph"><h2>Mi Recuperación</h2></div><div class="al alg">✅ No tienes materias en recuperación. ¡Bien hecho!</div>`;

  /* Mark all plans as seen */
  let planesChanged=false;
  (DB.planes||[]).filter(p=>p.estId===e.id&&!p.visto).forEach(p=>{p.visto=true;planesChanged=true;});
  if(planesChanged) dbSave();

  const periodoVencido=extExpirado();

  const tarjetas=mp.map(m=>{
    const prf=profForMat(m,e.salon);
    const planesMat=(DB.planes||[]).filter(p=>p.estId===e.id&&p.materia===m).slice().reverse();
    const hayPlanes=planesMat.length>0;

    return`<div class="card" style="border-left:4px solid ${hayPlanes?'var(--grn)':'var(--red)'}">
      <div class="chd">
        <span class="cti">📚 ${m}</span>
        <span class="bdg ${hayPlanes?'bgr':'brd'}">${hayPlanes?`📋 ${planesMat.length} Plan(es)`:'⚠️ Sin Plan Aún'}</span>
        ${periodoVencido?`<span class="bdg brd" style="font-size:10px">🔒 Periodo vencido</span>`:''}
      </div>
      <div style="font-size:13px;margin-bottom:14px">
        <strong>Docente:</strong> ${prf?prf.nombre:'<span style="color:var(--sl3)">Sin docente asignado</span>'}<br>
        <span style="font-size:12px;color:var(--sl2)">Periodo Extraordinario: ${DB.ext.s} → ${DB.ext.e}</span>
      </div>

      ${hayPlanes
        ?planesMat.map((plan,pi)=>{
          const respuestas=(DB.recs||[]).filter(r=>r.estId===e.id&&r.planId===plan.id);
          const ultimaResp=respuestas.length?respuestas[respuestas.length-1]:null;
          const yaRevisada=ultimaResp&&ultimaResp.revisado;
          const keyPlan=plan.id.replace(/[^a-z0-9]/gi,'_');
          return`<div style="background:#f0fff4;border:1.5px solid #9ae6b4;border-radius:8px;padding:14px;margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
              <div style="font-size:12px;font-weight:800;color:#276749">📋 Plan ${planesMat.length-pi} — ${plan.fecha}${plan.esSalon?' <span style="font-size:10px;font-weight:400">(salón)</span>':''}</div>
              ${yaRevisada?`<span class="bdg bgr" style="font-size:11px">✅ Revisado ${ultimaResp.revisadoTs||''}</span>`:''}
            </div>
            <div style="font-size:14px;font-weight:700;color:var(--nv);margin-bottom:6px">${plan.titulo}</div>
            <div style="font-size:13px;white-space:pre-line;color:#2d3748;line-height:1.6;margin-bottom:8px">${plan.desc}</div>
            ${plan.fechaLimite?`<div style="font-size:12px;padding:5px 10px;background:#c6f6d5;border-radius:6px;display:inline-block;margin-bottom:8px">
              📅 Fecha límite: <strong>${plan.fechaLimite}</strong></div>`:''}
            ${plan.archNombre?`<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;background:#ebf8ff;border-radius:7px;border:1px solid #90cdf4;margin-bottom:10px">
              <span style="font-size:12px">📎 ${plan.archNombre}</span>
              <button class="btn xs bb" onclick="abrirArchivoPlan('${plan.id}')">📂 Abrir</button>
            </div>`:''}

            <!-- Respuestas a este plan -->
            ${respuestas.length?`<div style="margin-bottom:10px">
              <div style="font-size:11px;font-weight:800;color:var(--sl);text-transform:uppercase;margin-bottom:5px">Mis respuestas:</div>
              ${respuestas.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:${r.revisado?'#f0fff4':'#fffff0'};border-radius:6px;border:1px solid ${r.revisado?'#9ae6b4':'#f6e05e'};margin-bottom:5px">
                <span style="font-size:12px">📎 ${r.nombre} <span style="color:var(--sl3);font-size:11px">${r.fecha}</span>${r.desc?` — <em style="color:var(--sl2)">${r.desc}</em>`:''}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="bdg ${r.revisado?'bgr':'bwa'}">${r.revisado?`✓ Revisado`:'⏳ Pendiente'}</span>
                  ${r.revisado?`<button class="btn xs br" onclick="eliminarRecEst('${r.id}')">🗑️</button>`:''}
                </div>
              </div>`).join('')}
            </div>`:''}

            <!-- Formulario respuesta: bloqueado si revisado O periodo vencido -->
            ${yaRevisada
              ?`<div style="background:#c6f6d5;border-radius:7px;padding:10px 14px;display:flex;align-items:center;gap:10px">
                  <span>✅</span><div style="font-size:12px;color:#276749"><strong>Revisado</strong> por el docente el ${ultimaResp.revisadoTs||''}.</div>
                </div>`
              :periodoVencido
                ?`<div style="background:#fed7d7;border-radius:7px;padding:10px 14px;display:flex;align-items:center;gap:10px">
                    <span>🔒</span><div style="font-size:12px;color:#c53030"><strong>Periodo vencido.</strong> Ya no puedes enviar respuestas a este plan.</div>
                  </div>`
                :`<div style="background:#fff;border:1.5px dashed #9ae6b4;border-radius:7px;padding:12px;margin-top:4px">
                    <div style="font-size:12px;font-weight:800;color:var(--nv);margin-bottom:8px">📤 Responder → ${prf?prf.nombre:'el docente'}</div>
                    <div class="fld" style="margin-bottom:8px"><label style="font-size:11px">Descripción</label>
                      <input id="rdesc_${keyPlan}" placeholder="Describe brevemente..."></div>
                    <div class="uzone" style="padding:10px" onclick="gi('rf_${keyPlan}').click()">
                      <div class="uzic" style="font-size:20px">📎</div>
                      <p style="font-size:12px;margin:3px 0"><strong>Clic para seleccionar archivo</strong></p>
                      <small>PDF, Word, Excel — máx 5 MB</small>
                      <input type="file" id="rf_${keyPlan}" accept=".pdf,.doc,.docx,.xls,.xlsx" style="display:none" onchange="onRecFPick(this,'rfn_${keyPlan}')">
                      <div id="rfn_${keyPlan}" style="margin-top:5px;font-size:12px;font-weight:700;color:var(--nv)"></div>
                    </div>
                    <button class="btn bn sm" style="margin-top:10px" onclick="subirRecPlan('${plan.id}','${m}','${prf?prf.id:''}')">📤 Enviar Respuesta</button>
                  </div>`}
          </div>`;
        }).join('')
        :`<div class="al aly" style="font-size:12px;margin-bottom:14px">⏳ Tu docente aún no ha enviado el plan.</div>`}

      <!-- Trabajos sin plan (legado) -->
      ${(()=>{
        const sinPlan=(DB.recs||[]).filter(r=>r.estId===e.id&&r.materia===m&&!r.planId);
        if(!sinPlan.length) return '';
        return`<div style="margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:var(--sl);margin-bottom:5px">Otros trabajos enviados:</div>
          ${sinPlan.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:${r.revisado?'#f0fff4':'#fffff0'};border-radius:6px;border:1px solid ${r.revisado?'#9ae6b4':'#f6e05e'};margin-bottom:5px">
            <span style="font-size:12px">📎 ${r.nombre} <span style="color:var(--sl3);font-size:11px">${r.fecha}</span></span>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="bdg ${r.revisado?'bgr':'bwa'}">${r.revisado?`✓ Revisado`:'⏳ Pendiente'}</span>
              ${r.revisado?`<button class="btn xs br" onclick="eliminarRecEst('${r.id}')">🗑️</button>`:''}
            </div>
          </div>`).join('')}
        </div>`;
      })()}
    </div>`;
  }).join('');

  const dot=document.querySelector('#ni_ereh .notif-dot');if(dot)dot.remove();

  return`<div class="ph"><h2>Mi Recuperación</h2>
    <p>Tienes <strong>${mp.length}</strong> materia(s) en periodo extraordinario.</p></div>
  <div class="al aly" style="margin-bottom:14px">📅 Periodo Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></div>
  ${tarjetas}`;
}

function onRecFPick(inp,key){if(inp.files[0]) gi(key).textContent='📎 '+inp.files[0].name;}

/* Submit a reply linked to a specific plan */
/* ── SOBREESCRITA por api-layer.js ── */
async function subirRecPlan(planId,materia,profId){ /* implementado en api-layer.js */ }
function subirRec(materia,profId){
  const key=materia.replace(/\s/g,'_');
  const desc=gi('rdesc_'+key)?.value.trim();
  const f=gi('rf_'+key)?.files[0];
  if(!f){sw('warning','Selecciona un archivo para enviar');return;}
  if(f.size>5*1024*1024){sw('error','Archivo muy grande (máx 5 MB)');return;}
  const reader=new FileReader();
  reader.onload=ev=>{
    if(!DB.recs) DB.recs=[];
    DB.recs.push({
      id:'rec_'+Date.now(),
      estId:CU.id,estNombre:CU.nombre,salon:CU.salon||'',
      materia,profId,
      nombre:f.name,type:f.type,dataUrl:ev.target.result,
      desc:desc||'',fecha:new Date().toLocaleDateString('es-CO'),
      revisado:false,ts:new Date().toISOString()
    });
    dbSave();goto('ereh');sw('success','Recuperación enviada al docente','',1500);
  };
  reader.onerror=()=>sw('error','Error al leer el archivo');
  reader.readAsDataURL(f);
}
/* Open the file attached to a recovery plan */
function abrirArchivoPlan(planId){
  /* Find plan by id (planId may be a prefix for group plans) */
  const plan=(DB.planes||[]).find(p=>p.id===planId||p.planId===planId);
  if(!plan||!plan.archDataUrl){sw('error','Archivo no disponible');return;}
  const w=window.open();if(!w){sw('error','Permite ventanas emergentes');return;}
  const isPdf=plan.archType==='application/pdf';
  const isImg=plan.archType?.startsWith('image/');
  if(isPdf||isImg){
    w.document.write(`<html><head><title>${plan.archNombre}</title></head>
      <body style="margin:0;background:#222">
      <${isPdf?'embed':'img'} src="${plan.archDataUrl}" style="width:100%;height:100vh" ${isPdf?'type="application/pdf"':''}></${isPdf?'embed':'img'}>
      </body></html>`);
  } else {
    const a=w.document.createElement('a');
    a.href=plan.archDataUrl;a.download=plan.archNombre;
    w.document.body.appendChild(a);a.click();w.close();
  }
}
function mkBoletinUI(estId,ctx){
  const anoActual=DB.anoActual||String(new Date().getFullYear());
  const uid=estId.replace(/[^a-z0-9]/gi,'_');
  const mats=getMats(estId);
  syncN(estId);

  /* Build list of years that have real data for this student */
  const anosConDatos=(DB.notasPorAno?Object.entries(DB.notasPorAno):[])
    .filter(([yr,notasAno])=>
      DB.pers.some(per=>mats.some(m=>{
        const t=notasAno?.[estId]?.[per]?.[m];
        return t&&(t.a>0||t.c>0||t.r>0);
      })))
    .map(([yr])=>yr)
    .sort();

  /* Also include current active year if it has data */
  const hayDatosActivos=DB.pers.some(per=>mats.some(m=>{
    const t=DB.notas[estId]?.[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);
  }));
  if(hayDatosActivos&&!anosConDatos.includes(anoActual)) anosConDatos.push(anoActual);
  anosConDatos.sort();

  if(!anosConDatos.length){
    return`<div class="card" style="border:2px solid var(--bd)">
      <div class="chd"><span class="cti">📄 Descargar Boletín PDF</span></div>
      <div class="al aly" style="font-size:13px">
        📭 No hay notas registradas todavía. El boletín estará disponible cuando el profesor ingrese tus calificaciones.
      </div>
    </div>`;
  }

  /* Compute periods with data for the default selected year */
  const defaultAnno=anosConDatos.includes(anoActual)?anoActual:anosConDatos[anosConDatos.length-1];
  const notasParaAnno=defaultAnno===anoActual?DB.notas[estId]:(DB.notasPorAno?.[defaultAnno]?.[estId]||{});
  const persConDatos=DB.pers.filter(per=>
    mats.some(m=>{const t=notasParaAnno?.[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);}));

  const annoOpts=anosConDatos.map(y=>`<option value="${y}" ${y===defaultAnno?'selected':''}>${y}</option>`).join('');
  const perBtns=persConDatos.map(p=>`<button class="btn bg sm" onclick="dlBoletin('${estId}','${encodeURIComponent(p)}',gi('yr_${uid}').value)">📄 ${p}</button>`).join('');
  const todosBtn=persConDatos.length>1
    ?`<button class="btn bb" onclick="dlBoletin('${estId}','TODOS',gi('yr_${uid}').value)">📋 Todos los Periodos</button>
       <span style="font-size:12px;color:var(--sl3);font-weight:600">— o por periodo —</span>`
    :'';

  return`<div class="card" style="border:2px solid var(--bl3)">
    <div class="chd"><span class="cti">📄 Descargar Boletín PDF</span></div>
    <div class="al alb" style="margin-bottom:14px">
      <div><strong>Todos los periodos:</strong> muestra definitivas resumidas.
      <strong>Por periodo:</strong> incluye desglose tripartita (Apt / Act / Res).
      <br><span style="font-size:11px;color:var(--sl2)">Solo se muestran años y periodos con notas registradas.</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div class="fld" style="margin:0">
        <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:4px">Año Lectivo</label>
        <select id="yr_${uid}" style="padding:8px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;outline:none">
          ${annoOpts}
        </select>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      ${todosBtn}
      ${perBtns}
    </div>
  </div>`;
}

function dlBoletinUI(estId){
  const uid=estId.replace(/[^a-z0-9]/gi,'_');
  Swal.fire({title:'Descargar Boletín',html:mkBoletinUI(estId,'admin'),
    showConfirmButton:false,showCloseButton:true,width:620});
}

/**
 * Main PDF generator
 * perFilter: 'TODOS' | encoded period name
 * anno: year string
 * snapData: optional {notas, mats, salon, disciplina, nombre, ti} for deleted students
 */
function dlBoletin(estId,perFilter,anno,snapData){
  perFilter=perFilter||'TODOS';anno=anno||String(new Date().getFullYear());

  /* Support deleted students via snapshot */
  const e=DB.ests.find(x=>x.id===estId);
  const snap=snapData||(e?null:null);
  if(!e&&!snap){sw('error','Estudiante no encontrado');return;}

  /* Resolve notas: use notasPorAno[anno] if anno != anoActual, else DB.notas */
  const anoActual=DB.anoActual||String(new Date().getFullYear());
  const notasDelAno=snap?.notas
    ||(anno!==anoActual&&DB.notasPorAno?.[anno]?.[estId])
    ||(e?DB.notas[estId]:null)||{};

  /* Resolve data source */
  const nombre=snap?.nombre||e?.nombre||estId;
  const ti=snap?.ti||e?.ti||'—';
  const salon=snap?.salon||e?.salon||'—';
  const disciplina=snap?.disciplina||DB.notas[estId]?.disciplina||'—';
  const notas=notasDelAno;
  const mats=snap?.mats||(e?getMats(estId):DB.mP);
  const salObj=DB.sals.find(s=>s.nombre===salon);
  const matsSource=snap?.mats?.length?`Materias del salón ${salon} (archivo)`
    :(salObj?.mats?.length?`Materias del salón ${salon}`
    :(cicloOf(salon)==='primaria'?'Materias globales primaria':'Materias globales bachillerato'));
  const cicloLabel=cicloOf(salon)==='primaria'?'Primaria (1°-5°)':'Bachillerato (6°-11°)';

  if(!e) {/* deleted — skip syncN */} else syncN(estId);

  const isTodos=perFilter==='TODOS';
  /* For Todos: only render periods that actually have data */
  const allPers=DB.pers;
  const pers2render=isTodos
    ?allPers.filter(per=>mats.some(m=>{const t=notas[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);}))
    :allPers.filter(p=>p===decodeURIComponent(perFilter));
  if(!pers2render.length){sw('info','Sin datos',`No hay notas registradas${isTodos?' en ningún periodo':' en este periodo'}.`);return;}

  /* Check data — already guaranteed by pers2render filter above */

  /* Promedio general and position (only for active students) */
  const pg=e?gprom(estId):+(
    DB.pers.map(per=>{
      const ds=mats.map(m=>def(notas[per]?.[m]||{a:0,c:0,r:0}));
      return+(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(2);
    }).filter(v=>v>0).reduce((a,b,_,arr)=>a+b/arr.length,0)
  ).toFixed(2);
  const ps=e?puestoS(estId):'—';
  const mp=e?matPerd(estId):mats.filter(m=>{
    const act=DB.pers.filter(p=>{const t=notas[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length) return false;
    return act.reduce((s,p)=>s+def(notas[p][m]),0)/act.length<3;
  });
  const box=gi('pdfBox');
  const suffix=isTodos?'todos_periodos':decodeURIComponent(perFilter).replace(/\s+/g,'_');
  const fechaGen=new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});
  const subtitle=isTodos?`Año Lectivo ${anno} — Todos los Periodos`:`Año Lectivo ${anno} — ${decodeURIComponent(perFilter)}`;

  /* Build period tables */
  const persHTML=pers2render.map(per=>{
    const pp=e?pprom(estId,per):+(mats.reduce((s,m)=>s+def(notas[per]?.[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2);
    const ppu=e?puestoP(estId,per):'—';

    if(isTodos){
      /* Compact: only definitivas + subjects + professor */
      return`<div style="margin-bottom:16px;page-break-inside:avoid">
        <div style="background:#1a3a5c;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:13px">${per}</strong>
          <span style="font-size:11px;opacity:.8">Promedio: ${pp.toFixed(2)} &nbsp;|&nbsp; Puesto: ${ppu}${ppu!=='—'?'°':''}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:left">Materia</th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:center">Definitiva</th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:center">Estado</th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:left">Profesor(a)</th>
          </tr></thead>
          <tbody>${mats.map((m,idx)=>{
            const d=def(notas[per]?.[m]||{a:0,c:0,r:0});
            const prf=profForMat(m,salon);
            return`<tr style="background:${idx%2===0?'#f7fafc':'#fff'}">
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0">${m}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:${scCol(d)}">${d.toFixed(2)}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;color:${d===0?'#a0aec0':d>=3?'#276749':'#c53030'};font-weight:600">${d===0?'Sin nota':d>=3?'✓ Aprobado':'✗ Reprobado'}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#4a5568">${prf?prf.nombre:'Sin asignar'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    } else {
      /* Detailed: full tripartita breakdown */
      return`<div style="margin-bottom:18px;page-break-inside:avoid">
        <div style="background:#1a3a5c;color:#fff;padding:8px 12px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:13px">${per}</strong>
          <span style="font-size:11px;opacity:.8">Promedio: ${pp.toFixed(2)} &nbsp;|&nbsp; Puesto: ${ppu}${ppu!=='—'?'°':''}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:left">Materia</th>
            <th style="background:#1e6b5c;color:#fff;padding:6px 9px;text-align:center;font-size:10px">Aptitud<br><span style="opacity:.7">(60%)</span></th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:center;font-size:10px">Actitud<br><span style="opacity:.7">(20%)</span></th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:center;font-size:10px">Respons.<br><span style="opacity:.7">(20%)</span></th>
            <th style="background:#0b1e33;color:#fff;padding:6px 9px;text-align:center;font-weight:800">Definitiva</th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:center;font-size:10px">Estado</th>
            <th style="background:#2d5286;color:#fff;padding:6px 9px;text-align:left;font-size:10px">Profesor(a)</th>
          </tr></thead>
          <tbody>${mats.map((m,idx)=>{
            const t=notas[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
            const prf=profForMat(m,salon);
            return`<tr style="background:${idx%2===0?'#f7fafc':'#fff'}">
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;font-weight:600">${m}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;color:#276749;font-weight:600">${t.a.toFixed(1)}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;color:#744210;font-weight:600">${t.c.toFixed(1)}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;color:#2b6cb0;font-weight:600">${t.r.toFixed(1)}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:900;font-size:13px;color:${scCol(d)}">${d.toFixed(2)}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;text-align:center;color:${d===0?'#a0aec0':d>=3?'#276749':'#c53030'};font-weight:600">${d===0?'—':d>=3?'✓':'✗'}</td>
              <td style="padding:6px 9px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#4a5568">${prf?prf.nombre:'Sin asignar'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    }
  }).join('');

  const rehabHTML=(isTodos&&DB.ext.on&&mp.length>=1&&mp.length<=2)
    ?`<div style="background:#fffff0;border:2px solid #f6e05e;padding:12px 16px;border-radius:8px;font-size:12px;margin:12px 0">
       ⚠️ <strong>Materias en periodo de recuperación:</strong> ${mp.join(', ')} &nbsp;·&nbsp; Fechas: ${DB.ext.s} → ${DB.ext.e}
     </div>`:'' ;

  /* Per-period promedio for single-period view (works for both active and snapshot) */
  const perPromVal=!isTodos?+(mats.reduce((s,m)=>s+def(notas[decodeURIComponent(perFilter)]?.[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2):0;
  const perPuestoVal=e&&!isTodos?puestoP(estId,decodeURIComponent(perFilter)):'—';

  box.innerHTML=`<div style="font-family:'Outfit',sans-serif;background:#fff;max-width:760px">
    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#0b1e33 0%,#1a3a5c 100%);color:#fff;padding:24px 28px;position:relative;overflow:hidden">
      <div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.08;line-height:1">🏛️</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.15em;opacity:.55;margin-bottom:6px">EduSistema Pro · Documento Oficial${snap?'  ·  ARCHIVO HISTÓRICO':''}</div>
      <h1 style="font-size:20px;font-weight:900;margin-bottom:4px;letter-spacing:-.3px">BOLETÍN DE CALIFICACIONES</h1>
      <p style="font-size:11px;opacity:.65">${subtitle} · Emitido: ${fechaGen}</p>
    </div>
    <!-- STUDENT INFO -->
    <div style="background:#eef2f7;padding:14px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:2px solid #d8e2ef">
      <div>
        <div style="font-size:12px;line-height:1.8"><strong>Nombre:</strong> ${esc(nombre)}</div>
        <div style="font-size:12px;line-height:1.8"><strong>T.I.:</strong> ${esc(ti)||'No registrado'}</div>
        <div style="font-size:12px;line-height:1.8"><strong>Salón:</strong> ${esc(salon)||'Sin salón'} &nbsp;·&nbsp; <strong>Ciclo:</strong> ${cicloLabel}</div>
        <div style="font-size:11px;color:#4a5568;line-height:1.6"><strong>Plan de estudios:</strong> ${matsSource} — ${mats.join(', ')}</div>
      </div>
      <div>
        ${isTodos
          ?`<div style="font-size:12px;line-height:1.8"><strong>Promedio General:</strong> <span style="color:${scCol(pg)};font-weight:900;font-size:16px">${pg.toFixed(2)}</span></div>
             <div style="font-size:12px;line-height:1.8"><strong>Puesto en Salón:</strong> <strong>${ps}${ps!=='—'?'°':''}</strong></div>`
          :`<div style="font-size:12px;line-height:1.8"><strong>Promedio ${decodeURIComponent(perFilter)}:</strong> <span style="color:${scCol(perPromVal)};font-weight:900;font-size:16px">${perPromVal.toFixed(2)}</span></div>
             <div style="font-size:12px;line-height:1.8"><strong>Puesto en Salón:</strong> <strong>${perPuestoVal}${perPuestoVal!=='—'?'°':''}</strong></div>`}
        <div style="font-size:12px;line-height:1.8"><strong>Disciplina:</strong> ${esc(disciplina)}</div>
        <div style="font-size:12px;line-height:1.8"><strong>Materias Perdidas:</strong> <span style="color:${mp.length>0?'#c53030':'#276749'};font-weight:700">${mp.length===0?'Ninguna':mp.length}</span></div>
      </div>
    </div>
    ${!isTodos?`<div style="background:#fffff0;padding:8px 28px;font-size:11px;color:#744210;border-bottom:1px solid #f6e05e">
      📊 <strong>Sistema tripartita:</strong> Aptitud (60%) + Actitud (20%) + Responsabilidad (20%) = Definitiva
    </div>`:''}
    <!-- GRADES -->
    <div style="padding:16px 28px">
      ${persHTML}
      ${rehabHTML}
    </div>
    <!-- SIGNATURES -->
    <div style="display:flex;justify-content:space-around;margin-top:36px;padding:0 28px 28px">
      <div style="text-align:center">
        <div style="width:160px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div>
        <div style="font-size:10px;color:#718096;font-weight:600">Rector(a)</div>
      </div>
      <div style="text-align:center">
        <div style="width:160px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div>
        <div style="font-size:10px;color:#718096;font-weight:600">Director(a) de Grupo</div>
      </div>
      <div style="text-align:center">
        <div style="width:160px;border-top:1.5px solid #1a3a5c;margin:0 auto 6px"></div>
        <div style="font-size:10px;color:#718096;font-weight:600">Padre / Acudiente</div>
      </div>
    </div>
  </div>`;

  box.classList.remove('hidden');
  html2pdf().set({
    margin:[4,4,4,4],
    filename:`boletin_${nombre.replace(/\s+/g,'_')}_${suffix}_${anno}.pdf`,
    html2canvas:{scale:2.5,useCORS:true,logging:false,letterRendering:true},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
  }).from(box).save().then(()=>box.classList.add('hidden'));
}

/* ============================================================
   KEYBOARD & INIT
============================================================ */
/* ════════════════════════════════════════════════════════════════
   SUPER ADMIN — PANEL GLOBAL
════════════════════════════════════════════════════════════════ */

/* ─── DASHBOARD ─────────────────────────────────────────── */
function pgSADash(){
  return`<div id="saDashCard">
    <!-- Header -->
    <div class="card" style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#fff;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem">
        <div>
          <h2 style="color:#fff;margin-bottom:.25rem">🌐 Panel Global — Super Admin</h2>
          <p style="opacity:.85;font-size:.9rem;margin:0">Bienvenido, <strong>${CU.nombre}</strong> · Sistema EduPro</p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <span id="saSugBadge" style="display:none;background:#e53e3e;color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)" onclick="goto('sasug')">💡 Sugerencias</span>
          <button class="btn" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:.8rem" onclick="initSADash()">🔄 Actualizar</button>
        </div>
      </div>
      <!-- KPIs principales -->
      <div id="saStatsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem;margin-top:1.25rem">
        <div style="text-align:center;opacity:.7"><div style="font-size:1.8rem">⏳</div><p style="margin:.25rem 0;font-size:.8rem">Cargando…</p></div>
      </div>
    </div>

    <!-- Fila: Gráfica + Resumen rápido -->
    <div style="display:grid;grid-template-columns:1fr 340px;gap:1rem;margin-bottom:1rem" id="saDashMidRow">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <h3 style="margin:0">📊 Estudiantes por institución</h3>
          <select id="saDashChartMode" class="inp" style="width:auto;font-size:.8rem;padding:4px 8px" onchange="renderSADashChart(window._saStatsData||[])">
            <option value="est">Estudiantes</option>
            <option value="profs">Profesores</option>
            <option value="prom">Prom. Notas</option>
            <option value="asist">Asistencia %</option>
          </select>
        </div>
        <div id="saDashChart" style="overflow-x:auto;min-height:180px;display:flex;align-items:flex-end"></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:.6rem" id="saDashQuickStats">
        <h3 style="margin:0 0 .5rem">⚡ Resumen rápido</h3>
        <div id="saDashQuickBody" style="color:#888;font-size:.9rem">Cargando…</div>
      </div>
    </div>

    <!-- Tabla de instituciones -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
        <h3 style="margin:0">🏫 Todas las instituciones</h3>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <input id="saDashSearch" class="inp" style="width:200px;font-size:.85rem" placeholder="🔍 Buscar…" oninput="renderSADashTable(window._saStatsData||[])">
          <button class="btn bsec" style="font-size:.8rem" onclick="exportarSADashCSV()">📤 Exportar CSV</button>
        </div>
      </div>
      <div id="saColegiosList" style="overflow-x:auto">Cargando…</div>
    </div>
  </div>`;
}

function renderSADashKPIs(stats,sugCount){
  const grid=gi('saStatsGrid');
  if(!grid) return;
  const totalColegios=stats.length;
  const activos=stats.filter(s=>s.activo).length;
  const totalEst=stats.reduce((a,s)=>a+s.totalEst,0);
  const totalProfs=stats.reduce((a,s)=>a+s.totalProfs,0);
  const totalSal=stats.reduce((a,s)=>a+(s.totalSalones||0),0);
  const promGlobal=stats.length?+(stats.reduce((a,s)=>a+s.promNotas,0)/stats.length).toFixed(2):0;
  const promAsist=stats.length?+(stats.reduce((a,s)=>a+(s.asistPct||0),0)/stats.length).toFixed(1):0;
  const totalIngresos=stats.reduce((a,s)=>a+(s.ingresosMes||0),0);
  const kpis=[
    {ic:'🏫',lb:'Instituciones',val:totalColegios,sub:`${activos} activas`,col:'#2b6cb0'},
    {ic:'👨‍🎓',lb:'Estudiantes',val:totalEst.toLocaleString(),sub:'total sistema',col:'#276749'},
    {ic:'👩‍🏫',lb:'Profesores',val:totalProfs.toLocaleString(),sub:'total sistema',col:'#744210'},
    {ic:'🏛️',lb:'Salones',val:totalSal.toLocaleString(),sub:'en total',col:'#553c9a'},
    {ic:'📊',lb:'Prom. Notas',val:promGlobal,sub:'escala 1–5',col:promGlobal>=3.5?'#276749':'#9b2c2c'},
    {ic:'✅',lb:'Asistencia',val:promAsist+'%',sub:'promedio global',col:promAsist>=85?'#276749':'#c05621'},
    {ic:'💰',lb:'Ingresos/Mes',val:'$'+totalIngresos.toLocaleString(),sub:'todas las sedes',col:'#2c7a7b'},
  ];
  grid.innerHTML=kpis.map(k=>`
    <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:.75rem 1rem;text-align:center;backdrop-filter:blur(4px)">
      <div style="font-size:1.6rem">${k.ic}</div>
      <div style="font-size:1.5rem;font-weight:800;color:#fff;line-height:1.2">${k.val}</div>
      <div style="font-size:.75rem;opacity:.85;color:#e2e8f0">${k.lb}</div>
      <div style="font-size:.7rem;opacity:.65;color:#bee3f8">${k.sub}</div>
    </div>`).join('');
}

function renderSADashChart(stats){
  const chart=gi('saDashChart');
  if(!chart||!stats.length) return;
  const mode=gi('saDashChartMode')?.value||'est';
  const labels={est:'Estudiantes',profs:'Profesores',prom:'Prom. Notas',asist:'Asistencia %'};
  const getData=s=>({est:s.totalEst,profs:s.totalProfs,prom:s.promNotas,asist:s.asistPct||0}[mode]);
  const maxVal=Math.max(...stats.map(getData),1);
  const BAR_H=160;
  const bars=stats.map((s,i)=>{
    const val=getData(s);
    const h=Math.max(4,Math.round((val/maxVal)*BAR_H));
    const colors=['#3182ce','#38a169','#d69e2e','#805ad5','#e53e3e','#319795','#dd6b20','#b83280'];
    const c=colors[i%colors.length];
    const name=s.colegioNombre.length>12?s.colegioNombre.slice(0,12)+'…':s.colegioNombre;
    return`<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;cursor:pointer" title="${s.colegioNombre}: ${val} ${labels[mode]}">
      <div style="font-size:.7rem;font-weight:700;color:#2d3748">${val}</div>
      <div style="width:44px;height:${h}px;background:${c};border-radius:6px 6px 0 0;transition:opacity .2s" onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'"></div>
      <div style="font-size:.65rem;text-align:center;color:#718096;max-width:64px;word-break:break-word;line-height:1.2">${name}</div>
    </div>`;
  }).join('');
  chart.innerHTML=`<div style="display:flex;align-items:flex-end;gap:6px;padding-bottom:4px;min-width:max-content">${bars}</div>`;
}

function renderSADashTable(stats){
  const q=(gi('saDashSearch')?.value||'').toLowerCase();
  const filtered=q?stats.filter(s=>s.colegioNombre.toLowerCase().includes(q)):stats;
  const list=gi('saColegiosList');
  if(!list) return;
  if(!filtered.length){list.innerHTML='<p style="color:#999;text-align:center;padding:1.5rem">Sin resultados.</p>';return;}
  list.innerHTML=`<table class="tbl"><thead><tr>
    <th>Institución</th><th>Est.</th><th>Profs.</th><th>Salones</th><th>Prom.Notas</th><th>Asistencia</th><th>Ingresos/Mes</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${filtered.map(s=>`<tr>
    <td><strong>${s.colegioNombre}</strong></td>
    <td>${s.totalEst}</td>
    <td>${s.totalProfs}</td>
    <td>${s.totalSalones||0}</td>
    <td><span style="font-weight:700;color:${s.promNotas>=3.5?'#276749':s.promNotas>=3?'#744210':'#9b2c2c'}">${s.promNotas}</span></td>
    <td><span style="font-weight:600;color:${(s.asistPct||0)>=85?'#276749':'#c05621'}">${s.asistPct!=null?s.asistPct+'%':'—'}</span></td>
    <td>${s.ingresosMes!=null?'$'+Number(s.ingresosMes).toLocaleString():'—'}</td>
    <td><span class="bdg ${s.activo?'bgr':'bred'}">${s.activo?'Activo':'Inactivo'}</span></td>
    <td style="display:flex;gap:.3rem;flex-wrap:wrap">
      <button class="btn bsm" onclick="goto('saestadisticas')" title="Ver estadísticas">📊</button>
      <button class="btn bsm" onclick="goto('saauditoria')" title="Ver auditoría">🔍</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

function renderSADashQuick(stats){
  const qb=gi('saDashQuickBody');
  if(!qb) return;
  const activos=stats.filter(s=>s.activo);
  const top=activos.length?activos.reduce((a,b)=>a.totalEst>b.totalEst?a:b,activos[0]):null;
  const mejor=activos.length?activos.reduce((a,b)=>a.promNotas>b.promNotas?a:b,activos[0]):null;
  const menor=activos.length?activos.reduce((a,b)=>a.promNotas<b.promNotas?a:b,activos[0]):null;
  const sinAsist=stats.filter(s=>!s.asistPct||s.asistPct===0).length;
  qb.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:.5rem;font-size:.85rem">
      ${top?`<div style="background:#ebf8ff;border-radius:8px;padding:.5rem .75rem">
        <div style="font-size:.7rem;color:#2b6cb0;font-weight:700;text-transform:uppercase">Mayor población</div>
        <div style="font-weight:600;color:#1a365d">${top.colegioNombre}</div>
        <div style="color:#4a5568">${top.totalEst} estudiantes</div>
      </div>`:''}
      ${mejor?`<div style="background:#f0fff4;border-radius:8px;padding:.5rem .75rem">
        <div style="font-size:.7rem;color:#276749;font-weight:700;text-transform:uppercase">Mejor rendimiento</div>
        <div style="font-weight:600;color:#1c4532">${mejor.colegioNombre}</div>
        <div style="color:#4a5568">Prom. ${mejor.promNotas}</div>
      </div>`:''}
      ${menor?`<div style="background:#fff5f5;border-radius:8px;padding:.5rem .75rem">
        <div style="font-size:.7rem;color:#c53030;font-weight:700;text-transform:uppercase">Requiere atención</div>
        <div style="font-weight:600;color:#742a2a">${menor.colegioNombre}</div>
        <div style="color:#4a5568">Prom. ${menor.promNotas}</div>
      </div>`:''}
      <div style="background:#faf5ff;border-radius:8px;padding:.5rem .75rem">
        <div style="font-size:.7rem;color:#553c9a;font-weight:700;text-transform:uppercase">Colegios inactivos</div>
        <div style="font-weight:600;color:#322659">${stats.filter(s=>!s.activo).length} de ${stats.length}</div>
      </div>
      ${sinAsist>0?`<div style="background:#fffaf0;border-radius:8px;padding:.5rem .75rem">
        <div style="font-size:.7rem;color:#c05621;font-weight:700;text-transform:uppercase">Sin datos asistencia</div>
        <div style="font-weight:600;color:#7b341e">${sinAsist} institución${sinAsist>1?'es':''}</div>
      </div>`:''}
    </div>`;
}

function exportarSADashCSV(){
  const stats=window._saStatsData||[];
  if(!stats.length) return sw('warning','No hay datos para exportar');
  const header='Institución,Estudiantes,Profesores,Salones,Prom.Notas,Asistencia%,Ingresos/Mes,Estado';
  const rows=stats.map(s=>`"${s.colegioNombre}",${s.totalEst},${s.totalProfs},${s.totalSalones||0},${s.promNotas},${s.asistPct||0},${s.ingresosMes||0},${s.activo?'Activo':'Inactivo'}`);
  const csv=[header,...rows].join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download=`SuperAdmin_Estadisticas_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  sw('success','CSV exportado correctamente');
}

async function initSADash(){
  try{
    const [statsRaw,sugCount]=await Promise.all([
      saApiFetch('/api/superadmin/stats').catch(()=>[]),
      saApiFetch('/api/sugerencias/count').catch(()=>({noLeidas:0})),
    ]);
    const stats=Array.isArray(statsRaw)?statsRaw:[];
    window._saStatsData=stats;
    renderSADashKPIs(stats,sugCount);
    renderSADashChart(stats);
    renderSADashTable(stats);
    renderSADashQuick(stats);
    // Ocultar columna ingresos si no hay datos en ninguno
    const midRow=gi('saDashMidRow');
    if(midRow&&window.innerWidth<768) midRow.style.gridTemplateColumns='1fr';
    const badge=gi('saSugBadge');
    if(badge&&sugCount&&sugCount.noLeidas>0){
      badge.textContent=`💡 ${sugCount.noLeidas} nueva${sugCount.noLeidas>1?'s':''}`;
      badge.style.display='inline-block';
    }
  }catch(e){sw('error','Error al cargar el panel: '+e.message);}
}

/* ─── COLEGIOS & ADMINS ─────────────────────────────────── */
function pgSAColegios(){
  return`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h2>🏫 Colegios & Admins</h2>
      <button class="btn" onclick="modalNuevoColegio()">＋ Nuevo Colegio</button>
    </div>
    <input id="saColSearch" class="inp" style="max-width:280px;margin-bottom:1rem" placeholder="🔍 Buscar colegio…" oninput="filtrarColegios()">
    <div id="saColegiosTable">Cargando…</div>
  </div>`;
}
async function initSAColegios(){
  try{
    const raw=await saApiFetch('/api/superadmin/colegios').catch(()=>[]);
    window._saColegios=Array.isArray(raw)?raw:[];
    renderSAColegiosTable(window._saColegios);
  }catch(e){const el=gi('saColegiosTable');if(el)el.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}
function filtrarColegios(){
  const q=(gi('saColSearch')?.value||'').toLowerCase();
  const lista=(window._saColegios||[]).filter(c=>c.nombre.toLowerCase().includes(q));
  renderSAColegiosTable(lista);
}
function renderSAColegiosTable(lista){
  const el=gi('saColegiosTable');
  if(!el) return;
  if(!lista.length){el.innerHTML='<p style="color:#999">No hay colegios registrados.</p>';return;}
  el.innerHTML=`<table class="tbl"><thead><tr>
    <th>Nombre</th><th>Código</th><th>Admins</th><th>Estud.</th><th>Profs.</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${lista.map(c=>`<tr>
    <td><strong>${c.nombre}</strong></td>
    <td>${c.codigo||'—'}</td>
    <td>${c.admins||0}</td><td>${c.ests||0}</td><td>${c.profs||0}</td>
    <td><span class="bdg ${c.activo?'bgr':'bred'}">${c.activo?'Activo':'Inactivo'}</span></td>
    <td style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn bsm" onclick="modalEditColegio('${c.id}')">✏️ Editar</button>
      <button class="btn bsm" onclick="modalAdmins('${c.id}','${c.nombre.replace(/'/g,"\\'")}')">👤 Admins</button>
      <button class="btn bsm" onclick="toggleColegio('${c.id}',${!c.activo})">${c.activo?'🔒 Desactivar':'🔓 Activar'}</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}
async function toggleColegio(id,activo){
  const conf=await Swal.fire({title:`¿${activo?'Activar':'Desactivar'} colegio?`,icon:'question',showCancelButton:true,confirmButtonText:'Sí'});
  if(!conf.isConfirmed) return;
  try{
    await saApiFetch(`/api/superadmin/colegios/${id}`,{method:'PUT',body:JSON.stringify({activo})});
    sw('success','Actualizado');
    initSAColegios();
  }catch(e){sw('error',e.message);}
}
async function modalNuevoColegio(){
  const {value:f}=await Swal.fire({
    title:'Nuevo Colegio + Admin',
    html:`
      <input id="snNombre"  class="swal2-input" placeholder="Nombre del colegio *">
      <input id="snCodigo"  class="swal2-input" placeholder="Código (opcional)">
      <input id="snDir"     class="swal2-input" placeholder="Dirección">
      <hr style="margin:.5rem 0">
      <p style="margin:.5rem 1rem;font-size:.85rem;color:#666;text-align:left">Datos del administrador:</p>
      <input id="snANombre" class="swal2-input" placeholder="Nombre del Admin *">
      <input id="snAUser"   class="swal2-input" placeholder="Usuario Admin * (sin espacios)">
      <input id="snAPwd"    class="swal2-input" type="password" placeholder="Contraseña Admin *">
    `,
    focusConfirm:false,showCancelButton:true,confirmButtonText:'Crear Colegio',
    preConfirm:()=>({
      nombre:       gi('snNombre')?.value.trim(),
      codigo:       gi('snCodigo')?.value.trim(),
      direccion:    gi('snDir')?.value.trim(),
      adminNombre:  gi('snANombre')?.value.trim(),
      adminUsuario: gi('snAUser')?.value.trim(),
      adminPassword:gi('snAPwd')?.value,
    })
  });
  if(!f) return;
  if(!f.nombre||!f.adminNombre||!f.adminUsuario||!f.adminPassword)
    return sw('warning','Completa todos los campos obligatorios (*)');
  try{
    await saApiFetch('/api/superadmin/colegios',{method:'POST',body:JSON.stringify(f)});
    sw('success',`Colegio "${f.nombre}" creado correctamente`);
    initSAColegios();
  }catch(e){sw('error',e.message);}
}
async function modalEditColegio(id){
  const col=(window._saColegios||[]).find(c=>c.id===id);
  if(!col) return;
  const {value:f}=await Swal.fire({
    title:'Editar Colegio',
    html:`
      <input id="enNombre"   class="swal2-input" value="${col.nombre}"                  placeholder="Nombre *">
      <input id="enCodigo"   class="swal2-input" value="${col.codigo||''}"              placeholder="Código">
      <input id="enDir"      class="swal2-input" value="${col.direccion||''}"           placeholder="Dirección">
      <input id="enTel"      class="swal2-input" value="${col.telefono||''}"            placeholder="Teléfono">
      <input id="enSedes"    class="swal2-input" value="${(col.sedes||[]).join(', ')}"  placeholder="Sedes (coma)">
      <input id="enJornadas" class="swal2-input" value="${(col.jornadas||[]).join(', ')}" placeholder="Jornadas (coma)">
    `,
    focusConfirm:false,showCancelButton:true,confirmButtonText:'Guardar',
    preConfirm:()=>({
      nombre:   gi('enNombre')?.value.trim()||col.nombre,
      codigo:   gi('enCodigo')?.value.trim(),
      direccion:gi('enDir')?.value.trim(),
      telefono: gi('enTel')?.value.trim(),
      sedes:    gi('enSedes')?.value.split(',').map(s=>s.trim()).filter(Boolean),
      jornadas: gi('enJornadas')?.value.split(',').map(s=>s.trim()).filter(Boolean),
    })
  });
  if(!f) return;
  try{
    await saApiFetch(`/api/superadmin/colegios/${id}`,{method:'PUT',body:JSON.stringify(f)});
    sw('success','Colegio actualizado');
    initSAColegios();
  }catch(e){sw('error',e.message);}
}
async function modalAdmins(colegioId,colegioNombre){
  try{
    const admins=await saApiFetch(`/api/superadmin/admins?colegioId=${colegioId}`);
    const lista=admins.map(a=>`<tr>
      <td>${a.nombre}</td><td>${a.usuario}</td>
      <td><span class="bdg ${a.blocked?'bred':'bgr'}">${a.blocked?'Bloqueado':'Activo'}</span></td>
      <td style="display:flex;gap:.3rem">
        <button class="btn bsm" onclick="editAdmin('${a.id}')">✏️</button>
        <button class="btn bsm" onclick="toggleAdmin('${a.id}',${!a.blocked})">${a.blocked?'🔓':'🔒'}</button>
      </td>
    </tr>`).join('');
    Swal.fire({
      title:`Admins — ${colegioNombre}`,
      html:`<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Estado</th><th>Acc.</th></tr></thead>
        <tbody>${lista||'<tr><td colspan="4" style="text-align:center;color:#999">Sin admins</td></tr>'}</tbody></table></div>
        <hr style="margin:.75rem 0">
        <button class="btn" onclick="modalNuevoAdmin('${colegioId}','${colegioNombre.replace(/'/g,"\\'")}')">＋ Nuevo Admin</button>`,
      width:640,showConfirmButton:false,showCloseButton:true
    });
  }catch(e){sw('error',e.message);}
}
async function modalNuevoAdmin(colegioId,colegioNombre){
  Swal.close();
  const {value:f}=await Swal.fire({
    title:`Nuevo Admin — ${colegioNombre}`,
    html:`<input id="nanom" class="swal2-input" placeholder="Nombre completo *">
          <input id="nausr" class="swal2-input" placeholder="Usuario * (sin espacios)">
          <input id="napwd" class="swal2-input" type="password" placeholder="Contraseña *">`,
    focusConfirm:false,showCancelButton:true,confirmButtonText:'Crear Admin',
    preConfirm:()=>({nombre:gi('nanom')?.value.trim(),usuario:gi('nausr')?.value.trim(),password:gi('napwd')?.value,colegioId})
  });
  if(!f||!f.nombre||!f.usuario||!f.password) return;
  try{
    await saApiFetch('/api/superadmin/admins',{method:'POST',body:JSON.stringify(f)});
    sw('success','Admin creado correctamente');
  }catch(e){sw('error',e.message);}
}
async function editAdmin(id){
  const {value:f}=await Swal.fire({
    title:'Editar Admin',
    html:`<input id="eaNom" class="swal2-input" placeholder="Nuevo nombre (vacío = no cambiar)">
          <input id="eaPwd" class="swal2-input" type="password" placeholder="Nueva contraseña (vacío = no cambiar)">`,
    focusConfirm:false,showCancelButton:true,
    preConfirm:()=>{const o={};const n=gi('eaNom')?.value.trim();const p=gi('eaPwd')?.value;if(n)o.nombre=n;if(p)o.password=p;return o;}
  });
  if(!f||!Object.keys(f).length) return;
  try{
    await saApiFetch(`/api/superadmin/admins/${id}`,{method:'PUT',body:JSON.stringify(f)});
    sw('success','Admin actualizado');
  }catch(e){sw('error',e.message);}
}
async function toggleAdmin(id,blocked){
  try{
    await saApiFetch(`/api/superadmin/admins/${id}`,{method:'PUT',body:JSON.stringify({blocked})});
    sw('success',blocked?'Admin bloqueado':'Admin desbloqueado');
  }catch(e){sw('error',e.message);}
}

/* ─── PLAN DE ESTUDIOS ─────────────────────────────────── */
function pgSAPlan(){
  return`<div class="card">
    <h2>📖 Plan de Estudios</h2>
    <p style="color:#888;margin-bottom:1rem">Define áreas, asignaturas e intensidades horarias por colegio.</p>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
      <select id="saPlanCol" class="inp" style="min-width:200px" onchange="loadSAPlan()">
        <option value="">— Selecciona colegio —</option>
      </select>
      <select id="saPlanCiclo" class="inp" onchange="loadSAPlan()">
        <option value="">Todos los ciclos</option>
        <option value="primaria">Primaria</option>
        <option value="bachillerato">Bachillerato</option>
      </select>
      <button class="btn" onclick="modalNuevaMateria()">＋ Agregar Asignatura</button>
      <button class="btn bsec" onclick="importarPlanDefecto()">📥 Plan por Defecto</button>
      <button class="btn bdan" onclick="eliminarPlanCompleto()" style="margin-left:auto">🗑️ Eliminar Todo</button>
    </div>
    <div id="saPlanTable">Selecciona un colegio.</div>
  </div>`;
}
async function initSAPlan(){
  try{
    const raw=await saApiFetch('/api/superadmin/colegios').catch(()=>[]);
    const colegios=Array.isArray(raw)?raw:[];
    const sel=gi('saPlanCol');
    if(sel) sel.innerHTML='<option value="">— Selecciona colegio —</option>'+
      colegios.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
    if(!colegios.length&&sel) sel.innerHTML='<option value="">Sin colegios registrados</option>';
  }catch(e){sw('error',e.message);}
}
async function loadSAPlan(){
  const cid=gi('saPlanCol')?.value;
  const pt=gi('saPlanTable');
  if(!cid){if(pt)pt.textContent='Selecciona un colegio.';return;}
  if(pt)pt.textContent='Cargando…';
  try{
    const ciclo=gi('saPlanCiclo')?.value;
    let plan=await saApiFetch(`/api/superadmin/plan/${cid}`);
    if(ciclo) plan=plan.filter(p=>p.ciclo===ciclo);
    if(!plan.length){if(pt)pt.innerHTML='<p style="color:#999">Sin asignaturas. Agrega una o usa Plan por Defecto.</p>';return;}
    if(pt)pt.innerHTML=`<table class="tbl"><thead><tr>
      <th>Ciclo</th><th>Grado</th><th>Área</th><th>Asignatura</th><th>h/sem</th>
    </tr></thead><tbody>${plan.map(p=>`<tr>
      <td>${p.ciclo}</td><td>${p.grado}</td><td>${p.area}</td><td>${p.asignatura}</td><td>${p.intensidad}</td>
    </tr>`).join('')}</tbody></table>`;
  }catch(e){if(pt)pt.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}
async function modalNuevaMateria(){
  const cid=gi('saPlanCol')?.value;
  if(!cid) return sw('warning','Selecciona un colegio primero');
  const {value:f}=await Swal.fire({
    title:'Nueva Asignatura',
    html:`<select id="nmCiclo" class="swal2-select" style="width:100%;margin:.25rem 0">
            <option value="primaria">Primaria</option><option value="bachillerato">Bachillerato</option>
          </select>
          <input id="nmGrado" class="swal2-input" placeholder="Grado (ej: 1°, 6°)">
          <input id="nmArea"  class="swal2-input" placeholder="Área (ej: Ciencias Naturales)">
          <input id="nmAsig"  class="swal2-input" placeholder="Asignatura *">
          <input id="nmInt"   class="swal2-input" type="number" min="0" max="40" placeholder="Intensidad h/sem">`,
    focusConfirm:false,showCancelButton:true,confirmButtonText:'Agregar',
    preConfirm:()=>({ciclo:gi('nmCiclo')?.value,grado:gi('nmGrado')?.value.trim(),
      area:gi('nmArea')?.value.trim(),asignatura:gi('nmAsig')?.value.trim(),
      intensidad:parseInt(gi('nmInt')?.value)||0})
  });
  if(!f||!f.asignatura) return;
  try{
    await saApiFetch(`/api/superadmin/plan/${cid}`,{method:'POST',body:JSON.stringify(f)});
    sw('success','Asignatura agregada');
    loadSAPlan();
  }catch(e){sw('error',e.message);}
}
async function eliminarPlanCompleto(){
  const cid=gi('saPlanCol')?.value;
  if(!cid) return sw('warning','Selecciona un colegio primero');
  const conf=await Swal.fire({title:'¿Eliminar todo el plan?',text:'Se borrarán todas las asignaturas del colegio.',icon:'warning',showCancelButton:true,confirmButtonText:'Sí, eliminar',confirmButtonColor:'#e53e3e'});
  if(!conf.isConfirmed) return;
  try{
    await saApiFetch(`/api/superadmin/plan/${cid}`,{method:'DELETE'});
    sw('success','Plan eliminado');
    loadSAPlan();
  }catch(e){sw('error',e.message);}
}
async function importarPlanDefecto(){
  const cid=gi('saPlanCol')?.value;
  if(!cid) return sw('warning','Selecciona un colegio primero');
  const conf=await Swal.fire({title:'¿Importar plan por defecto?',text:'Esto borrará el plan actual del colegio.',icon:'warning',showCancelButton:true,confirmButtonText:'Importar'});
  if(!conf.isConfirmed) return;
  const plan=[
    {ciclo:'primaria',grado:'1°',area:'Matemáticas',asignatura:'Matemáticas',intensidad:5},
    {ciclo:'primaria',grado:'1°',area:'Lenguaje',asignatura:'Español',intensidad:5},
    {ciclo:'primaria',grado:'1°',area:'Ciencias',asignatura:'Ciencias Naturales',intensidad:3},
    {ciclo:'primaria',grado:'1°',area:'Sociales',asignatura:'Ciencias Sociales',intensidad:3},
    {ciclo:'primaria',grado:'1°',area:'Artística',asignatura:'Artística',intensidad:2},
    {ciclo:'primaria',grado:'1°',area:'Ed. Física',asignatura:'Educación Física',intensidad:2},
    {ciclo:'bachillerato',grado:'6°',area:'Matemáticas',asignatura:'Matemáticas',intensidad:5},
    {ciclo:'bachillerato',grado:'6°',area:'Lenguaje',asignatura:'Español',intensidad:4},
    {ciclo:'bachillerato',grado:'6°',area:'Ciencias',asignatura:'Física',intensidad:3},
    {ciclo:'bachillerato',grado:'6°',area:'Ciencias',asignatura:'Química',intensidad:3},
    {ciclo:'bachillerato',grado:'6°',area:'Filosofía',asignatura:'Filosofía',intensidad:2},
    {ciclo:'bachillerato',grado:'6°',area:'Idiomas',asignatura:'Inglés',intensidad:3},
  ];
  try{
    await saApiFetch(`/api/superadmin/plan/${cid}`,{method:'DELETE'});
    await saApiFetch(`/api/superadmin/plan/${cid}`,{method:'POST',body:JSON.stringify(plan)});
    sw('success','Plan importado correctamente');
    loadSAPlan();
  }catch(e){sw('error',e.message);}
}

/* ─── ESTADÍSTICAS GLOBALES ─────────────────────────────── */
function pgSAEstadisticas(){
  return`<div id="saEstPage">
    <!-- Header con KPIs -->
    <div class="card" style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#fff;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
        <h2 style="color:#fff;margin:0">📊 Estadísticas Globales del Sistema</h2>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:.8rem" onclick="initSAEstadisticas()">🔄 Actualizar</button>
          <button class="btn" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:.8rem" onclick="exportarEstCSV()">📤 CSV</button>
        </div>
      </div>
      <div id="saEstGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:.75rem">
        <div style="text-align:center;opacity:.7"><div style="font-size:1.8rem">⏳</div><p style="font-size:.8rem;margin:.25rem 0">Cargando…</p></div>
      </div>
    </div>

    <!-- Filtros y controles -->
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
        <input id="saEstSearch" class="inp" style="width:200px;font-size:.85rem" placeholder="🔍 Buscar institución…" oninput="renderEstDetalle(window._saEstData||[])">
        <select id="saEstFiltroEstado" class="inp" style="width:auto;font-size:.85rem" onchange="renderEstDetalle(window._saEstData||[])">
          <option value="">Todos los estados</option>
          <option value="activo">Solo activos</option>
          <option value="inactivo">Solo inactivos</option>
        </select>
        <select id="saEstOrden" class="inp" style="width:auto;font-size:.85rem" onchange="renderEstDetalle(window._saEstData||[])">
          <option value="nombre">Ordenar por nombre</option>
          <option value="est_desc">↓ Más estudiantes</option>
          <option value="prom_desc">↓ Mejor promedio</option>
          <option value="asist_desc">↓ Mejor asistencia</option>
          <option value="ing_desc">↓ Mayores ingresos</option>
        </select>
      </div>
    </div>

    <!-- Gráficas comparativas -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem" id="saEstChartsRow">
      <div class="card">
        <h3 style="margin:0 0 .75rem;font-size:.95rem">📈 Promedio de Notas por Institución</h3>
        <div id="saEstChartNotas" style="overflow-x:auto;min-height:140px;display:flex;align-items:flex-end"></div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 .75rem;font-size:.95rem">✅ Asistencia % por Institución</h3>
        <div id="saEstChartAsist" style="overflow-x:auto;min-height:140px;display:flex;align-items:flex-end"></div>
      </div>
    </div>

    <!-- Tabla detallada completa -->
    <div class="card">
      <h3 style="margin:0 0 .75rem">📋 Detalle completo por institución</h3>
      <div id="saEstDetalle" style="overflow-x:auto">Cargando…</div>
    </div>
  </div>`;
}

function renderEstKPIs(stats){
  const grid=gi('saEstGrid');
  if(!grid) return;
  const activos=stats.filter(s=>s.activo).length;
  const totalEst=stats.reduce((a,s)=>a+s.totalEst,0);
  const totalProfs=stats.reduce((a,s)=>a+s.totalProfs,0);
  const totalSal=stats.reduce((a,s)=>a+(s.totalSalones||0),0);
  const promNotas=stats.length?+(stats.reduce((a,s)=>a+s.promNotas,0)/stats.length).toFixed(2):0;
  const promAsist=stats.length?+(stats.reduce((a,s)=>a+(s.asistPct||0),0)/stats.length).toFixed(1):0;
  const totalIng=stats.reduce((a,s)=>a+(s.ingresosMes||0),0);
  const promIng=stats.length?Math.round(totalIng/stats.length):0;
  const kpis=[
    {ic:'🏫',lb:'Instituciones',val:stats.length,sub:`${activos} activas · ${stats.length-activos} inactivas`},
    {ic:'👨‍🎓',lb:'Estudiantes',val:totalEst.toLocaleString(),sub:`~${stats.length?Math.round(totalEst/stats.length):0} por inst.`},
    {ic:'👩‍🏫',lb:'Profesores',val:totalProfs.toLocaleString(),sub:`~${stats.length?Math.round(totalProfs/stats.length):0} por inst.`},
    {ic:'🏛️',lb:'Salones',val:totalSal.toLocaleString(),sub:`~${stats.length?Math.round(totalSal/stats.length):0} por inst.`},
    {ic:'📊',lb:'Prom. Notas Global',val:promNotas,sub:promNotas>=4?'🟢 Excelente':promNotas>=3?'🟡 Aceptable':'🔴 Bajo'},
    {ic:'✅',lb:'Asistencia Global',val:promAsist+'%',sub:promAsist>=90?'🟢 Excelente':promAsist>=75?'🟡 Regular':'🔴 Baja'},
    {ic:'💰',lb:'Ingresos Totales/Mes',val:'$'+totalIng.toLocaleString(),sub:`Prom $${promIng.toLocaleString()}/inst.`},
  ];
  grid.innerHTML=kpis.map(k=>`
    <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:.75rem 1rem;text-align:center">
      <div style="font-size:1.5rem">${k.ic}</div>
      <div style="font-size:1.4rem;font-weight:800;color:#fff;line-height:1.1">${k.val}</div>
      <div style="font-size:.72rem;opacity:.85;color:#e2e8f0;margin:.15rem 0">${k.lb}</div>
      <div style="font-size:.65rem;opacity:.65;color:#bee3f8">${k.sub}</div>
    </div>`).join('');
}

function renderEstChart(stats,containerId,field,label,maxOverride){
  const chart=gi(containerId);
  if(!chart||!stats.length) return;
  const maxVal=maxOverride||Math.max(...stats.map(s=>s[field]||0),1);
  const BAR_H=120;
  const bars=stats.map((s,i)=>{
    const val=s[field]||0;
    const h=Math.max(4,Math.round((val/maxVal)*BAR_H));
    const pct=maxOverride?Math.round((val/maxVal)*100):null;
    const colors=['#3182ce','#38a169','#d69e2e','#805ad5','#e53e3e','#319795','#dd6b20','#b83280'];
    const c=colors[i%colors.length];
    const name=s.colegioNombre.length>11?s.colegioNombre.slice(0,11)+'…':s.colegioNombre;
    return`<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px" title="${s.colegioNombre}: ${val}${maxOverride?'%':''}">
      <div style="font-size:.65rem;font-weight:700;color:#2d3748">${val}${maxOverride?'%':''}</div>
      <div style="width:38px;height:${h}px;background:${c};border-radius:5px 5px 0 0"></div>
      <div style="font-size:.6rem;text-align:center;color:#718096;max-width:56px;word-break:break-word;line-height:1.2">${name}</div>
    </div>`;
  }).join('');
  chart.innerHTML=`<div style="display:flex;align-items:flex-end;gap:5px;padding-bottom:4px;min-width:max-content">${bars}</div>`;
}

function renderEstDetalle(stats){
  const q=(gi('saEstSearch')?.value||'').toLowerCase();
  const estado=gi('saEstFiltroEstado')?.value||'';
  const orden=gi('saEstOrden')?.value||'nombre';
  let filtered=stats
    .filter(s=>!q||s.colegioNombre.toLowerCase().includes(q))
    .filter(s=>!estado||(estado==='activo'?s.activo:!s.activo));
  if(orden==='est_desc') filtered.sort((a,b)=>b.totalEst-a.totalEst);
  else if(orden==='prom_desc') filtered.sort((a,b)=>b.promNotas-a.promNotas);
  else if(orden==='asist_desc') filtered.sort((a,b)=>(b.asistPct||0)-(a.asistPct||0));
  else if(orden==='ing_desc') filtered.sort((a,b)=>(b.ingresosMes||0)-(a.ingresosMes||0));
  else filtered.sort((a,b)=>a.colegioNombre.localeCompare(b.colegioNombre));
  const det=gi('saEstDetalle');
  if(!det) return;
  if(!filtered.length){det.innerHTML='<p style="color:#999;text-align:center;padding:2rem">Sin resultados con los filtros aplicados.</p>';return;}
  const hayAsist=filtered.some(s=>s.asistPct!=null&&s.asistPct>0);
  const hayIng=filtered.some(s=>s.ingresosMes!=null&&s.ingresosMes>0);
  det.innerHTML=`<table class="tbl"><thead><tr>
    <th>#</th><th>Institución</th><th>Estudiantes</th><th>Profesores</th><th>Salones</th>
    <th>Prom. Notas</th>${hayAsist?'<th>Asistencia</th>':''}${hayIng?'<th>Ingresos/Mes</th>':''}
    <th>Estado</th>
  </tr></thead><tbody>${filtered.map((s,i)=>{
    const notaColor=s.promNotas>=4?'#276749':s.promNotas>=3?'#744210':'#9b2c2c';
    const asistColor=(s.asistPct||0)>=90?'#276749':(s.asistPct||0)>=75?'#744210':'#9b2c2c';
    return`<tr>
      <td style="color:#a0aec0;font-size:.8rem">${i+1}</td>
      <td><strong>${s.colegioNombre}</strong></td>
      <td><span style="font-weight:600">${s.totalEst}</span></td>
      <td>${s.totalProfs}</td>
      <td>${s.totalSalones||0}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;min-width:40px">
            <div style="width:${Math.min(100,s.promNotas/5*100)}%;height:100%;background:${notaColor};border-radius:3px"></div>
          </div>
          <span style="font-weight:700;color:${notaColor};font-size:.9rem">${s.promNotas}</span>
        </div>
      </td>
      ${hayAsist?`<td>
        ${s.asistPct!=null?`<div style="display:flex;align-items:center;gap:.4rem">
          <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;min-width:40px">
            <div style="width:${Math.min(100,s.asistPct)}%;height:100%;background:${asistColor};border-radius:3px"></div>
          </div>
          <span style="font-weight:600;color:${asistColor};font-size:.9rem">${s.asistPct}%</span>
        </div>`:'<span style="color:#a0aec0">—</span>'}
      </td>`:''}
      ${hayIng?`<td>${s.ingresosMes!=null?'<span style="font-weight:600;color:#2c7a7b">$'+Number(s.ingresosMes).toLocaleString()+'</span>':'<span style="color:#a0aec0">—</span>'}</td>`:''}
      <td><span class="bdg ${s.activo?'bgr':'bred'}">${s.activo?'Activo':'Inactivo'}</span></td>
    </tr>`;
  }).join('')}</tbody></table>
  <p style="font-size:.75rem;color:#a0aec0;margin-top:.5rem;text-align:right">Mostrando ${filtered.length} de ${stats.length} instituciones · Datos del seed Atlas</p>`;
}

function exportarEstCSV(){
  const stats=window._saEstData||[];
  if(!stats.length) return sw('warning','Sin datos para exportar');
  const header='Institución,Estudiantes,Profesores,Salones,Prom.Notas,Asistencia%,IngresosMes,Estado';
  const rows=stats.map(s=>`"${s.colegioNombre}",${s.totalEst},${s.totalProfs},${s.totalSalones||0},${s.promNotas},${s.asistPct||0},${s.ingresosMes||0},${s.activo?'Activo':'Inactivo'}`);
  const csv=[header,...rows].join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
  a.download=`Estadisticas_Atlas_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  sw('success','CSV con datos Atlas exportado');
}

async function initSAEstadisticas(){
  try{
    const statsRaw=await saApiFetch('/api/superadmin/stats').catch(()=>[]);
    const stats=Array.isArray(statsRaw)?statsRaw:[];
    window._saEstData=stats;
    renderEstKPIs(stats);
    renderEstChart(stats,'saEstChartNotas','promNotas','Prom. Notas',5);
    renderEstChart(stats,'saEstChartAsist','asistPct','Asistencia %',100);
    renderEstDetalle(stats);
    const chartsRow=gi('saEstChartsRow');
    if(chartsRow&&window.innerWidth<640) chartsRow.style.gridTemplateColumns='1fr';
  }catch(e){
    const g=gi('saEstGrid');
    if(g)g.innerHTML=`<p style="color:#fff;opacity:.7">Error al cargar: ${e.message}</p>`;
  }
}

/* ─── AUDITORÍA GLOBAL ──────────────────────────────────── */
function pgSAAuditoria(){
  return`<div class="card">
    <h2>🔍 Auditoría Global</h2>
    <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
      <select id="saAudCol" class="inp" style="min-width:200px" onchange="loadSAAuditoria()">
        <option value="">Todos los colegios</option>
      </select>
      <input id="saAudSearch" class="inp" placeholder="🔍 Buscar acción…" oninput="loadSAAuditoria()">
    </div>
    <div id="saAudTable">Cargando…</div>
  </div>`;
}
async function initSAAuditoria(){
  try{
    const raw=await saApiFetch('/api/superadmin/colegios').catch(()=>[]);
    const colegios=Array.isArray(raw)?raw:[];
    const sel=gi('saAudCol');
    if(sel) sel.innerHTML='<option value="">Todos los colegios</option>'+
      colegios.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
    loadSAAuditoria();
  }catch(e){const el=gi('saAudTable');if(el)el.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}
async function loadSAAuditoria(){
  const cid=gi('saAudCol')?.value;
  const q=(gi('saAudSearch')?.value||'').toLowerCase();
  const el=gi('saAudTable');
  if(!el) return;
  el.textContent='Cargando…';
  try{
    let url='/api/superadmin/auditoria?limit=300';
    if(cid) url+=`&colegioId=${cid}`;
    const raw=await saApiFetch(url).catch(()=>[]);
    let logs=Array.isArray(raw)?raw:[];
    if(q) logs=logs.filter(l=>(l.accion||'').toLowerCase().includes(q)||(l.who||'').toLowerCase().includes(q));
    if(!logs.length){el.innerHTML='<p style="color:#888;text-align:center;padding:2rem">Sin registros de auditoría.</p>';return;}
    el.innerHTML=`<table class="tbl"><thead><tr>
      <th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Colegio</th>
    </tr></thead><tbody>${logs.slice(0,200).map(l=>`<tr>
      <td style="font-size:.78rem">${l.ts?.slice(0,16)||''}</td>
      <td>${l.who||l.user||''}</td>
      <td><span class="bdg ${l.role==='superadmin'?'bpurp':l.role==='admin'?'bor':'bbl'}">${l.role||''}</span></td>
      <td>${l.accion||''}</td>
      <td style="font-size:.78rem">${l.colegioId||'global'}</td>
    </tr>`).join('')}</tbody></table>`;
  }catch(e){el.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}

/* ─── MANTENIMIENTO TÉCNICO ─────────────────────────────── */
function pgSAMantenimiento(){
  return`<div class="card">
    <h2>⚙️ Mantenimiento Técnico</h2>
    <div style="display:grid;gap:1.5rem">
      <div class="card">
        <h3>💾 Copia de Seguridad</h3>
        <p style="color:#888;margin-bottom:.75rem">Descarga un backup JSON de una institución.</p>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <select id="saBackupCol" class="inp" style="min-width:200px"></select>
          <button class="btn" onclick="descargarBackup()">📥 Descargar Backup</button>
        </div>
      </div>
      <div class="card">
        <h3>🔑 Reset Masivo de Contraseñas</h3>
        <p style="color:#888;margin-bottom:.75rem">Actualiza contraseñas de todos los usuarios de un colegio.</p>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
          <select id="saResetCol" class="inp" style="min-width:200px"></select>
          <select id="saResetRole" class="inp">
            <option value="">Todos los roles</option>
            <option value="est">Estudiantes</option>
            <option value="profe">Profesores</option>
            <option value="admin">Admins</option>
          </select>
          <input id="saResetPwd" class="inp" type="password" placeholder="Nueva contraseña" style="min-width:200px">
          <button class="btn bdan" onclick="resetMasivo()">⚠️ Resetear</button>
        </div>
      </div>
    </div>
  </div>`;
}
async function initSAMantenimiento(){
  try{
    const raw=await saApiFetch('/api/superadmin/colegios').catch(()=>[]);
    const colegios=Array.isArray(raw)?raw:[];
    ['saBackupCol','saResetCol'].forEach(sid=>{
      const sel=gi(sid);
      if(sel) sel.innerHTML='<option value="">— Selecciona colegio —</option>'+
        colegios.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
      if(!colegios.length&&sel) sel.innerHTML='<option value="">Sin colegios registrados</option>';
    });
  }catch(e){sw('error',e.message);}
}
async function descargarBackup(){
  const cid=gi('saBackupCol')?.value;
  if(!cid) return sw('warning','Selecciona un colegio');
  try{
    const token=window.TokenStore?.get();
    if(!token){Swal.fire({icon:'warning',title:'Sin sesión',text:'Vuelve a iniciar sesión.'});return;}
    const res=await fetch(API_BASE+`/api/superadmin/backup/${cid}`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error||'Error backup');}
    const blob=await res.blob();
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`backup_${cid}_${Date.now()}.json`;a.click();
    URL.revokeObjectURL(url);
    sw('success','Backup descargado');
  }catch(e){sw('error',e.message);}
}
async function resetMasivo(){
  const cid=gi('saResetCol')?.value;
  const role=gi('saResetRole')?.value;
  const pwd=gi('saResetPwd')?.value;
  if(!cid||!pwd) return sw('warning','Completa los campos requeridos');
  const conf=await Swal.fire({
    title:'⚠️ ¿Confirmas el reset?',
    text:`Esto cambiará la contraseña de ${role||'todos los usuarios'} del colegio.`,
    icon:'warning',showCancelButton:true,confirmButtonText:'Sí, resetear',confirmButtonColor:'#e53e3e'
  });
  if(!conf.isConfirmed) return;
  try{
    const res=await saApiFetch(`/api/superadmin/reset-passwords/${cid}`,{method:'POST',body:JSON.stringify({role:role||undefined,newPassword:pwd})});
    sw('success',`${res.updated} contraseñas actualizadas`);
    gi('saResetPwd').value='';
  }catch(e){sw('error',e.message);}
}

/* ─── SUGERENCIAS — superadmin recibe ──────────────────── */
function pgSASug(){
  return`<div class="card">
    <h2>💡 Sugerencias Recibidas</h2>
    <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <select id="saSugFiltCol" class="inp" style="min-width:180px" onchange="loadSASug()">
        <option value="">Todos los colegios</option>
      </select>
      <select id="saSugFiltLeida" class="inp" onchange="loadSASug()">
        <option value="">Todas</option>
        <option value="false">No leídas</option>
        <option value="true">Leídas</option>
      </select>
    </div>
    <div id="saSugTable">Cargando…</div>
  </div>`;
}
async function initSASug(){
  try{
    const raw=await saApiFetch('/api/superadmin/colegios').catch(()=>[]);
    const colegios=Array.isArray(raw)?raw:[];
    const sel=gi('saSugFiltCol');
    if(sel) sel.innerHTML='<option value="">Todos los colegios</option>'+
      colegios.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');
    loadSASug();
  }catch(e){const el=gi('saSugTable');if(el)el.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}
async function loadSASug(){
  const el=gi('saSugTable');if(!el) return;
  el.textContent='Cargando…';
  try{
    const cid=gi('saSugFiltCol')?.value||'';
    const leida=gi('saSugFiltLeida')?.value||'';
    let url='/api/sugerencias?limit=200';
    if(cid) url+=`&colegioId=${cid}`;
    if(leida!=='') url+=`&leida=${leida}`;
    const raw=await saApiFetch(url).catch(()=>[]);
    const list=Array.isArray(raw)?raw:[];
    if(!list.length){el.innerHTML='<p style="color:#999;text-align:center;padding:2rem">No hay sugerencias.</p>';return;}
    el.innerHTML=list.map(s=>`<div class="card" style="margin-bottom:1rem;border-left:4px solid ${s.leida?'#cbd5e0':'#4299e1'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem">
        <div>
          <span class="bdg ${s.role==='admin'?'bor':s.role==='profe'?'bbl':'bgr'}">${s.role}</span>
          <strong style="margin-left:.5rem">${s.nombre}</strong>
          <span style="font-size:.78rem;color:#718096;margin-left:.5rem">${s.colegioNombre||'—'}</span>
        </div>
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">
          <span style="font-size:.75rem;color:#718096">${(s.ts||'').slice(0,10)}</span>
          ${!s.leida?`<button class="btn bsm" onclick="marcarSugLeida('${s._id}')">✓ Leída</button>`:''}
          <button class="btn bsm" onclick="responderSug('${s._id}','${encodeURIComponent(s.nombre)}')">💬 Responder</button>
          <button class="btn bsm bdan" onclick="eliminarSug('${s._id}')">🗑️</button>
        </div>
      </div>
      ${s.titulo?`<div style="font-weight:700;margin:.5rem 0 .25rem"><span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria||'general'}</span> ${s.titulo}</div>`:`<div style="font-size:.8rem;color:#718096;margin:.25rem 0"><span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria||'general'}</span></div>`}
      <p style="color:#4a5568;margin:.25rem 0">${s.mensaje}</p>
      ${s.respuesta?`<div style="background:#f0fff4;border-radius:6px;padding:.5rem .75rem;margin-top:.5rem;font-size:.87rem"><strong>✅ Tu respuesta:</strong> ${s.respuesta}</div>`:''}
    </div>`).join('');
  }catch(e){el.innerHTML=`<p style="color:red">Error: ${e.message}</p>`;}
}
async function marcarSugLeida(id){
  try{await saApiFetch(`/api/sugerencias/${id}/leer`,{method:'PUT',body:JSON.stringify({})});loadSASug();}
  catch(e){sw('error',e.message);}
}
async function responderSug(id,nombreEnc){
  const nombre=decodeURIComponent(nombreEnc);
  const {value:resp}=await Swal.fire({
    title:`Responder a ${nombre}`,
    input:'textarea',inputPlaceholder:'Escribe tu respuesta…',
    showCancelButton:true,confirmButtonText:'Enviar',inputAttributes:{rows:4}
  });
  if(!resp) return;
  try{
    await saApiFetch(`/api/sugerencias/${id}/responder`,{method:'PUT',body:JSON.stringify({respuesta:resp})});
    sw('success','Respuesta enviada');
    loadSASug();
  }catch(e){sw('error',e.message);}
}
async function eliminarSug(id){
  const conf=await Swal.fire({title:'¿Eliminar sugerencia?',icon:'warning',showCancelButton:true,confirmButtonText:'Eliminar',confirmButtonColor:'#e53e3e'});
  if(!conf.isConfirmed) return;
  try{await saApiFetch(`/api/sugerencias/${id}`,{method:'DELETE'});loadSASug();}
  catch(e){sw('error',e.message);}
}

/* ─── SUGERENCIAS — admin/profe/est envían ──────────────── */
function pgSugerencias(){
  return`<div class="ph"><h2>💡 Sugerencias</h2><p>Envía sugerencias, comentarios o reportes al super administrador de la plataforma.</p></div>
  <div class="card">
    <div class="chd"><span class="cti">Nueva Sugerencia</span></div>
    <div class="fg">
      <div class="fld"><label>Título (opcional)</label><input id="sugTitulo" class="inp" placeholder="Resumen breve"></div>
      <div class="fld"><label>Categoría</label>
        <select id="sugCat" class="inp">
          <option value="general">General</option>
          <option value="academico">Académico</option>
          <option value="tecnico">Técnico</option>
          <option value="sugerencia">Sugerencia</option>
          <option value="felicitacion">Felicitación</option>
          <option value="queja">Queja</option>
        </select>
      </div>
    </div>
    <div class="fld"><label>Mensaje *</label>
      <textarea id="sugMensaje" rows="4" style="width:100%;resize:vertical;padding:10px;border:1px solid var(--bd);border-radius:8px;font-size:14px;font-family:inherit" placeholder="Describe tu sugerencia o comentario…"></textarea>
    </div>
    <button class="btn bg" onclick="enviarSugerencia()" style="margin-top:.5rem">📨 Enviar Sugerencia</button>
  </div>
  <div class="card" style="margin-top:1rem">
    <div class="chd"><span class="cti">Mis Sugerencias Enviadas</span></div>
    <div id="sugHistorial">Cargando…</div>
  </div>`;
}
async function initSugerencias(){
  await cargarMisSugerencias();
}
async function enviarSugerencia(){
  const titulo=(gi('sugTitulo')?.value||'').trim();
  const categoria=gi('sugCat')?.value||'general';
  const mensaje=(gi('sugMensaje')?.value||'').trim();
  if(!mensaje) return sw('warning','El mensaje es obligatorio');
  try{
    await apiFetch('/api/sugerencias',{method:'POST',body:JSON.stringify({titulo,categoria,mensaje})});
    sw('success','¡Sugerencia enviada correctamente!');
    if(gi('sugTitulo')) gi('sugTitulo').value='';
    if(gi('sugMensaje')) gi('sugMensaje').value='';
    await cargarMisSugerencias();
  }catch(e){sw('error',e.message);}
}
async function cargarMisSugerencias(){
  const cont=gi('sugHistorial');
  if(!cont) return;
  try{
    const list=await apiFetch('/api/sugerencias');
    if(!list||!list.length){cont.innerHTML='<p style="color:#999;text-align:center;padding:1rem">Aún no has enviado sugerencias.</p>';return;}
    cont.innerHTML=list.map(s=>`<div style="border-bottom:1px solid var(--bd);padding:.75rem 0">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.25rem">
        <span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria||'general'}</span>
        <span style="font-size:.75rem;color:#718096">${(s.ts||'').slice(0,10)}</span>
      </div>
      ${s.titulo?`<div style="font-weight:600;margin:.25rem 0">${s.titulo}</div>`:''}
      <p style="color:#4a5568;margin:.25rem 0;font-size:.9rem">${s.mensaje}</p>
      ${s.respuesta?`<div style="background:#f0fff4;border-radius:6px;padding:.4rem .6rem;margin-top:.35rem;font-size:.85rem;color:#276749"><strong>💬 Respuesta del Admin:</strong> ${s.respuesta}</div>`:'<div style="font-size:.78rem;color:#a0aec0;margin-top:.25rem">Pendiente de respuesta</div>'}
    </div>`).join('');
  }catch(e){cont.innerHTML=`<p style="color:red;font-size:.85rem">Error cargando sugerencias: ${e.message}</p>`;}
}

/* ─── Helper apiFetch para SuperAdmin (usa /api/ correcto) ─ */
async function saApiFetch(path,opts={}){
  const token=window.TokenStore?.get();
  if(!token){doLogout();throw new Error('Sin sesión activa');}
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  headers['Authorization']='Bearer '+token;
  let res;
  try{ res=await fetch(API_BASE+path,{...opts,headers}); }
  catch(e){ throw new Error('Error de red. Verifica tu conexión.'); }
  if(res.status===401){
    const d=await res.json().catch(()=>({}));
    if(d.expired||d.code==='TOKEN_EXPIRED'||d.code==='TOKEN_INVALID'){
      TokenStore.clear();doLogout();
      if(typeof Swal!=='undefined') Swal.fire({icon:'info',title:'Sesión expirada',text:'Vuelve a iniciar sesión.'});
      return null;
    }
    throw new Error(d.error||'No autorizado');
  }
  if(res.status===403){
    const d=await res.json().catch(()=>({}));
    throw new Error(d.error||'Acceso denegado');
  }
  if(!res.ok){
    const err=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
    throw new Error(err.error||`HTTP ${res.status}`);
  }
  return res.json();
}

/* ════════════════════════════════════════════════════════════════
   KEYBOARD & INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown',ev=>{
  if(ev.key==='Enter'&&!gi('ls').classList.contains('hidden')) doLogin();
});