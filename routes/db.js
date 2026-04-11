// routes/db.js — GET/PUT del objeto DB completo, filtrado por colegioId del usuario
'use strict';
const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  Usuario, Salon, Config, Materia, Nota, Asistencia, Excusa,
  VClase, Upload, Plan, Recuperacion, Auditoria, EstHist, Bloqueo
} = require('../models');

// ─── GET /api/db ─────────────────────────────────────────────────────────────
// Devuelve el objeto DB del tenant del usuario autenticado.
// superadmin con ?colegioId=xxx → devuelve DB de ese colegio
// admin/profe/est → devuelve siempre su propio colegio
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Determinar colegioId del tenant
    let cid;
    if (req.user.role === 'superadmin') {
      cid = req.query.colegioId || null; // null = sin filtro (no se usa para /api/db del superadmin)
    } else {
      cid = req.user.colegioId || null;
    }

    // Superadmin no usa /api/db — tiene sus propias rutas /api/superadmin/*
    // Pero si algún admin quiere verlo, bloqueamos aquí
    if (!cid) {
      return res.json({
        admin: null, profs: [], ests: [], sals: [],
        mP: [], mB: [], pers: [], notas: {}, notasPorAno: {},
        asist: {}, ups: {}, exc: [], vclases: [], recs: [], planes: [],
        histRecs: [], histPlanes: [], audit: [], blk: {}, estHist: [],
        colegioId: '', colegioNombre: ''
      });
    }

    const cf = { colegioId: cid };

    // ── Cargar todo en paralelo con filtro de tenant ──────────────────────────
    const [
      usuarios, salones, configs, materiasDocs, notas, asistencias,
      excusas, vclases, uploads, planes, recuperaciones,
      auditoria, estHist, bloqueos
    ] = await Promise.all([
      Usuario.find({ ...cf, role: { $in: ['admin','profe','est'] } }, '-__v').lean(),
      Salon.find(cf).lean(),
      Config.find(cf).lean(),
      Materia.find(cf).sort({ ciclo: 1, orden: 1, nombre: 1 }).lean(),
      Nota.find(cf).lean(),
      Asistencia.find(cf).lean(),
      Excusa.find(cf).lean(),
      VClase.find(cf).lean(),
      // Uploads: excluir dataUrl del listado masivo para no saturar memoria
      Upload.find(cf, '-dataUrl').lean(),
      Plan.find(cf).lean(),
      Recuperacion.find(cf, '-dataUrl').lean(), // dataUrl se carga lazy via /recuperaciones/:id/data
      Auditoria.find(cf).sort({ createdAt: -1 }).limit(500).lean(),
      EstHist.find(cf).lean(),
      Bloqueo.find(cf).lean(),
    ]);

    // ── Config map ──────────────────────────────────────────────────────────
    const cfg = {};
    configs.forEach(c => { cfg[c.key] = c.value; });

    // ── Separar usuarios por rol ────────────────────────────────────────────
    const admin = usuarios.find(u => u.role === 'admin') || null;
    const profs = usuarios.filter(u => u.role === 'profe');
    const ests  = usuarios.filter(u => u.role === 'est');

    // ── Reconstruir notas { estId: { periodo: { materia:{a,c,r} } } } ────────
    // FIX Bug2: solo incluir notas del año lectivo ACTIVO en DB.notas
    const anoActualStr = cfg.anoActual || String(new Date().getFullYear());
    const notasObj = {};
    notas.filter(n => String(n.anoLectivo) === anoActualStr).forEach(n => {
      if (!notasObj[n.estId]) notasObj[n.estId] = {};
      n.periodos.forEach(p => {
        const mats = {};
        (p.materias instanceof Map
          ? [...p.materias.entries()]
          : Object.entries(p.materias || {})
        ).forEach(([m, v]) => { mats[m] = v; });
        notasObj[n.estId][p.periodo] = mats;
        if (p.disciplina) notasObj[n.estId].disciplina = p.disciplina;
      });
    });

    // ── notasPorAno ──────────────────────────────────────────────────────────
    const notasPorAno = {};
    notas.forEach(n => {
      const yr = n.anoLectivo;
      if (!notasPorAno[yr]) notasPorAno[yr] = {};
      const estNotas = {};
      n.periodos.forEach(p => {
        const mats = {};
        (p.materias instanceof Map
          ? [...p.materias.entries()]
          : Object.entries(p.materias || {})
        ).forEach(([m, v]) => { mats[m] = v; });
        estNotas[p.periodo] = mats;
        if (p.disciplina) estNotas.disciplina = p.disciplina;
      });
      notasPorAno[yr][n.estId] = estNotas;
    });

    // ── Asistencia { 'salon__fecha': { estId: estado } } ─────────────────────
    const asistObj = {};
    asistencias.forEach(a => {
      const key = `${a.salon}__${a.fecha}`;
      asistObj[key] = {};
      (a.registros || []).forEach(r => { asistObj[key][r.estId] = r.estado; });
    });

    // ── Uploads { estId: [...] } ─────────────────────────────────────────────
    const upsObj = {};
    uploads.forEach(u => {
      if (!upsObj[u.estId]) upsObj[u.estId] = [];
      upsObj[u.estId].push(u);
    });

    // ── Bloqueos { usuario: {on, ts} } ──────────────────────────────────────
    const blkObj = {};
    bloqueos.forEach(b => { blkObj[b.usuario] = { on: b.on, ts: b.ts }; });

    const cleanUser = u => {
      const o = { ...u };
      delete o._id; delete o.__v; delete o.password;
      delete o.createdAt; delete o.updatedAt;
      return o;
    };

    res.json({
      admin:        admin ? cleanUser(admin) : null,
      profs:        profs.map(cleanUser),
      ests:         ests.map(cleanUser),
      sals:         salones.map(s => ({ nombre: s.nombre, ciclo: s.ciclo, mats: s.mats || [], colegioId: s.colegioId })),
      mP:           materiasDocs.filter(m => m.ciclo === 'primaria').map(m => m.nombre).length
                      ? materiasDocs.filter(m => m.ciclo === 'primaria').map(m => m.nombre)
                      : (cfg.mP || ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética']),
      mB:           materiasDocs.filter(m => m.ciclo === 'bachillerato').map(m => m.nombre).length
                      ? materiasDocs.filter(m => m.ciclo === 'bachillerato').map(m => m.nombre)
                      : (cfg.mB || ['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte']),
      pers:         cfg.pers  || ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'],
      dr:           cfg.dr    || { s: '', e: '' },
      drPer:        cfg.drPer || {},
      ext:          cfg.ext   || { on: false, s: '', e: '' },
      anoActual:    cfg.anoActual || String(new Date().getFullYear()),
      notas:        notasObj,
      notasPorAno,
      asist:        asistObj,
      ups:          upsObj,
      exc:          excusas,
      vclases,
      recs:         recuperaciones.filter(r => !r.archivado),
      planes:       planes.filter(p => !p.archivado),
      histRecs:     recuperaciones.filter(r => r.archivado),
      histPlanes:   planes.filter(p => p.archivado),
      audit:        auditoria,
      blk:          blkObj,
      estHist,
      // Info del tenant — útil para el header del frontend
      colegioId:    cid,
      colegioNombre: req.user.colegioNombre || '',
      colegioLogo:  await (async () => {
        try {
          const { Colegio } = require('../models');
          const col = await Colegio.findOne({ id: cid }).select('logo').lean();
          return col?.logo || '';
        } catch (_) { return ''; }
      })(),
    });
  } catch (err) {
    console.error('GET /db error:', err);
    res.status(500).json({ error: 'Error al cargar la base de datos' });
  }
});

