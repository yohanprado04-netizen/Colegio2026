// routes/api.js — Multi-tenant con colegioId + optimizado para 50k+ estudiantes
'use strict';
const router = require('express').Router();
const bcrypt  = require('bcryptjs');
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  Usuario, Salon, Config, Materia, Area, Nota, Comunicado, Asistencia, Excusa,
  VClase, Upload, Plan, Recuperacion, Auditoria, EstHist, Bloqueo
} = require('../models');

const hashPwd = async (raw) => {
  if (!raw) return '';
  if (/^\$2[ab]\$/.test(raw)) return raw;
  return bcrypt.hash(raw, 12);
};

// ─── tenantFilter: filtro { colegioId } según rol del usuario ────────────────
// superadmin sin ?colegioId → {} (ve todo)
// superadmin con ?colegioId → filtra ese colegio
// admin/profe/est → siempre su propio colegioId
const tenantFilter = (req) => {
  if (req.user.role === 'superadmin') {
    const cid = req.query.colegioId || req.body?.colegioId;
    return cid ? { colegioId: cid } : {};
  }
  return { colegioId: req.user.colegioId };
};

// ─── tenantId: colegioId a inyectar en docs nuevos ───────────────────────────
const tenantId = (req) => {
  if (req.user.role === 'superadmin') return req.body?.colegioId || req.query.colegioId || '';
  const cid = req.user.colegioId || '';
  if (!cid) {
    // Advertencia crítica: admin/profe/est sin colegioId en su token — indica
    // que el usuario fue creado sin colegioId en la BD. Usar fix_salones_colegioId.js
    // y actualizar el documento del usuario en MongoDB Atlas.
    console.warn(`[tenantId] ⚠️  Usuario "${req.user.usuario}" (role: ${req.user.role}) no tiene colegioId en su token. Posible usuario creado sin colegio asignado.`);
  }
  return cid;
};

// ═══════════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════════

