// routes/api.js — Rutas granulares para cada entidad
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  Usuario, Salon, Config, Nota, Asistencia, Excusa,
  VClase, Upload, Plan, Recuperacion, Auditoria, EstHist, Bloqueo
} = require('../models');

// ─────── HELPER ───────
const hashPwd = async (raw) => {
  if (!raw) return '';
  if (/^\$2[ab]\$/.test(raw)) return raw; // ya es bcrypt
  return bcrypt.hash(raw, 12);
};

// ═══════════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════════

// GET /api/usuarios — lista todos (sin password)
router.get('/usuarios', authMiddleware, requireRole('admin'), async (req, res) => {
  const users = await Usuario.find({}, '-password -__v').lean();
  res.json(users);
});

// POST /api/usuarios — crear usuario
router.post('/usuarios', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const d = req.body;
    const exists = await Usuario.findOne({ usuario: d.usuario });
    if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });
    d.password = await hashPwd(d.password || 'changeme123');
    const u = await Usuario.create(d);
    const out = u.toObject(); delete out.password; delete out._id;
    // Registrar en historial si es estudiante
    if (d.role === 'est') {
      await EstHist.findOneAndUpdate(
        { id: d.id },
        { id: d.id, nombre: d.nombre, ti: d.ti || '', salon: d.salon || '',
          registrado: new Date().toLocaleDateString('es-CO'), activo: true },
        { upsert: true }
      );
    }
    res.status(201).json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/usuarios/:id — actualizar usuario
