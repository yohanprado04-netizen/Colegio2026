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
    areas:[],materiasDocs:[],
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
  /* Si getMats retorna vacío (estudiante nuevo sin materias aún),
     intentar con materias del salón directamente como fallback */
  const est=DB.ests.find(e=>e.id===eid);
  let matsEfectivas=mats;
  if(!matsEfectivas.length&&est?.salon){
    const salonMats=getSalonMats(est.salon);
    if(salonMats.length) matsEfectivas=salonMats;
    else if(cicloOf(est.salon)==='primaria') matsEfectivas=[...DB.mP];
    else matsEfectivas=[...DB.mB];
  }
  DB.pers.forEach(p=>{
    if(!DB.notas[eid][p]) DB.notas[eid][p]={};
    matsEfectivas.forEach(m=>{
      if(!DB.notas[eid][p][m]||typeof DB.notas[eid][p][m]!=='object')
        DB.notas[eid][p][m]={a:0,c:0,r:0};
    });
  });
}

/* ── Ordena DB.sals por número y luego por letra (ej: 1A,1B,2A,10A) ── */
function sortSals(){
  DB.sals.sort((a,b)=>{
    const parse=n=>{const m=n.match(/^(\d+)(.*)$/);return m?[parseInt(m[1],10),m[2].toUpperCase()]:[Infinity,n.toUpperCase()];};
    const [na,la]=parse(a.nombre);
    const [nb,lb]=parse(b.nombre);
    return na!==nb?na-nb:la.localeCompare(lb,'es');
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

/* Definitiva dinámica — usa DB.notaPct configurado por el superadmin por colegio */
function getNotaPct(){
  const p=DB.notaPct||{};
  const a=(p.a!=null?p.a:60)/100;
  const c=(p.c!=null?p.c:20)/100;
  const r=(p.r!=null?p.r:20)/100;
  return{a,c,r};
}
function def(t){const p=getNotaPct();return+((t.a||0)*p.a+(t.c||0)*p.c+(t.r||0)*p.r).toFixed(2);}
// fmt(n): 4.00→"4.0", 3.85→"3.85" — una decimal si termina en cero, dos si no
function fmt(n){if(n===null||n===undefined||isNaN(n))return'—';const s=n.toFixed(2);return s.endsWith('0')?n.toFixed(1):s;}

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
  // Una materia se considera "perdida" si:
  // - Tiene al menos un periodo con notas > 0 Y el promedio de esos periodos < 3
  // - O si NO tiene ninguna nota ingresada pero el periodo extraordinario está activo
  //   (el docente necesita poder enviarle el plan aunque no haya ingresado notas aún)
  return getMats(eid).filter(m=>{
    const act=DB.pers.filter(p=>{const t=DB.notas[eid]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length){
      // Sin notas: si el periodo extraordinario está activo, considerar perdida
      // para que el docente pueda enviar el plan de recuperación
      return DB.ext?.on===true;
    }
    return act.reduce((s,p)=>s+def(DB.notas[eid][p][m]),0)/act.length<3;
  });
}

/* ─── HELPERS DE ÁREAS ──────────────────────────────────────────────────────
   Las áreas agrupan materias. La definitiva del área = promedio de definitivas
   de sus materias. El año se gana/recupera/pierde según las ÁREAS, no materias.
   - 0 áreas perdidas → aprueba el año
   - 1-2 áreas perdidas → va a recuperación (de esas áreas / sus materias)
   - 3+ áreas perdidas → pierde el año
   Si NO hay áreas configuradas, se evalúa materia por materia (compatibilidad).
*/

// Retorna las áreas del colegio para un ciclo dado
function getAreasDelColegio(ciclo){
  return (DB.areas||[]).filter(a=>a.ciclo===ciclo);
}

// Retorna el mapa { areaNombre: [materia1, materia2, ...] } para un estudiante
// Solo incluye las áreas asignadas al salón (DB.salAreas[salon]).
// Si el salón no tiene áreas asignadas, usa todas las áreas del ciclo.
// Las materias sin área quedan en '_sinArea'.
function getAreaMatsMap(eid){
  const mats = getMats(eid);
  const e = DB.ests.find(x=>x.id===eid);
  const ciclo = cicloOf(e?.salon||'');
  const matDocs = DB.materiasDocs||[];

  // Áreas asignadas al salón; si el salón no tiene áreas propias, no heredar globales
  const areasEnSalon = (DB.salAreas||{})[e?.salon||''] || [];
  const areasAplicables = areasEnSalon; // solo las del salón, nunca las globales

  if(!areasAplicables.length) return { '_sinArea': mats };
  const map = {};
  areasAplicables.forEach(nombre=>{ map[nombre]=[]; });

  mats.forEach(m=>{
    const doc = matDocs.find(d=>d.nombre===m && d.ciclo===ciclo);
    const areaNombre = doc?.areaNombre||'';
    if(areaNombre && map[areaNombre]!==undefined){
      map[areaNombre].push(m);
    } else {
      if(!map['_sinArea']) map['_sinArea']=[];
      map['_sinArea'].push(m);
    }
  });
  return map;
}

// Definitiva de un área para un estudiante en periodos activos (promedio de mats del área)
function defArea(eid, areaNombre, mats){
  // mats: array de materias del área
  const periodos = DB.pers||[];
  if(!mats||!mats.length) return 0;
  // Calcular definitiva de cada materia (promedio de todos los periodos con datos)
  const defsAct = mats.map(m=>{
    const act=periodos.filter(p=>{const t=DB.notas[eid]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length) return 0;
    return act.reduce((s,p)=>s+def(DB.notas[eid][p][m]),0)/act.length;
  }).filter(d=>d>0);
  if(!defsAct.length) return 0;
  return+(defsAct.reduce((s,v)=>s+v,0)/defsAct.length).toFixed(2);
}

// Áreas perdidas del año (definitiva de área < 3)
function areasPerdidasAnio(eid){
  const map = getAreaMatsMap(eid);
  const tieneAreas = Object.keys(map).filter(k=>k!=='_sinArea').length>0;
  if(!tieneAreas){
    // Sin áreas configuradas: usar lógica de materias (compatibilidad)
    return null;
  }
  const perdidas=[];
  Object.entries(map).forEach(([areaNombre, mats])=>{
    if(areaNombre==='_sinArea') return;
    if(!mats.length) return;
    const d = defArea(eid, areaNombre, mats);
    if(d>0 && d<3) perdidas.push({areaNombre, def:d, mats});
  });
  return perdidas;
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

/* ── clampNota: limita y sanitiza inputs de notas en tiempo real ── */
function clampNota(inp){
  // Los inputs type="number" ya bloquean letras nativamente.
  // Solo corregimos si el valor es > 5 o < 0 para no interferir mientras el usuario escribe.
  const raw = inp.value;
  if(raw === '' || raw === '.' || raw === '0.' || raw.endsWith('.')) return; // está escribiendo, no interrumpir
  const v = parseFloat(raw);
  if(isNaN(v)) return; // vacío o inválido: saveTri lo manejará al hacer onchange
  if(v > 5){ inp.value = '5.0'; }
  else if(v < 0){ inp.value = '0.0'; }
}

/**
 * necesitaPara(eid, mat):
 * Dado un estudiante y una materia, calcula la nota mínima que necesita
 * en los periodos faltantes (sin notas) para obtener promedio >= 3.0
 * considerando los 4 periodos configurados.
 * Retorna {necesita: number|null, periodosRestantes: number, promActual: number}
 */
function necesitaPara(eid, mat){
  const pers=DB.pers||[];
  if(!pers.length) return null;
  const total=pers.length;
  // Periodos con notas ingresadas (al menos un valor > 0)
  const conNota=pers.filter(p=>{const t=DB.notas[eid]?.[p]?.[mat];return t&&(t.a>0||t.c>0||t.r>0);});
  const sinNota=pers.filter(p=>{const t=DB.notas[eid]?.[p]?.[mat];return !t||(t.a===0&&t.c===0&&t.r===0);});
  const restantes=sinNota.length;
  if(restantes===0) return null; // ya tiene todos los periodos
  // Suma de definitivas actuales
  const sumaActual=pers.reduce((s,p)=>{
    const t=DB.notas[eid]?.[p]?.[mat]||{a:0,c:0,r:0};
    return s+def(t);
  },0);
  const promActual=total>0?sumaActual/total:0;
  // Nota necesaria en cada periodo restante para que el promedio final sea >= 3.0
  // sumaActual + restantes * x  >= 3.0 * total  → x >= (3*total - sumaActual) / restantes
  const necesita=(3*total - sumaActual)/restantes;
  return{necesita:Math.min(Math.max(necesita,0),5), restantes, promActual:+promActual.toFixed(2)};
}

/**
 * necesitaParaEst(eid):
 * Retorna array de {mat, necesita, restantes, promActual} para cada materia
 * donde el estudiante aún puede mejorar (tiene periodos pendientes y podría estar en riesgo).
 */
function necesitaParaEst(eid){
  return getMats(eid).map(mat=>{
    const r=necesitaPara(eid,mat);
    return r?{mat,...r}:null;
  }).filter(Boolean).filter(x=>x.restantes>0);
}

/**
 * necesitaParaPeriodos(eid):
 * Calcula SECUENCIALMENTE para cada periodo pendiente qué nota mínima promedio
 * necesita el estudiante en ESE periodo específico, basándose en lo que ya tiene
 * hasta ese punto (periodos anteriores con notas reales + proyección de los anteriores pendientes).
 *
 * Lógica: para el periodo pendiente N, asume que en los pendientes anteriores
 * sacó exactamente la nota mínima calculada (proyección optimista).
 * Retorna array de {per, necesita, matsEnRiesgo, matsTotales, posible, matsImpCount}
 */
function necesitaParaPeriodos(eid){
  const pers = DB.pers || [];
  const mats = getMats(eid);
  if(!pers.length || !mats.length) return [];

  const total = pers.length;

  // Separar periodos con notas vs pendientes (sin ninguna nota en ninguna materia)
  const tienNota = p => mats.some(m => { const t=DB.notas[eid]?.[p]?.[m]; return t&&(t.a>0||t.c>0||t.r>0); });
  const periodosPendientes = pers.filter(p => !tienNota(p));
  if(!periodosPendientes.length) return [];

  // Construir simulación: notas reales para periodos con datos, proyectadas para los pendientes anteriores
  // simNotas[p][m] = nota definitiva simulada
  const simNotas = {};
  pers.forEach(p => {
    simNotas[p] = {};
    mats.forEach(m => {
      const t = DB.notas[eid]?.[p]?.[m]||{a:0,c:0,r:0};
      simNotas[p][m] = def(t); // 0 si no tiene nota
    });
  });

  const resultado = [];

  periodosPendientes.forEach((perAct, idx) => {
    const restantes = periodosPendientes.length - idx; // este + los que vienen

    // Para cada materia: calcular nota mínima necesaria en este periodo y los siguientes
    const porMat = mats.map(m => {
      // Suma de notas simuladas hasta ANTES de este periodo pendiente
      const sumaAntes = pers.reduce((s, p) => {
        if(p === perAct) return s; // no contar el periodo actual
        // Si es un pendiente ANTERIOR a este en la lista, ya lo simulamos con su mínima
        return s + (simNotas[p][m] || 0);
      }, 0);
      // Nota necesaria: (3*total - sumaAntes) / restantes
      const n = (3 * total - sumaAntes) / restantes;
      return { mat: m, necesita: n, posible: n <= 5 };
    });

    // Materias en riesgo: promedio simulado actual < 3
    const matsRiesgo = porMat.filter(x => {
      const sumaSimulada = pers.reduce((s,p) => s + (simNotas[p][x.mat]||0), 0);
      return (sumaSimulada / total) < 3;
    });

    const hayImposible = matsRiesgo.some(x => x.necesita > 5);
    const matsImpCount = matsRiesgo.filter(x => x.necesita > 5).length;
    const necesitaArr = matsRiesgo.filter(x => x.necesita <= 5).map(x => x.necesita);
    const necesitaProm = necesitaArr.length
      ? necesitaArr.reduce((s,v)=>s+v,0) / necesitaArr.length
      : 0;
    const notaEste = +Math.min(Math.max(necesitaProm, 0), 5).toFixed(2);

    resultado.push({
      per: perAct,
      necesita: notaEste,
      matsEnRiesgo: matsRiesgo.length,
      matsTotales: mats.length,
      posible: !hayImposible,
      matsImpCount
    });

    // Simular que en este periodo sacó exactamente la nota mínima (para calcular los siguientes)
    mats.forEach(m => {
      const minEste = porMat.find(x=>x.mat===m);
      const val = minEste ? Math.min(Math.max(minEste.necesita, 0), 5) : 0;
      simNotas[perAct][m] = val;
    });
  });

  return resultado;
}

/**
 * veredictoAnual(eid):
 * Con todos los periodos completos, calcula el veredicto final del año.
 * Retorna {
 *   completo: bool,           // true si todos los periodos tienen notas
 *   matsPerdidasFinal: [],    // materias con promedio < 3 en los 4 periodos
 *   matsGanadasFinal: [],     // materias aprobadas
 *   resultado: 'gana'|'recupera'|'pierde',
 *   mensaje: string
 * }
 */
function veredictoAnual(eid){
  const pers = DB.pers || [];
  const mats = getMats(eid);
  if(!pers.length || !mats.length) return null;

  const tienNota = p => mats.some(m => { const t=DB.notas[eid]?.[p]?.[m]; return t&&(t.a>0||t.c>0||t.r>0); });
  const completo = pers.every(tienNota);

  // Calcular definitiva por materia promediando todos los periodos
  const resMateria = mats.map(m => {
    const defs = pers.map(p => def(DB.notas[eid]?.[p]?.[m]||{a:0,c:0,r:0}));
    const prom = defs.reduce((s,v)=>s+v,0) / pers.length;
    return { mat: m, prom: +prom.toFixed(2), gana: prom >= 3 };
  });

  // ── Evaluación por ÁREAS (si hay áreas configuradas) ──────────────────────
  const areaMap = getAreaMatsMap(eid);
  const tieneAreas = Object.keys(areaMap).filter(k=>k!=='_sinArea').length > 0;

  let resultado, mensaje, resAreas=null;

  if(tieneAreas){
    // Calcular definitiva y estado de cada área
    resAreas = Object.entries(areaMap)
      .filter(([k])=>k!=='_sinArea')
      .map(([areaNombre, matsArea])=>{
        if(!matsArea.length) return null;
        // Promedio de definitivas de materias del área (todos los periodos)
        const defsArea = matsArea.map(m=>{
          const defs2 = pers.map(p=>def(DB.notas[eid]?.[p]?.[m]||{a:0,c:0,r:0}));
          return defs2.reduce((s,v)=>s+v,0)/pers.length;
        });
        const promArea = defsArea.reduce((s,v)=>s+v,0)/defsArea.length;
        return { areaNombre, prom:+promArea.toFixed(2), gana: promArea>=3, mats:matsArea, defsArea };
      }).filter(Boolean);

    const areasLost = resAreas.filter(a=>!a.gana);
    const matsSinArea = areaMap['_sinArea']||[];
    // Materias sin área se evalúan individualmente
    const matsSinAreaPerd = resMateria.filter(x=>matsSinArea.includes(x.mat)&&!x.gana);

    if(areasLost.length===0 && matsSinAreaPerd.length===0){
      resultado='gana';
      mensaje='🎉 Aprueba el año. Ganó todas las áreas.';
    } else if(areasLost.length<=2 && (areasLost.length+matsSinAreaPerd.length)<=2){
      resultado='recupera';
      const nombresArea=areasLost.map(a=>a.areaNombre);
      const nombresMat=matsSinAreaPerd.map(x=>x.mat);
      const todos=[...nombresArea,...nombresMat];
      mensaje=`⚠️ Va a recuperación. Perdió ${todos.length} área${todos.length>1?'s':''}: ${todos.join(', ')}.`;
    } else {
      resultado='pierde';
      const nombresArea=areasLost.map(a=>a.areaNombre);
      mensaje=`❌ Pierde el año. Perdió ${areasLost.length} área${areasLost.length>1?'s':''}: ${nombresArea.join(', ')}.`;
    }
  } else {
    // Sin áreas: lógica original por materias
    const matsPerdidasFinal = resMateria.filter(x => !x.gana);
    if(matsPerdidasFinal.length===0){
      resultado='gana'; mensaje='🎉 Aprueba el año. Ganó todas las materias.';
    } else if(matsPerdidasFinal.length<=2){
      resultado='recupera';
      mensaje=`⚠️ Va a recuperación. Perdió ${matsPerdidasFinal.length} materia${matsPerdidasFinal.length>1?'s':''}: ${matsPerdidasFinal.map(x=>x.mat).join(', ')}.`;
    } else {
      resultado='pierde';
      mensaje=`❌ Pierde el año. Perdió ${matsPerdidasFinal.length} materias: ${resMateria.filter(x=>!x.gana).map(x=>x.mat).join(', ')}.`;
    }
  }

  return { completo, resMateria, resAreas, tieneAreas, resultado, mensaje,
    matsPerdidasFinal: resMateria.filter(x=>!x.gana),
    matsGanadasFinal:  resMateria.filter(x=>x.gana) };
}

// Categoría de disciplina numérica
function discLabel(n){
  n=+n;
  if(isNaN(n)||n===0) return '—';
  if(n>=4.5) return 'Excelente';
  if(n>=4.0) return 'Bueno';
  if(n>=3.0) return 'Básico';
  return 'Bajo';
}

// Siguiente salón en la progresión
function siguienteSalon(salon){
  if(!salon) return null;
  // Extraer número y sufijo: "1A" → num=1, suf="A"
  const m=salon.match(/^(\d+)([A-Z]*)$/i);
  if(!m) return null;
  const num=parseInt(m[1]);
  const suf=(m[2]||'A').toUpperCase();
  const siguiente=num+1;
  // 11x → graduado (eliminar)
  if(num>=11) return 'GRADUADO';
  // 5x primaria → 6x bachillerato
  const nombreSig=`${siguiente}${suf}`;
  return nombreSig;
}

// Materias perdidas en el año completo (promedio todos los periodos < 3)
// Si el estudiante no tiene NINGUNA nota en TODO el año → se considera sin datos
// y NO puede ser promovido ni reprobado hasta que el admin decida manualmente.
function matPerdAnio(eid){
  const mats=getMats(eid);
  // Verificar si el estudiante tiene alguna nota en el año
  const tienAlgunaNota=mats.some(m=>
    DB.pers.some(p=>{const t=DB.notas[eid]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);})
  );
  if(!tienAlgunaNota) return []; // Sin datos: no pierde ni pasa → debe revisarse manualmente
  return mats.filter(m=>{
    const act=DB.pers.filter(p=>{const t=DB.notas[eid]?.[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length) return false; // sin notas en esta materia específica → no perdida
    const prom=act.reduce((s,p)=>s+def(DB.notas[eid][p][m]),0)/act.length;
    return prom<3;
  });
}

/* ── SOBREESCRITA por api-layer.js ── */
async function eliminarTodosEsts(ciclo){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function promoverEstudiantes(ciclo){ /* implementado en api-layer.js */ }
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
  /* DB.profs ya viene filtrado por colegioId desde el servidor.
     Bach: primero buscar en salonMaterias[salon], luego materias globales */
  const bp=DB.profs.find(p=>{
    if(p.ciclo!=='bachillerato') return false;
    if(!(p.salones||[]).includes(salon)) return false;
    const sm=(p.salonMaterias||{})[salon];
    if(sm&&sm.length) return sm.includes(mat);
    // Fallback: si no tiene salonMaterias configurado pero tiene la materia en su lista global
    return(p.materias||[]).includes(mat);
  });
  if(bp) return bp;
  /* Primaria: cualquier prof asignado al salón */
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
      value="${f.val||''}" placeholder="${f.ph||f.lb}"
      style="margin:0;width:100%;box-sizing:border-box;height:38px;font-size:13px" ${f.attr||''}>
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
  superadmin:new Set(['sadash','sacolegios','saestadisticas','saauditoria','samantenimiento','sasug','sacom']),
  admin:new Set(['dash','asal','apri','abac','aprf','amat','anot','areh','afec','ablk','aaud','aexp','aexc','avcl','ahist','asug','acom']),
  profe:new Set(['ph','pnot','past','pvir','ptar','prec','phist','psug','pcom']),
  est:new Set(['eb','east','etare','eexc','eprof','evir','ereh','ehist','esug','eicfes','ecom'])
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
  sacom:'Comunicados Globales',
  saestadisticas:'Estadísticas Globales', saauditoria:'Auditoría Global',
  samantenimiento:'Mantenimiento', sasug:'Sugerencias Recibidas',
  dash:'Panel General',asal:'Salones & Grados',apri:'Primaria (1°-5°)',abac:'Bachillerato (6°-11°)',
  aprf:'Profesores',amat:'Materias & Periodos',anot:'Gestión de Notas',areh:'Recuperaciones',
  afec:'Control de Fechas',ablk:'Usuarios Bloqueados',aaud:'Auditoría',aexp:'Exportar',ahist:'Historial Estudiantes',
  aexc:'Excusas (Admin)',avcl:'Clases Virtuales (Admin)',acom:'Comunicados',pcom:'Comunicados',ecom:'Comunicados',asug:'Sugerencias',
  ph:'Mi Panel',pnot:'Ingresar Notas',past:'Asistencias',pvir:'Clases Virtuales',ptar:'Tareas Recibidas',prec:'Recuperaciones',phist:'Historial Recuperaciones',psug:'Sugerencias',
  eb:'Mi Boletín',east:'Mi Asistencia',etare:'Tareas & Talleres',
  eexc:'Excusas',eprof:'Mis Profesores',ereh:'Mi Recuperación',evir:'Mis Clases Virtuales',
  ehist:'Historial Recuperaciones',esug:'Sugerencias'
};


/* ============================================================
   COMUNICADOS — mostrar al hacer login (profe y estudiante)
============================================================ */
function mostrarComunicadosLogin(){
  const role=CU?.role;
  /* Mostrar a profe, est Y admin (admin recibe comunicados del superadmin) */
  if(role!=='profe'&&role!=='est'&&role!=='admin') return;
  const hoy=today();
  /* Para admin: solo mostrar los comunicados del superadmin (esSuperAdmin),
     ya que los propios los gestiona él mismo y no necesita popup de aviso */
  const coms=(DB.comunicados||[]).filter(c=>{
    if(!c.activo) return false;
    if(c.fechaFin<hoy||c.fechaInicio>hoy) return false;
    if(role==='admin'){
      /* Al admin solo le mostramos los del superadmin */
      if(!c.esSuperAdmin) return false;
      return c.para==='todos'||c.para==='admin';
    }
    if(c.para==='todos') return true;
    return c.para===role;
  });
  if(!coms.length) return;

  const colorMap={
    azul:  {hdr:'#2b6cb0',bg:'#ebf8ff',icon:'🔵'},
    verde: {hdr:'#276749',bg:'#f0fff4',icon:'🟢'},
    naranja:{hdr:'#c05621',bg:'#fffaf0',icon:'🟠'},
    rojo:  {hdr:'#c53030',bg:'#fff5f5',icon:'🔴'},
    morado:{hdr:'#553c9a',bg:'#faf5ff',icon:'🟣'},
  };

  const htmlComs=coms.map(c=>{
    const cs=colorMap[c.color]||colorMap.azul;
    return`<div style="background:${cs.bg};border-left:4px solid ${cs.hdr};border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:12px;text-align:left">
      <div style="font-weight:800;font-size:15px;color:${cs.hdr};margin-bottom:6px">${cs.icon} ${esc(c.titulo)}${c.esSuperAdmin?` <span style="font-size:10px;background:#553c9a;color:#fff;border-radius:4px;padding:1px 6px;vertical-align:middle;font-weight:600">🌐 Plataforma</span>`:''}</div>
      <div style="font-size:13px;color:#2d3748;white-space:pre-line;line-height:1.7">${esc(c.mensaje)}</div>
      <div style="font-size:10px;color:#718096;margin-top:8px">Válido hasta: ${c.fechaFin}</div>
    </div>`;
  }).join('');

  const titulo = role==='admin' ? '📢 Comunicado de la Plataforma' : '📢 Comunicados del Colegio';

  Swal.fire({
    title: titulo,
    html:`<div style="max-height:65vh;overflow-y:auto;padding-right:4px;margin-top:8px">${htmlComs}</div>`,
    confirmButtonText:'Entendido ✓',
    confirmButtonColor:'#2b6cb0',
    width:'min(620px,95vw)',
    showClass:{popup:'swal2-show'},
  });
}

function bootApp(){
  if(!CU||!CU.role){console.error('[bootApp] CU no disponible');return;}
  if(!DB) DB={dr:{s:'',e:''},drPer:{},ext:{on:false,s:'',e:''},pers:[],mP:[],mB:[],sals:[],profs:[],ests:[],notas:{},asist:{},exc:[],vclases:[],recs:[],planes:[],histRecs:[],histPlanes:[],audit:[],blk:{},ups:{},areas:[],materiasDocs:[]};
  const _tbDate=gi('tbDate');
  if(_tbDate) _tbDate.textContent=new Date().toLocaleDateString('es-CO',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
  const st=gi('tbStatus');
  if(st){
    if(notasOk()){st.className='tbst tbop';st.textContent='✓ Notas Abiertas';}
    else{st.className='tbst tbcl';st.textContent='✗ Notas Cerradas';}
  }
  const _sbUser=gi('sbUser');
  if(_sbUser) _sbUser.innerHTML=`<div class="sbav">${(CU.nombre||'?')[0].toUpperCase()}</div>
  <div>
    <div class="sbun">${CU.nombre}</div>
    <div class="sbur">${CU.role==='superadmin'?'Super Admin':(CU.colegioNombre?CU.colegioNombre+' · '+CU.role:CU.role)}</div>
  </div>`;
  buildNav();
  /* ── Mostrar logo en sidebar — robusto contra fugas entre roles ── */
  const _sbLogo   = gi('sbLogoBox');
  const _sbNombre = gi('sbColegioNombre');
  const _sbSub    = gi('sbColegioSub'); // puede no existir, no es crítico
  /* SVG "E" canónico del superadmin — siempre restaurado cuando aplica */
  const _EDUSISTEMA_SVG = `<svg width="22" height="22" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="41" width="56" height="56" rx="14" transform="rotate(-45 1 41)" fill="url(#sblg1sa)"/>
    <text x="41" y="41" text-anchor="middle" dominant-baseline="central" font-family="'Outfit',sans-serif" font-size="38" font-weight="800" fill="#ffffff">E</text>
    <defs>
      <linearGradient id="sblg1sa" x1="0" y1="0" x2="82" y2="82" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#0ea5a0"/>
        <stop offset="100%" stop-color="#1e40af"/>
      </linearGradient>
    </defs>
  </svg>`;
  if(CU.role === 'superadmin'){
    /* Siempre forzar el SVG "E" — nunca dejar logo de colegio */
    if(_sbLogo)   _sbLogo.innerHTML = _EDUSISTEMA_SVG;
    if(_sbNombre) _sbNombre.textContent = 'EduSistema';
  } else {
    /* Para otros roles: mostrar logo del colegio si existe, si no el SVG "E" */
    if(_sbLogo){
      if(DB.colegioLogo){
        _sbLogo.innerHTML = `<img src="${DB.colegioLogo}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;background:rgba(255,255,255,.12);padding:3px" alt="Logo">`;
      } else {
        _sbLogo.innerHTML = _EDUSISTEMA_SVG;
      }
    }
    if(_sbNombre) _sbNombre.textContent = CU.colegioNombre || 'EduSistema';
  }
  goto(defPg());
  /* Mostrar comunicados activos al iniciar sesión */
  setTimeout(mostrarComunicadosLogin, 600);
  /* Notify student about extraordinary period changes */
  if(CU.role==='est') notifyExtPeriod();
  /* Notify student about unread excusa replies */
  if(CU.role==='est') setTimeout(notifRespuestasExcusas, 800);
}
/* Notifica al estudiante si tiene respuestas de excusas no leídas */
async function notifRespuestasExcusas(){
  try {
    // Fetch fresco para no depender del estado en memoria al login
    const fresh = await apiFetch('/api/excusas').catch(()=>null);
    if(Array.isArray(fresh)) DB.exc = fresh;
    const misExcusas=(DB.exc||[]).filter(x=>x.estId===CU.id||x.eid===CU.id);
    const noLeidas=misExcusas.filter(x=>x.respProf&&!x.respLeida);
    if(!noLeidas.length) return;
    await Swal.fire({
      icon:'info',
      title:`📩 Tienes ${noLeidas.length} respuesta${noLeidas.length>1?'s':''} de excusa${noLeidas.length>1?'s':''} sin leer`,
      html:`<div style="font-family:var(--fn);text-align:left">
        ${noLeidas.map(x=>`
          <div style="background:#e6fffa;border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid #9ae6b4">
            <div style="font-size:12px;font-weight:700;color:#276749">📩 ${x.respProfNombre||'Tu profesor'} respondió tu excusa del ${x.fecha}</div>
            <div style="font-size:13px;margin-top:4px">${x.respProf}</div>
            ${x.diasExtra>0?`<div style="font-size:12px;margin-top:4px">⏰ <strong>Tiempo extra:</strong> ${x.diasExtra} día(s) — Límite: ${x.fechaLimite||'—'}</div>`:''}
          </div>`).join('')}
        <div style="background:#fffbeb;border:1.5px solid #f6ad55;border-radius:8px;padding:10px;margin-top:8px;font-size:12px;font-weight:700;color:#c05621">
          ⚠️ Debes enviar el trabajo en <strong>Talleres y Tareas</strong> dentro del tiempo estipulado. Después de la fecha límite <strong>no se calificará</strong>.
        </div>
      </div>`,
      confirmButtonText:'📬 Ver mis excusas',
      confirmButtonColor:'#2b6cb0',
      showCancelButton:true,
      cancelButtonText:'Cerrar'
    }).then(r=>{ if(r.isConfirmed) goto('eexc'); });
  } catch(err) { console.warn('notifRespuestasExcusas error:', err); }
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
    {s:'Supervisión'},{id:'saestadisticas',ic:'📊',lb:'Estadísticas'},
    {id:'saauditoria',ic:'🔍',lb:'Auditoría Global'},
    {s:'Comunicación'},{id:'sacom',ic:'📢',lb:'Comunicados Globales'},
    {s:'Sistema'},{id:'samantenimiento',ic:'⚙️',lb:'Mantenimiento'},
    {id:'sasug',ic:'💡',lb:'Sugerencias Recibidas'},
  ];

  if(CU.role==='admin') return[
    {s:'Principal'},{id:'dash',ic:'📊',lb:'Panel General'},
    {s:'Académico'},{id:'asal',ic:'🏫',lb:'Salones & Grados'},
    {id:'apri',ic:'📚',lb:'Primaria (1°-5°)'},{id:'abac',ic:'🎓',lb:'Bachillerato (6°-11°)'},
    {id:'aprf',ic:'👩‍🏫',lb:'Profesores'},{id:'amat',ic:'📖',lb:'Materias & Periodos'},
    {s:'Notas'},{id:'anot',ic:'📝',lb:'Gestión de Notas'},{id:'areh',ic:'🔄',lb:'Recuperaciones'},
    {s:'Comunicación'},{id:'acom',ic:'📢',lb:'Comunicados'},{id:'aexc',ic:'✉️',lb:'Excusas'},{id:'avcl',ic:'💻',lb:'Clases Virtuales'},
    {s:'Sistema'},{id:'afec',ic:'📅',lb:'Control de Fechas'},
    {id:'ablk',ic:'🔒',lb:'Usuarios Bloqueados'},
    {id:'aaud',ic:'🔍',lb:'Auditoría'},{id:'aexp',ic:'📤',lb:'Exportar'},{id:'ahist',ic:'📚',lb:'Historial'},
    {s:'Comunicación Extra'},{id:'asug',ic:'💡',lb:'Sugerencias'},
  ];
  if(CU.role==='profe') return[
    {s:'Mi Panel'},{id:'ph',ic:'🏠',lb:'Inicio'},
    {id:'pcom',ic:'📢',lb:'Comunicados'},
    {id:'pnot',ic:'📝',lb:'Ingresar Notas'},{id:'past',ic:'✅',lb:'Asistencias'},
    {id:'pvir',ic:'💻',lb:'Clases Virtuales'},
    {id:'ptar',ic:'📂',lb:'Tareas Recibidas'},
    {id:'prec',ic:'🔄',lb:'Recuperaciones'},
    {id:'phist',ic:'📚',lb:'Historial Recuperaciones'},
    {id:'psug',ic:'💡',lb:'Sugerencias'},
  ];
  /* estudiante */
  const it=[
    {s:'Comunicados'},{id:'ecom',ic:'📢',lb:'Comunicados'},
    {s:'Mi Perfil'},{id:'eb',ic:'📋',lb:'Mi Boletín'},{id:'east',ic:'✅',lb:'Mi Asistencia'},
    {id:'etare',ic:'📎',lb:'Tareas & Talleres'},{id:'eexc',ic:'✉️',lb:'Excusas'},
    {id:'eprof',ic:'👩‍🏫',lb:'Mis Profesores'},{id:'evir',ic:'💻',lb:'Mis Clases Virtuales'},
    {id:'ehist',ic:'📚',lb:'Historial Recuperaciones'},
    {id:'esug',ic:'💡',lb:'Sugerencias'},
  ];
  // Simulacro ICFES solo para bachillerato
  if(cicloOf(CU.salon)==='bachillerato') it.push({id:'eicfes',ic:'🎯',lb:'Simulacro ICFES'});
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
      b.onclick=()=>goto(it.id);b.dataset.id=it.id;nav.appendChild(b);
    }
  });

  // Badge de comunicados en el menú para profe/est/admin
  if((CU.role==='profe'||CU.role==='est'||CU.role==='admin')){
    const hoy=today();
    const comKey=CU.role==='profe'?'pcom':CU.role==='est'?'ecom':'acom';
    const nComs=(DB.comunicados||[]).filter(c=>{
      if(!c.activo) return false;
      if(c.fechaFin<hoy||c.fechaInicio>hoy) return false;
      if(CU.role==='admin'){
        /* Admin solo ve badge por comunicados del superadmin */
        if(!c.esSuperAdmin) return false;
        return c.para==='todos'||c.para==='admin';
      }
      return c.para==='todos'||c.para===CU.role;
    }).length;
    if(nComs>0){
      const comBtn=document.querySelector(`[data-id="${comKey}"]`)||
        Array.from(document.querySelectorAll('.nav-btn,button')).find(b=>b.onclick&&b.onclick.toString().includes(comKey));
      if(comBtn&&!comBtn.querySelector('.com-badge')){
        const badge=document.createElement('span');
        badge.className='com-badge';
        badge.style.cssText='display:inline-flex;align-items:center;justify-content:center;background:#e53e3e;color:#fff;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:800;margin-left:6px;min-width:18px';
        badge.textContent=nComs;
        comBtn.appendChild(badge);
      }
    }
  }

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
    ablk:pgABlk,aaud:pgAAud,aexp:pgAExp,aexc:pgAExc,avcl:pgAVcl,ahist:pgAHist,acom:pgACom,pcom:pgComVer,ecom:pgComVer,
    ph:pgPH,pnot:pgPNot,past:pgPAst,pvir:pgPVir,ptar:pgPTar,prec:pgPRec,phist:pgPHist,
    eb:pgEB,east:pgEAst,etare:pgETare,eexc:pgEExc,eprof:pgEProf,
    evir:pgEVir,ereh:pgEReh,ehist:pgEHist,eicfes:pgEIcfes,
    sadash:pgSADash,sacolegios:pgSAColegios,saplan:pgSAPlan,sacom:pgSACom,
    saestadisticas:pgSAEstadisticas,saauditoria:pgSAAuditoria,samantenimiento:pgSAMantenimiento,
    sasug:pgSASug,
    asug:pgSugerencias,psug:pgSugerencias,esug:pgSugerencias,
  };
  return(map[pid]||(() =>'<div class="card"><p>No disponible.</p></div>'))();
}
function initPg(pid){
  const map={
    dash:initDash,asal:initASal,apri:()=>initAEst('primaria'),abac:()=>initAEst('bachillerato'),
    aprf:initAPrf,amat:initAMat,anot:initANot,areh:initAReh,aexc:initAExc,avcl:initAVcl,acom:initACom,pcom:initComVer,ecom:initComVer,
    pnot:initPNot,past:initPAst,eb:initEB,eicfes:initEIcfes,
    ph:()=>{ setTimeout(()=>{ renderPExcR(); notifNuevasExcusas(); },0); },
    sadash:initSADash,sacolegios:initSAColegios,saplan:initSAPlan,sacom:initSACom,
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
  const _logoD = DB.colegioLogo||'';
  const _nomD  = CU.colegioNombre||'';
  return`<div class="ph" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
    <div>
      <h2>Panel General</h2><p>Resumen del sistema</p>
      <button class="btn xs bg" onclick="showHelp('dash')" style="margin-top:6px">❓ Ayuda</button>
    </div>
    ${_logoD ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <img src="${_logoD}" alt="Logo" style="height:72px;width:auto;max-width:130px;object-fit:contain;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.13);background:var(--bg2);padding:6px">
      ${_nomD ? `<span style="font-size:11px;font-weight:700;color:var(--sl2);text-align:center;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_nomD}</span>` : ''}
    </div>` : ''}
  </div>
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
  return`<div class="ph"><h2>Salones & Grados</h2><button class="btn xs bg" onclick="showHelp('asal')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="card">
    <div class="chd"><span class="cti">➕ Nuevo Salón</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:16px;align-items:end">
      <div class="fld" style="margin:0">
        <label>Nombre del salón (ej: 6A)</label>
        <input id="nsn" placeholder="6A" style="font-size:15px;padding:13px 16px;font-weight:700">
      </div>
      <div class="fld" style="margin:0">
        <label>Ciclo</label>
        <select id="nsc" style="font-size:14px;padding:13px 16px">
          <option value="primaria">Primaria (1°–5°)</option>
          <option value="bachillerato">Bachillerato (6°–11°)</option>
        </select>
      </div>
      <div class="fld" style="margin:0">
        <label>Jornada</label>
        <select id="nsj" style="font-size:14px;padding:13px 16px">
          <option value="">Sin especificar</option>
          <option value="mañana">Mañana</option>
          <option value="tarde">Tarde</option>
          <option value="noche">Noche</option>
        </select>
      </div>
      <button class="btn bn" onclick="addSal()" style="padding:13px 28px;font-size:15px;font-weight:800;white-space:nowrap;height:48px">
        ➕ Agregar Salón
      </button>
    </div>
  </div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">📚 Primaria</span></div><div id="slP"></div></div>
    <div class="card"><div class="chd"><span class="cti">🎓 Bachillerato</span></div><div id="slB"></div></div>
  </div>`;
}
function initASal(){
  // Reload DB para asegurar que salones son solo del colegio actual
  if(typeof dbLoad==='function') dbLoad().catch(()=>{}).finally(()=>renderSals());
  else renderSals();
}
function renderSals(){
  ['primaria','bachillerato'].forEach(c=>{
    const el=gi(c==='primaria'?'slP':'slB');if(!el) return;
    const list=DB.sals.filter(s=>s.ciclo===c);
    if(!list.length){el.innerHTML='<div class="mty" style="padding:20px"><div class="ei">🏫</div><p>Sin salones</p></div>';return;}
    // Áreas configuradas para este ciclo
    const areasDelCiclo=(DB.areas||[]).filter(a=>a.ciclo===c);
    const matDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo===c);
    el.innerHTML=list.map(s=>{
      const nMats=s.mats&&s.mats.length;
      const dfMats=c==='primaria'?DB.mP:DB.mB;
      const matsLabel=nMats
        ?`<span class="bdg bgr" style="font-size:10px">🎯 ${s.mats.length} materias propias</span>`
        :`<span class="bdg bgy" style="font-size:10px">${dfMats.length} materias (${c==='primaria'?'global primaria':'global bach.'})</span>`;
      const matsList=nMats?s.mats:dfMats;

      // Áreas asignadas a este salón (las que tienen al menos una materia del salón)
      const areasDelSalon=(DB.salAreas||{})[s.nombre]||[];
      const hayAreas=areasDelCiclo.length>0;
      const areasLabel=hayAreas
        ?(areasDelSalon.length>0
          ?`<span class="bdg" style="font-size:10px;background:#e0e7ff;color:#3730a3;border:1px solid #a5b4fc">📂 ${areasDelSalon.length} área${areasDelSalon.length>1?'s':''}</span>`
          :`<span class="bdg bgy" style="font-size:10px">Sin áreas asignadas</span>`)
        :'';

      // Mostrar áreas con sus materias del salón
      const areasHTML=areasDelSalon.length>0
        ?`<div style="margin-top:10px;border-top:1px solid var(--bd);padding-top:8px">
            <div style="font-size:10px;font-weight:700;color:var(--sl);text-transform:uppercase;margin-bottom:6px">Áreas del salón</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${areasDelSalon.map(areaNombre=>{
                const matsDelArea=matsList.filter(m=>{
                  const d=matDocs.find(x=>x.nombre===m);
                  return d&&d.areaNombre===areaNombre;
                });
                return`<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 8px;background:#f5f3ff;border-radius:7px;border:1px solid #ddd6fe">
                  <span style="font-size:11px;font-weight:700;color:#5b21b6;min-width:80px">▸ ${areaNombre}</span>
                  <div style="display:flex;flex-wrap:wrap;gap:3px">${
                    matsDelArea.length
                      ?matsDelArea.map(m=>`<span style="font-size:10px;padding:1px 6px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:4px">${m}</span>`).join('')
                      :'<span style="font-size:10px;color:var(--sl3)">Sin materias asignadas en este salón</span>'
                  }</div>
                </div>`;
              }).join('')}
            </div>
          </div>`
        :'';

      return`<div style="background:var(--bg2);border-radius:10px;border:1px solid var(--bd);padding:14px 16px;margin-bottom:12px;transition:box-shadow .15s" onmouseenter="this.style.boxShadow='var(--shm)'" onmouseleave="this.style.boxShadow=''">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <strong style="font-size:15px">${s.nombre}</strong>
            <span class="bdg bgy">${ebySalon(s.nombre).length} est.</span>
            ${s.jornada?`<span class="bdg" style="font-size:10px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;text-transform:capitalize">🕐 ${s.jornada}</span>`:''}
            ${matsLabel}
            ${areasLabel}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${hayAreas?`<button class="btn xs" style="background:#e0e7ff;color:#3730a3;border:1px solid #a5b4fc" onclick="editSalAreas('${s.nombre}')">📂 Áreas</button>`:''}
            <button class="btn xs bg" onclick="editSalMats('${s.nombre}')">🎯 Materias</button>
            <button class="btn xs bd" onclick="delSal('${s.nombre}')">🗑</button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
          ${matsList.map(m=>`<span style="font-size:12px;padding:4px 10px;background:#fff;border:1px solid var(--bd);border-radius:7px;font-weight:500">${m}</span>`).join('')}
        </div>
        ${areasHTML}
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

/* Asignar/editar áreas que aplican a un salón específico */
async function editSalAreas(sname){
  const sal=DB.sals.find(s=>s.nombre===sname);if(!sal)return;
  const ciclo=sal.ciclo;
  const areasDelCiclo=(DB.areas||[]).filter(a=>a.ciclo===ciclo);

  if(!areasDelCiclo.length){
    sw('info','Sin áreas configuradas',`Ve a <strong>Áreas & Materias</strong> y crea las áreas para ${ciclo} primero.`);
    return;
  }

  // Áreas actualmente asignadas a este salón
  if(!DB.salAreas) DB.salAreas={};
  const current=[...(DB.salAreas[sname]||[])];

  // Materias del salón para mostrar preview
  const matDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo===ciclo);
  const matsList=sal.mats&&sal.mats.length?sal.mats:(ciclo==='primaria'?DB.mP:DB.mB);

  const rows=areasDelCiclo.map(area=>{
    // Materias de esta área que están en el salón
    const matsDeArea=matsList.filter(m=>{
      const d=matDocs.find(x=>x.nombre===m);
      return d&&d.areaNombre===area.nombre;
    });
    const preview=matsDeArea.length
      ?matsDeArea.map(m=>`<span style="font-size:10px;padding:1px 6px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:4px;margin:1px">${m}</span>`).join('')
      :'<span style="font-size:10px;color:#aaa">Sin materias asignadas a esta área</span>';
    return`<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--bg2);
      border-radius:8px;border:1px solid var(--bd);cursor:pointer;margin-bottom:7px">
      <input type="checkbox" class="sack" value="${area.nombre}" ${current.includes(area.nombre)?'checked':''} style="margin-top:3px;width:16px;height:16px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">📂 ${area.nombre}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${preview}</div>
      </div>
    </label>`;
  }).join('');

  const r=await Swal.fire({
    title:`📂 Áreas del Salón ${sname}`,
    width:560,
    html:`<div style="text-align:left;font-family:var(--fn)">
      <div class="al alb" style="margin-bottom:12px;font-size:12px">
        Selecciona las áreas que aplican a este salón. Las áreas agrupan materias y determinan si el estudiante aprueba, recupera o pierde el año.
      </div>
      <div style="max-height:380px;overflow-y:auto">${rows}</div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:'Guardar Áreas',
    cancelButtonText:'Cancelar',
    preConfirm:()=>[...document.querySelectorAll('.sack:checked')].map(c=>c.value)
  });

  if(!r.isConfirmed) return;
  const elegidas=r.value;

  // Guardar en DB.salAreas (mapa salón → array de áreas)
  if(!DB.salAreas) DB.salAreas={};
  DB.salAreas[sname]=elegidas;

  // Persistir en config para que sobreviva recargas
  try{
    await apiFetch('/api/config/salAreas',{method:'PUT',body:JSON.stringify({value:DB.salAreas})});
  }catch(e){ console.warn('Error guardando salAreas:',e); }

  renderSals();
  sw('success',
    `Áreas de ${sname} actualizadas`,
    elegidas.length?`${elegidas.length} área${elegidas.length>1?'s':''} asignadas`:'Sin áreas asignadas.',
    2000
  );
}

/* ============================================================
   ESTUDIANTES (Admin)
============================================================ */
function pgAEst(ciclo){
  const tt=ciclo==='primaria'?'Primaria (1°-5°)':'Bachillerato (6°-11°)';
  const sOpts=DB.sals.filter(s=>s.ciclo===ciclo).map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');
  return`<div class="ph"><h2>Estudiantes — ${tt}</h2><button class="btn xs bg" onclick="showHelp('${ciclo==='primaria'?'apri':'abac'}')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="card">
    <div class="chd">
      <span class="cti">➕ Agregar Estudiante</span>
      <button class="btn bg sm" onclick="abrirCSVEst('${ciclo}')" title="Cargar múltiples estudiantes desde archivo CSV">
        📂 Carga Masiva CSV
      </button>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:14px;align-items:end;margin-bottom:16px">
      <div class="fld" style="margin:0">
        <label>Nombre completo</label>
        <input id="nen" placeholder="Ej: Juan Pérez Gómez" style="font-size:14px;padding:12px 15px">
      </div>
      <div class="fld" style="margin:0">
        <label>${ciclo==='bachillerato'?'T.I. / C.C.':'T.I.'}</label>
        <input id="neti" placeholder="Número documento" inputmode="numeric" pattern="[0-9]*"
          style="font-size:14px;padding:12px 15px"
          oninput="this.value=this.value.replace(/[^0-9]/g,'')">
      </div>
      <div class="fld" style="margin:0">
        <label>Salón</label>
        <select id="nes" style="font-size:14px;padding:12px 15px">
          <option value="">Sin salón</option>${sOpts}
        </select>
      </div>
      <div class="fld" style="margin:0">
        <label>Usuario</label>
        <input id="neu" placeholder="nombre.usuario" style="font-size:14px;padding:12px 15px">
      </div>
      <div class="fld" style="margin:0">
        <label>Contraseña</label>
        <input id="nep" type="password" placeholder="••••••••" style="font-size:14px;padding:12px 15px">
      </div>
    </div>
    <button class="btn bn" onclick="addEst('${ciclo}')"
      style="width:100%;padding:14px;font-size:15px;font-weight:800;
      background:linear-gradient(135deg,var(--nv2),var(--nv3));
      box-shadow:0 4px 16px rgba(15,31,53,.2);border-radius:12px;
      display:flex;align-items:center;justify-content:center;gap:10px">
      <span style="font-size:18px">➕</span> Agregar Estudiante
    </button>
  </div>
  <div class="card">
    <div class="chd"><span class="cti">📋 Lista</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn bg sm" onclick="expEstXls('${ciclo}')">📤 Excel</button>
        <button class="btn bn sm" onclick="promoverEstudiantes('${ciclo}')" title="Promover/Repetir año a todos los estudiantes según resultados">🎓 Promover Año</button>
        <button class="btn bd sm" onclick="eliminarTodosEsts('${ciclo}')" title="Eliminar TODOS los estudiantes de este ciclo">🗑️ Eliminar Todo</button>
      </div>
    </div>
    <div class="srch"><span style="color:var(--sl3);font-size:15px">🔍</span>
      <input id="se${ciclo}" placeholder="Buscar por nombre, T.I., salón..."
        oninput="filterEst('${ciclo}')">
    </div>
    <div id="et${ciclo}"></div>
  </div>`;
}
function initAEst(c){
  // Reload DB fresh para asegurar aislamiento de salones/materias por colegio
  if(typeof dbLoad==='function') dbLoad().catch(()=>{}).finally(()=>renderEstTabla(c));
  else renderEstTabla(c);
}
function filterEst(c){renderEstTabla(c,gi('se'+c)?.value||'');}
function renderEstTabla(ciclo,filter=''){
  const el=gi('et'+ciclo);if(!el) return;
  let list=estsByCiclo(ciclo);
  if(filter){const f=filter.toLowerCase();list=list.filter(e=>
    e.nombre.toLowerCase().includes(f)||(e.ti||'').toLowerCase().includes(f)||(e.salon||'').toLowerCase().includes(f));}
  if(!list.length){el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes</p></div>';return;}
  el.innerHTML=`<div class="tw"><table>
    <thead><tr><th>#</th><th>Nombre</th><th>${ciclo==='bachillerato'?'T.I./C.C.':'T.I.'}</th><th>Salón</th><th>Usuario</th><th>Prom.</th><th>Acciones</th></tr></thead>
    <tbody>${list.map((e,i)=>{const pg=gprom(e.id);return`<tr>
      <td style="color:var(--sl3);font-family:var(--mn);font-size:11px">${i+1}</td>
      <td><strong>${esc(e.nombre)}</strong></td>
      <td style="font-family:var(--mn);font-size:12px">${e.ti||'—'}</td>
      <td>${e.salon?`<span class="bdg bbl">${esc(e.salon||"")}</span>`:'<span class="bdg bgy">Sin salón</span>'}</td>
      <td style="font-family:var(--mn);font-size:12px">${esc(e.usuario||"")}</td>
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
  return`<div class="ph"><h2>Profesores</h2><button class="btn xs bg" onclick="showHelp('aprf')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="g2">
    <div class="card"><div class="chd"><span class="cti">📚 Primaria</span>
      <div style="display:flex;gap:8px">
        <button class="btn bg sm" onclick="abrirCSVPrf('primaria')" title="Carga masiva CSV">📂 CSV</button>
        <button class="btn bn" onclick="openAddPrf('primaria')" style="padding:8px 18px;font-size:13px;font-weight:700">
          ➕ Agregar Profesor
        </button>
      </div></div><div id="pfP"></div>
    </div>
    <div class="card"><div class="chd"><span class="cti">🎓 Bachillerato</span>
      <div style="display:flex;gap:8px">
        <button class="btn bg sm" onclick="abrirCSVPrf('bachillerato')" title="Carga masiva CSV">📂 CSV</button>
        <button class="btn bn" onclick="openAddPrf('bachillerato')" style="padding:8px 18px;font-size:13px;font-weight:700">
          ➕ Agregar Profesor
        </button>
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
      <thead><tr><th>Nombre</th><th>C.C.</th>${c==='bachillerato'?'<th>Salón → Materias</th>':'<th>Salones</th>'}<th></th></tr></thead>
      <tbody>${list.map(p=>`<tr>
        <td><strong>${esc(p.nombre)}</strong><br>
          <span style="font-family:var(--mn);font-size:11px;color:var(--sl3)">${esc(p.usuario||"")}</span></td>
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
      ${sF([{id:'npn',lb:'Nombre'},{id:'npti',lb:'C.C.',ph:'Ej: 1234567890',attr:'inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"'},{id:'npu',lb:'Usuario'},{id:'npp',lb:'Contraseña'}])}
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
      return{nombre:gi('npn').value.trim(),ti:gi('npti').value.trim().replace(/[^0-9]/g,''),
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
  Swal.fire({title:`Materias por Salón — ${esc(p.nombre)}`,width:620,
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
  }).then(async r=>{
    if(!r.isConfirmed){if(cb)cb();return;}
    Object.assign(p,r.value);
    // Persistir salonMaterias en el servidor
    const upd={
      salonMaterias: r.value.salonMaterias,
      materias:      r.value.materias,
      materia:       r.value.materia
    };
    try{
      await apiFetch(`/api/usuarios/${p.id}`,{method:'PUT',body:JSON.stringify(upd)});
      sw('success','Asignaciones guardadas','',1400);
    }catch(e){
      sw('error','Error al guardar: '+e.message);
    }
    if(cb)cb();
  });
}

function editPrf(pid){
  const p=DB.profs.find(x=>x.id===pid);
  const MAX=p.ciclo==='bachillerato'?Infinity:1;
  const sals=DB.sals.filter(s=>s.ciclo===p.ciclo);
  Swal.fire({title:'Editar Profesor',width:600,
    html:`<div style="text-align:left;font-family:var(--fn)">
      ${sF([{id:'epn',lb:'Nombre',val:p.nombre},{id:'epti',lb:'C.C.',val:p.ti||'',ph:'Ej: 1234567890',attr:'inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"'},
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
      return{nombre:gi('epn').value.trim(),ti:gi('epti').value.trim().replace(/[^0-9]/g,''),
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
  return`<div class="ph"><h2>Áreas & Materias</h2><button class="btn xs bg" onclick="showHelp('amat')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="g2">
    <div class="card">
      <div class="chd"><span class="cti">📚 Primaria — Áreas y Materias</span></div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div class="fld" style="margin:0;flex:1"><input id="nap" placeholder="Nueva área primaria..."></div>
        <button class="btn bn sm" onclick="addArea('primaria')">➕ Área</button>
      </div>
      <div id="areaListP"></div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">
        <div style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase;margin-bottom:8px">Materias sin área</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div class="fld" style="margin:0;flex:1"><input id="nmp" placeholder="Nueva materia primaria..."></div>
          <button class="btn bg sm" onclick="addMP()">➕ Materia</button>
        </div>
        <div id="mlP"></div>
      </div>
    </div>
    <div class="card">
      <div class="chd"><span class="cti">🎓 Bachillerato — Áreas y Materias</span></div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div class="fld" style="margin:0;flex:1"><input id="nab" placeholder="Nueva área bachillerato..."></div>
        <button class="btn bn sm" onclick="addArea('bachillerato')">➕ Área</button>
      </div>
      <div id="areaListB"></div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">
        <div style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase;margin-bottom:8px">Materias sin área</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div class="fld" style="margin:0;flex:1"><input id="nmb" placeholder="Nueva materia bachillerato..."></div>
          <button class="btn bg sm" onclick="addMB()">➕ Materia</button>
        </div>
        <div id="mlB"></div>
      </div>
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
async function initAMat(){
  try{
    const [mP, mB, areasP, areasB] = await Promise.all([
      apiFetch('/api/materias?ciclo=primaria').catch(()=>null),
      apiFetch('/api/materias?ciclo=bachillerato').catch(()=>null),
      apiFetch('/api/areas?ciclo=primaria').catch(()=>null),
      apiFetch('/api/areas?ciclo=bachillerato').catch(()=>null),
    ]);
    if(mP&&mP.length>0){ DB.mP=mP.map(m=>m.nombre); DB.materiasDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo!=='primaria'); DB.materiasDocs.push(...mP.map(m=>({nombre:m.nombre,ciclo:'primaria',areaNombre:m.areaNombre||''}))); }
    if(mB&&mB.length>0){ DB.mB=mB.map(m=>m.nombre); DB.materiasDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo!=='bachillerato'); DB.materiasDocs.push(...mB.map(m=>({nombre:m.nombre,ciclo:'bachillerato',areaNombre:m.areaNombre||''}))); }
    if((!mP||!mP.length)||(!mB||!mB.length)){
      const cfg=await apiFetch('/api/config').catch(()=>null);
      if(cfg){ if((!mP||!mP.length)&&cfg.mP)DB.mP=cfg.mP; if((!mB||!mB.length)&&cfg.mB)DB.mB=cfg.mB; }
    }
    if(areasP) DB.areas=(DB.areas||[]).filter(a=>a.ciclo!=='primaria').concat(areasP.map(a=>({nombre:a.nombre,ciclo:'primaria',orden:a.orden||0})));
    if(areasB) DB.areas=(DB.areas||[]).filter(a=>a.ciclo!=='bachillerato').concat(areasB.map(a=>({nombre:a.nombre,ciclo:'bachillerato',orden:a.orden||0})));
  }catch(e){ console.warn('initAMat error:',e); }
  renderMats();
}
function renderAreaBlock(ciclo){
  const elId=ciclo==='primaria'?'areaListP':'areaListB';
  const el=gi(elId);if(!el)return;
  const areas=(DB.areas||[]).filter(a=>a.ciclo===ciclo);
  const matDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo===ciclo);
  if(!areas.length){el.innerHTML='<div style="color:var(--sl3);font-size:12px;padding:6px 0">Sin áreas creadas aún.</div>';return;}
  el.innerHTML=areas.map(area=>{
    const matsDelArea=matDocs.filter(d=>d.areaNombre===area.nombre).map(d=>d.nombre);
    return`<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <strong style="font-size:14px">📂 ${area.nombre}</strong>
        <div style="display:flex;gap:5px">
          <button class="btn xs bg" onclick="editAreaMats('${area.nombre}','${ciclo}')">🎯 Materias</button>
          <button class="btn xs bg" onclick="renameArea('${area.nombre}','${ciclo}')">✏️</button>
          <button class="btn xs bd" onclick="delArea('${area.nombre}','${ciclo}')">🗑</button>
        </div>
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${matsDelArea.length
          ?matsDelArea.map(m=>`<span style="font-size:11px;padding:2px 8px;background:#fff;border:1px solid var(--bd);border-radius:5px">${m}</span>`).join('')
          :'<span style="font-size:11px;color:var(--sl3)">Sin materias asignadas</span>'}
      </div>
    </div>`;
  }).join('');
}
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
  const matDocsP=(DB.materiasDocs||[]).filter(d=>d.ciclo==='primaria');
  const matDocsB=(DB.materiasDocs||[]).filter(d=>d.ciclo==='bachillerato');
  const mp=gi('mlP');
  if(mp) mp.innerHTML=DB.mP.filter(m=>{ const d=matDocsP.find(x=>x.nombre===m); return !d||!d.areaNombre; }).map(m=>matItem(m,'delMP','primaria')).join('');
  const mb=gi('mlB');
  if(mb) mb.innerHTML=DB.mB.filter(m=>{ const d=matDocsB.find(x=>x.nombre===m); return !d||!d.areaNombre; }).map(m=>matItem(m,'delMB','bachillerato')).join('');
  renderAreaBlock('primaria');
  renderAreaBlock('bachillerato');
  const pl=gi('perL');if(pl) pl.innerHTML=DB.pers.map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:9px 12px;background:var(--bg2);border-radius:8px;margin-bottom:7px;border:1px solid var(--bd)">
      <span style="font-size:13px">${p}</span>
      <button class="btn xs bd" onclick="delPer('${p}')">🗑</button>
    </div>`).join('');
}
async function addArea(ciclo){
  const inpId=ciclo==='primaria'?'nap':'nab';
  const v=gi(inpId)?.value.trim();
  if(!v){sw('error','Escribe el nombre del área');return;}
  if((DB.areas||[]).some(a=>a.nombre===v&&a.ciclo===ciclo)){sw('warning','Esa área ya existe');return;}
  try{
    await apiFetch('/api/areas',{method:'POST',body:JSON.stringify({nombre:v,ciclo,orden:(DB.areas||[]).filter(a=>a.ciclo===ciclo).length})});
    if(!DB.areas) DB.areas=[];
    DB.areas.push({nombre:v,ciclo,orden:DB.areas.filter(a=>a.ciclo===ciclo).length});
    gi(inpId).value='';renderMats();
    sw('success',`Área "${v}" creada`,'',1400);
  }catch(e){sw('error','Error al crear: '+e.message);}
}
async function delArea(nombre,ciclo){
  const r=await Swal.fire({title:`¿Eliminar área "${nombre}"?`,text:'Las materias quedarán sin área asignada.',icon:'warning',showCancelButton:true,confirmButtonText:'Sí, eliminar',confirmButtonColor:'#e53e3e'});
  if(!r.isConfirmed) return;
  try{
    await apiFetch(`/api/areas/${encodeURIComponent(nombre)}/${ciclo}`,{method:'DELETE'});
    DB.areas=(DB.areas||[]).filter(a=>!(a.nombre===nombre&&a.ciclo===ciclo));
    (DB.materiasDocs||[]).forEach(d=>{if(d.areaNombre===nombre&&d.ciclo===ciclo) d.areaNombre='';});
    renderMats();sw('success','Área eliminada','',1400);
  }catch(e){sw('error','Error: '+e.message);}
}
async function renameArea(nombre,ciclo){
  const r=await Swal.fire({title:'Renombrar área',input:'text',inputValue:nombre,showCancelButton:true,confirmButtonText:'Guardar'});
  if(!r.isConfirmed||!r.value.trim()||r.value.trim()===nombre) return;
  const nw=r.value.trim();
  try{
    await apiFetch(`/api/areas/${encodeURIComponent(nombre)}/${ciclo}`,{method:'PUT',body:JSON.stringify({nuevoNombre:nw})});
    const a=(DB.areas||[]).find(a=>a.nombre===nombre&&a.ciclo===ciclo);
    if(a) a.nombre=nw;
    (DB.materiasDocs||[]).forEach(d=>{if(d.areaNombre===nombre&&d.ciclo===ciclo) d.areaNombre=nw;});
    renderMats();sw('success','Área renombrada','',1400);
  }catch(e){sw('error','Error: '+e.message);}
}
async function editAreaMats(areaNombre,ciclo){
  const allMats=ciclo==='primaria'?DB.mP:DB.mB;
  const matDocs=(DB.materiasDocs||[]).filter(d=>d.ciclo===ciclo);
  const current=matDocs.filter(d=>d.areaNombre===areaNombre).map(d=>d.nombre);
  const rows=allMats.map(m=>`
    <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);
      border-radius:7px;border:1px solid var(--bd);cursor:pointer;font-size:13px;margin-bottom:5px">
      <input type="checkbox" class="amck" value="${m}" ${current.includes(m)?'checked':''}>
      <span>${m}</span>
    </label>`).join('');
  const r=await Swal.fire({
    title:`Materias del área "${areaNombre}"`,width:520,
    html:`<div style="text-align:left;max-height:360px;overflow-y:auto">${rows}</div>`,
    showCancelButton:true,confirmButtonText:'Guardar',
    preConfirm:()=>[...document.querySelectorAll('.amck:checked')].map(c=>c.value)
  });
  if(!r.isConfirmed) return;
  const elegidas=r.value;
  try{
    await apiFetch(`/api/areas/${encodeURIComponent(areaNombre)}/${ciclo}/materias`,{method:'PUT',body:JSON.stringify({materias:elegidas})});
    (DB.materiasDocs||[]).forEach(d=>{
      if(d.ciclo!==ciclo) return;
      if(elegidas.includes(d.nombre)) d.areaNombre=areaNombre;
      else if(d.areaNombre===areaNombre) d.areaNombre='';
    });
    renderMats();sw('success','Materias del área actualizadas','',1400);
  }catch(e){sw('error','Error: '+e.message);}
}

async function addMP(){
  const v=gi('nmp').value.trim();
  if(!v){sw('error','Escribe el nombre de la materia');return;}
  if(DB.mP.includes(v)){sw('warning','Esa materia ya existe en Primaria');return;}
  try{
    // Guardar vía API para persistencia real en MongoDB
    await apiFetch('/api/materias',{method:'POST',body:JSON.stringify({nombre:v,ciclo:'primaria',orden:DB.mP.length})});
    DB.mP.push(v);
    patchMats('primaria',v);
    // Sincronizar Config.mP también
    await apiFetch('/api/config/mP',{method:'PUT',body:JSON.stringify({value:DB.mP})}).catch(()=>{});
    gi('nmp').value='';
    renderMats();
    sw('success',`Materia "${v}" agregada a Primaria`,'',1400);
  }catch(e){sw('error','Error al guardar: '+e.message);}
}
async function addMB(){
  const v=gi('nmb').value.trim();
  if(!v){sw('error','Escribe el nombre de la materia');return;}
  if(DB.mB.includes(v)){sw('warning','Esa materia ya existe en Bachillerato');return;}
  try{
    await apiFetch('/api/materias',{method:'POST',body:JSON.stringify({nombre:v,ciclo:'bachillerato',orden:DB.mB.length})});
    DB.mB.push(v);
    patchMats('bachillerato',v);
    await apiFetch('/api/config/mB',{method:'PUT',body:JSON.stringify({value:DB.mB})}).catch(()=>{});
    gi('nmb').value='';
    renderMats();
    sw('success',`Materia "${v}" agregada a Bachillerato`,'',1400);
  }catch(e){sw('error','Error al guardar: '+e.message);}
}
async function delMP(m){
  if(DB.mP.length<=1){sw('error','Mínimo 1 materia');return;}
  try{
    await apiFetch(`/api/materias/${encodeURIComponent(m)}/primaria`,{method:'DELETE'});
    DB.mP=DB.mP.filter(x=>x!==m);
    await apiFetch('/api/config/mP',{method:'PUT',body:JSON.stringify({value:DB.mP})}).catch(()=>{});
    renderMats();
  }catch(e){sw('error','Error al eliminar: '+e.message);}
}
async function delMB(m){
  if(DB.mB.length<=1){sw('error','Mínimo 1 materia');return;}
  try{
    await apiFetch(`/api/materias/${encodeURIComponent(m)}/bachillerato`,{method:'DELETE'});
    DB.mB=DB.mB.filter(x=>x!==m);
    await apiFetch('/api/config/mB',{method:'PUT',body:JSON.stringify({value:DB.mB})}).catch(()=>{});
    renderMats();
  }catch(e){sw('error','Error al eliminar: '+e.message);}
}
function patchMats(ciclo,m){
  DB.ests.forEach(e=>{
    if(cicloOf(e.salon)!==ciclo) return;
    DB.pers.forEach(p=>{if(DB.notas[e.id]?.[p]) DB.notas[e.id][p][m]={a:0,c:0,r:0};});
  });
}
function renameMat(ciclo,old){
  Swal.fire({title:'Renombrar Materia',input:'text',inputValue:old,showCancelButton:true,confirmButtonText:'Guardar'}).then(async r=>{
    if(!r.isConfirmed||!r.value.trim()) return;
    const nw=r.value.trim();
    if(nw===old) return;
    const arr=ciclo==='primaria'?DB.mP:DB.mB;
    const i=arr.indexOf(old);if(i<0)return;
    try{
      // 1. Crear nueva materia
      await apiFetch('/api/materias',{method:'POST',body:JSON.stringify({nombre:nw,ciclo,orden:i})}).catch(()=>{});
      // 2. Eliminar la vieja
      await apiFetch(`/api/materias/${encodeURIComponent(old)}/${ciclo}`,{method:'DELETE'}).catch(()=>{});
      // 3. Actualizar array local y notas
      arr[i]=nw;
      DB.ests.forEach(e=>{DB.pers.forEach(p=>{
        if(DB.notas[e.id]?.[p]?.[old]){DB.notas[e.id][p][nw]=DB.notas[e.id][p][old];delete DB.notas[e.id][p][old];}
      });});
      // 4. Persistir lista actualizada
      const key=ciclo==='primaria'?'mP':'mB';
      await apiFetch(`/api/config/${key}`,{method:'PUT',body:JSON.stringify({value:arr})}).catch(()=>{});
      renderMats();
      sw('success',`Renombrada de "${old}" a "${nw}"`,'',1400);
    }catch(e){sw('error','Error: '+e.message);}
  });
}
async function addPer(){
  const v=gi('nper').value.trim();
  if(!v){sw('error','Escribe el nombre del periodo');return;}
  if(DB.pers.includes(v)){sw('warning','Ese periodo ya existe');return;}
  DB.pers.push(v);
  DB.ests.forEach(e=>{
    if(!DB.notas[e.id]) DB.notas[e.id]={};
    DB.notas[e.id][v]={};
    getMats(e.id).forEach(m=>{DB.notas[e.id][v][m]={a:0,c:0,r:0};});
  });
  try{
    await apiFetch('/api/config/pers',{method:'PUT',body:JSON.stringify({value:DB.pers})});
    gi('nper').value='';renderMats();
    sw('success',`Periodo "${v}" agregado`,'',1400);
  }catch(e){DB.pers=DB.pers.filter(x=>x!==v);sw('error','Error al guardar: '+e.message);}
}
async function delPer(p){
  if(DB.pers.length<=1){sw('error','Mínimo 1 periodo');return;}
  DB.pers=DB.pers.filter(x=>x!==p);
  try{
    await apiFetch('/api/config/pers',{method:'PUT',body:JSON.stringify({value:DB.pers})});
    renderMats();
  }catch(e){sw('error','Error al guardar: '+e.message);}
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
        <th>Disciplina</th><th>Conducta</th><th>Prom.</th></tr>
      <tr><td></td>
        ${(()=>{const p=DB.notaPct||{};const a=p.a??60,c=p.c??20,r=p.r??20;return mats.map(()=>`<th style="font-size:9px;color:var(--sl2);border-left:2px solid var(--bd)">Apt.${a}%</th><th style="font-size:9px;color:var(--sl2)">Act.${c}%</th><th style="font-size:9px;color:var(--sl2)">Res.${r}%</th><th style="font-size:9px;background:#e8f4fd">Def.</th>`).join('')})()}
        <td></td><td></td><td></td></tr>
    </thead>
    <tbody id="anB"></tbody>
  </table></div>`;
  const body=gi('anB');
  list.forEach(e=>{
    syncN(e.id);
    const tr=document.createElement('tr');tr.id='anr'+e.id;
    const pp=pprom(e.id,per);
    const ep=encodeURIComponent(per);
    const cells=mats.map(m=>{
      const t=DB.notas[e.id][per][m]||{a:0,c:0,r:0};const d=def(t);
      const enc=encodeURIComponent,em=enc(m);
      return`<td style="border-left:2px solid var(--bd);padding:5px">
        <input type="number" class="ni" min="0" max="5" step="0.1" value="${t.a.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="a" oninput="clampNota(this)" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.c.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="c" oninput="clampNota(this)" onchange="saveTri(this)"></td>
        <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.r.toFixed(1)}"
          data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="r" oninput="clampNota(this)" onchange="saveTri(this)"></td>
        <td id="dc_${e.id}_${em}_${ep}" style="background:#f0f8ff;padding:5px">
          <span class="${scC(d)}" style="font-size:11px">${d.toFixed(2)}</span></td>`;
    }).join('');
    const _discValPer1 = DB.notas[e.id]?.[per]?.disciplina ?? DB.notas[e.id]?.[per]?._disciplina;
    const _condValPer1 = DB.notas[e.id]?.[per]?.conducta ?? DB.notas[e.id]?.[per]?._conducta;
    tr.innerHTML=`<td><strong>${esc(e.nombre)}</strong></td>${cells}
      <td style="padding:4px">
        <input type="number" class="ni" min="0" max="5" step="0.1"
          style="width:62px;text-align:center"
          value="${typeof _discValPer1==='number'?_discValPer1.toFixed(1):''}"
          placeholder="0-5"
          title="Disciplina ${ep} — 0.0 a 5.0"
          oninput="clampNota(this)" onchange="saveDisc('${e.id}',this.value,'${ep}')">
        <div style="font-size:10px;color:var(--sl3);text-align:center">
          ${typeof _discValPer1==='number'?discLabel(_discValPer1):'—'}
        </div>
      </td>
      <td style="padding:4px">
        <input type="number" class="ni" min="0" max="5" step="0.1"
          style="width:62px;text-align:center"
          value="${typeof _condValPer1==='number'?_condValPer1.toFixed(1):''}"
          placeholder="0-5"
          title="Conducta ${ep} — 0.0 a 5.0"
          oninput="clampNota(this)" onchange="saveConducta('${e.id}',this.value,'${ep}')">
        <div style="font-size:10px;color:var(--sl3);text-align:center">
          ${typeof _condValPer1==='number'?discLabel(_condValPer1):'—'}
        </div>
      </td>
      <td id="apr_${e.id}"><span class="${scC(pp)}">${pp.toFixed(2)}</span></td>`;
    body.appendChild(tr);
  });
}
/* ── SOBREESCRITA por api-layer.js ── */
async function saveTri(inp){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveDisc(eid,v){ /* implementado en api-layer.js */ }
/* ── SOBREESCRITA por api-layer.js ── */
async function saveConducta(eid,v){ /* implementado en api-layer.js */ }

/* ============================================================
   REHAB
============================================================ */
function pgAReh(){return`<div class="ph"><h2>Recuperaciones</h2><button class="btn xs bg" onclick="showHelp('areh')" style="margin-top:6px">❓ Ayuda</button></div><div id="arB"></div>`;}
function initAReh(){
  const el=gi('arB');if(!el)return;
  if(!DB.ext.on){el.innerHTML=`<div class="al aly">⚠️ Activa el Periodo Extraordinario en <strong>Control de Fechas</strong>.</div>`;return;}

  // Determinar elegibles usando áreas (si hay) o materias
  const elegibles=[];
  DB.ests.forEach(e=>{
    const areaMap=getAreaMatsMap(e.id);
    const tieneAreas=Object.keys(areaMap).filter(k=>k!=='_sinArea').length>0;
    if(tieneAreas){
      const areasP=areasPerdidasAnio(e.id)||[];
      // Recupera: 1 o 2 áreas perdidas
      if(areasP.length>=1&&areasP.length<=2) elegibles.push({est:e,tipo:'area',perdidas:areasP.map(a=>a.areaNombre)});
    } else {
      const mp=matPerd(e.id);
      if(mp.length>=1&&mp.length<=2) elegibles.push({est:e,tipo:'materia',perdidas:mp});
    }
  });

  if(!elegibles.length){el.innerHTML=`<div class="al alg">✅ Sin estudiantes en recuperación actualmente.</div>`;return;}
  el.innerHTML=`<div class="al aly">📅 Periodo Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></div>
  <div class="card"><div class="chd"><span class="cti">⚠️ Estudiantes Elegibles (${elegibles.length})</span></div>
  <div class="tw"><table><thead><tr><th>Estudiante</th><th>Salón</th><th>${elegibles.some(x=>x.tipo==='area')?'Área Perdida':'Materia Perdida'}</th><th>Profesor Asignado</th><th>Recuperación Enviada</th></tr></thead>
  <tbody>${elegibles.map(({est:e,tipo,perdidas})=>{
    const pg=gprom(e.id);
    return perdidas.map(nombre=>{
      // Para áreas: buscar profes de las materias del área; para materias: profForMat
      let profNombre='<span style="color:var(--sl3)">Sin asignar</span>';
      if(tipo==='area'){
        const areaMap=getAreaMatsMap(e.id);
        const mats=areaMap[nombre]||[];
        const prfs=[...new Set(mats.map(m=>profForMat(m,e.salon)).filter(Boolean).map(p=>p.nombre))];
        if(prfs.length) profNombre=prfs.join(', ');
      } else {
        const prf=profForMat(nombre,e.salon);
        if(prf) profNombre=prf.nombre;
      }
      const recs=(DB.recs||[]).filter(r=>r.estId===e.id&&r.materia===nombre);
      return`<tr>
        <td><strong>${esc(e.nombre)}</strong><br><span class="sc ${scC(pg)}" style="font-size:11px">${pg.toFixed(2)}</span></td>
        <td>${e.salon?`<span class="bdg bbl">${esc(e.salon||"")}</span>`:'—'}</td>
        <td><span class="bdg brd">${nombre}</span>${tipo==='area'?'<span style="font-size:10px;color:var(--sl3)"> (área)</span>':''}</td>
        <td style="font-size:13px">${profNombre}</td>
        <td>${recs.length?recs.map(r=>`<div style="font-size:11px;padding:3px 0">
          📎 ${esc(r.nombre)} <span style="color:var(--sl3)">${r.fecha}</span></div>`).join('')
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
            min="${DB.anoActual||new Date().getFullYear()}-01-01"
            max="${DB.anoActual||new Date().getFullYear()}-12-31"
            style="padding:5px 8px;border:1.5px solid var(--bd);border-radius:6px;font-size:12px">
          <label style="font-size:11px;color:var(--sl2)">Fin</label>
          <input type="date" id="dpe_${p.replace(/\s/g,'_')}" value="${dp.e}"
            min="${DB.anoActual||new Date().getFullYear()}-01-01"
            max="${DB.anoActual||new Date().getFullYear()}-12-31"
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
  <div class="card">
    <div class="chd"><span class="cti">🔄 Periodo Extraordinario</span>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="bdg ${DB.ext.on?'bgr':'bgy'}" style="font-size:12px;padding:5px 14px">
          ${DB.ext.on?'🟢 Activo':'⚫ Inactivo'}
        </span>
      </div>
    </div>
    <div class="al aly" style="margin-bottom:20px;font-size:13px">
      ⚠️ Solo para estudiantes con <strong>1 o 2 materias perdidas</strong>. Al cerrarse, los planes y recuperaciones activos se archivan automáticamente en el historial.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:20px;align-items:end;margin-bottom:20px">
      <div class="fld" style="margin:0">
        <label>📅 Fecha de Inicio</label>
        <input type="date" id="exs" value="${DB.ext.s}"
          min="${DB.anoActual||new Date().getFullYear()}-01-01"
          max="${DB.anoActual||new Date().getFullYear()}-12-31"
          style="font-size:14px;padding:12px 15px">
      </div>
      <div class="fld" style="margin:0">
        <label>📅 Fecha de Fin</label>
        <input type="date" id="exe" value="${DB.ext.e}"
          min="${DB.anoActual||new Date().getFullYear()}-01-01"
          max="${DB.anoActual||new Date().getFullYear()}-12-31"
          style="font-size:14px;padding:12px 15px">
      </div>
      <div class="fld" style="margin:0">
        <label>Estado</label>
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;
          background:var(--bg2);border:1.5px solid var(--bd);border-radius:var(--r);
          padding:12px 15px;height:48px;font-weight:600">
          <input type="checkbox" id="exon" ${DB.ext.on?'checked':''}
            style="width:18px;height:18px;accent-color:var(--grn);cursor:pointer">
          Activar Periodo Extraordinario
        </label>
      </div>
      <button class="btn bw" onclick="saveExt()"
        style="height:48px;padding:0 28px;font-size:15px;font-weight:800;white-space:nowrap;
        background:linear-gradient(135deg,#f08030,#d06018);box-shadow:0 4px 16px rgba(240,128,48,.3)">
        💾 Guardar
      </button>
    </div>
    ${DB.ext.s&&DB.ext.e?`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:4px">
      <div style="background:var(--bg2);border-radius:10px;border:1px solid var(--bd);padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--sl3);margin-bottom:6px">Inicio</div>
        <div style="font-size:18px;font-weight:800;color:var(--nv);font-family:var(--mn)">${DB.ext.s}</div>
      </div>
      <div style="background:var(--bg2);border-radius:10px;border:1px solid var(--bd);padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--sl3);margin-bottom:6px">Fin</div>
        <div style="font-size:18px;font-weight:800;color:var(--nv);font-family:var(--mn)">${DB.ext.e}</div>
      </div>
      <div style="background:${DB.ext.on?'#ecfdf5':'#f8fafc'};border-radius:10px;border:1px solid ${DB.ext.on?'#a7f3d0':'var(--bd)'};padding:16px;text-align:center">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--sl3);margin-bottom:6px">Estado</div>
        <div style="font-size:16px;font-weight:800;color:${DB.ext.on?'var(--grn)':'var(--sl2)'}">${DB.ext.on?'🟢 Activo':'⚫ Inactivo'}</div>
      </div>
    </div>`:''}
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
  dash:`<b>🏠 Panel General</b><br>Resumen estadístico del colegio: total de estudiantes, profesores, salones y materias.<br>Muestra el ranking de los mejores estudiantes por salón y las últimas acciones registradas en auditoría.<br>Usa el menú lateral para navegar a cualquier sección del sistema.`,
  asal:`<b>🏫 Salones & Grados</b><br>Crea y gestiona los salones del colegio separados por ciclo (Primaria y Bachillerato).<br>1. Escribe el nombre del salón (ej: 6A), selecciona ciclo y jornada, y haz clic en <b>Agregar</b>.<br>2. Desde cada salón puedes editar sus materias o eliminarlo si no tiene estudiantes activos.`,
  apri:`<b>🎓 Estudiantes — Primaria</b><br>Gestiona los estudiantes de primaria (1°–5°).<br>Puedes agregar estudiantes uno a uno o hacer <b>Carga Masiva CSV</b>.<br>Edita datos como nombre, T.I., salón y contraseña. Usa el buscador para filtrar por nombre o salón.<br>Al final del año puedes usar <b>Promover Año</b> para avanzar automáticamente a los estudiantes según sus resultados.`,
  abac:`<b>🎓 Estudiantes — Bachillerato</b><br>Gestiona los estudiantes de bachillerato (6°–11°).<br>Puedes agregar estudiantes uno a uno o hacer <b>Carga Masiva CSV</b>.<br>Edita datos como nombre, T.I., salón y contraseña. Usa el buscador para filtrar por nombre o salón.<br>Al final del año puedes usar <b>Promover Año</b> para avanzar automáticamente a los estudiantes según sus resultados.`,
  aprf:`<b>👩‍🏫 Profesores</b><br>Crea y administra los docentes del colegio por ciclo (Primaria / Bachillerato).<br>Al crear un profesor asigna sus <b>salones</b> y las <b>materias</b> que imparte en cada salón.<br>Puedes hacer carga masiva desde un archivo CSV. Edita o elimina profesores en cualquier momento.`,
  amat:`<b>📖 Áreas & Materias</b><br>Define las áreas académicas y las materias que las componen para cada ciclo.<br>Las áreas agrupan materias y determinan si el estudiante aprueba, recupera o pierde el año.<br>Configura también los porcentajes de calificación (Aptitud, Actitud, Responsabilidad) y el año lectivo que aparecerá en los boletines.`,
  areh:`<b>🔄 Recuperaciones (Admin)</b><br>Vista global de todos los estudiantes en periodo de recuperación.<br>Muestra quién tiene materias pendidas y en qué materias. El docente correspondiente envía el plan de recuperación desde su panel.<br>Al cerrar el periodo puedes archivar todos los registros.`,
  ablk:`<b>🔒 Usuarios Bloqueados</b><br>Lista de usuarios que han sido bloqueados por intentos fallidos de inicio de sesión.<br>Haz clic en <b>Desbloquear</b> para permitir que el usuario vuelva a ingresar al sistema.`,
  aexp:`<b>📤 Exportar Datos</b><br>Descarga información del sistema en formato <b>Excel</b> o genera <b>Boletines PDF</b>.<br>• <b>Excel:</b> exporta notas consolidadas, asistencia o datos de estudiantes por salón.<br>• <b>Boletín individual:</b> selecciona un estudiante y descarga su reporte académico.<br>• <b>Boletines por salón:</b> genera todos los boletines de un grupo en un solo clic.`,
  ahist:`<b>📚 Historial de Estudiantes</b><br>Registro de todos los estudiantes que alguna vez fueron dados de alta en el sistema, incluso los ya eliminados.<br>Puedes buscar por nombre o documento. El historial mantiene el año y salón en que estuvieron matriculados.`,
  pcom:`<b>📢 Comunicados del Colegio</b><br>
Aquí aparecen todos los avisos y anuncios activos publicados por el administrador.<br><br>
Los comunicados se muestran automáticamente al iniciar sesión y también puedes consultarlos aquí en cualquier momento.<br><br>
Cada comunicado indica su <b>fecha de vigencia</b> — al vencer desaparece automáticamente.`,
  ecom:`<b>📢 Comunicados del Colegio</b><br>
Aquí aparecen todos los avisos y anuncios activos que el colegio tiene para ti.<br><br>
Los comunicados se muestran automáticamente al iniciar sesión y también puedes consultarlos aquí en cualquier momento.<br><br>
Cada comunicado indica su <b>fecha de vigencia</b> — al vencer desaparece automáticamente.`,
  acom:`<b>📢 Comunicados</b><br>
Crea avisos o anuncios que profesores y/o estudiantes verán al iniciar sesión.<br><br>
<b>Para crear un comunicado:</b><br>
1. Escribe el <b>título</b> y el <b>mensaje</b>.<br>
2. Selecciona a quién va dirigido: <b>Todos</b>, solo <b>Profesores</b> o solo <b>Estudiantes</b>.<br>
3. Elige un <b>color</b> para destacar el tipo de aviso.<br>
4. Define las fechas de <b>inicio</b> y <b>fin</b> — el comunicado solo se muestra en ese rango.<br>
5. Haz clic en <b>Publicar</b>.<br><br>
Los destinatarios verán el comunicado automáticamente en una pantalla de bienvenida al hacer login, y también podrán consultarlo en el menú.<br><br>
Puedes <b>activar/desactivar</b> o <b>eliminar</b> cualquier comunicado en cualquier momento.`,

  aexc:`<b>✉️ Excusas Recibidas</b><br>Bandeja de excusas enviadas por los estudiantes (horario permitido: 18:00 – 07:00).<br>Haz clic en una excusa para leerla y escribir una <b>respuesta</b> al estudiante.<br>Las excusas respondidas quedan marcadas y el estudiante puede verlas en su módulo.`,
  avcl:`<b>💻 Clases Virtuales (Admin)</b><br>Vista general de todos los enlaces de clases virtuales publicados por los docentes.<br>Cada tarjeta muestra el salón, la fecha, el docente y el enlace de la reunión (Meet, Zoom, Teams).<br>Los estudiantes ven estos enlaces activos en su sección de Clases Virtuales.`,
  eprof:`<b>👩‍🏫 Mis Profesores</b><br>Lista de todos los docentes asignados a tu salón con sus materias y datos de contacto.<br>Consulta aquí el nombre y materias de cada profesor para saber a quién dirigirte.`,
  evir:`<b>💻 Mis Clases Virtuales</b><br>Aquí aparecen los enlaces de reuniones (Meet, Zoom, Teams) que tus docentes han publicado para tu salón.<br>Haz clic en el enlace para unirte a la clase virtual en el horario indicado.`,
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
  return`<div class="ph"><h2>Usuarios Bloqueados</h2><button class="btn xs bg" onclick="showHelp('ablk')" style="margin-top:6px">❓ Ayuda</button></div>
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

  /* Formatea valor A/C/R legible */
  const fmtV = (v) => {
    if(!v || v==='?' || v==='—') return `<span style="color:#a0aec0">${v||'—'}</span>`;
    try{
      const o=JSON.parse(v);
      if(typeof o==='object' && o!==null && ('a' in o||'c' in o||'r' in o)){
        const p=[];
        if(o.a!==undefined) p.push(`<b style="color:#3182ce">Apt</b> ${Number(o.a).toFixed(1)}`);
        if(o.c!==undefined) p.push(`<b style="color:#805ad5">Act</b> ${Number(o.c).toFixed(1)}`);
        if(o.r!==undefined) p.push(`<b style="color:#38a169">Res</b> ${Number(o.r).toFixed(1)}`);
        return `<span style="font-size:.78rem;line-height:1.6">${p.join(' · ')}</span>`;
      }
    }catch(_){}
    const n=parseFloat(v);
    if(!isNaN(n)) return `<b>${fmt(n)}</b>`;
    return `<span style="font-size:.82rem">${esc(String(v))}</span>`;
  };

  /* Nombre legible del campo */
  const fmtCampo = (mat, accion) => {
    if(accion && !mat) return `<span style="color:#718096;font-size:.82rem">📌 ${esc(accion)}</span>`;
    if(!mat) return '<span style="color:#a0aec0">—</span>';
    /* mat suele ser "Matemáticas (Periodo 1)" */
    const match = mat.match(/^(.+?)\s*\((.+?)\)$/);
    if(match) return `<div style="font-size:.82rem"><b>${esc(match[1])}</b><br><span style="color:#718096">${esc(match[2])}</span></div>`;
    /* mat con sufijo (a),(c),(r) = subcampo */
    const sub = mat.match(/^(.+?)\(([acr])\)$/);
    if(sub){
      const lbl={a:'Aptitud',c:'Actitud',r:'Responsab.'}[sub[2]]||sub[2];
      return `<div style="font-size:.82rem"><b>${esc(sub[1])}</b><br><span style="color:#718096">${lbl}</span></div>`;
    }
    /* Acciones especiales */
    const icons={'Sesión cerrada':'🔒','login':'🔑','Login':'🔑','Auditoria limpiada':'🗑️','bloqueado':'🔴','desbloqueado':'🟢','taller':'📎'};
    const icon=Object.entries(icons).find(([k])=>mat.includes(k))?.[1]||'';
    return `<span style="font-size:.82rem">${icon} ${esc(mat)}</span>`;
  };

  /* Nombre del estudiante desde DB si está disponible */
  const fmtEst = (estId) => {
    if(!estId) return '<span style="color:#a0aec0">—</span>';
    const e = DB.ests?.find(x=>x.id===estId);
    if(e) return `<div style="font-size:.82rem"><b>${esc(e.nombre)}</b><br><span style="color:#a0aec0;font-size:.75rem">${esc(estId.slice(-10))}</span></div>`;
    return `<span style="font-size:.78rem;color:#718096">${esc(estId.slice(-12))}</span>`;
  };

  const fmtTs = (ts) => {
    if(!ts) return '—';
    try{
      const d=new Date(ts);
      if(isNaN(d)) return ts.slice(0,16);
      return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})
        +' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    }catch(_){return ts.slice(0,16);}
  };

  return`<div class="ph"><h2>Historial de Auditoría</h2><button class="btn xs bg" onclick="showHelp('aaud')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="card"><div class="chd">
    <span class="cti">📋 Cambios (${list.length})</span>
    <div style="display:flex;gap:8px">
      <button class="btn bg sm" onclick="expAudXls()">📤 Excel</button>
      <button class="btn br sm" onclick="clearAudit()">🗑️ Limpiar historial</button>
    </div>
  </div>
  <div class="tw"><table><thead>
    <tr><th>Fecha</th><th>Por</th><th>Estudiante</th><th>Campo</th><th>Anterior</th><th>Nueva</th><th>IP</th></tr>
  </thead><tbody>${list.length?list.map(l=>`<tr>
    <td style="font-family:var(--mn);font-size:.75rem;white-space:nowrap">${fmtTs(l.ts)}</td>
    <td><span class="bdg ${l.role==='admin'?'bor':'bbl'}" style="font-size:.75rem">${esc(l.who||l.user||'—')}</span></td>
    <td>${fmtEst(l.est)}</td>
    <td>${fmtCampo(l.mat,l.accion)}</td>
    <td>${fmtV(l.old)}</td>
    <td>${fmtV(l.nw)}</td>
    <td style="font-family:var(--mn);font-size:.72rem;color:#a0aec0">${l.ip||'—'}</td>
  </tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--sl3)">Sin registros</td></tr>'}
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
  return`<div class="ph"><h2>Exportar Datos</h2><button class="btn xs bg" onclick="showHelp('aexp')" style="margin-top:6px">❓ Ayuda</button></div>
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
          ${DB.ests.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(e=>`<option value="${e.id}">${esc(e.nombre)} — ${e.salon||'Sin salón'}</option>`).join('')}
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
        <td><strong>${esc(e.nombre)}</strong></td>
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
    i++;setTimeout(next,3500);
  }
  sw('info',`Descargando ${conDatos.length} boletín(es)...`,
    ests.length-conDatos.length>0?`(${ests.length-conDatos.length} estudiante(s) sin notas omitidos)`:'');
  setTimeout(next,800);
}

/* ============================================================
   ADMIN — HISTORIAL DE ESTUDIANTES
============================================================ */
function pgAHist(){
  return`<div class="ph"><h2>Historial de Estudiantes</h2>
    <p>Registro de todos los estudiantes que alguna vez fueron dados de alta en el sistema.</p><button class="btn xs bg" onclick="showHelp('ahist')" style="margin-top:6px">❓ Ayuda</button></div>
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

/* ============================================================
   ADMIN — COMUNICADOS
============================================================ */
function _comColorStyle(color){
  const map={
    azul:   {bg:'#ebf8ff',border:'#3182ce',icon:'🔵',badge:'#3182ce'},
    verde:  {bg:'#f0fff4',border:'#38a169',icon:'🟢',badge:'#38a169'},
    naranja:{bg:'#fffaf0',border:'#dd6b20',icon:'🟠',badge:'#dd6b20'},
    rojo:   {bg:'#fff5f5',border:'#e53e3e',icon:'🔴',badge:'#e53e3e'},
    morado: {bg:'#faf5ff',border:'#805ad5',icon:'🟣',badge:'#805ad5'},
  };
  return map[color]||map.azul;
}

function pgACom(){
  return`<div class="ph"><h2>📢 Comunicados</h2><button class="btn xs bg" onclick="showHelp('acom')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="g2">
    <div class="card">
      <div class="chd"><span class="cti">➕ Nuevo Comunicado</span></div>
      <div class="fg">
        <div class="fld" style="grid-column:1/-1"><label>Título</label>
          <input id="comTit" placeholder="Ej: Reunión de padres de familia" style="width:100%">
        </div>
        <div class="fld" style="grid-column:1/-1"><label>Mensaje</label>
          <textarea id="comMsg" rows="4" placeholder="Escribe el contenido del comunicado..." style="width:100%;resize:vertical;padding:8px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:inherit"></textarea>
        </div>
        <div class="fld"><label>Dirigido a</label>
          <select id="comPara">
            <option value="todos">👥 Todos (profesores y estudiantes)</option>
            <option value="profe">👩‍🏫 Solo Profesores</option>
            <option value="est">🎓 Solo Estudiantes</option>
          </select>
        </div>
        <div class="fld"><label>Color / Tipo</label>
          <select id="comColor">
            <option value="azul">🔵 Azul — Informativo</option>
            <option value="verde">🟢 Verde — Positivo / Éxito</option>
            <option value="naranja">🟠 Naranja — Atención</option>
            <option value="rojo">🔴 Rojo — Urgente</option>
            <option value="morado">🟣 Morado — Evento especial</option>
          </select>
        </div>
        <div class="fld"><label>Fecha inicio</label>
          <input type="date" id="comFi" value="${today()}">
        </div>
        <div class="fld"><label>Fecha fin</label>
          <input type="date" id="comFf">
        </div>
      </div>
      <button class="btn bn" style="margin-top:12px" onclick="publicarComunicado()">📢 Publicar Comunicado</button>
    </div>
    <div class="card">
      <div class="chd"><span class="cti">📋 Comunicados Creados</span></div>
      <div id="comListW"><div class="mty"><div class="ei">📢</div><p>Cargando…</p></div></div>
    </div>
  </div>`;
}

async function initACom(){
  // Set default end date to 7 days from now
  const d=new Date();d.setDate(d.getDate()+7);
  const ff=gi('comFf');if(ff)ff.value=d.toISOString().slice(0,10);
  // Refresh comunicados from server to show current state
  try {
    const fresh = await apiFetch('/api/comunicados');
    if(Array.isArray(fresh)) DB.comunicados = fresh;
  } catch(e){}
  await renderComList();
}

async function renderComList(){
  const el=gi('comListW');if(!el)return;
  try{
    const lista=await cargarTodosComunicados();
    if(!lista.length){el.innerHTML='<div class="mty"><div class="ei">📢</div><p>Sin comunicados creados</p></div>';return;}
    const hoy=today();
    el.innerHTML=lista.map(c=>{
      const cs=_comColorStyle(c.color);
      const vigente=c.activo&&c.fechaInicio<=hoy&&c.fechaFin>=hoy;
      const esSA=!!(c.esSuperAdmin);
      const paraLabel={todos:'👥 Todos',profe:'👩‍🏫 Profesores',est:'🎓 Estudiantes'}[c.para]||c.para;
      return`<div style="border:1.5px solid ${cs.border};border-radius:10px;background:${cs.bg};padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px;margin-bottom:4px">${cs.icon} ${esc(c.titulo)} ${esSA?'<span class="bdg" style="background:#553c9a;color:#fff;font-size:9px">🌐 Plataforma</span>':''}</div>
            <div style="font-size:12px;color:var(--sl2);white-space:pre-line;line-height:1.6">${esc(c.mensaje)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
            <span class="bdg" style="background:${cs.badge};color:#fff;font-size:10px">${paraLabel}</span>
            <span class="bdg ${vigente?'bgr':'brd'}" style="font-size:10px">${vigente?'✅ Activo':'⭕ Inactivo'}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
          <span style="font-size:11px;color:var(--sl3)">📅 ${c.fechaInicio} → ${c.fechaFin}</span>
          ${esSA
            ? `<span style="font-size:11px;color:#805ad5;font-style:italic">Solo lectura — enviado por la plataforma</span>`
            : `<div style="display:flex;gap:8px">
                <button class="btn xs ${c.activo?'brd':'bgr'} sm" onclick="toggleComunicado('${c.id}',${!c.activo})">${c.activo?'⏸ Desactivar':'▶ Activar'}</button>
                <button class="btn xs br sm" onclick="borrarComunicado('${c.id}')">🗑️ Eliminar</button>
              </div>`
          }
        </div>
      </div>`;
    }).join('');
  }catch(e){el.innerHTML='<div class="al aly">Error al cargar comunicados</div>';}
}

async function publicarComunicado(){
  const tit=(gi('comTit')?.value||'').trim();
  const msg=(gi('comMsg')?.value||'').trim();
  const para=gi('comPara')?.value||'todos';
  const color=gi('comColor')?.value||'azul';
  const fi=gi('comFi')?.value||'';
  const ff=gi('comFf')?.value||'';
  if(!tit){sw('warning','Escribe un título para el comunicado');return;}
  if(!msg){sw('warning','Escribe el mensaje del comunicado');return;}
  if(!fi||!ff){sw('warning','Selecciona las fechas de inicio y fin');return;}
  if(fi>ff){sw('warning','La fecha de fin debe ser igual o posterior al inicio');return;}
  const com=await crearComunicado({titulo:tit,mensaje:msg,para,color,fechaInicio:fi,fechaFin:ff});
  if(com){
    sw('success','📢 Comunicado publicado');
    gi('comTit').value='';gi('comMsg').value='';
    await renderComList();
  }
}

async function toggleComunicado(id,activo){
  // FIX: solo mandar el campo que cambia para evitar enviar _id u otros campos internos
  await editarComunicado(id,{activo});
  await renderComList();
}

async function borrarComunicado(id){
  const r=await Swal.fire({title:'¿Eliminar comunicado?',text:'Esta acción no se puede deshacer.',icon:'warning',showCancelButton:true,confirmButtonColor:'#e53e3e',confirmButtonText:'Sí, eliminar',cancelButtonText:'Cancelar'});
  if(!r.isConfirmed)return;
  await eliminarComunicado(id);
  await renderComList();
}

/* ── SOBREESCRITA por api-layer.js ── */
async function crearComunicado(d){ /* implementado en api-layer.js */ }
async function editarComunicado(id,d){ /* implementado en api-layer.js */ }
async function eliminarComunicado(id){ /* implementado en api-layer.js */ }
async function cargarTodosComunicados(){ /* implementado en api-layer.js */ }

function pgAExc(){return`<div class="ph"><h2>Excusas Recibidas</h2><p>Horario de envío: 18:00 – 07:00</p><button class="btn xs bg" onclick="showHelp('aexc')" style="margin-top:6px">❓ Ayuda</button></div><div id="aexcB"></div>`;}
function initAExc(){
  const el=gi('aexcB');if(!el)return;
  const list=(DB.exc||[]).slice().reverse();
  if(!list.length){el.innerHTML='<div class="mty"><div class="ei">✉️</div><p>Sin excusas</p></div>';return;}
  el.innerHTML=list.map(x=>{
    const yaRespondida=!!(x.respProf);
    const talleresList=(x.talleres||[]).map(t=>`<div style="font-size:11px;padding:3px 7px;background:#ebf8ff;border-radius:5px;display:inline-block;margin:2px">📎 ${t.nombre}</div>`).join('');
    return`<div class="card" style="margin-bottom:12px">
      <div class="chd" style="display:flex;justify-content:space-between;align-items:center">
        <span class="cti">✉️ ${x.enombre} <span class="bdg bgy" style="font-size:10px">${x.salon||'—'}</span></span>
        <span class="bdg ${yaRespondida?'bgr':'bor'}">${yaRespondida?'✅ Respondida':'⏳ Sin respuesta'}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <span style="font-size:12px">📅 <strong>Fecha:</strong> ${x.fecha}</span>
        <span style="font-size:12px">👤 <strong>Dirigida a:</strong> ${x.dest}</span>
        <span style="font-size:12px">📋 <strong>Causa:</strong> <span class="bdg bor">${x.causa}</span></span>
        <span style="font-size:12px">🕐 ${x.ts?.split(',')[1]?.trim()||'—'}</span>
      </div>
      ${x.desc?`<div style="font-size:12px;color:var(--sl2);margin-bottom:8px">💬 ${x.desc}</div>`:''}
      ${yaRespondida?`<div style="background:#f0fff4;border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px">
        <strong>✅ Respuesta de ${x.respProfNombre||'Profesor'}:</strong> ${x.respProf}
        ${x.diasExtra>0?`<br>⏰ <strong>Tiempo prolongado:</strong> ${x.diasExtra} día(s) extra — Entrega límite: ${x.fechaLimite||'—'}`:''}
        ${talleresList?`<br><div style="margin-top:5px">📚 Talleres adjuntos:<br>${talleresList}</div>`:''}
        <div style="font-size:10px;color:var(--sl3);margin-top:4px">${x.respTs||''} ${x.respLeida?'<span class=\'bdg bgr\' style=\'font-size:9px\'>Vista por estudiante</span>':''}</div>
      </div>`:''}
      <button class="btn ${yaRespondida?'bs':'bn'} sm" onclick="responderExcusa('${x._id}')">
        ${yaRespondida?'✏️ Editar respuesta':'📨 Responder con talleres'}
      </button>
    </div>`;
  }).join('');
}
async function responderExcusa(excId){
  const exc=(DB.exc||[]).find(x=>x._id===excId||x.id===excId);
  if(!exc){sw('error','Excusa no encontrada');return;}
  // Construir html del modal
  const html=`<div style="text-align:left;font-family:var(--fn)">
    <div style="background:#ebf8ff;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px">
      <strong>Estudiante:</strong> ${exc.enombre} (${exc.salon||'—'})<br>
      <strong>Causa:</strong> ${exc.causa} — <strong>Fecha:</strong> ${exc.fecha}
    </div>
    <div class="fld" style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Respuesta / instrucciones para el estudiante</label>
      <textarea id="rpResp" style="width:100%;padding:9px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;min-height:80px" placeholder="Escribe las instrucciones o actividades que debe realizar...">${exc.respProf||''}</textarea>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <div class="fld" style="flex:1;margin:0">
        <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Días extra de tiempo</label>
        <input type="number" id="rpDias" min="0" max="30" value="${exc.diasExtra||0}" style="width:100%;padding:9px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px">
      </div>
      <div class="fld" style="flex:1;margin:0">
        <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Fecha límite entrega</label>
        <input type="date" id="rpFecha" value="${exc.fechaLimite||''}" style="width:100%;padding:9px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px">
      </div>
    </div>
    <div class="fld" style="margin-bottom:8px">
      <label style="font-size:11px;font-weight:700;color:var(--sl);text-transform:uppercase">Adjuntar talleres/archivos (opcional)</label>
      <input type="file" id="rpFiles" multiple accept=".pdf,.doc,.docx,.jpg,.png,.xlsx,.txt"
        style="width:100%;padding:8px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:12px;background:var(--bg2)">
      <div id="rpFileList" style="margin-top:6px">
        ${(exc.talleres||[]).map(t=>`<div style="font-size:11px;padding:3px 7px;background:#ebf8ff;border-radius:5px;display:inline-block;margin:2px">📎 ${t.nombre}</div>`).join('')}
      </div>
    </div>
  </div>`;
  const res=await Swal.fire({
    title:'📨 Responder Excusa',width:520,html,showCancelButton:true,
    confirmButtonText:'✅ Enviar respuesta',cancelButtonText:'Cancelar',
    confirmButtonColor:'#2b6cb0',
    preConfirm:async()=>{
      const resp=gi('rpResp')?.value.trim();
      if(!resp){Swal.showValidationMessage('Escribe una respuesta al estudiante');return false;}
      const dias=parseInt(gi('rpDias')?.value)||0;
      const fecha=gi('rpFecha')?.value||'';
      // Leer archivos
      const fileInput=gi('rpFiles');
      const talleres=[];
      if(fileInput?.files?.length){
        for(const f of fileInput.files){
          const b64=await new Promise((ok,fail)=>{
            const r=new FileReader();
            r.onload=()=>ok(r.result.split(',')[1]);
            r.onerror=()=>fail(new Error('Error leyendo archivo'));
            r.readAsDataURL(f);
          });
          talleres.push({nombre:f.name,tipo:f.type,base64:b64,tamanio:(f.size/1024).toFixed(1)+'KB'});
        }
      }
      // Si no se adjuntaron archivos nuevos pero había anteriores, conservar
      if(!talleres.length&&(exc.talleres||[]).length) talleres.push(...exc.talleres);
      return{resp,dias,fecha,talleres};
    }
  });
  if(!res.isConfirmed||!res.value)return;
  const{resp,dias,fecha,talleres}=res.value;
  try{
    const updated=await apiFetch(`/api/excusas/${excId}/responder`,{
      method:'PUT',
      body:JSON.stringify({respProf:resp,diasExtra:dias,fechaLimite:fecha,talleres})
    });
    // Actualizar en DB local inmediatamente
    const idx=(DB.exc||[]).findIndex(x=>x._id===excId||x.id===excId);
    if(idx>=0) DB.exc[idx]=updated;
    // Re-renderizar lista de excusas para mostrar "Respondida" de inmediato
    initAExc();
    // Mostrar confirmación con resumen de lo enviado
    await Swal.fire({
      icon:'success',
      title:'✅ Respuesta enviada',
      html:`<div style="text-align:left;font-family:var(--fn);font-size:13px">
        <div style="background:#f0fff4;border-radius:8px;padding:10px;margin-bottom:10px">
          <strong>Estudiante:</strong> ${exc.enombre}<br>
          <strong>Tu respuesta:</strong> ${resp}<br>
          ${dias>0?`<strong>Tiempo extra:</strong> ${dias} día(s) — Entrega límite: ${fecha||'—'}<br>`:''}
          ${talleres.length?`<strong>Talleres adjuntos:</strong> ${talleres.length} archivo(s)`:''}
        </div>
        <div style="background:#fffbeb;border:1.5px solid #f6ad55;border-radius:8px;padding:10px;font-size:12px;color:#c05621">
          ⚠️ El estudiante verá esta respuesta en su bandeja de excusas junto con el recordatorio de entregar el trabajo a tiempo.
        </div>
      </div>`,
      confirmButtonText:'Aceptar',
      confirmButtonColor:'#276749',
      timer:6000,timerProgressBar:true
    });
  }catch(e){sw('error','Error: '+e.message);}
}

/* ============================================================
   ADMIN — CLASES VIRTUALES
============================================================ */
function pgAVcl(){return`<div class="ph"><h2>Clases Virtuales</h2><button class="btn xs bg" onclick="showHelp('avcl')" style="margin-top:6px">❓ Ayuda</button></div><div id="avcB"></div>`;}
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
   PROFE / ESTUDIANTE — VER COMUNICADOS (solo lectura)
============================================================ */
function pgComVer(){
  return`<div class="ph"><h2>📢 Comunicados</h2><p>Avisos del colegio para ti</p></div>
  <div id="comVerW"><div class="mty"><div class="ei">📢</div><p>Cargando…</p></div></div>`;
}
function initComVer(){
  const el=gi('comVerW');if(!el)return;
  // Fetch fresh so profe/est always see latest comunicados (including new SA ones)
  apiFetch('/api/comunicados').then(fresh=>{
    if(Array.isArray(fresh)) DB.comunicados=(DB.comunicados||[]).filter(c=>c.colegioId).concat(fresh.filter(c=>c.esSuperAdmin)).map(x=>x); // merge, then re-render
    _renderComVer(el);
  }).catch(()=>_renderComVer(el));
}
function _renderComVer(el){
  const role=CU?.role;
  const hoy=today();
  const coms=(DB.comunicados||[]).filter(c=>{
    if(!c.activo) return false;
    if(c.fechaFin<hoy||c.fechaInicio>hoy) return false;
    if(c.para==='todos') return true;
    if(role==='admin' && c.para==='admin') return true;
    return c.para===role;
  });
  if(!coms.length){
    el.innerHTML='<div class="card"><div class="mty"><div class="ei">📢</div><p>No hay comunicados activos en este momento</p></div></div>';
    return;
  }
  const colorMap={
    azul:  {hdr:'#2b6cb0',bg:'#ebf8ff',border:'#bee3f8',icon:'🔵'},
    verde: {hdr:'#276749',bg:'#f0fff4',border:'#9ae6b4',icon:'🟢'},
    naranja:{hdr:'#c05621',bg:'#fffaf0',border:'#fbd38d',icon:'🟠'},
    rojo:  {hdr:'#c53030',bg:'#fff5f5',border:'#feb2b2',icon:'🔴'},
    morado:{hdr:'#553c9a',bg:'#faf5ff',border:'#d6bcfa',icon:'🟣'},
  };
  el.innerHTML=coms.map(c=>{
    const cs=colorMap[c.color]||colorMap.azul;
    return`<div style="background:${cs.bg};border:1.5px solid ${cs.border};border-left:5px solid ${cs.hdr};border-radius:0 12px 12px 0;padding:18px 20px;margin-bottom:14px">
      <div style="font-weight:800;font-size:16px;color:${cs.hdr};margin-bottom:8px">${cs.icon} ${esc(c.titulo)}</div>
      <div style="font-size:14px;color:#2d3748;white-space:pre-line;line-height:1.8">${esc(c.mensaje)}</div>
      <div style="font-size:11px;color:#718096;margin-top:10px;display:flex;gap:16px;flex-wrap:wrap">
        <span>📅 Vigente hasta: <strong>${c.fechaFin}</strong></span>
        ${c.creadoPor?`<span>👤 Publicado por: <strong>${esc(c.creadoPor)}</strong></span>`:''}
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   PROFESOR — HOME
============================================================ */
function pgPH(){
  const p=CU;
  const _logoP=DB.colegioLogo||'';
  const _nomP=CU.colegioNombre||'';
  const sals=p.salones||[];
  const totalEst=sals.reduce((t,s)=>t+ebySalon(s).length,0);
  const excTotal=DB.exc.filter(x=>x.dest===CU.nombre||sals.includes(x.salon));
  const excPend=excTotal.filter(x=>!x.respProf).length;
  const pendRec=DB.ext.on?(DB.recs||[]).filter(r=>r.profId===CU.id&&!r.revisado).length:0;

  return`
  <!-- HEADER -->
  <div class="ph" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
    <div>
      <h2 style="margin-bottom:2px">Bienvenido, ${esc(p.nombre)}</h2>
      <span class="bdg ${p.ciclo==='bachillerato'?'bte':'bbl'}" style="font-size:11px">${p.ciclo==='bachillerato'?'Bachillerato':'Primaria'}</span>
      <button class="btn xs bg" onclick="showHelp('ph')" style="margin-left:8px">❓ Ayuda</button>
    </div>
    ${_logoP?`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <img src="${_logoP}" alt="Logo" style="height:64px;width:auto;max-width:110px;object-fit:contain;border-radius:10px;background:var(--bg2);padding:5px">
      ${_nomP?`<span style="font-size:10px;font-weight:700;color:var(--sl2);max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_nomP}</span>`:''}
    </div>`:''}
  </div>

  <!-- RESUMEN RÁPIDO -->
  <div class="sr" style="margin-bottom:16px">
    <div class="scc" data-i="🏫"><div class="sv">${sals.length}</div><div class="sl">Salones</div><div class="bar"></div></div>
    <div class="scc" data-i="🎓"><div class="sv">${totalEst}</div><div class="sl">Estudiantes</div><div class="bar"></div></div>
    <div class="scc" data-i="✉️" style="cursor:pointer" onclick="document.getElementById('phTabExc').click()">
      <div class="sv" style="color:${excPend>0?'var(--red)':'var(--grn)'}">${excPend>0?excPend:'✓'}</div>
      <div class="sl">${excPend>0?'Excusas pend.':'Sin pendientes'}</div><div class="bar"></div>
    </div>
    ${pendRec?`<div class="scc" data-i="🔄" style="cursor:pointer" onclick="goto('prec')">
      <div class="sv" style="color:var(--ora)">${pendRec}</div>
      <div class="sl">Recup. pend.</div><div class="bar"></div>
    </div>`:''}
  </div>

  ${pendRec?`<div class="al aly" style="cursor:pointer;margin-bottom:12px" onclick="goto('prec')">
    🔄 Tienes <strong>${pendRec}</strong> recuperación(es) pendiente(s) de revisión. <span style="text-decoration:underline">Ver ahora →</span>
  </div>`:''}

  <!-- TABS PRINCIPALES -->
  <div class="card" style="padding:0;overflow:hidden">
    <!-- Tab bar -->
    <div id="phTabBar" style="display:flex;border-bottom:2px solid var(--bd);background:var(--bg2);overflow-x:auto">
      ${sals.map((sal,i)=>{
        const n=ebySalon(sal).length;
        const excSal=excTotal.filter(x=>x.salon===sal&&!x.respProf).length;
        return`<button id="phTab_${sal}" onclick="phTab('${sal}')"
          style="padding:12px 20px;border:none;background:${i===0?'var(--bg)':'transparent'};border-bottom:${i===0?'2px solid var(--nv)':'2px solid transparent'};
          margin-bottom:-2px;font-size:13px;font-weight:${i===0?'800':'600'};color:${i===0?'var(--nv)':'var(--sl2)'};
          cursor:pointer;white-space:nowrap;transition:all .15s;display:flex;align-items:center;gap:6px">
          🏫 ${sal}
          <span style="background:#e2e8f0;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700">${n}</span>
          ${excSal?`<span style="background:var(--red);color:#fff;border-radius:20px;padding:1px 6px;font-size:10px;font-weight:800">✉${excSal}</span>`:''}
        </button>`;
      }).join('')}
      <button id="phTabExc" onclick="phTab('__exc')"
        style="padding:12px 20px;border:none;background:transparent;border-bottom:2px solid transparent;
        margin-bottom:-2px;font-size:13px;font-weight:600;color:${excPend>0?'var(--red)':'var(--sl2)'};
        cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px">
        ✉️ Excusas
        ${excPend?`<span style="background:var(--red);color:#fff;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:800">${excPend}</span>`:`<span style="background:#c6f6d5;color:#276749;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:800">✓</span>`}
      </button>
      <button id="phTabRpt" onclick="phTab('__rpt')"
        style="padding:12px 20px;border:none;background:transparent;border-bottom:2px solid transparent;
        margin-bottom:-2px;font-size:13px;font-weight:600;color:var(--sl2);cursor:pointer;white-space:nowrap">
        📥 Informes
      </button>
    </div>

    <!-- Tab content -->
    <div id="phTabContent" style="padding:16px">
      ${sals.length?renderPhSalonTab(sals[0]):'<div class="mty"><p>Sin salones asignados</p></div>'}
    </div>
  </div>`;
}

/* Renderiza el contenido de un tab de salón */
function renderPhSalonTab(sal){
  const ests=ebySalon(sal);
  if(!ests.length) return`<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes en ${sal}</p></div>`;

  // Stats del salón
  const perActivo=DB.pers[DB.pers.length-1]||'';
  const conNotas=ests.filter(e=>getMats(e.id).some(m=>{const t=DB.notas[e.id]?.[perActivo]?.[m];return t&&(t.a>0||t.c>0||t.r>0);})).length;
  const sinNotas=ests.length-conNotas;
  const excSal=DB.exc.filter(x=>(x.salon===sal||x.dest===CU.nombre)&&!x.respProf);

  return`
  <!-- Acciones rápidas del salón -->
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center">
    <button class="btn bg" onclick="irANotasSalon('${sal}')">📝 Ingresar notas</button>
    <button class="btn bs" onclick="irAAsistSalon('${sal}')">✅ Asistencia</button>
    <button class="btn bs" onclick="selRptProf('${sal}',DB.pers[0]||'','pdf')">📄 PDF Informe</button>
    <button class="btn bs" onclick="selRptProf('${sal}',DB.pers[0]||'','xls')">📊 Excel</button>
    ${excSal.length?`<span style="margin-left:auto;font-size:12px;color:var(--red);font-weight:700">⚠️ ${excSal.length} excusa${excSal.length>1?'s':''} sin responder</span>`:''}
  </div>

  <!-- Progreso notas -->
  ${perActivo?`<div style="background:var(--bg2);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--sl2)">Notas ${perActivo}:</span>
    <div style="flex:1;min-width:120px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${ests.length?Math.round(conNotas/ests.length*100):0}%;background:var(--grn);border-radius:4px;transition:width .4s"></div>
    </div>
    <span style="font-size:12px;font-weight:700;color:var(--grn)">${conNotas} con notas</span>
    ${sinNotas?`<span style="font-size:12px;color:var(--sl3)">· ${sinNotas} sin ingresar</span>`:''}
  </div>`:''}

  <!-- Buscador + lista estudiantes -->
  <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
    <input id="phBusq_${sal}" placeholder="🔍 Buscar estudiante en ${sal}…"
      style="flex:1;padding:8px 12px;border:1px solid var(--bd);border-radius:8px;font-size:13px;font-family:var(--fn)"
      oninput="filtrarPhEsts('${sal}')">
    <span id="phCount_${sal}" style="font-size:12px;color:var(--sl2);white-space:nowrap">${ests.length} est.</span>
  </div>
  <div id="phEstList_${sal}" style="display:flex;flex-wrap:wrap;gap:6px">
    ${ests.map(e=>{
      const tieneN=getMats(e.id).some(m=>{const t=DB.notas[e.id]?.[perActivo]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
      const excEst=DB.exc.filter(x=>x.eid===e.id&&!x.respProf).length;
      return`<span data-nombre="${e.nombre.toLowerCase()}"
        style="font-size:12px;padding:5px 11px;background:${tieneN?'#f0fff4':'var(--bg2)'};border-radius:7px;
        border:1px solid ${tieneN?'#9ae6b4':'var(--bd)'};display:inline-flex;align-items:center;gap:4px">
        ${esc(e.nombre)}
        ${excEst?`<span style="background:var(--red);color:#fff;border-radius:10px;padding:0 5px;font-size:9px;font-weight:800">${excEst}</span>`:''}
      </span>`;
    }).join('')}
  </div>`;
}

/* Renderiza tab de excusas con filtros */
function renderPhExcTab(){
  const sals=CU.salones||[];
  const todas=DB.exc.filter(x=>x.dest===CU.nombre||sals.includes(x.salon))
    .slice().sort((a,b)=>(b.ts||b.fecha||'').localeCompare(a.ts||a.fecha||''));
  const pendientes=todas.filter(x=>!x.respProf);
  const respondidas=todas.filter(x=>!!x.respProf);

  if(!todas.length) return`<div class="mty" style="padding:24px"><div class="ei">📬</div><p>Sin excusas recibidas</p></div>`;

  const renderExc=(list,label)=>{
    if(!list.length) return`<p style="font-size:13px;color:var(--sl3);padding:8px 0">Sin ${label}</p>`;
    return list.map(x=>{
      const yaResp=!!(x.respProf);
      return`<div style="border:1px solid ${yaResp?'#9ae6b4':'var(--red)'};border-left:4px solid ${yaResp?'#68d391':'var(--red)'};
        border-radius:8px;padding:12px;margin-bottom:8px;background:${yaResp?'#f0fff4':'#fff5f5'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
              <strong style="font-size:13px">${esc(x.enombre||'—')}</strong>
              <span class="bdg bgy" style="font-size:10px">${x.salon||'—'}</span>
              <span class="bdg bor" style="font-size:10px">${x.causa||'—'}</span>
              ${!yaResp?'<span class="bdg brd" style="font-size:9px">PENDIENTE</span>':''}
            </div>
            <span style="font-size:11px;color:var(--sl2)">📅 ${x.fecha||'—'}</span>
            ${x.desc?`<div style="font-size:11px;color:var(--sl3);margin-top:3px">💬 ${esc(x.desc)}</div>`:''}
          </div>
          <button class="btn ${yaResp?'bs':'bn'} sm" onclick="responderExcusa('${x._id||x.id}')">
            ${yaResp?'✏️ Ver/Editar':'📨 Responder'}
          </button>
        </div>
        ${yaResp?`<div style="margin-top:8px;font-size:11px;background:#e6fffa;border-radius:6px;padding:8px;border:1px solid #b2f5ea">
          ✅ <strong>Tu respuesta:</strong> ${esc(x.respProf)}
          ${x.diasExtra>0?`<br>⏰ ${x.diasExtra} día(s) extra — Límite: ${x.fechaLimite||'—'}`:''}
          ${(x.talleres||[]).length?`<br>📎 ${x.talleres.length} taller(es) adjunto(s)`:''}
          ${x.respLeida?'<span class="bdg bgr" style="font-size:9px;margin-left:4px">✓ Vista por estudiante</span>':''}
        </div>`:''}
      </div>`;
    }).join('');
  };

  return`
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <span style="font-size:13px;font-weight:700">${todas.length} excusa${todas.length>1?'s':''} en total</span>
    ${pendientes.length?`<span class="bdg brd">${pendientes.length} sin responder</span>`:'<span class="bdg bgr">✓ Todas respondidas</span>'}
  </div>
  ${pendientes.length?`
  <div style="margin-bottom:20px">
    <div style="font-size:12px;font-weight:800;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">
      🔴 Sin Responder (${pendientes.length})
    </div>
    ${renderExc(pendientes,'pendientes')}
  </div>`:''}
  <div>
    <div style="font-size:12px;font-weight:800;color:var(--sl2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">
      ✅ Respondidas (${respondidas.length})
    </div>
    ${renderExc(respondidas,'respondidas')}
  </div>`;
}

/* Renderiza tab de informes */
function renderPhRptTab(){
  const sals=CU.salones||[];
  return`
  <p style="font-size:13px;color:var(--sl2);margin-bottom:16px">Descarga el informe de cualquier salón y periodo directamente.</p>
  <div style="display:grid;gap:12px">
    ${sals.map(sal=>`
    <div style="border:1px solid var(--bd);border-radius:10px;padding:14px;background:var(--bg2)">
      <div style="font-size:14px;font-weight:800;margin-bottom:10px">🏫 ${sal}
        <span class="bdg bgy" style="margin-left:6px">${ebySalon(sal).length} est.</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${DB.pers.map(per=>`
        <button class="btn bs sm" onclick="selRptProf('${sal}','${per}','pdf')">📄 ${per} PDF</button>
        <button class="btn bs sm" onclick="selRptProf('${sal}','${per}','xls')">📊 ${per} Excel</button>`).join('')}
      </div>
    </div>`).join('')}
  </div>`;
}

/* Cambia entre tabs del panel profesor */
function phTab(key){
  const sals=CU.salones||[];
  const content=gi('phTabContent');
  if(!content) return;

  // Reset all tab styles
  [...(sals.map(s=>'phTab_'+s)),['phTabExc'],['phTabRpt']].flat().forEach(id=>{
    const b=gi(id); if(!b) return;
    b.style.background='transparent';
    b.style.borderBottom='2px solid transparent';
    b.style.fontWeight='600';
    b.style.color=id==='phTabExc'&&(DB.exc.filter(x=>x.dest===CU.nombre||(CU.salones||[]).includes(x.salon)&&!x.respProf).length)?'var(--red)':'var(--sl2)';
  });

  // Activate selected tab
  const activeId=key==='__exc'?'phTabExc':key==='__rpt'?'phTabRpt':'phTab_'+key;
  const activeBtn=gi(activeId);
  if(activeBtn){
    activeBtn.style.background='var(--bg)';
    activeBtn.style.borderBottom='2px solid var(--nv)';
    activeBtn.style.fontWeight='800';
    activeBtn.style.color='var(--nv)';
  }

  // Render content
  if(key==='__exc') content.innerHTML=renderPhExcTab();
  else if(key==='__rpt') content.innerHTML=renderPhRptTab();
  else content.innerHTML=renderPhSalonTab(key);
}

/* Filtrar estudiantes en la lista del salón */
function filtrarPhEsts(sal){
  const q=(gi('phBusq_'+sal)?.value||'').toLowerCase().trim();
  const cnt=gi('phCount_'+sal);
  let visible=0;
  document.querySelectorAll('#phEstList_'+sal+' > span[data-nombre]').forEach(el=>{
    const match=!q||el.dataset.nombre.includes(q);
    el.style.display=match?'inline-flex':'none';
    if(match) visible++;
  });
  if(cnt) cnt.textContent=q?`${visible} de ${ebySalon(sal).length} est.`:`${ebySalon(sal).length} est.`;
}

/* Navega a Asistencias preseleccionando salón */
function irAAsistSalon(salon){
  goto('past');
  setTimeout(()=>{
    const sel=gi('pass');
    if(sel){ sel.value=salon; sel.dispatchEvent(new Event('change')); }
  },200);
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
      <div>ℹ️ <strong>Sistema tripartita:</strong> Aptitud ${DB.notaPct?.a??60}% + Actitud ${DB.notaPct?.c??20}% + Responsabilidad ${DB.notaPct?.r??20}% = Definitiva.<br>
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
function initPNot(){
  // Recarga DB fresca antes de renderizar — igual que initAEst
  // Garantiza que DB.ests tenga los estudiantes del colegio antes de que
  // el profesor presione Cargar, evitando la tabla vacía.
  if(typeof dbLoad==='function'){
    dbLoad().catch(()=>{}).finally(()=>{
      // Re-renderizar pgPNot con datos frescos si ya estamos en esa página
      const el=gi('pnW');
      if(el && !el.children.length){
        // Tabla aún no cargada — solo actualizar DB, no forzar render
      }
    });
  }
}
function loadPN(){
  const salon=gi('pns')?.value,per=gi('pnp')?.value;
  if(!salon||!per){sw('warning','Selecciona salón y periodo');return;}
  if(!notasOk(per)){sw('error','Ingreso de notas cerrado para este periodo');return;}
  const matSel=gi('pnm')?.value;
  // Trim por si acaso hay espacios extra en el nombre del salón
  const salonClean = (salon||'').trim();
  const ests = ebySalon(salonClean);
  const el=gi('pnW');
  if(!ests.length){
    // Intentar recargar DB y reintentar UNA vez — puede ser que aún no cargó
    if(typeof dbLoad==='function'){
      el.innerHTML='<div style="text-align:center;padding:1rem;color:#718096">🔄 Cargando estudiantes…</div>';
      dbLoad().then(()=>{
        const estsReloaded=ebySalon(salonClean);
        if(estsReloaded.length){ loadPN(); return; }
        el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes en el salón <strong>'+salonClean+'</strong>.<br><small style="color:#a0aec0">Verifica que los estudiantes tengan asignado este salón.</small></p></div>';
      }).catch(()=>{
        el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes en este salón</p></div>';
      });
    } else {
      el.innerHTML='<div class="mty"><div class="ei">🎓</div><p>Sin estudiantes en este salón</p></div>';
    }
    return;
  }
  /* Inicializar notas de TODOS los estudiantes antes de calcular materias */
  ests.forEach(e=>syncN(e.id));
  /* ── Resolución de materias con cascada de fallbacks ── */
  let mats=[];
  const ciclo=CU.ciclo||cicloOf(salon);
  if(ciclo==='bachillerato'){
    // 1) Materias específicas del prof en este salón
    mats=getProfMatsSalon(CU.id,salon);
    // 2) Materias del salón (union de todos los profs)
    if(!mats.length) mats=getSalonMats(salon);
    // 3) Materias del primer estudiante con notas
    if(!mats.length){
      for(const e of ests){ const m=getMats(e.id); if(m.length){mats=m;break;} }
    }
    // 4) Lista global de bachillerato
    if(!mats.length) mats=[...DB.mB];
  } else {
    // 1) Materias del salón (puede tener lista personalizada)
    const sal=DB.sals.find(s=>s.nombre===salon);
    if(sal?.mats?.length) mats=[...sal.mats];
    // 2) Materias del primer estudiante
    if(!mats.length){
      for(const e of ests){ const m=getMats(e.id); if(m.length){mats=m;break;} }
    }
    // 3) Lista global de primaria
    if(!mats.length) mats=[...DB.mP];
  }
  // Filtrar por materia seleccionada si aplica
  if(matSel) mats=[matSel];
  /* Si aún no hay materias, mostrar advertencia clara */
  if(!mats.length){
    el.innerHTML=`<div class="al aly" style="margin-top:10px">
      ⚠️ <strong>No se encontraron materias para el salón ${salon}.</strong><br>
      Verifica que el salón tenga materias asignadas en la configuración del sistema.
    </div>`;
    return;
  }
  // ── Modo compacto vs. tabla según cantidad de estudiantes ──────────────────
  const MODO_CARDS = ests.length >= 10;
  const ep_global = encodeURIComponent(per);

  if (MODO_CARDS) {
    // ── MODO TARJETAS: ideal para 10+ estudiantes ────────────────────────────
    const pct = DB.notaPct || {};
    const pA = pct.a ?? 60, pC = pct.c ?? 20, pR = pct.r ?? 20;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <input id="pnFiltro" placeholder="🔍 Buscar estudiante..." style="flex:1;min-width:180px;padding:7px 12px;border:1px solid var(--bd);border-radius:8px;font-size:13px;font-family:var(--fn)"
          oninput="filtrarPN()">
        <span id="pnContador" style="font-size:12px;color:var(--sl2);white-space:nowrap">${ests.length} estudiantes</span>
        <button class="btn bs sm" onclick="expandAllPN()" style="white-space:nowrap">📂 Expandir todos</button>
        <button class="btn bs sm" onclick="collapseAllPN()" style="white-space:nowrap">📁 Colapsar todos</button>
      </div>
      <div id="pnCards"></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn bg sm" onclick="selRptProf('${salon}','${per}','pdf')">📄 Reporte PDF</button>
        <button class="btn bs sm" onclick="selRptProf('${salon}','${per}','xls')">📊 Descargar Excel</button>
      </div>`;

    function renderCards(lista) {
      const container = gi('pnCards');
      if (!container) return;
      const total = lista.length;
      const conNotas = lista.filter(e => {
        return mats.some(m => { const t = DB.notas[e.id]?.[per]?.[m]; return t && (t.a > 0 || t.c > 0 || t.r > 0); });
      }).length;
      if (gi('pnContador')) gi('pnContador').textContent = `${lista.length} estudiantes — ✅ ${conNotas} con notas`;
      container.innerHTML = lista.map((e, idx) => {
        syncN(e.id);
        const pp = pprom(e.id, per);
        const tieneNotas = mats.some(m => { const t = DB.notas[e.id]?.[per]?.[m]; return t && (t.a > 0 || t.c > 0 || t.r > 0); });
        // Leer SOLO del periodo activo — sin mezclar con el promedio global
        const discVal = typeof DB.notas[e.id]?.[per]?.disciplina === 'number'
          ? DB.notas[e.id][per].disciplina
          : (typeof DB.notas[e.id]?.[per]?._disciplina === 'number' ? DB.notas[e.id][per]._disciplina : 0);
        const condValCard = typeof DB.notas[e.id]?.[per]?.conducta === 'number'
          ? DB.notas[e.id][per].conducta
          : (typeof DB.notas[e.id]?.[per]?._conducta === 'number' ? DB.notas[e.id][per]._conducta : 0);
        const camposHTML = mats.map(m => {
          const t = DB.notas[e.id][per][m] || {a:0,c:0,r:0};
          const d = def(t);
          const em = encodeURIComponent(m);
          const tieneVal = t.a > 0 || t.c > 0 || t.r > 0;
          const clsA = t.a > 0 ? 'niCard nota-ok' : 'niCard nota-vacia';
          const clsC = t.c > 0 ? 'niCard nota-ok' : 'niCard nota-vacia';
          const clsR = t.r > 0 ? 'niCard nota-ok' : 'niCard nota-vacia';
          return `<div style="background:#fff;border-radius:10px;padding:10px 12px;border:1.5px solid ${tieneVal?'#c6f6d5':'#e2e8f0'}">
            <div style="font-size:11px;font-weight:800;color:var(--nv);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em" title="${m}">${m}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px">
              <div>
                <div style="font-size:9px;color:var(--sl3);margin-bottom:3px;text-align:center;font-weight:600">Apt.${pA}%</div>
                <input type="number" class="${clsA} pnInp" min="0" max="5" step="0.1" value="${t.a > 0 ? t.a.toFixed(1) : ''}" placeholder="0.0"
                  data-eid="${e.id}" data-per="${ep_global}" data-mat="${em}" data-f="a"
                  oninput="clampNota(this)" onchange="saveTri(this);this.className='niCard nota-ok pnInp'">
              </div>
              <div>
                <div style="font-size:9px;color:var(--sl3);margin-bottom:3px;text-align:center;font-weight:600">Act.${pC}%</div>
                <input type="number" class="${clsC} pnInp" min="0" max="5" step="0.1" value="${t.c > 0 ? t.c.toFixed(1) : ''}" placeholder="0.0"
                  data-eid="${e.id}" data-per="${ep_global}" data-mat="${em}" data-f="c"
                  oninput="clampNota(this)" onchange="saveTri(this);this.className='niCard nota-ok pnInp'">
              </div>
              <div>
                <div style="font-size:9px;color:var(--sl3);margin-bottom:3px;text-align:center;font-weight:600">Res.${pR}%</div>
                <input type="number" class="${clsR} pnInp" min="0" max="5" step="0.1" value="${t.r > 0 ? t.r.toFixed(1) : ''}" placeholder="0.0"
                  data-eid="${e.id}" data-per="${ep_global}" data-mat="${em}" data-f="r"
                  oninput="clampNota(this)" onchange="saveTri(this);this.className='niCard nota-ok pnInp'">
              </div>
            </div>
            <div id="dc_${e.id}_${em}_${ep_global}" style="text-align:center;padding:4px 6px;background:${tieneVal?'#ebf8ff':'#f7fafc'};border-radius:6px">
              <span style="font-size:10px;color:var(--sl3);margin-right:4px">DEF.</span>
              <span class="${scC(d)}" style="font-size:14px;font-weight:800">${tieneVal ? fmt(d) : '—'}</span>
            </div>
          </div>`;
        }).join('');
        return `<div class="pnCard" data-nombre="${e.nombre.toLowerCase()}" style="border:1px solid ${tieneNotas ? '#c6f6d5' : 'var(--bd)'};border-radius:10px;margin-bottom:8px;overflow:hidden;background:${tieneNotas ? '#f0fff4' : '#fff'}">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;user-select:none"
            onclick="togglePN('${e.id}')">
            <div style="width:32px;height:32px;border-radius:50%;background:${tieneNotas ? '#68d391' : '#e2e8f0'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${tieneNotas ? '#276749' : '#718096'};flex-shrink:0">${idx+1}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.nombre)}</div>
              <div style="font-size:12px;color:var(--sl2);margin-top:2px">${tieneNotas ? `Prom. periodo: <strong class="${scC(pp)}" id="apr_hdr_${e.id}">${fmt(pp)}</strong>` : '<span style="color:#a0aec0">▶ Clic para ingresar notas</span>'}</div>
            </div>
            <div id="pnArr_${e.id}" style="color:var(--sl2);font-size:16px;transition:transform .2s">▼</div>
          </div>
          <div id="pnDet_${e.id}" style="display:none;padding:12px 14px;border-top:1px solid #f0f0f0;background:#fafafa">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:10px">
              ${camposHTML}
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f7fafc;border-radius:8px;font-size:12px">
              <span style="color:var(--sl2)">Disciplina:</span>
              <input type="number" class="ni" min="0" max="5" step="0.1" style="width:64px;text-align:center"
                value="${discVal.toFixed(1)}" placeholder="0.0"
                oninput="clampNota(this)" onchange="saveDisc('${e.id}',this.value,'${ep_global}')">
              <span style="color:var(--sl3);font-size:11px">${discLabel(discVal)}</span>
              <span style="color:var(--sl2);margin-left:12px">Conducta:</span>
              <input type="number" class="ni" min="0" max="5" step="0.1" style="width:64px;text-align:center"
                value="${condValCard.toFixed(1)}" placeholder="0.0"
                oninput="clampNota(this)" onchange="saveConducta('${e.id}',this.value,'${ep_global}')">
              <span style="color:var(--sl3);font-size:11px">${discLabel(condValCard)}</span>
              <span style="margin-left:auto;font-size:12px">Prom. periodo: <strong id="apr_${e.id}" class="${scC(pp)}">${fmt(pp)}</strong></span>
            </div>
            ${(()=>{
              // ── Proyección / Veredicto final ──────────────────────────
              const verd = veredictoAnual(e.id);
              if(!verd) return '';

              // ── CASO A: Todos los periodos completos → veredicto final ──
              if(verd.completo){
                const bgV = verd.resultado==='gana' ? '#f0fff4' : verd.resultado==='recupera' ? '#fffbeb' : '#fff5f5';
                const borV = verd.resultado==='gana' ? '#9ae6b4' : verd.resultado==='recupera' ? '#fbd38d' : '#feb2b2';
                const colV = verd.resultado==='gana' ? '#276749' : verd.resultado==='recupera' ? '#92400e' : '#742a2a';
                const filasV = verd.resMateria.map(x => {
                  const col = x.gana ? '#276749' : '#c53030';
                  const ic  = x.gana ? '✅' : '❌';
                  return `<tr>
                    <td style="padding:5px 10px;font-size:12px;font-weight:600">${ic} ${x.mat}</td>
                    <td style="padding:5px 8px;text-align:center;font-size:13px;font-weight:800;color:${col}">${fmt(x.prom)}</td>
                    <td style="padding:5px 8px;font-size:11px;color:${col};font-weight:700">${x.gana ? 'Aprobada' : 'Perdida'}</td>
                  </tr>`;
                }).join('');
                return `<div style="margin-top:10px;border-radius:8px;overflow:hidden;border:1.5px solid ${borV}">
                  <div style="background:${bgV};padding:9px 12px;font-size:12px;font-weight:800;color:${colV}">
                    ${verd.mensaje}
                  </div>
                  <table style="width:100%;border-collapse:collapse;background:#fff">
                    <thead><tr style="background:#f7fafc">
                      <th style="padding:5px 10px;font-size:10px;color:#4a5568;text-align:left">Materia</th>
                      <th style="padding:5px 8px;font-size:10px;color:#4a5568;text-align:center">Definitiva año</th>
                      <th style="padding:5px 8px;font-size:10px;color:#4a5568;text-align:left">Resultado</th>
                    </tr></thead>
                    <tbody>${filasV}</tbody>
                  </table>
                  ${verd.resultado==='recupera'?`<div style="background:#fffbeb;padding:5px 12px;font-size:9px;color:#92400e">⚠️ Puede recuperar: máximo 2 materias perdidas → va a recuperación de fin de año</div>`:''}
                  ${verd.resultado==='pierde'?`<div style="background:#fff5f5;padding:5px 12px;font-size:9px;color:#742a2a">❌ Pierde el año: más de 2 materias perdidas → debe repetir el grado</div>`:''}
                </div>`;
              }

              // ── CASO B: Periodos pendientes → proyección secuencial ──
              const periodosProy = necesitaParaPeriodos(e.id);
              if (!periodosProy.length) return '';
              const filas = periodosProy.map(x => {
                const imposible = !x.posible;
                const color = imposible ? '#742a2a' : x.necesita <= 3 ? '#276749' : x.necesita <= 4 ? '#744210' : '#c53030';
                const icono = imposible ? '🚨' : x.necesita <= 3 ? '🟢' : x.necesita <= 4 ? '🟡' : '🔴';
                const msg = imposible
                  ? `${x.matsImpCount} materia${x.matsImpCount>1?'s':''} ya no pueden recuperarse — requiere apoyo`
                  : x.matsEnRiesgo === 0
                    ? 'Va bien en todas las materias'
                    : `Sacar ≥ ${x.necesita.toFixed(1)} en promedio (${x.matsEnRiesgo} materia${x.matsEnRiesgo>1?'s':''} en riesgo)`;
                return `<tr>
                  <td style="padding:5px 10px;font-size:12px;font-weight:700">${icono} ${x.per}</td>
                  <td style="padding:5px 8px;text-align:center;font-size:13px;font-weight:800;color:${color}">${imposible ? '✗' : x.necesita.toFixed(1)}</td>
                  <td style="padding:5px 8px;font-size:10px;color:#555;font-style:italic">${msg}</td>
                </tr>`;
              }).join('');
              return `<div style="margin-top:10px;border-radius:8px;overflow:hidden;border:1.5px solid #fed7aa">
                <div style="background:#fff7ed;padding:8px 12px;display:flex;align-items:center;gap:8px">
                  <span style="font-size:15px">📊</span>
                  <div>
                    <div style="font-size:12px;font-weight:800;color:#c05621">¿Puede ganar el año?</div>
                    <div style="font-size:10px;color:#b7791f">Nota mínima promedio requerida en cada periodo para aprobar</div>
                  </div>
                </div>
                <table style="width:100%;border-collapse:collapse;background:#fff">
                  <thead><tr style="background:#fef3c7">
                    <th style="padding:5px 10px;font-size:10px;color:#92400e;text-align:left">Periodo pendiente</th>
                    <th style="padding:5px 8px;font-size:10px;color:#92400e;text-align:center">Nota mínima prom.</th>
                    <th style="padding:5px 8px;font-size:10px;color:#92400e;text-align:left">¿Qué necesita?</th>
                  </tr></thead>
                  <tbody>${filas}</tbody>
                </table>
                <div style="background:#fffbeb;padding:5px 12px;font-size:9px;color:#a16207">
                  🟢 Fácil (≤ 3.0) &nbsp;·&nbsp; 🟡 Con esfuerzo (3.1–4.0) &nbsp;·&nbsp; 🔴 Muy difícil (4.1–5.0) &nbsp;·&nbsp; 🚨 Ya no alcanza
                </div>
              </div>`;
            })()}
          </div>
        </div>`;
      }).join('');

      // Navegación con Tab entre inputs dentro de cada tarjeta abierta
      container.querySelectorAll('.pnInp').forEach((inp, i, all) => {
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === 'Tab') {
            ev.preventDefault();
            const next = all[i + 1];
            if (next) { next.focus(); next.select(); }
          }
        });
        inp.addEventListener('focus', ev => ev.target.select());
      });
    }

    window._pnEsts = ests;
    window._pnMats = mats;
    window._pnSalon = salon;
    window._pnPer = per;
    window.filtrarPN = function() {
      const q = (gi('pnFiltro')?.value || '').toLowerCase().trim();
      const filtrados = q ? window._pnEsts.filter(e => e.nombre.toLowerCase().includes(q)) : window._pnEsts;
      renderCards(filtrados);
    };
    window.togglePN = function(eid) {
      const det = gi('pnDet_' + eid);
      const arr = gi('pnArr_' + eid);
      if (!det) return;
      const open = det.style.display !== 'none';
      det.style.display = open ? 'none' : 'block';
      if (arr) arr.style.transform = open ? '' : 'rotate(180deg)';
      if (!open) {
        // Enfocar primer input al abrir
        const firstInp = det.querySelector('input[type="number"]');
        if (firstInp) { setTimeout(() => { firstInp.focus(); firstInp.select(); }, 50); }
      }
    };
    renderCards(ests);

    // Expande / colapsa TODAS las tarjetas
    window.expandAllPN = function(){
      document.querySelectorAll('[id^="pnDet_"]').forEach(el=>{
        if(el.style.display==='none'||el.style.display===''){
          el.style.display='block';
          const id=el.id.replace('pnDet_','');
          const arr=gi('pnArr_'+id); if(arr) arr.style.transform='rotate(180deg)';
        }
      });
    };
    window.collapseAllPN = function(){
      document.querySelectorAll('[id^="pnDet_"]').forEach(el=>{
        el.style.display='none';
        const id=el.id.replace('pnDet_','');
        const arr=gi('pnArr_'+id); if(arr) arr.style.transform='';
      });
    };

  } else {
    // ── MODO TABLA: para grupos pequeños (<10 estudiantes) ──────────────────
    el.innerHTML=`<div class="tw"><table>
      <thead>
        <tr><th>Estudiante</th>
          ${mats.map(m=>`<th colspan="4" style="text-align:center;border-left:2px solid var(--bd)">${m}</th>`).join('')}
          <th>Disciplina</th><th>Conducta</th><th>Prom.</th></tr>
        <tr><td></td>
          ${(()=>{const p=DB.notaPct||{};const a=p.a??60,c=p.c??20,r=p.r??20;return mats.map(()=>`<th style="font-size:9px;color:var(--sl2);border-left:2px solid var(--bd)">Apt.${a}%</th><th style="font-size:9px;color:var(--sl2)">Act.${c}%</th><th style="font-size:9px;color:var(--sl2)">Res.${r}%</th><th style="font-size:9px;background:#e8f4fd">Def.</th>`).join('')})()}
          <td></td><td></td><td></td></tr>
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
      const ep=ep_global;
      const cells=mats.map(m=>{
        const t=DB.notas[e.id][per][m]||{a:0,c:0,r:0};const d=def(t);
        const enc=encodeURIComponent,em=enc(m);
        return`<td style="border-left:2px solid var(--bd);padding:5px">
          <input type="number" class="ni" min="0" max="5" step="0.1" value="${t.a.toFixed(1)}"
            data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="a" oninput="clampNota(this)" onchange="saveTri(this)"></td>
          <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.c.toFixed(1)}"
            data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="c" oninput="clampNota(this)" onchange="saveTri(this)"></td>
          <td style="padding:5px"><input type="number" class="ni" min="0" max="5" step="0.1" value="${t.r.toFixed(1)}"
            data-eid="${e.id}" data-per="${ep}" data-mat="${em}" data-f="r" oninput="clampNota(this)" onchange="saveTri(this)"></td>
          <td id="dc_${e.id}_${em}_${ep}" style="background:#f0f8ff;padding:5px">
            <span class="${scC(d)}" style="font-size:11px">${d.toFixed(2)}</span></td>`;
      }).join('');
      const discVal = DB.notas[e.id]?.[per]?.disciplina ?? DB.notas[e.id]?.[per]?._disciplina ?? DB.notas[e.id]?.[per]?.disc ?? null;
      const condVal = DB.notas[e.id]?.[per]?.conducta ?? DB.notas[e.id]?.[per]?._conducta ?? null;
      const discValDisp = typeof discVal==='number'?discVal:0;
      const condValDisp = typeof condVal==='number'?condVal:0;
      tr.innerHTML=`<td><strong>${esc(e.nombre)}</strong></td>${cells}
        <td style="padding:4px">
          <input type="number" class="ni" min="0" max="5" step="0.1"
            style="width:62px;text-align:center"
            value="${typeof discVal==='number'?discVal.toFixed(1):''}"
            placeholder="0.0"
            title="Disciplina ${ep} — 0.0 a 5.0"
            oninput="clampNota(this)" onchange="saveDisc('${e.id}',this.value,'${ep}')">
          <div style="font-size:10px;color:var(--sl3);text-align:center">${typeof discVal==='number'?discLabel(discValDisp):'—'}</div>
        </td>
        <td style="padding:4px">
          <input type="number" class="ni" min="0" max="5" step="0.1"
            style="width:62px;text-align:center"
            value="${typeof condVal==='number'?condVal.toFixed(1):''}"
            placeholder="0.0"
            title="Conducta ${ep} — 0.0 a 5.0"
            oninput="clampNota(this)" onchange="saveConducta('${e.id}',this.value,'${ep}')">
          <div style="font-size:10px;color:var(--sl3);text-align:center">${typeof condVal==='number'?discLabel(condValDisp):'—'}</div>
        </td>
        <td id="apr_${e.id}"><span class="${scC(pp)}">${pp.toFixed(2)}</span></td>`;
      body.appendChild(tr);
    });
  }
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
          <strong style="font-size:13px">${esc(e.nombre)}</strong>
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

  const _logoProfe = DB.colegioLogo || '';
  const _nomProfe  = CU.colegioNombre || '';
  box.innerHTML=`<div style="font-family:'Outfit',sans-serif;background:#fff;max-width:780px">
    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#0b1e33,#1a3a5c);color:#fff;padding:20px 28px;position:relative;overflow:hidden">
      ${_logoProfe ? `<img src="${_logoProfe}" style="position:absolute;right:18px;top:50%;transform:translateY(-50%);height:52px;width:auto;object-fit:contain;opacity:.92;border-radius:6px;background:rgba(255,255,255,.1);padding:4px" alt="">` : '<div style="position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:80px;opacity:.07;line-height:1">🏛️</div>'}
      ${_nomProfe ? `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;opacity:.7;margin-bottom:2px;font-weight:600">${_nomProfe}</div>` : ''}
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
  {const p=DB.notaPct||{};const a=p.a??60,c=p.c??20,r=p.r??20;mats.forEach(m=>{hdr2.push(`${m} Apt.${a}%`,`${m} Act.${c}%`,`${m} Res.${r}%`,`${m} Def.`);});}
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
    ['C.C.:',CU.ti||'—'],
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
  return`<div class="ph"><h2>Asistencias</h2><button class="btn xs bg" onclick="showHelp('past')" style="margin-top:6px">❓ Ayuda</button></div>
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
      <td>${esc(e.nombre)}</td>
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
  return`<div class="ph"><h2>Clases Virtuales</h2><button class="btn xs bg" onclick="showHelp('pvir')" style="margin-top:6px">❓ Ayuda</button></div>
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
      const canOpen=!!(u.id||u.dataUrl); // siempre abrir si hay id — fetch lazy
      return`<tr data-salon="${est?.salon||''}" style="background:${!u.revisado?'':'#f9fff9'}">
        <td><strong style="font-size:13px">${u.estNombre||'—'}</strong></td>
        <td><span class="bdg bgy">${est?.salon||'—'}</span></td>
        <td><span style="font-size:12px;font-family:var(--mn)">📎 ${esc(u.nombre)}</span><br>
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
async function abrirArchivo(idx){
  const lista=getPTarList();
  const u=lista[idx];if(!u){sw('error','Archivo no encontrado');return;}
  // Si no tiene dataUrl en memoria, fetch lazy desde el servidor
  if(!u.dataUrl){
    try{
      sw('info','Cargando archivo…','',1000);
      const data=await apiFetch(`/api/uploads/${u.id}/data`);
      if(!data||!data.dataUrl){sw('error','El archivo no está disponible en el servidor');return;}
      u.dataUrl=data.dataUrl;
      if(!u.type&&data.type) u.type=data.type;
      if(!u.nombre&&data.nombre) u.nombre=data.nombre;
    }catch(e){sw('error','Error al cargar el archivo: '+e.message);return;}
  }
  _abrirDataUrl(u.dataUrl,u.type,u.nombre);
}
function _abrirDataUrl(dataUrl,type,nombre){
  const w=window.open();
  if(!w){
    // Fallback sin popup: crear link y hacer click
    const a=document.createElement('a');
    a.href=dataUrl;a.download=nombre||'archivo';
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    return;
  }
  const isPdf=type==='application/pdf';
  const isImg=type&&type.startsWith('image/');
  if(isPdf||isImg){
    w.document.write(`<html><head><title>${nombre||'Archivo'}</title></head>
      <body style="margin:0;background:#1a202c;display:flex;align-items:center;justify-content:center;min-height:100vh">
      <${isPdf?'embed':'img'} src="${dataUrl}" style="width:100%;height:100vh;${isPdf?'':'max-height:100vh;object-fit:contain'}" 
        ${isPdf?'type="application/pdf"':''}></${isPdf?'embed':'img'}>
      </body></html>`);
    w.document.close();
  } else {
    const a=w.document.createElement('a');
    a.href=dataUrl;a.download=nombre||'archivo';
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
            <td><strong>${esc(est.nombre)}</strong></td>
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
                <td><span style="font-size:12px;font-family:var(--mn)">📎 ${esc(r.nombre)}</span></td>
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
                  ${(r.id||r.dataUrl)?`<button class="btn xs bb" onclick="abrirRec(${idx})">📂 Abrir</button>`:''}
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
      reader.onload=ev=>Promise.resolve(onConfirm({...r.value,archNombre:f.name,archType:f.type,archDataUrl:ev.target.result})).catch(e=>sw('error','Error: '+e.message));
      reader.onerror=()=>sw('error','Error al leer el archivo');
      reader.readAsDataURL(f);
    } else {
      Promise.resolve(onConfirm({...r.value,archNombre:archNombre,archType:archType,archDataUrl:archDataUrl})).catch(e=>sw('error','Error: '+e.message));
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
    async onConfirm(vals){
      if(!DB.planes) DB.planes=[];
      /* Get all students in salon who need this prof's recovery */
      const matsProf=getProfMatsSalon(CU.id,salon);
      const estudiantesDestino=ebySalon(salon).filter(est=>{
        const mp=matPerd(est.id);
        return mp.some(m=>matsProf.includes(m)||(CU.ciclo==='primaria'));
      });
      const fecha=new Date().toLocaleDateString('es-CO');
      const planId='plan_'+Date.now();
      /* FIX Bug1: persist each plan to MongoDB via _savePlan() instead of dbSave() */
      const _planesPromesas=[];
      estudiantesDestino.forEach((est,idx)=>{
        mats.forEach(mat=>{
          const _pd={
            id:planId+'_'+est.id+'_'+idx,
            estId:est.id,estNombre:est.nombre,salon,
            materia:mat,profId:CU.id,profNombre:CU.nombre,
            titulo:vals.titulo,desc:vals.desc,
            fechaLimite:vals.fechaLimite,
            archNombre:vals.archNombre||'',archDataUrl:vals.archDataUrl||'',archType:vals.archType||'',
            fecha,visto:false,esSalon:true,planId
          };
          _planesPromesas.push(_savePlan(_pd));
        });
      });
      try{
        await Promise.all(_planesPromesas);
        goto('prec');
        sw('success',`Plan enviado a ${estudiantesDestino.length} estudiante(s) del salón ${salon}`,'',1800);
      }catch(_e2){sw('error','Error guardando plan: '+_e2.message);}
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
    destinatario:`<strong>${esc(est.nombre)}</strong> · <span style="color:#c53030">${materia}</span> · Salón ${salon}`,
    async onConfirm(vals){
      /* FIX Bug1: persist plan to MongoDB via _savePlan() */
      try{
        await _savePlan({
          id:'plan_'+Date.now(),
          estId,estNombre:est.nombre,salon,
          materia,profId:CU.id,profNombre:CU.nombre,
          titulo:vals.titulo,desc:vals.desc,
          fechaLimite:vals.fechaLimite,
          archNombre:vals.archNombre||'',archDataUrl:vals.archDataUrl||'',archType:vals.archType||'',
          fecha:new Date().toLocaleDateString('es-CO'),
          visto:false,esSalon:false
        });
        goto('prec');sw('success','Plan enviado al estudiante','',1500);
      }catch(_e3){sw('error','Error guardando plan: '+_e3.message);}
    }
  });
}

function getRecList(){
  return(DB.recs||[]).filter(r=>r.profId===CU.id).slice().reverse();
}
async function abrirRec(idx){
  const lista=getRecList();const r=lista[idx];
  if(!r){sw('error','Recuperación no encontrada');return;}
  if(!r.dataUrl){
    try{
      sw('info','Cargando archivo…','',1000);
      const data=await apiFetch(`/api/recuperaciones/${r.id}/data`);
      if(!data||!data.dataUrl){sw('error','El archivo no está disponible');return;}
      r.dataUrl=data.dataUrl;
      if(!r.type&&data.type) r.type=data.type;
      if(!r.nombre&&data.nombre) r.nombre=data.nombre;
    }catch(e){sw('error','Error al cargar: '+e.message);return;}
  }
  _abrirDataUrl(r.dataUrl,r.type,r.nombre);
}
/* ── SOBREESCRITA por api-layer.js ── */
async function marcarRecRevisado(id){ /* implementado en api-layer.js */ }

/* ============================================================
   ESTUDIANTE — HISTORIAL DE RECUPERACIONES (periodos pasados)
============================================================ */
function pgEHist(){
  const hist=(DB.histRecs||[]).filter(r=>r.estId===CU.id).slice().reverse();
  const periodos=[...new Set(hist.map(r=>r._periodo))];
  if(!hist.length) return`<div class="ph"><h2>Historial Recuperaciones</h2><button class="btn xs bg" onclick="showHelp('ehist')" style="margin-top:6px">❓ Ayuda</button></div>
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
            <td><span style="font-size:12px;font-family:var(--mn)">📎 ${esc(r.nombre)}</span></td>
            <td style="font-size:12px;color:var(--sl2);max-width:110px">${r.desc||'—'}</td>
            <td style="font-family:var(--mn);font-size:11px">${r.fecha}</td>
            <td><span class="bdg ${r.revisado?'bgr':'brd'}">${r.revisado?`✓ Revisado ${r.revisadoTs||''}`:'✗ No revisado'}</span></td>
            <td>${(r.id||r.dataUrl)?`<button class="btn xs bb" onclick="abrirHistRec('histRecs',${(DB.histRecs||[]).indexOf(r)})">📂 Abrir</button>`:'—'}</td>
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
  if(!hist.length) return`<div class="ph"><h2>Historial Recuperaciones</h2><button class="btn xs bg" onclick="showHelp('phist')" style="margin-top:6px">❓ Ayuda</button></div>
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
              <td><span style="font-size:12px;font-family:var(--mn)">📎 ${esc(r.nombre)}</span></td>
              <td style="font-size:12px;max-width:130px">${planRef?`<strong>${planRef.titulo}</strong><br><span style="font-size:10px;color:var(--sl3)">${planRef.fecha}</span>`:'<span style="color:var(--sl3)">—</span>'}</td>
              <td style="font-size:12px;color:var(--sl2);max-width:100px">${r.desc||'—'}</td>
              <td style="font-family:var(--mn);font-size:11px">${r.fecha}</td>
              <td><span class="bdg ${r.revisado?'bgr':'brd'}">${r.revisado?`✓ Revisado`:'✗ Sin revisar'}</span>
                ${r.revisado?`<div style="font-size:10px;color:var(--sl3)">${r.revisadoTs||''}</div>`:''}</td>
              <td>${(r.id||r.dataUrl)?`<button class="btn xs bb" onclick="abrirHistRec('histRecs',${globalIdx})">📂 Abrir</button>`:'—'}</td>
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
async function abrirHistRec(db,idx){
  const r=(DB[db]||[])[idx];
  if(!r){sw('error','Archivo no encontrado en historial');return;}
  if(!r.dataUrl){
    try{
      sw('info','Cargando archivo…','',1000);
      const data=await apiFetch(`/api/recuperaciones/${r.id}/data`);
      if(!data||!data.dataUrl){sw('error','El archivo no está disponible');return;}
      r.dataUrl=data.dataUrl;
      if(!r.type&&data.type) r.type=data.type;
      if(!r.nombre&&data.nombre) r.nombre=data.nombre;
    }catch(e){sw('error','Error al cargar: '+e.message);return;}
  }
  _abrirDataUrl(r.dataUrl,r.type,r.nombre);
}

function pgEB(){
  const _logoEB = DB.colegioLogo||'';
  const _nomEB  = CU.colegioNombre||'';
  return`<div class="ph" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
    <div>
      <h2>Mi Boletín</h2>
      <button class="btn xs bg" onclick="showHelp('eb')" style="margin-top:6px">❓ Ayuda</button>
    </div>
    ${_logoEB ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px">
      <img src="${_logoEB}" alt="Logo" style="height:72px;width:auto;max-width:130px;object-fit:contain;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.13);background:var(--bg2);padding:6px">
      ${_nomEB ? `<span style="font-size:11px;font-weight:700;color:var(--sl2);text-align:center;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_nomEB}</span>` : ''}
    </div>` : ''}
  </div><div id="ebB"></div>`;}

function initEB(){
  const e=CU;syncN(e.id);
  const pg=gprom(e.id),ps=puestoS(e.id),mp=matPerd(e.id);
  const anoLabel=DB.anoActual||String(new Date().getFullYear());
  const mats=getMats(e.id);

  // Pérdidas por área o por materia
  const areaMap=getAreaMatsMap(e.id);
  const tieneAreas=Object.keys(areaMap).filter(k=>k!=='_sinArea').length>0;
  const areasP=tieneAreas?(areasPerdidasAnio(e.id)||[]):[];
  const cantPerdidas=tieneAreas?areasP.length:mp.length;
  const labelPerdidas=tieneAreas?'Áreas Perd.':'Mat. Perdidas';

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
    <div class="scc" data-i="📊"><div class="sv" style="color:${scCol(pg)}">${fmt(pg)}</div><div class="sl">Prom. General</div><div class="bar"></div></div>
    <div class="scc" data-i="🏆"><div class="sv">${ps}</div><div class="sl">Puesto Salón</div><div class="bar"></div></div>
    <div class="scc" data-i="🏫"><div class="sv" style="font-size:${(e.salon||'—').length>4?'15px':'22px'};margin-top:2px">${e.salon||'—'}</div><div class="sl">Mi Salón</div><div class="bar"></div></div>
    <div class="scc" data-i="⚠️"><div class="sv" style="color:${cantPerdidas>0?'var(--red)':'var(--grn)'}">${cantPerdidas}</div><div class="sl">${labelPerdidas}</div><div class="bar"></div></div>
  </div>`;

  const elegible=tieneAreas?(areasP.length>=1&&areasP.length<=2):(mp.length>=1&&mp.length<=2);
  const nombresPerdidos=tieneAreas?areasP.map(a=>a.areaNombre):mp;
  if(DB.ext.on&&elegible){
    const tipLabel=tieneAreas?'área(s)':'materia(s)';
    h+=`<div class="rbc"><h4>⚠️ Tienes ${nombresPerdidos.length} ${tipLabel} en recuperación</h4>
      <p style="font-size:13px;margin-bottom:8px">${nombresPerdidos.map(m=>`<span class="bdg brd" style="margin:2px">${m}</span>`).join('')}</p>
      <p style="font-size:13px">Extraordinario: <strong>${DB.ext.s} → ${DB.ext.e}</strong></p></div>`;
  }

  persConDatos.forEach(per=>{
    const pp=pprom(e.id,per),ppu=puestoP(e.id,per);
    let tablaBody='';
    if(tieneAreas){
      const areaEntries=Object.entries(areaMap).filter(([k])=>k!=='_sinArea');
      const sinArea=areaMap['_sinArea']||[];
      areaEntries.forEach(([areaNombre,matsArea])=>{
        if(!matsArea.length) return;
        const defsA=matsArea.map(m=>def(DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0})).filter(d=>d>0);
        const da=defsA.length?+(defsA.reduce((s,v)=>s+v,0)/defsA.length).toFixed(2):0;
        tablaBody+=`<tr style="background:#f0f0f0"><td colspan="7" style="padding:5px 8px;font-weight:800;font-size:12px">▸ ${areaNombre} — Def. Área: <span class="${scC(da)}">${da===0?'—':fmt(da)}</span></td></tr>`;
        matsArea.forEach(m=>{
          const t=DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
          const prf=profForMat(m,e.salon);
          tablaBody+=`<tr><td style="padding-left:16px">${m}</td>
            <td style="font-family:var(--mn);font-size:12px">${t.a.toFixed(1)}</td>
            <td style="font-family:var(--mn);font-size:12px">${t.c.toFixed(1)}</td>
            <td style="font-family:var(--mn);font-size:12px">${t.r.toFixed(1)}</td>
            <td><span class="${scC(d)}">${fmt(d)}</span></td>
            <td><span class="bdg ${d>=3?'bgr':'brd'}">${d===0?'Sin nota':d>=3?'Aprobado':'Reprobado'}</span></td>
            <td style="font-size:12px;color:var(--sl2)">${prf?prf.nombre:'Sin asignar'}</td>
          </tr>`;
        });
      });
      sinArea.forEach(m=>{
        const t=DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
        const prf=profForMat(m,e.salon);
        tablaBody+=`<tr><td>${m}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.a.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.c.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.r.toFixed(1)}</td>
          <td><span class="${scC(d)}">${fmt(d)}</span></td>
          <td><span class="bdg ${d>=3?'bgr':'brd'}">${d===0?'Sin nota':d>=3?'Aprobado':'Reprobado'}</span></td>
          <td style="font-size:12px;color:var(--sl2)">${prf?prf.nombre:'Sin asignar'}</td>
        </tr>`;
      });
    } else {
      tablaBody=mats.map(m=>{
        const t=DB.notas[e.id]?.[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
        const prf=profForMat(m,e.salon);
        return`<tr><td>${m}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.a.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.c.toFixed(1)}</td>
          <td style="font-family:var(--mn);font-size:12px">${t.r.toFixed(1)}</td>
          <td><span class="${scC(d)}">${fmt(d)}</span></td>
          <td><span class="bdg ${d>=3?'bgr':'brd'}">${d===0?'Sin nota':d>=3?'Aprobado':'Reprobado'}</span></td>
          <td style="font-size:12px;color:var(--sl2)">${prf?prf.nombre:'Sin asignar'}</td>
        </tr>`;
      }).join('');
    }
    h+=`<div class="card"><div class="chd">
      <span class="cti">${per}</span>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:12px;color:var(--sl2)">Puesto: <strong>${ppu}</strong></span>
        <span class="${scC(pp)}" style="font-size:14px">Prom. ${fmt(pp)}</span>
      </div></div>
      <div class="tw"><table><thead>
        <tr><th>Materia</th><th>Ser</th><th>Saber</th><th>Saber Hacer</th><th>Definitiva</th><th>Estado</th><th>Profesor</th></tr>
      </thead><tbody>${tablaBody}${(()=>{
        // Conducta y Disciplina del periodo — siempre al final
        const _condEB = DB.notas[e.id]?.[per]?.conducta ?? DB.notas[e.id]?.[per]?._conducta ?? null;
        const _discEB = DB.notas[e.id]?.[per]?.disciplina ?? DB.notas[e.id]?.[per]?._disciplina ?? null;
        let rows = '';
        if(typeof _condEB === 'number'){
          const lbl = _condEB>=4.6?'Superior':_condEB>=4?'Alto':_condEB>=3?'Básico':'Bajo';
          rows += `<tr style="background:#fafaf0"><td style="font-weight:700;padding-left:8px">Conducta</td><td>—</td><td>—</td><td>—</td><td><span class="${scC(_condEB)}">${fmt(_condEB)}</span></td><td><span class="bdg ${_condEB>=3?'bgr':'brd'}">${lbl}</span></td><td style="font-size:12px;color:var(--sl2)">—</td></tr>`;
        }
        if(typeof _discEB === 'number'){
          const lbl = _discEB>=4.6?'Superior':_discEB>=4?'Alto':_discEB>=3?'Básico':'Bajo';
          rows += `<tr style="background:#f5f5f5"><td style="font-weight:700;padding-left:8px">Disciplina</td><td>—</td><td>—</td><td>—</td><td><span class="${scC(_discEB)}">${fmt(_discEB)}</span></td><td><span class="bdg ${_discEB>=3?'bgr':'brd'}">${lbl}</span></td><td style="font-size:12px;color:var(--sl2)">—</td></tr>`;
        }
        return rows;
      })()}</tbody></table></div></div>`;
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
    ?prfsDelSalon.map(p=>`<option value="${p.id}">${esc(p.nombre)}${p.materias?.length?' ('+p.materias.join(', ')+')':''}</option>`).join('')
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
      <td><strong>${esc(u.nombre)}</strong></td>
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
  // Refrescar excusas desde el servidor para que el estudiante vea respuestas nuevas
  apiFetch('/api/excusas').then(fresh=>{
    if(Array.isArray(fresh)){
      DB.exc=fresh;
      // Re-renderizar solo la bandeja si ya está visible
      const bandeja=gi('excBandeja');
      if(bandeja) bandeja.innerHTML=renderBandejaEst(CU.id);
    }
  }).catch(()=>{});
  const mis=DB.exc.filter(x=>x.estId===e.id||x.eid===e.id).slice().reverse();
  const ventanaOk=excusasOk();
  return`<div class="ph"><h2>Módulo de Excusas</h2>
    <p>Horario de envío: 18:00 – 07:00 ${ventanaOk?'<span class="bdg bgr">✓ Abierto</span>':'<span class="bdg brd">✗ Cerrado</span>'}</p>
    <button class="btn xs bg" onclick="showHelp('eexc')" style="margin-top:6px">❓ Ayuda</button>
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
  <div id="excBandeja">${renderBandejaEst(e.id)}</div>
  </div>`;
}

function renderBandejaEst(estId){
  const mis=(DB.exc||[]).filter(x=>x.estId===estId||x.eid===estId).slice().reverse();
  if(!mis.length) return '<div class="mty"><div class="ei">📬</div><p>Sin excusas</p></div>';
  return mis.map(x=>{
    const tieneResp=!!(x.respProf);
    const noLeida=tieneResp&&!x.respLeida;
    const talleresHtml=(x.talleres||[]).map(t=>
      `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#ebf8ff;border-radius:6px;margin-top:4px">
        <span>📎</span>
        <span style="font-size:12px;flex:1">${t.nombre} <span style="font-size:10px;color:var(--sl3)">(${t.tamanio||''})</span></span>
        <button class="btn xs bb" onclick="descargarTallerExcusa('${x._id||x.id}','${encodeURIComponent(t.nombre)}')">⬇️ Descargar</button>
      </div>`).join('');
    return`<div style="border:2px solid ${noLeida?'#f6ad55':tieneResp?'#68d391':'var(--bd)'};border-radius:10px;padding:12px;margin-bottom:10px;background:${noLeida?'#fffaf0':tieneResp?'#f0fff4':'var(--bg2)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
        <div>
          <span style="font-size:12px;font-family:var(--mn)">📅 ${x.fecha}</span>&nbsp;
          <span class="bdg bbl">${x.dest}</span>&nbsp;
          <span class="bdg bor">${x.causa}</span>
        </div>
        <span class="bdg ${noLeida?'bor':tieneResp?'bgr':'bwa'}">${noLeida?'🔔 Nueva respuesta':tieneResp?'✅ Respondida':'⏳ Pendiente'}</span>
      </div>
      ${x.desc?`<div style="font-size:12px;color:var(--sl2);margin-bottom:6px">💬 ${x.desc}</div>`:''}
      ${tieneResp?`<div style="background:#e6fffa;border-radius:8px;padding:10px;margin-top:6px;border:1px solid ${noLeida?'#f6ad55':'#9ae6b4'}">
        <div style="font-size:12px;font-weight:700;color:#276749;margin-bottom:4px">📩 Respuesta de ${x.respProfNombre||'tu profesor'}: <span style="font-size:10px;color:var(--sl3)">${x.respTs||''}</span></div>
        <div style="font-size:13px;color:#234e52">${x.respProf}</div>
        ${x.diasExtra>0?`<div style="margin-top:6px;font-size:12px">⏰ <strong>Tiempo extra:</strong> ${x.diasExtra} día(s) — <strong>Fecha límite:</strong> ${x.fechaLimite||'—'}</div>`:''}
        ${talleresHtml?`<div style="margin-top:8px"><strong style="font-size:12px">📚 Talleres a realizar:</strong>${talleresHtml}</div>`:''}
        <div style="margin-top:10px;padding:10px;background:#fffbeb;border:1.5px solid #f6ad55;border-radius:8px;font-size:12px;color:#c05621">
          ⚠️ <strong>Debes enviar el trabajo en el apartado Talleres y Tareas dentro del tiempo estipulado. Después de la fecha límite no se calificará.</strong>
        </div>
        ${noLeida
          ?`<button class="btn xs bg" style="margin-top:8px" onclick="marcarRespLeida('${x._id||x.id}')">👁️ Marcar como leída</button>`
          :`<div style="font-size:10px;color:var(--sl3);margin-top:6px">✓ Vista el ${x.respTs||''}</div>`}
      </div>`:''}
    </div>`;
  }).join('');
}
/* ── SOBREESCRITA por api-layer.js ── */
async function envExcusa(){ /* implementado en api-layer.js */ }

/* Navega a Ingresar Notas y preselecciona un salón */
function irANotasSalon(salon){
  goto('pnot');
  setTimeout(()=>{
    const sel=gi('pns');
    if(sel){
      sel.value=salon;
      if(typeof updatePNMats==='function') updatePNMats();
    }
  },200);
}

/* Notifica al profesor sobre excusas nuevas — solo una vez por sesión */
function notifNuevasExcusas(){
  const sessionKey='excNotif_'+CU.id;
  if(sessionStorage.getItem(sessionKey)) return; // ya notificado en esta sesión
  const mis=DB.exc.filter(x=>x.dest===CU.nombre||(CU.salones||[]).includes(x.salon));
  const nuevas=mis.filter(x=>!x.respProf);
  if(!nuevas.length) return;
  sessionStorage.setItem(sessionKey,'1');
  sw('info',`📨 Tienes <strong>${nuevas.length}</strong> excusa${nuevas.length>1?'s':''} sin responder`);
}

/* Show excusas to professor in their home panel */
function renderPExcR(){
  // Panel de tabs activo — no se usa este contenedor
  // Las excusas se muestran en el tab ✉️ del panel principal
  const el=gi('pExcR');if(el) el.innerHTML='';
}

/* ============================================================
   ESTUDIANTE — MIS PROFESORES
============================================================ */
function pgEProf(){
  const e=CU;const prfs=profsInSalon(e.salon);
  return`<div class="ph"><h2>Mis Profesores</h2><button class="btn xs bg" onclick="showHelp('eprof')" style="margin-top:6px">❓ Ayuda</button></div>
  <div class="card"><div class="chd"><span class="cti">Salón: <span class="bdg bbl">${e.salon||'Sin salón'}</span></span></div>
  ${e.salon&&prfs.length?`<div class="tw"><table><thead>
    <tr><th>Profesor</th><th>Ciclo</th><th>Materias</th></tr></thead>
    <tbody>${prfs.map(p=>`<tr>
      <td><strong>${esc(p.nombre)}</strong></td>
      <td><span class="bdg ${p.ciclo==='bachillerato'?'bte':'bbl'}">${p.ciclo}</span></td>
      <td><div style="display:flex;flex-wrap:wrap;gap:3px">
        ${(p.materias||[]).map(m=>`<span class="bdg bbl" style="margin:1px">${m}</span>`).join('')||
          '<span style="font-size:12px;color:var(--sl3)">Todas (Primaria)</span>'}
      </div></td>
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
  return`<div class="ph"><h2>Mis Clases Virtuales</h2><p>Salón: <strong>${e.salon||'Sin salón'}</strong></p><button class="btn xs bg" onclick="showHelp('evir')" style="margin-top:6px">❓ Ayuda</button></div>
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
  if(!DB.ext.on) return`<div class="ph"><h2>Mi Recuperación</h2><button class="btn xs bg" onclick="showHelp('ereh')" style="margin-top:6px">❓ Ayuda</button></div><div class="al aly">⚠️ El periodo extraordinario no está activo.</div>`;
  if(!mp.length) return`<div class="ph"><h2>Mi Recuperación</h2><button class="btn xs bg" onclick="showHelp('ereh')" style="margin-top:6px">❓ Ayuda</button></div><div class="al alg">✅ No tienes materias en recuperación. ¡Bien hecho!</div>`;

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
                <span style="font-size:12px">📎 ${esc(r.nombre)} <span style="color:var(--sl3);font-size:11px">${r.fecha}</span>${r.desc?` — <em style="color:var(--sl2)">${r.desc}</em>`:''}</span>
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
            <span style="font-size:12px">📎 ${esc(r.nombre)} <span style="color:var(--sl3);font-size:11px">${r.fecha}</span></span>
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
    <p>Tienes <strong>${mp.length}</strong> materia(s) en periodo extraordinario.</p><button class="btn xs bg" onclick="showHelp('ereh')" style="margin-top:6px">❓ Ayuda</button></div>
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

  const e=DB.ests.find(x=>x.id===estId);
  const snap=snapData||(e?null:null);
  if(!e&&!snap){sw('error','Estudiante no encontrado');return;}

  const anoActual=DB.anoActual||String(new Date().getFullYear());
  const notasDelAno=snap?.notas
    ||(anno!==anoActual&&DB.notasPorAno?.[anno]?.[estId])
    ||(e?DB.notas[estId]:null)||{};

  const nombre=snap?.nombre||e?.nombre||estId;
  const ti=snap?.ti||e?.ti||'—';
  const salon=snap?.salon||e?.salon||'—';
  const disciplina=snap?.disciplina||DB.notas[estId]?.disciplina||'—';
  const notas=notasDelAno;
  const mats=snap?.mats||(e?getMats(estId):DB.mP);
  const ciclo=cicloOf(salon);

  if(!e){} else syncN(estId);

  const isTodos=perFilter==='TODOS';
  const allPers=DB.pers;
  const pers2render=isTodos
    ?allPers.filter(per=>{
        // Incluir periodo si tiene notas de materias O tiene conducta/disciplina
        const tieneNotas=mats.some(m=>{const t=notas[per]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
        const tieneCond=typeof notas[per]?.conducta==='number'||typeof notas[per]?._conducta==='number';
        const tieneDisc=typeof notas[per]?.disciplina==='number'||typeof notas[per]?._disciplina==='number';
        return tieneNotas||tieneCond||tieneDisc;
      })
    :allPers.filter(p=>p===decodeURIComponent(perFilter));
  if(!pers2render.length){sw('info','Sin datos',`No hay notas registradas${isTodos?' en ningún periodo':' en este periodo'}.`);return;}

  const pg=e?gprom(estId):+(
    DB.pers.map(per=>{const ds=mats.map(m=>def(notas[per]?.[m]||{a:0,c:0,r:0}));return+(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(2);})
      .filter(v=>v>0).reduce((a,b,_,arr)=>a+b/arr.length,0)
  ).toFixed(2);
  const ps=e?puestoS(estId):'—';

  // Materias perdidas (para seccion recuperación en vista por periodo)
  const mp=e?matPerd(estId):mats.filter(m=>{
    const act=DB.pers.filter(p=>{const t=notas[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
    if(!act.length) return false;
    return act.reduce((s,p)=>s+def(notas[p][m]),0)/act.length<3;
  });

  const box=gi('pdfBox');
  const suffix=isTodos?'todos_periodos':decodeURIComponent(perFilter).replace(/\s+/g,'_');
  const fechaGen=new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});
  const subtitle=isTodos?`Año Lectivo ${anno} — Todos los Periodos`:`Año Lectivo ${anno} — ${decodeURIComponent(perFilter)}`;
  // ─── Jornada del salón ────────────────────────────────────────────────────
  const salonObj = (DB.sals||[]).find(s => s.nombre === salon) || {};
  const jornadaLabel = salonObj.jornada ? salonObj.jornada.toUpperCase() : '';

  // ─── Obtener mapa de áreas para este estudiante ───────────────────────────
  const areaMap = e ? getAreaMatsMap(estId) : {};
  const tieneAreas = Object.keys(areaMap).filter(k=>k!=='_sinArea').length > 0;

  // ─── Helpers locales de color para boletín (escala de grises) ─────────────
  const bCol = n => { n=+n; if(n===0) return '#aaa'; if(n<3) return '#111'; if(n<4) return '#444'; return '#111'; };
  const bBg  = n => { n=+n; if(n===0) return '#f5f5f5'; if(n<3) return '#f0f0f0'; return '#fff'; };
  const bDes = n => { n=+n; if(n===0) return '—'; if(n>=4.5) return 'Superior'; if(n>=4) return 'Alto'; if(n>=3) return 'Básico'; return 'Bajo'; };

  // ─── TABLA POR PERIODOS (vista individual) ────────────────────────────────
  let persHTML;
  if(isTodos){
    // Definitiva final de cada materia
    const defFinal = m => {
      const act=pers2render.filter(p=>{const t=notas[p]?.[m];return t&&(t.a>0||t.c>0||t.r>0);});
      if(!act.length) return 0;
      return+(act.reduce((s,p)=>s+def(notas[p]?.[m]||{a:0,c:0,r:0}),0)/act.length).toFixed(2);
    };
    const ppPer=pers2render.map(per=>+(mats.reduce((s,m)=>s+def(notas[per]?.[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2));
    const thPers=pers2render.map((p,i)=>`<th style="background:#333;color:#fff;padding:5px 7px;text-align:center;font-size:10px;border:1px solid #999">${p}<br><span style="font-weight:400;opacity:.8">${fmt(ppPer[i])}</span></th>`).join('');

    // ─── Pre-calcular Disciplina/Conducta por periodo ANTES de buildDiscRow ─────
    // CRÍTICO: deben declararse aquí para evitar "Cannot access before initialization"
    const discPorPerPre = pers2render.map(per=>{const dv=notas[per]?.disciplina??notas[per]?._disciplina??notas[per]?.disc??null;return typeof dv==='number'?dv:null;});
    const condPorPerPre = pers2render.map(per=>{const cv=notas[per]?.conducta??notas[per]?._conducta??null;return typeof cv==='number'?cv:null;});

    // Función para fila de conducta/disciplina
    const buildDiscRow = () => {
      const discPorPer = discPorPerPre;
      const condPorPer = condPorPerPre;
      const conductaGlobal = notas?.conducta ?? null;
      const disciplinaGlobal = typeof notas?.disciplina==='number'?notas.disciplina:null;
      // Si ningún periodo tiene el dato individualmente, usar el valor global como fallback
      const hasDisc = discPorPer.some(v=>v!==null) || disciplinaGlobal!==null;
      const hasCond = condPorPer.some(v=>v!==null) || conductaGlobal!==null;
      if(!hasDisc && !hasCond) return '';
      let rows = '';
      // ORDEN DEL BOLETÍN: primero Conducta, luego Disciplina (siempre al final)
      if(hasCond){
        const condProm = condPorPer.filter(v=>v!==null).length
          ? +(condPorPer.filter(v=>v!==null).reduce((s,v)=>s+v,0)/condPorPer.filter(v=>v!==null).length).toFixed(2)
          : (conductaGlobal ?? null);
        const condCells = condPorPer.map(cv=>
          `<td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:12px;color:${cv!==null?bCol(cv):'#aaa'}">${cv!==null?fmt(cv):'—'}</td>`
        ).join('');
        rows += `<tr style="background:#fafaf0">
          <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">Conducta</td>
          ${condCells}
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${condProm!==null?bCol(condProm):'#aaa'}">${condProm!==null?fmt(condProm):'—'}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${condProm!==null?bCol(condProm):'#aaa'}">${condProm!==null?bDes(condProm):'—'}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">—</td>
        </tr>`;
      }
      if(hasDisc){
        const _discValidos = discPorPer.filter(v=>v!==null);
        const discPromLocal = _discValidos.length
          ? +(_discValidos.reduce((s,v)=>s+v,0)/_discValidos.length).toFixed(2)
          : disciplinaGlobal;
        const discCells = discPorPer.map(dv=>
          `<td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:12px;color:${dv!==null?bCol(dv):'#aaa'}">${dv!==null?fmt(dv):'—'}</td>`
        ).join('');
        rows += `<tr style="background:#f5f5f5">
          <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">Disciplina</td>
          ${discCells}
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${discPromLocal!==null?bCol(discPromLocal):'#aaa'}">${discPromLocal!==null?fmt(discPromLocal):'—'}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${discPromLocal!==null?bCol(discPromLocal):'#aaa'}">${discPromLocal!==null?bDes(discPromLocal):'—'}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">—</td>
        </tr>`;
      }
      return rows;
    };
    // Función para generar filas con o sin agrupación por áreas
    const buildRows = (matsArr, showArea) => matsArr.map((m,idx)=>{
      const perCells=pers2render.map(per=>{
        const d=def(notas[per]?.[m]||{a:0,c:0,r:0});
        return`<td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:12px;color:${bCol(d)}">${d===0?'—':fmt(d)}</td>`;
      }).join('');
      const df=defFinal(m);
      const prf=profForMat(m,salon);
      return`<tr style="background:${idx%2===0?'#fafafa':'#fff'}">
        <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px">${m}</td>
        ${perCells}
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${bCol(df)}">${fmt(df)}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${bCol(df)}">${bDes(df)}</td>
        <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">${prf?prf.nombre:'—'}</td>
      </tr>`;
    }).join('');

    const tableHeader = `<thead><tr>
      <th style="background:#111;color:#fff;padding:6px 8px;text-align:left;font-size:11px;border:1px solid #999">ÁREAS/ASIGNATURAS</th>
      ${thPers}
      <th style="background:#111;color:#fff;padding:6px 8px;text-align:center;font-size:11px;border:1px solid #999">Def. Final</th>
      <th style="background:#111;color:#fff;padding:6px 8px;text-align:center;font-size:11px;border:1px solid #999">Desempeño</th>
      <th style="background:#444;color:#fff;padding:6px 8px;text-align:left;font-size:10px;border:1px solid #999">Docente</th>
    </tr></thead>`;

    if(tieneAreas && e){
      // Renderizar agrupado por áreas
      const areaEntries = Object.entries(areaMap).filter(([k])=>k!=='_sinArea').sort(([a],[b])=>a.localeCompare(b,'es'));
      const sinArea = (areaMap['_sinArea']||[]).slice().sort((a,b)=>a.localeCompare(b,'es'));
      let bodyHTML = '';
      areaEntries.forEach(([areaNombre, matsArea])=>{
        matsArea.sort((a,b)=>a.localeCompare(b,'es'));
        if(!matsArea.length) return;
        // Definitiva del área
        const defsArea = matsArea.map(m=>defFinal(m)).filter(d=>d>0);
        const promArea = defsArea.length ? +(defsArea.reduce((s,v)=>s+v,0)/defsArea.length).toFixed(2) : 0;
        const perCellsArea = pers2render.map(per=>{
          const defsP = matsArea.map(m=>def(notas[per]?.[m]||{a:0,c:0,r:0})).filter(d=>d>0);
          const dp = defsP.length ? +(defsP.reduce((s,v)=>s+v,0)/defsP.length).toFixed(2) : 0;
          return`<td style="padding:4px 7px;border:1px solid #bbb;text-align:center;font-weight:700;font-size:11px;background:#e8e8e8">${dp===0?'—':fmt(dp)}</td>`;
        }).join('');
        // Fila de área (cabecera de sección)
        bodyHTML += `<tr style="background:#e0e0e0">
          <td style="padding:5px 8px;border:1px solid #bbb;font-weight:800;font-size:12px;color:#111">▸ ${areaNombre}</td>
          ${perCellsArea}
          <td style="padding:5px 7px;border:1px solid #bbb;text-align:center;font-weight:900;font-size:13px;color:${bCol(promArea)}">${promArea===0?'—':fmt(promArea)}</td>
          <td style="padding:5px 7px;border:1px solid #bbb;text-align:center;font-size:11px;font-weight:700;color:${bCol(promArea)}">${promArea===0?'—':bDes(promArea)}</td>
          <td style="padding:5px 7px;border:1px solid #bbb;text-align:center;font-size:10px;font-weight:700;color:${promArea===0?'#aaa':bCol(promArea)}">${promArea===0?'—':bDes(promArea)}</td>
        </tr>`;
        // Filas de materias del área
        bodyHTML += buildRows(matsArea, true);
      });
      if(sinArea.length) bodyHTML += buildRows(sinArea, false);
      bodyHTML += buildDiscRow();
      persHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px">${tableHeader}<tbody>${bodyHTML}</tbody></table>`;
    } else {
      // Sin áreas: tabla plana
      persHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px">${tableHeader}<tbody>${buildRows(mats,false)}${buildDiscRow()}</tbody></table>`;
    }
  } else {
    // Vista por periodo individual — tabla con desglose tripartita
    const pct=DB.notaPct||{};const pa=pct.a??60,pc=pct.c??20,pr=pct.r??20;
    persHTML=pers2render.map(per=>{
      const pp=e?pprom(estId,per):+(mats.reduce((s,m)=>s+def(notas[per]?.[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2);
      const ppu=e?puestoP(estId,per):'—';

      const buildMatRows = (matsArr) => matsArr.map((m,idx)=>{
        const t=notas[per]?.[m]||{a:0,c:0,r:0};const d=def(t);
        const prf=profForMat(m,salon);
        return`<tr style="background:${idx%2===0?'#fafafa':'#fff'}">
          <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px">${m}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:12px">${t.a.toFixed(1)}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:12px">${t.c.toFixed(1)}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:12px">${t.r.toFixed(1)}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${bCol(d)}">${fmt(d)}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${bCol(d)}">${d===0?'—':bDes(d)}</td>
          <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">${prf?prf.nombre:'—'}</td>
        </tr>`;
      }).join('');

      let tableBody = '';
      if(tieneAreas && e){
        const areaEntries = Object.entries(areaMap).filter(([k])=>k!=='_sinArea').sort(([a],[b])=>a.localeCompare(b,'es'));
        const sinArea = (areaMap['_sinArea']||[]).slice().sort((a,b)=>a.localeCompare(b,'es'));
        areaEntries.forEach(([areaNombre, matsArea])=>{
          matsArea.sort((a,b)=>a.localeCompare(b,'es'));
          if(!matsArea.length) return;
          const defsArea=matsArea.map(m=>def(notas[per]?.[m]||{a:0,c:0,r:0})).filter(d=>d>0);
          const dp=defsArea.length?+(defsArea.reduce((s,v)=>s+v,0)/defsArea.length).toFixed(2):0;
          tableBody+=`<tr style="background:#e0e0e0">
            <td style="padding:5px 8px;border:1px solid #bbb;font-weight:800;font-size:12px" colspan="5">▸ ${areaNombre}</td>
            <td style="padding:5px 7px;border:1px solid #bbb;text-align:center;font-weight:900;font-size:13px;color:${bCol(dp)}">${dp===0?'—':fmt(dp)}</td>
            <td style="padding:5px 7px;border:1px solid #bbb;text-align:center;font-size:10px;font-weight:700;color:${dp===0?'#aaa':bCol(dp)}">${dp===0?'—':bDes(dp)}</td>
          </tr>`;
          tableBody+=buildMatRows(matsArea);
        });
        if(sinArea.length) tableBody+=buildMatRows(sinArea);
      } else {
        tableBody=buildMatRows(mats);
      }

      // Disciplina y Conducta del periodo — SOLO del periodo actual, sin fallback al global
      const discValPer = typeof notas[per]?.disciplina==='number' ? notas[per].disciplina
        : (typeof notas[per]?._disciplina==='number' ? notas[per]._disciplina
        : (typeof notas[per]?.disc==='number' ? notas[per].disc : null));
      const condValPer = typeof notas[per]?.conducta==='number' ? notas[per].conducta
        : (typeof notas[per]?._conducta==='number' ? notas[per]._conducta : null);
      const discPerRow = (typeof discValPer==='number' || typeof condValPer==='number')
        // ORDEN BOLETÍN: primero Conducta, luego Disciplina
        ? `${typeof condValPer==='number'?`<tr style="background:#fafaf0">
            <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">Conducta</td>
            <td colspan="3" style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:12px">—</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${bCol(condValPer)}">${fmt(condValPer)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${bCol(condValPer)}">${bDes(condValPer)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">—</td>
          </tr>`:''}
          ${typeof discValPer==='number'?`<tr style="background:#f5f5f5">
            <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">Disciplina</td>
            <td colspan="3" style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:12px">—</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-weight:900;font-size:13px;color:${bCol(discValPer)}">${fmt(discValPer)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:11px;font-weight:700;color:${bCol(discValPer)}">${bDes(discValPer)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;font-size:10px;color:#555">—</td>
          </tr>`:''}` : '';
      return`<div style="margin-bottom:18px;page-break-inside:avoid">
        <div style="background:#e8e8e8;color:#111;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border:1px solid #ccc">
          <strong style="font-size:13px">${per}</strong>
          <span style="font-size:11px;color:#555">Promedio: <strong>${fmt(pp)}</strong> &nbsp;|&nbsp; Puesto: <strong>${ppu}${ppu!=='—'?'°':''}</strong></span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>
            <th style="background:#333;color:#fff;padding:5px 8px;text-align:left;border:1px solid #999">ÁREAS/ASIGNATURAS</th>
            <th style="background:#444;color:#fff;padding:5px 7px;text-align:center;font-size:10px;border:1px solid #999">Ser (${pa}%)</th>
            <th style="background:#444;color:#fff;padding:5px 7px;text-align:center;font-size:10px;border:1px solid #999">Saber (${pc}%)</th>
            <th style="background:#444;color:#fff;padding:5px 7px;text-align:center;font-size:10px;border:1px solid #999">Hacer (${pr}%)</th>
            <th style="background:#111;color:#fff;padding:5px 7px;text-align:center;font-weight:800;border:1px solid #999">Definitiva</th>
            <th style="background:#333;color:#fff;padding:5px 7px;text-align:center;font-size:10px;border:1px solid #999">Desempeño</th>
            <th style="background:#444;color:#fff;padding:5px 7px;text-align:left;font-size:10px;border:1px solid #999">Docente</th>
          </tr></thead>
          <tbody>${tableBody}${discPerRow}</tbody>
        </table>
      </div>`;
    }).join('');
  }

  // ─── Veredicto anual (bloque limpio blanco/negro) ─────────────────────────
  let veredictoHTML = '';
  if(e && isTodos){
    const verd = veredictoAnual(estId);
    if(verd){
      if(verd.completo){
        // Resultado definitivo
        const ic = verd.resultado==='gana'?'✓':verd.resultado==='recupera'?'⚠':'✗';
        let resumenHTML = '';
        if(verd.tieneAreas && verd.resAreas){
          resumenHTML = verd.resAreas.map(a=>`<tr>
            <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">${a.gana?'✓':'✗'} ${a.areaNombre}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:13px;font-weight:800;color:${bCol(a.prom)}">${a.prom.toFixed(2)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;font-size:11px;font-weight:700;color:${bCol(a.prom)}">${a.gana?'Aprobada':'Perdida'}</td>
          </tr>`).join('');
          const cabeza = '<tr style="background:#eee"><th style="padding:5px 8px;border:1px solid #bbb;font-size:10px;text-align:left">Área</th><th style="padding:5px 7px;border:1px solid #bbb;font-size:10px;text-align:center">Definitiva</th><th style="padding:5px 7px;border:1px solid #bbb;font-size:10px;text-align:left">Resultado</th></tr>';
          resumenHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px"><tbody>${cabeza}${resumenHTML}</tbody></table>`;
        } else {
          resumenHTML = verd.resMateria.map(x=>`<tr>
            <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;font-weight:700">${x.gana?'✓':'✗'} ${x.mat}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;text-align:center;font-size:13px;font-weight:800;color:${bCol(x.prom)}">${x.prom.toFixed(2)}</td>
            <td style="padding:5px 7px;border:1px solid #ddd;font-size:11px;font-weight:700;color:${bCol(x.prom)}">${x.gana?'Aprobada':'Perdida'}</td>
          </tr>`).join('');
          const cabeza = '<tr style="background:#eee"><th style="padding:5px 8px;border:1px solid #bbb;font-size:10px;text-align:left">Materia</th><th style="padding:5px 7px;border:1px solid #bbb;font-size:10px;text-align:center">Definitiva</th><th style="padding:5px 7px;border:1px solid #bbb;font-size:10px;text-align:left">Resultado</th></tr>';
          resumenHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px"><tbody>${cabeza}${resumenHTML}</tbody></table>`;
        }
        const regla = verd.tieneAreas
          ? 'Aprobado ≥ 3.0 por área · Recuperación: 1–2 áreas perdidas · Pierde año: 3+ áreas perdidas'
          : 'Aprobado ≥ 3.0 · Recuperación: 1–2 materias perdidas · Pierde año: 3+ materias perdidas';
        veredictoHTML = `<div style="border:1.5px solid #333;margin-top:16px;page-break-inside:avoid">
          <div style="background:#111;color:#fff;padding:10px 14px">
            <div style="font-size:14px;font-weight:800">${ic} ${verd.mensaje.replace(/[🎉⚠️❌]/g,'').trim()}</div>
            ${verd.resultado==='recupera'?'<div style="font-size:11px;margin-top:3px;opacity:.85">Tiene derecho a recuperación al finalizar el año por las áreas/materias perdidas.</div>':''}
            ${verd.resultado==='pierde'?'<div style="font-size:11px;margin-top:3px;opacity:.85">Perdió 3 o más áreas. Debe repetir el año escolar.</div>':''}
            ${verd.resultado==='gana'?'<div style="font-size:11px;margin-top:3px;opacity:.85">Felicitaciones. Aprobó todas las áreas del año lectivo.</div>':''}
          </div>
          <div style="padding:8px 14px 4px">${resumenHTML}</div>
          <div style="padding:5px 14px;font-size:9px;color:#666;border-top:1px solid #ddd">${regla}</div>
        </div>`;
      } else {
        // Periodos pendientes — solo texto simple de qué le falta
        const periodosProy = necesitaParaPeriodos(estId);
        if(periodosProy.length){
          const hayImp = periodosProy.some(x=>!x.posible);
          let textoFalta = '';
          if(hayImp){
            textoFalta = 'En algunas materias ya no es posible alcanzar el promedio mínimo. Hablar con el docente.';
          } else {
            const menor = periodosProy[0];
            textoFalta = `${menor.necesita.toFixed(1)} en promedio en los periodos pendientes (${periodosProy.map(x=>x.per).join(', ')}).`;
          }
          veredictoHTML = `<div style="border:1px solid #aaa;padding:10px 14px;margin-top:14px;font-size:12px;color:#333">
            <strong>Le falta para ganar el año:</strong> ${textoFalta}
          </div>`;
        }
      }
    }
  }

  // ─── Disciplina y Conducta (promedios definitivos para el bloque lateral) ─
  // discPorPerPre/condPorPerPre ya fueron calculados arriba dentro del bloque isTodos.
  // Aquí se calculan los promedios finales para el sidebar/encabezado del boletín.
  // discPorPerPre/condPorPerPre solo existen en el bloque isTodos
  const _dpp = (isTodos && typeof discPorPerPre !== 'undefined') ? discPorPerPre : [];
  const _cpp = (isTodos && typeof condPorPerPre !== 'undefined') ? condPorPerPre : [];
  const discPer = _dpp.filter(d=>d!==null);
  const discProm = discPer.length ? +(discPer.reduce((s,d)=>s+d,0)/discPer.length).toFixed(2) : (notas?.disciplina??null);
  const condPer = _cpp.filter(c=>c!==null);
  const condProm = condPer.length ? +(condPer.reduce((s,c)=>s+c,0)/condPer.length).toFixed(2) : (notas?.conducta??null);

  // ─── HTML DEL BOLETÍN ─────────────────────────────────────────────────────
  const _logo = DB.colegioLogo||'';
  const _nomColegio = CU.colegioNombre||'';
  const perPromVal=!isTodos?+(mats.reduce((s,m)=>s+def(notas[decodeURIComponent(perFilter)]?.[m]||{a:0,c:0,r:0}),0)/mats.length).toFixed(2):0;
  const perPuestoVal=e&&!isTodos?puestoP(estId,decodeURIComponent(perFilter)):'—';

  box.innerHTML=`<div style="font-family:'Arial',sans-serif;background:#fff;max-width:760px;color:#111">
    <!-- ENCABEZADO -->
    <div style="border-bottom:3px solid #111;padding:14px 24px 10px;text-align:center;position:relative">
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:6px">
        ${_logo?`<img src="${_logo}" style="height:110px;width:auto;object-fit:contain;flex-shrink:0" alt="Logo">`:''}
        <div style="text-align:center">
          ${_nomColegio?`<div style="font-size:17px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;text-align:center">${_nomColegio}</div>`:''}
          <div style="font-size:12px;color:#555;margin-top:4px;text-align:center;font-weight:600">BOLETÍN DE CALIFICACIONES</div>
          <div style="font-size:11px;color:#555;margin-top:2px;text-align:center">SEDE PRINCIPAL</div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:700;margin-top:6px;letter-spacing:.03em">
        AÑO: ${anno}${jornadaLabel?' &nbsp; JORNADA: '+jornadaLabel:''} &nbsp; CURSO: <strong>${esc(salon)||'—'}</strong> &nbsp; ${isTodos?'TODOS LOS PERIODOS':'PERIODO: <strong>'+decodeURIComponent(perFilter)+'</strong>'}
      </div>
      <div style="font-size:10px;color:#666;margin-top:3px">Generado: ${fechaGen}</div>
    </div>
    <!-- DATOS DEL ESTUDIANTE -->
    <div style="border-bottom:1.5px solid #ccc;padding:8px 24px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div>
        <div style="font-size:12px;line-height:1.9"><strong>Estudiante:</strong> ${esc(nombre)}</div>
        <div style="font-size:12px;line-height:1.9"><strong>Código / T.I.:</strong> ${esc(ti)||'No registrado'}</div>
        <div style="font-size:12px;line-height:1.9"><strong>Ciclo:</strong> ${ciclo==='primaria'?'Primaria':'Bachillerato'}</div>
      </div>
      <div>
        ${isTodos
          ?`<div style="font-size:12px;line-height:1.9"><strong>Promedio General:</strong> <span style="font-weight:900;font-size:15px">${pg.toFixed(2)}</span></div>
             <div style="font-size:12px;line-height:1.9"><strong>Puesto en Salón:</strong> <strong>${ps}${ps!=='—'?'°':''}</strong></div>
             ${discProm!==null?`<div style="font-size:12px;line-height:1.9"><strong>Disciplina:</strong> <span style="font-weight:700;color:${bCol(discProm)}">${fmt(discProm)} — ${bDes(discProm)}</span></div>`:''}
             ${condProm!==null?`<div style="font-size:12px;line-height:1.9"><strong>Conducta:</strong> <span style="font-weight:700;color:${bCol(condProm)}">${condProm.toFixed(2)} — ${bDes(condProm)}</span></div>`:''}`
          :`<div style="font-size:12px;line-height:1.9"><strong>Promedio Periodo:</strong> <span style="font-weight:900;font-size:15px">${perPromVal.toFixed(2)}</span></div>
             <div style="font-size:12px;line-height:1.9"><strong>Puesto en Salón:</strong> <strong>${perPuestoVal}${perPuestoVal!=='—'?'°':''}</strong></div>`}
      </div>
    </div>
    <!-- NOTAS -->
    <div style="padding:14px 24px">
      ${!isTodos?`<div style="font-size:10px;color:#555;margin-bottom:10px;padding:6px 10px;border:1px solid #ccc">
        Sistema tripartita: Ser (${DB.notaPct?.a??60}%) + Saber (${DB.notaPct?.c??20}%) + Saber Hacer (${DB.notaPct?.r??20}%) = Definitiva
      </div>`:''}
      ${persHTML}
    </div>
    <!-- FIRMAS -->
    <div style="display:flex;justify-content:space-around;margin-top:40px;padding:0 24px 28px">
      <div style="text-align:center">
        <div style="width:150px;border-top:1.5px solid #111;margin:0 auto 5px"></div>
        <div style="font-size:10px;color:#555">Vb. Coordinador</div>
      </div>
      <div style="text-align:center">
        <div style="width:150px;border-top:1.5px solid #111;margin:0 auto 5px"></div>
        <div style="font-size:10px;color:#555">Director de Grupo</div>
      </div>
      <div style="text-align:center">
        <div style="width:150px;border-top:1.5px solid #111;margin:0 auto 5px"></div>
        <div style="font-size:10px;color:#555">Padre / Acudiente</div>
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
   SIMULACRO ICFES
============================================================ */

// ─── Base de preguntas ICFES (pruebas colombianas 2023-2025) ────────────────
const ICFES_PREGUNTAS = {

'Lectura Crítica': [
  {p:"Lee el siguiente fragmento: «El hombre es el único animal que tropieza dos veces con la misma piedra.» ¿Cuál es la intención comunicativa principal de este enunciado?",o:["A) Describir el comportamiento animal","B) Criticar la capacidad reflexiva humana","C) Explicar un fenómeno natural","D) Narrar una anécdota histórica"],r:"B"},
  {p:"En el texto «La soledad de América Latina» de Gabriel García Márquez, el autor afirma que América Latina ha sido incomprendida por Europa. ¿Qué recurso argumentativo utiliza principalmente?",o:["A) La analogía con Asia","B) Datos estadísticos comparativos","C) Ejemplos históricos y literarios propios de la región","D) Testimonios de líderes políticos europeos"],r:"C"},
  {p:"¿Cuál de las siguientes opciones representa mejor el propósito de un texto expositivo?",o:["A) Persuadir al lector de adoptar una postura","B) Entretener mediante una narración ficticia","C) Informar y explicar un tema de manera objetiva","D) Expresar los sentimientos del autor"],r:"C"},
  {p:"Un texto argumentativo es aquel que busca principalmente:",o:["A) Describir personajes y ambientes","B) Convencer al lector mediante razones y evidencias","C) Narrar hechos en orden cronológico","D) Presentar instrucciones paso a paso"],r:"B"},
  {p:"Lee: «El río baja cantando entre las piedras.» ¿Qué figura literaria se emplea?",o:["A) Hipérbole","B) Antítesis","C) Personificación","D) Metáfora"],r:"C"},
  {p:"¿Cuál de los siguientes enunciados corresponde a una opinión y no a un hecho?",o:["A) Colombia tiene 32 departamentos","B) El río Amazonas nace en Perú","C) La educación pública es más valiosa que la privada","D) La Constitución colombiana fue promulgada en 1991"],r:"C"},
  {p:"En el poema «Veinte poemas de amor» de Pablo Neruda, el verso «Puedo escribir los versos más tristes esta noche» expresa principalmente:",o:["A) Una orden al lector","B) Un estado emocional del yo poético","C) Una descripción objetiva del entorno","D) Una predicción sobre el futuro"],r:"B"},
  {p:"¿Qué tipo de narrador es aquel que participa como personaje dentro de la historia?",o:["A) Narrador omnisciente","B) Narrador en tercera persona","C) Narrador en primera persona (protagonista)","D) Narrador testigo externo"],r:"C"},
  {p:"Una inferencia textual es:",o:["A) Copiar literalmente información del texto","B) Resumir el texto con palabras propias","C) Deducir información implícita a partir de lo que dice el texto","D) Identificar el tema central del texto"],r:"C"},
  {p:"Lee: «No era un hombre ordinario; era, en todo el sentido de la palabra, un genio.» ¿Qué conectivo lógico se utiliza?",o:["A) Adversativo","B) Causal","C) Consecutivo","D) Concesivo"],r:"A"},
  {p:"El párrafo de cierre de un texto argumentativo generalmente:",o:["A) Presenta nuevos argumentos","B) Introduce el tema por primera vez","C) Sintetiza las ideas y reafirma la tesis","D) Contradice los argumentos del desarrollo"],r:"C"},
  {p:"¿Cuál es la función del lenguaje predominante en los textos publicitarios?",o:["A) Referencial","B) Emotiva","C) Metalingüística","D) Apelativa o conativa"],r:"D"},
  {p:"En la frase «Sus ojos eran dos luceros brillantes», ¿qué figura literaria se utiliza?",o:["A) Hipérbole","B) Comparación (símil)","C) Metáfora","D) Ironía"],r:"C"},
  {p:"¿Cuál de los siguientes textos tiene estructura de problema-solución?",o:["A) Una biografía de Simón Bolívar","B) Un informe sobre causas del desempleo juvenil y políticas para reducirlo","C) Un poema sobre la naturaleza","D) Una fábula con moraleja"],r:"B"},
  {p:"La coherencia en un texto se refiere a:",o:["A) El uso correcto de signos de puntuación","B) La unidad temática y lógica entre las ideas del texto","C) La variedad de vocabulario empleado","D) El número de párrafos del escrito"],r:"B"},
  {p:"¿Qué es una tesis en un texto argumentativo?",o:["A) Un ejemplo que apoya una idea","B) La conclusión final del texto","C) La postura o afirmación central que el autor defiende","D) Un resumen de otros autores"],r:"C"},
  {p:"Lee: «Aunque llovía a cántaros, decidió salir sin paraguas.» La relación lógica entre las dos partes de la oración es:",o:["A) Causal","B) Consecutiva","C) Concesiva","D) Condicional"],r:"C"},
  {p:"Un texto con intención satírica busca principalmente:",o:["A) Informar sobre hechos históricos","B) Criticar o ridiculizar algo usando el humor","C) Describir ambientes naturales","D) Instruir al lector en alguna habilidad"],r:"B"},
  {p:"¿Qué es el contexto de enunciación en un texto?",o:["A) El vocabulario técnico utilizado","B) Las condiciones de tiempo, lugar y situación en que se produce el mensaje","C) El número de palabras del texto","D) El formato visual del documento"],r:"B"},
  {p:"En el cuento «El coronel no tiene quien le escriba» de García Márquez, la espera prolongada simboliza principalmente:",o:["A) La puntualidad del protagonista","B) La indiferencia del Estado y la esperanza que se niega a morir","C) La vagancia del coronel","D) Un problema logístico de correos"],r:"B"},
],

'Matemáticas': [
  {p:"Si f(x) = 2x² – 3x + 1, ¿cuál es el valor de f(2)?",o:["A) 3","B) 5","C) 7","D) 9"],r:"A"},
  {p:"¿Cuál es el conjunto solución de la inecuación 3x – 7 > 2?",o:["A) x > 3","B) x < 3","C) x > –3","D) x < –3"],r:"A"},
  {p:"En un triángulo rectángulo, si los catetos miden 3 y 4 cm, ¿cuánto mide la hipotenusa?",o:["A) 6 cm","B) 5 cm","C) 7 cm","D) 4,5 cm"],r:"B"},
  {p:"¿Cuánto es el 15% de 240?",o:["A) 24","B) 36","C) 30","D) 48"],r:"B"},
  {p:"La expresión algebraica que representa «el triple de un número disminuido en 4» es:",o:["A) 3 + x – 4","B) 3(x – 4)","C) 3x – 4","D) x/3 – 4"],r:"C"},
  {p:"¿Cuál es la pendiente de la recta que pasa por los puntos (1, 2) y (3, 8)?",o:["A) 2","B) 3","C) 4","D) 5"],r:"B"},
  {p:"Si un rectángulo tiene perímetro de 36 cm y su largo es el doble de su ancho, ¿cuánto mide el ancho?",o:["A) 4 cm","B) 6 cm","C) 8 cm","D) 12 cm"],r:"B"},
  {p:"¿Cuál es la mediana del siguiente conjunto de datos: {5, 8, 12, 3, 9}?",o:["A) 8","B) 9","C) 7,4","D) 5"],r:"A"},
  {p:"Simplifica la expresión: (x² – 4) / (x – 2)",o:["A) x + 2","B) x – 2","C) x²","D) 2x"],r:"A"},
  {p:"Un móvil recorre 120 km en 2 horas. ¿Cuál es su velocidad media?",o:["A) 240 km/h","B) 60 km/h","C) 30 km/h","D) 80 km/h"],r:"B"},
  {p:"¿Cuántos ejes de simetría tiene un cuadrado?",o:["A) 2","B) 3","C) 4","D) 6"],r:"C"},
  {p:"El volumen de un cubo de arista 4 cm es:",o:["A) 16 cm³","B) 48 cm³","C) 64 cm³","D) 96 cm³"],r:"C"},
  {p:"¿Cuál es el resultado de: log₂(8)?",o:["A) 2","B) 3","C) 4","D) 8"],r:"B"},
  {p:"Si se lanza una moneda dos veces, ¿cuál es la probabilidad de obtener cara dos veces?",o:["A) 1/2","B) 1/3","C) 1/4","D) 1/8"],r:"C"},
  {p:"¿Cuál es la solución del sistema: x + y = 5 y x – y = 1?",o:["A) x=3, y=2","B) x=2, y=3","C) x=4, y=1","D) x=1, y=4"],r:"A"},
  {p:"La gráfica de y = x² es:",o:["A) Una recta","B) Una parábola que abre hacia arriba","C) Una circunferencia","D) Una hipérbola"],r:"B"},
  {p:"¿Cuánto es 2³ × 2⁴?",o:["A) 2⁷","B) 4⁷","C) 2¹²","D) 6⁷"],r:"A"},
  {p:"El ángulo suplementario de 65° mide:",o:["A) 25°","B) 115°","C) 295°","D) 90°"],r:"B"},
  {p:"¿Cuál es el mínimo común múltiplo de 6 y 9?",o:["A) 3","B) 18","C) 36","D) 54"],r:"B"},
  {p:"Un artículo cuesta $80.000 y tiene un descuento del 25%. ¿Cuánto se paga?",o:["A) $55.000","B) $60.000","C) $65.000","D) $70.000"],r:"B"},
],

'Sociales y Ciudadanas': [
  {p:"¿En qué año se promulgó la Constitución Política de Colombia actualmente vigente?",o:["A) 1886","B) 1948","C) 1991","D) 2001"],r:"C"},
  {p:"¿Cuál es el órgano legislativo en Colombia?",o:["A) La Presidencia de la República","B) El Congreso de la República","C) La Corte Constitucional","D) El Ministerio de Justicia"],r:"B"},
  {p:"La Declaración Universal de los Derechos Humanos fue adoptada por la ONU en:",o:["A) 1945","B) 1948","C) 1960","D) 1975"],r:"B"},
  {p:"¿Qué es el Derecho Internacional Humanitario (DIH)?",o:["A) Las leyes que regulan el comercio entre países","B) Las normas que protegen a las personas en conflictos armados","C) Los acuerdos climáticos internacionales","D) Las reglas del deporte olímpico"],r:"B"},
  {p:"¿Cuál de los siguientes es un mecanismo de participación ciudadana en Colombia?",o:["A) El habeas corpus","B) La tutela","C) El referendo","D) La acción popular"],r:"C"},
  {p:"El fenómeno de la globalización se caracteriza principalmente por:",o:["A) El aislamiento de las economías nacionales","B) La integración económica, cultural y política entre países","C) El aumento de las guerras entre naciones","D) La desaparición de los estados"],r:"B"},
  {p:"¿Qué fue la Independencia de Colombia el 20 de julio de 1810?",o:["A) La firma del tratado con España","B) El inicio del proceso que llevaría a la independencia de la Nueva Granada","C) La batalla definitiva contra el ejército español","D) La creación de la primera Constitución colombiana"],r:"B"},
  {p:"¿Cuál es la función principal del Banco de la República de Colombia?",o:["A) Otorgar créditos a empresas privadas","B) Regular la moneda y velar por la estabilidad económica del país","C) Administrar los impuestos nacionales","D) Financiar los programas sociales del gobierno"],r:"B"},
  {p:"El concepto de «soberanía popular» significa que:",o:["A) El presidente tiene poderes ilimitados","B) El poder del Estado reside en el pueblo","C) Solo los partidos políticos gobiernan","D) Las leyes provienen de la tradición religiosa"],r:"B"},
  {p:"¿Qué causa principal generó la Primera Guerra Mundial?",o:["A) La invasión de Polonia por Alemania","B) El atentado al archiduque Francisco Fernando de Austria en Sarajevo","C) La revolución bolchevique en Rusia","D) La crisis económica de 1929"],r:"B"},
  {p:"¿A qué se denomina «Estado Social de Derecho»?",o:["A) Un estado donde solo rige la ley sin importar la justicia social","B) Un estado que garantiza derechos individuales y promueve la igualdad y el bienestar social","C) Un estado gobernado exclusivamente por militares","D) Un estado sin separación de poderes"],r:"B"},
  {p:"Los Acuerdos de Paz de Colombia (2016) se firmaron entre el gobierno colombiano y:",o:["A) El ELN","B) Las AUC","C) Las FARC-EP","D) El M-19"],r:"C"},
  {p:"¿Cuál es la principal característica del sistema democrático?",o:["A) El poder es hereditario","B) Un solo partido controla el Estado","C) Los ciudadanos eligen a sus gobernantes mediante el voto","D) Las decisiones las toma un grupo de expertos sin elecciones"],r:"C"},
  {p:"La Corte Constitucional de Colombia tiene como función principal:",o:["A) Juzgar delitos comunes","B) Administrar los recursos del Estado","C) Guardar la integridad y supremacía de la Constitución","D) Dirigir la política exterior"],r:"C"},
  {p:"¿Qué es el desplazamiento forzado?",o:["A) La migración voluntaria por trabajo","B) El traslado obligado de personas de su lugar de origen por amenazas o violencia","C) El turismo interno en Colombia","D) Los programas de movilidad estudiantil"],r:"B"},
  {p:"El Producto Interno Bruto (PIB) mide:",o:["A) El valor de las importaciones de un país","B) El nivel de desempleo de una nación","C) El valor total de bienes y servicios producidos en un país en un período","D) La deuda externa de un Estado"],r:"C"},
  {p:"¿Cuál fue el principal objetivo del Plan Marshall después de la Segunda Guerra Mundial?",o:["A) Juzgar a los criminales de guerra nazis","B) Reconstruir económicamente a Europa Occidental","C) Crear la OTAN","D) Dividir Alemania en dos estados"],r:"B"},
  {p:"La acción de tutela en Colombia protege principalmente:",o:["A) Los derechos colectivos","B) Los derechos económicos","C) Los derechos fundamentales de los ciudadanos","D) El patrimonio del Estado"],r:"C"},
  {p:"¿Qué es la corrupción en el ámbito público?",o:["A) El mal uso del presupuesto familiar","B) El abuso del poder público para obtener beneficios personales o de terceros","C) La crítica legítima al gobierno","D) La competencia desleal entre empresas privadas"],r:"B"},
  {p:"¿Cuál fue la causa principal del conflicto armado colombiano del siglo XX?",o:["A) Diferencias religiosas entre católicos y protestantes","B) Disputas territoriales con Venezuela","C) La desigualdad social, política y económica, junto con el surgimiento de grupos guerrilleros","D) La invasión extranjera al territorio colombiano"],r:"C"},
],

'Ciencias Naturales': [
  {p:"¿Cuál es la unidad básica de la vida?",o:["A) El tejido","B) El órgano","C) La célula","D) El organismo"],r:"C"},
  {p:"El ADN (ácido desoxirribonucleico) se encuentra principalmente en:",o:["A) La membrana celular","B) El citoplasma","C) El núcleo de la célula","D) Las mitocondrias"],r:"C"},
  {p:"¿Cuál de los siguientes es un proceso de la fotosíntesis?",o:["A) Transformación de glucosa en CO₂ y H₂O","B) Conversión de energía lumínica en energía química","C) Descomposición de proteínas","D) Producción de calor a partir de grasas"],r:"B"},
  {p:"La Ley de Newton que establece que «a toda acción corresponde una reacción igual y contraria» es:",o:["A) Primera Ley","B) Segunda Ley","C) Tercera Ley","D) Ley de la Gravedad"],r:"C"},
  {p:"¿Qué tipo de energía posee un objeto en movimiento?",o:["A) Energía potencial gravitatoria","B) Energía cinética","C) Energía química","D) Energía nuclear"],r:"B"},
  {p:"El número atómico de un elemento indica:",o:["A) La masa del átomo","B) El número de neutrones en el núcleo","C) El número de protones en el núcleo","D) El número de electrones en la última capa"],r:"C"},
  {p:"¿Cuál de los siguientes procesos libera energía en los organismos vivos?",o:["A) La fotosíntesis","B) La respiración celular","C) La síntesis de proteínas","D) La mitosis"],r:"B"},
  {p:"¿Qué capa de la atmósfera protege la Tierra de la radiación ultravioleta del Sol?",o:["A) Tropósfera","B) Mesósfera","C) Termósfera","D) Estratósfera (capa de ozono)"],r:"D"},
  {p:"En la tabla periódica, los elementos de un mismo grupo comparten:",o:["A) El mismo número de neutrones","B) La misma masa atómica","C) El mismo número de electrones en su capa de valencia","D) El mismo estado de agregación"],r:"C"},
  {p:"¿Cuál es el producto de la fermentación alcohólica realizada por las levaduras?",o:["A) Ácido láctico y CO₂","B) Etanol y CO₂","C) Glucosa y H₂O","D) Oxígeno y ATP"],r:"B"},
  {p:"¿Qué tipo de reproducción genera organismos genéticamente idénticos al progenitor?",o:["A) Reproducción sexual","B) Reproducción asexual","C) Fecundación cruzada","D) Meiosis"],r:"B"},
  {p:"La velocidad de la luz en el vacío es aproximadamente:",o:["A) 300.000 km/s","B) 30.000 km/s","C) 3.000 km/s","D) 300 km/s"],r:"A"},
  {p:"¿Cuál es la función principal de los glóbulos rojos (eritrocitos)?",o:["A) Combatir infecciones","B) Producir anticuerpos","C) Transportar oxígeno a los tejidos","D) Regular la temperatura corporal"],r:"C"},
  {p:"¿Qué gas es producido principalmente por la combustión de combustibles fósiles y contribuye al efecto invernadero?",o:["A) Oxígeno (O₂)","B) Nitrógeno (N₂)","C) Dióxido de carbono (CO₂)","D) Hidrógeno (H₂)"],r:"C"},
  {p:"El pH neutro corresponde al valor:",o:["A) 0","B) 7","C) 14","D) 5"],r:"B"},
  {p:"¿Cuál es la diferencia entre mitosis y meiosis?",o:["A) La mitosis ocurre solo en animales","B) La meiosis produce 4 células haploides; la mitosis produce 2 células diploides idénticas","C) La mitosis solo ocurre en células reproductivas","D) La meiosis produce células somáticas"],r:"B"},
  {p:"Un ecosistema se define como:",o:["A) Solo el conjunto de seres vivos de una región","B) La interacción entre comunidades bióticas y factores abióticos de un lugar","C) Únicamente el suelo y el agua de un lugar","D) El conjunto de plantas de una región"],r:"B"},
  {p:"¿Qué es la teoría de la evolución propuesta por Charles Darwin?",o:["A) Los organismos cambian de forma aleatoria sin ningún patrón","B) Las especies evolucionan por selección natural: los más aptos sobreviven y se reproducen","C) Los organismos adquieren características durante su vida y las transmiten","D) Las especies son inmutables desde su creación"],r:"B"},
  {p:"¿Cuál es la fórmula química del agua?",o:["A) H₂O₂","B) HO","C) H₂O","D) H₃O"],r:"C"},
  {p:"El tejido nervioso está compuesto principalmente por:",o:["A) Osteocitos","B) Neuronas y células gliales","C) Eritrocitos","D) Adipocitos"],r:"B"},
],

'Inglés': [
  {p:"Choose the correct option to complete the sentence: 'She ___ to school every day.'",o:["A) go","B) goes","C) going","D) gone"],r:"B"},
  {p:"What is the past tense of the verb 'write'?",o:["A) writed","B) written","C) wrote","D) writ"],r:"C"},
  {p:"Select the sentence in the present perfect tense:",o:["A) She will travel to London","B) She traveled to London","C) She has traveled to London","D) She was traveling to London"],r:"C"},
  {p:"What does the word 'although' express?",o:["A) A cause","B) A contrast or concession","C) A consequence","D) A condition"],r:"B"},
  {p:"Read: 'If I had studied more, I would have passed the exam.' This sentence is in:",o:["A) First conditional","B) Second conditional","C) Third conditional","D) Zero conditional"],r:"C"},
  {p:"Choose the correct question tag: 'She doesn't like coffee, ___?'",o:["A) does she","B) doesn't she","C) is she","D) isn't she"],r:"A"},
  {p:"Which sentence is written in passive voice?",o:["A) The teacher explained the lesson","B) The students were reading the book","C) The letter was written by Maria","D) They will visit the museum"],r:"C"},
  {p:"What is the meaning of the word 'acknowledge'?",o:["A) To ignore","B) To recognize or accept something","C) To forget","D) To refuse"],r:"B"},
  {p:"Choose the correct option: 'This is the city ___ I was born.'",o:["A) who","B) which","C) where","D) when"],r:"C"},
  {p:"Which is the correct plural form of 'child'?",o:["A) childs","B) childes","C) children","D) childrens"],r:"C"},
  {p:"Read: 'He said he was tired.' This is an example of:",o:["A) Direct speech","B) Reported speech","C) Passive voice","D) Conditional"],r:"B"},
  {p:"What does 'despite' mean in English?",o:["A) Because of","B) In order to","C) In spite of / even though","D) So that"],r:"C"},
  {p:"Choose the correct sentence:",o:["A) She is more taller than her sister","B) She is the most tallest girl","C) She is taller than her sister","D) She is tall than her sister"],r:"C"},
  {p:"The word 'however' is used to:",o:["A) Add information","B) Introduce a result","C) Show contrast between ideas","D) Express a condition"],r:"C"},
  {p:"Read: 'The movie was so boring that I fell asleep.' What type of clause is 'that I fell asleep'?",o:["A) Relative clause","B) Conditional clause","C) Result clause (so...that)","D) Purpose clause"],r:"C"},
  {p:"Which sentence uses the modal verb 'should' correctly?",o:["A) You should to exercise more","B) You should exercising more","C) You should exercise more","D) You should exercises more"],r:"C"},
  {p:"What is the meaning of the idiom 'break the ice'?",o:["A) To break something frozen","B) To start a conversation and reduce tension","C) To stop working","D) To solve a difficult problem"],r:"B"},
  {p:"Choose the correct preposition: 'She is interested ___ learning new languages.'",o:["A) at","B) for","C) in","D) on"],r:"C"},
  {p:"Which is NOT a linking word to show cause?",o:["A) because","B) since","C) however","D) due to"],r:"C"},
  {p:"Read: 'By the time they arrived, we had already eaten.' The verb 'had eaten' is in the:",o:["A) Simple past","B) Past perfect","C) Present perfect","D) Future perfect"],r:"B"},
]
};

// ─── Estado del simulacro (en memoria + localStorage) ──────────────────────
function icfesKey(){ return 'icfes_' + CU.id; }

function icfesGetState(){
  try {
    const raw = localStorage.getItem(icfesKey());
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

function icfesSaveState(state){
  try { localStorage.setItem(icfesKey(), JSON.stringify(state)); } catch(e){}
}

function icfesClearState(){
  try { localStorage.removeItem(icfesKey()); } catch(e){}
}

// Mezclar array (Fisher-Yates)
function icfesShuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// Generar set aleatorio de 20 preguntas para una asignatura
function icfesGenerar(asig){
  const todas = ICFES_PREGUNTAS[asig] || [];
  const mezcladas = icfesShuffle(todas);
  return mezcladas.slice(0,20).map(q=>({
    p: q.p,
    o: icfesShuffle(q.o), // también mezclar opciones
    r: q.r,
    correcta: q.r // guardamos la correcta original por si las opciones se reordenan
  }));
}

// ─── pgEIcfes — página principal del simulacro ────────────────────────────
function pgEIcfes(){
  return `<div id="icfesRoot"><div class="ph"><h2>🎯 Simulacro ICFES</h2>
    <p style="font-size:13px;color:var(--sl2)">Practica con preguntas reales de las pruebas ICFES colombianas 2023-2025.</p>
  </div><div id="icfesContent"></div></div>`;
}

function initEIcfes(){
  const el = gi('icfesContent');
  if(!el) return;
  // Ver si hay progreso guardado
  const state = icfesGetState();
  if(state && state.activo){
    icfesRenderMenu(el, state);
  } else {
    icfesRenderMenu(el, null);
  }
}

// ─── Menú de selección de asignatura ──────────────────────────────────────
function icfesRenderMenu(el, state){
  const asigs = Object.keys(ICFES_PREGUNTAS);
  const resultados = state?.resultados || {};
  const en_curso = state?.activo ? state.asigActual : null;

  const cards = asigs.map(a=>{
    const res = resultados[a];
    const enCurso = (a === en_curso);
    const completada = res && res.finalizado;
    const progreso = state?.progreso?.[a];
    let badge = '';
    if(completada){
      badge = `<span class="bdg bgr" style="font-size:11px">✅ ${res.correctas}/20</span>`;
    } else if(enCurso && progreso){
      badge = `<span class="bdg bor" style="font-size:11px">▶ En curso (${progreso.actual+1}/20)</span>`;
    } else if(progreso && !completada){
      badge = `<span class="bdg bor" style="font-size:11px">⏸ Pausado (${progreso.actual+1}/20)</span>`;
    }
    const bg = completada ? '#f0fff4' : enCurso ? '#fffbeb' : 'var(--bg2)';
    const border = completada ? '#68d391' : enCurso ? '#f6ad55' : 'var(--bd)';
    const iconos = {'Lectura Crítica':'📖','Matemáticas':'🔢','Sociales y Ciudadanas':'🌎','Ciencias Naturales':'🔬','Inglés':'🇬🇧'};
    return `<div onclick="icfesIniciarAsig('${encodeURIComponent(a)}')"
      style="cursor:pointer;border:2px solid ${border};border-radius:12px;padding:16px;background:${bg};transition:box-shadow .2s"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'" onmouseout="this.style.boxShadow='none'">
      <div style="font-size:24px;margin-bottom:6px">${iconos[a]||'📝'}</div>
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">${a}</div>
      <div style="font-size:11px;color:var(--sl2);margin-bottom:8px">20 preguntas</div>
      ${badge}
    </div>`;
  }).join('');

  // Calcular si todas están completadas
  const todasCompletas = asigs.every(a => resultados[a]?.finalizado);
  const totalCorrectas = asigs.reduce((s,a)=> s + (resultados[a]?.correctas||0), 0);
  const totalPreguntas = asigs.length * 20;

  let resultadoFinalHtml = '';
  if(todasCompletas){
    const pct = Math.round((totalCorrectas/totalPreguntas)*100);
    const color = pct>=70?'#276749':pct>=50?'#c05621':'#c53030';
    resultadoFinalHtml = `<div style="background:#f0f4ff;border:2px solid #667eea;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <div style="font-size:28px;margin-bottom:8px">🏆</div>
      <div style="font-size:18px;font-weight:900;color:${color};margin-bottom:4px">${totalCorrectas} / ${totalPreguntas} correctas</div>
      <div style="font-size:14px;color:var(--sl2)">${pct}% de respuestas correctas en todas las asignaturas</div>
      <button class="btn brd" style="margin-top:14px;font-size:13px" onclick="icfesReiniciarTodo()">🔄 Reiniciar simulacro</button>
    </div>`;
  }

  el.innerHTML = `${resultadoFinalHtml}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:20px">
      ${cards}
    </div>
    ${state && !todasCompletas ? `<button class="btn bs" style="font-size:12px" onclick="icfesReiniciarTodo()">🗑 Reiniciar todo el progreso</button>` : ''}`;
}

// ─── Iniciar o continuar una asignatura ────────────────────────────────────
function icfesIniciarAsig(asigEnc){
  const asig = decodeURIComponent(asigEnc);
  let state = icfesGetState() || { activo:false, resultados:{}, progreso:{} };

  // Si la asignatura ya está finalizada, solo mostrar resultado
  if(state.resultados?.[asig]?.finalizado){
    const res = state.resultados[asig];
    Swal.fire({
      title:`Resultado: ${asig}`,
      html:`<div style="font-size:28px;font-weight:900;color:#276749">${res.correctas}/20</div>
        <div style="font-size:14px;margin-top:6px;color:#555">${res.correctas>=15?'🏆 Excelente':res.correctas>=10?'👍 Bien':' Puedes mejorar'}</div>`,
      icon: res.correctas>=15?'success':res.correctas>=10?'info':'warning',
      confirmButtonText:'Ver simulacro',
      showCancelButton:true, cancelButtonText:'Cerrar'
    }).then(r=>{ if(r.isConfirmed){ state.progreso[asig]=null; state.resultados[asig]=null; icfesSaveState(state); icfesIniciarAsig(asigEnc); } });
    return;
  }

  // Continuar o crear nuevo progreso
  let prog = state.progreso?.[asig];
  if(!prog){
    prog = { preguntas: icfesGenerar(asig), actual: 0, respuestas: [] };
    if(!state.progreso) state.progreso = {};
    state.progreso[asig] = prog;
  }
  state.activo = true;
  state.asigActual = asig;
  icfesSaveState(state);
  icfesRenderPregunta(asig);
}

// ─── Renderizar pregunta actual ────────────────────────────────────────────
function icfesRenderPregunta(asig){
  const el = gi('icfesContent');
  if(!el) return;
  const state = icfesGetState();
  if(!state) return;
  const prog = state.progreso[asig];
  if(!prog) return;

  const total = prog.preguntas.length;
  const idx = prog.actual;
  if(idx >= total){
    icfesFinalizarAsig(asig);
    return;
  }

  const q = prog.preguntas[idx];
  const pct = Math.round((idx/total)*100);

  el.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:13px;font-weight:700;color:var(--sl2)">${asig}</span>
        <span style="font-size:12px;color:var(--sl3)">Pregunta ${idx+1} de ${total}</span>
      </div>
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#0ea5a0,#1e40af);height:100%;width:${pct}%;transition:width .3s"></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;line-height:1.6;padding:4px 0 16px">${idx+1}. ${q.p}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${q.o.map((op,i)=>`
          <button onclick="icfesResponder('${encodeURIComponent(asig)}',${idx},'${encodeURIComponent(op.charAt(0))}')"
            style="text-align:left;padding:12px 16px;border:2px solid var(--bd);border-radius:10px;background:var(--bg2);cursor:pointer;font-size:13px;font-family:var(--fn);transition:all .15s;width:100%"
            onmouseover="this.style.borderColor='#667eea';this.style.background='#f0f4ff'"
            onmouseout="this.style.borderColor='var(--bd)';this.style.background='var(--bg2)'">
            ${op}
          </button>
        `).join('')}
      </div>
    </div>
    <button onclick="icfesSalirAsig('${encodeURIComponent(asig)}')"
      style="font-size:12px;color:var(--sl3);background:none;border:1px dashed var(--bd);border-radius:8px;padding:8px 14px;cursor:pointer">
      ⏸ Pausar y salir (el progreso se guarda)
    </button>`;
}

// ─── Registrar respuesta y avanzar ────────────────────────────────────────
function icfesResponder(asigEnc, idx, respEnc){
  const asig = decodeURIComponent(asigEnc);
  const resp = decodeURIComponent(respEnc);
  const state = icfesGetState();
  if(!state) return;
  const prog = state.progreso[asig];
  if(!prog || prog.actual !== idx) return;

  prog.respuestas[idx] = resp;
  prog.actual = idx + 1;
  icfesSaveState(state);

  if(prog.actual >= prog.preguntas.length){
    icfesFinalizarAsig(asig);
  } else {
    icfesRenderPregunta(asig);
  }
}

// ─── Salir y pausar ────────────────────────────────────────────────────────
function icfesSalirAsig(asigEnc){
  const asig = decodeURIComponent(asigEnc);
  const state = icfesGetState();
  if(state){ state.activo = false; icfesSaveState(state); }
  const el = gi('icfesContent');
  if(el) icfesRenderMenu(el, icfesGetState());
}

// ─── Finalizar asignatura y mostrar resultado ──────────────────────────────
function icfesFinalizarAsig(asig){
  const state = icfesGetState();
  if(!state) return;
  const prog = state.progreso[asig];
  if(!prog) return;

  // Calcular puntaje
  let correctas = 0;
  prog.preguntas.forEach((q,i)=>{
    // La respuesta correcta original es q.r (letra A/B/C/D)
    // La respuesta del estudiante es la letra del botón pulsado
    // Como las opciones se mezclaron, necesitamos encontrar cuál era la correcta
    // q.r es la letra original; buscamos la opción que comienza con q.r en q.o
    const opCorrecta = (q.o || []).find(op => op.startsWith(q.r + ')') || op.charAt(0) === q.r);
    const respEst = prog.respuestas[i];
    if(respEst && opCorrecta && respEst === opCorrecta.charAt(0)) correctas++;
  });

  if(!state.resultados) state.resultados = {};
  state.resultados[asig] = { finalizado:true, correctas, total:20, fecha: new Date().toLocaleDateString('es-CO') };
  state.activo = false;
  icfesSaveState(state);

  const asigs = Object.keys(ICFES_PREGUNTAS);
  const todasCompletas = asigs.every(a => state.resultados?.[a]?.finalizado);
  const totalCorrectas = asigs.reduce((s,a)=> s + (state.resultados?.[a]?.correctas||0), 0);
  const color = correctas>=15?'#276749':correctas>=10?'#c05621':'#c53030';

  const el = gi('icfesContent');
  if(!el) return;

  let siguienteHtml = '';
  if(!todasCompletas){
    const pendiente = asigs.find(a => !state.resultados?.[a]?.finalizado);
    if(pendiente){
      siguienteHtml = `<button class="btn bn" style="margin-top:10px" onclick="icfesIniciarAsig('${encodeURIComponent(pendiente)}')">
        ➡️ Continuar con: ${pendiente}</button>`;
    }
  }

  el.innerHTML = `<div class="card" style="text-align:center;padding:28px 20px">
    <div style="font-size:40px;margin-bottom:12px">${correctas>=15?'🏆':correctas>=10?'👍':'📚'}</div>
    <div style="font-size:28px;font-weight:900;color:${color};margin-bottom:6px">${correctas} / 20</div>
    <div style="font-size:15px;color:var(--sl2);margin-bottom:4px"><strong>${asig}</strong></div>
    <div style="font-size:13px;color:var(--sl3);margin-bottom:16px">${correctas>=15?'¡Excelente resultado!':correctas>=10?'Buen resultado, sigue practicando':'Sigue estudiando, tú puedes lograrlo'}</div>
    ${todasCompletas?`<div style="background:#f0f4ff;border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800">🎓 Simulacro completo: ${totalCorrectas}/${asigs.length*20} total</div>
    </div>`:''}
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <button class="btn bs" onclick="icfesIniciarAsig('${encodeURIComponent(asig)}')">🔄 Repetir ${asig}</button>
      <button class="btn bg" onclick="icfesSalirAsig('${encodeURIComponent(asig)}')">📋 Ver resumen</button>
      ${siguienteHtml}
    </div>
  </div>`;
}

// ─── Reiniciar todo ────────────────────────────────────────────────────────
function icfesReiniciarTodo(){
  Swal.fire({title:'¿Reiniciar todo el progreso?',text:'Se borrarán todas las respuestas y resultados guardados.',icon:'warning',showCancelButton:true,confirmButtonText:'Sí, reiniciar',confirmButtonColor:'#e53e3e',cancelButtonText:'Cancelar'})
  .then(r=>{
    if(r.isConfirmed){
      icfesClearState();
      const el = gi('icfesContent');
      if(el) icfesRenderMenu(el, null);
    }
  });
}

/* ============================================================
   SUPERADMIN — COMUNICADOS GLOBALES
============================================================ */

function pgSACom() {
  return `<div class="ph">
    <h2>📢 Comunicados Globales</h2>
    <p style="font-size:13px;color:var(--sl2)">Crea comunicados visibles para todos los colegios o para colegios específicos.</p>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="chd"><span class="cti">➕ Nuevo Comunicado Global</span></div>
      <div class="fg">
        <div class="fld" style="grid-column:1/-1">
          <label>Título</label>
          <input id="sacomTit" placeholder="Ej: Reunión de directivos" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)">
        </div>
        <div class="fld" style="grid-column:1/-1">
          <label>Mensaje</label>
          <textarea id="sacomMsg" rows="4" placeholder="Escribe el contenido del comunicado..." style="width:100%;resize:vertical;padding:8px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;font-family:inherit"></textarea>
        </div>
        <div class="fld">
          <label>Dirigido a</label>
          <select id="sacomPara" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)">
            <option value="todos">👥 Todos (admins, profes y estudiantes)</option>
            <option value="admin">🏫 Solo Administradores</option>
            <option value="profe">👩‍🏫 Solo Profesores</option>
            <option value="est">🎓 Solo Estudiantes</option>
          </select>
        </div>
        <div class="fld">
          <label>Color / Tipo</label>
          <select id="sacomColor" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)">
            <option value="azul">🔵 Azul — Informativo</option>
            <option value="verde">🟢 Verde — Positivo</option>
            <option value="naranja">🟠 Naranja — Precaución</option>
            <option value="rojo">🔴 Rojo — Urgente</option>
            <option value="morado">🟣 Morado — Especial</option>
          </select>
        </div>
        <div class="fld">
          <label>Fecha Inicio</label>
          <input type="date" id="sacomFi" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="fld">
          <label>Fecha Fin</label>
          <input type="date" id="sacomFf" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)">
        </div>
        <div class="fld" style="grid-column:1/-1">
          <label>Colegios destinatarios</label>
          <div style="font-size:11px;color:var(--sl2);margin-bottom:6px">Deja todos sin marcar para enviar a TODOS los colegios. Marca los específicos si quieres segmentar.</div>
          <div id="sacomColegiosChk" style="display:flex;flex-wrap:wrap;gap:8px;padding:10px;background:var(--bg2);border-radius:8px;border:1px solid var(--bd)">
            <span style="font-size:12px;color:var(--sl3)">Cargando colegios...</span>
          </div>
        </div>
      </div>
      <button class="btn bn" style="margin-top:12px" onclick="sacomPublicar()">📢 Publicar Comunicado Global</button>
    </div>
    <div class="card">
      <div class="chd"><span class="cti">📋 Comunicados Creados</span></div>
      <div id="sacomListW"><div class="mty"><div class="ei">📢</div><p>Cargando...</p></div></div>
    </div>
  </div>`;
}

async function initSACom() {
  // Set default end date
  const d = new Date(); d.setDate(d.getDate()+7);
  const ff = gi('sacomFf'); if(ff) ff.value = d.toISOString().slice(0,10);
  // Load colegios for checkboxes
  try {
    const colegios = await saApiFetch('/api/superadmin/colegios');
    const chkEl = gi('sacomColegiosChk');
    if(chkEl && Array.isArray(colegios)) {
      if(!colegios.length) {
        chkEl.innerHTML = '<span style="font-size:12px;color:var(--sl3)">No hay colegios registrados</span>';
      } else {
        chkEl.innerHTML = `<label style="font-size:12px;font-weight:700;color:var(--nv);width:100%">
          <input type="checkbox" id="sacomTodos" checked onchange="sacomToggleTodos(this)"> 
          🌐 Todos los colegios (${colegios.length})
        </label>` +
        colegios.map(c=>`<label style="font-size:12px;padding:4px 8px;background:#fff;border-radius:6px;border:1px solid var(--bd);cursor:pointer">
          <input type="checkbox" class="sacomCh" value="${c.id}" disabled> ${esc(c.nombre)}
        </label>`).join('');
      }
    }
  } catch(e) {}
  await sacomRenderList();
}

function sacomToggleTodos(chk) {
  document.querySelectorAll('.sacomCh').forEach(c => {
    c.disabled = chk.checked;
    if(chk.checked) c.checked = false;
  });
}

async function sacomPublicar() {
  const tit = (gi('sacomTit')?.value||'').trim();
  const msg = (gi('sacomMsg')?.value||'').trim();
  const para = gi('sacomPara')?.value||'todos';
  const color = gi('sacomColor')?.value||'azul';
  const fi = gi('sacomFi')?.value||'';
  const ff = gi('sacomFf')?.value||'';
  if(!tit){ sw('warning','Escribe un título'); return; }
  if(!msg){ sw('warning','Escribe el mensaje'); return; }
  if(!fi||!ff){ sw('warning','Selecciona las fechas'); return; }
  if(fi>ff){ sw('warning','La fecha fin debe ser mayor o igual al inicio'); return; }

  // Get selected colegios
  const todosChk = gi('sacomTodos');
  let colegiosDestino = [];
  if(!todosChk?.checked) {
    document.querySelectorAll('.sacomCh:checked').forEach(c => colegiosDestino.push(c.value));
  }

  try {
    await saApiFetch('/api/superadmin/comunicados', {
      method: 'POST',
      body: JSON.stringify({ titulo:tit, mensaje:msg, para, color, fechaInicio:fi, fechaFin:ff, colegiosDestino })
    });
    sw('success','📢 Comunicado global publicado');
    gi('sacomTit').value=''; gi('sacomMsg').value='';
    // Reset colegios to "todos"
    const todosEl = gi('sacomTodos'); if(todosEl){ todosEl.checked=true; sacomToggleTodos(todosEl); }
    await sacomRenderList();
  } catch(e){ sw('error','Error: '+e.message); }
}

async function sacomRenderList() {
  const el = gi('sacomListW'); if(!el) return;
  try {
    const lista = await saApiFetch('/api/superadmin/comunicados');
    if(!lista.length){ el.innerHTML='<div class="mty"><div class="ei">📢</div><p>Sin comunicados creados</p></div>'; return; }
    const hoy = new Date().toISOString().slice(0,10);
    const colorMap = {
      azul:{border:'#bee3f8',bg:'#ebf8ff',badge:'#2b6cb0',icon:'🔵'},
      verde:{border:'#9ae6b4',bg:'#f0fff4',badge:'#276749',icon:'🟢'},
      naranja:{border:'#fbd38d',bg:'#fffaf0',badge:'#c05621',icon:'🟠'},
      rojo:{border:'#feb2b2',bg:'#fff5f5',badge:'#c53030',icon:'🔴'},
      morado:{border:'#d6bcfa',bg:'#faf5ff',badge:'#553c9a',icon:'🟣'},
    };
    el.innerHTML = lista.map(c=>{
      const cs = colorMap[c.color]||colorMap.azul;
      const vigente = c.activo&&c.fechaInicio<=hoy&&c.fechaFin>=hoy;
      const destLabel = (!c.colegiosDestino||!c.colegiosDestino.length)
        ? '🌐 Todos los colegios'
        : `${c.colegiosDestino.length} colegio(s) específico(s)`;
      const paraLabel = {todos:'👥 Todos',admin:'🏫 Admins',profe:'👩‍🏫 Profes',est:'🎓 Estudiantes'}[c.para]||c.para;
      return `<div style="border:1.5px solid ${cs.border};border-radius:10px;background:${cs.bg};padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="font-weight:800;font-size:14px;margin-bottom:2px">${cs.icon} ${esc(c.titulo)}</div>
            <div style="font-size:12px;color:var(--sl2);margin-bottom:6px">${esc(c.mensaje)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
            <span class="bdg" style="background:${cs.badge};color:#fff;font-size:10px">${paraLabel}</span>
            <span class="bdg ${vigente?'bgr':'brd'}" style="font-size:10px">${vigente?'✅ Activo':'⭕ Inactivo'}</span>
          </div>
        </div>
        <div style="font-size:11px;color:var(--sl3);margin-bottom:8px">
          📅 ${c.fechaInicio} → ${c.fechaFin} &nbsp;·&nbsp; 🎯 ${destLabel}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn xs ${c.activo?'brd':'bgr'} sm" onclick="sacomToggle('${c.id}',${!c.activo})">${c.activo?'⏸ Desactivar':'▶ Activar'}</button>
          <button class="btn xs br sm" onclick="sacomBorrar('${c.id}')">🗑️ Eliminar</button>
        </div>
      </div>`;
    }).join('');
  } catch(e){ el.innerHTML='<div class="al aly">Error al cargar</div>'; }
}

async function sacomToggle(id, activo) {
  try {
    await saApiFetch(`/api/superadmin/comunicados/${id}`, { method:'PUT', body:JSON.stringify({activo}) });
    sw('success', activo?'Comunicado activado':'Comunicado desactivado');
    sacomRenderList();
  } catch(e){ sw('error',e.message); }
}

async function sacomBorrar(id) {
  const r = await Swal.fire({title:'¿Eliminar comunicado?',text:'Esta acción no se puede deshacer.',icon:'warning',showCancelButton:true,confirmButtonColor:'#e53e3e',confirmButtonText:'Sí, eliminar',cancelButtonText:'Cancelar'});
  if(!r.isConfirmed) return;
  try {
    await saApiFetch(`/api/superadmin/comunicados/${id}`, { method:'DELETE' });
    sw('success','Comunicado eliminado');
    sacomRenderList();
  } catch(e){ sw('error',e.message); }
}

/* ============================================================
   KEYBOARD & INIT
============================================================ */
/* ════════════════════════════════════════════════════════════════
   SUPER ADMIN — PANEL GLOBAL
════════════════════════════════════════════════════════════════ */

/* ══ saApiFetch robusto — null-safe, maneja token expirado ══ */
async function saApiFetch(path, opts = {}) {
  const token = window.TokenStore?.get();
  if (!token) { doLogout(); throw new Error('Sin sesión activa'); }
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  headers['Authorization'] = 'Bearer ' + token;
  let res;
  try { res = await fetch(API_BASE + path, { ...opts, headers }); }
  catch (e) { throw new Error('Error de red. Verifica tu conexión.'); }
  if (res.status === 401) {
    const d = await res.json().catch(() => ({}));
    if (d.expired || d.code === 'TOKEN_EXPIRED' || d.code === 'TOKEN_INVALID') {
      TokenStore.clear(); doLogout();
      Swal.fire({ icon: 'info', title: 'Sesión expirada', text: 'Vuelve a iniciar sesión.' });
      throw new Error('Sesión expirada');
    }
    throw new Error(d.error || 'No autorizado');
  }
  if (res.status === 403) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Acceso denegado');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
function pgSADash() {
  return `<div id="saDashCard">
    <div class="card" style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#fff;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem">
        <div style="display:flex;align-items:center;gap:18px">
          <svg width="52" height="52" viewBox="0 0 82 82" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;filter:drop-shadow(0 3px 10px rgba(0,0,0,.3))">
            <rect x="1" y="41" width="56" height="56" rx="14" transform="rotate(-45 1 41)" fill="url(#sadlg1)"/>
            <rect x="5" y="41" width="50" height="50" rx="11" transform="rotate(-45 5 41)" fill="url(#sadlg2)" opacity="0.55"/>
            <text x="41" y="41" text-anchor="middle" dominant-baseline="central" font-family="'Outfit',sans-serif" font-size="32" font-weight="800" fill="#ffffff" letter-spacing="-1">E</text>
            <defs>
              <linearGradient id="sadlg1" x1="0" y1="0" x2="82" y2="82" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#0ea5a0"/><stop offset="100%" stop-color="#1e40af"/>
              </linearGradient>
              <linearGradient id="sadlg2" x1="0" y1="0" x2="82" y2="82" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;opacity:.6;font-weight:600;margin-bottom:3px">EduSistema Pro</div>
            <h2 style="color:#fff;margin-bottom:.2rem">Panel Global</h2>
            <p style="opacity:.8;font-size:.9rem;margin:0">Bienvenido, <strong>${CU.nombre}</strong></p>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <span id="saSugBadge" style="display:none;background:#e53e3e;color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer" onclick="goto('sasug')">💡 Sugerencias</span>
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);font-size:13px;font-weight:700;padding:8px 18px;border-radius:9px" onclick="initSADash()">🔄 Actualizar</button>
        </div>
      </div>
      <div id="saStatsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:.75rem;margin-top:1.25rem">
        <div style="text-align:center;opacity:.6;padding:1rem"><div style="font-size:1.6rem">⏳</div><p style="font-size:.8rem;margin:.25rem 0">Cargando estadísticas…</p></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:1rem;margin-bottom:1rem" id="saDashMidRow">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
          <h3 style="margin:0">📊 Comparativa por institución</h3>
          <div id="saDashChartMode" style="display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="setSAMode(this,'est')" data-mode="est"
              style="padding:6px 14px;border-radius:20px;border:2px solid #1d6fef;background:#1d6fef;color:#fff;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit">
              🎓 Estudiantes
            </button>
            <button onclick="setSAMode(this,'profs')" data-mode="profs"
              style="padding:6px 14px;border-radius:20px;border:2px solid #e3eaf3;background:#f7fafd;color:#6b7f96;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit">
              👩‍🏫 Profesores
            </button>
            <button onclick="setSAMode(this,'prom')" data-mode="prom"
              style="padding:6px 14px;border-radius:20px;border:2px solid #e3eaf3;background:#f7fafd;color:#6b7f96;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit">
              📊 Prom. Notas
            </button>
            <button onclick="setSAMode(this,'asist')" data-mode="asist"
              style="padding:6px 14px;border-radius:20px;border:2px solid #e3eaf3;background:#f7fafd;color:#6b7f96;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit">
              ✅ Asistencia
            </button>
          </div>
        </div>
        <div id="saDashChart" style="overflow-x:auto;min-height:160px;display:flex;align-items:flex-end;padding-bottom:4px"></div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 .75rem">⚡ Resumen rápido</h3>
        <div id="saDashQuickBody" style="color:#888;font-size:.9rem">Cargando…</div>
      </div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
        <h3 style="margin:0">🏫 Todas las instituciones</h3>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <input id="saDashSearch" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="width:180px;font-size:.85rem" placeholder="🔍 Buscar…" oninput="renderSADashTable(window._saStatsData||[])">
          <button class="btn bsec" style="font-size:.8rem" onclick="exportarSADashCSV()">📤 CSV</button>
        </div>
      </div>
      <div id="saColegiosList" style="overflow-x:auto"><p style="color:#999;text-align:center;padding:1rem">Cargando…</p></div>
    </div>
  </div>`;
}

function renderSADashKPIs(stats, sugCount) {
  const grid = gi('saStatsGrid');
  if (!grid) return;
  const activos = stats.filter(s => s.activo).length;
  const totalEst = stats.reduce((a, s) => a + (s.totalEst || 0), 0);
  const totalProfs = stats.reduce((a, s) => a + (s.totalProfs || 0), 0);
  const totalSal = stats.reduce((a, s) => a + (s.totalSalones || 0), 0);
  const promNotas = stats.length ? +(stats.reduce((a, s) => a + (s.promNotas || 0), 0) / stats.length).toFixed(2) : 0;
  const promAsist = stats.length ? +(stats.reduce((a, s) => a + (s.asistPct || 0), 0) / stats.length).toFixed(1) : 0;
  const kpis = [
    { ic: '🏫', lb: 'Instituciones', val: stats.length, sub: `${activos} activas` },
    { ic: '👨‍🎓', lb: 'Estudiantes', val: totalEst.toLocaleString(), sub: 'total sistema' },
    { ic: '👩‍🏫', lb: 'Profesores', val: totalProfs.toLocaleString(), sub: 'total sistema' },
    { ic: '🏛️', lb: 'Salones', val: totalSal.toLocaleString(), sub: 'en total' },
    { ic: '📊', lb: 'Prom. Notas', val: promNotas, sub: promNotas >= 4 ? '🟢 Excelente' : promNotas >= 3 ? '🟡 Aceptable' : '🔴 Bajo' },
    { ic: '✅', lb: 'Asistencia', val: promAsist + '%', sub: promAsist >= 85 ? '🟢 Buena' : '🟡 Regular' },
  ];
  grid.innerHTML = kpis.map(k => `
    <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:.7rem .9rem;text-align:center">
      <div style="font-size:1.5rem">${k.ic}</div>
      <div style="font-size:1.4rem;font-weight:800;color:#fff;line-height:1.1">${k.val}</div>
      <div style="font-size:.72rem;opacity:.85;color:#e2e8f0">${k.lb}</div>
      <div style="font-size:.65rem;opacity:.65;color:#bee3f8">${k.sub}</div>
    </div>`).join('');
}

/* Helper: botones pill del comparativa */
function setSAMode(btn, mode){
  const wrap = gi('saDashChartMode');
  if(!wrap) return;
  wrap.querySelectorAll('button').forEach(b=>{
    const active = b.dataset.mode === mode;
    b.dataset.active = active ? '1' : '0';
    b.style.background = active ? '#1d6fef' : '#f7fafd';
    b.style.color = active ? '#fff' : '#6b7f96';
    b.style.borderColor = active ? '#1d6fef' : '#e3eaf3';
    b.style.boxShadow = active ? '0 4px 14px rgba(29,111,239,.35)' : 'none';
    b.style.transform = active ? 'translateY(-1px)' : 'none';
  });
  renderSADashChart(window._saStatsData||[]);
}

function renderSADashChart(stats) {
  const chart = gi('saDashChart');
  if (!chart) return;
  if (!stats.length) { chart.innerHTML = '<p style="color:#999;font-size:.85rem;padding:1rem">Sin datos</p>'; return; }
  const wrap = gi('saDashChartMode');
  // Find active button — either marked with data-active or by background style
  const activeBtn = wrap ? (wrap.querySelector('[data-active="1"]') || wrap.querySelector('button')) : null;
  const mode = activeBtn?.dataset.mode || 'est';
  const getData = s => ({ est: s.totalEst || 0, profs: s.totalProfs || 0, prom: s.promNotas || 0, asist: s.asistPct || 0 }[mode]);
  const maxVal = Math.max(...stats.map(getData), 1);
  const BAR_H = 140;
  const colors = ['#3182ce','#38a169','#d69e2e','#805ad5','#e53e3e','#319795','#dd6b20','#b83280'];
  chart.innerHTML = '<div style="display:flex;align-items:flex-end;gap:6px;min-width:max-content">' +
    stats.map((s, i) => {
      const val = getData(s);
      const h = Math.max(4, Math.round((val / maxVal) * BAR_H));
      const name = s.colegioNombre.length > 12 ? s.colegioNombre.slice(0, 12) + '…' : s.colegioNombre;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:58px" title="${s.colegioNombre}: ${val}">
        <div style="font-size:.65rem;font-weight:700;color:#2d3748">${val}</div>
        <div style="width:40px;height:${h}px;background:${colors[i % colors.length]};border-radius:5px 5px 0 0"></div>
        <div style="font-size:.6rem;text-align:center;color:#718096;max-width:58px;word-break:break-word;line-height:1.2">${name}</div>
      </div>`;
    }).join('') + '</div>';
}

function renderSADashTable(stats) {
  const q = (gi('saDashSearch')?.value || '').toLowerCase();
  const filtered = q ? stats.filter(s => s.colegioNombre.toLowerCase().includes(q)) : stats;
  const list = gi('saColegiosList');
  if (!list) return;
  if (!filtered.length) { list.innerHTML = '<p style="color:#999;text-align:center;padding:1.5rem">Sin resultados.</p>'; return; }
  list.innerHTML = `<table class="tbl"><thead><tr>
    <th>Institución</th><th>Est.</th><th>Profs.</th><th>Salones</th><th>Prom.Notas</th><th>Asistencia</th><th>Estado</th>
  </tr></thead><tbody>${filtered.map(s => `<tr>
    <td><strong>${s.colegioNombre}</strong></td>
    <td>${s.totalEst || 0}</td><td>${s.totalProfs || 0}</td><td>${s.totalSalones || 0}</td>
    <td><span style="font-weight:700;color:${(s.promNotas||0)>=3.5?'#276749':(s.promNotas||0)>=3?'#744210':'#9b2c2c'}">${s.promNotas || 0}</span></td>
    <td><span style="font-weight:600;color:${(s.asistPct||0)>=85?'#276749':'#c05621'}">${s.asistPct != null ? s.asistPct + '%' : '—'}</span></td>
    <td><span class="bdg ${s.activo ? 'bgr' : 'bred'}">${s.activo ? 'Activo' : 'Inactivo'}</span></td>
  </tr>`).join('')}</tbody></table>`;
}

function renderSADashQuick(stats) {
  const qb = gi('saDashQuickBody');
  if (!qb) return;
  const activos = stats.filter(s => s.activo);
  if (!activos.length) { qb.innerHTML = '<p style="color:#999;font-size:.85rem">Sin instituciones activas.</p>'; return; }
  const top = activos.reduce((a, b) => (a.totalEst || 0) > (b.totalEst || 0) ? a : b);
  const mejor = activos.reduce((a, b) => (a.promNotas || 0) > (b.promNotas || 0) ? a : b);
  const menor = activos.reduce((a, b) => (a.promNotas || 0) < (b.promNotas || 0) ? a : b);
  qb.innerHTML = `<div style="display:flex;flex-direction:column;gap:.5rem;font-size:.85rem">
    <div style="background:#ebf8ff;border-radius:8px;padding:.5rem .75rem">
      <div style="font-size:.7rem;color:#2b6cb0;font-weight:700;text-transform:uppercase">Mayor población</div>
      <div style="font-weight:600;color:#1a365d">${top.colegioNombre}</div>
      <div style="color:#4a5568">${top.totalEst || 0} estudiantes</div>
    </div>
    <div style="background:#f0fff4;border-radius:8px;padding:.5rem .75rem">
      <div style="font-size:.7rem;color:#276749;font-weight:700;text-transform:uppercase">Mejor rendimiento</div>
      <div style="font-weight:600;color:#1c4532">${mejor.colegioNombre}</div>
      <div style="color:#4a5568">Prom. ${mejor.promNotas || 0}</div>
    </div>
    ${mejor !== menor ? `<div style="background:#fff5f5;border-radius:8px;padding:.5rem .75rem">
      <div style="font-size:.7rem;color:#c53030;font-weight:700;text-transform:uppercase">Requiere atención</div>
      <div style="font-weight:600;color:#742a2a">${menor.colegioNombre}</div>
      <div style="color:#4a5568">Prom. ${menor.promNotas || 0}</div>
    </div>` : ''}
    <div style="background:#faf5ff;border-radius:8px;padding:.5rem .75rem">
      <div style="font-size:.7rem;color:#553c9a;font-weight:700;text-transform:uppercase">Colegios inactivos</div>
      <div style="font-weight:600;color:#322659">${stats.filter(s => !s.activo).length} de ${stats.length}</div>
    </div>
  </div>`;
}

function exportarSADashCSV() {
  const stats = window._saStatsData || [];
  if (!stats.length) return sw('warning', 'No hay datos para exportar');
  const header = 'Institución,Estudiantes,Profesores,Salones,Prom.Notas,Asistencia%,Estado';
  const rows = stats.map(s => `"${s.colegioNombre}",${s.totalEst||0},${s.totalProfs||0},${s.totalSalones||0},${s.promNotas||0},${s.asistPct||0},${s.activo?'Activo':'Inactivo'}`);
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `SuperAdmin_Stats_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  sw('success', 'CSV exportado');
}

async function initSADash() {
  // Reset UI a estado de carga
  const grid = gi('saStatsGrid');
  if (grid) grid.innerHTML = '<div style="text-align:center;opacity:.6;padding:1rem"><div style="font-size:1.6rem">⏳</div><p style="font-size:.8rem;margin:.25rem 0;color:#fff">Cargando…</p></div>';
  const list = gi('saColegiosList');
  if (list) list.innerHTML = '<p style="color:#999;text-align:center;padding:1rem">Cargando…</p>';
  try {
    const [statsRaw, sugCount] = await Promise.all([
      saApiFetch('/api/superadmin/stats').catch(() => []),
      saApiFetch('/api/sugerencias/count').catch(() => ({ noLeidas: 0 })),
    ]);
    const stats = Array.isArray(statsRaw) ? statsRaw : [];
    window._saStatsData = stats;
    if (!stats.length) {
      if (grid) grid.innerHTML = '<div style="text-align:center;opacity:.7;padding:1rem;color:#fff"><p>Sin instituciones registradas aún.</p><button class="btn" style="background:rgba(255,255,255,.2);color:#fff;margin-top:.5rem" onclick="goto(\'sacolegios\')">＋ Crear primer colegio</button></div>';
    } else {
      renderSADashKPIs(stats, sugCount);
      renderSADashChart(stats);
      renderSADashTable(stats);
      renderSADashQuick(stats);
    }
    const badge = gi('saSugBadge');
    if (badge && sugCount && sugCount.noLeidas > 0) {
      badge.textContent = `💡 ${sugCount.noLeidas} nueva${sugCount.noLeidas > 1 ? 's' : ''}`;
      badge.style.display = 'inline-block';
    }
    // Responsive
    const midRow = gi('saDashMidRow');
    if (midRow && window.innerWidth < 768) midRow.style.gridTemplateColumns = '1fr';
  } catch (e) {
    if (grid) grid.innerHTML = `<div style="color:#fed7d7;padding:1rem;text-align:center">❌ Error al cargar: ${e.message}<br><button class="btn" style="background:rgba(255,255,255,.2);color:#fff;margin-top:.5rem" onclick="initSADash()">Reintentar</button></div>`;
  }
}

/* ─── COLEGIOS & ADMINS ─────────────────────────────────── */
function pgSAColegios() {
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
      <h2>🏫 Colegios & Admins</h2>
      <button class="btn" onclick="modalNuevoColegio()">＋ Nuevo Colegio</button>
    </div>
    <input id="saColSearch" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="max-width:300px;margin-bottom:1rem" placeholder="🔍 Buscar colegio…" oninput="filtrarColegios()">
    <div id="saColegiosTable" style="overflow-x:auto">Cargando…</div>
  </div>`;
}

async function initSAColegios() {
  try {
    const raw = await saApiFetch('/api/superadmin/colegios');
    window._saColegios = Array.isArray(raw) ? raw : [];
    renderSAColegiosTable(window._saColegios);
  } catch (e) {
    const el = gi('saColegiosTable');
    if (el) el.innerHTML = `<p style="color:red">Error: ${e.message} <button class="btn bsm" onclick="initSAColegios()">Reintentar</button></p>`;
  }
}

function filtrarColegios() {
  const q = (gi('saColSearch')?.value || '').toLowerCase();
  const lista = (window._saColegios || []).filter(c => c.nombre.toLowerCase().includes(q));
  renderSAColegiosTable(lista);
}

function renderSAColegiosTable(lista) {
  const el = gi('saColegiosTable');
  if (!el) return;
  if (!lista.length) { el.innerHTML = '<p style="color:#999;text-align:center;padding:1.5rem">No hay colegios registrados.<br><button class="btn" style="margin-top:.5rem" onclick="modalNuevoColegio()">＋ Crear el primero</button></p>'; return; }
  el.innerHTML = `<table class="tbl"><thead><tr>
    <th>Nombre</th><th>NIT</th><th>Admins</th><th>Estud.</th><th>Profs.</th><th>Estado</th><th>Acciones</th>
  </tr></thead><tbody>${lista.map(c => `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:8px">
        ${c.logo ? `<img src="${c.logo}" style="width:32px;height:32px;object-fit:contain;border-radius:5px;border:1px solid #e2e8f0;background:#f7fafc;flex-shrink:0" title="Logo ${esc(c.nombre)}">` : '<div style="width:32px;height:32px;border-radius:5px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🏫</div>'}
        <strong>${esc(c.nombre)}</strong>
      </div>
    </td>
    <td style="font-size:.82rem;color:#718096">${c.nit || c.codigo || '—'}</td>
    <td>${c.admins || 0}</td><td>${c.ests || 0}</td><td>${c.profs || 0}</td>
    <td><span class="bdg ${c.activo ? 'bgr' : 'bred'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
    <td style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn bsm" onclick="modalEditColegio('${c.id}')">✏️ Editar</button>
      <button class="btn bsm" onclick="modalAdmins('${c.id}','${c.nombre.replace(/'/g, "\\'")}')">👤 Admins</button>
      <button class="btn bsm" onclick="toggleColegio('${c.id}',${!c.activo})">${c.activo ? '🔒 Desactivar' : '🔓 Activar'}</button>
      <button class="btn bsm bdan" onclick="modalEliminarColegio('${c.id}','${c.nombre.replace(/'/g, "\\'")}')">🗑️</button>
    </td>
  </tr>`).join('')}</tbody></table>`;
}

async function toggleColegio(id, activo) {
  const conf = await Swal.fire({ title: `¿${activo ? 'Activar' : 'Desactivar'} colegio?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí' });
  if (!conf.isConfirmed) return;
  try {
    await saApiFetch(`/api/superadmin/colegios/${id}`, { method: 'PUT', body: JSON.stringify({ activo }) });
    sw('success', activo ? 'Colegio activado' : 'Colegio desactivado');
    initSAColegios();
  } catch (e) { sw('error', e.message); }
}

async function modalEliminarColegio(id, nombre) {
  const conf = await Swal.fire({
    title: `¿Eliminar "${nombre}"?`,
    text: 'Se eliminarán TODOS los datos del colegio (usuarios, notas, salones). Esta acción no se puede deshacer.',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#e53e3e', cancelButtonText: 'Cancelar'
  });
  if (!conf.isConfirmed) return;
  try {
    await saApiFetch(`/api/superadmin/colegios/${id}`, { method: 'DELETE' });
    sw('success', `Colegio "${nombre}" eliminado`);
    initSAColegios();
  } catch (e) { sw('error', e.message); }
}

async function modalNuevoColegio() {
  const { value: f } = await Swal.fire({
    title: 'Nuevo Colegio + Admin',
    width: 560,
    html: `
      <input id="snNombre"  class="swal2-input" placeholder="Nombre del colegio *">
      <input id="snNit"     class="swal2-input" placeholder="NIT del colegio * (ej: 900123456-7)">
      <input id="snDir"     class="swal2-input" placeholder="Dirección">
      <input id="snTel"     class="swal2-input" placeholder="Teléfono">
      <div style="margin:.4rem 1rem .6rem;text-align:left">
        <label style="font-size:11px;font-weight:700;color:#4a5568;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Logo del colegio (opcional)</label>
        <div style="display:flex;align-items:center;gap:10px">
          <label style="cursor:pointer;background:#edf2f7;border:1.5px dashed #a0aec0;border-radius:8px;padding:8px 14px;font-size:12px;color:#4a5568;flex:1;text-align:center;transition:background .15s"
            onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#edf2f7'">
            📁 Seleccionar imagen
            <input type="file" id="snLogo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none"
              onchange="(function(inp){
                const file=inp.files[0];if(!file)return;
                if(file.size>2000000){sw('error','El logo supera 2 MB. Usa una imagen más pequeña.');inp.value='';return;}
                const reader=new FileReader();
                reader.onload=function(ev){
                  window._snLogoB64=ev.target.result;
                  const prev=document.getElementById('snLogoPreview');
                  if(prev){prev.src=ev.target.result;prev.style.display='block';}
                  const lbl=document.getElementById('snLogoLabel');
                  if(lbl) lbl.textContent=file.name;
                };
                reader.readAsDataURL(file);
              })(this)">
          </label>
          <img id="snLogoPreview" src="" alt="preview" style="display:none;width:52px;height:52px;object-fit:contain;border-radius:8px;border:1.5px solid #e2e8f0;background:#f7fafc">
        </div>
        <div id="snLogoLabel" style="font-size:11px;color:#a0aec0;margin-top:3px">PNG, JPG, SVG o WEBP · máx 2 MB</div>
      </div>
      <hr style="margin:.5rem 0">
      <p style="margin:.5rem 1rem;font-size:.85rem;color:#555;text-align:left;font-weight:700">📊 Porcentajes de calificación (deben sumar 100%)</p>
      <div style="display:flex;gap:8px;margin:0 .5rem .5rem;align-items:center">
        <div style="flex:1;text-align:center">
          <label style="font-size:10px;font-weight:700;color:#4a5568;display:block;margin-bottom:3px">Aptitud %</label>
          <input id="snPctA" class="swal2-input" type="number" min="0" max="100" value="60" placeholder="60" style="text-align:center">
        </div>
        <div style="flex:1;text-align:center">
          <label style="font-size:10px;font-weight:700;color:#4a5568;display:block;margin-bottom:3px">Actitud %</label>
          <input id="snPctC" class="swal2-input" type="number" min="0" max="100" value="20" placeholder="20" style="text-align:center">
        </div>
        <div style="flex:1;text-align:center">
          <label style="font-size:10px;font-weight:700;color:#4a5568;display:block;margin-bottom:3px">Responsabilidad %</label>
          <input id="snPctR" class="swal2-input" type="number" min="0" max="100" value="20" placeholder="20" style="text-align:center">
        </div>
        <div id="snPctSum" style="font-size:11px;font-weight:700;color:#276749;padding-top:16px;min-width:50px;text-align:center">= 100%</div>
      </div>
      <hr style="margin:.5rem 0">
      <p style="margin:.5rem 1rem;font-size:.85rem;color:#666;text-align:left">Administrador principal:</p>
      <input id="snANombre" class="swal2-input" placeholder="Nombre del Admin *">
      <input id="snAUser"   class="swal2-input" placeholder="Usuario Admin * (sin espacios)">
      <input id="snAPwd"    class="swal2-input" type="password" placeholder="Contraseña Admin *">
    `,
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'Crear Colegio',
    didOpen: () => {
      window._snLogoB64 = null;
      ['snPctA','snPctC','snPctR'].forEach(id => {
        gi(id)?.addEventListener('input', () => {
          const a=parseInt(gi('snPctA')?.value||0),c=parseInt(gi('snPctC')?.value||0),r=parseInt(gi('snPctR')?.value||0);
          const sum=a+c+r;
          const el=gi('snPctSum');
          if(el){el.textContent='= '+sum+'%';el.style.color=sum===100?'#276749':'#c53030';}
        });
      });
    },
    preConfirm: () => {
      const pctA=parseInt(gi('snPctA')?.value||60);
      const pctC=parseInt(gi('snPctC')?.value||20);
      const pctR=parseInt(gi('snPctR')?.value||20);
      if(pctA+pctC+pctR!==100){Swal.showValidationMessage('Los porcentajes deben sumar exactamente 100%');return false;}
      if(pctA<1||pctC<1||pctR<1){Swal.showValidationMessage('Cada porcentaje debe ser mayor a 0');return false;}
      return {
        nombre:        gi('snNombre')?.value.trim(),
        nit:           gi('snNit')?.value.trim(),
        direccion:     gi('snDir')?.value.trim(),
        telefono:      gi('snTel')?.value.trim(),
        logo:          window._snLogoB64 || '',
        notaPct:       {a:pctA,c:pctC,r:pctR},
        adminNombre:   gi('snANombre')?.value.trim(),
        adminUsuario:  gi('snAUser')?.value.trim(),
        adminPassword: gi('snAPwd')?.value,
      };
    }
  });
  if (!f) return;
  if (!f.nombre || !f.nit || !f.adminNombre || !f.adminUsuario || !f.adminPassword)
    return sw('warning', 'Completa todos los campos obligatorios (*)');
  try {
    await saApiFetch('/api/superadmin/colegios', { method: 'POST', body: JSON.stringify(f) });
    sw('success', `Colegio "${f.nombre}" creado correctamente`);
    initSAColegios();
  } catch (e) { sw('error', e.message); }
}

async function modalEditColegio(id) {
  const col = (window._saColegios || []).find(c => c.id === id);
  if (!col) return sw('error', 'Colegio no encontrado en lista. Recarga la página.');
  const { value: f } = await Swal.fire({
    title: 'Editar Colegio',
    width: 560,
    html: `
      <input id="enNombre"   class="swal2-input" value="${col.nombre}"                   placeholder="Nombre *">
      <input id="enNit"      class="swal2-input" value="${col.nit || col.codigo || ''}"  placeholder="NIT *">
      <input id="enDir"      class="swal2-input" value="${col.direccion || ''}"           placeholder="Dirección">
      <input id="enTel"      class="swal2-input" value="${col.telefono || ''}"            placeholder="Teléfono">
      <input id="enSedes"    class="swal2-input" value="${(col.sedes || []).join(', ')}"  placeholder="Sedes (separadas por coma)">
      <input id="enJornadas" class="swal2-input" value="${(col.jornadas || []).join(', ')}" placeholder="Jornadas (separadas por coma)">
      <div style="margin:.4rem 1rem .6rem;text-align:left">
        <label style="font-size:11px;font-weight:700;color:#4a5568;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Logo del colegio</label>
        <div style="display:flex;align-items:center;gap:10px">
          ${col.logo ? `<img src="${col.logo}" style="width:48px;height:48px;object-fit:contain;border-radius:7px;border:1.5px solid #e2e8f0;background:#f7fafc" title="Logo actual">` : ''}
          <label style="cursor:pointer;background:#edf2f7;border:1.5px dashed #a0aec0;border-radius:8px;padding:7px 12px;font-size:12px;color:#4a5568;flex:1;text-align:center"
            onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#edf2f7'">
            ${col.logo ? '🔄 Cambiar logo' : '📁 Subir logo'}
            <input type="file" id="enLogo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none"
              onchange="(function(inp){
                const file=inp.files[0];if(!file)return;
                if(file.size>2000000){sw('error','El logo supera 2 MB.');inp.value='';return;}
                const reader=new FileReader();
                reader.onload=function(ev){
                  window._enLogoB64=ev.target.result;
                  const prev=document.getElementById('enLogoPreview');
                  if(prev){prev.src=ev.target.result;prev.style.display='block';}
                };
                reader.readAsDataURL(file);
              })(this)">
          </label>
          <img id="enLogoPreview" src="" alt="" style="display:none;width:52px;height:52px;object-fit:contain;border-radius:8px;border:1.5px solid #38a169;background:#f0fff4">
        </div>
        ${col.logo ? '<div style="font-size:11px;color:#a0aec0;margin-top:3px">Deja vacío para mantener el logo actual</div>' : '<div style="font-size:11px;color:#a0aec0;margin-top:3px">PNG, JPG, SVG o WEBP · máx 2 MB</div>'}
      </div>
    `,
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'Guardar',
    didOpen: () => { window._enLogoB64 = null; },
    preConfirm: () => ({
      nombre:    gi('enNombre')?.value.trim() || col.nombre,
      nit:       gi('enNit')?.value.trim(),
      direccion: gi('enDir')?.value.trim(),
      telefono:  gi('enTel')?.value.trim(),
      sedes:     gi('enSedes')?.value.split(',').map(s => s.trim()).filter(Boolean),
      jornadas:  gi('enJornadas')?.value.split(',').map(s => s.trim()).filter(Boolean),
      logo:      window._enLogoB64 || col.logo || '',
    })
  });
  if (!f) return;
  if (!f.nit) return sw('warning', 'El NIT es obligatorio');
  try {
    await saApiFetch(`/api/superadmin/colegios/${id}`, { method: 'PUT', body: JSON.stringify(f) });
    sw('success', 'Colegio actualizado');
    initSAColegios();
  } catch (e) { sw('error', e.message); }
}

async function modalAdmins(colegioId, colegioNombre) {
  try {
    const admins = await saApiFetch(`/api/superadmin/admins?colegioId=${colegioId}`);
    if (!admins) return;
    const lista = admins.map(a => `<tr>
      <td>${a.nombre}</td><td style="font-size:.82rem">${a.usuario}</td>
      <td><span class="bdg ${a.blocked ? 'bred' : 'bgr'}">${a.blocked ? 'Bloqueado' : 'Activo'}</span></td>
      <td style="display:flex;gap:.3rem">
        <button class="btn bsm" onclick="editAdmin('${a.id}')">✏️</button>
        <button class="btn bsm" onclick="toggleAdmin('${a.id}',${!a.blocked})">${a.blocked ? '🔓' : '🔒'}</button>
      </td>
    </tr>`).join('');
    Swal.fire({
      title: `👤 Admins — ${colegioNombre}`,
      html: `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nombre</th><th>Usuario</th><th>Estado</th><th>Acc.</th></tr></thead>
        <tbody>${lista || '<tr><td colspan="4" style="text-align:center;color:#999">Sin administradores</td></tr>'}</tbody></table></div>
        <hr style="margin:.75rem 0">
        <button class="btn" onclick="modalNuevoAdmin('${colegioId}','${colegioNombre.replace(/'/g, "\\'")}')">＋ Nuevo Admin</button>`,
      width: 660, showConfirmButton: false, showCloseButton: true
    });
  } catch (e) { sw('error', e.message); }
}

async function modalNuevoAdmin(colegioId, colegioNombre) {
  Swal.close();
  const { value: f } = await Swal.fire({
    title: `Nuevo Admin — ${colegioNombre}`,
    html: `<input id="nanom" class="swal2-input" placeholder="Nombre completo *">
           <input id="nausr" class="swal2-input" placeholder="Usuario * (sin espacios)">
           <input id="napwd" class="swal2-input" type="password" placeholder="Contraseña *">`,
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'Crear Admin',
    preConfirm: () => ({ nombre: gi('nanom')?.value.trim(), usuario: gi('nausr')?.value.trim(), password: gi('napwd')?.value, colegioId })
  });
  if (!f || !f.nombre || !f.usuario || !f.password) return;
  try {
    await saApiFetch('/api/superadmin/admins', { method: 'POST', body: JSON.stringify(f) });
    sw('success', 'Admin creado correctamente');
  } catch (e) { sw('error', e.message); }
}

async function editAdmin(id) {
  const { value: f } = await Swal.fire({
    title: 'Editar Admin',
    html: `<input id="eaNom" class="swal2-input" placeholder="Nuevo nombre (vacío = no cambiar)">
           <input id="eaPwd" class="swal2-input" type="password" placeholder="Nueva contraseña (vacío = no cambiar)">`,
    focusConfirm: false, showCancelButton: true,
    preConfirm: () => { const o = {}; const n = gi('eaNom')?.value.trim(); const p = gi('eaPwd')?.value; if (n) o.nombre = n; if (p) o.password = p; return o; }
  });
  if (!f || !Object.keys(f).length) return;
  try {
    await saApiFetch(`/api/superadmin/admins/${id}`, { method: 'PUT', body: JSON.stringify(f) });
    sw('success', 'Admin actualizado');
  } catch (e) { sw('error', e.message); }
}

async function toggleAdmin(id, blocked) {
  try {
    await saApiFetch(`/api/superadmin/admins/${id}`, { method: 'PUT', body: JSON.stringify({ blocked }) });
    sw('success', blocked ? 'Admin bloqueado' : 'Admin desbloqueado');
  } catch (e) { sw('error', e.message); }
}

/* ─── PLAN DE ESTUDIOS ─────────────────────────────────── */
function pgSAPlan() {
  return `<div class="card">
    <h2>📖 Plan de Estudios</h2>
    <p style="color:#888;margin-bottom:1rem">Define áreas, asignaturas e intensidades horarias por colegio.</p>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
      <select id="saPlanCol" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="min-width:200px" onchange="loadSAPlan()">
        <option value="">— Selecciona colegio —</option>
      </select>
      <select id="saPlanCiclo" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" onchange="loadSAPlan()">
        <option value="">Todos los ciclos</option>
        <option value="primaria">Primaria</option>
        <option value="bachillerato">Bachillerato</option>
      </select>
      <button class="btn" onclick="modalNuevaMateria()">＋ Agregar Asignatura</button>
      <button class="btn bsec" onclick="importarPlanDefecto()">📥 Plan por Defecto</button>
      <button class="btn bdan" onclick="eliminarPlanCompleto()" style="margin-left:auto">🗑️ Eliminar Todo</button>
    </div>
    <div id="saPlanTable" style="overflow-x:auto">Selecciona un colegio.</div>
  </div>`;
}

async function initSAPlan() {
  try {
    const raw = await saApiFetch('/api/superadmin/colegios');
    const colegios = Array.isArray(raw) ? raw : [];
    const sel = gi('saPlanCol');
    if (sel) sel.innerHTML = '<option value="">— Selecciona colegio —</option>' +
      colegios.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    if (!colegios.length && sel) sel.innerHTML = '<option value="">Sin colegios registrados</option>';
  } catch (e) { sw('error', e.message); }
}

async function loadSAPlan() {
  const cid = gi('saPlanCol')?.value;
  const pt = gi('saPlanTable');
  if (!cid) { if (pt) pt.textContent = 'Selecciona un colegio.'; return; }
  if (pt) pt.textContent = 'Cargando…';
  try {
    const ciclo = gi('saPlanCiclo')?.value;
    let plan = await saApiFetch(`/api/superadmin/plan/${cid}`);
    if (!plan) return;
    if (ciclo) plan = plan.filter(p => p.ciclo === ciclo);
    if (!plan.length) { if (pt) pt.innerHTML = '<p style="color:#999">Sin asignaturas. Agrega una o usa <strong>Plan por Defecto</strong>.</p>'; return; }
    if (pt) pt.innerHTML = `<table class="tbl"><thead><tr>
      <th>Ciclo</th><th>Grado</th><th>Área</th><th>Asignatura</th><th>h/sem</th>
    </tr></thead><tbody>${plan.map(p => `<tr>
      <td><span class="bdg ${p.ciclo === 'primaria' ? 'bgr' : 'bbl'}">${p.ciclo}</span></td>
      <td>${p.grado}</td><td>${p.area}</td><td>${p.asignatura}</td><td>${p.intensidad}</td>
    </tr>`).join('')}</tbody></table>
    <p style="font-size:.78rem;color:#a0aec0;margin-top:.5rem">${plan.length} asignatura${plan.length > 1 ? 's' : ''}</p>`;
  } catch (e) { if (pt) pt.innerHTML = `<p style="color:red">Error: ${e.message} <button class="btn bsm" onclick="loadSAPlan()">Reintentar</button></p>`; }
}

async function modalNuevaMateria() {
  const cid = gi('saPlanCol')?.value;
  if (!cid) return sw('warning', 'Selecciona un colegio primero');
  const { value: f } = await Swal.fire({
    title: 'Nueva Asignatura',
    html: `<select id="nmCiclo" class="swal2-select" style="width:100%;margin:.25rem 0">
             <option value="primaria">Primaria</option><option value="bachillerato">Bachillerato</option>
           </select>
           <input id="nmGrado" class="swal2-input" placeholder="Grado (ej: 1°, 6°)">
           <input id="nmArea"  class="swal2-input" placeholder="Área (ej: Ciencias Naturales)">
           <input id="nmAsig"  class="swal2-input" placeholder="Asignatura *">
           <input id="nmInt"   class="swal2-input" type="number" min="0" max="40" placeholder="Intensidad h/sem">`,
    focusConfirm: false, showCancelButton: true, confirmButtonText: 'Agregar',
    preConfirm: () => ({ ciclo: gi('nmCiclo')?.value, grado: gi('nmGrado')?.value.trim(), area: gi('nmArea')?.value.trim(), asignatura: gi('nmAsig')?.value.trim(), intensidad: parseInt(gi('nmInt')?.value) || 0 })
  });
  if (!f || !f.asignatura) return;
  try {
    await saApiFetch(`/api/superadmin/plan/${cid}`, { method: 'POST', body: JSON.stringify(f) });
    sw('success', 'Asignatura agregada');
    loadSAPlan();
  } catch (e) { sw('error', e.message); }
}

async function eliminarPlanCompleto() {
  const cid = gi('saPlanCol')?.value;
  if (!cid) return sw('warning', 'Selecciona un colegio primero');
  const conf = await Swal.fire({ title: '¿Eliminar todo el plan?', text: 'Se borrarán todas las asignaturas.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#e53e3e' });
  if (!conf.isConfirmed) return;
  try {
    await saApiFetch(`/api/superadmin/plan/${cid}`, { method: 'DELETE' });
    sw('success', 'Plan eliminado');
    loadSAPlan();
  } catch (e) { sw('error', e.message); }
}

async function importarPlanDefecto() {
  const cid = gi('saPlanCol')?.value;
  if (!cid) return sw('warning', 'Selecciona un colegio primero');
  const conf = await Swal.fire({ title: '¿Importar plan por defecto?', text: 'Esto borrará el plan actual del colegio.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Importar' });
  if (!conf.isConfirmed) return;
  const plan = [
    { ciclo: 'primaria', grado: '1°', area: 'Matemáticas', asignatura: 'Matemáticas', intensidad: 5 },
    { ciclo: 'primaria', grado: '1°', area: 'Lenguaje', asignatura: 'Español', intensidad: 5 },
    { ciclo: 'primaria', grado: '1°', area: 'Ciencias', asignatura: 'Ciencias Naturales', intensidad: 3 },
    { ciclo: 'primaria', grado: '1°', area: 'Sociales', asignatura: 'Ciencias Sociales', intensidad: 3 },
    { ciclo: 'primaria', grado: '1°', area: 'Artística', asignatura: 'Artística', intensidad: 2 },
    { ciclo: 'primaria', grado: '1°', area: 'Ed. Física', asignatura: 'Educación Física', intensidad: 2 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Matemáticas', asignatura: 'Matemáticas', intensidad: 5 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Lenguaje', asignatura: 'Español', intensidad: 4 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Ciencias', asignatura: 'Física', intensidad: 3 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Ciencias', asignatura: 'Química', intensidad: 3 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Filosofía', asignatura: 'Filosofía', intensidad: 2 },
    { ciclo: 'bachillerato', grado: '6°', area: 'Idiomas', asignatura: 'Inglés', intensidad: 3 },
  ];
  try {
    await saApiFetch(`/api/superadmin/plan/${cid}`, { method: 'DELETE' });
    await saApiFetch(`/api/superadmin/plan/${cid}`, { method: 'POST', body: JSON.stringify(plan) });
    sw('success', 'Plan importado correctamente');
    loadSAPlan();
  } catch (e) { sw('error', e.message); }
}

/* ─── ESTADÍSTICAS GLOBALES ─────────────────────────────── */
function pgSAEstadisticas() {
  return `<div id="saEstPage">
    <div class="card" style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#fff;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem">
        <h2 style="color:#fff;margin:0">📊 Estadísticas Globales del Sistema</h2>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff;border:1.5px solid rgba(255,255,255,.35);font-size:13px;font-weight:700;padding:8px 18px;border-radius:9px" onclick="initSAEstadisticas()">🔄 Actualizar</button>
          <button class="btn" style="background:rgba(0,182,155,.25);color:#fff;border:1.5px solid rgba(0,182,155,.4);font-size:13px;font-weight:700;padding:8px 18px;border-radius:9px" onclick="exportarEstCSV()">📤 CSV</button>
        </div>
      </div>
      <div id="saEstGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:.75rem">
        <div style="text-align:center;opacity:.6;padding:1rem"><div style="font-size:1.5rem">⏳</div><p style="font-size:.8rem;margin:.25rem 0">Cargando…</p></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
        <input id="saEstSearch" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="width:200px;font-size:.85rem" placeholder="🔍 Buscar institución…" oninput="renderEstDetalle(window._saEstData||[])">
        <select id="saEstFiltroEstado" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="width:auto;font-size:.85rem" onchange="renderEstDetalle(window._saEstData||[])">
          <option value="">Todos los estados</option>
          <option value="activo">Solo activos</option>
          <option value="inactivo">Solo inactivos</option>
        </select>
        <select id="saEstOrden" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" style="width:auto;font-size:.85rem" onchange="renderEstDetalle(window._saEstData||[])">
          <option value="nombre">Por nombre</option>
          <option value="est_desc">↓ Más estudiantes</option>
          <option value="prom_desc">↓ Mejor promedio</option>
          <option value="asist_desc">↓ Mejor asistencia</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem" id="saEstChartsRow">
      <div class="card">
        <h3 style="margin:0 0 .75rem;font-size:.95rem">📈 Promedio de Notas</h3>
        <div id="saEstChartNotas" style="overflow-x:auto;min-height:130px;display:flex;align-items:flex-end"></div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 .75rem;font-size:.95rem">✅ Asistencia %</h3>
        <div id="saEstChartAsist" style="overflow-x:auto;min-height:130px;display:flex;align-items:flex-end"></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 .75rem">📋 Detalle completo por institución</h3>
      <div id="saEstDetalle" style="overflow-x:auto">Cargando…</div>
    </div>
  </div>`;
}

function renderEstKPIs(stats) {
  const grid = gi('saEstGrid');
  if (!grid) return;
  const activos = stats.filter(s => s.activo).length;
  const totalEst = stats.reduce((a, s) => a + (s.totalEst || 0), 0);
  const totalProfs = stats.reduce((a, s) => a + (s.totalProfs || 0), 0);
  const totalSal = stats.reduce((a, s) => a + (s.totalSalones || 0), 0);
  const promNotas = stats.length ? +(stats.reduce((a, s) => a + (s.promNotas || 0), 0) / stats.length).toFixed(2) : 0;
  const promAsist = stats.length ? +(stats.reduce((a, s) => a + (s.asistPct || 0), 0) / stats.length).toFixed(1) : 0;
  const kpis = [
    { ic: '🏫', lb: 'Instituciones', val: stats.length, sub: `${activos} activas · ${stats.length - activos} inactivas` },
    { ic: '👨‍🎓', lb: 'Estudiantes', val: totalEst.toLocaleString(), sub: `~${stats.length ? Math.round(totalEst / stats.length) : 0} por inst.` },
    { ic: '👩‍🏫', lb: 'Profesores', val: totalProfs.toLocaleString(), sub: `~${stats.length ? Math.round(totalProfs / stats.length) : 0} por inst.` },
    { ic: '🏛️', lb: 'Salones', val: totalSal.toLocaleString(), sub: `~${stats.length ? Math.round(totalSal / stats.length) : 0} por inst.` },
    { ic: '📊', lb: 'Prom. Notas Global', val: promNotas, sub: promNotas >= 4 ? '🟢 Excelente' : promNotas >= 3 ? '🟡 Aceptable' : '🔴 Bajo' },
    { ic: '✅', lb: 'Asistencia Global', val: promAsist + '%', sub: promAsist >= 90 ? '🟢 Excelente' : promAsist >= 75 ? '🟡 Regular' : '🔴 Baja' },
  ];
  grid.innerHTML = kpis.map(k => `
    <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:.7rem .9rem;text-align:center">
      <div style="font-size:1.4rem">${k.ic}</div>
      <div style="font-size:1.3rem;font-weight:800;color:#fff;line-height:1.1">${k.val}</div>
      <div style="font-size:.7rem;opacity:.85;color:#e2e8f0;margin:.1rem 0">${k.lb}</div>
      <div style="font-size:.62rem;opacity:.65;color:#bee3f8">${k.sub}</div>
    </div>`).join('');
}

function renderEstChart(stats, containerId, field, maxOverride) {
  const chart = gi(containerId);
  if (!chart) return;
  if (!stats.length) { chart.innerHTML = '<p style="color:#999;font-size:.85rem;padding:.5rem">Sin datos</p>'; return; }
  const maxVal = maxOverride || Math.max(...stats.map(s => s[field] || 0), 1);
  const BAR_H = 110;
  const colors = ['#3182ce','#38a169','#d69e2e','#805ad5','#e53e3e','#319795','#dd6b20','#b83280'];
  chart.innerHTML = '<div style="display:flex;align-items:flex-end;gap:5px;min-width:max-content">' +
    stats.map((s, i) => {
      const val = s[field] || 0;
      const h = Math.max(4, Math.round((val / maxVal) * BAR_H));
      const name = s.colegioNombre.length > 11 ? s.colegioNombre.slice(0, 11) + '…' : s.colegioNombre;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:54px" title="${s.colegioNombre}: ${val}${maxOverride ? '%' : ''}">
        <div style="font-size:.62rem;font-weight:700;color:#2d3748">${val}${maxOverride ? '%' : ''}</div>
        <div style="width:38px;height:${h}px;background:${colors[i % colors.length]};border-radius:5px 5px 0 0"></div>
        <div style="font-size:.58rem;text-align:center;color:#718096;max-width:54px;word-break:break-word;line-height:1.2">${name}</div>
      </div>`;
    }).join('') + '</div>';
}

function renderEstDetalle(stats) {
  const q = (gi('saEstSearch')?.value || '').toLowerCase();
  const estado = gi('saEstFiltroEstado')?.value || '';
  const orden = gi('saEstOrden')?.value || 'nombre';
  let filtered = stats
    .filter(s => !q || s.colegioNombre.toLowerCase().includes(q))
    .filter(s => !estado || (estado === 'activo' ? s.activo : !s.activo));
  if (orden === 'est_desc') filtered.sort((a, b) => (b.totalEst || 0) - (a.totalEst || 0));
  else if (orden === 'prom_desc') filtered.sort((a, b) => (b.promNotas || 0) - (a.promNotas || 0));
  else if (orden === 'asist_desc') filtered.sort((a, b) => (b.asistPct || 0) - (a.asistPct || 0));
  else filtered.sort((a, b) => a.colegioNombre.localeCompare(b.colegioNombre));
  const det = gi('saEstDetalle');
  if (!det) return;
  if (!filtered.length) { det.innerHTML = '<p style="color:#999;text-align:center;padding:2rem">Sin resultados con los filtros aplicados.</p>'; return; }
  const hayAsist = filtered.some(s => s.asistPct != null && s.asistPct > 0);
  det.innerHTML = `<table class="tbl"><thead><tr>
    <th>#</th><th>Institución</th><th>Estudiantes</th><th>Profesores</th><th>Salones</th>
    <th>Prom. Notas</th>${hayAsist ? '<th>Asistencia</th>' : ''}
    <th>Estado</th>
  </tr></thead><tbody>${filtered.map((s, i) => {
    const nc = (s.promNotas || 0) >= 4 ? '#276749' : (s.promNotas || 0) >= 3 ? '#744210' : '#9b2c2c';
    const ac = (s.asistPct || 0) >= 90 ? '#276749' : (s.asistPct || 0) >= 75 ? '#744210' : '#9b2c2c';
    return `<tr>
      <td style="color:#a0aec0;font-size:.8rem">${i + 1}</td>
      <td><strong>${s.colegioNombre}</strong></td>
      <td>${s.totalEst || 0}</td><td>${s.totalProfs || 0}</td><td>${s.totalSalones || 0}</td>
      <td><div style="display:flex;align-items:center;gap:.4rem">
        <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;min-width:36px"><div style="width:${Math.min(100,(s.promNotas||0)/5*100)}%;height:100%;background:${nc};border-radius:3px"></div></div>
        <span style="font-weight:700;color:${nc};font-size:.88rem">${s.promNotas || 0}</span>
      </div></td>
      ${hayAsist ? `<td>${s.asistPct != null ? `<div style="display:flex;align-items:center;gap:.4rem"><div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;min-width:36px"><div style="width:${Math.min(100,s.asistPct||0)}%;height:100%;background:${ac};border-radius:3px"></div></div><span style="font-weight:600;color:${ac};font-size:.88rem">${s.asistPct}%</span></div>` : '<span style="color:#a0aec0">—</span>'}</td>` : ''}
      <td><span class="bdg ${s.activo ? 'bgr' : 'bred'}">${s.activo ? 'Activo' : 'Inactivo'}</span></td>
    </tr>`;
  }).join('')}</tbody></table>
  <p style="font-size:.75rem;color:#a0aec0;margin-top:.5rem;text-align:right">Mostrando ${filtered.length} de ${stats.length} instituciones</p>`;
}

function exportarEstCSV() {
  const stats = window._saEstData || [];
  if (!stats.length) return sw('warning', 'Sin datos para exportar');
  const header = 'Institución,Estudiantes,Profesores,Salones,Prom.Notas,Asistencia%,Estado';
  const rows = stats.map(s => `"${s.colegioNombre}",${s.totalEst||0},${s.totalProfs||0},${s.totalSalones||0},${s.promNotas||0},${s.asistPct||0},${s.activo?'Activo':'Inactivo'}`);
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `Estadisticas_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  sw('success', 'CSV exportado');
}

async function initSAEstadisticas() {
  const grid = gi('saEstGrid');
  if (grid) grid.innerHTML = '<div style="text-align:center;opacity:.6;padding:1rem;color:#fff">⏳ Cargando…</div>';
  try {
    const statsRaw = await saApiFetch('/api/superadmin/stats');
    const stats = Array.isArray(statsRaw) ? statsRaw : [];
    window._saEstData = stats;
    if (!stats.length) {
      if (grid) grid.innerHTML = '<div style="color:#fff;opacity:.7;padding:1rem;text-align:center">Sin instituciones registradas.</div>';
      const det = gi('saEstDetalle');
      if (det) det.innerHTML = '<p style="color:#999;text-align:center;padding:2rem">Sin datos disponibles.</p>';
      return;
    }
    renderEstKPIs(stats);
    renderEstChart(stats, 'saEstChartNotas', 'promNotas', 5);
    renderEstChart(stats, 'saEstChartAsist', 'asistPct', 100);
    renderEstDetalle(stats);
    const chartsRow = gi('saEstChartsRow');
    if (chartsRow && window.innerWidth < 640) chartsRow.style.gridTemplateColumns = '1fr';
  } catch (e) {
    if (grid) grid.innerHTML = `<div style="color:#fed7d7;padding:1rem;text-align:center">❌ Error: ${e.message}<br><button class="btn" style="background:rgba(255,255,255,.2);color:#fff;margin-top:.5rem" onclick="initSAEstadisticas()">Reintentar</button></div>`;
  }
}

/* ─── AUDITORÍA GLOBAL ──────────────────────────────────── */
function pgSAAuditoria() {
  return `<div class="ph"><h2>🔍 Auditoría Global</h2></div>
  <div class="card">
    <div class="chd"><span class="cti">Filtros</span>
      <button class="btn bg sm" onclick="loadSAAuditoria()">🔄 Actualizar</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:14px;align-items:end">
      <div class="fld" style="margin:0">
        <label>Institución</label>
        <select id="saAudCol" onchange="loadSAAuditoria()" style="font-size:13px;padding:10px 14px">
          <option value="">Todos los colegios</option>
        </select>
      </div>
      <div class="fld" style="margin:0">
        <label>Rol</label>
        <select id="saAudRol" onchange="loadSAAuditoria()" style="font-size:13px;padding:10px 14px">
          <option value="">Todos los roles</option>
          <option value="admin">👤 Admin</option>
          <option value="profe">🧑‍🏫 Profesor</option>
          <option value="est">🎓 Estudiante</option>
          <option value="superadmin">🌐 Superadmin</option>
        </select>
      </div>
      <div class="fld" style="margin:0">
        <label>Buscar</label>
        <div class="srch" style="margin:0">
          <span style="color:var(--sl3)">🔍</span>
          <input id="saAudSearch" placeholder="Buscar acción, usuario…" oninput="loadSAAuditoria()">
        </div>
      </div>
    </div>
  </div>
  <div class="card">
    <div id="saAudTable" style="overflow-x:auto"><div class="mty"><div class="ei">⏳</div><p>Cargando…</p></div></div>
  </div>`;
}

/* Mapa colegioId → nombre, construido en initSAAuditoria */
let _saColMap = {};

async function initSAAuditoria() {
  try {
    const raw = await saApiFetch('/api/superadmin/colegios');
    const colegios = Array.isArray(raw) ? raw : [];
    /* Construir mapa id→nombre para resolver en la tabla */
    _saColMap = {};
    colegios.forEach(c => { _saColMap[c.id] = c.nombre; });
    const sel = gi('saAudCol');
    if (sel) sel.innerHTML = '<option value="">Todos los colegios</option>' +
      colegios.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    loadSAAuditoria();
  } catch (e) { const el = gi('saAudTable'); if (el) el.innerHTML = `<p style="color:red">Error: ${esc(e.message)}</p>`; }
}

/* Convierte una acción técnica a texto legible */
function _fmtAccion(l) {
  const accion = l.accion || '';
  const mat    = l.mat    || '';
  const est    = l.est    || '';

  /* Registro de nota */
  if (mat && mat.includes('(') && !accion) {
    return `📝 Nota ingresada — <b>${mat}</b>${est ? ` · Est: <code>${est.slice(-8)}</code>` : ''}`;
  }
  /* Acciones con texto descriptivo */
  if (accion) {
    const icons = {
      'Sesión cerrada': '🔒', 'login': '🔑', 'Login': '🔑',
      'Colegio creado': '🏫', 'creado': '✅', 'eliminado': '🗑️',
      'Intento': '⚠️', 'bloqueado': '🔴', 'desbloqueado': '🟢',
      'contraseña': '🔑', 'reset': '🔄', 'Backup': '💾',
      'Auditoria limpiada': '🗑️', 'taller': '📎',
    };
    const icon = Object.entries(icons).find(([k]) => accion.includes(k))?.[1] || '📌';
    return `${icon} ${accion}`;
  }
  return mat || '—';
}

/* Formatea valor anterior/nuevo de notas: {"a":2.3,"c":0,"r":0} → A:2.3 C:0 R:0 */
function _fmtVal(v) {
  if (!v || v === '?' || v === '—') return `<span style="color:#a0aec0">${v || '—'}</span>`;
  try {
    const o = JSON.parse(v);
    if (typeof o === 'object' && o !== null && ('a' in o || 'c' in o || 'r' in o)) {
      const parts = [];
      if (o.a !== undefined) parts.push(`<b style="color:#3182ce">Apt:</b>${Number(o.a).toFixed(1)}`);
      if (o.c !== undefined) parts.push(`<b style="color:#805ad5">Act:</b>${Number(o.c).toFixed(1)}`);
      if (o.r !== undefined) parts.push(`<b style="color:#38a169">Res:</b>${Number(o.r).toFixed(1)}`);
      return `<span style="font-size:.78rem">${parts.join(' ')}</span>`;
    }
  } catch(_){}
  /* Valor numérico simple */
  const n = parseFloat(v);
  if (!isNaN(n)) return `<span style="font-weight:600;color:#2d3748">${n.toFixed(2)}</span>`;
  return `<span style="font-size:.8rem">${esc(String(v))}</span>`;
}

async function loadSAAuditoria() {
  const cid  = gi('saAudCol')?.value;
  const rol  = gi('saAudRol')?.value;
  const q    = (gi('saAudSearch')?.value || '').toLowerCase();
  const el   = gi('saAudTable');
  if (!el) return;
  el.textContent = 'Cargando…';
  try {
    let url = '/api/superadmin/auditoria?limit=400';
    if (cid) url += `&colegioId=${cid}`;
    const raw = await saApiFetch(url);
    let logs = Array.isArray(raw) ? raw : [];

    /* Filtros client-side */
    if (rol) logs = logs.filter(l => l.role === rol);
    if (q)   logs = logs.filter(l =>
      (l.accion || '').toLowerCase().includes(q) ||
      (l.who    || '').toLowerCase().includes(q) ||
      (l.mat    || '').toLowerCase().includes(q) ||
      (l.est    || '').toLowerCase().includes(q)
    );

    if (!logs.length) {
      el.innerHTML = '<p style="color:#888;text-align:center;padding:2rem">Sin registros de auditoría.</p>';
      return;
    }

    const rolBadge = (r) => {
      const cls = r === 'superadmin' ? 'bpurp' : r === 'admin' ? 'bor' : r === 'profe' ? 'bbl' : 'bgr';
      const label = r === 'superadmin' ? 'superadmin' : r === 'admin' ? 'admin' : r === 'profe' ? 'profe' : r || '?';
      return `<span class="bdg ${cls}">${label}</span>`;
    };

    const fmtTs = (ts) => {
      if (!ts) return '—';
      try {
        const d = new Date(ts);
        if (isNaN(d)) return ts.slice(0,16);
        return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' })
          + ' ' + d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
      } catch(_){ return ts.slice(0,16); }
    };

    const resolveCol = (colegioId) => {
      if (!colegioId || colegioId === 'global') return '<span style="color:#a0aec0;font-style:italic">global</span>';
      return `<span title="${esc(colegioId)}">${esc(_saColMap[colegioId] || colegioId)}</span>`;
    };

    el.innerHTML = `<table class="tbl"><thead><tr>
      <th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción / Campo</th><th>Anterior</th><th>Nueva</th><th>Colegio</th>
    </tr></thead><tbody>${logs.slice(0, 300).map(l => `<tr>
      <td style="font-size:.78rem;white-space:nowrap">${fmtTs(l.ts)}</td>
      <td style="font-weight:500">${esc(l.who || l.user || '—')}</td>
      <td>${rolBadge(l.role)}</td>
      <td style="font-size:.82rem;max-width:280px">${_fmtAccion(l)}</td>
      <td style="font-size:.8rem">${_fmtVal(l.old)}</td>
      <td style="font-size:.8rem">${_fmtVal(l.nw)}</td>
      <td style="font-size:.78rem">${resolveCol(l.colegioId)}</td>
    </tr>`).join('')}</tbody></table>
    <p style="font-size:.75rem;color:#a0aec0;margin-top:.5rem;text-align:right">
      Mostrando ${Math.min(300, logs.length)} de ${logs.length} registros
    </p>`;
  } catch (e) { el.innerHTML = `<p style="color:red">Error: ${e.message} <button class="btn bsm" onclick="loadSAAuditoria()">Reintentar</button></p>`; }
}

/* ─── MANTENIMIENTO TÉCNICO ─────────────────────────────── */
function pgSAMantenimiento() {
  return `<div class="ph"><h2>⚙️ Mantenimiento Técnico</h2></div>
  <div class="g2">
    <div class="card">
      <div class="chd"><span class="cti">💾 Copia de Seguridad</span></div>
      <p style="font-size:13px;color:var(--sl2);margin-bottom:18px;line-height:1.6">
        Descarga un backup JSON completo de una institución para guardarlo localmente.
      </p>
      <div class="fld">
        <label>Seleccionar institución</label>
        <select id="saBackupCol" style="font-size:14px;padding:12px 15px">
          <option value="">— Selecciona colegio —</option>
        </select>
      </div>
      <button class="btn bn" onclick="descargarBackup()"
        style="width:100%;padding:13px;font-size:14px;font-weight:700;margin-top:4px">
        📥 Descargar Backup JSON
      </button>
    </div>
    <div class="card">
      <div class="chd"><span class="cti">🔑 Reset de Contraseña</span></div>
      <p style="font-size:13px;color:var(--sl2);margin-bottom:18px;line-height:1.6">
        Cambia la contraseña de cualquier usuario de una institución.
      </p>
      <div class="fld">
        <label>Institución</label>
        <select id="saResetCol" onchange="loadSAResetUsuarios()" style="font-size:14px;padding:12px 15px">
          <option value="">— Selecciona colegio —</option>
        </select>
      </div>
      <div class="fld">
        <label>Buscar usuario</label>
        <div class="srch" style="margin:0">
          <span style="color:var(--sl3)">🔍</span>
          <input id="saResetSearch" placeholder="Nombre o ID de usuario…" oninput="filtrarSAResetUsuarios()">
        </div>
      </div>
      <div id="saResetUserList" style="display:none;margin-bottom:14px">
        <select id="saResetUser" size="5"
          style="width:100%;min-height:130px;font-size:13px;border:1.5px solid var(--bd);border-radius:var(--r);padding:6px;background:var(--bg2)">
          <option value="">Cargando usuarios…</option>
        </select>
        <div id="saResetUserInfo" style="font-size:11px;color:var(--sl3);margin-top:4px"></div>
      </div>
      <div class="fld">
        <label>Nueva contraseña</label>
        <input id="saResetPwd" type="password" placeholder="Mínimo 4 caracteres" style="font-size:14px;padding:12px 15px">
      </div>
      <button class="btn bd" onclick="resetUsuario()"
        style="width:100%;padding:13px;font-size:14px;font-weight:700">
        🔑 Cambiar Contraseña
      </button>
    </div>
  </div>`;
}

async function initSAMantenimiento() {
  try {
    const raw = await saApiFetch('/api/superadmin/colegios');
    const colegios = Array.isArray(raw) ? raw : [];
    ['saBackupCol', 'saResetCol'].forEach(sid => {
      const sel = gi(sid);
      if (!sel) return;
      sel.innerHTML = '<option value="">— Selecciona colegio —</option>' +
        colegios.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    });
  } catch (e) { sw('error', e.message); }
}

/* Cache de usuarios del colegio seleccionado para el reset */
let _saResetUsuariosList = [];

async function loadSAResetUsuarios() {
  const cid = gi('saResetCol')?.value;
  const listBox = gi('saResetUserList');
  const sel = gi('saResetUser');
  const info = gi('saResetUserInfo');
  _saResetUsuariosList = [];
  if (!cid) {
    if (listBox) listBox.style.display = 'none';
    return;
  }
  if (sel) sel.innerHTML = '<option value="">Cargando…</option>';
  if (listBox) listBox.style.display = 'block';
  try {
    /* Usa la ruta de usuarios del colegio filtrada por colegioId */
    const raw = await saApiFetch(`/api/superadmin/usuarios-colegio/${cid}`);
    _saResetUsuariosList = Array.isArray(raw) ? raw : [];
    renderSAResetUsuarios(_saResetUsuariosList);
    if (info) info.textContent = `${_saResetUsuariosList.length} usuarios cargados`;
  } catch (e) {
    if (sel) sel.innerHTML = `<option value="">Error: ${esc(e.message)}</option>`;
    if (info) info.textContent = '';
  }
}

function filtrarSAResetUsuarios() {
  const q = (gi('saResetSearch')?.value || '').toLowerCase();
  const filtrados = q
    ? _saResetUsuariosList.filter(u =>
        (u.nombre || '').toLowerCase().includes(q) ||
        (u.usuario || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      )
    : _saResetUsuariosList;
  renderSAResetUsuarios(filtrados);
}

function renderSAResetUsuarios(lista) {
  const sel = gi('saResetUser');
  const info = gi('saResetUserInfo');
  if (!sel) return;
  if (!lista.length) {
    sel.innerHTML = '<option value="">Sin resultados</option>';
    if (info) info.textContent = 'Sin usuarios que coincidan con la búsqueda';
    return;
  }
  const roleLabel = { admin: '👤 Admin', profe: '🧑‍🏫 Profe', est: '🎓 Est' };
  sel.innerHTML = lista.map(u =>
    `<option value="${esc(u.id)}">[${roleLabel[u.role] || u.role}] ${esc(u.nombre)} — ${esc(u.usuario || u.id)}</option>`
  ).join('');
  if (info) info.textContent = `Mostrando ${lista.length} de ${_saResetUsuariosList.length} usuarios`;
}

async function resetUsuario() {
  const uid = gi('saResetUser')?.value;
  const pwd = gi('saResetPwd')?.value?.trim();
  if (!uid) return sw('warning', 'Selecciona un usuario de la lista');
  if (!pwd || pwd.length < 4) return sw('warning', 'La contraseña debe tener al menos 4 caracteres');

  const u = _saResetUsuariosList.find(x => x.id === uid);
  const nombre = u ? u.nombre : uid;
  const conf = await Swal.fire({
    title: '¿Cambiar contraseña?',
    html: `Se cambiará la contraseña de <b>${esc(nombre)}</b>.`,
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'Sí, cambiar', cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e53e3e'
  });
  if (!conf.isConfirmed) return;
  try {
    const res = await saApiFetch(`/api/superadmin/reset-password-usuario/${uid}`, {
      method: 'POST', body: JSON.stringify({ newPassword: pwd })
    });
    if (!res) return;
    sw('success', `✅ Contraseña de ${esc(nombre)} actualizada`);
    const inp = gi('saResetPwd'); if (inp) inp.value = '';
  } catch (e) { sw('error', e.message); }
}

async function descargarBackup() {
  const cid = gi('saBackupCol')?.value;
  if (!cid) return sw('warning', 'Selecciona un colegio');
  try {
    const token = window.TokenStore?.get();
    if (!token) return sw('warning', 'Sin sesión activa');
    const res = await fetch(API_BASE + `/api/superadmin/backup/${cid}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Error backup'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup_${cid}_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    sw('success', 'Backup descargado');
  } catch (e) { sw('error', e.message); }
}

/* resetMasivo() eliminado — reemplazado por resetUsuario() (reset por usuario individual) */

/* ─── SUGERENCIAS — superadmin recibe ──────────────────── */
function pgSASug() {
  return `<div class="ph"><h2>💡 Sugerencias Recibidas</h2></div>
  <div class="card">
    <div class="chd"><span class="cti">Filtros</span>
      <button class="btn bg sm" onclick="loadSASug()">🔄 Actualizar</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="fld" style="margin:0">
        <label>Institución</label>
        <select id="saSugFiltCol" onchange="loadSASug()" style="font-size:13px;padding:10px 14px">
          <option value="">Todos los colegios</option>
        </select>
      </div>
      <div class="fld" style="margin:0">
        <label>Estado</label>
        <select id="saSugFiltLeida" onchange="loadSASug()" style="font-size:13px;padding:10px 14px">
          <option value="">Todas</option>
          <option value="false">🔵 No leídas</option>
          <option value="true">✅ Leídas</option>
        </select>
      </div>
    </div>
  </div>
  <div id="saSugTable"><div class="mty"><div class="ei">⏳</div><p>Cargando…</p></div></div>`;
}

async function initSASug() {
  try {
    const raw = await saApiFetch('/api/superadmin/colegios');
    const colegios = Array.isArray(raw) ? raw : [];
    const sel = gi('saSugFiltCol');
    if (sel) sel.innerHTML = '<option value="">Todos los colegios</option>' +
      colegios.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    loadSASug();
  } catch (e) { const el = gi('saSugTable'); if (el) el.innerHTML = `<p style="color:red">Error: ${esc(e.message)}</p>`; }
}

async function loadSASug() {
  const el = gi('saSugTable'); if (!el) return;
  el.textContent = 'Cargando…';
  try {
    const cid = gi('saSugFiltCol')?.value || '';
    const leida = gi('saSugFiltLeida')?.value || '';
    let url = '/api/sugerencias?limit=200';
    if (cid) url += `&colegioId=${cid}`;
    if (leida !== '') url += `&leida=${leida}`;
    const raw = await saApiFetch(url);
    const list = Array.isArray(raw) ? raw : [];
    if (!list.length) { el.innerHTML = '<p style="color:#999;text-align:center;padding:2rem">No hay sugerencias.</p>'; return; }
    el.innerHTML = list.map(s => `<div class="card" style="margin-bottom:.75rem;border-left:4px solid ${s.leida ? '#cbd5e0' : '#4299e1'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem">
        <div>
          <span class="bdg ${s.role === 'admin' ? 'bor' : s.role === 'profe' ? 'bbl' : 'bgr'}">${s.role}</span>
          <strong style="margin-left:.5rem">${s.nombre}</strong>
          <span style="font-size:.78rem;color:#718096;margin-left:.5rem">${s.colegioNombre || '—'}</span>
        </div>
        <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">
          <span style="font-size:.75rem;color:#718096">${(s.ts || '').slice(0, 10)}</span>
          ${!s.leida ? `<button class="btn bsm" onclick="marcarSugLeida('${s._id}')">✓ Leída</button>` : ''}
          <button class="btn bsm" onclick="responderSug('${s._id}','${encodeURIComponent(s.nombre)}')">💬 Responder</button>
          <button class="btn bsm bdan" onclick="eliminarSug('${s._id}')">🗑️</button>
        </div>
      </div>
      ${s.titulo ? `<div style="font-weight:700;margin:.4rem 0 .2rem"><span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria || 'general'}</span> ${s.titulo}</div>` : `<div style="font-size:.8rem;color:#718096;margin:.2rem 0"><span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria || 'general'}</span></div>`}
      <p style="color:#4a5568;margin:.2rem 0">${s.mensaje}</p>
      ${s.respuesta ? `<div style="background:#f0fff4;border-radius:6px;padding:.5rem .75rem;margin-top:.4rem;font-size:.87rem"><strong>✅ Tu respuesta:</strong> ${s.respuesta}</div>` : ''}
    </div>`).join('');
  } catch (e) { el.innerHTML = `<p style="color:red">Error: ${e.message} <button class="btn bsm" onclick="loadSASug()">Reintentar</button></p>`; }
}

async function marcarSugLeida(id) {
  try { await saApiFetch(`/api/sugerencias/${id}/leer`, { method: 'PUT', body: JSON.stringify({}) }); loadSASug(); }
  catch (e) { sw('error', e.message); }
}

async function responderSug(id, nombreEnc) {
  const nombre = decodeURIComponent(nombreEnc);
  const { value: resp } = await Swal.fire({
    title: `Responder a ${nombre}`, input: 'textarea', inputPlaceholder: 'Escribe tu respuesta…',
    showCancelButton: true, confirmButtonText: 'Enviar', inputAttributes: { rows: 4 }
  });
  if (!resp) return;
  try {
    await saApiFetch(`/api/sugerencias/${id}/responder`, { method: 'PUT', body: JSON.stringify({ respuesta: resp }) });
    sw('success', 'Respuesta enviada'); loadSASug();
  } catch (e) { sw('error', e.message); }
}

async function eliminarSug(id) {
  const conf = await Swal.fire({ title: '¿Eliminar sugerencia?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#e53e3e' });
  if (!conf.isConfirmed) return;
  try { await saApiFetch(`/api/sugerencias/${id}`, { method: 'DELETE' }); loadSASug(); }
  catch (e) { sw('error', e.message); }
}

/* ─── SUGERENCIAS — admin/profe/est envían ──────────────── */
function pgSugerencias() {
  return `<div class="ph"><h2>💡 Sugerencias</h2><p>Envía sugerencias, comentarios o reportes al super administrador de la plataforma.</p></div>
  <div class="card">
    <div class="chd"><span class="cti">Nueva Sugerencia</span></div>
    <div class="fg">
      <div class="fld"><label>Título (opcional)</label><input id="sugTitulo" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)" placeholder="Resumen breve"></div>
      <div class="fld"><label>Categoría</label>
        <select id="sugCat" style="padding:9px 12px;border:1.5px solid var(--bd);border-radius:var(--r);font-size:13px;background:var(--bg2);color:var(--tx);outline:none;font-family:var(--fn)">
          <option value="general">General</option><option value="academico">Académico</option>
          <option value="tecnico">Técnico</option><option value="sugerencia">Sugerencia</option>
          <option value="felicitacion">Felicitación</option><option value="queja">Queja</option>
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

async function initSugerencias() { await cargarMisSugerencias(); }

async function enviarSugerencia() {
  const titulo = (gi('sugTitulo')?.value || '').trim();
  const categoria = gi('sugCat')?.value || 'general';
  const mensaje = (gi('sugMensaje')?.value || '').trim();
  if (!mensaje) return sw('warning', 'El mensaje es obligatorio');
  try {
    await apiFetch('/api/sugerencias', { method: 'POST', body: JSON.stringify({ titulo, categoria, mensaje }) });
    sw('success', '¡Sugerencia enviada correctamente!');
    if (gi('sugTitulo')) gi('sugTitulo').value = '';
    if (gi('sugMensaje')) gi('sugMensaje').value = '';
    await cargarMisSugerencias();
  } catch (e) { sw('error', e.message); }
}

async function cargarMisSugerencias() {
  const cont = gi('sugHistorial'); if (!cont) return;
  try {
    const list = await apiFetch('/api/sugerencias');
    if (!list || !list.length) { cont.innerHTML = '<p style="color:#999;text-align:center;padding:1rem">Aún no has enviado sugerencias.</p>'; return; }
    cont.innerHTML = list.map(s => `<div style="border-bottom:1px solid var(--bd);padding:.75rem 0">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.25rem">
        <span class="bdg" style="background:#ebf4ff;color:#2b6cb0">${s.categoria || 'general'}</span>
        <span style="font-size:.75rem;color:#718096">${(s.ts || '').slice(0, 10)}</span>
      </div>
      ${s.titulo ? `<div style="font-weight:600;margin:.25rem 0">${s.titulo}</div>` : ''}
      <p style="color:#4a5568;margin:.25rem 0;font-size:.9rem">${s.mensaje}</p>
      ${s.respuesta ? `<div style="background:#f0fff4;border-radius:6px;padding:.4rem .6rem;margin-top:.35rem;font-size:.85rem;color:#276749"><strong>💬 Respuesta:</strong> ${s.respuesta}</div>` : '<div style="font-size:.78rem;color:#a0aec0;margin-top:.25rem">Pendiente de respuesta</div>'}
    </div>`).join('');
  } catch (e) { cont.innerHTML = `<p style="color:red;font-size:.85rem">Error: ${e.message}</p>`; }
}

/* ════════════════════════════════════════════════════════════════
   KEYBOARD & INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown',ev=>{
  if(ev.key==='Enter'&&!gi('ls').classList.contains('hidden')) doLogin();
});