router.get('/usuarios', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const filter = { ...tenantFilter(req), role: { $in: ['admin','profe','est'] } };
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 200);
    const skip  = (page - 1) * limit;
    const [users, total] = await Promise.all([
      Usuario.find(filter, '-password -__v').skip(skip).limit(limit).lean(),
      Usuario.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/usuarios', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const d = { ...req.body };
    if (!d.id) return res.status(400).json({ error: 'El campo id es requerido' });
    // Siempre asignar colegioId — usar el del token, luego el body, nunca dejar vacío
    const cid = tenantId(req) || req.user.colegioId || d.colegioId || '';
    d.colegioId    = cid;
    d.colegioNombre = req.user.colegioNombre || d.colegioNombre || '';
    if (!cid) {
      console.error(`[usuarios:POST] ⚠️  Creando usuario sin colegioId — usuario="${req.user.usuario}" rol="${req.user.role}"`);
    }
    const exists = await Usuario.findOne({ $or: [{ usuario: d.usuario }, { id: d.id }] }).lean();
    if (exists) return res.status(409).json({ error: 'Ese usuario o ID ya existe' });
    d.password = await hashPwd(d.password || 'changeme123');
    const u   = await Usuario.create(d);
    const out = u.toObject(); delete out.password; delete out._id;
    if (d.role === 'est') {
      await EstHist.findOneAndUpdate(
        { id: d.id },
        { id: d.id, nombre: d.nombre, ti: d.ti || '', salon: d.salon || '',
          registrado: new Date().toLocaleDateString('es-CO'), activo: true, colegioId: cid },
        { upsert: true }
      );
    }
    res.status(201).json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    const d    = req.body;
    const role = req.user.role;

    // ── Verificar que tiene permiso para editar este usuario ─────────────────
    if (role !== 'admin' && role !== 'superadmin' && req.user.id !== req.params.id)
      return res.status(403).json({ error: 'Sin autorización' });

    if (role === 'admin') {
      const target = await Usuario.findOne({ id: req.params.id }).lean();
      if (target && target.colegioId !== req.user.colegioId)
        return res.status(403).json({ error: 'Sin autorización' });
      if (d.salon) {
        const { Salon } = require('../models');
        const salonValido = await Salon.findOne({
          nombre: d.salon, colegioId: req.user.colegioId
        }).lean();
        if (!salonValido) {
          console.warn(`[usuarios:PUT] ⚠️  Intento de asignar salón "${d.salon}" que no pertenece a colegioId="${req.user.colegioId}"`);
          return res.status(400).json({ error: `El salón "${d.salon}" no existe en este colegio.` });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 🔒 SECURITY: Whitelist de campos permitidos por rol
    // Previene escalada de privilegios: un profe/est no puede cambiar su propio
    // role, colegioId, ni ningún campo sensible enviando { role: 'admin' }
    // ══════════════════════════════════════════════════════════════════════════
    let update = {};
    if (role === 'superadmin') {
      // Superadmin puede cambiar todo
      update = { ...d };
    } else if (role === 'admin') {
      // Admin puede cambiar datos de usuarios de su colegio pero NO el role ni colegioId
      const ADMIN_ALLOWED = ['nombre', 'ti', 'usuario', 'password', 'salon', 'salones',
        'ciclo', 'materia', 'materias', 'salonMaterias', 'blocked', 'activo'];
      ADMIN_ALLOWED.forEach(f => { if (d[f] !== undefined) update[f] = d[f]; });
    } else {
      // profe/est: solo puede cambiar su propia contraseña y datos de perfil básicos
      // NUNCA puede cambiar role, colegioId, blocked, salones, ciclo
      const SELF_ALLOWED = ['nombre', 'password'];
      SELF_ALLOWED.forEach(f => { if (d[f] !== undefined) update[f] = d[f]; });
    }

    // Detectar y bloquear intento de escalada explícita
    const PROTECTED_FIELDS = ['role', 'colegioId', 'colegioNombre', 'blocked'];
    if (role !== 'admin' && role !== 'superadmin') {
      const intento = PROTECTED_FIELDS.filter(f => d[f] !== undefined);
      if (intento.length > 0) {
        console.warn(`[SEC] ⚠️  Intento de escalada de privilegios por usuario="${req.user.usuario}" role="${role}" campos="${intento.join(',')}"`);
        return res.status(403).json({ error: 'No puedes modificar campos de seguridad.' });
      }
    }

    if (update.password && !/^\$2[ab]\$/.test(update.password))
      update.password = await hashPwd(update.password);

    if (Object.keys(update).length === 0)
      return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });

    const u = await Usuario.findOneAndUpdate({ id: req.params.id }, update, { new: true });
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    const out = u.toObject(); delete out.password; delete out._id;
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/usuarios/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.user.role === 'admin') filter.colegioId = req.user.colegioId;
    const u = await Usuario.findOneAndDelete(filter);
    if (!u) return res.status(404).json({ error: 'No encontrado' });
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
  try {
    const s = await Salon.find(tenantFilter(req), '-__v').lean();
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/salones', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    // ── Determinar colegioId con fallbacks robustos ──────────────────────────
    // Para superadmin: el colegioId viene siempre del body/query (elige qué colegio gestionar).
    // Para admin/profe: viene del token; si está vacío (usuario creado sin colegioId),
    //   se usa el body como respaldo — el frontend siempre lo envía desde CU.colegioId.
    let cid = '';
    if (req.user.role === 'superadmin') {
      cid = (req.body.colegioId || req.query.colegioId || '').trim();
    } else {
      cid = (req.user.colegioId || req.body.colegioId || '').trim();
    }

    // Seguridad: nunca crear un salón sin colegioId — evita colisiones cross-tenant
    if (!cid) {
      return res.status(400).json({ error: 'No se pudo determinar el colegio. Vuelve a iniciar sesión.' });
    }

    const colegioNombre = (
      req.user.colegioNombre ||
      req.body.colegioNombre ||
      ''
    ).trim();

    const nombreSalon = (req.body.nombre || '').trim().toUpperCase();

    if (!nombreSalon) {
      return res.status(400).json({ error: 'El nombre del salón es obligatorio.' });
    }

    // ── Log de diagnóstico para detectar colegioId vacíos ───────────────────────
    console.log(`[salones:POST] usuario=${req.user.usuario} | role=${req.user.role} | colegioId_token=${req.user.colegioId} | cid_resuelto=${cid} | salon=${nombreSalon}`);

    // ── Verificación explícita antes de insertar (evita el error E11000 de Mongo) ──
    // IMPORTANTE: solo buscar si cid tiene valor real — evita colisiones cross-tenant
    // cuando colegioId es vacío (salones huérfanos de otros colegios comparten el mismo "").
    const yaExiste = await Salon.findOne({ nombre: nombreSalon, colegioId: cid }).lean();
    if (yaExiste) {
      console.warn(`[salones:POST] COLISIÓN — salón "${nombreSalon}" ya existe para colegioId="${cid}"`);
      return res.status(409).json({ error: `El salón "${nombreSalon}" ya existe en este colegio.` });
    }

    const s = await Salon.create({
      ...req.body,
      nombre: nombreSalon,
      colegioId: cid,
      colegioNombre,
    });
    console.log(`[salones:POST] ✅ Salón "${nombreSalon}" creado para colegioId="${cid}"`);
    res.status(201).json(s);
  } catch (err) {
    // Doble seguridad: captura race condition E11000 si dos peticiones llegan simultáneas
    if (err.code === 11000) {
      console.error(`[salones:POST] E11000 race-condition para colegioId="${(tenantId(req)||req.user.colegioId||'').trim()}"`);
      return res.status(409).json({ error: `El salón ya existe en este colegio.` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/salones/:nombre', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    // Seguridad: nunca permitir cambiar colegioId desde el body — siempre usar el del token
    const cid = tenantId(req) || req.user.colegioId || '';
    const update = { ...req.body };
    // Forzar colegioId e colegioNombre correctos — evita cross-tenant accidental
    update.colegioId     = cid;
    update.colegioNombre = req.user.colegioNombre || req.body.colegioNombre || '';
    // No permitir cambiar el nombre del salón a uno que ya exista en este colegio
    if (update.nombre && update.nombre !== req.params.nombre) {
      const yaExiste = await Salon.findOne({ nombre: update.nombre, colegioId: cid }).lean();
      if (yaExiste) return res.status(409).json({ error: `El salón "${update.nombre}" ya existe en este colegio.` });
    }
    const s = await Salon.findOneAndUpdate(
      { nombre: req.params.nombre, colegioId: cid }, update, { new: true }
    );
    if (!s) return res.status(404).json({ error: 'Salón no encontrado' });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/salones/:nombre', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  await Salon.findOneAndDelete({ nombre: req.params.nombre, ...tenantFilter(req) });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ÁREAS POR COLEGIO — agrupan materias; la definitiva de área = promedio de sus materias
// ═══════════════════════════════════════════════════════════════════

// GET /api/areas?ciclo=primaria|bachillerato
router.get('/areas', authMiddleware, async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const filter = { colegioId: cid };
    if (req.query.ciclo) filter.ciclo = req.query.ciclo;
    const areas = await Area.find(filter).sort({ ciclo: 1, orden: 1, nombre: 1 }).lean();
    res.json(areas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/areas — crear área
router.post('/areas', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const { nombre, ciclo, orden } = req.body;
    if (!nombre || !ciclo) return res.status(400).json({ error: 'nombre y ciclo son requeridos' });
    const colegioNombre = req.user.colegioNombre || '';
    const a = await Area.create({ nombre: nombre.trim(), ciclo, colegioId: cid, colegioNombre, orden: orden || 0 });
    res.status(201).json(a);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Esa área ya existe en este colegio para ese ciclo' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/areas/:nombre/:ciclo — renombrar área
router.put('/areas/:nombre/:ciclo', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const { nuevoNombre } = req.body;
    if (!nuevoNombre) return res.status(400).json({ error: 'nuevoNombre requerido' });
    // Actualizar área
    const a = await Area.findOneAndUpdate(
      { nombre: req.params.nombre, ciclo: req.params.ciclo, colegioId: cid },
      { nombre: nuevoNombre.trim() },
      { new: true }
    );
    if (!a) return res.status(404).json({ error: 'Área no encontrada' });
    // Actualizar areaNombre en materias que pertenecen a esta área
    await Materia.updateMany(
      { areaNombre: req.params.nombre, ciclo: req.params.ciclo, colegioId: cid },
      { $set: { areaNombre: nuevoNombre.trim() } }
    );
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/areas/:nombre/:ciclo — eliminar área (las materias quedan sin área)
router.delete('/areas/:nombre/:ciclo', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    await Area.findOneAndDelete({ nombre: req.params.nombre, ciclo: req.params.ciclo, colegioId: cid });
    // Desasociar materias del área eliminada
    await Materia.updateMany(
      { areaNombre: req.params.nombre, ciclo: req.params.ciclo, colegioId: cid },
      { $set: { areaNombre: '' } }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/areas/:nombre/:ciclo/materias — asignar qué materias pertenecen a esta área
router.put('/areas/:nombre/:ciclo/materias', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const { materias } = req.body; // array de nombres de materias
    if (!Array.isArray(materias)) return res.status(400).json({ error: 'materias debe ser un array' });
    const areaNombre = req.params.nombre;
    const ciclo = req.params.ciclo;
    // Desasociar las materias que antes pertenecían a esta área pero ya no
    await Materia.updateMany(
      { areaNombre, ciclo, colegioId: cid, nombre: { $nin: materias } },
      { $set: { areaNombre: '' } }
    );
    // Asociar las materias seleccionadas
    if (materias.length > 0) {
      await Materia.updateMany(
        { nombre: { $in: materias }, ciclo, colegioId: cid },
        { $set: { areaNombre } }
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// MATERIAS POR COLEGIO — colección dedicada, separada por colegioId
// Reemplaza config {key:'mP'} y {key:'mB'} que causaban E11000 en Atlas
// ═══════════════════════════════════════════════════════════════════

// GET /api/materias?ciclo=primaria|bachillerato
router.get('/materias', authMiddleware, async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const filter = { colegioId: cid };
    if (req.query.ciclo) filter.ciclo = req.query.ciclo;
    const mats = await Materia.find(filter).sort({ ciclo: 1, orden: 1, nombre: 1 }).lean();
    res.json(mats); // incluye areaNombre en cada materia
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/materias — crear materia para este colegio
router.post('/materias', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    const { nombre, ciclo, orden } = req.body;
    if (!nombre || !ciclo) return res.status(400).json({ error: 'nombre y ciclo son requeridos' });
    // colegioNombre siempre del token del usuario autenticado — garantiza que queda vinculada al colegio
    const colegioNombre = req.user.colegioNombre || '';
    const m = await Materia.create({
      nombre: nombre.trim(), ciclo,
      colegioId: cid, colegioNombre,
      orden: orden || 0
    });
    res.status(201).json(m);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Esa materia ya existe en este colegio para ese ciclo' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/materias/:nombre/:ciclo
router.delete('/materias/:nombre/:ciclo', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId;
    await Materia.findOneAndDelete({ nombre: req.params.nombre, ciclo: req.params.ciclo, colegioId: cid });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const cid     = tenantId(req) || req.user.colegioId || 'global';
    const configs = await Config.find({ colegioId: cid }).lean();
    const out = {};
    configs.forEach(c => { out[c.key] = c.value; });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config/:key', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || 'global';
    const key = req.params.key;
    let cfg;
    try {
      cfg = await Config.findOneAndUpdate(
        { key, colegioId: cid },
        { $set: { value: req.body.value }, $setOnInsert: { key, colegioId: cid } },
        { upsert: true, new: true }
      );
    } catch (upsertErr) {
      if (upsertErr.code === 11000) {
        // Índice legacy key_1 en Atlas — intentar update directo
        cfg = await Config.findOneAndUpdate(
          { key, colegioId: cid },
          { $set: { value: req.body.value } },
          { new: true }
        );
        if (!cfg) {
          // No existe con ese colegioId — insertar por colección directa
          await Config.collection.insertOne({ key, value: req.body.value, colegioId: cid });
          cfg = await Config.findOne({ key, colegioId: cid }).lean();
        }
      } else { throw upsertErr; }
    }
    // Sincronizar con colección materias si es mP o mB
    if ((key === 'mP' || key === 'mB') && Array.isArray(req.body.value)) {
      const ciclo = key === 'mP' ? 'primaria' : 'bachillerato';
      const col = req.user.colegioNombre || '';
      for (let i = 0; i < req.body.value.length; i++) {
        const nombre = String(req.body.value[i]).trim();
        if (!nombre) continue;
        await Materia.findOneAndUpdate(
          { nombre, ciclo, colegioId: cid },
          { $setOnInsert: { nombre, ciclo, colegioId: cid, colegioNombre: col, orden: i } },
          { upsert: true }
        ).catch(() => {});
      }
    }
    res.json(cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// NOTAS — optimizado: índice (estId, anoLectivo, colegioId)
// ═══════════════════════════════════════════════════════════════════
router.get('/notas/:estId', authMiddleware, async (req, res) => {
  try {
    const cid  = tenantId(req) || req.user.colegioId || '';
    const cfg  = await Config.findOne({ key: 'anoActual', colegioId: cid }).lean();
    const ano  = req.query.ano || cfg?.value || String(new Date().getFullYear());
    const cidFilter = cid
      ? { $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }] }
      : { $or: [{ colegioId: '' }, { colegioId: null }, { colegioId: { $exists: false } }] };
    const nota = await Nota.findOne({ estId: req.params.estId, anoLectivo: ano, ...cidFilter }).lean();
    res.json(nota || { estId: req.params.estId, periodos: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/notas/:estId/:periodo/:materia', authMiddleware, async (req, res) => {
  try {
    const { estId } = req.params;
    // Express auto-decodifica los params, pero hacemos decode explícito por seguridad
    const periodo = decodeURIComponent(req.params.periodo);
    // Sanitizar la materia: los puntos (.) en claves de MongoDB causan errores de path.
    // Reemplazamos '.' por '\uFF0E' (punto de ancho completo) solo para la clave de BD.
    const materiaRaw = decodeURIComponent(req.params.materia);
    const materia = materiaRaw.replace(/\./g, '\uFF0E');
    const { a, c, r, disciplina }    = req.body;
    const cid = tenantId(req) || req.user.colegioId || '';

    if (req.user.role === 'profe') {
      // Buscar estudiante con colegioId correcto O colegioId vacío (usuarios huérfanos pre-fix)
      const est = await Usuario.findOne({
        id: estId, role: 'est',
        $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }]
      }).lean();
      if (!est || !(req.user.salones || []).includes(est.salon))
        return res.status(403).json({ error: 'Sin autorización para este estudiante' });
      // Auto-reparar colegioId si está vacío
      if (est && (!est.colegioId || est.colegioId === '') && cid) {
        Usuario.updateOne({ id: estId }, { $set: { colegioId: cid, colegioNombre: req.user.colegioNombre || '' } }).catch(() => {});
      }
    }

    const cfg  = await Config.findOne({ key: 'anoActual', colegioId: cid }).lean();
    const ano  = cfg?.value || String(new Date().getFullYear());

    // Filtro robusto: busca docs con colegioId correcto O colegioId vacío/null
    // Cubre el caso de documentos guardados antes del fix multi-tenant
    const cidFilter = cid
      ? { $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }] }
      : { $or: [{ colegioId: '' }, { colegioId: null }, { colegioId: { $exists: false } }] };

    // Función de guardado con reintentos para manejar race conditions y E11000
    const guardarNota = async (intentos = 3) => {
      for (let i = 0; i < intentos; i++) {
        try {
          // Obtener salón del estudiante UNA VEZ por iteración para guardarlo históricamente
          const estData = await Usuario.findOne({ id: estId, role: 'est',
            $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }]
          }).lean().catch(() => null);
          const salonActual = estData?.salon || '';

          // Paso 1: intentar actualizar periodo existente en el documento
          const updated = await Nota.findOneAndUpdate(
            { estId, anoLectivo: ano, ...cidFilter, 'periodos.periodo': periodo },
            {
              $set: {
                [`periodos.$.materias.${materia}`]: { a, c, r },
                ...(disciplina !== undefined ? { 'periodos.$.disciplina': disciplina } : {}),
                ...(salonActual ? { salon: salonActual } : {}),
              }
            },
            { new: true }
          );
          if (updated) return updated;

          // Paso 2: el periodo no existe aún — agregar con $push (upsert)

          const pushed = await Nota.findOneAndUpdate(
            { estId, anoLectivo: ano, ...cidFilter },
            {
              $push: {
                periodos: {
                  periodo,
                  materias: { [materia]: { a, c, r } },
                  ...(disciplina !== undefined ? { disciplina } : {}),
                }
              },
              $set: { salon: salonActual },
              $setOnInsert: { estId, anoLectivo: ano, colegioId: cid }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          if (pushed) return pushed;

        } catch (err) {
          // E11000: race condition — otro proceso creó el doc simultáneamente, reintentar
          if (err.code === 11000 && i < intentos - 1) {
            await new Promise(resolve => setTimeout(resolve, 30 * (i + 1)));
            continue;
          }
          throw err;
        }
      }
      throw new Error('No se pudo guardar la nota después de varios intentos');
    };

    await guardarNota();

    // Auditoría fire-and-forget
    Auditoria.create({
      ts: new Date().toISOString(),
      uid: req.user.id, who: req.user.nombre, role: req.user.role,
      est: estId, mat: `${materia} (${periodo})`,
      old: '?', nw: JSON.stringify({ a, c, r }),
      ip: req.ip || '—', colegioId: cid
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('[notas:PUT] Error guardando nota:', err.message, '| code:', err.code);
    res.status(500).json({ error: err.message });
  }
});

router.put('/notas/:estId/disciplina', authMiddleware, async (req, res) => {
  try {
    const cid     = tenantId(req) || req.user.colegioId || '';
    const cfg     = await Config.findOne({ key: 'anoActual', colegioId: cid }).lean();
    const ano     = cfg?.value || String(new Date().getFullYear());
    const { disciplina, periodo } = req.body;
    const val     = parseFloat(disciplina);
    if (isNaN(val) || val < 0 || val > 5)
      return res.status(400).json({ error: 'Disciplina debe ser número entre 0.0 y 5.0' });

    const cidFilter = cid
      ? { $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }] }
      : { $or: [{ colegioId: '' }, { colegioId: null }, { colegioId: { $exists: false } }] };

    let nota = await Nota.findOne({ estId: req.params.estId, anoLectivo: ano, ...cidFilter });
    if (!nota) nota = new Nota({ estId: req.params.estId, anoLectivo: ano, periodos: [], colegioId: cid });

    if (periodo) {
      let perEntry = nota.periodos.find(p => p.periodo === periodo);
      if (!perEntry) { nota.periodos.push({ periodo, materias: {}, disciplina: val }); }
      else { perEntry.disciplina = val; }
      nota.markModified('periodos');
    }
    const perConDisc = nota.periodos.filter(p => p.disciplina != null && !isNaN(p.disciplina));
    nota.disciplina = perConDisc.length
      ? +(perConDisc.reduce((s, p) => s + p.disciplina, 0) / perConDisc.length).toFixed(2)
      : val;
    await nota.save();
    res.json({ ok: true, disciplinaGlobal: nota.disciplina });
  } catch (err) {
    console.error('[disciplina:PUT] Error:', err.message, '| code:', err.code);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/notas/:estId/conducta — guardar nota de conducta ────────────────
router.put('/notas/:estId/conducta', authMiddleware, async (req, res) => {
  try {
    const cid   = tenantId(req) || req.user.colegioId || '';
    const cfg   = await Config.findOne({ key: 'anoActual', colegioId: cid }).lean();
    const ano   = cfg?.value || String(new Date().getFullYear());
    const { conducta, periodo } = req.body;
    const val   = parseFloat(conducta);
    if (isNaN(val) || val < 0 || val > 5)
      return res.status(400).json({ error: 'Conducta debe ser número entre 0.0 y 5.0' });

    const cidFilter = cid
      ? { $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }] }
      : { $or: [{ colegioId: '' }, { colegioId: null }, { colegioId: { $exists: false } }] };

    let nota = await Nota.findOne({ estId: req.params.estId, anoLectivo: ano, ...cidFilter });
    if (!nota) nota = new Nota({ estId: req.params.estId, anoLectivo: ano, periodos: [], colegioId: cid });

    if (periodo) {
      let perEntry = nota.periodos.find(p => p.periodo === periodo);
      if (!perEntry) { nota.periodos.push({ periodo, materias: {}, conducta: val }); }
      else { perEntry.conducta = val; }
      nota.markModified('periodos');
    }
    // Calcular promedio global de conducta entre todos los periodos que la tengan
    const perConCond = nota.periodos.filter(p => p.conducta != null && !isNaN(p.conducta));
    nota.conducta = perConCond.length
      ? +(perConCond.reduce((s, p) => s + p.conducta, 0) / perConCond.length).toFixed(2)
      : val;
    await nota.save();
    res.json({ ok: true, conductaGlobal: nota.conducta });
  } catch (err) {
    console.error('[conducta:PUT] Error:', err.message, '| code:', err.code);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ASISTENCIA
// ═══════════════════════════════════════════════════════════════════
router.get('/asistencias', authMiddleware, async (req, res) => {
  try {
    const filter = { ...tenantFilter(req) };
    if (req.query.salon) filter.salon = req.query.salon;
    if (req.query.fecha) filter.fecha = req.query.fecha;
    const list = await Asistencia.find(filter).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/asistencias', authMiddleware, requireRole('admin', 'profe', 'superadmin'), async (req, res) => {
  try {
    const { salon, fecha, registros } = req.body;
    const cid = tenantId(req) || req.user.colegioId || '';
    const a = await Asistencia.findOneAndUpdate(
      { salon, fecha, colegioId: cid },
      { registros, colegioId: cid },
      { upsert: true, new: true }
    );
    res.json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// EXCUSAS
// ═══════════════════════════════════════════════════════════════════
router.get('/excusas', authMiddleware, async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    // Base tenant filter — incluye docs con colegioId vacío para compatibilidad
    const cidFilter = cid
      ? { $or: [{ colegioId: cid }, { colegioId: '' }, { colegioId: null }] }
      : {};

    const filter = { ...cidFilter };

    // Estudiante: solo ve SUS propias excusas (por su estId)
    if (req.user.role === 'est') {
      filter.estId = req.user.id;
    } else if (req.query.estId) {
      // Admin/profe puede filtrar por estudiante específico
      filter.estId = req.query.estId;
    }

    // Profe: ve excusas dirigidas a él O de cualquier salón que administra
    if (req.user.role === 'profe' && !req.query.estId) {
      const profSalones = req.user.salones || [];
      const excFilter = [
        { dest: req.user.nombre },
        ...(profSalones.length ? [{ salon: { $in: profSalones } }] : []),
      ];
      // Combinar con tenant filter mediante $and
      filter.$and = [
        cidFilter,
        { $or: excFilter },
      ];
      // Limpiar keys individuales que ya están en $and
      delete filter.$or;
      Object.keys(cidFilter).forEach(k => delete filter[k]);
    }

    const list = await Excusa.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/excusas', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const e = await Excusa.create({
      ...req.body, estId: req.user.id, enombre: req.user.nombre,
      colegioId: req.user.colegioId || ''
    });
    res.status(201).json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Profesor responde excusa: texto + días extra + archivos de talleres
router.put('/excusas/:id/responder', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { respProf, diasExtra, fechaLimite, talleres } = req.body;
    const exc = await Excusa.findOneAndUpdate(
      { _id: req.params.id, colegioId: tenantId(req) || req.user.colegioId || '' },
      {
        respProf:       respProf       || '',
        respProfNombre: req.user.nombre,
        respTs:         new Date().toLocaleString('es-CO'),
        diasExtra:      Number(diasExtra) || 0,
        fechaLimite:    fechaLimite || '',
        talleres:       talleres    || [],
        respLeida:      false,
      },
      { new: true }
    );
    if (!exc) return res.status(404).json({ error: 'Excusa no encontrada' });
    res.json(exc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marcar respuesta del profesor como leída por el estudiante
router.put('/excusas/:id/leida', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const exc = await Excusa.findOneAndUpdate(
      { _id: req.params.id, estId: req.user.id, colegioId: req.user.colegioId || '' },
      { respLeida: true },
      { new: true }
    );
    if (!exc) return res.status(404).json({ error: 'Excusa no encontrada' });
    res.json(exc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// CLASES VIRTUALES
// ═══════════════════════════════════════════════════════════════════
router.get('/vclases', authMiddleware, async (req, res) => {
  try {
    const filter = { ...tenantFilter(req) };
    if (req.query.salon)  filter.salon  = req.query.salon;
    if (req.query.profId) filter.profId = req.query.profId;
    const list = await VClase.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vclases', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
  try {
    const v = await VClase.create({
      ...req.body, profId: req.user.id, profNombre: req.user.nombre,
      colegioId: tenantId(req) || req.user.colegioId || ''
    });
    res.status(201).json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vclases/:id', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
  await VClase.findOneAndDelete({ id: req.params.id });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// UPLOADS (TAREAS) — paginado + lazy dataUrl
// ═══════════════════════════════════════════════════════════════════
router.get('/uploads', authMiddleware, async (req, res) => {
  try {
    const filter = { ...tenantFilter(req) };
    if (req.query.estId)  filter.estId  = req.query.estId;
    if (req.query.profId) filter.profId = req.query.profId;
    const limit = Math.min(200, parseInt(req.query.limit) || 100);
    const skip  = (Math.max(1, parseInt(req.query.page) || 1) - 1) * limit;
    // Excluir dataUrl de listados (puede ser varios MB por archivo)
    const list  = await Upload.find(filter, '-dataUrl').sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET lazy: solo devuelve el dataUrl de un upload específico
router.get('/uploads/:id/data', authMiddleware, async (req, res) => {
  try {
    const u = await Upload.findOne({ id: req.params.id }, 'dataUrl type nombre').lean();
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/uploads', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const u = await Upload.create({
      ...req.body, estId: req.user.id, estNombre: req.user.nombre,
      colegioId: req.user.colegioId || ''
    });
    res.status(201).json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/uploads/:id/revisar', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
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
    if (!u.revisado && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      Auditoria.create({
        ts: new Date().toISOString(), uid: req.user.id, who: req.user.nombre,
        role: req.user.role,
        accion: 'Intento de eliminar taller sin revisar',
        extra: `Taller: ${u.nombre} | Est: ${u.estNombre} | Mat: ${u.materia}`,
        colegioId: u.colegioId || ''
      }).catch(() => {});
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
  try {
    const filter = { archivado: false, ...tenantFilter(req) };
    if (req.query.estId)  filter.estId  = req.query.estId;
    if (req.query.profId) filter.profId = req.query.profId;
    const list = await Plan.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/planes', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
  try {
    const p = await Plan.create({ ...req.body, colegioId: tenantId(req) || req.user.colegioId || '' });
    res.status(201).json(p);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/planes/:id/visto', authMiddleware, requireRole('est'), async (req, res) => {
  await Plan.findOneAndUpdate({ id: req.params.id }, { visto: true });
  res.json({ ok: true });
});

router.post('/planes/archivar', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { periodoLabel, archivedAt } = req.body;
    const filter = { archivado: false, ...tenantFilter(req) };
    await Plan.updateMany(filter, { archivado: true, _periodo: periodoLabel, _archivedAt: archivedAt });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// RECUPERACIONES
// ═══════════════════════════════════════════════════════════════════
// GET lazy dataUrl de una recuperación específica
router.get('/recuperaciones/:id/data', authMiddleware, async (req, res) => {
  try {
    const r = await Recuperacion.findOne({ id: req.params.id }, 'dataUrl type nombre').lean();
    if (!r) return res.status(404).json({ error: 'No encontrado' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recuperaciones', authMiddleware, async (req, res) => {
  try {
    const filter = { archivado: false, ...tenantFilter(req) };
    if (req.query.estId)  filter.estId  = req.query.estId;
    if (req.query.profId) filter.profId = req.query.profId;
    const list = await Recuperacion.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/recuperaciones', authMiddleware, requireRole('est'), async (req, res) => {
  try {
    const r = await Recuperacion.create({
      ...req.body, estId: req.user.id, estNombre: req.user.nombre,
      colegioId: req.user.colegioId || ''
    });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/recuperaciones/:id/revisar', authMiddleware, requireRole('profe', 'admin', 'superadmin'), async (req, res) => {
  const r = await Recuperacion.findOneAndUpdate(
    { id: req.params.id },
    { revisado: true, revisadoTs: new Date().toLocaleDateString('es-CO') },
    { new: true }
  );
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  res.json(r);
});

router.delete('/recuperaciones/:id', authMiddleware, requireRole('est', 'admin', 'superadmin'), async (req, res) => {
  const r = await Recuperacion.findOne({ id: req.params.id });
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  if (!r.revisado && req.user.role !== 'admin' && req.user.role !== 'superadmin')
    return res.status(403).json({ error: 'Solo puedes eliminar recuperaciones revisadas' });
  await r.deleteOne();
  res.json({ ok: true });
});

router.post('/recuperaciones/archivar', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { periodoLabel, archivedAt } = req.body;
    const filter = { archivado: false, ...tenantFilter(req) };
    await Recuperacion.updateMany(filter, { archivado: true, _periodo: periodoLabel, _archivedAt: archivedAt });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════════
router.get('/auditoria', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const filter = tenantFilter(req);
    const limit  = Math.min(1000, parseInt(req.query.limit) || 500);
    const list   = await Auditoria.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/auditoria', authMiddleware, async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    const a   = await Auditoria.create({
      ...req.body, uid: req.user.id, who: req.user.nombre, role: req.user.role, colegioId: cid
    });
    res.status(201).json(a);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/auditoria', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    await Auditoria.deleteMany(tenantFilter(req));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// BLOQUEOS
// ═══════════════════════════════════════════════════════════════════
router.get('/bloqueos', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    // Para admin: solo ver bloqueos de su propio colegio
    // Para superadmin: ver todos (o filtrar por ?colegioId)
    let filter = { on: true };
    if (req.user.role === 'admin') {
      filter.colegioId = req.user.colegioId;
    } else if (req.query.colegioId) {
      filter.colegioId = req.query.colegioId;
    }
    const list = await Bloqueo.find(filter).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/bloqueos/:usuario', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';

    // Verificar que el usuario a bloquear/desbloquear pertenece al mismo colegio (para admin)
    if (req.user.role === 'admin') {
      const targetUser = await Usuario.findOne({ usuario: req.params.usuario }).select('colegioId role').lean();
      if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (targetUser.colegioId !== req.user.colegioId)
        return res.status(403).json({ error: 'No tienes permisos sobre este usuario' });
      // Admin no puede bloquear a otros admins ni superadmin
      if (['admin', 'superadmin'].includes(targetUser.role))
        return res.status(403).json({ error: 'No se puede bloquear a un administrador' });
    }

    const b = await Bloqueo.findOneAndUpdate(
      { usuario: req.params.usuario },
      { ...req.body, colegioId: cid },
      { upsert: true, new: true }
    );
    res.json(b);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// HISTORIAL ESTUDIANTES — paginado
// ═══════════════════════════════════════════════════════════════════
router.get('/est-hist', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const filter = tenantFilter(req);
    const limit  = Math.min(500, parseInt(req.query.limit) || 200);
    const skip   = (Math.max(1, parseInt(req.query.page) || 1) - 1) * limit;
    const list   = await EstHist.find(filter).skip(skip).limit(limit).lean();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/est-hist/:id', authMiddleware, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    const h   = await EstHist.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, colegioId: cid },
      { upsert: true, new: true }
    );
    res.json(h);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── GET /api/diag/salon — Diagnóstico: por qué no aparecen estudiantes ──────
// Solo admin y profe pueden usarlo. Muestra exactamente qué hay en DB.
router.get('/diag/salon', authMiddleware, requireRole('admin','profe','superadmin'), async (req, res) => {
  try {
    const cid   = req.user.colegioId || null;
    const salon = (req.query.salon || '').trim();

    // Datos del profesor autenticado
    const profDoc = await Usuario.findOne({ id: req.user.id }).lean();

    // Consultas específicas: solo los datos necesarios, sin cargar todos los estudiantes
    const baseFilter = cid ? { colegioId: cid, role: 'est' } : { role: 'est' };

    // Contar total de ests del colegio (sin traer todos los docs)
    const totalEstsColegio = cid ? await Usuario.countDocuments(baseFilter) : 0;

    // Ests del salón pedido (comparación exacta) — solo si se especificó salon
    const estsSalon = salon
      ? await Usuario.find({ ...baseFilter, salon }, 'id nombre salon colegioId').lean()
      : [];

    // Ests con salon similar pero diferente escritura (espacios/casing) — solo si salon fue dado
    const estsSimilar = salon
      ? await Usuario.find({
          ...baseFilter,
          salon: { $regex: `^${salon.trim()}$`, $options: 'i' },
        }, 'id nombre salon colegioId').lean().then(docs =>
          docs.filter(e => e.salon !== salon)
        )
      : [];

    // Muestra de hasta 10 ests del colegio para diagnóstico (solo si no hay salon)
    const muestraEsts = salon
      ? []
      : await Usuario.find(baseFilter, 'nombre salon colegioId').limit(10).lean();

    res.json({
      profesorId:       req.user.id,
      profesorUsuario:  req.user.usuario,
      profesorColegioId: cid,
      profesorSalones:  profDoc?.salones || [],
      salonBuscado:     salon,
      totalEstsColegio,
      estsSalonExacto:  estsSalon.length,
      estsSimilar:      estsSimilar.map(e => ({ nombre: e.nombre, salon: JSON.stringify(e.salon) })),
      muestraEsts:      muestraEsts.map(e => ({ nombre: e.nombre, salon: e.salon, colegioId: e.colegioId })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});



// ═══════════════════════════════════════════════════════════════════
// COMUNICADOS — creados por el admin, vistos por profes y estudiantes
// ═══════════════════════════════════════════════════════════════════

// Helper: serializa un comunicado a objeto plano seguro para el frontend.
// Garantiza que el campo 'id' (custom string) esté siempre presente y que
// _id / __v de Mongoose no contaminen la respuesta.
function cleanCom(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id:              o.id,
    titulo:          o.titulo,
    mensaje:         o.mensaje,
    para:            o.para,
    color:           o.color,
    fechaInicio:     o.fechaInicio,
    fechaFin:        o.fechaFin,
    activo:          o.activo,
    colegioId:       o.colegioId,
    creadoPor:       o.creadoPor || '',
    esSuperAdmin:    o.esSuperAdmin || false,
    colegiosDestino: o.colegiosDestino || [],
    createdAt:       o.createdAt,
  };
}

// GET /api/comunicados — devuelve comunicados del colegio del usuario
//   • Admin → TODOS los propios (activos e inactivos) + SA vigentes para admin
//   • Profe / Est → solo los vigentes y dirigidos a ellos (propios + SA globales)
router.get('/comunicados', authMiddleware, async (req, res) => {
  try {
    const cid  = tenantId(req) || req.user.colegioId || '';
    if (!cid) return res.json([]);
    const hoy  = new Date().toISOString().slice(0, 10);
    const role = req.user.role;

    // Query 1: comunicados del colegio propio
    let query = { colegioId: cid };
    if (role !== 'admin') {
      query.activo      = true;
      query.fechaFin    = { $gte: hoy };
      query.fechaInicio = { $lte: hoy };
      query.para        = { $in: [role === 'profe' ? 'profe' : 'est', 'todos'] };
    }

    // Query 2: comunicados globales del superadmin dirigidos a este colegio
    const paraRoles = role === 'admin' ? ['todos','admin'] : role === 'profe' ? ['todos','profe'] : ['todos','est'];
    const saQuery = {
      esSuperAdmin: true,
      activo: true,
      fechaFin: { $gte: hoy },
      fechaInicio: { $lte: hoy },
      para: { $in: paraRoles },
      $or: [
        { colegiosDestino: { $size: 0 } },   // destino vacío = todos los colegios
        { colegiosDestino: cid },              // o específicamente este colegio
      ],
    };

    const [propios, saGlobales] = await Promise.all([
      Comunicado.find(query).sort({ createdAt: -1 }).lean(),
      Comunicado.find(saQuery).sort({ createdAt: -1 }).lean(),
    ]);

    const todos = [...propios, ...saGlobales];
    res.json(todos.map(c => cleanCom(c)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/comunicados — crear comunicado (solo admin)
router.post('/comunicados', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    if (!cid) return res.status(400).json({ error: 'El usuario no tiene colegio asignado' });
    const { titulo, mensaje, para, color, fechaInicio, fechaFin } = req.body;
    if (!titulo || !mensaje)
      return res.status(400).json({ error: 'Título y mensaje son obligatorios' });
    if (!fechaInicio || !fechaFin)
      return res.status(400).json({ error: 'Fechas de inicio y fin son obligatorias' });
    if (fechaInicio > fechaFin)
      return res.status(400).json({ error: 'La fecha fin debe ser igual o posterior al inicio' });

    const com = await Comunicado.create({
      id:          'com_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      titulo:      titulo.trim(),
      mensaje:     mensaje.trim(),
      para:        para || 'todos',
      color:       color || 'azul',
      fechaInicio: fechaInicio.trim(),
      fechaFin:    fechaFin.trim(),
      activo:      true,
      colegioId:   cid,
      creadoPor:   req.user.nombre || req.user.usuario || '',
    });
    // FIX: devolver objeto limpio — evita colisión entre campo 'id' custom y _id de Mongoose
    res.json(cleanCom(com));
  } catch (err) {
    console.error('[comunicados:POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/comunicados/:id — editar / activar / desactivar comunicado (solo admin)
router.put('/comunicados/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    if (!cid) return res.status(400).json({ error: 'Sin colegio asignado' });
    const { titulo, mensaje, para, color, fechaInicio, fechaFin, activo } = req.body;
    const updateFields = {};
    if (titulo      !== undefined) updateFields.titulo      = titulo.trim();
    if (mensaje     !== undefined) updateFields.mensaje     = mensaje.trim();
    if (para        !== undefined) updateFields.para        = para;
    if (color       !== undefined) updateFields.color       = color;
    if (fechaInicio !== undefined) updateFields.fechaInicio = fechaInicio;
    if (fechaFin    !== undefined) updateFields.fechaFin    = fechaFin;
    if (activo      !== undefined) updateFields.activo      = activo;

    const com = await Comunicado.findOneAndUpdate(
      { id: req.params.id, colegioId: cid },   // FIX: filtrar por colegioId para aislamiento
      { $set: updateFields },
      { new: true, runValidators: true }
    );
    if (!com) return res.status(404).json({ error: 'Comunicado no encontrado' });
    res.json(cleanCom(com));
  } catch (err) {
    console.error('[comunicados:PUT]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comunicados/:id — eliminar comunicado (solo admin del mismo colegio)
router.delete('/comunicados/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cid = tenantId(req) || req.user.colegioId || '';
    if (!cid) return res.status(400).json({ error: 'Sin colegio asignado' });
    const result = await Comunicado.deleteOne({ id: req.params.id, colegioId: cid });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: 'Comunicado no encontrado o no pertenece a este colegio' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[comunicados:DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;