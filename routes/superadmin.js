// routes/superadmin.js — Rutas exclusivas del Super Admin
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  Usuario, Colegio, Config, PlanEstudios,
  Nota, Asistencia, Auditoria, Estadistica
} = require('../models');

// Middleware: solo superadmin
router.use(verifyToken, requireRole('superadmin'));

/* ══════════════════════════════════════════════════════════
   GESTIÓN DE COLEGIOS
══════════════════════════════════════════════════════════ */

// GET /superadmin/colegios
router.get('/colegios', async (req, res) => {
  try {
    const colegios = await Colegio.find().lean();
    // Agregar conteos
    const result = await Promise.all(colegios.map(async c => {
      const [admins, profs, ests] = await Promise.all([
        Usuario.countDocuments({ colegioId: c.id, role: 'admin' }),
        Usuario.countDocuments({ colegioId: c.id, role: 'profe' }),
        Usuario.countDocuments({ colegioId: c.id, role: 'est'   }),
      ]);
      return { ...c, admins, profs, ests };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /superadmin/colegios — crear colegio + su admin
router.post('/colegios', async (req, res) => {
  try {
    const { nombre, codigo, direccion, telefono, sedes, jornadas,
            adminNombre, adminUsuario, adminPassword } = req.body;

    if (!nombre || !adminNombre || !adminUsuario || !adminPassword)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const exists = await Usuario.findOne({ usuario: adminUsuario });
    if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const colegioId = 'col_' + Date.now();

    await Colegio.create({
      id: colegioId, nombre, codigo: codigo||'', direccion: direccion||'',
      telefono: telefono||'', sedes: sedes||[], jornadas: jornadas||[],
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
    await Config.create({ key: 'periodos', value: ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'], colegioId });
    await Config.create({ key: 'mP',       value: ['Matemáticas','Español','Ciencias','Sociales','Artística','Educación Física'], colegioId });
    await Config.create({ key: 'mB',       value: ['Matemáticas','Español','Física','Química','Filosofía','Historia','Inglés'], colegioId });
    await Config.create({ key: 'ext',      value: { on:false, s:'', e:'' }, colegioId });
    await Config.create({ key: 'dr',       value: { s:'', e:'' }, colegioId });

    await Auditoria.create({
      ts: new Date().toISOString(), uid: 'superadmin', who: 'superadmin',
      role: 'superadmin', accion: `Colegio creado: ${nombre}`,
      extra: `admin: ${adminUsuario}`, colegioId
    });

    res.json({ ok: true, colegioId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /superadmin/colegios/:id — editar colegio
router.put('/colegios/:id', async (req, res) => {
  try {
    const { nombre, codigo, direccion, telefono, sedes, jornadas, activo } = req.body;
    const col = await Colegio.findOne({ id: req.params.id });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    if (nombre)     col.nombre     = nombre;
    if (codigo !== undefined)    col.codigo    = codigo;
    if (direccion !== undefined) col.direccion = direccion;
    if (telefono !== undefined)  col.telefono  = telefono;
    if (sedes)     col.sedes     = sedes;
    if (jornadas)  col.jornadas  = jornadas;
    if (activo !== undefined) {
      col.activo = activo;
      // bloquear/desbloquear admin del colegio
      await Usuario.updateMany({ colegioId: req.params.id, role: 'admin' }, { blocked: !activo });
    }
    await col.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /superadmin/colegios/:id
router.delete('/colegios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await Colegio.deleteOne({ id });
    await Usuario.deleteMany({ colegioId: id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   GESTIÓN DE ADMINS DE COLEGIO
══════════════════════════════════════════════════════════ */

// GET /superadmin/admins?colegioId=xxx
router.get('/admins', async (req, res) => {
  try {
    const filter = { role: 'admin' };
    if (req.query.colegioId) filter.colegioId = req.query.colegioId;
    const admins = await Usuario.find(filter).select('-password').lean();
    res.json(admins);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /superadmin/admins — crear admin para un colegio existente
router.post('/admins', async (req, res) => {
  try {
    const { colegioId, nombre, usuario, password } = req.body;
    if (!colegioId || !nombre || !usuario || !password)
      return res.status(400).json({ error: 'Faltan campos' });

    const col = await Colegio.findOne({ id: colegioId });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });

    const exists = await Usuario.findOne({ usuario });
    if (exists) return res.status(409).json({ error: 'Usuario ya existe' });

    const hashed = await bcrypt.hash(password, 12);
    await Usuario.create({
      id: 'admin_' + Date.now(), nombre, usuario, password: hashed,
      role: 'admin', colegioId, colegioNombre: col.nombre
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /superadmin/admins/:id — editar admin (nombre, password, blocked)
router.put('/admins/:id', async (req, res) => {
  try {
    const u = await Usuario.findOne({ id: req.params.id, role: 'admin' });
    if (!u) return res.status(404).json({ error: 'Admin no encontrado' });
    if (req.body.nombre)   u.nombre  = req.body.nombre;
    if (req.body.password) u.password = await bcrypt.hash(req.body.password, 12);
    if (req.body.blocked !== undefined) u.blocked = req.body.blocked;
    await u.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   CONFIGURACIÓN INSTITUCIONAL (sedes, jornadas)
══════════════════════════════════════════════════════════ */

// PUT /superadmin/institucion/:colegioId
router.put('/institucion/:colegioId', async (req, res) => {
  try {
    const { sedes, jornadas, logo } = req.body;
    const col = await Colegio.findOne({ id: req.params.colegioId });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    if (sedes)    col.sedes    = sedes;
    if (jornadas) col.jornadas = jornadas;
    if (logo)     col.logo     = logo;
    await col.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   PLAN DE ESTUDIOS
══════════════════════════════════════════════════════════ */

// GET /superadmin/plan/:colegioId
router.get('/plan/:colegioId', async (req, res) => {
  try {
    const plan = await PlanEstudios.find({ colegioId: req.params.colegioId }).lean();
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /superadmin/plan/:colegioId
router.post('/plan/:colegioId', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const docs = items.map(i => ({ ...i, colegioId: req.params.colegioId }));
    await PlanEstudios.insertMany(docs, { ordered: false });
    res.json({ ok: true, inserted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /superadmin/plan/:colegioId
router.delete('/plan/:colegioId', async (req, res) => {
  try {
    await PlanEstudios.deleteMany({ colegioId: req.params.colegioId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   SUPERVISIÓN EN TIEMPO REAL — estadísticas globales
══════════════════════════════════════════════════════════ */

// GET /superadmin/stats
router.get('/stats', async (req, res) => {
  try {
    const colegios = await Colegio.find({ activo: true }).lean();
    const stats = await Promise.all(colegios.map(async c => {
      const [totalEst, totalProfs, totalSalones] = await Promise.all([
        Usuario.countDocuments({ colegioId: c.id, role: 'est'   }),
        Usuario.countDocuments({ colegioId: c.id, role: 'profe' }),
        require('../models').Salon?.countDocuments({ colegioId: c.id }) || 0
      ]);
      // Promedio de notas del colegio
      const notasDocs = await Nota.find({ colegioId: c.id }).lean();
      let totalProm = 0, countProm = 0;
      for (const nd of notasDocs) {
        for (const per of nd.periodos || []) {
          for (const [, val] of Object.entries(per.materias || {})) {
            if (val && typeof val === 'object') {
              const prom = (val.a||0)*0.6 + (val.c||0)*0.2 + (val.r||0)*0.2;
              totalProm += prom; countProm++;
            }
          }
        }
      }
      return {
        colegioId:   c.id,
        colegioNombre: c.nombre,
        activo:      c.activo,
        totalEst, totalProfs, totalSalones,
        promNotas:   countProm ? +(totalProm/countProm).toFixed(2) : 0
      };
    }));
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /superadmin/auditoria — auditoría global
router.get('/auditoria', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const filter = {};
    if (req.query.colegioId) filter.colegioId = req.query.colegioId;
    const logs = await Auditoria.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   MANTENIMIENTO TÉCNICO
══════════════════════════════════════════════════════════ */

// POST /superadmin/backup/:colegioId — exportar datos de un colegio
router.post('/backup/:colegioId', async (req, res) => {
  try {
    const cid = req.params.colegioId;
    const [colegio, usuarios, notas, asistencias] = await Promise.all([
      Colegio.findOne({ id: cid }).lean(),
      Usuario.find({ colegioId: cid }).select('-password').lean(),
      Nota.find({ colegioId: cid }).lean(),
      Asistencia.find({ colegioId: cid }).lean(),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      by: 'superadmin',
      colegio, usuarios, notas, asistencias
    };
    res.setHeader('Content-Disposition', `attachment; filename="backup_${cid}_${Date.now()}.json"`);
    res.json(backup);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /superadmin/reset-passwords/:colegioId — actualizar password masivo
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

module.exports = router;
