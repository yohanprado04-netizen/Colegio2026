// routes/db.js — Devuelve y guarda el estado completo de la BD
// Compatible con el patrón dbLoad() / dbSave() del frontend original
const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  Usuario, Salon, Config, Nota, Asistencia, Excusa,
  VClase, Upload, Plan, Recuperacion, Auditoria, EstHist, Bloqueo
} = require('../models');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/db — Devuelve el objeto DB completo (igual que localStorage)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    // ── Cargar todo en paralelo ──
    const [
      usuarios, salones, configs, notas, asistencias,
      excusas, vclases, uploads, planes, recuperaciones,
      auditoria, estHist, bloqueos
    ] = await Promise.all([
      Usuario.find({}, '-__v').lean(),
      Salon.find({}).lean(),
      Config.find({}).lean(),
      Nota.find({}).lean(),
      Asistencia.find({}).lean(),
      Excusa.find({}).lean(),
      VClase.find({}).lean(),
      Upload.find({}).lean(),
      Plan.find({}).lean(),
      Recuperacion.find({}).lean(),
      Auditoria.find({}).sort({ createdAt: -1 }).limit(500).lean(),
      EstHist.find({}).lean(),
      Bloqueo.find({}).lean(),
    ]);

    // ── Config values ──
    const cfg = {};
    configs.forEach(c => { cfg[c.key] = c.value; });

    // ── Separar usuarios por rol ──
    const admin = usuarios.find(u => u.role === 'admin') || null;
    const profs = usuarios.filter(u => u.role === 'profe');
    const ests  = usuarios.filter(u => u.role === 'est');

    // ── Reconstruir notas en formato { estId: { periodo: { materia: {a,c,r} } } } ──
    const notasObj = {};
    notas.forEach(n => {
      if (!notasObj[n.estId]) notasObj[n.estId] = {};
      n.periodos.forEach(p => {
        const mats = {};
        (p.materias instanceof Map ? [...p.materias.entries()] : Object.entries(p.materias || {}))
          .forEach(([m, v]) => { mats[m] = v; });
        notasObj[n.estId][p.periodo] = mats;
        if (p.disciplina) notasObj[n.estId].disciplina = p.disciplina;
      });
    });

    // ── notasPorAno: agrupar por anoLectivo ──
    const notasPorAno = {};
    notas.forEach(n => {
      const yr = n.anoLectivo;
      if (!notasPorAno[yr]) notasPorAno[yr] = {};
      const estNotas = {};
      n.periodos.forEach(p => {
        const mats = {};
        (p.materias instanceof Map ? [...p.materias.entries()] : Object.entries(p.materias || {}))
          .forEach(([m, v]) => { mats[m] = v; });
        estNotas[p.periodo] = mats;
        if (p.disciplina) estNotas.disciplina = p.disciplina;
      });
      notasPorAno[yr][n.estId] = estNotas;
    });

    // ── Reconstruir asistencia { 'salon__fecha': { estId: estado } } ──
    const asistObj = {};
    asistencias.forEach(a => {
      const key = `${a.salon}__${a.fecha}`;
      asistObj[key] = {};
      (a.registros || []).forEach(r => { asistObj[key][r.estId] = r.estado; });
    });

    // ── Reconstruir ups { estId: [uploads] } ──
    const upsObj = {};
    uploads.forEach(u => {
      if (!upsObj[u.estId]) upsObj[u.estId] = [];
      upsObj[u.estId].push(u);
    });

    // ── Bloqueos { usuario: {on, ts} } ──
    const blkObj = {};
    bloqueos.forEach(b => { blkObj[b.usuario] = { on: b.on, ts: b.ts }; });

    // ── Limpiar campos internos de MongoDB de los usuarios ──
    const cleanUser = u => {
      const o = { ...u };
      delete o._id; delete o.__v; delete o.password;
      delete o.createdAt; delete o.updatedAt;
      return o;
    };

    const DB = {
      admin:       admin ? cleanUser(admin) : null,
      profs:       profs.map(cleanUser),
      ests:        ests.map(cleanUser),
      sals:        salones.map(s => ({ nombre: s.nombre, ciclo: s.ciclo, mats: s.mats || [] })),
      mP:          cfg.mP  || ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'],
      mB:          cfg.mB  || ['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte'],
      pers:        cfg.pers || ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'],
      dr:          cfg.dr   || { s: '', e: '' },
      drPer:       cfg.drPer || {},
      ext:         cfg.ext   || { on: false, s: '', e: '' },
      anoActual:   cfg.anoActual || String(new Date().getFullYear()),
      notas:       notasObj,
      notasPorAno,
      asist:       asistObj,
      ups:         upsObj,
      exc:         excusas,
      vclases,
      recs:        recuperaciones.filter(r => !r.archivado),
      planes:      planes.filter(p => !p.archivado),
      histRecs:    recuperaciones.filter(r => r.archivado),
      histPlanes:  planes.filter(p => p.archivado),
      audit:       auditoria,
      blk:         blkObj,
      estHist,
    };

    res.json(DB);
  } catch (err) {
    console.error('GET /db error:', err);
    res.status(500).json({ error: 'Error al cargar la base de datos' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/db — Guarda el objeto DB completo (equivale a dbSave())
// Solo admin puede hacer esto (operación de emergencia / migración)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const DB = req.body;
    await saveFullDB(DB);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /db error:', err);
    res.status(500).json({ error: 'Error al guardar la base de datos' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: guarda el objeto DB completo en MongoDB
// ─────────────────────────────────────────────────────────────────────────────
async function saveFullDB(DB) {
  const bcrypt = require('bcryptjs');

  // ── Config ──
  const cfgItems = [
    { key: 'mP', value: DB.mP },
    { key: 'mB', value: DB.mB },
    { key: 'pers', value: DB.pers },
    { key: 'dr', value: DB.dr },
    { key: 'drPer', value: DB.drPer },
    { key: 'ext', value: DB.ext },
    { key: 'anoActual', value: DB.anoActual },
  ];
  for (const c of cfgItems) {
    await Config.findOneAndUpdate({ key: c.key }, { value: c.value }, { upsert: true });
  }

  // ── Salones ──
  for (const s of (DB.sals || [])) {
    await Salon.findOneAndUpdate(
      { nombre: s.nombre },
      { ciclo: s.ciclo, mats: s.mats || [] },
      { upsert: true }
    );
  }

  // ── Usuarios ──
  const allUsers = [
    ...(DB.admin ? [DB.admin] : []),
    ...(DB.profs || []),
    ...(DB.ests || []),
  ];
  for (const u of allUsers) {
    let pwd = u.password;
    // Si es SHA-256 (64 hex), dejar así — la ruta de login lo migra
    // Si ya es bcrypt ($2b$), dejar así
    const update = { ...u };
    if (!pwd) update.password = await bcrypt.hash('changeme123', 10);
    await Usuario.findOneAndUpdate({ id: u.id }, update, { upsert: true });
  }

  // ── Notas ──
  const anoActual = DB.anoActual || String(new Date().getFullYear());
  const notasMap = DB.notas || {};
  for (const [estId, perData] of Object.entries(notasMap)) {
    const periodos = [];
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
      { estId, anoLectivo: anoActual },
      { periodos, disciplina },
      { upsert: true }
    );
  }

  // ── Asistencia ──
  const asist = DB.asist || {};
  for (const [key, registros] of Object.entries(asist)) {
    const [salon, ...rest] = key.split('__');
    const fecha = rest.join('__');
    const registrosArr = Object.entries(registros).map(([estId, estado]) => ({ estId, estado }));
    await Asistencia.findOneAndUpdate(
      { salon, fecha },
      { registros: registrosArr },
      { upsert: true }
    );
  }

  // ── Excusas ──
  for (const e of (DB.exc || [])) {
    const eId = e._id || e.id;
    if (eId) await Excusa.findOneAndUpdate({ _id: eId }, e, { upsert: false }).catch(() => {});
    else await Excusa.create(e).catch(() => {});
  }

  // ── Bloqueos ──
  const blk = DB.blk || {};
  for (const [usuario, val] of Object.entries(blk)) {
    await Bloqueo.findOneAndUpdate({ usuario }, { on: val.on, ts: val.ts || '' }, { upsert: true });
  }
}

module.exports = router;
module.exports.saveFullDB = saveFullDB;