// ─── PUT /api/db — Solo admin puede hacer esto (migración/emergencia) ─────────
router.put('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cid = req.user.colegioId || '';
    await saveFullDB(req.body, cid);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /db error:', err);
    res.status(500).json({ error: 'Error al guardar la base de datos' });
  }
});

// ─── Helper: guarda DB completa para un tenant ────────────────────────────────
async function saveFullDB(DB, colegioId = '') {
  const bcrypt = require('bcryptjs');

  const cfgItems = [
    { key: 'mP',       value: DB.mP       },
    { key: 'mB',       value: DB.mB       },
    { key: 'pers',     value: DB.pers     },
    { key: 'dr',       value: DB.dr       },
    { key: 'drPer',    value: DB.drPer    },
    { key: 'ext',      value: DB.ext      },
    { key: 'anoActual',value: DB.anoActual},
  ];
  for (const c of cfgItems) {
    await Config.findOneAndUpdate(
      { key: c.key, colegioId },
      { value: c.value, colegioId },
      { upsert: true }
    );
  }

  for (const s of (DB.sals || [])) {
    await Salon.findOneAndUpdate(
      { nombre: s.nombre, colegioId },
      { ciclo: s.ciclo, mats: s.mats || [], colegioId },
      { upsert: true }
    );
  }

  const allUsers = [
    ...(DB.admin ? [DB.admin] : []),
    ...(DB.profs || []),
    ...(DB.ests  || []),
  ];
  for (const u of allUsers) {
    const update = { ...u, colegioId: u.colegioId || colegioId };
    if (!update.password) update.password = await bcrypt.hash('changeme123', 10);
    await Usuario.findOneAndUpdate({ id: u.id }, update, { upsert: true });
  }

  const anoActual = DB.anoActual || String(new Date().getFullYear());
  for (const [estId, perData] of Object.entries(DB.notas || {})) {
    const periodos   = [];
    const disciplina = perData.disciplina || '';
    for (const [periodo, mats] of Object.entries(perData)) {
      if (periodo === 'disciplina') continue;
      const materiasMap = {};
      for (const [m, v] of Object.entries(mats || {})) {
        materiasMap[m] = { a: v.a || 0, c: v.c || 0, r: v.r || 0 };
      }
      periodos.push({ periodo, materias: materiasMap, disciplina });
    }
    await Nota.findOneAndUpdate(
      { estId, anoLectivo: anoActual, colegioId },
      { periodos, disciplina, colegioId },
      { upsert: true }
    );
  }

  for (const [key, registros] of Object.entries(DB.asist || {})) {
    const [salon, ...rest] = key.split('__');
    const fecha = rest.join('__');
    const registrosArr = Object.entries(registros).map(([estId, estado]) => ({ estId, estado }));
    await Asistencia.findOneAndUpdate(
      { salon, fecha, colegioId },
      { registros: registrosArr, colegioId },
      { upsert: true }
    );
  }

  for (const [usuario, val] of Object.entries(DB.blk || {})) {
    await Bloqueo.findOneAndUpdate(
      { usuario },
      { on: val.on, ts: val.ts || '', colegioId },
      { upsert: true }
    );
  }
}

module.exports = router;
module.exports.saveFullDB = saveFullDB;