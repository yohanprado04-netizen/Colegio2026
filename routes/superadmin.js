// routes/superadmin.js — Rutas exclusivas del Super Admin
'use strict';
const router = require('express').Router();
const bcrypt  = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  Usuario, Colegio, Config, PlanEstudios, Materia,
  Nota, Asistencia, Auditoria, Estadistica,
  Salon, EstHist, Upload, Plan, Recuperacion, Bloqueo, Excusa, VClase
} = require('../models');

// Middleware: solo superadmin
router.use(verifyToken, requireRole('superadmin'));

/* ══════════════════════════════════════════════════════════
   GESTIÓN DE COLEGIOS
══════════════════════════════════════════════════════════ */

// GET /api/superadmin/colegios
router.get('/colegios', async (req, res) => {
  try {
    const colegios = await Colegio.find().lean();
    const result = await Promise.all(colegios.map(async c => {
      const [admins, profs, ests] = await Promise.all([
        Usuario.countDocuments({ colegioId: c.id, role: 'admin'  }),
        Usuario.countDocuments({ colegioId: c.id, role: 'profe'  }),
        Usuario.countDocuments({ colegioId: c.id, role: 'est'    }),
      ]);
      return { ...c, admins, profs, ests, logo: c.logo || '' };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/colegios — crear colegio + su admin
router.post('/colegios', async (req, res) => {
  try {
    const { nombre, nit, direccion, telefono, sedes, jornadas,
            adminNombre, adminUsuario, adminPassword, notaPct } = req.body;

    if (!nombre || !nit || !adminNombre || !adminUsuario || !adminPassword)
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, NIT, admin)' });

    const nitExiste = await Colegio.findOne({ nit });
    if (nitExiste) return res.status(409).json({ error: 'Ya existe un colegio con ese NIT' });

    const exists = await Usuario.findOne({ usuario: adminUsuario });
    if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const colegioId = 'col_' + Date.now();

    await Colegio.create({
      id: colegioId, nombre, nit, direccion: direccion || '',
      telefono: telefono || '', sedes: sedes || [], jornadas: jornadas || [],
      createdBy: 'superadmin'
    });

    const hashed = await bcrypt.hash(adminPassword, 12);
    await Usuario.create({
      id:            'admin_' + colegioId,
      nombre:        adminNombre,
      usuario:       adminUsuario,
      password:      hashed,
      role:          'admin',
      colegioId,
      colegioNombre: nombre
    });

    // Configs por defecto del colegio
    const cfgDefaults = [
      { key: 'periodos', value: ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'] },
      { key: 'mP',       value: ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'] },
      { key: 'mB',       value: ['Matemáticas','Español','Física','Química','Filosofía','Historia','Inglés','Ed. Física'] },
      { key: 'pers',     value: ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'] },
      { key: 'ext',      value: { on: false, s: '', e: '' } },
      { key: 'dr',       value: { s: '', e: '' } },
      { key: 'drPer',    value: {} },
      { key: 'anoActual',value: String(new Date().getFullYear()) },
      { key: 'notaPct',  value: (notaPct && typeof notaPct.a === 'number') ? notaPct : { a: 60, c: 20, r: 20 } },
    ];
    for (const c of cfgDefaults) {
      await Config.findOneAndUpdate(
        { key: c.key, colegioId },
        { $set: { value: c.value }, $setOnInsert: { key: c.key, colegioId } },
        { upsert: true }
      );
    }

    // Salones por defecto — upsert para no duplicar si ya existen
    const salonesDefault = [
      { nombre: '1A',  ciclo: 'primaria',     mats: [] },
      { nombre: '2A',  ciclo: 'primaria',     mats: [] },
      { nombre: '3A',  ciclo: 'primaria',     mats: [] },
      { nombre: '4A',  ciclo: 'primaria',     mats: [] },
      { nombre: '5A',  ciclo: 'primaria',     mats: [] },
      { nombre: '6A',  ciclo: 'bachillerato', mats: [] },
      { nombre: '7A',  ciclo: 'bachillerato', mats: [] },
      { nombre: '8A',  ciclo: 'bachillerato', mats: [] },
      { nombre: '9A',  ciclo: 'bachillerato', mats: [] },
      { nombre: '10A', ciclo: 'bachillerato', mats: [] },
      { nombre: '11A', ciclo: 'bachillerato', mats: [] },
    ];
    for (const s of salonesDefault) {
      await Salon.findOneAndUpdate(
        { nombre: s.nombre, colegioId },
        { $setOnInsert: { nombre: s.nombre, ciclo: s.ciclo, mats: s.mats, colegioId } },
        { upsert: true, new: false }
      ).catch(() => {});
    }

    // Materias por defecto en colección dedicada — diferenciadas por colegioId
    const materiasPrimaria = [
      'Matemáticas', 'Lengua Castellana', 'Ciencias Naturales',
      'Ciencias Sociales', 'Ed. Artística', 'Ed. Física', 'Ética',
    ];
    const materiasBachillerato = [
      'Matemáticas', 'Español', 'Física', 'Química',
      'Filosofía', 'Historia', 'Inglés', 'Ed. Física',
    ];
    for (let i = 0; i < materiasPrimaria.length; i++) {
      await Materia.findOneAndUpdate(
        { nombre: materiasPrimaria[i], ciclo: 'primaria', colegioId },
        { $setOnInsert: { nombre: materiasPrimaria[i], ciclo: 'primaria', colegioId, colegioNombre: nombre, orden: i } },
        { upsert: true }
      ).catch(() => {});
    }
    for (let i = 0; i < materiasBachillerato.length; i++) {
      await Materia.findOneAndUpdate(
        { nombre: materiasBachillerato[i], ciclo: 'bachillerato', colegioId },
        { $setOnInsert: { nombre: materiasBachillerato[i], ciclo: 'bachillerato', colegioId, colegioNombre: nombre, orden: i } },
        { upsert: true }
      ).catch(() => {});
    }

    Auditoria.create({
      ts: new Date().toISOString(), uid: 'superadmin', who: 'superadmin',
      role: 'superadmin', accion: `Colegio creado: ${nombre}`,
      extra: `admin: ${adminUsuario}`, colegioId
    }).catch(() => {});

    res.json({ ok: true, colegioId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/superadmin/colegios/:id
router.put('/colegios/:id', async (req, res) => {
  try {
    const allowed = ['nombre','nit','direccion','telefono','sedes','jornadas','logo','activo'];
    const upd = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const col = await Colegio.findOneAndUpdate({ id: req.params.id }, upd, { new: true });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    if (upd.nombre) {
      await Usuario.updateMany({ colegioId: req.params.id }, { colegioNombre: upd.nombre });
    }
    // Si se desactiva el colegio → bloquear todos sus usuarios (excepto superadmin)
    // Si se activa → desbloquear
    if (upd.activo !== undefined) {
      await Usuario.updateMany(
        { colegioId: req.params.id, role: { $in: ['admin', 'profe', 'est'] } },
        { blocked: !upd.activo }
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/superadmin/colegios/:id
router.delete('/colegios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const col = await Colegio.findOne({ id }).lean();
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    await Promise.all([
      Colegio.deleteOne({ id }),
      Usuario.deleteMany({ colegioId: id }),
      Salon.deleteMany({ colegioId: id }),
      Config.deleteMany({ colegioId: id }),
      Nota.deleteMany({ colegioId: id }),
      Asistencia.deleteMany({ colegioId: id }),
      Excusa.deleteMany({ colegioId: id }),
      VClase.deleteMany({ colegioId: id }),
      Upload.deleteMany({ colegioId: id }),
      Plan.deleteMany({ colegioId: id }),
      Recuperacion.deleteMany({ colegioId: id }),
      EstHist.deleteMany({ colegioId: id }),
      Bloqueo.deleteMany({ colegioId: id }),
      PlanEstudios.deleteMany({ colegioId: id }),
    ]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   GESTIÓN DE ADMINS DE COLEGIO
══════════════════════════════════════════════════════════ */

// GET /api/superadmin/admins?colegioId=xxx
router.get('/admins', async (req, res) => {
  try {
    const filter = { role: 'admin' };
    if (req.query.colegioId) filter.colegioId = req.query.colegioId;
    const admins = await Usuario.find(filter).select('-password').lean();
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/admins
router.post('/admins', async (req, res) => {
  try {
    const { colegioId, nombre, usuario, password } = req.body;
    if (!colegioId || !nombre || !usuario || !password)
      return res.status(400).json({ error: 'Faltan campos' });
    const col = await Colegio.findOne({ id: colegioId }).lean();
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    const exists = await Usuario.findOne({ usuario }).lean();
    if (exists) return res.status(409).json({ error: 'Usuario ya existe' });
    const hashed = await bcrypt.hash(password, 12);
    await Usuario.create({
      id: 'admin_' + Date.now(), nombre, usuario, password: hashed,
      role: 'admin', colegioId, colegioNombre: col.nombre
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/superadmin/admins/:id
router.put('/admins/:id', async (req, res) => {
  try {
    const u = await Usuario.findOne({ id: req.params.id, role: 'admin' });
    if (!u) return res.status(404).json({ error: 'Admin no encontrado' });
    if (req.body.nombre)               u.nombre   = req.body.nombre;
    if (req.body.password)             u.password = await bcrypt.hash(req.body.password, 12);
    if (req.body.blocked !== undefined) u.blocked = req.body.blocked;
    await u.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   CONFIGURACIÓN INSTITUCIONAL
══════════════════════════════════════════════════════════ */

router.put('/institucion/:colegioId', async (req, res) => {
  try {
    const { sedes, jornadas, logo } = req.body;
    const col = await Colegio.findOne({ id: req.params.colegioId });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    if (sedes    !== undefined) col.sedes    = sedes;
    if (jornadas !== undefined) col.jornadas = jornadas;
    if (logo     !== undefined) col.logo     = logo;
    await col.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   PLAN DE ESTUDIOS
══════════════════════════════════════════════════════════ */

router.get('/plan/:colegioId', async (req, res) => {
  try {
    const plan = await PlanEstudios.find({ colegioId: req.params.colegioId }).lean();
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/plan/:colegioId', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const docs  = items.map(i => ({ ...i, colegioId: req.params.colegioId }));
    await PlanEstudios.insertMany(docs, { ordered: false });
    res.json({ ok: true, inserted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/plan/:colegioId', async (req, res) => {
  try {
    await PlanEstudios.deleteMany({ colegioId: req.params.colegioId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   STATS — seguro y eficiente con countDocuments
══════════════════════════════════════════════════════════ */

router.get('/stats', async (req, res) => {
  try {
    const colegios = await Colegio.find({ activo: true }).lean();

    const stats = await Promise.all(colegios.map(async c => {
      const [totalEst, totalProfs, totalSalones] = await Promise.all([
        Usuario.countDocuments({ colegioId: c.id, role: 'est'   }),
        Usuario.countDocuments({ colegioId: c.id, role: 'profe' }),
        Salon.countDocuments(  { colegioId: c.id }),
      ]);

      // Promedio de notas: usar pct configurado por colegio
      let totalProm = 0, countProm = 0;
      try {
        const cfgPct = await Config.findOne({ key: 'notaPct', colegioId: c.id }).lean();
        const pct = (cfgPct && cfgPct.value) ? cfgPct.value : { a: 60, c: 20, r: 20 };
        const pA = (pct.a || 60) / 100, pC = (pct.c || 20) / 100, pR = (pct.r || 20) / 100;
        const notasDocs = await Nota.find({ colegioId: c.id }, 'periodos').lean();
        for (const nd of notasDocs) {
          for (const per of nd.periodos || []) {
            for (const val of Object.values(per.materias || {})) {
              if (val && typeof val === 'object' && 'a' in val) {
                totalProm += (val.a || 0) * pA + (val.c || 0) * pC + (val.r || 0) * pR;
                countProm++;
              }
            }
          }
        }
      } catch (_) { /* si no hay notas, continuar */ }

      return {
        colegioId:     c.id,
        colegioNombre: c.nombre,
        activo:        c.activo,
        totalEst,
        totalProfs,
        totalSalones,
        promNotas: countProm ? +(totalProm / countProm).toFixed(2) : 0,
      };
    }));

    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   AUDITORÍA GLOBAL
══════════════════════════════════════════════════════════ */

router.get('/auditoria', async (req, res) => {
  try {
    const limit  = Math.min(500, parseInt(req.query.limit) || 200);
    const filter = {};
    if (req.query.colegioId) filter.colegioId = req.query.colegioId;
    const logs = await Auditoria.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   MANTENIMIENTO TÉCNICO
══════════════════════════════════════════════════════════ */

router.post('/backup/:colegioId', async (req, res) => {
  try {
    const cid = req.params.colegioId;
    const [colegio, usuarios, notas, asistencias, configs, salones, planEstudios] = await Promise.all([
      Colegio.findOne({ id: cid }).lean(),
      Usuario.find({ colegioId: cid }, '-password').lean(),
      Nota.find({ colegioId: cid }).lean(),
      Asistencia.find({ colegioId: cid }).lean(),
      Config.find({ colegioId: cid }).lean(),
      Salon.find({ colegioId: cid }).lean(),
      PlanEstudios.find({ colegioId: cid }).lean(),
    ]);
    if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
    const backup = {
      exportedAt: new Date().toISOString(), by: 'superadmin',
      colegio, usuarios, notas, asistencias, configs, salones, planEstudios
    };
    res.setHeader('Content-Disposition', `attachment; filename="backup_${cid}_${Date.now()}.json"`);
    res.json(backup);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reset-passwords/:colegioId', async (req, res) => {
  try {
    const { role, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4)
      return res.status(400).json({ error: 'Contraseña demasiado corta' });
    const hashed = await bcrypt.hash(newPassword, 12);
    const filter = { colegioId: req.params.colegioId };
    if (role) filter.role = role;
    const result = await Usuario.updateMany(filter, { password: hashed });
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── GET /api/superadmin/usuarios-colegio/:colegioId ───────────────────────
   Lista todos los usuarios de un colegio (sin contraseñas) para el selector
   de reset individual de contraseña en Mantenimiento.
────────────────────────────────────────────────────────────────────────────── */
router.get('/usuarios-colegio/:colegioId', async (req, res) => {
  try {
    const cid = req.params.colegioId;
    if (!cid) return res.status(400).json({ error: 'colegioId requerido' });
    const usuarios = await Usuario.find(
      { colegioId: cid, role: { $in: ['admin', 'profe', 'est'] } },
      '-password -__v'
    ).sort({ role: 1, nombre: 1 }).lean();
    res.json(usuarios);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── POST /api/superadmin/reset-password-usuario/:userId ───────────────────
   Cambia la contraseña de un usuario específico por su campo `id`.
────────────────────────────────────────────────────────────────────────────── */
router.post('/reset-password-usuario/:userId', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4)
      return res.status(400).json({ error: 'Contraseña demasiado corta (mínimo 4 caracteres)' });
    const hashed = await bcrypt.hash(newPassword, 12);
    const result = await Usuario.findOneAndUpdate(
      { id: req.params.userId },
      { password: hashed },
      { new: false }
    );
    if (!result) return res.status(404).json({ error: 'Usuario no encontrado' });
    Auditoria.create({
      ts: new Date().toISOString(), uid: 'superadmin', who: 'superadmin',
      role: 'superadmin',
      accion: `Contraseña reseteada por superadmin → ${result.nombre} (${result.usuario})`,
      colegioId: result.colegioId || ''
    }).catch(() => {});
    res.json({ ok: true, usuario: result.nombre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;