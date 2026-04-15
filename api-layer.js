// api-layer.js — Reemplaza localStorage por llamadas a MongoDB
// Incluir este script ANTES del cierre de </body> en el HTML
// ============================================================

const API_BASE = 'https://colegio2026.onrender.com';

// ─── Helpers de seguridad ────────────────────────────────────────
// gi() puede no estar disponible si app.js falla al cargar — definimos fallback
if (typeof gi === 'undefined') {
  window.gi = (id) => document.getElementById(id);
}

// ─── Token JWT ───────────────────────────────────────────────────
const TokenStore = {
  get:    ()    => sessionStorage.getItem('edu_jwt'),
  set:    (t)   => sessionStorage.setItem('edu_jwt', t),
  clear:  ()    => sessionStorage.removeItem('edu_jwt'),
};
// CRÍTICO: exponer globalmente — app.js usa window.TokenStore en validateSession y saApiFetch
window.TokenStore = TokenStore;

// ─── Fetch con auth ──────────────────────────────────────────────
async function apiFetch(path, opts = {}, _retries = 3) {
  const token = TokenStore.get();

  // Validar que hay token antes de llamadas protegidas
  if (!token && !path.includes('/auth/')) {
    console.warn('[apiFetch] Sin token para:', path);
    doLogout();
    return null;
  }

  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (networkErr) {
    // Render free tier: el servidor puede estar en cold start o reiniciando
    // Reintentar automáticamente hasta _retries veces con espera progresiva
    if (_retries > 0) {
      const wait = _retries === 3 ? 3000 : _retries === 2 ? 5000 : 8000;
      console.warn(`[apiFetch] Error de red en ${path} — reintentando en ${wait/1000}s... (${_retries} intentos restantes)`);
      await new Promise(r => setTimeout(r, wait));
      return apiFetch(path, opts, _retries - 1);
    }
    throw new Error('Error de red. El servidor no responde — puede estar iniciando, intenta en 30 segundos.');
  }

  // 502/503/504 = Render cold start / servidor reiniciando — reintentar con espera
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (_retries > 0) {
      const wait = _retries === 3 ? 4000 : _retries === 2 ? 7000 : 12000;
      console.warn(`[apiFetch] HTTP ${res.status} en ${path} — servidor iniciando, reintentando en ${wait/1000}s... (${_retries} restantes)`);
      // Mostrar banner de "servidor iniciando" si es el primer intento
      if (_retries === 3) _showServerStartingBanner(true);
      await new Promise(r => setTimeout(r, wait));
      const result = await apiFetch(path, opts, _retries - 1);
      if (result !== null) _showServerStartingBanner(false);
      return result;
    }
    _showServerStartingBanner(false);
    throw new Error(`El servidor está reiniciando (HTTP ${res.status}). Espera unos segundos y recarga la página.`);
  }

  // Si llegamos aquí con éxito, ocultar el banner si estaba visible
  _showServerStartingBanner(false);

  // Token expirado o inválido → logout automático
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.expired || data.code === 'TOKEN_EXPIRED') {
      TokenStore.clear();
      doLogout();
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'info', title: 'Sesión expirada', text: 'Vuelve a iniciar sesión.' });
      }
      return null;
    }
    if (data.code === 'TOKEN_INVALID' || data.code === 'EMPTY_TOKEN' || data.code === 'NO_TOKEN') {
      TokenStore.clear();
      doLogout();
      return null;
    }
    throw new Error(data.error || 'HTTP 401: No autorizado');
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Acceso denegado');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}


