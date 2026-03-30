// ============================================================
// api-layer.js — Reemplaza localStorage por llamadas a MongoDB
// Incluir este script ANTES del cierre de </body> en el HTML
// ============================================================

const API_BASE = 'http://localhost:3001'; // 🔧 CAMBIA a tu URL de backend en producción

// ─── Token JWT ───────────────────────────────────────────────────
const TokenStore = {
  get:    ()    => sessionStorage.getItem('edu_jwt'),
  set:    (t)   => sessionStorage.setItem('edu_jwt', t),
  clear:  ()    => sessionStorage.removeItem('edu_jwt'),
};

// ─── Fetch con auth ──────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = TokenStore.get();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...opts, headers });

  // Token expirado → logout automático
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.expired) {
      TokenStore.clear();
      doLogout();
      Swal.fire({ icon: 'info', title: 'Sesión expirada', text: 'Vuelve a iniciar sesión.' });
      return null;
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR dbLoad() y dbSave()
// ═══════════════════════════════════════════════════════════════════

// Sobreescribe la función dbLoad del script original
async function dbLoad() {
  try {
    const data = await apiFetch('/api/db');
    if (data) {
      DB = data;
      // Asegurar campos obligatorios
      DB.mP       = DB.mP       || dfP();
      DB.mB       = DB.mB       || dfB();
      DB.pers     = DB.pers     || dfPer();
      DB.sals     = DB.sals     || [];
      DB.audit    = DB.audit    || [];
      DB.blk      = DB.blk      || {};
      DB.dr       = DB.dr       || { s: '', e: '' };
      DB.drPer    = DB.drPer    || {};
      DB.ext      = DB.ext      || { on: false, s: '', e: '' };
      DB.ups      = DB.ups      || {};
      DB.asist    = DB.asist    || {};
      DB.exc      = DB.exc      || [];
      DB.profs    = DB.profs    || [];
      DB.vclases  = DB.vclases  || [];
      DB.recs     = DB.recs     || [];
      DB.planes   = DB.planes   || [];
      DB.histRecs = DB.histRecs || [];
      DB.histPlanes = DB.histPlanes || [];
      DB.estHist  = DB.estHist  || [];
      DB.anoActual = DB.anoActual || String(new Date().getFullYear());
      DB.notasPorAno = DB.notasPorAno || {};
      DB.sals.forEach(s => { if (!Array.isArray(s.mats)) s.mats = []; });
    }
  } catch (err) {
    console.error('Error cargando DB:', err);
    // Fallback: inicializar vacío
    dbInit();
  }
}

// dbSave: solo guarda config y datos pequeños al backend
// Las notas, asistencias etc. se guardan con rutas específicas
function dbSave() {
  // Guardar config globales en background (no bloqueante)
  _saveConfigBg();
}

async function _saveConfigBg() {
  try {
    const cfgKeys = ['mP', 'mB', 'pers', 'dr', 'drPer', 'ext', 'anoActual'];
    await Promise.all(cfgKeys.map(k =>
      apiFetch(`/api/config/${k}`, {
        method: 'PUT',
        body: JSON.stringify({ value: DB[k] })
      }).catch(e => console.warn(`Config ${k}:`, e))
    ));
  } catch (e) { console.warn('dbSave config error:', e); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR doLogin() — usa /api/auth/login
// ═══════════════════════════════════════════════════════════════════
async function doLogin() {
  const u = gi('liu').value.trim();
  const p = gi('lip').value.trim();
  const err = gi('lierr');

  function show(m) { err.textContent = m; err.style.display = 'block'; }
  if (!u || !p) { show('Ingresa usuario y contraseña.'); return; }

  try {
    const res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: u, password: p })
    });

    const data = await res.json();
    if (!res.ok) { show(data.error || 'Credenciales incorrectas.'); return; }

    // Guardar token
    TokenStore.set(data.token);
    CU = data.user;

    // Cargar DB completa
    await dbLoad();

    gi('ls').classList.add('hidden');
    gi('app').classList.remove('hidden');
    resetSessionTimer();
    bootApp();
  } catch (e) {
    show('Error conectando al servidor. Verifica que el backend esté activo.');
    console.error('Login error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR doLogout()
// ═══════════════════════════════════════════════════════════════════
function doLogout() {
  clearTimeout(_sessionTimer);
  TokenStore.clear();
  CU = null;
  gi('app').classList.add('hidden');
  gi('ls').classList.remove('hidden');
  gi('liu').value = '';
  gi('lip').value = '';
  gi('lierr').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveTri() — guarda nota en MongoDB
// ═══════════════════════════════════════════════════════════════════
async function saveTri(inp) {
  if (!validateSession() || !['admin', 'profe'].includes(CU.role)) {
    sw('error', 'Sin autorización'); return;
  }
  const eid = inp.dataset.eid;
  const per = decodeURIComponent(inp.dataset.per);
  const mat = decodeURIComponent(inp.dataset.mat);
  const f   = inp.dataset.f;
  const v   = parseFloat(inp.value);

  if (isNaN(v) || v < 0 || v > 5) {
    inp.value = (DB.notas[eid]?.[per]?.[mat]?.[f] || 0).toFixed(1);
    return;
  }

  // Actualizar localmente
  syncN(eid);
  const oldDef = def(DB.notas[eid][per][mat]);
  DB.notas[eid][per][mat][f] = v;

  // Actualizar UI inmediatamente
  const nd = def(DB.notas[eid][per][mat]);
  const dc = gi(`dc_${eid}_${encodeURIComponent(mat)}_${encodeURIComponent(per)}`);
  if (dc) dc.innerHTML = `<span class="${scC(nd)}" style="font-size:11px">${nd.toFixed(2)}</span>`;
  const apr = gi('apr_' + eid);
  if (apr) { const p = pprom(eid, per); apr.innerHTML = `<span class="${scC(p)}">${p.toFixed(2)}</span>`; }

  // Guardar en backend
  try {
    await apiFetch(`/api/notas/${eid}/${encodeURIComponent(per)}/${encodeURIComponent(mat)}`, {
      method: 'PUT',
      body: JSON.stringify(DB.notas[eid][per][mat])
    });
    const estNom = DB.ests.find(e => e.id === eid)?.nombre || eid;
    auditLog(estNom, `${mat}(${f})`, oldDef.toFixed(2), nd.toFixed(2));
  } catch (e) {
    console.error('Error guardando nota:', e);
    sw('error', 'Error al guardar nota: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR auditLog() — guarda en MongoDB
// ═══════════════════════════════════════════════════════════════════
function auditLog(estN, campo, oldV, newV) {
  const entry = {
    ts: new Date().toLocaleString('es-CO'),
    uid: CU.id, who: CU.nombre, role: CU.role,
    est: estN, mat: campo, old: String(oldV), nw: String(newV), ip: '—'
  };
  DB.audit.unshift(entry);
  apiFetch('/api/auditoria', { method: 'POST', body: JSON.stringify(entry) })
    .catch(e => console.warn('Audit log error:', e));
}

function logAudit(msg, extra) {
  const entry = {
    ts: new Date().toISOString(),
    uid: CU?.id || '?', who: CU?.nombre || '?', role: CU?.role || '?',
    accion: msg, extra: extra || ''
  };
  if (!DB.audit) DB.audit = [];
  DB.audit.unshift(entry);
  apiFetch('/api/auditoria', { method: 'POST', body: JSON.stringify(entry) })
    .catch(e => console.warn('logAudit error:', e));
}

function logAuditAnon(usuario, msg) {
  apiFetch('/api/auditoria', {
    method: 'POST',
    body: JSON.stringify({ ts: new Date().toISOString(), uid: '?', who: usuario, role: '?', accion: msg, extra: '' })
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR addEst() — crea estudiante en MongoDB
// ═══════════════════════════════════════════════════════════════════
async function addEst(ciclo) {
  const n  = gi('nen').value.trim();
  const ti = gi('neti').value.trim();
  const s  = gi('nes').value;
  const u  = gi('neu').value.trim();
  const p  = gi('nep').value.trim();

  if (!n || !u || !p) { sw('error', 'Nombre, usuario y contraseña son obligatorios'); return; }
  if (uExists(u)) { sw('error', 'Ese usuario ya existe'); return; }

  const id = 'est_' + Date.now();
  const fecha = new Date().toLocaleDateString('es-CO');

  try {
    const newEst = await apiFetch('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({ id, nombre: n, ti, usuario: u, password: p, role: 'est', salon: s, blocked: false, registrado: fecha })
    });
    DB.ests.push({ id, nombre: n, ti, usuario: u, role: 'est', salon: s, blocked: false, registrado: fecha });
    DB.notas[id] = {};
    DB.pers.forEach(per => { DB.notas[id][per] = {}; getMats(id).forEach(m => { DB.notas[id][per][m] = { a: 0, c: 0, r: 0 }; }); });
    DB.estHist.push({ id, nombre: n, ti, salon: s, registrado: fecha, activo: true });
    ['nen', 'neti', 'neu', 'nep'].forEach(x => gi(x).value = '');
    gi('nes').value = '';
    renderEstTabla(ciclo);
    sw('success', 'Estudiante agregado', '', 1400);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR delEst() — elimina estudiante en MongoDB
// ═══════════════════════════════════════════════════════════════════
function delEst(eid, ciclo) {
  const e = DB.ests.find(x => x.id === eid);
  Swal.fire({ title: '¿Eliminar?', text: e.nombre, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/usuarios/${eid}`, { method: 'DELETE' });
        // Actualizar historial
        const h = DB.estHist?.find(x => x.id === eid);
        if (h) {
          h.activo = false;
          h.eliminado = new Date().toLocaleDateString('es-CO');
          h.snapNotas = JSON.parse(JSON.stringify(DB.notas[eid] || {}));
          h.snapMats = getMats(eid);
          h.snapSalon = e.salon || '';
          h.usuario = e.usuario || '';
          await apiFetch(`/api/est-hist/${eid}`, { method: 'PUT', body: JSON.stringify(h) });
        }
        DB.ests = DB.ests.filter(x => x.id !== eid);
        delete DB.notas[eid];
        renderEstTabla(ciclo);
      } catch (err) { sw('error', 'Error: ' + err.message); }
    });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR addSal() / delSal()
// ═══════════════════════════════════════════════════════════════════
async function addSal() {
  const n = gi('nsn').value.trim().toUpperCase();
  const c = gi('nsc').value;
  if (!n) { sw('error', 'Nombre obligatorio'); return; }
  if (DB.sals.find(s => s.nombre === n)) { sw('error', 'Ya existe'); return; }
  try {
    await apiFetch('/api/salones', { method: 'POST', body: JSON.stringify({ nombre: n, ciclo: c, mats: [] }) });
    DB.sals.push({ nombre: n, ciclo: c, mats: [] });
    gi('nsn').value = '';
    renderSals();
    sw('success', `Salón ${n} creado`, '', 2000);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

function delSal(n) {
  Swal.fire({ title: '¿Eliminar salón?', text: n, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/salones/${encodeURIComponent(n)}`, { method: 'DELETE' });
        DB.sals = DB.sals.filter(s => s.nombre !== n);
        DB.ests.forEach(e => { if (e.salon === n) e.salon = ''; });
        DB.profs.forEach(p => { if (p.salones) p.salones = p.salones.filter(s => s !== n); });
        renderSals();
      } catch (e) { sw('error', 'Error: ' + e.message); }
    });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveAst() — guarda asistencia en MongoDB
// ═══════════════════════════════════════════════════════════════════
async function saveAst(key) {
  try {
    const [salon, ...rest] = key.split('__');
    const fecha = rest.join('__');
    const registros = Object.entries(DB.asist[key] || {}).map(([estId, estado]) => ({ estId, estado }));
    await apiFetch('/api/asistencias', {
      method: 'PUT',
      body: JSON.stringify({ salon, fecha, registros })
    });
    sw('success', 'Asistencias guardadas', '', 1400);
  } catch (e) { sw('error', 'Error guardando asistencia: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR envExcusa()
// ═══════════════════════════════════════════════════════════════════
async function envExcusa() {
  if (!excusasOk()) { sw('error', 'Fuera del horario de excusas (18:00–07:00)'); return; }
  const d    = gi('exd')?.value;
  const dest = gi('exdst')?.value;
  const c    = gi('exc2')?.value;
  const desc = gi('exdesc')?.value.trim();
  if (!c) { sw('warning', 'Selecciona una causa'); return; }
  try {
    const exc = await apiFetch('/api/excusas', {
      method: 'POST',
      body: JSON.stringify({ estId: CU.id, enombre: CU.nombre, salon: CU.salon || '', fecha: d, dest, causa: c, desc, ts: new Date().toLocaleString('es-CO') })
    });
    DB.exc.push(exc);
    goto('eexc');
    sw('success', 'Excusa enviada', '', 1400);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR addVClase() / delVClase()
// ═══════════════════════════════════════════════════════════════════
async function addVClase() {
  const s = gi('vcs')?.value, f = gi('vcf')?.value,
        h = gi('vch')?.value, l = gi('vcl')?.value.trim(), d = gi('vcd')?.value.trim();
  if (!s || !f || !h || !l) { sw('warning', 'Completa los campos: salón, fecha, hora y enlace'); return; }
  try {
    const vc = await apiFetch('/api/vclases', {
      method: 'POST',
      body: JSON.stringify({ id: 'vc_' + Date.now(), salon: s, fecha: f, hora: h, link: l, desc: d, ts: new Date().toISOString() })
    });
    DB.vclases.push(vc);
    goto('pvir');
    sw('success', 'Clase programada', '', 1400);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

function delVClase(id) {
  Swal.fire({ title: '¿Eliminar clase?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/vclases/${id}`, { method: 'DELETE' });
        DB.vclases = DB.vclases.filter(c => c.id !== id);
        goto('pvir');
      } catch (e) { sw('error', 'Error: ' + e.message); }
    });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR subirTarea()
// ═══════════════════════════════════════════════════════════════════
async function subirTarea() {
  const m      = gi('utm')?.value;
  const p      = gi('utp')?.value;
  const d      = gi('utd')?.value.trim();
  const profId = gi('utprof')?.value;
  const f      = gi('utf')?.files[0];
  if (!m || !p) { sw('warning', 'Selecciona materia y periodo'); return; }
  if (!f) { sw('warning', 'Selecciona un archivo'); return; }
  if (f.size > 5 * 1024 * 1024) { sw('error', 'Archivo muy grande (máx 5 MB)'); return; }
  const prof = DB.profs.find(x => x.id === profId);
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const up = await apiFetch('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          id: 'up_' + Date.now(), nombre: f.name, materia: m, periodo: p,
          profId: profId || '', profNombre: prof ? prof.nombre : 'Sin asignar',
          desc: d, fecha: new Date().toLocaleDateString('es-CO'),
          size: f.size, type: f.type, dataUrl: ev.target.result
        })
      });
      if (!DB.ups[CU.id]) DB.ups[CU.id] = [];
      DB.ups[CU.id].push(up);
      goto('etare');
      sw('success', 'Archivo enviado al profesor', '', 1400);
    } catch (e) { sw('error', 'Error: ' + e.message); }
  };
  reader.onerror = () => sw('error', 'Error al leer el archivo');
  reader.readAsDataURL(f);
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR marcarTareaRevisada()
// ═══════════════════════════════════════════════════════════════════
async function marcarTareaRevisada(upId) {
  try {
    await apiFetch(`/api/uploads/${upId}/revisar`, { method: 'PUT', body: JSON.stringify({}) });
    // Actualizar local
    Object.values(DB.ups || {}).forEach(lista => {
      lista.forEach(u => { if (u.id === upId) { u.revisado = true; u.revisadoTs = new Date().toLocaleDateString('es-CO'); } });
    });
    goto('ptar');
    sw('success', 'Tarea marcada como revisada', '', 1200);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

async function eliminarTallerProf(upId) {
  let u = null;
  Object.values(DB.ups || {}).forEach(lista => { const found = lista.find(x => x.id === upId); if (found) u = found; });
  if (!u) { sw('error', 'Taller no encontrado'); return; }
  if (!u.revisado) {
    logAudit('Intento de eliminar taller sin revisar', `Profesor: ${CU.nombre} | Taller: ${u.nombre} | Estudiante: ${u.estNombre} | Materia: ${u.materia}`);
    sw('warning', 'No puedes eliminar este taller sin haberlo revisado primero.');
    return;
  }
  Swal.fire({ title: '¿Eliminar taller?', text: `"${u.nombre}"`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/uploads/${upId}`, { method: 'DELETE' });
        Object.keys(DB.ups || {}).forEach(eid => { DB.ups[eid] = DB.ups[eid].filter(x => x.id !== upId); });
        goto('ptar');
        sw('success', 'Taller eliminado', '', 1200);
      } catch (e) { sw('error', 'Error: ' + e.message); }
    });
}

async function eliminarTallerEst(upId) {
  const lista = DB.ups[CU.id] || [];
  const u = lista.find(x => x.id === upId);
  if (!u) { sw('error', 'Taller no encontrado'); return; }
  if (!u.revisado) { sw('warning', 'Solo puedes eliminar talleres ya revisados por el docente'); return; }
  Swal.fire({ title: '¿Eliminar taller?', text: `"${u.nombre}"`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/uploads/${upId}`, { method: 'DELETE' });
        DB.ups[CU.id] = lista.filter(x => x.id !== upId);
        goto('etare');
        sw('success', 'Taller eliminado del historial', '', 1200);
      } catch (e) { sw('error', 'Error: ' + e.message); }
    });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR subirRecPlan() — respuesta de recuperación
// ═══════════════════════════════════════════════════════════════════
async function subirRecPlan(planId, materia, profId) {
  const key  = planId.replace(/[^a-z0-9]/gi, '_');
  const desc = gi('rdesc_' + key)?.value.trim();
  const f    = gi('rf_' + key)?.files[0];
  if (!f) { sw('warning', 'Selecciona un archivo para enviar'); return; }
  if (f.size > 5 * 1024 * 1024) { sw('error', 'Archivo muy grande (máx 5 MB)'); return; }
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const rec = await apiFetch('/api/recuperaciones', {
        method: 'POST',
        body: JSON.stringify({
          id: 'rec_' + Date.now(), materia, profId, planId,
          nombre: f.name, type: f.type, dataUrl: ev.target.result,
          desc: desc || '', fecha: new Date().toLocaleDateString('es-CO'),
          revisado: false, ts: new Date().toISOString()
        })
      });
      if (!DB.recs) DB.recs = [];
      DB.recs.push(rec);
      goto('ereh');
      sw('success', 'Respuesta enviada al docente', '', 1500);
    } catch (e) { sw('error', 'Error: ' + e.message); }
  };
  reader.onerror = () => sw('error', 'Error al leer el archivo');
  reader.readAsDataURL(f);
}

async function marcarRecRevisado(id) {
  try {
    await apiFetch(`/api/recuperaciones/${id}/revisar`, { method: 'PUT', body: JSON.stringify({}) });
    const r = (DB.recs || []).find(x => x.id === id);
    if (r) { r.revisado = true; r.revisadoTs = new Date().toLocaleDateString('es-CO'); }
    goto('prec');
    sw('success', 'Marcado como revisado', '', 1200);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

async function eliminarRecEst(recId) {
  const r = (DB.recs || []).find(x => x.id === recId && x.estId === CU.id);
  if (!r) { sw('error', 'Recuperación no encontrada'); return; }
  if (!r.revisado) { sw('warning', 'Solo puedes eliminar recuperaciones ya revisadas por el docente'); return; }
  Swal.fire({ title: '¿Eliminar esta recuperación?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async res => {
      if (!res.isConfirmed) return;
      try {
        await apiFetch(`/api/recuperaciones/${recId}`, { method: 'DELETE' });
        DB.recs = DB.recs.filter(x => x.id !== recId);
        goto('ereh');
        sw('success', 'Eliminado del historial', '', 1200);
      } catch (e) { sw('error', 'Error: ' + e.message); }
    });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveExt() — activa/cierra periodo extraordinario
// ═══════════════════════════════════════════════════════════════════
async function saveExt() {
  const wasOn = DB.ext.on;
  DB.ext = { on: gi('exon').checked, s: gi('exs').value, e: gi('exe').value };
  try {
    await apiFetch('/api/config/ext', { method: 'PUT', body: JSON.stringify({ value: DB.ext }) });
    if (wasOn && !DB.ext.on) {
      await archivarYLimpiarRecuperacion();
    } else if (!wasOn && DB.ext.on) {
      sw('success', 'Periodo Extraordinario activado', 'Los estudiantes elegibles ya pueden acceder a Mi Recuperación.', 2000);
    } else {
      sw('success', 'Guardado', '', 1400);
    }
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

async function archivarYLimpiarRecuperacion() {
  const periodoLabel = `${DB.ext.s} → ${DB.ext.e}`;
  const archivedAt   = new Date().toLocaleDateString('es-CO');
  try {
    await Promise.all([
      apiFetch('/api/recuperaciones/archivar', { method: 'POST', body: JSON.stringify({ periodoLabel, archivedAt }) }),
      apiFetch('/api/planes/archivar', { method: 'POST', body: JSON.stringify({ periodoLabel, archivedAt }) }),
    ]);
    // Actualizar local
    (DB.recs || []).forEach(r => { r.archivado = true; r._periodo = periodoLabel; r._archivedAt = archivedAt; });
    DB.histRecs = [...(DB.histRecs || []), ...(DB.recs || [])];
    DB.recs = [];
    (DB.planes || []).forEach(p => { p.archivado = true; p._periodo = periodoLabel; p._archivedAt = archivedAt; });
    DB.histPlanes = [...(DB.histPlanes || []), ...(DB.planes || [])];
    DB.planes = [];
    sw('success', 'Periodo Extraordinario cerrado', `Historial archivado.`, 3000);
  } catch (e) { sw('error', 'Error archivando: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR clearAudit()
// ═══════════════════════════════════════════════════════════════════
function clearAudit() {
  Swal.fire({
    title: '¿Limpiar historial de auditoría?',
    text: `Se eliminarán permanentemente los ${(DB.audit || []).length} registros.`,
    icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#e53e3e', confirmButtonText: 'Sí, eliminar todo'
  }).then(async r => {
    if (!r.isConfirmed) return;
    try {
      await apiFetch('/api/auditoria', { method: 'DELETE' });
      DB.audit = [];
      goto('aaud');
      sw('success', 'Historial limpiado', '', 1400);
    } catch (e) { sw('error', 'Error: ' + e.message); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR unblk()
// ═══════════════════════════════════════════════════════════════════
async function unblk(u) {
  try {
    await apiFetch(`/api/bloqueos/${u}`, { method: 'PUT', body: JSON.stringify({ on: false }) });
    DB.blk[u] = { on: false };
    goto('ablk');
    sw('success', 'Desbloqueado', '', 1400);
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveDisc() — disciplina del estudiante
// ═══════════════════════════════════════════════════════════════════
async function saveDisc(eid, v) {
  if (!validateSession() || !['admin', 'profe'].includes(CU.role)) return;
  syncN(eid);
  DB.notas[eid].disciplina = v;
  try {
    await apiFetch(`/api/notas/${eid}/disciplina`, {
      method: 'PUT', body: JSON.stringify({ disciplina: v })
    });
  } catch (e) { console.warn('saveDisc error:', e); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveDR() / saveDRPer()
// ═══════════════════════════════════════════════════════════════════
async function saveDR() {
  DB.dr = { s: gi('drs').value, e: gi('dre').value };
  try {
    await apiFetch('/api/config/dr', { method: 'PUT', body: JSON.stringify({ value: DB.dr }) });
    const hoy = today();
    if (DB.dr.e && hoy > DB.dr.e && DB.ext.s && DB.ext.e && !DB.ext.on) {
      DB.ext.on = true;
      await apiFetch('/api/config/ext', { method: 'PUT', body: JSON.stringify({ value: DB.ext }) });
      sw('success', 'Guardado', 'Rango cerrado — Periodo Extraordinario activado.', 2500);
    } else {
      sw('success', 'Guardado', '', 1400);
    }
    bootApp();
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

async function saveDRPer(key, per) {
  if (!DB.drPer) DB.drPer = {};
  const s     = gi('dps_' + key)?.value || '';
  const e     = gi('dpe_' + key)?.value || '';
  const extPer = gi('dpex_' + key)?.value || '';
  DB.drPer[per] = { s, e, extPer };
  try {
    await apiFetch('/api/config/drPer', { method: 'PUT', body: JSON.stringify({ value: DB.drPer }) });
    sw('success', `Periodo "${per}" guardado`, '', 1400);
  } catch (e2) { sw('error', 'Error: ' + e2.message); }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR saveAno()
// ═══════════════════════════════════════════════════════════════════
async function saveAno() {
  const v = parseInt(gi('anoActualInp')?.value || '');
  if (isNaN(v) || v < 2000 || v > 2099) { sw('error', 'Año inválido', 'Ingresa un año entre 2000 y 2099'); return; }
  const nuevo  = String(v);
  const actual = DB.anoActual || String(new Date().getFullYear());
  if (nuevo === actual) { sw('info', 'Sin cambios', 'Ese ya es el año activo.', 1500); return; }

  Swal.fire({
    title: `🗓️ Cambiar a año ${nuevo}`, icon: 'question', width: 520,
    html: `<div style="text-align:left;font-family:var(--fn);font-size:13px">
      <div class="al alb" style="margin-bottom:12px">Se archivará el año <strong>${actual}</strong> y se activará <strong>${nuevo}</strong>.</div>
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer">
        <input type="radio" name="anoOpt" value="limpiar" checked>
        <span><strong>Iniciar en blanco</strong> — notas vacías para ${nuevo}</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
        <input type="radio" name="anoOpt" value="copiar">
        <span><strong>Copiar notas actuales</strong> — continúa con los mismos datos</span>
      </label>
    </div>`,
    showCancelButton: true, confirmButtonText: `Cambiar a ${nuevo}`, confirmButtonColor: 'var(--nv)'
  }).then(async r => {
    if (!r.isConfirmed) return;
    DB.anoActual = nuevo;
    try {
      await apiFetch('/api/config/anoActual', { method: 'PUT', body: JSON.stringify({ value: nuevo }) });
      // Recargar DB para el nuevo año
      await dbLoad();
      goto('afec');
      sw('success', `Año lectivo ${nuevo} activado`, `Los datos del ${actual} quedan en el historial.`, 2500);
    } catch (e) { sw('error', 'Error: ' + e.message); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR openAddPrf() — agregar profesor
// ═══════════════════════════════════════════════════════════════════
async function addPrf(data) {
  try {
    const newProf = await apiFetch('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({ ...data, role: 'profe', blocked: false, materias: [], materia: '', salonMaterias: {} })
    });
    DB.profs.push({ ...data, role: 'profe', blocked: false, materias: [], materia: '', salonMaterias: {} });
    return newProf;
  } catch (e) { throw e; }
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR editEst()
// ═══════════════════════════════════════════════════════════════════
function editEst(eid, ciclo) {
  const e = DB.ests.find(x => x.id === eid);
  const sOpts = DB.sals.map(s => `<option value="${s.nombre}" ${s.nombre === e.salon ? 'selected' : ''}>${s.nombre}</option>`).join('');
  Swal.fire({
    title: 'Editar Estudiante', width: 500,
    html: sF([
      { id: 'een', lb: 'Nombre', val: e.nombre },
      { id: 'eeti', lb: 'T.I.', val: e.ti || '' },
      { id: 'eeu', lb: 'Usuario', val: e.usuario },
      { id: 'eep', lb: 'Nueva Contraseña (dejar vacío para no cambiar)', val: '', tp: 'password' }
    ]) + `<div style="text-align:left;margin-bottom:10px">
      <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:4px">Salón</label>
      <select id="ees" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box">
        <option value="">Sin salón</option>${sOpts}</select></div>`,
    showCancelButton: true, confirmButtonText: 'Guardar',
    preConfirm: () => ({
      nombre: gi('een').value.trim(), ti: gi('eeti').value.trim(),
      usuario: gi('eeu').value.trim(), newPwd: gi('eep').value.trim(), salon: gi('ees').value
    })
  }).then(async r => {
    if (!r.isConfirmed) return;
    const d = r.value;
    const update = { nombre: d.nombre, ti: d.ti, usuario: d.usuario, salon: d.salon };
    if (d.newPwd) update.password = d.newPwd;
    try {
      await apiFetch(`/api/usuarios/${eid}`, { method: 'PUT', body: JSON.stringify(update) });
      e.nombre = d.nombre; e.ti = d.ti; e.usuario = d.usuario; e.salon = d.salon;
      renderEstTabla(ciclo);
    } catch (e2) { sw('error', 'Error: ' + e2.message); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// REEMPLAZAR editSalMats() — guardar materias personalizadas del salón
// ═══════════════════════════════════════════════════════════════════
async function _saveSalMats(sname, chosen) {
  const sal = DB.sals.find(s => s.nombre === sname);
  if (!sal) return;
  sal.mats = chosen;
  try {
    await apiFetch(`/api/salones/${encodeURIComponent(sname)}`, {
      method: 'PUT', body: JSON.stringify({ mats: chosen })
    });
  } catch (e) { console.warn('saveSalMats:', e); }
}

// ═══════════════════════════════════════════════════════════════════
// PLANES DE RECUPERACIÓN — enviar al backend
// ═══════════════════════════════════════════════════════════════════
async function _savePlan(planData) {
  const saved = await apiFetch('/api/planes', { method: 'POST', body: JSON.stringify(planData) });
  if (!DB.planes) DB.planes = [];
  DB.planes.push(saved || planData);
  return saved;
}

// ═══════════════════════════════════════════════════════════════════
// RESTAURAR ESTUDIANTE
// ═══════════════════════════════════════════════════════════════════
async function restaurarEst(eid) {
  const h = (DB.estHist || []).find(x => x.id === eid);
  if (!h) { sw('error', 'No se encontró el registro'); return; }

  Swal.fire({
    title: `♻️ Restaurar estudiante`, icon: 'question', width: 480,
    html: `<div style="text-align:left;font-family:var(--fn)">
      <div style="background:#eef2f7;padding:12px 16px;border-radius:8px;margin-bottom:14px">
        <div style="font-size:13px;line-height:1.9"><strong>Nombre:</strong> ${esc(h.nombre)}</div>
        <div style="font-size:13px;line-height:1.9"><strong>T.I.:</strong> ${esc(h.ti || '—')}</div>
        <div style="font-size:13px;line-height:1.9"><strong>Eliminado:</strong> ${h.eliminado || '—'}</div>
      </div>
      <div class="al alb" style="font-size:12px">✅ Se restaurarán todos sus datos académicos guardados.</div>
    </div>`,
    showCancelButton: true, confirmButtonText: 'Restaurar', confirmButtonColor: 'var(--nv)'
  }).then(async r => {
    if (!r.isConfirmed) return;
    let usuario = h.usuario || ('est_' + eid.slice(-4));
    const conflict = DB.ests.find(x => x.usuario === usuario);
    if (conflict) usuario = usuario + '_r' + Date.now().toString().slice(-4);

    try {
      const restored = await apiFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          id: h.id, nombre: h.nombre, ti: h.ti || '', usuario,
          password: h.password || 'changeme123', role: 'est',
          salon: h.snapSalon || h.salon || '', blocked: false, registrado: h.registrado || '—'
        })
      });
      DB.ests.push({ id: h.id, nombre: h.nombre, ti: h.ti || '', usuario, role: 'est', salon: h.snapSalon || h.salon || '', blocked: false });
      // Restaurar notas desde snapshot
      if (h.snapNotas) DB.notas[h.id] = JSON.parse(JSON.stringify(h.snapNotas));
      h.activo = true; h.usuario = usuario; h.restaurado = new Date().toLocaleDateString('es-CO');
      delete h.eliminado;
      await apiFetch(`/api/est-hist/${eid}`, { method: 'PUT', body: JSON.stringify(h) });
      Swal.fire({ icon: 'success', title: 'Estudiante restaurado', html: `<strong>${esc(h.nombre)}</strong> restaurado.<br>Usuario: <strong>${esc(usuario)}</strong>` })
        .then(() => goto('ahist'));
    } catch (e) { sw('error', 'Error: ' + e.message); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// VALIDAR SESIÓN contra el servidor (no solo local)
// ═══════════════════════════════════════════════════════════════════
function validateSession() {
  if (!CU) return false;
  if (!TokenStore.get()) { doLogout(); return false; }
  // La validación real ocurre en cada llamada a la API (el middleware JWT lo verifica)
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// INICIALIZACIÓN — reemplaza el IIFE al final del HTML original
// ═══════════════════════════════════════════════════════════════════
let _dbReady = false;
document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.querySelector('.bl');
  if (btn) { btn.textContent = 'Conectando…'; btn.disabled = true; }

  // Verificar si hay sesión activa (token guardado)
  const savedToken = TokenStore.get();
  if (savedToken) {
    try {
      const data = await apiFetch('/api/db');
      if (data) {
        DB = data;
        // Reconstruir CU desde el token
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        const usuario = DB.profs?.find(p => p.id === payload.id)
          || DB.ests?.find(e => e.id === payload.id)
          || (DB.admin?.id === payload.id ? DB.admin : null);
        if (usuario) {
          CU = usuario;
          gi('ls').classList.add('hidden');
          gi('app').classList.remove('hidden');
          resetSessionTimer();
          bootApp();
          _dbReady = true;
          return;
        }
      }
    } catch (e) {
      TokenStore.clear();
    }
  }

  _dbReady = true;
  if (btn) { btn.textContent = 'Ingresar →'; btn.disabled = false; }
});

console.log('✅ EduSistema Pro — API Layer cargado. Backend:', API_BASE);
