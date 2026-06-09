// routes/finanzas.js — Módulo Financiero EduSistema Pro
// Roles: finAdmin (gestión completa del colegio), finUser (solo lectura/caja)
// El superadmin crea finAdmins desde el panel de superadmin.
'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const {
  Usuario, Colegio, FinUsuario, ConceptoCobro, Pago, FinComunicado, Bloqueo, Comunicado
} = require('../models');

const JWT_SECRET  = process.env.JWT_SECRET  || 'dev_only_secret_cambiar_en_produccion';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// ─── Middleware autenticación financiero ─────────────────────────────────────
const finAuth = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token no provisto' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET);
    if (!decoded.finRole) return res.status(403).json({ error: 'No es un token financiero' });
    const u = await FinUsuario.findOne({ id: decoded.id }).lean();
    if (!u)        return res.status(401).json({ error: 'Usuario financiero no encontrado' });
    if (u.blocked) return res.status(403).json({ error: 'Cuenta bloqueada' });
    req.finUser   = u;
    req.colegioId = u.colegioId;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Sesión expirada', expired: true });
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const requireFinRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.finUser?.role))
    return res.status(403).json({ error: `Se requiere rol: ${roles.join(' o ')}` });
  next();
};

// ─── Middleware superadmin (JWT del sistema principal) ───────────────────────
const superAuth = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token no provisto' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET);
    if (decoded.role !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin' });
    req.superUser = decoded;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
};