// ─── Banner de servidor iniciando (Render cold start) ────────────────────────
function _showServerStartingBanner(show) {
  let banner = document.getElementById('_serverBanner');
  if (show) {
    if (banner) return; // ya visible
    banner = document.createElement('div');
    banner.id = '_serverBanner';
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:99999;
      background:#744210;color:#fff;
      padding:10px 20px;font-size:13px;font-weight:700;
      display:flex;align-items:center;gap:12px;justify-content:center;
      box-shadow:0 2px 12px rgba(0,0,0,.3);
    `;
    banner.innerHTML = `
      <span style="font-size:18px">⏳</span>
      <span>El servidor está iniciando (Render free tier). Reintentando automáticamente...</span>
      <span id="_serverBannerDots">.</span>
    `;
    document.body.prepend(banner);
    // Animación de puntos
    let dots = 1;
    banner._interval = setInterval(() => {
      dots = (dots % 3) + 1;
      const el = document.getElementById('_serverBannerDots');
      if (el) el.textContent = '.'.repeat(dots);
    }, 500);
  } else {
    if (!banner) return;
    clearInterval(banner._interval);
    banner.remove();
  }
}

// ═══════════════════════════════════════════════════════════════════
// dbLoad() y dbSave()
// ═══════════════════════════════════════════════════════════════════
async function dbLoad() {
  try {
    const data = await apiFetch('/api/db');
    if (data) {
      DB = data;
      DB.mP         = DB.mP         || dfP();
      DB.mB         = DB.mB         || dfB();
      DB.pers       = DB.pers       || dfPer();
      DB.sals       = DB.sals       || [];
      DB.audit      = DB.audit      || [];
      DB.blk        = DB.blk        || {};
      DB.dr         = DB.dr         || { s: '', e: '' };
      DB.drPer      = DB.drPer      || {};
      DB.ext        = DB.ext        || { on: false, s: '', e: '' };
      DB.ups        = DB.ups        || {};
      DB.asist      = DB.asist      || {};
      DB.exc        = DB.exc        || [];
      DB.profs      = DB.profs      || [];
      DB.vclases    = DB.vclases    || [];
      DB.recs       = DB.recs       || [];
      DB.planes     = DB.planes     || [];
      DB.histRecs   = DB.histRecs   || [];
      DB.histPlanes = DB.histPlanes || [];
      DB.estHist    = DB.estHist    || [];
      DB.anoActual  = DB.anoActual  || String(new Date().getFullYear());
      DB.notaPct    = DB.notaPct    || { a: 60, c: 20, r: 20 };
      DB.notasPorAno = DB.notasPorAno || {};
      DB.areas      = DB.areas      || [];
      DB.materiasDocs = DB.materiasDocs || [];
      DB.salAreas   = DB.salAreas   || {};
      DB.comunicados = DB.comunicados || [];
      DB.sals.forEach(s => { if (!Array.isArray(s.mats)) s.mats = []; });
      if(typeof sortSals==='function') sortSals();
    }
  } catch (err) {
    console.error('Error cargando DB:', err);
    // Si es error de servidor (502/cold start), NO inicializar DB vacía —
    // mostramos mensaje y dejamos que el usuario recargue
    if (err.message && (err.message.includes('502') || err.message.includes('reiniciando') || err.message.includes('iniciando'))) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'warning',
          title: '⏳ Servidor iniciando',
          html: `<div style="font-size:14px;line-height:1.7">
            El servidor está despertando (Render free tier).<br>
            <strong>Esto tarda entre 30 y 60 segundos</strong> la primera vez del día.<br><br>
            <button onclick="location.reload()" style="padding:10px 24px;background:#2b6cb0;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
              🔄 Recargar e intentar de nuevo
            </button>
          </div>`,
          showConfirmButton: false,
          allowOutsideClick: false,
        });
      }
      return; // No inicializar DB vacía
    }
    dbInit();
  }
}

function dbSave() {
  _saveConfigBg();
}

async function _saveConfigBg() {
  try {
    const cfgKeys = ['mP', 'mB', 'pers', 'dr', 'drPer', 'ext', 'anoActual', 'notaPct', 'salAreas'];
    await Promise.all(cfgKeys.map(k =>
      apiFetch(`/api/config/${k}`, {
        method: 'PUT',
        body: JSON.stringify({ value: DB[k] })
      }).catch(e => console.warn(`Config ${k}:`, e))
    ));
  } catch (e) { console.warn('dbSave config error:', e); }
}

// ═══════════════════════════════════════════════════════════════════
// doLogin() — usa /api/auth/login
// ═══════════════════════════════════════════════════════════════════
async function doLogin() {
  const u   = gi('liu').value.trim();
  const p   = gi('lip').value.trim();
  const err = gi('lierr');

  function show(m) { err.textContent = m; err.style.display = 'block'; }
  if (!u || !p) { show('Ingresa usuario y contraseña.'); return; }

  try {
    let res;
    try {
      res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: u, password: p })
      });
    } catch (netErr) {
      show('⚠️ No se pudo conectar al servidor. Verifica tu conexión a internet.');
      return;
    }

    // 502/503 = servidor caído o iniciando en Render
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      show('⚠️ El servidor está iniciando (puede tardar ~30 segundos en Render). Intenta de nuevo en un momento.');
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) { show(data.error || 'Credenciales incorrectas.'); return; }

    TokenStore.set(data.token);
    CU = data.user;

    // Guard: si el servidor no devolvió user, reconstruir desde el token
    if (!CU || !CU.role) {
      try {
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        CU = {
          id:            payload.id,
          nombre:        payload.nombre || payload.usuario || 'Usuario',
          usuario:       payload.usuario || payload.id,
          role:          payload.role,
          colegioId:     payload.colegioId     || null,
          colegioNombre: payload.colegioNombre || '',
        };
      } catch (_) {
        show('Error al procesar la respuesta del servidor. Intenta de nuevo.');
        TokenStore.clear();
        return;
      }
    }

    if (CU.role === 'superadmin') {
      // Superadmin: inicializa DB mínimo, no necesita /api/db
      DB = {
        admin:      CU,
        profs:      [],
        ests:       [],
        sals:       [],
        mP:         [],
        mB:         [],
        pers:       [],
        notas:      {},
        dr:         { s: '', e: '' },
        drPer:      {},
        notaPct:    { a: 60, c: 20, r: 20 },
        ext:        { on: false, s: '', e: '' },
        ups:        {},
        asist:      {},
        exc:        [],
        vclases:    [],
        recs:       [],
        planes:     [],
        histRecs:   [],
        histPlanes: [],
        audit:      [],
        blk:        {},
      };
    } else {
      // Admin, profe, estudiante → cargar DB del colegio
      await dbLoad();
    }

    // ─── Post-login: mostrar app ──────────────────────────────────
    try {
      gi('ls').classList.add('hidden');
      gi('app').classList.remove('hidden');
      resetSessionTimer();
      bootApp();
    } catch (bootErr) {
      console.error('[doLogin] Error al iniciar la app después del login:', bootErr);
      // Login fue exitoso — mostrar app igual aunque bootApp falle parcialmente
      gi('ls').classList.add('hidden');
      gi('app').classList.remove('hidden');
    }

  } catch (e) {
    // Solo errores de red o del servidor llegan aquí
    if (e.name === 'AbortError') {
      show('⚠️ El servidor tardó demasiado. Intenta de nuevo en unos segundos.');
    } else {
      show('Error conectando al servidor. Verifica que el backend esté activo.');
    }
    console.error('[doLogin] Error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// doLogout()
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
// saveTri() — guarda nota en MongoDB
// ═══════════════════════════════════════════════════════════════════
async function saveTri(inp) {
  if (!validateSession() || !['admin', 'profe', 'superadmin'].includes(CU.role)) {
    sw('error', 'Sin autorización'); return;
  }
  const eid = inp.dataset.eid;
  const per = decodeURIComponent(inp.dataset.per);
  // mat = nombre original de la materia (puede tener puntos, ej: "Ed. Física")
  const mat = decodeURIComponent(inp.dataset.mat);
  const f   = inp.dataset.f;
  let v = parseFloat(inp.value);

  if (isNaN(v) || v < 0) {
    inp.value = (DB.notas[eid]?.[per]?.[mat]?.[f] || 0).toFixed(1);
    return;
  }
  if (v > 5) { v = 5; inp.value = '5.0'; }

  syncN(eid);
  // Inicializar si no existe aún (por si syncN no lo creó con este nombre)
  if (!DB.notas[eid][per][mat]) DB.notas[eid][per][mat] = { a: 0, c: 0, r: 0 };
  const oldDef = def(DB.notas[eid][per][mat]);
  DB.notas[eid][per][mat][f] = v;

  const nd = def(DB.notas[eid][per][mat]);
  const dc = gi(`dc_${eid}_${encodeURIComponent(mat)}_${encodeURIComponent(per)}`);
  if (dc) dc.innerHTML = `<span class="${scC(nd)}" style="font-size:11px">${nd.toFixed(2)}</span>`;
  const apr = gi('apr_' + eid);
  if (apr) { const px = pprom(eid, per); apr.innerHTML = `<span class="${scC(px)}">${px.toFixed(2)}</span>`; }

  try {
    // Enviar mat original en la URL — el backend sanitiza los puntos para MongoDB
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
// auditLog() / logAudit() / logAuditAnon()
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
// addEst() — crea estudiante en MongoDB
// ═══════════════════════════════════════════════════════════════════
async function addEst(ciclo) {
  const n  = gi('nen').value.trim();
  const ti = gi('neti').value.trim().replace(/[^0-9]/g,'');
  const s  = gi('nes').value;
  const u  = gi('neu').value.trim();
  const p  = gi('nep').value.trim();

  if (!n || !u || !p) { sw('error', 'Nombre, usuario y contraseña son obligatorios'); return; }
  if (uExists(u)) { sw('error', 'Ese usuario ya existe'); return; }

  const id = 'est_' + Date.now();
  const fecha = new Date().toLocaleDateString('es-CO');

  try {
    await apiFetch('/api/usuarios', {
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
// delEst() — elimina estudiante en MongoDB
// ═══════════════════════════════════════════════════════════════════
function delEst(eid, ciclo) {
  const e = DB.ests.find(x => x.id === eid);
  Swal.fire({ title: '¿Eliminar?', text: e.nombre, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(async r => {
      if (!r.isConfirmed) return;
      try {
        await apiFetch(`/api/usuarios/${eid}`, { method: 'DELETE' });
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
// addSal() / delSal()
// ═══════════════════════════════════════════════════════════════════
async function addSal() {
  const n = gi('nsn').value.trim().toUpperCase();
  const c = gi('nsc').value;
  if (!n) { sw('error', 'Nombre obligatorio'); return; }

  // Validación local previa: evita llamada al servidor si el salón ya existe en DB local
  if (DB.sals.some(s => s.nombre === n && (s.colegioId || '') === (CU.colegioId || ''))) {
    sw('error', `El salón "${n}" ya existe en este colegio.`);
    return;
  }

  // CORRECCIÓN: siempre enviar colegioId y colegioNombre en el body como respaldo al token.
  // Garantiza que el backend identifica el tenant aunque el token del admin
  // tenga colegioId vacío (bug en usuarios creados sin colegioId asignado).
  const j = (gi('nsj')?.value || '').trim();
  const payload = {
    nombre:        n,
    ciclo:         c,
    jornada:       j,
    mats:          [],
    colegioId:     CU.colegioId     || '',
    colegioNombre: CU.colegioNombre || '',
  };

  try {
    const s = await apiFetch('/api/salones', { method: 'POST', body: JSON.stringify(payload) });
    DB.sals.push({ nombre: n, ciclo: c, jornada: j, mats: [], colegioId: CU.colegioId || '', colegioNombre: CU.colegioNombre || '' });
    if(typeof sortSals==='function') sortSals();
    gi('nsn').value = '';
    renderSals();
    sw('success', `Salón ${n} creado`, '', 2000);
  } catch (e) { sw('error', e.message); }
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
// saveAst() — guarda asistencia
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
// envExcusa()
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
// marcarRespLeida() — estudiante marca la respuesta del prof como leída
// ═══════════════════════════════════════════════════════════════════
async function marcarRespLeida(excId) {
  try {
    const updated = await apiFetch(`/api/excusas/${excId}/leida`, { method: 'PUT', body: JSON.stringify({}) });
    const idx = (DB.exc || []).findIndex(x => x._id === excId || x.id === excId);
    if (idx >= 0) DB.exc[idx] = updated;
    // Aviso automático al marcar como leída
    // Obtener la excusa actualizada para mostrar detalles en el aviso
    const exc = (DB.exc || []).find(x => x._id === excId || x.id === excId) || updated;
    await Swal.fire({
      icon: 'warning',
      title: '📚 Recuerda entregar el trabajo',
      html: `<div style="font-size:13px;line-height:1.7;text-align:left">
        ${exc.respProf ? `<div style="background:#e6fffa;border-radius:8px;padding:10px;margin-bottom:10px;border:1px solid #9ae6b4">
          <strong>Indicaciones de tu profesor:</strong><br>${exc.respProf}
          ${exc.diasExtra > 0 ? `<br><br>⏰ <strong>Tienes ${exc.diasExtra} día(s) extra.</strong> Fecha límite: <strong>${exc.fechaLimite || '—'}</strong>` : ''}
        </div>` : ''}
        <div style="background:#fffbeb;border:2px solid #f6ad55;border-radius:8px;padding:12px;font-size:13px;font-weight:700;color:#c05621">
          ⚠️ Debes enviar el trabajo en el apartado<br>
          <span style="font-size:15px;color:#2b6cb0">📎 Talleres y Tareas</span><br>
          dentro del tiempo estipulado.<br>
          <span style="color:#c53030">Después de la fecha límite NO se calificará.</span>
        </div>
      </div>`,
      confirmButtonText: '📎 Ir a Talleres y Tareas',
      confirmButtonColor: '#2b6cb0',
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
    }).then(r => { if (r.isConfirmed) goto('etare'); });
    // Refrescar solo la bandeja (no toda la página)
    const bandeja = document.getElementById('excBandeja');
    if (bandeja && typeof renderBandejaEst === 'function') {
      bandeja.innerHTML = renderBandejaEst(CU.id);
    } else if (typeof pgEExc === 'function') {
      const el = document.getElementById('main') || document.getElementById('content');
      if (el) { const html = pgEExc(); if (html) el.innerHTML = html; }
    }
  } catch (e) { sw('error', 'Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// descargarTallerExcusa() — descarga un archivo adjunto de excusa
// ═══════════════════════════════════════════════════════════════════
function descargarTallerExcusa(excId, nombreEnc) {
  const nombre = decodeURIComponent(nombreEnc);
  const exc = (DB.exc || []).find(x => x._id === excId || x.id === excId);
  if (!exc) { sw('error', 'Excusa no encontrada'); return; }
  const taller = (exc.talleres || []).find(t => t.nombre === nombre);
  if (!taller || !taller.base64) { sw('error', 'Archivo no disponible'); return; }
  // Convertir base64 a blob y descargar
  try {
    const byteChars = atob(taller.base64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: taller.tipo || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = taller.nombre;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    // Aviso de envío
    setTimeout(() => {
      Swal.fire({
        icon: 'warning', title: '⚠️ Recuerda',
        html: `<div style="font-size:14px">Debes enviar el taller completado en el apartado<br><strong style="color:#2b6cb0">📎 Talleres y Tareas</strong></div>`,
        confirmButtonText: 'Ir a Talleres y Tareas', confirmButtonColor: '#2b6cb0',
        showCancelButton: true, cancelButtonText: 'Cerrar',
      }).then(r => { if (r.isConfirmed) goto('etare'); });
    }, 600);
  } catch (e) { sw('error', 'Error al descargar: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// addVClase() / delVClase()
// ═══════════════════════════════════════════════════════════════════
async function addVClase() {
  const s = gi('vcs')?.value, f = gi('vcf')?.value,
        h = gi('vch')?.value, l = gi('vcl')?.value.trim(), d = gi('vcd')?.value.trim();
  if (!s || !f || !h || !l) { sw('warning', 'Completa los campos: salón, fecha, hora y enlace'); return; }
  try {
    const vc = await apiFetch('/api/vclases', {
      method: 'POST',
      body: JSON.stringify({ id: 'vc_' + Date.now(), profId: CU.id, profNombre: CU.nombre, salon: s, fecha: f, hora: h, link: l, desc: d, ts: new Date().toISOString() })
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
// subirTarea()
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

  // Validar que el periodo esté abierto según las fechas configuradas
  const hoy = today();
  const rp = (DB.drPer || {})[p];
  const rg = DB.dr || { s: '', e: '' };
  // Usar rango del periodo si existe, si no el rango global
  const rs = rp?.s || rg.s;
  const re = rp?.e || rg.e;
  if (rs && hoy < rs) {
    sw('warning', `El periodo "${p}" aún no está abierto`, `Se abre el ${rs}`);
    return;
  }
  if (re && hoy > re) {
    sw('error', `El periodo "${p}" está cerrado`, `Cerró el ${re}. Contacta a tu docente.`);
    return;
  }
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

async function marcarTareaRevisada(upId) {
  try {
    await apiFetch(`/api/uploads/${upId}/revisar`, { method: 'PUT', body: JSON.stringify({}) });
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
    logAudit('Intento de eliminar taller sin revisar', `Profesor: ${CU.nombre} | Taller: ${u.nombre} | Est: ${u.estNombre} | Materia: ${u.materia}`);
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
// subirRecPlan() — respuesta de recuperación
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
// saveExt()
// ═══════════════════════════════════════════════════════════════════
async function saveExt() {
  const wasOn = DB.ext.on;
  const s     = gi('exs').value;
  const e     = gi('exe').value;
  const on    = gi('exon').checked;
  const ano   = DB.anoActual || String(new Date().getFullYear());

  // ── Validar que las fechas pertenezcan al año activo ──
  if (s && !s.startsWith(ano)) {
    sw('error', 'Fecha de inicio inválida', `El Periodo Extraordinario solo puede tener fechas del año ${ano}.`); return;
  }
  if (e && !e.startsWith(ano)) {
    sw('error', 'Fecha de fin inválida', `El Periodo Extraordinario solo puede tener fechas del año ${ano}.`); return;
  }
  // ── Validar que inicio sea estrictamente antes que fin ──
  if (s && e && s >= e) {
    sw('error', 'Rango inválido', 'La fecha de inicio del Periodo Extraordinario debe ser anterior a la fecha de fin.'); return;
  }
  // ── Si se activa, ambas fechas son obligatorias ──
  if (on && (!s || !e)) {
    sw('error', 'Fechas requeridas', 'Para activar el Periodo Extraordinario debes definir fecha de inicio y fin.'); return;
  }

  DB.ext = { on, s, e };
  try {
    await apiFetch('/api/config/ext', { method: 'PUT', body: JSON.stringify({ value: DB.ext }) });
    if (wasOn && !DB.ext.on) {
      await archivarYLimpiarRecuperacion();
    } else if (!wasOn && DB.ext.on) {
      sw('success', 'Periodo Extraordinario activado', 'Los estudiantes elegibles ya pueden acceder a Mi Recuperación.', 2000);
    } else {
      sw('success', 'Guardado', '', 1400);
    }
  } catch (e2) { sw('error', 'Error: ' + e2.message); }
}

async function archivarYLimpiarRecuperacion() {
  const periodoLabel = `${DB.ext.s} → ${DB.ext.e}`;
  const archivedAt   = new Date().toLocaleDateString('es-CO');
  try {
    await Promise.all([
      apiFetch('/api/recuperaciones/archivar', { method: 'POST', body: JSON.stringify({ periodoLabel, archivedAt }) }),
      apiFetch('/api/planes/archivar', { method: 'POST', body: JSON.stringify({ periodoLabel, archivedAt }) }),
    ]);
    (DB.recs || []).forEach(r => { r.archivado = true; r._periodo = periodoLabel; r._archivedAt = archivedAt; });
    DB.histRecs = [...(DB.histRecs || []), ...(DB.recs || [])];
    DB.recs = [];
    (DB.planes || []).forEach(p => { p.archivado = true; p._periodo = periodoLabel; p._archivedAt = archivedAt; });
    DB.histPlanes = [...(DB.histPlanes || []), ...(DB.planes || [])];
    DB.planes = [];
    sw('success', 'Periodo Extraordinario cerrado', 'Historial archivado.', 3000);
  } catch (e) { sw('error', 'Error archivando: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// clearAudit()
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
// unblk()
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
// saveDisc()
// ═══════════════════════════════════════════════════════════════════
async function saveDisc(eid, v, periodo) {
  if (!validateSession() || !['admin', 'profe'].includes(CU.role)) return;
  let val = parseFloat(v);
  if (isNaN(val) || val < 0) {
    sw('error', 'Disciplina inválida', 'Ingresa un número entre 0.0 y 5.0'); return;
  }
  if (val > 5) val = 5;
  syncN(eid);
  // periodo puede llegar encodeURIComponent — decodificar antes de indexar DB.notas
  const perDec = periodo ? decodeURIComponent(periodo) : '';
  if (perDec && DB.notas[eid]) {
    if (!DB.notas[eid][perDec]) DB.notas[eid][perDec] = {};
    DB.notas[eid][perDec].disciplina = val;
  }
  try {
    const res = await apiFetch(`/api/notas/${eid}/disciplina`, {
      method: 'PUT', body: JSON.stringify({ disciplina: val, periodo: perDec })
    });
    // Actualizar promedio global en memoria
    if (res && res.disciplinaGlobal != null) DB.notas[eid].disciplina = res.disciplinaGlobal;
    else DB.notas[eid].disciplina = val;
  } catch (e) { console.warn('saveDisc error:', e); }
}

// ═══════════════════════════════════════════════════════════════════
// saveConducta() — guarda la nota de conducta (0.0-5.0)
// ═══════════════════════════════════════════════════════════════════
async function saveConducta(eid, v, periodo) {
  if (!validateSession() || !['admin', 'profe'].includes(CU.role)) return;
  let val = parseFloat(v);
  if (isNaN(val) || val < 0) {
    sw('error', 'Conducta inválida', 'Ingresa un número entre 0.0 y 5.0'); return;
  }
  if (val > 5) val = 5;
  syncN(eid);
  // periodo puede llegar encodeURIComponent — decodificar antes de indexar DB.notas
  const perDec = periodo ? decodeURIComponent(periodo) : '';
  if (perDec && DB.notas[eid]) {
    if (!DB.notas[eid][perDec]) DB.notas[eid][perDec] = {};
    DB.notas[eid][perDec].conducta = val;
  }
  try {
    const res = await apiFetch(`/api/notas/${eid}/conducta`, {
      method: 'PUT', body: JSON.stringify({ conducta: val, periodo: perDec })
    });
    if (res && res.conductaGlobal != null) DB.notas[eid].conducta = res.conductaGlobal;
    else DB.notas[eid].conducta = val;
  } catch (e) { console.warn('saveConducta error:', e); }
}

// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// COMUNICADOS — gestión por el admin
// ═══════════════════════════════════════════════════════════════════
async function crearComunicado(datos) {
  if (!validateSession() || CU.role !== 'admin') return;
  try {
    const com = await apiFetch('/api/comunicados', {
      method: 'POST', body: JSON.stringify(datos)
    });
    if (!DB.comunicados) DB.comunicados = [];
    DB.comunicados.unshift(com);
    return com;
  } catch (e) { sw('error', 'Error al guardar comunicado: ' + e.message); }
}

async function editarComunicado(id, datos) {
  if (!validateSession() || CU.role !== 'admin') return;
  try {
    const com = await apiFetch(`/api/comunicados/${id}`, {
      method: 'PUT', body: JSON.stringify(datos)
    });
    if (DB.comunicados) {
      const idx = DB.comunicados.findIndex(c => c.id === id);
      if (idx !== -1) DB.comunicados[idx] = com;
    }
    return com;
  } catch (e) { sw('error', 'Error al editar comunicado: ' + e.message); }
}

async function eliminarComunicado(id) {
  if (!validateSession() || CU.role !== 'admin') return;
  try {
    await apiFetch(`/api/comunicados/${id}`, { method: 'DELETE' });
    if (DB.comunicados) DB.comunicados = DB.comunicados.filter(c => c.id !== id);
    sw('success', 'Comunicado eliminado');
  } catch (e) { sw('error', 'Error al eliminar: ' + e.message); }
}

// Cargar todos los comunicados del admin (incluyendo inactivos/vencidos)
async function cargarTodosComunicados() {
  try {
    const lista = await apiFetch('/api/comunicados');
    DB.comunicados = lista || [];
    return lista;
  } catch (e) { return []; }
}

// saveDR() / saveDRPer()
// ═══════════════════════════════════════════════════════════════════
async function saveDR() {
  const s = gi('drs').value;
  const e = gi('dre').value;
  const ano = DB.anoActual || String(new Date().getFullYear());
  // Validar que las fechas pertenezcan al año activo
  if (s && !s.startsWith(ano)) {
    sw('error', `Fecha de inicio inválida`, `Solo se permiten fechas del año ${ano}.`); return;
  }
  if (e && !e.startsWith(ano)) {
    sw('error', `Fecha de fin inválida`, `Solo se permiten fechas del año ${ano}.`); return;
  }
  // Validar que inicio sea antes que fin
  if (s && e && s >= e) {
    sw('error', 'Rango inválido', 'La fecha de inicio debe ser anterior a la fecha de fin.'); return;
  }
  DB.dr = { s, e };
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
  const s      = gi('dps_' + key)?.value || '';
  const e      = gi('dpe_' + key)?.value || '';
  const extPer = gi('dpex_' + key)?.value || '';
  const ano    = DB.anoActual || String(new Date().getFullYear());
  // Validar que las fechas pertenezcan al año activo
  if (s && !s.startsWith(ano)) {
    sw('error', `Fecha de inicio inválida`, `Solo se permiten fechas del año ${ano}.`); return;
  }
  if (e && !e.startsWith(ano)) {
    sw('error', `Fecha de fin inválida`, `Solo se permiten fechas del año ${ano}.`); return;
  }
  // Validar que inicio sea antes que fin
  if (s && e && s >= e) {
    sw('error', 'Rango inválido', `En "${per}" la fecha de inicio debe ser anterior a la fecha de fin.`); return;
  }
  DB.drPer[per] = { s, e, extPer };
  try {
    await apiFetch('/api/config/drPer', { method: 'PUT', body: JSON.stringify({ value: DB.drPer }) });
    sw('success', `Periodo "${per}" guardado`, '', 1400);
  } catch (e2) { sw('error', 'Error: ' + e2.message); }
}

// ═══════════════════════════════════════════════════════════════════
// saveAno()
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
    // ── Archivar notas del año ACTUAL en estHist antes de cambiar ──────────────
    try {
      const snapPromises = (DB.ests || []).map(est => {
        const snapNotas = JSON.parse(JSON.stringify(DB.notas[est.id] || {}));
        const histEntry = { ...((DB.estHist || []).find(h => h.id === est.id) || {}),
          id: est.id, nombre: est.nombre, ti: est.ti || '',
          salon: est.salon || '', activo: true,
          snapNotas, snapAno: actual,
          snapMats: getMats ? getMats(est.id) : [],
          snapSalon: est.salon || ''
        };
        return apiFetch(`/api/est-hist/${est.id}`, {
          method: 'PUT', body: JSON.stringify(histEntry)
        }).catch(e => console.warn(`[saveAno] snapshot error ${est.id}:`, e.message));
      });
      await Promise.all(snapPromises);
      console.log(`[saveAno] ✅ Notas del año ${actual} archivadas (${snapPromises.length} estudiantes)`);
    } catch (snapErr) {
      console.warn('[saveAno] Error archivando snapshots:', snapErr.message);
    }

    DB.anoActual = nuevo;
    // Limpiar notas locales para el nuevo año
    (DB.ests || []).forEach(est => { DB.notas[est.id] = {}; });

    try {
      await apiFetch('/api/config/anoActual', { method: 'PUT', body: JSON.stringify({ value: nuevo }) });
      await dbLoad();
      goto('afec');
      sw('success', `Año lectivo ${nuevo} activado`, `Las notas del ${actual} quedaron archivadas en el historial.`, 2500);
    } catch (e) { sw('error', 'Error: ' + e.message); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// addPrf() — agregar profesor
// ═══════════════════════════════════════════════════════════════════
async function addPrf(data) {
  try {
    if (!data.id) data.id = 'prf_' + Date.now();
    const newProf = await apiFetch('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify({ ...data, role: 'profe', blocked: false, materias: [], materia: '', salonMaterias: {} })
    });
    DB.profs.push({ ...data, role: 'profe', blocked: false, materias: [], materia: '', salonMaterias: {} });
    return newProf;
  } catch (e) { throw e; }
}

// ═══════════════════════════════════════════════════════════════════
// editEst()
// ═══════════════════════════════════════════════════════════════════
function editEst(eid, ciclo) {
  const e = DB.ests.find(x => x.id === eid);
  // Filtrar salones por ciclo Y colegioId — evita mostrar salones de otros colegios
  const cicloEst = ciclo || (e.salon ? cicloOf(e.salon) : '');
  const sOpts = DB.sals
    .filter(s => {
      const mismoColegio = !s.colegioId || !CU.colegioId || s.colegioId === CU.colegioId;
      const mismoCiclo   = !cicloEst || s.ciclo === cicloEst;
      return mismoColegio && mismoCiclo;
    })
    .map(s => `<option value="${s.nombre}" ${s.nombre === e.salon ? 'selected' : ''}>${s.nombre}</option>`).join('');
  Swal.fire({
    title: 'Editar Estudiante', width: 500,
    html: sF([
      { id: 'een', lb: 'Nombre', val: e.nombre },
      { id: 'eeti', lb: 'T.I.', val: e.ti || '', ph: 'Ej: 1234567890', attr: 'inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"' },
      { id: 'eeu', lb: 'Usuario', val: e.usuario },
      { id: 'eep', lb: 'Nueva Contraseña (dejar vacío para no cambiar)', val: '', tp: 'password' }
    ]) + `<div style="text-align:left;margin-bottom:10px">
      <label style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--sl);display:block;margin-bottom:4px">Salón</label>
      <select id="ees" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box">
        <option value="">Sin salón</option>${sOpts}</select></div>`,
    showCancelButton: true, confirmButtonText: 'Guardar',
    preConfirm: () => ({
      nombre: gi('een').value.trim(), ti: gi('eeti').value.trim().replace(/[^0-9]/g,''),
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
// _saveSalMats() / _savePlan()
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

async function _savePlan(planData) {
  const saved = await apiFetch('/api/planes', { method: 'POST', body: JSON.stringify(planData) });
  if (!DB.planes) DB.planes = [];
  DB.planes.push(saved || planData);
  return saved;
}

// ═══════════════════════════════════════════════════════════════════
// restaurarEst()
// ═══════════════════════════════════════════════════════════════════
async function restaurarEst(eid) {
  const h = (DB.estHist || []).find(x => x.id === eid);
  if (!h) { sw('error', 'No se encontró el registro'); return; }

  Swal.fire({
    title: '♻️ Restaurar estudiante', icon: 'question', width: 480,
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
      await apiFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          id: h.id, nombre: h.nombre, ti: h.ti || '', usuario,
          password: h.password || 'changeme123', role: 'est',
          salon: h.snapSalon || h.salon || '', blocked: false, registrado: h.registrado || '—'
        })
      });
      DB.ests.push({ id: h.id, nombre: h.nombre, ti: h.ti || '', usuario, role: 'est', salon: h.snapSalon || h.salon || '', blocked: false });
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
// validateSession()
// ═══════════════════════════════════════════════════════════════════
function validateSession() {
  if (!CU) return false;
  if (!TokenStore.get()) { doLogout(); return false; }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// INICIALIZACIÓN — restaurar sesión al recargar la página
// ═══════════════════════════════════════════════════════════════════
let _dbReady = false;

// ═══════════════════════════════════════════════════════════════════
// CARGA MASIVA CSV — Estudiantes y Profesores
// ═══════════════════════════════════════════════════════════════════

// ── Parser CSV robusto (maneja comillas, comas dentro de campos) ──
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    result.push(row);
  }
  return result;
}

// ── Leer archivo CSV con input file ──────────────────────────────
function leerArchivoCSV(onData) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onData(e.target.result, file.name);
    reader.readAsText(file, 'UTF-8');
  };
  input.click();
}

// ── Descargar plantilla CSV ───────────────────────────────────────
function descargarPlantillaCSV(tipo, ciclo) {
  let header, ejemplo1, ejemplo2;
  if (tipo === 'est') {
    header = 'nombre,ti,salon,usuario,password';
    ejemplo1 = 'Juan Pérez García,TI-1001234,6A,juan.perez,pass123';
    ejemplo2 = 'María Torres López,TI-1001235,6A,maria.torres,pass456';
  } else {
    if (ciclo === 'primaria') {
      header = 'nombre,ti,usuario,password,salones';
      ejemplo1 = 'Ana García,CC-50012345,ana.garcia,prof123,1A';
      ejemplo2 = 'Luis Rojas,CC-50067890,luis.rojas,prof456,"1A,2A"';
    } else {
      header = 'nombre,ti,usuario,password,salones';
      ejemplo1 = 'Carlos López,CC-71234567,carlos.lopez,prof789,6A';
      ejemplo2 = 'Rosa Méndez,CC-71890123,rosa.mendez,prof000,"6A,11A"';
    }
  }
  const csv = [header, ejemplo1, ejemplo2].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `plantilla_${tipo}_${ciclo || ''}.csv`;
  a.click();
}

// ═══════════════════════════════════════════════════════════════════
// abrirCSVEst() — carga masiva de estudiantes
// ═══════════════════════════════════════════════════════════════════
function abrirCSVEst(ciclo) {
  const salonesDisp = DB.sals.filter(s => s.ciclo === ciclo).map(s => s.nombre);

  Swal.fire({
    title: `📂 Carga Masiva — Estudiantes ${ciclo === 'primaria' ? 'Primaria' : 'Bachillerato'}`,
    width: 620,
    html: `
      <div style="text-align:left;font-family:var(--fn);font-size:13px">
        <div style="background:#ebf8ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;border-left:4px solid #3182ce">
          <strong style="color:#2b6cb0">Formato requerido del CSV:</strong>
          <code style="display:block;margin-top:6px;font-size:12px;color:#2d3748;background:#fff;padding:6px;border-radius:4px">
            nombre, ti, salon, usuario, password
          </code>
          <div style="margin-top:8px;font-size:12px;color:#4a5568">
            <strong>nombre</strong> — Nombre completo del estudiante *<br>
            <strong>ti</strong> — Tarjeta de identidad (ej: TI-1001234)<br>
            <strong>salon</strong> — Salón donde queda asignado (debe existir). Salones disponibles: <strong>${salonesDisp.join(', ') || 'Ninguno creado aún'}</strong><br>
            <strong>usuario</strong> — Nombre de usuario para login * (sin espacios)<br>
            <strong>password</strong> — Contraseña inicial *
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn bg sm" onclick="descargarPlantillaCSV('est','${ciclo}')">⬇️ Descargar plantilla</button>
        </div>
        <div style="border:2px dashed #cbd5e0;border-radius:8px;padding:16px;text-align:center;cursor:pointer;background:#f7fafc"
          id="csvDropZoneEst" onclick="document.getElementById('csvInputEst').click()">
          <div style="font-size:2rem">📄</div>
          <div style="color:#4a5568;font-size:13px">Haz clic para seleccionar el archivo CSV</div>
          <div style="color:#a0aec0;font-size:11px;margin-top:4px">Solo archivos .csv — codificación UTF-8</div>
          <input type="file" id="csvInputEst" accept=".csv" style="display:none"
            onchange="previsualizarCSVEst(this.files[0],'${ciclo}')">
        </div>
        <div id="csvPreviewEst" style="margin-top:12px"></div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '✅ Importar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: 'var(--nv)',
    preConfirm: () => {
      const data = window._csvDataEst;
      if (!data || !data.length) {
        Swal.showValidationMessage('Primero selecciona y previsualiza un archivo CSV válido');
        return false;
      }
      return data;
    }
  }).then(async r => {
    if (!r.isConfirmed) return;
    await importarEstudiantesCSV(r.value, ciclo);
    window._csvDataEst = null;
  });
}