router.put('/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    const d = req.body;
    // Solo admin puede editar cualquier usuario; profe/est solo se editan a sí mismos
    if (req.user.role !== 'admin' && req.user.id !== req.params.id)
      return res.status(403).json({ error: 'Sin autorización' });
    if (d.password && !/^\$2[ab]\$/.test(d.password))
      d.password = await hashPwd(d.password);
    const u = await Usuario.findOneAndUpdate({ id: req.params.id }, d, { new: true });
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    const out = u.toObject(); delete out.password; delete out._id;
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/usuarios/:id
router.delete('/usuarios/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const u = await Usuario.findOneAndDelete({ id: req.params.id });
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    // Marcar como inactivo en historial
    await EstHist.findOneAndUpdate(
      { id: req.params.id },
      { activo: false, eliminado: new Date().toLocaleDateString('es-CO') }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// SALONES
// ═══════════════════════════════════════════════════════════════════
router.get('/salones', authMiddleware, async (req, res) => {
  const s = await Salon.find({}, '-__v').lean();
  res.json(s);
});

router.post('/salones', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const s = await Salon.create(req.body);
    res.status(201).json(s);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Salón ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/salones/:nombre', authMiddleware, requireRole('admin'), async (req, res) => {
  const s = await Salon.findOneAndUpdate(
    { nombre: req.params.nombre }, req.body, { new: true }
  );
  if (!s) return res.status(404).json({ error: 'Salón no encontrado' });
  res.json(s);
});

router.delete('/salones/:nombre', authMiddleware, requireRole('admin'), async (req, res) => {
  await Salon.findOneAndDelete({ nombre: req.params.nombre });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════
router.get('/config', authMiddleware, async (req, res) => {
  const configs = await Config.find({}).lean();
  const out = {};
  configs.forEach(c => { out[c.key] = c.value; });
  res.json(out);
});

router.put('/config/:key', authMiddleware, requireRole('admin'), async (req, res) => {
  const cfg = await Config.findOneAndUpdate(
    { key: req.params.key },
    { value: req.body.value },
    { upsert: true, new: true }
  );
  res.json(cfg);
});

// ═══════════════════════════════════════════════════════════════════
// NOTAS
// ═══════════════════════════════════════════════════════════════════

// GET /api/notas/:estId?ano=2025
router.get('/notas/:estId', authMiddleware, async (req, res) => {
  try {
    const cfg = await Config.findOne({ key: 'anoActual' });
    const ano = req.query.ano || (cfg?.value) || String(new Date().getFullYear());
    const nota = await Nota.findOne({ estId: req.params.estId, anoLectivo: ano }).lean();
    if (!nota) return res.json({ estId: req.params.estId, periodos: [] });
    res.json(nota);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notas/:estId/:periodo/:materia — guarda una nota tripartita
router.put('/notas/:estId/:periodo/:materia', authMiddleware, async (req, res) => {
  try {
    const { estId, periodo, materia } = req.params;
    const { a, c, r, disciplina } = req.body;

    // Verificar autorización (profe solo puede editar sus salones)
    if (req.user.role === 'profe') {
      const est = await Usuario.findOne({ id: estId, role: 'est' });
      if (!est || !(req.user.salones || []).includes(est.salon))
        return res.status(403).json({ error: 'Sin autorización para este estudiante' });
    }

    const cfg = await Config.findOne({ key: 'anoActual' });
    const ano = cfg?.value || String(new Date().getFullYear());

    let nota = await Nota.findOne({ estId, anoLectivo: ano });
    if (!nota) nota = new Nota({ estId, anoLectivo: ano, periodos: [] });

    let perEntry = nota.periodos.find(p => p.periodo === periodo);
    if (!perEntry) {
      nota.periodos.push({ periodo, materias: {}, disciplina: '' });
      perEntry = nota.periodos[nota.periodos.length - 1];
    }
    if (!perEntry.materias) perEntry.materias = {};
    perEntry.materias.set ? perEntry.materias.set(materia, { a, c, r }) : (perEntry.materias[materia] = { a, c, r });
    if (disciplina !== undefined) perEntry.disciplina = disciplina;
    nota.markModified('periodos');
    await nota.save();

    // Registrar en auditoría
    await Auditoria.create({
      ts: new Date().toISOString(),
      uid: req.user.id, who: req.user.nombre, role: req.user.role,
      est: estId, mat: `${materia} (${periodo})`,
      old: '?', nw: JSON.stringify({ a, c, r }),
      ip: req.ip || '—'
    });

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notas/:estId/disciplina
router.put('/notas/:estId/disciplina', authMiddleware, async (req, res) => {
  try {
    const { estId } = req.params;
    const cfg = await Config.findOne({ key: 'anoActual' });
    const ano = cfg?.value || String(new Date().getFullYear());
    await Nota.findOneAndUpdate(
      { estId, anoLectivo: ano },
      { disciplina: req.body.disciplina },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// ASISTENCIA
// ═══════════════════════════════════════════════════════════════════
router.get('/asistencias', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.salon) filter.salon = req.query.salon;
  if (req.query.fecha) filter.fecha = req.query.fecha;
  const list = await Asistencia.find(filter).lean();
  res.json(list);
});

router.put('/asistencias', authMiddleware, requireRole('admin', 'profe'), async (req, res) => {
  try {
    const { salon, fecha, registros } = req.body;
    const a = await Asistencia.findOneAndUpdate(
      { salon, fecha },
      { registros },
      { upsert: true, new: true }
    );
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// EXCUSAS
// ═══════════════════════════════════════════════════════════════════
router.get('/excusas', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.estId) filter.estId = req.query.estId;
  const list = await Excusa.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.post('/excusas', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const e = await Excusa.create({ ...req.body, estId: req.user.id, enombre: req.user.nombre });
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// CLASES VIRTUALES
// ═══════════════════════════════════════════════════════════════════
router.get('/vclases', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.salon) filter.salon = req.query.salon;
  if (req.query.profId) filter.profId = req.query.profId;
  const list = await VClase.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.post('/vclases', authMiddleware, requireRole('profe', 'admin'), async (req, res) => {
  try {
    const v = await VClase.create({ ...req.body, profId: req.user.id, profNombre: req.user.nombre });
    res.status(201).json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vclases/:id', authMiddleware, requireRole('profe', 'admin'), async (req, res) => {
  await VClase.findOneAndDelete({ id: req.params.id });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// UPLOADS (TAREAS)
// ═══════════════════════════════════════════════════════════════════
router.get('/uploads', authMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.estId) filter.estId = req.query.estId;
  if (req.query.profId) filter.profId = req.query.profId;
  const list = await Upload.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.post('/uploads', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const u = await Upload.create({ ...req.body, estId: req.user.id, estNombre: req.user.nombre });
    res.status(201).json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/uploads/:id/revisar', authMiddleware, requireRole('profe', 'admin'), async (req, res) => {
  const u = await Upload.findOneAndUpdate(
    { id: req.params.id },
    { revisado: true, revisadoTs: new Date().toLocaleDateString('es-CO') },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  res.json(u);
});

router.delete('/uploads/:id', authMiddleware, async (req, res) => {
  try {
    const u = await Upload.findOne({ id: req.params.id });
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    if (!u.revisado && req.user.role !== 'admin') {
      // Log intento en auditoría
      await Auditoria.create({
        ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
        role: req.user.role,
        accion: 'Intento de eliminar taller sin revisar',
        extra: `Taller: ${u.nombre} | Estudiante: ${u.estNombre} | Materia: ${u.materia}`
      });
      return res.status(403).json({ error: 'Solo puedes eliminar talleres ya revisados' });
    }
    await u.deleteOne();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// PLANES DE RECUPERACIÓN
// ═══════════════════════════════════════════════════════════════════
router.get('/planes', authMiddleware, async (req, res) => {
  const filter = { archivado: false };
  if (req.query.estId) filter.estId = req.query.estId;
  if (req.query.profId) filter.profId = req.query.profId;
  const list = await Plan.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.post('/planes', authMiddleware, requireRole('profe', 'admin'), async (req, res) => {
  try {
    const p = await Plan.create(req.body);
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/planes/:id/visto', authMiddleware, requireRole('est'), async (req, res) => {
  await Plan.findOneAndUpdate({ id: req.params.id }, { visto: true });
  res.json({ ok: true });
});

// Archivar todos los planes activos (al cerrar periodo extraordinario)
router.post('/planes/archivar', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { periodoLabel, archivedAt } = req.body;
    await Plan.updateMany(
      { archivado: false },
      { archivado: true, _periodo: periodoLabel, _archivedAt: archivedAt }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// RECUPERACIONES (respuestas de estudiantes)
// ═══════════════════════════════════════════════════════════════════
router.get('/recuperaciones', authMiddleware, async (req, res) => {
  const filter = { archivado: false };
  if (req.query.estId) filter.estId = req.query.estId;
  if (req.query.profId) filter.profId = req.query.profId;
  const list = await Recuperacion.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.post('/recuperaciones', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const r = await Recuperacion.create({ ...req.body, estId: req.user.id, estNombre: req.user.nombre });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/recuperaciones/:id/revisar', authMiddleware, requireRole('profe', 'admin'), async (req, res) => {
  const r = await Recuperacion.findOneAndUpdate(
    { id: req.params.id },
    { revisado: true, revisadoTs: new Date().toLocaleDateString('es-CO') },
    { new: true }
  );
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  res.json(r);
});

router.delete('/recuperaciones/:id', authMiddleware, requireRole('est', 'admin'), async (req, res) => {
  const r = await Recuperacion.findOne({ id: req.params.id });
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  if (!r.revisado && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Solo puedes eliminar recuperaciones revisadas' });
  await r.deleteOne();
  res.json({ ok: true });
});

// Archivar todas las recuperaciones activas
router.post('/recuperaciones/archivar', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { periodoLabel, archivedAt } = req.body;
    await Recuperacion.updateMany(
      { archivado: false },
      { archivado: true, _periodo: periodoLabel, _archivedAt: archivedAt }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════════
router.get('/auditoria', authMiddleware, requireRole('admin'), async (req, res) => {
  const list = await Auditoria.find({}).sort({ createdAt: -1 }).limit(500).lean();
  res.json(list);
});

router.post('/auditoria', authMiddleware, async (req, res) => {
  try {
    const a = await Auditoria.create({ ...req.body, uid: req.user.id, who: req.user.nombre, role: req.user.role });
    res.status(201).json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/auditoria', authMiddleware, requireRole('admin'), async (req, res) => {
  await Auditoria.deleteMany({});
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// BLOQUEOS
// ═══════════════════════════════════════════════════════════════════
router.get('/bloqueos', authMiddleware, requireRole('admin'), async (req, res) => {
  const list = await Bloqueo.find({ on: true }).lean();
  res.json(list);
});

router.put('/bloqueos/:usuario', authMiddleware, requireRole('admin'), async (req, res) => {
  const b = await Bloqueo.findOneAndUpdate(
    { usuario: req.params.usuario },
    req.body,
    { upsert: true, new: true }
  );
  res.json(b);
});

// ═══════════════════════════════════════════════════════════════════
// HISTORIAL ESTUDIANTES
// ═══════════════════════════════════════════════════════════════════
router.get('/est-hist', authMiddleware, requireRole('admin'), async (req, res) => {
  const list = await EstHist.find({}).lean();
  res.json(list);
});

router.put('/est-hist/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const h = await EstHist.findOneAndUpdate({ id: req.params.id }, req.body, { upsert: true, new: true });
  res.json(h);
});

module.exports = router;