// ══════════════════════════════════════════════════════════════════════════════
// AUTH FINANCIERO
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/fin/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const usuario  = typeof req.body.usuario  === 'string' ? req.body.usuario.trim()  : '';
    const password = typeof req.body.password === 'string' ? req.body.password        : '';
    if (!usuario || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const u = await FinUsuario.findOne({ usuario });
    if (!u) {
      console.log(`[fin/login] "${usuario}" no encontrado en fin_usuarios`);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (u.blocked) return res.status(403).json({ error: 'Cuenta bloqueada. Contacta al administrador.' });

    const col = await Colegio.findOne({ id: u.colegioId }).select('activo nombre').lean();
    if (col && !col.activo)
      return res.status(403).json({ error: 'Tu institución está desactivada.' });

    const ok = await bcrypt.compare(password, u.password);
    console.log(`[fin/login] "${usuario}" encontrado | bcrypt ok=${ok} | col=${u.colegioNombre}`);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: u.id, usuario: u.usuario, finRole: u.role, nombre: u.nombre,
        colegioId: u.colegioId, colegioNombre: u.colegioNombre },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    );

    const safe = { ...u }; delete safe.password; delete safe._id; delete safe.__v;
    res.json({ token, user: safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/auth/verify
router.get('/auth/verify', finAuth, (req, res) => {
  const safe = { ...req.finUser }; delete safe.password;
  res.json({ valid: true, user: safe });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUPERADMIN — usuarios financieros
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/superadmin/usuarios
router.get('/superadmin/usuarios', superAuth, async (req, res) => {
  try {
    const list = await FinUsuario.find().select('-password').lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fin/superadmin/usuarios — crear finAdmin para un colegio
router.post('/superadmin/usuarios', superAuth, async (req, res) => {
  try {
    const { nombre, usuario, password, colegioId, role } = req.body;
    if (!nombre || !usuario || !password || !colegioId)
      return res.status(400).json({ error: 'Faltan campos: nombre, usuario, password, colegioId' });

    const col = await Colegio.findOne({ id: colegioId }).lean();
    if (!col) return res.status(404).json({ error: 'Colegio no encontrado' });

    const exists = await FinUsuario.findOne({ usuario });
    if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });

    const hashed = await bcrypt.hash(password, 12);
    const u = await FinUsuario.create({
      id: 'fin_' + Date.now(),
      nombre, usuario, password: hashed,
      role: ['finAdmin','finUser'].includes(role) ? role : 'finAdmin',
      colegioId, colegioNombre: col.nombre,
      createdBy: 'superadmin',
    });

    const safe = u.toObject(); delete safe.password;
    res.status(201).json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/superadmin/usuarios/:id
router.put('/superadmin/usuarios/:id', superAuth, async (req, res) => {
  try {
    const { nombre, password, blocked, role } = req.body;
    const upd = {};
    if (nombre)   upd.nombre  = nombre;
    if (role && ['finAdmin','finUser'].includes(role)) upd.role = role;
    if (typeof blocked === 'boolean') upd.blocked = blocked;
    if (password) upd.password = await bcrypt.hash(password, 12);
    const u = await FinUsuario.findOneAndUpdate(
      { id: req.params.id }, upd, { new: true }
    ).select('-password').lean();
    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/fin/superadmin/usuarios/:id
router.delete('/superadmin/usuarios/:id', superAuth, async (req, res) => {
  try {
    await FinUsuario.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CONCEPTOS DE COBRO
// ══════════════════════════════════════════════════════════════════════════════

router.get('/conceptos', finAuth, async (req, res) => {
  try {
    const list = await ConceptoCobro.find({ colegioId: req.colegioId, activo: true }).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/conceptos', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const { nombre, valor, descripcion, aplica } = req.body;
    if (!nombre || valor == null)
      return res.status(400).json({ error: 'nombre y valor son requeridos' });
    const c = await ConceptoCobro.create({
      id: 'con_' + Date.now(), colegioId: req.colegioId,
      nombre, valor: Number(valor),
      descripcion: descripcion || '',
      aplica: aplica || 'todos',
      activo: true, creadoPor: req.finUser.id,
    });
    res.status(201).json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/conceptos/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const { nombre, valor, descripcion, aplica, activo } = req.body;
    const upd = {};
    if (nombre      != null) upd.nombre      = nombre;
    if (valor       != null) upd.valor        = Number(valor);
    if (descripcion != null) upd.descripcion  = descripcion;
    if (aplica      != null) upd.aplica       = aplica;
    if (activo      != null) upd.activo       = activo;
    const c = await ConceptoCobro.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId }, upd, { new: true }
    ).lean();
    if (!c) return res.status(404).json({ error: 'Concepto no encontrado' });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/conceptos/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    await ConceptoCobro.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId },
      { activo: false }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PAGOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/pagos?estId=&estado=&anoPago=&salon=&page=&limit=
router.get('/pagos', finAuth, async (req, res) => {
  try {
    const filter = { colegioId: req.colegioId };
    if (req.query.estId)      filter.estId      = req.query.estId;
    if (req.query.estado)     filter.estado      = req.query.estado;
    if (req.query.anoPago)    filter.anoPago     = req.query.anoPago;
    if (req.query.salon)      filter.salon       = req.query.salon;
    if (req.query.conceptoId) filter.conceptoId  = req.query.conceptoId;

    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '100'));

    const [pagos, total] = await Promise.all([
      Pago.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
      Pago.countDocuments(filter),
    ]);
    res.json({ pagos, total, page, pages: Math.ceil(total/limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fin/pagos — registrar pago
router.post('/pagos', finAuth, async (req, res) => {
  try {
    const { estId, estNombre, salon, conceptoId, valor, descuento,
            fechaVences, metodoPago, comprobante, observacion,
            anoPago, periodoStr, estado } = req.body;

    if (!estId || !estNombre || !conceptoId)
      return res.status(400).json({ error: 'estId, estNombre y conceptoId son requeridos' });

    const concepto = await ConceptoCobro.findOne({ id: conceptoId, colegioId: req.colegioId }).lean();
    if (!concepto) return res.status(404).json({ error: 'Concepto no encontrado' });

    const valorBase  = Number(valor ?? concepto.valor);
    const desc       = Number(descuento ?? 0);
    const valorFinal = Math.max(0, valorBase - desc);

    const pago = await Pago.create({
      id: 'pago_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      colegioId: req.colegioId,
      estId, estNombre, salon: salon || '',
      conceptoId, conceptoNombre: concepto.nombre,
      valor: valorBase, descuento: desc, valorFinal,
      estado: estado || 'pendiente',
      fechaVence:  fechaVences || '',
      fechaPago:   estado === 'pagado' ? new Date().toISOString().slice(0,10) : '',
      metodoPago:  metodoPago  || '',
      comprobante: comprobante || '',
      observacion: observacion || '',
      registradoPor: req.finUser.id,
      anoPago:    anoPago    || String(new Date().getFullYear()),
      periodoStr: periodoStr || '',
    });
    res.status(201).json(pago);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/pagos/:id
router.put('/pagos/:id', finAuth, async (req, res) => {
  try {
    const allowed = ['estado','metodoPago','comprobante','observacion',
                     'descuento','fechaPago','fechaVence','periodoStr','valor'];
    const upd = {};
    allowed.forEach(k => { if (req.body[k] != null) upd[k] = req.body[k]; });

    if (upd.valor != null || upd.descuento != null) {
      const actual = await Pago.findOne({ id: req.params.id }).lean();
      const v = Number(upd.valor     ?? actual?.valor    ?? 0);
      const d = Number(upd.descuento ?? actual?.descuento ?? 0);
      upd.valorFinal = Math.max(0, v - d);
    }
    if (upd.estado === 'pagado' && !upd.fechaPago)
      upd.fechaPago = new Date().toISOString().slice(0,10);

    const pago = await Pago.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId }, upd, { new: true }
    ).lean();
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(pago);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/fin/pagos/:id — anular pago
router.delete('/pagos/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    await Pago.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId }, { estado: 'anulado' }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RESUMEN FINANCIERO (dashboard)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/resumen', finAuth, async (req, res) => {
  try {
    const ano  = req.query.anoPago || String(new Date().getFullYear());
    const base = { colegioId: req.colegioId, anoPago: ano };

    const [totalPagado, totalPendiente, totalVencido, totalAnulado, porConcepto, recientes] =
      await Promise.all([
        Pago.aggregate([{ $match: { ...base, estado:'pagado'   } }, { $group: { _id:null, sum:{ $sum:'$valorFinal' } } }]),
        Pago.aggregate([{ $match: { ...base, estado:'pendiente'} }, { $group: { _id:null, sum:{ $sum:'$valorFinal' }, cnt:{ $sum:1 } } }]),
        Pago.aggregate([{ $match: { ...base, estado:'vencido'  } }, { $group: { _id:null, sum:{ $sum:'$valorFinal' }, cnt:{ $sum:1 } } }]),
        Pago.countDocuments({ ...base, estado:'anulado' }),
        Pago.aggregate([
          { $match: { ...base, estado:'pagado' } },
          { $group: { _id:'$conceptoNombre', total:{ $sum:'$valorFinal' }, cnt:{ $sum:1 } } },
          { $sort: { total:-1 } },
        ]),
        Pago.find({ colegioId: req.colegioId }).sort({ createdAt:-1 }).limit(10).lean(),
      ]);

    res.json({
      ano,
      pagado:    totalPagado[0]?.sum    || 0,
      pendiente: { monto: totalPendiente[0]?.sum || 0, cantidad: totalPendiente[0]?.cnt || 0 },
      vencido:   { monto: totalVencido[0]?.sum   || 0, cantidad: totalVencido[0]?.cnt  || 0 },
      anulados:  totalAnulado,
      porConcepto,
      recientes,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ESTUDIANTES (proxy — lee del sistema principal)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/estudiantes', finAuth, async (req, res) => {
  try {
    const filter = { colegioId: req.colegioId, role: 'est' };
    if (req.query.salon) filter.salon = req.query.salon;
    if (req.query.q) {
      const re = new RegExp(req.query.q, 'i');
      filter.$or = [{ nombre: re }, { ti: re }, { usuario: re }];
    }
    const ests = await Usuario.find(filter)
      .select('id nombre ti salon usuario blocked').lean();
    res.json(ests);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/salones
router.get('/salones', finAuth, async (req, res) => {
  try {
    const { Salon } = require('../models');
    const sals = await Salon.find({ colegioId: req.colegioId })
      .select('nombre ciclo jornada').lean();
    res.json(sals);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOQUEO DE ESTUDIANTES (solo de este colegio)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/fin/bloquear
router.post('/bloquear', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const { estId, bloquear } = req.body;
    if (!estId) return res.status(400).json({ error: 'estId requerido' });

    const est = await Usuario.findOne({ id: estId, colegioId: req.colegioId, role: 'est' });
    if (!est) return res.status(404).json({ error: 'Estudiante no encontrado en este colegio' });

    const on = bloquear !== false;

    // Actualizar campo blocked en el usuario
    await Usuario.updateOne({ id: estId }, { $set: { blocked: on } });

    // Sincronizar con colección Bloqueo (que verifica el login)
    if (on) {
      await Bloqueo.findOneAndUpdate(
        { usuario: est.usuario },
        { on: true, ts: new Date().toISOString(), colegioId: req.colegioId },
        { upsert: true }
      );
    } else {
      await Bloqueo.updateMany({ usuario: est.usuario }, { $set: { on: false } });
    }

    res.json({ ok: true, bloqueado: on, estNombre: est.nombre });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/bloqueos — lista estudiantes bloqueados del colegio
router.get('/bloqueos', finAuth, async (req, res) => {
  try {
    const blks = await Bloqueo.find({ colegioId: req.colegioId, on: true }).lean();
    const usernames = blks.map(b => b.usuario);
    const ests = await Usuario.find({ usuario: { $in: usernames }, role: 'est', colegioId: req.colegioId })
      .select('id nombre salon ti usuario').lean();
    const map = {};
    ests.forEach(e => { map[e.usuario] = e; });
    res.json(blks.map(b => ({ ...b, est: map[b.usuario] || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// COMUNICADOS FINANCIEROS
// Los crea el finAdmin y son visibles por profes/ests en el sistema educativo
// Usa la colección `fin_comunicados` propia, y también puede crear comunicados
// en la colección principal `comunicados` para que aparezcan en la app educativa.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/comunicados — lista comunicados financieros del colegio
router.get('/comunicados', finAuth, async (req, res) => {
  try {
    const list = await FinComunicado.find({ colegioId: req.colegioId })
      .sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/comunicados/activos?colegioId=&para=
// Usado por el sistema educativo para mostrar banners financieros — NO requiere auth financiero
router.get('/comunicados/activos', async (req, res) => {
  try {
    const { colegioId, para } = req.query;
    if (!colegioId) return res.status(400).json({ error: 'colegioId requerido' });
    const hoy = new Date().toISOString().slice(0,10);
    const filter = {
      colegioId, activo: true,
      fechaInicio: { $lte: hoy },
      fechaFin:    { $gte: hoy },
    };
    if (para && para !== 'todos') filter.$or = [{ para: 'todos' }, { para }];
    const list = await FinComunicado.find(filter).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fin/comunicados
// Crea comunicado financiero Y lo replica en `comunicados` principal para
// que profes/ests lo vean en su panel educativo.
router.post('/comunicados', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const { titulo, mensaje, para, color, fechaInicio, fechaFin } = req.body;
    if (!titulo || !mensaje || !fechaInicio || !fechaFin)
      return res.status(400).json({ error: 'titulo, mensaje, fechaInicio y fechaFin son requeridos' });

    const id = 'fcom_' + Date.now();

    // 1. Guardar en colección financiera propia
    const c = await FinComunicado.create({
      id, colegioId: req.colegioId,
      titulo, mensaje,
      para:   para  || 'todos',
      color:  color || 'azul',
      fechaInicio, fechaFin,
      activo: true,
      creadoPor: req.finUser.id,
    });

    // 2. Replicar en colección principal `comunicados` para que lo vean en la app educativa
    // Lo marcamos con esSuperAdmin=false y colegioId del colegio, para que filtre solo ese colegio.
    try {
      await Comunicado.create({
        id: 'edu_' + id,
        colegioId:    req.colegioId,
        colegioNombre: req.finUser.colegioNombre || '',
        titulo:       `💰 ${titulo}`,   // prefijo para distinguir origen financiero
        mensaje,
        para:         para  || 'todos',
        color:        color || 'naranja', // naranja por defecto para financiero
        fechaInicio, fechaFin,
        activo:       true,
        esSuperAdmin: false,
        creadoPor:    `Finanzas: ${req.finUser.nombre}`,
        destinatarioId:   '',
        destinatarioNombre: '',
        colegiosDestino: [],
      });
    } catch (repErr) {
      // No fallar si la réplica falla — el comunicado financiero ya quedó guardado
      console.warn('[fin/comunicados] Error replicando a sistema educativo:', repErr.message);
    }

    res.status(201).json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/comunicados/:id
router.put('/comunicados/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const upd = {};
    ['titulo','mensaje','para','color','fechaInicio','fechaFin','activo'].forEach(k => {
      if (req.body[k] != null) upd[k] = req.body[k];
    });
    const c = await FinComunicado.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId }, upd, { new: true }
    ).lean();
    if (!c) return res.status(404).json({ error: 'Comunicado no encontrado' });

    // Sincronizar activo en la réplica del sistema educativo
    if (upd.activo !== undefined) {
      await Comunicado.updateMany(
        { id: 'edu_' + req.params.id },
        { $set: { activo: upd.activo } }
      ).catch(() => {});
    }

    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/fin/comunicados/:id
router.delete('/comunicados/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    await FinComunicado.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId }, { activo: false }
    );
    // Desactivar también la réplica
    await Comunicado.updateMany(
      { id: 'edu_' + req.params.id }, { $set: { activo: false } }
    ).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO DE CUENTA DE UN ESTUDIANTE
// ══════════════════════════════════════════════════════════════════════════════

router.get('/cuenta/:estId', finAuth, async (req, res) => {
  try {
    const { estId } = req.params;
    const ano = req.query.anoPago || String(new Date().getFullYear());

    const [pagos, est] = await Promise.all([
      Pago.find({ colegioId: req.colegioId, estId, anoPago: ano })
        .sort({ createdAt: 1 }).lean(),
      Usuario.findOne({ id: estId, colegioId: req.colegioId })
        .select('id nombre salon ti usuario blocked').lean(),
    ]);

    const blk = est ? await Bloqueo.findOne({ usuario: est.usuario, on: true }).lean() : null;
    const totalDeuda  = pagos.filter(p => ['pendiente','vencido'].includes(p.estado)).reduce((s,p) => s+p.valorFinal, 0);
    const totalPagado = pagos.filter(p => p.estado === 'pagado').reduce((s,p) => s+p.valorFinal, 0);

    res.json({ est, pagos, totalDeuda, totalPagado, bloqueado: !!blk, ano });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/reporte/morosos?anoPago=
router.get('/reporte/morosos', finAuth, async (req, res) => {
  try {
    const ano = req.query.anoPago || String(new Date().getFullYear());
    const morosos = await Pago.aggregate([
      { $match: { colegioId: req.colegioId, anoPago: ano, estado: { $in: ['pendiente','vencido'] } } },
      { $group: {
          _id: '$estId', estNombre: { $first: '$estNombre' }, salon: { $first: '$salon' },
          deuda: { $sum: '$valorFinal' }, cantPendientes: { $sum: 1 },
      }},
      { $sort: { deuda: -1 } },
    ]);
    res.json(morosos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/reporte/ingresos?anoPago=
router.get('/reporte/ingresos', finAuth, async (req, res) => {
  try {
    const ano = req.query.anoPago || String(new Date().getFullYear());
    const ingresos = await Pago.aggregate([
      { $match: { colegioId: req.colegioId, anoPago: ano, estado: 'pagado' } },
      { $group: { _id: '$periodoStr', total: { $sum: '$valorFinal' }, cantidad: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(ingresos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/reporte/cartera?anoPago=  — vista general por estudiante
router.get('/reporte/cartera', finAuth, async (req, res) => {
  try {
    const ano = req.query.anoPago || String(new Date().getFullYear());
    const cartera = await Pago.aggregate([
      { $match: { colegioId: req.colegioId, anoPago: ano, estado: { $ne: 'anulado' } } },
      { $group: {
          _id: '$estId', estNombre: { $first: '$estNombre' }, salon: { $first: '$salon' },
          totalPagado:   { $sum: { $cond: [{ $eq: ['$estado','pagado']   }, '$valorFinal', 0] } },
          totalPendiente:{ $sum: { $cond: [{ $in: ['$estado',['pendiente','vencido']] }, '$valorFinal', 0] } },
          pagos: { $sum: 1 },
      }},
      { $sort: { salon: 1, estNombre: 1 } },
    ]);
    res.json(cartera);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;