function previsualizarCSVEst(file, ciclo) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (rows.length < 2) {
      gi('csvPreviewEst').innerHTML = '<div style="color:red;font-size:12px">⚠️ El archivo está vacío o solo tiene encabezado.</div>';
      return;
    }
    // Detectar si tiene encabezado
    const header = rows[0].map(h => h.toLowerCase());
    const tieneHeader = header.includes('nombre') || header.includes('usuario');
    const data = tieneHeader ? rows.slice(1) : rows;
    
    // Validar y mapear columnas
    const colIdx = tieneHeader ? {
      nombre: header.indexOf('nombre'),
      ti:     header.includes('ti') ? header.indexOf('ti') : -1,
      salon:  header.includes('salon') ? header.indexOf('salon') : header.includes('salón') ? header.indexOf('salón') : -1,
      usuario:header.indexOf('usuario'),
      password:header.includes('password') ? header.indexOf('password') : header.includes('contraseña') ? header.indexOf('contraseña') : -1,
    } : { nombre:0, ti:1, salon:2, usuario:3, password:4 };

    // Filtrar salones por ciclo Y colegioId — evita aceptar salones de otros colegios en la carga CSV
    const salonesDisp = new Set(
      DB.sals.filter(s => s.ciclo === ciclo && (!s.colegioId || !CU.colegioId || s.colegioId === CU.colegioId))
        .map(s => s.nombre)
    );
    const parsed = [];
    const errores = [];

    data.forEach((row, i) => {
      if (!row.filter(Boolean).length) return;
      const nombre   = (colIdx.nombre  >= 0 ? row[colIdx.nombre]   : '').trim();
      const ti       = (colIdx.ti      >= 0 ? row[colIdx.ti]       : '').trim();
      const salon    = (colIdx.salon   >= 0 ? row[colIdx.salon]    : '').trim();
      const usuario  = (colIdx.usuario >= 0 ? row[colIdx.usuario]  : '').trim();
      const password = (colIdx.password>= 0 ? row[colIdx.password] : '').trim();

      const fila = i + (tieneHeader ? 2 : 1);
      if (!nombre) { errores.push(`Fila ${fila}: falta nombre`); return; }
      if (!usuario) { errores.push(`Fila ${fila}: falta usuario`); return; }
      if (!password) { errores.push(`Fila ${fila}: falta contraseña`); return; }
      if (salon && !salonesDisp.has(salon)) { errores.push(`Fila ${fila}: salón "${salon}" no existe`); return; }
      if (uExists(usuario)) { errores.push(`Fila ${fila}: usuario "${usuario}" ya existe`); return; }
      parsed.push({ nombre, ti, salon, usuario, password });
    });

    window._csvDataEst = parsed;

    const preview = parsed.slice(0, 5).map(r =>
      `<tr><td>${r.nombre}</td><td style="font-family:monospace;font-size:11px">${r.ti||'—'}</td><td>${r.salon||'—'}</td><td style="font-family:monospace;font-size:11px">${r.usuario}</td></tr>`
    ).join('');

    gi('csvPreviewEst').innerHTML = `
      ${errores.length ? `<div style="background:#fff5f5;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#c53030">
        ⚠️ ${errores.length} fila(s) con errores (se omitirán):<br>${errores.slice(0,5).map(e=>`• ${e}`).join('<br>')}
        ${errores.length>5?`<br>... y ${errores.length-5} más`:''}
      </div>` : ''}
      <div style="background:#f0fff4;border-radius:6px;padding:8px 12px;font-size:12px;color:#276749;margin-bottom:8px">
        ✅ <strong>${parsed.length}</strong> estudiante(s) listos para importar
      </div>
      ${parsed.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:12px">
        <thead><tr><th>Nombre</th><th>T.I.</th><th>Salón</th><th>Usuario</th></tr></thead>
        <tbody>${preview}</tbody>
      </table>${parsed.length > 5 ? `<div style="font-size:11px;color:#718096;padding:4px 8px">... y ${parsed.length-5} más</div>` : ''}</div>` : ''}
    `;
  };
  reader.readAsText(file, 'UTF-8');
}

async function importarEstudiantesCSV(rows, ciclo) {
  let ok = 0, fail = 0;
  const fecha = new Date().toLocaleDateString('es-CO');

  // Mostrar progreso
  Swal.fire({
    title: 'Importando estudiantes…',
    html: `<div id="csvProgreso">0 / ${rows.length}</div>`,
    allowOutsideClick: false, showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = 'est_' + Date.now() + '_' + i;
    try {
      await apiFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({ id, nombre: r.nombre, ti: r.ti, usuario: r.usuario,
          password: r.password, role: 'est', salon: r.salon || '', blocked: false, registrado: fecha })
      });
      DB.ests.push({ id, nombre: r.nombre, ti: r.ti, usuario: r.usuario,
        role: 'est', salon: r.salon || '', blocked: false, registrado: fecha });
      DB.notas[id] = {};
      DB.pers.forEach(per => {
        DB.notas[id][per] = {};
        getMats(id).forEach(m => { DB.notas[id][per][m] = { a:0, c:0, r:0 }; });
      });
      DB.estHist = DB.estHist || [];
      DB.estHist.push({ id, nombre: r.nombre, ti: r.ti, salon: r.salon || '', registrado: fecha, activo: true });
      ok++;
      const el = gi('csvProgreso');
      if (el) el.textContent = `${ok + fail} / ${rows.length} — ${ok} exitosos`;
    } catch (err) {
      console.warn('CSV import error row', i, err.message);
      fail++;
    }
  }

  renderEstTabla(ciclo);
  Swal.fire({
    icon: fail === 0 ? 'success' : 'warning',
    title: 'Importación completada',
    html: `<div style="font-size:14px">
      ✅ <strong>${ok}</strong> estudiante(s) importados correctamente<br>
      ${fail ? `❌ <strong>${fail}</strong> fila(s) con error (revisa la consola)` : ''}
    </div>`,
    confirmButtonText: 'Aceptar'
  });
}

// ═══════════════════════════════════════════════════════════════════
// abrirCSVPrf() — carga masiva de profesores
// ═══════════════════════════════════════════════════════════════════
function abrirCSVPrf(ciclo) {
  const salonesDisp = DB.sals.filter(s => s.ciclo === ciclo).map(s => s.nombre);

  Swal.fire({
    title: `📂 Carga Masiva — Profesores ${ciclo === 'primaria' ? 'Primaria' : 'Bachillerato'}`,
    width: 640,
    html: `
      <div style="text-align:left;font-family:var(--fn);font-size:13px">
        <div style="background:#faf5ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;border-left:4px solid #805ad5">
          <strong style="color:#553c9a">Formato requerido del CSV:</strong>
          <code style="display:block;margin-top:6px;font-size:12px;color:#2d3748;background:#fff;padding:6px;border-radius:4px">
            nombre, ti, usuario, password, salones
          </code>
          <div style="margin-top:8px;font-size:12px;color:#4a5568">
            <strong>nombre</strong> — Nombre completo del profesor *<br>
            <strong>ti</strong> — Cédula/T.I. del profesor<br>
            <strong>usuario</strong> — Nombre de usuario para login * (sin espacios)<br>
            <strong>password</strong> — Contraseña inicial *<br>
            <strong>salones</strong> — Salón(es) asignados separados por punto y coma (ej: <code>6A;11A</code>)${ciclo==='primaria'?' — máx. 1':''}<br>
            <br>Salones disponibles: <strong>${salonesDisp.join(', ') || 'Ninguno creado aún'}</strong>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn bg sm" onclick="descargarPlantillaCSV('prf','${ciclo}')">⬇️ Descargar plantilla</button>
        </div>
        <div style="border:2px dashed #cbd5e0;border-radius:8px;padding:16px;text-align:center;cursor:pointer;background:#f7fafc"
          onclick="document.getElementById('csvInputPrf').click()">
          <div style="font-size:2rem">📄</div>
          <div style="color:#4a5568;font-size:13px">Haz clic para seleccionar el archivo CSV</div>
          <input type="file" id="csvInputPrf" accept=".csv" style="display:none"
            onchange="previsualizarCSVPrf(this.files[0],'${ciclo}')">
        </div>
        <div id="csvPreviewPrf" style="margin-top:12px"></div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '✅ Importar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#805ad5',
    preConfirm: () => {
      const data = window._csvDataPrf;
      if (!data || !data.length) {
        Swal.showValidationMessage('Primero selecciona y previsualiza un archivo CSV válido');
        return false;
      }
      return data;
    }
  }).then(async r => {
    if (!r.isConfirmed) return;
    await importarProfesoresCSV(r.value, ciclo);
    window._csvDataPrf = null;
  });
}

