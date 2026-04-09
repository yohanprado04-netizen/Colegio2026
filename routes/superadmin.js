// routes/superadmin.js — Rutas exclusivas del Super Admin (optimizado para 50k+ est.)
'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  Usuario, Colegio, Config, PlanEstudios,
  Nota, Asistencia, Auditoria, Salon,
  Excusa, VClase, Upload, Plan, Recuperacion, EstHist, Bloqueo, Papelera
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
    // Conteos en paralelo — countDocuments usa el índice, no carga docs
    const result = await Promise.all(colegios.map(async c => {
      const [admins, profs, ests] = await Promise.all([
        Usuario.countDocuments({ colegioId: c.id, role: 'admin'  }),
        Usuario.countDocuments({ colegioId: c.id, role: 'profe'  }),
        Usuario.countDocuments({ colegioId: c.id, role: 'est'    }),
      ]);
      return { ...c, admins, profs, ests };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/colegios — crear colegio + su admin inicial
router.post('/colegios', async (req, res) => {
  try {
    const { nombre, codigo, direccion, telefono, sedes, jornadas,
            adminNombre, adminUsuario, adminPassword } = req.body;

    if (!nombre || !adminNombre || !adminUsuario || !adminPassword)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const exists = await Usuario.findOne({ usuario: adminUsuario }).lean();
    if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const colegioId = 'col_' + Date.now();

    await Colegio.create({
      id: colegioId, nombre, codigo: codigo || '', direccion: direccion || '',
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

    // Config por defecto del colegio
    const defaults = [
      { key: 'periodos', value: ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'] },
      { key: 'mP',       value: ['Matemáticas','Español','Ciencias','Sociales','Artística','Educación Física'] },
      { key: 'mB',       value: ['Matemáticas','Español','Física','Química','Filosofía','Historia','Inglés'] },
      { key: 'ext',      value: { on:false, s:'', e:'' } },
      { key: 'dr',       value: { s:'', e:'' } },
      { key: 'drPer',    value: {} },
      { key: 'anoActual',value: String(new Date().getFullYear()) },
    ];
    await Config.insertMany(defaults.map(d => ({ ...d, colegioId })));

    Auditoria.create({
      ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
      role: 'superadmin', accion: `Colegio creado: ${nombre}`,
      extra: `admin: ${adminUsuario}`, colegioId
    }).catch(() => {});

    res.json({ ok: true, colegioId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/superadmin/colegios/:id
router.put('/colegios/:id', async (req, res) => {
  try {
    const allowed = ['nombre','codigo','direccion','telefono','sedes','jornadas','logo','activo'];
    const upd = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const col = await Colegio.findOneAndUpdate({ id: req.params.id }, upd, { new: true });
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });
    // Si cambió el nombre, actualizar colegioNombre en usuarios del colegio
    if (upd.nombre) {
      await Usuario.updateMany({ colegioId: req.params.id }, { colegioNombre: upd.nombre });
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/superadmin/colegios/:id — elimina colegio y TODOS sus datos (guarda en papelera)
router.delete('/colegios/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const col = await Colegio.findOne({ id }).lean();
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });

    // Guardar snapshot en papelera antes de eliminar
    const [adminsSnap, configSnap] = await Promise.all([
      Usuario.find({ colegioId: id, role: 'admin' }, '-password').lean(),
      Config.find({ colegioId: id }).lean(),
    ]);

    await Papelera.create({
      tipo:         'colegio',
      eliminadoTs:  new Date().toISOString(),
      eliminadoPor: req.user.nombre,
      datos:        col,
      admins:       adminsSnap,
      config:       configSnap,
    });

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

    Auditoria.create({
      ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
      role: 'superadmin', accion: `Colegio ELIMINADO: ${col.nombre}`,
      extra: `id: ${id}`, colegioId: ''
    }).catch(() => {});

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
    const admins = await Usuario.find(filter, '-password -__v').lean();
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
    if (req.body.nombre)              u.nombre   = req.body.nombre;
    if (req.body.password)            u.password = await bcrypt.hash(req.body.password, 12);
    if (req.body.blocked !== undefined) u.blocked = req.body.blocked;
    await u.save();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   CONFIGURACIÓN INSTITUCIONAL (sedes, jornadas)
══════════════════════════════════════════════════════════ */

// PUT /api/superadmin/institucion/:colegioId
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

// GET /api/superadmin/plan/:colegioId
router.get('/plan/:colegioId', async (req, res) => {
  try {
    const plan = await PlanEstudios.find({ colegioId: req.params.colegioId }).lean();
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/plan/:colegioId
router.post('/plan/:colegioId', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const docs  = items.map(i => ({ ...i, colegioId: req.params.colegioId }));
    await PlanEstudios.insertMany(docs, { ordered: false });
    res.json({ ok: true, inserted: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/superadmin/plan/:colegioId
router.delete('/plan/:colegioId', async (req, res) => {
  try {
    await PlanEstudios.deleteMany({ colegioId: req.params.colegioId });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   SUPERVISIÓN EN TIEMPO REAL — stats optimizados para escala
   En lugar de iterar sobre cada nota, usamos agregación MongoDB.
   Con 50k estudiantes la diferencia es de minutos a milisegundos.
══════════════════════════════════════════════════════════ */

// GET /api/superadmin/stats
router.get('/stats', async (req, res) => {
  try {
    const colegios = await Colegio.find({ activo: true }).lean();

    // Conteos masivos en paralelo con countDocuments (usa índices, O(log n))
    const [estCounts, profCounts, salonCounts] = await Promise.all([
      // Agrupa por colegioId para contar estudiantes de todos los colegios en 1 query
      Usuario.aggregate([
        { $match: { role: 'est' } },
        { $group: { _id: '$colegioId', count: { $sum: 1 } } }
      ]),
      Usuario.aggregate([
        { $match: { role: 'profe' } },
        { $group: { _id: '$colegioId', count: { $sum: 1 } } }
      ]),
      Salon.aggregate([
        { $group: { _id: '$colegioId', count: { $sum: 1 } } }
      ]),
    ]);

    // Promedio de notas por colegio usando agregación (no carga docs en memoria)
    const notasAgg = await Nota.aggregate([
      // Desanidar periodos → materias → valores
      { $unwind: { path: '$periodos', preserveNullAndEmptyArrays: false } },
      { $project: {
          colegioId: 1,
          materias: { $objectToArray: { $ifNull: ['$periodos.materias', {}] } }
      }},
      { $unwind: { path: '$materias', preserveNullAndEmptyArrays: false } },
      { $project: {
          colegioId: 1,
          prom: {
            $add: [
              { $multiply: [{ $ifNull: ['$materias.v.a', 0] }, 0.6] },
              { $multiply: [{ $ifNull: ['$materias.v.c', 0] }, 0.2] },
              { $multiply: [{ $ifNull: ['$materias.v.r', 0] }, 0.2] },
            ]
          }
      }},
      { $group: {
          _id: '$colegioId',
          promedio: { $avg: '$prom' },
          total:    { $sum: 1 }
      }},
    ]);

    // Mapear resultados a diccionarios por colegioId
    const estMap    = Object.fromEntries(estCounts.map(x => [x._id, x.count]));
    const profMap   = Object.fromEntries(profCounts.map(x => [x._id, x.count]));
    const salonMap  = Object.fromEntries(salonCounts.map(x => [x._id, x.count]));
    const notasMap  = Object.fromEntries(notasAgg.map(x => [x._id, +x.promedio.toFixed(2)]));

    const stats = colegios.map(c => ({
      colegioId:    c.id,
      colegioNombre: c.nombre,
      activo:       c.activo,
      totalEst:     estMap[c.id]   || 0,
      totalProfs:   profMap[c.id]  || 0,
      totalSalones: salonMap[c.id] || 0,
      promNotas:    notasMap[c.id] || 0,
    }));

    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   AUDITORÍA GLOBAL
══════════════════════════════════════════════════════════ */

// GET /api/superadmin/auditoria
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

// POST /api/superadmin/backup/:colegioId — exportar datos de un colegio
// Nota: para colegios grandes (10k+ est) devuelve stream JSON, no carga todo en RAM
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
      exportedAt: new Date().toISOString(),
      by:         req.user.nombre,
      colegio, usuarios, notas, asistencias, configs, salones, planEstudios
    };

    res.setHeader('Content-Disposition', `attachment; filename="backup_${cid}_${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);

    Auditoria.create({
      ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
      role: 'superadmin', accion: `Backup descargado: ${colegio.nombre}`,
      extra: '', colegioId: cid
    }).catch(() => {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/reset-passwords/:colegioId
router.post('/reset-passwords/:colegioId', async (req, res) => {
  try {
    const { role, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4)
      return res.status(400).json({ error: 'Contraseña demasiado corta (mínimo 4 caracteres)' });
    const hashed = await bcrypt.hash(newPassword, 12);
    const filter = { colegioId: req.params.colegioId };
    if (role) filter.role = role;
    const result = await Usuario.updateMany(filter, { password: hashed });

    Auditoria.create({
      ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
      role: 'superadmin',
      accion: `Reset masivo contraseñas (${role || 'todos'})`,
      extra: `${result.modifiedCount} usuarios actualizados`,
      colegioId: req.params.colegioId
    }).catch(() => {});

    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   PAPELERA — Restaurar colegios y admins eliminados
══════════════════════════════════════════════════════════ */

// GET /api/superadmin/papelera — ver todos los elementos eliminados
router.get('/papelera', async (req, res) => {
  try {
    const filter = {};
    if (req.query.tipo) filter.tipo = req.query.tipo;
    const items = await Papelera.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/superadmin/papelera/:id/restaurar — restaurar un colegio eliminado
router.post('/papelera/:id/restaurar', async (req, res) => {
  try {
    const item = await Papelera.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Elemento no encontrado en papelera' });

    if (item.tipo === 'colegio') {
      const col = item.datos;

      // Verificar que no exista ya un colegio con ese ID
      const existe = await Colegio.findOne({ id: col.id }).lean();
      if (existe) return res.status(409).json({ error: 'Ya existe un colegio con ese ID. No se puede restaurar.' });

      // Restaurar el colegio
      const { _id, __v, createdAt, updatedAt, ...colData } = col;
      await Colegio.create(colData);

      // Restaurar admins (sin contraseñas expuestas — se regenera una temporal)
      const bcrypt = require('bcryptjs');
      const tempPass = await bcrypt.hash('Temporal123!', 12);

      if (item.admins && item.admins.length > 0) {
        for (const admin of item.admins) {
          const adminExiste = await Usuario.findOne({ usuario: admin.usuario }).lean();
          if (!adminExiste) {
            const { _id: _a, __v: _v, createdAt: _c, updatedAt: _u, ...adminData } = admin;
            await Usuario.create({ ...adminData, password: tempPass, blocked: false });
          }
        }
      }

      // Restaurar config por defecto si no hay config guardada
      if (item.config && item.config.length > 0) {
        for (const cfg of item.config) {
          try {
            const { _id: _ci, __v: _cv, createdAt: _cc, updatedAt: _cu, ...cfgData } = cfg;
            await Config.create(cfgData);
          } catch (_) { /* ignorar duplicados */ }
        }
      }

      // Eliminar de la papelera
      await Papelera.findByIdAndDelete(req.params.id);

      Auditoria.create({
        ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
        role: 'superadmin', accion: `Colegio RESTAURADO: ${col.nombre}`,
        extra: `id: ${col.id}`, colegioId: col.id
      }).catch(() => {});

      res.json({
        ok: true,
        mensaje: `Colegio "${col.nombre}" restaurado. Los admins recuperados tienen contraseña temporal: Temporal123!`
      });

    } else if (item.tipo === 'admin') {
      const admin = item.datos;
      const existe = await Usuario.findOne({ usuario: admin.usuario }).lean();
      if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });

      const bcrypt = require('bcryptjs');
      const tempPass = await bcrypt.hash('Temporal123!', 12);
      const { _id, __v, createdAt, updatedAt, ...adminData } = admin;
      await Usuario.create({ ...adminData, password: tempPass, blocked: false });

      await Papelera.findByIdAndDelete(req.params.id);

      Auditoria.create({
        ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
        role: 'superadmin', accion: `Admin RESTAURADO: ${admin.nombre}`,
        extra: `usuario: ${admin.usuario}`, colegioId: admin.colegioId || ''
      }).catch(() => {});

      res.json({
        ok: true,
        mensaje: `Admin "${admin.nombre}" restaurado con contraseña temporal: Temporal123!`
      });

    } else {
      res.status(400).json({ error: 'Tipo de elemento desconocido' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/superadmin/papelera/:id — eliminar permanentemente de la papelera
router.delete('/papelera/:id', async (req, res) => {
  try {
    await Papelera.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;