function previsualizarCSVPrf(file, ciclo) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (rows.length < 2) {
      gi('csvPreviewPrf').innerHTML = '<div style="color:red;font-size:12px">⚠️ Archivo vacío o solo encabezado.</div>';
      return;
    }
    const header = rows[0].map(h => h.toLowerCase().trim());
    const tieneHeader = header.includes('nombre') || header.includes('usuario');
    const data = tieneHeader ? rows.slice(1) : rows;

    const colIdx = tieneHeader ? {
      nombre:   header.indexOf('nombre'),
      ti:       header.includes('ti') ? header.indexOf('ti') : -1,
      usuario:  header.indexOf('usuario'),
      password: header.includes('password') ? header.indexOf('password') : header.includes('contraseña') ? header.indexOf('contraseña') : -1,
      salones:  header.includes('salones') ? header.indexOf('salones') : header.includes('salon') ? header.indexOf('salon') : -1,
    } : { nombre:0, ti:1, usuario:2, password:3, salones:4 };

    // Filtrar salones por ciclo Y colegioId — evita aceptar salones de otros colegios en carga CSV
    const salonesDisp = new Set(
      DB.sals.filter(s => s.ciclo === ciclo && (!s.colegioId || !CU.colegioId || s.colegioId === CU.colegioId))
        .map(s => s.nombre)
    );
    const MAX = ciclo === 'primaria' ? 1 : Infinity;
    const parsed = [];
    const errores = [];

    data.forEach((row, i) => {
      if (!row.filter(Boolean).length) return;
      const nombre   = (colIdx.nombre   >= 0 ? row[colIdx.nombre]   : '').trim();
      const ti       = (colIdx.ti       >= 0 ? row[colIdx.ti]       : '').trim();
      const usuario  = (colIdx.usuario  >= 0 ? row[colIdx.usuario]  : '').trim();
      const password = (colIdx.password >= 0 ? row[colIdx.password] : '').trim();
      const salonesRaw = (colIdx.salones >= 0 ? row[colIdx.salones] : '').trim();
      const salones = salonesRaw ? salonesRaw.split(/[;,|]/).map(s => s.trim()).filter(Boolean) : [];

      const fila = i + (tieneHeader ? 2 : 1);
      if (!nombre)   { errores.push(`Fila ${fila}: falta nombre`); return; }
      if (!usuario)  { errores.push(`Fila ${fila}: falta usuario`); return; }
      if (!password) { errores.push(`Fila ${fila}: falta contraseña`); return; }
      if (salones.length > MAX) { errores.push(`Fila ${fila}: primaria solo permite 1 salón (tiene ${salones.length})`); return; }
      const invalidos = salones.filter(s => !salonesDisp.has(s));
      if (invalidos.length) { errores.push(`Fila ${fila}: salón(es) no existen: ${invalidos.join(', ')}`); return; }
      if (uExists(usuario)) { errores.push(`Fila ${fila}: usuario "${usuario}" ya existe`); return; }
      parsed.push({ nombre, ti, usuario, password, salones });
    });

    window._csvDataPrf = parsed;

    const preview = parsed.slice(0, 5).map(r =>
      `<tr><td>${r.nombre}</td><td style="font-family:monospace;font-size:11px">${r.ti||'—'}</td><td style="font-family:monospace;font-size:11px">${r.usuario}</td><td>${r.salones.join(', ')||'—'}</td></tr>`
    ).join('');

    gi('csvPreviewPrf').innerHTML = `
      ${errores.length ? `<div style="background:#fff5f5;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#c53030">
        ⚠️ ${errores.length} fila(s) con errores:<br>${errores.slice(0,5).map(e=>`• ${e}`).join('<br>')}
        ${errores.length>5?`<br>... y ${errores.length-5} más`:''}
      </div>` : ''}
      <div style="background:#f0fff4;border-radius:6px;padding:8px 12px;font-size:12px;color:#276749;margin-bottom:8px">
        ✅ <strong>${parsed.length}</strong> profesor(es) listos para importar
      </div>
      ${parsed.length ? `<div style="overflow-x:auto"><table class="tbl" style="font-size:12px">
        <thead><tr><th>Nombre</th><th>T.I./CC</th><th>Usuario</th><th>Salones</th></tr></thead>
        <tbody>${preview}</tbody>
      </table>${parsed.length > 5 ? `<div style="font-size:11px;color:#718096;padding:4px 8px">... y ${parsed.length-5} más</div>` : ''}</div>` : ''}
    `;
  };
  reader.readAsText(file, 'UTF-8');
}

async function importarProfesoresCSV(rows, ciclo) {
  let ok = 0, fail = 0;

  Swal.fire({
    title: 'Importando profesores…',
    html: `<div id="csvProgresoPrf">0 / ${rows.length}</div>`,
    allowOutsideClick: false, showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = 'prf_' + Date.now() + '_' + i;
    try {
      await apiFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({ id, nombre: r.nombre, ti: r.ti, usuario: r.usuario,
          password: r.password, role: 'profe', ciclo, salones: r.salones,
          blocked: false, materias: [], materia: '', salonMaterias: {} })
      });
      DB.profs.push({ id, nombre: r.nombre, ti: r.ti, usuario: r.usuario,
        role: 'profe', ciclo, salones: r.salones,
        blocked: false, materias: [], materia: '', salonMaterias: {} });
      ok++;
      const el = gi('csvProgresoPrf');
      if (el) el.textContent = `${ok + fail} / ${rows.length} — ${ok} exitosos`;
    } catch (err) {
      console.warn('CSV prof import error row', i, err.message);
      fail++;
    }
  }

  renderPrfTbl();
  Swal.fire({
    icon: fail === 0 ? 'success' : 'warning',
    title: 'Importación completada',
    html: `<div style="font-size:14px">
      ✅ <strong>${ok}</strong> profesor(es) importados correctamente<br>
      ${fail ? `❌ <strong>${fail}</strong> fila(s) con error` : ''}
      ${ok > 0 && ciclo === 'bachillerato' ? '<br><br>💡 Recuerda asignar materias por salón a cada profesor.' : ''}
    </div>`,
    confirmButtonText: 'Aceptar'
  });
}


// ═══════════════════════════════════════════════════════════════════
// eliminarTodosEsts(ciclo) — elimina TODOS los estudiantes del ciclo
// ═══════════════════════════════════════════════════════════════════
async function eliminarTodosEsts(ciclo) {
  const lista = DB.ests.filter(e => cicloOf(e.salon) === ciclo);
  if (!lista.length) { sw('info', 'No hay estudiantes en este ciclo'); return; }
  const conf = await Swal.fire({
    title: `⚠️ ¿Eliminar TODOS los estudiantes de ${ciclo === 'primaria' ? 'Primaria' : 'Bachillerato'}?`,
    html: `<div style="font-size:14px">
      <p>Se eliminarán <strong>${lista.length} estudiante(s)</strong> permanentemente.</p>
      <p style="color:#c53030">Esta acción no se puede deshacer. Quedarán en el historial.</p>
    </div>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: `Sí, eliminar ${lista.length} estudiantes`,
    confirmButtonColor: '#e53e3e',
    cancelButtonText: 'Cancelar'
  });
  if (!conf.isConfirmed) return;

  Swal.fire({
    title: 'Eliminando estudiantes…',
    html: '<div id="delProg">0 / ' + lista.length + '</div>',
    allowOutsideClick: false, showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });

  let ok = 0, fail = 0;
  const fecha = new Date().toLocaleDateString('es-CO');
  for (let i = 0; i < lista.length; i++) {
    const est = lista[i];
    try {
      await apiFetch(`/api/usuarios/${est.id}`, { method: 'DELETE' });
      // Marcar en historial
      const h = (DB.estHist || []).find(x => x.id === est.id);
      if (h) {
        h.activo = false; h.eliminado = fecha;
        h.snapNotas = JSON.parse(JSON.stringify(DB.notas[est.id] || {}));
        h.snapMats  = getMats(est.id); h.snapSalon = est.salon || '';
        await apiFetch(`/api/est-hist/${est.id}`, { method: 'PUT', body: JSON.stringify(h) }).catch(() => {});
      }
      DB.ests = DB.ests.filter(x => x.id !== est.id);
      delete DB.notas[est.id];
      ok++;
    } catch (_) { fail++; }
    const el = gi('delProg');
    if (el) el.textContent = `${ok + fail} / ${lista.length}`;
  }

  renderEstTabla(ciclo);
  Swal.fire({
    icon: fail === 0 ? 'success' : 'warning',
    title: 'Eliminación completada',
    html: `✅ <strong>${ok}</strong> eliminados${fail ? `<br>❌ <strong>${fail}</strong> con error` : ''}`,
  });
}

// ═══════════════════════════════════════════════════════════════════
// promoverEstudiantes(ciclo) — promueve/repite año según resultados
// Regla: perdió ≥3 materias → repite | ganó → siguiente salón
//        11° → GRADUADO (se elimina con historial)
// ═══════════════════════════════════════════════════════════════════
async function promoverEstudiantes(ciclo) {
  const lista = DB.ests.filter(e => cicloOf(e.salon) === ciclo);
  if (!lista.length) { sw('info', 'No hay estudiantes en este ciclo'); return; }

  // Calcular resultado para cada estudiante
  // REGLAS:
  // ≥ 3 materias perdidas   → REPITE (queda en el mismo salón)
  // 1 - 2 materias perdidas → EN RECUPERACIÓN (bloqueado hasta que el docente revise la recuperación)
  // 0 materias perdidas     → PROMUEVE al siguiente salón
  // 11° sin materias perd.  → GRADUADO (pasa al historial)
  const resultados = lista.map(e => {
    const mats = getMats(e.id);
    // Detectar si el estudiante no tiene NINGUNA nota en todo el año
    const sinDatos = !mats.some(m =>
      DB.pers.some(p => { const t = DB.notas[e.id]?.[p]?.[m]; return t && (t.a > 0 || t.c > 0 || t.r > 0); })
    );
    const periodosCalificados = DB.pers.filter(p =>
      mats.some(m => { const t = DB.notas[e.id]?.[p]?.[m]; return t && (t.a > 0 || t.c > 0 || t.r > 0); })
    );
    const periodosFaltantes = sinDatos ? [] : DB.pers.filter(p => !periodosCalificados.includes(p));
    const faltanPeriodos = !sinDatos && periodosFaltantes.length > 0 && periodosCalificados.length > 0;

    // ── Evaluación por ÁREAS o MATERIAS según configuración ──────────────────
    const areaMap = typeof getAreaMatsMap === 'function' ? getAreaMatsMap(e.id) : {};
    const tieneAreas = Object.keys(areaMap).filter(k=>k!=='_sinArea').length > 0;
    let mp, numPerdidas;
    if(tieneAreas){
      const areasP = typeof areasPerdidasAnio === 'function' ? (areasPerdidasAnio(e.id)||[]) : [];
      mp = areasP.map(a=>a.areaNombre);
      numPerdidas = mp.length;
    } else {
      mp = matPerdAnio ? matPerdAnio(e.id) : matPerd(e.id);
      numPerdidas = mp.length;
    }

    const recsPendientes = (DB.recs || []).filter(r =>
      r.estId === e.id && !r.revisado && !r.archivado
    );
    const enRecuperacion = !sinDatos && !faltanPeriodos && numPerdidas >= 1 && numPerdidas <= 2;
    const recuperacionCompleta = enRecuperacion &&
      mp.every(nombre => (DB.recs || []).some(r => r.estId === e.id && r.materia === nombre && r.revisado));
    const pierde = !faltanPeriodos && numPerdidas >= 3;
    const sig = siguienteSalon ? siguienteSalon(e.salon) : null;
    return {
      est: e,
      pierde,
      sinDatos,
      faltanPeriodos,
      periodosFaltantes,
      enRecuperacion,
      recuperacionCompleta,
      recsPendientes: recsPendientes.length,
      matsPerdidas: mp,
      siguienteSalon: pierde ? e.salon : (sig || e.salon),
      graduado: !pierde && !sinDatos && !faltanPeriodos && !enRecuperacion && sig === 'GRADUADO'
    };
  });

  const promueven         = resultados.filter(r => !r.pierde && !r.graduado && !r.sinDatos && !r.enRecuperacion && !r.faltanPeriodos);
  const repiten           = resultados.filter(r => r.pierde);
  const graduados         = resultados.filter(r => r.graduado);
  const sinDatosList      = resultados.filter(r => r.sinDatos);
  const faltanPeriodosList= resultados.filter(r => r.faltanPeriodos);
  const enRecupList       = resultados.filter(r => r.enRecuperacion && !r.recuperacionCompleta);
  const recupOkList       = resultados.filter(r => r.enRecuperacion && r.recuperacionCompleta);

  // Bloquear si hay estudiantes con periodos sin calificar
  if (faltanPeriodosList.length > 0) {
    await Swal.fire({
      icon: 'warning',
      title: '⚠️ Periodos sin calificar',
      width: 520,
      html: `<div style="text-align:left;font-size:13px;font-family:var(--fn)">
        <div class="al aly" style="margin-bottom:12px">
          <strong>${faltanPeriodosList.length} estudiante(s)</strong> tienen periodos sin calificar.
          No pueden ser promovidos hasta que todos los periodos tengan notas ingresadas.
        </div>
        <div style="background:#fef9c3;border-radius:8px;padding:10px;font-size:12px">
          <strong style="color:#92400e">📋 Estudiantes con periodos faltantes:</strong><br><br>
          ${faltanPeriodosList.map(r=>
            `<div style="margin-bottom:6px;padding:6px 10px;background:#fff;border-radius:6px;border-left:3px solid #f59e0b">
              <strong>${r.est.salon}</strong> — Faltan: <span style="color:#92400e;font-weight:600">${r.periodosFaltantes.join(', ')}</span>
            </div>`
          ).join('')}
        </div>
        <div style="font-size:12px;color:#718096;margin-top:10px">
          💡 Ve a <strong>Gestión de Notas</strong> e ingresa las notas de los periodos faltantes.
        </div>
      </div>`,
      confirmButtonText: 'Entendido',
      confirmButtonColor: 'var(--nv)'
    });
    return;
  }

  // Bloquear si hay estudiantes en recuperación pendiente
  if (enRecupList.length > 0) {
    await Swal.fire({
      icon: 'warning',
      title: '🔒 Promoción bloqueada',
      width: 560,
      html: `<div style="text-align:left;font-size:13px;font-family:var(--fn)">
        <div class="al aly" style="margin-bottom:12px">
          Los siguientes estudiantes tienen <strong>1 o 2 materias perdidas</strong> y su recuperación
          aún <strong>no ha sido revisada</strong> por el docente. Deben completar el proceso
          antes de poder promover el año.
        </div>
        ${enRecupList.map(r=>`<div style="background:#fff5f5;border-radius:7px;padding:8px 12px;margin-bottom:6px;border-left:3px solid #fc8181">
          <strong>${r.est.nombre}</strong> (${r.est.salon})<br>
          <span style="font-size:12px;color:#c53030">Materias: ${r.matsPerdidas.join(', ')}</span><br>
          <span style="font-size:11px;color:#718096">Recuperaciones enviadas sin revisar: ${r.recsPendientes}</span>
        </div>`).join('')}
        <div style="font-size:12px;color:#718096;margin-top:8px">
          💡 Ve a <strong>Recuperaciones</strong> y marca las respuestas como revisadas para desbloquear.
        </div>
      </div>`,
      confirmButtonText: 'Entendido',
      confirmButtonColor: 'var(--nv)'
    });
    return;
  }

  // Calcular desglose por salón para las estadísticas
  const salonesSet = [...new Set(lista.map(r => r.salon))].sort();
  const porSalon = salonesSet.map(sal => {
    const ests = lista.filter(e => e.salon === sal);
    const rSal = resultados.filter(r => r.est.salon === sal);
    return {
      salon: sal,
      total: ests.length,
      promueven: rSal.filter(r => !r.pierde && !r.graduado && !r.sinDatos && !r.enRecuperacion && !r.faltanPeriodos).length,
      repiten: rSal.filter(r => r.pierde).length,
      graduados: rSal.filter(r => r.graduado).length,
      recupOk: rSal.filter(r => r.enRecuperacion && r.recuperacionCompleta).length,
      sinDatos: rSal.filter(r => r.sinDatos).length,
    };
  });

  // Construir detalle por estudiante usando veredictoAnual()
  const detalleEstudiantes = resultados.map(r => {
    const verd = typeof veredictoAnual === 'function' ? veredictoAnual(r.est.id) : null;
    return { ...r, verd };
  });

  // Agrupar detalle por salón para mostrar expandible
  const salonesDetalle = [...new Set(resultados.map(r => r.est.salon))].sort();
  const htmlDetalleSalones = salonesDetalle.map(sal => {
    const ests = detalleEstudiantes.filter(r => r.est.salon === sal);
    const filas = ests.map(r => {
      const v = r.verd;
      // Ícono y color según resultado
      let ic, col, bg, etiq;
      if (r.sinDatos)                          { ic='⚠️'; col='#92400e'; bg='#fef9c3'; etiq='Sin notas'; }
      else if (r.graduado)                     { ic='🎓'; col='#2b6cb0'; bg='#ebf8ff'; etiq='Graduado'; }
      else if (r.pierde)                       { ic='❌'; col='#742a2a'; bg='#fff5f5'; etiq='Repite año'; }
      else if (r.enRecuperacion && !r.recuperacionCompleta) { ic='🔒'; col='#92400e'; bg='#fffbeb'; etiq='Recuperación pend.'; }
      else if (r.enRecuperacion && r.recuperacionCompleta)  { ic='✅'; col='#553c9a'; bg='#faf5ff'; etiq='Recup. aprobada'; }
      else                                     { ic='⬆️'; col='#276749'; bg='#f0fff4'; etiq='Promueve'; }

      // Definitivas por área o materia (si hay veredicto)
      let matsHTML;
      if(v && v.tieneAreas && v.resAreas && v.resAreas.length){
        matsHTML = v.resAreas.map(a =>
          `<span style="display:inline-block;margin:1px 3px;padding:1px 6px;border-radius:10px;font-size:10px;background:${a.gana?'#c6f6d5':'#fed7d7'};color:${a.gana?'#276749':'#c53030'};font-weight:600">${a.areaNombre} ${a.prom.toFixed(1)}</span>`
        ).join('');
      } else if(v && v.resMateria && v.resMateria.length){
        matsHTML = v.resMateria.map(m =>
          `<span style="display:inline-block;margin:1px 3px;padding:1px 6px;border-radius:10px;font-size:10px;background:${m.gana?'#c6f6d5':'#fed7d7'};color:${m.gana?'#276749':'#c53030'};font-weight:600">${m.mat} ${m.prom.toFixed(1)}</span>`
        ).join('');
      } else {
        matsHTML = '<span style="font-size:10px;color:#a0aec0;font-style:italic">Sin datos</span>';
      }

      return `<tr style="background:${bg};border-bottom:1px solid #edf2f7">
        <td style="padding:5px 8px;font-size:12px;font-weight:700">${ic} ${r.est.nombre}</td>
        <td style="padding:5px 8px;font-size:11px;font-weight:700;color:${col};white-space:nowrap">${etiq}</td>
        <td style="padding:5px 8px;font-size:11px">${matsHTML}</td>
        <td style="padding:5px 8px;font-size:11px;color:#4a5568;white-space:nowrap">${r.est.salon} → ${r.siguienteSalon !== r.est.salon ? `<strong>${r.siguienteSalon}</strong>` : '<em>mismo</em>'}</td>
      </tr>`;
    }).join('');

    return `<details style="margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
      <summary style="cursor:pointer;padding:8px 12px;background:#f7fafc;font-size:12px;font-weight:700;color:#2d3748;list-style:none;display:flex;justify-content:space-between;align-items:center">
        <span>🏫 Salón <strong>${sal}</strong> — ${ests.length} estudiante${ests.length>1?'s':''}</span>
        <span style="font-size:10px;color:#718096">▼ ver detalle</span>
      </summary>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#edf2f7">
            <th style="padding:4px 8px;text-align:left;color:#4a5568">Estudiante</th>
            <th style="padding:4px 8px;text-align:left;color:#4a5568">Resultado</th>
            <th style="padding:4px 8px;text-align:left;color:#4a5568">Definitivas por materia</th>
            <th style="padding:4px 8px;text-align:left;color:#4a5568">Cambio de salón</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </details>`;
  }).join('');

  const conf = await Swal.fire({
    title: '🎓 Promover año — Resumen',
    width: 740,
    html: `<div style="text-align:left;font-size:13px;font-family:var(--fn)">
      <!-- Tarjetas de resumen global -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px">
        <div style="background:#f0fff4;border-radius:10px;padding:12px 8px;text-align:center">
          <div style="font-size:1.6rem">⬆️</div>
          <div style="font-size:1.5rem;font-weight:800;color:#276749">${promueven.length + recupOkList.length}</div>
          <div style="font-size:10px;color:#4a5568;font-weight:600">Promueven</div>
        </div>
        <div style="background:#fff5f5;border-radius:10px;padding:12px 8px;text-align:center">
          <div style="font-size:1.6rem">🔁</div>
          <div style="font-size:1.5rem;font-weight:800;color:#c53030">${repiten.length}</div>
          <div style="font-size:10px;color:#4a5568;font-weight:600">Repiten año</div>
        </div>
        <div style="background:#ebf8ff;border-radius:10px;padding:12px 8px;text-align:center">
          <div style="font-size:1.6rem">🎓</div>
          <div style="font-size:1.5rem;font-weight:800;color:#2b6cb0">${graduados.length}</div>
          <div style="font-size:10px;color:#4a5568;font-weight:600">Graduados</div>
        </div>
        <div style="background:#fef9c3;border-radius:10px;padding:12px 8px;text-align:center">
          <div style="font-size:1.6rem">⚠️</div>
          <div style="font-size:1.5rem;font-weight:800;color:#92400e">${sinDatosList.length}</div>
          <div style="font-size:10px;color:#4a5568;font-weight:600">Sin notas</div>
        </div>
        <div style="background:#f7fafc;border-radius:10px;padding:12px 8px;text-align:center">
          <div style="font-size:1.6rem">👥</div>
          <div style="font-size:1.5rem;font-weight:800;color:#4a5568">${lista.length}</div>
          <div style="font-size:10px;color:#4a5568;font-weight:600">Total</div>
        </div>
      </div>

      <!-- Tabla por salón (resumen) -->
      <div style="background:#f7fafc;border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#4a5568;margin-bottom:8px;letter-spacing:.05em">📊 Resumen por salón</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0">
              <th style="text-align:left;padding:5px 8px;color:#718096">Salón</th>
              <th style="text-align:center;padding:5px;color:#276749">⬆️ Prom.</th>
              <th style="text-align:center;padding:5px;color:#c53030">🔁 Repite</th>
              <th style="text-align:center;padding:5px;color:#2b6cb0">🎓 Grad.</th>
              <th style="text-align:center;padding:5px;color:#553c9a">✅ Recup.</th>
              <th style="text-align:center;padding:5px;color:#718096">Total</th>
            </tr>
          </thead>
          <tbody>
            ${porSalon.map(s=>`<tr style="border-bottom:1px solid #edf2f7">
              <td style="padding:6px 8px;font-weight:700">${s.salon}</td>
              <td style="text-align:center;padding:5px;color:#276749;font-weight:600">${s.promueven||'—'}</td>
              <td style="text-align:center;padding:5px;color:#c53030;font-weight:600">${s.repiten||'—'}</td>
              <td style="text-align:center;padding:5px;color:#2b6cb0;font-weight:600">${s.graduados||'—'}</td>
              <td style="text-align:center;padding:5px;color:#553c9a;font-weight:600">${s.recupOk||'—'}</td>
              <td style="text-align:center;padding:5px;color:#718096">${s.total}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Detalle por estudiante expandible por salón -->
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#4a5568;margin-bottom:8px;letter-spacing:.05em">📋 Detalle por estudiante <span style="font-weight:400;font-style:italic;text-transform:none">(haz clic en cada salón para ver)</span></div>
        ${htmlDetalleSalones}
      </div>

      ${sinDatosList.length ? `<div style="background:#fef9c3;border-radius:8px;padding:10px;font-size:12px;color:#92400e;margin-bottom:8px">
        ⚠️ <strong>${sinDatosList.length} estudiante(s) sin notas no serán movidos.</strong>
        Ingresa sus notas antes de promover el año.
      </div>` : ''}

      <div style="padding:10px;background:#ebf8ff;border-radius:8px;font-size:12px;color:#2c5282">
        ℹ️ Al confirmar se aplicarán los cambios de salón. Esta acción no se puede deshacer fácilmente.
        <br><span style="font-size:10px;color:#4a5568;margin-top:4px;display:block">Regla: 0 materias perdidas → promueve &nbsp;·&nbsp; 1–2 → recuperación &nbsp;·&nbsp; 3+ → repite el año</span>
      </div>
    </div>`,
    showCancelButton: true,
    confirmButtonText: '✅ Aplicar cambios',
    confirmButtonColor: 'var(--nv)',
    cancelButtonText: 'Cancelar'
  });
  if (!conf.isConfirmed) return;

  Swal.fire({
    title: 'Aplicando cambios…', allowOutsideClick: false,
    showConfirmButton: false, didOpen: () => Swal.showLoading()
  });

  const fecha = new Date().toLocaleDateString('es-CO');
  let ok = 0, fail = 0;

  for (const r of resultados) {
    try {
      if (r.sinDatos) {
        console.warn(`[promover] ${r.est.nombre} (${r.est.salon}): sin datos — omitido`);
        ok++;
        continue;
      }
      // En recuperación completa → promover igual que un estudiante normal
      if (r.enRecuperacion && r.recuperacionCompleta) {
        if (r.est.salon !== r.siguienteSalon) {
          await apiFetch(`/api/usuarios/${r.est.id}`, { method: 'PUT', body: JSON.stringify({ salon: r.siguienteSalon }) });
          r.est.salon = r.siguienteSalon;
          const h = (DB.estHist || []).find(x => x.id === r.est.id);
          if (h) { h.salon = r.siguienteSalon; await apiFetch(`/api/est-hist/${r.est.id}`, { method: 'PUT', body: JSON.stringify(h) }).catch(() => {}); }
        }
        ok++;
        continue;
      }
      if (r.graduado) {
        // Graduados: eliminar del sistema y pasar a historial
        await apiFetch(`/api/usuarios/${r.est.id}`, { method: 'DELETE' });
        const h = (DB.estHist || []).find(x => x.id === r.est.id);
        if (h) {
          h.activo = false; h.eliminado = fecha;
          h.snapNotas = JSON.parse(JSON.stringify(DB.notas[r.est.id] || {}));
          h.snapMats  = getMats(r.est.id); h.snapSalon = r.est.salon || '';
          h.graduado  = true;
          await apiFetch(`/api/est-hist/${r.est.id}`, { method: 'PUT', body: JSON.stringify(h) }).catch(() => {});
        }
        DB.ests = DB.ests.filter(x => x.id !== r.est.id);
        delete DB.notas[r.est.id];
      } else if (!r.pierde && r.est.salon !== r.siguienteSalon) {
        // Promovido: cambiar de salón
        const update = { salon: r.siguienteSalon };
        await apiFetch(`/api/usuarios/${r.est.id}`, { method: 'PUT', body: JSON.stringify(update) });
        r.est.salon = r.siguienteSalon;
        // Actualizar historial
        const h = (DB.estHist || []).find(x => x.id === r.est.id);
        if (h) { h.salon = r.siguienteSalon; await apiFetch(`/api/est-hist/${r.est.id}`, { method: 'PUT', body: JSON.stringify(h) }).catch(() => {}); }
      }
      // Repiten: no se mueven, no hace falta hacer nada
      ok++;
    } catch (_) { fail++; }
  }

  renderEstTabla(ciclo);
  Swal.fire({
    icon: fail === 0 ? 'success' : 'warning',
    title: 'Año promovido',
    html: `<div style="font-size:14px">
      ✅ Promovidos: <strong>${promueven.length}</strong><br>
      🔁 Repiten: <strong>${repiten.length}</strong><br>
      🎓 Graduados: <strong>${graduados.length}</strong>
      ${fail ? `<br>❌ Errores: <strong>${fail}</strong>` : ''}
    </div>`
  });
}

// Exponer dbLoad para uso en app.js
if (typeof dbLoad === 'function') window.dbLoad = dbLoad;

document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.querySelector('.bl');
  if (btn) { btn.textContent = 'Conectando…'; btn.disabled = true; }

  const savedToken = TokenStore.get();
  if (savedToken) {
    try {
      const payload = JSON.parse(atob(savedToken.split('.')[1]));

      // Verificar que el token no esté expirado antes de restaurar sesión
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.warn('[sesión] Token expirado, limpiando...');
        TokenStore.clear();
        if (btn) { btn.textContent = 'Ingresar →'; btn.disabled = false; }
        return;
      }

      if (payload.role === 'superadmin') {
        // Superadmin: verificar token contra el servidor antes de restaurar
        try {
          const verifyRes = await fetch(API_BASE + '/api/auth/verify', {
            headers: { 'Authorization': 'Bearer ' + savedToken }
          });
          if (!verifyRes.ok) {
            console.warn('[sesión] Token inválido en servidor, limpiando...');
            TokenStore.clear();
            if (btn) { btn.textContent = 'Ingresar →'; btn.disabled = false; }
            return;
          }
          const verifyData = await verifyRes.json().catch(() => ({}));
          // Usar datos frescos del servidor si están disponibles
          const freshUser = verifyData.user || {};
          CU = {
            id:            freshUser.id            || payload.id,
            nombre:        freshUser.nombre        || payload.nombre || 'Super Administrador',
            usuario:       freshUser.usuario       || payload.usuario || payload.id,
            role:          'superadmin',
            colegioId:     null,
            colegioNombre: '',
          };
        } catch (_) {
          // Si el servidor no responde, usar datos del token como fallback
          CU = {
            id:            payload.id,
            nombre:        payload.nombre || payload.usuario || 'Super Administrador',
            usuario:       payload.usuario || payload.id,
            role:          'superadmin',
            colegioId:     null,
            colegioNombre: '',
          };
        }
        DB = {
          admin: CU, profs: [], ests: [], sals: [], mP: [], mB: [], pers: [],
          notas: {}, dr: { s:'', e:'' }, drPer: {}, ext: { on:false, s:'', e:'' },
          ups: {}, asist: {}, exc: [], vclases: [], recs: [], planes: [],
          histRecs: [], histPlanes: [], audit: [], blk: {},
        };
        gi('ls').classList.add('hidden');
        gi('app').classList.remove('hidden');
        resetSessionTimer();
        bootApp();
      } else {
        // Roles normales: cargar DB del colegio
        const data = await apiFetch('/api/db');
        if (data) {
          DB = data;
          DB.mP         = DB.mP         || dfP();
          DB.mB         = DB.mB         || dfB();
          DB.pers       = DB.pers       || dfPer();
          DB.sals       = DB.sals       || [];
          DB.audit      = DB.audit      || [];
          DB.blk        = DB.blk        || {};
          DB.dr         = DB.dr         || { s: '', e: '' };
          DB.drPer      = DB.drPer      || {};
          DB.ext        = DB.ext        || { on: false, s: '', e: '' };
          DB.ups        = DB.ups        || {};
          DB.asist      = DB.asist      || {};
          DB.exc        = DB.exc        || [];
          DB.profs      = DB.profs      || [];
          DB.vclases    = DB.vclases    || [];
          DB.recs       = DB.recs       || [];
          DB.planes     = DB.planes     || [];
          DB.histRecs   = DB.histRecs   || [];
          DB.histPlanes = DB.histPlanes || [];
          DB.estHist    = DB.estHist    || [];
          DB.anoActual   = DB.anoActual   || String(new Date().getFullYear());
          DB.notasPorAno = DB.notasPorAno || {};
          DB.colegioLogo = DB.colegioLogo || '';  // logo del colegio para PDFs
          DB.sals.forEach(s => { if (!Array.isArray(s.mats)) s.mats = []; });
          if(typeof sortSals==='function') sortSals();

          // Reconstruir CU desde DB
          const usuario = DB.profs?.find(p => p.id === payload.id)
            || DB.ests?.find(e => e.id === payload.id)
            || (DB.admin?.id === payload.id ? DB.admin : null);

          if (usuario) {
            CU = { ...usuario, colegioId: usuario.colegioId || payload.colegioId || '' };
            gi('ls').classList.add('hidden');
            gi('app').classList.remove('hidden');
            resetSessionTimer();
            bootApp();
          } else {
            TokenStore.clear();
          }
        }
      }
    } catch (e) {
      console.warn('Restaurar sesión falló:', e);
      TokenStore.clear();
    }
  }

  _dbReady = true;
  if (btn) { btn.textContent = 'Ingresar →'; btn.disabled = false; }
});

// ─── Keep-alive: evita que Render free tier hiberne el servidor ────────────────
// Envía un ping cada 10 minutos para mantener el servidor activo
(function keepAlive() {
  const INTERVALO = 10 * 60 * 1000; // 10 minutos
  setInterval(async () => {
    try {
      await fetch(API_BASE + '/health');
      console.debug('[keepAlive] servidor activo');
    } catch (_) {
      console.debug('[keepAlive] ping falló — servidor en cold start');
    }
  }, INTERVALO);
})();

console.log('✅ EduSistema Pro — API Layer cargado. Backend:', API_BASE);
// force redeploy 04/10/2026