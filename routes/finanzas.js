// routes/finanzas.js — Módulo Financiero EduSistema Pro
// Roles: finAdmin (gestión completa del colegio), finUser (solo lectura/caja)
// El superadmin crea finAdmins desde el panel de superadmin.
'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const {
  Usuario, Colegio, FinUsuario, ConceptoCobro, Pago, FinComunicado, Bloqueo, Comunicado, Comprobante
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

// GET /api/fin/pagos?anoPago=&estId=&estado=&salon=&page=&limit=&excluirPagados=1
router.get('/pagos', finAuth, async (req, res) => {
  try {
    const filter = { colegioId: req.colegioId };
    if (req.query.anoPago)    filter.anoPago    = req.query.anoPago;
    if (req.query.estId)      filter.estId      = req.query.estId;
    if (req.query.estado)     filter.estado     = req.query.estado;
    if (req.query.salon)      filter.salon      = req.query.salon;
    if (req.query.conceptoId) filter.conceptoId = req.query.conceptoId;
    // Excluir pagados del listado por defecto (solo cuando no hay filtro de estado)
    if (req.query.excluirPagados === '1' && !req.query.estado) {
      filter.estado = { $ne: 'pagado' };
    }

    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '100'));

    const [pagos, total] = await Promise.all([
      Pago.find(filter, '-__v').sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
      Pago.countDocuments(filter),
    ]);
    res.json({ pagos, total, page, pages: Math.ceil(total/limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fin/pagos — crear pago
router.post('/pagos', finAuth, async (req, res) => {
  try {
    if (req.finUser.role !== 'finAdmin')
      return res.status(403).json({ error: 'Solo finAdmin puede crear pagos' });
    const d = req.body;
    if (!d.estId || !d.estNombre || (!d.conceptoId && !d.concepto))
      return res.status(400).json({ error: 'estId, estNombre y concepto/conceptoId son obligatorios' });

    let conceptoNombre = d.concepto || '';
    let valorBase = Number(d.valor ?? d.valorTotal ?? 0);

    if (d.conceptoId) {
      const concepto = await ConceptoCobro.findOne({ id: d.conceptoId, colegioId: req.colegioId }).lean();
      if (!concepto) return res.status(404).json({ error: 'Concepto no encontrado' });
      conceptoNombre = concepto.nombre;
      valorBase = valorBase || concepto.valor;
    }

    const desc       = Number(d.descuento || 0);
    const valorFinal = d.valorFinal != null ? Number(d.valorFinal) : Math.max(0, valorBase - desc);

    const pago = await Pago.create({
      id:             'pago_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      colegioId:      req.colegioId,
      estId:          d.estId,
      estNombre:      d.estNombre,
      salon:          d.salon          || '',
      conceptoId:     d.conceptoId     || '',
      conceptoNombre, concepto: conceptoNombre,
      valor:          valorBase, valorTotal: valorBase,
      descuento:      desc, valorFinal,
      estado:         d.estado         || 'pendiente',
      anoPago:        d.anoPago        || String(new Date().getFullYear()),
      mesPago:        d.mesPago        || '',
      periodoStr:     d.periodoStr     || d.mesPago || '',
      fechaVence:     d.fechaVence     || d.fechaVences || '',
      fechaPago:      d.estado === 'pagado' ? (d.fechaPago || new Date().toISOString().slice(0,10)) : (d.fechaPago || ''),
      metodoPago:     d.metodoPago     || '',
      comprobante:    d.comprobante    || '',
      observaciones:  d.observaciones  || d.observacion || '',
      creadoPor:      req.finUser.usuario,
      registradoPor:  req.finUser.id,
    });
    res.status(201).json(pago);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/pagos/:id — actualizar estado / datos de un pago
router.put('/pagos/:id', finAuth, async (req, res) => {
  try {
    if (req.finUser.role !== 'finAdmin')
      return res.status(403).json({ error: 'Solo finAdmin puede editar pagos' });
    // Bloquear modificación de pagos ya confirmados
    const actual = await Pago.findOne({ id: req.params.id, colegioId: req.colegioId }).lean();
    if (!actual) return res.status(404).json({ error: 'Pago no encontrado' });
    if (actual.estado === 'pagado')
      return res.status(403).json({ error: 'Un pago confirmado no puede modificarse. Solo editable desde la base de datos.' });    const allowed = ['estado','metodoPago','comprobante','observaciones','observacion',
                     'valorFinal','descuento','mesPago','periodoStr','fechaVence','fechaPago','valor'];
    const upd = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) upd[f] = req.body[f]; });

    if (upd.valor != null || upd.descuento != null) {
      const actual = await Pago.findOne({ id: req.params.id }).lean();
      const v = Number(upd.valor     ?? actual?.valor    ?? actual?.valorTotal ?? 0);
      const d = Number(upd.descuento ?? actual?.descuento ?? 0);
      upd.valorFinal = Math.max(0, v - d);
    }
    if (upd.estado === 'pagado' && !upd.fechaPago)
      upd.fechaPago = new Date().toISOString().slice(0,10);

    const pago = await Pago.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId },
      upd, { new: true }
    ).lean();
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json(pago);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/fin/pagos/:id — anular pago (no borrar físicamente)
router.delete('/pagos/:id', finAuth, requireFinRole('finAdmin'), async (req, res) => {
  try {
    const existing = await Pago.findOne({ id: req.params.id, colegioId: req.colegioId }).lean();
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado' });
    if (existing.estado === 'pagado')
      return res.status(403).json({ error: 'Un pago confirmado no puede eliminarse. Solo editable desde la base de datos.' });
    const pago = await Pago.findOneAndUpdate(
      { id: req.params.id, colegioId: req.colegioId },
      { estado: 'anulado' }, { new: true }
    ).lean();
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json({ ok: true, pago });
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

router.get('/cuenta/:estId', async (req, res) => {
  try {
    // Acepta tanto token financiero (finAdmin/finUser) como token normal del estudiante
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token no provisto' });
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_secret_cambiar_en_produccion';
    let decoded;
    try { decoded = jwt.verify(h.split(' ')[1], JWT_SECRET); }
    catch(e) { return res.status(401).json({ error: 'Token inválido' }); }

    const { estId } = req.params;

    // Determinar colegioId según tipo de token
    let colegioId;
    if (decoded.finRole) {
      // Token financiero
      const { FinUsuario } = require('../models');
      const fu = await FinUsuario.findOne({ id: decoded.id }).lean();
      if (!fu) return res.status(401).json({ error: 'Usuario financiero no encontrado' });
      colegioId = fu.colegioId;
    } else if (decoded.role === 'est' || decoded.role === 'admin' || decoded.role === 'profe') {
      // Token normal del sistema educativo
      // Solo el propio estudiante puede ver su cuenta (o admin/profe del mismo colegio)
      if (decoded.role === 'est' && decoded.id !== estId)
        return res.status(403).json({ error: 'Solo puedes ver tu propia cuenta' });
      colegioId = decoded.colegioId;
    } else {
      return res.status(403).json({ error: 'Sin acceso a la cuenta financiera' });
    }

    const ano = req.query.anoPago || String(new Date().getFullYear());
    const [pagos, est] = await Promise.all([
      Pago.find({ colegioId, estId, anoPago: ano }).sort({ createdAt: 1 }).lean(),
      Usuario.findOne({ id: estId, colegioId }).select('id nombre salon ti usuario blocked').lean(),
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



// ══════════════════════════════════════════════════════════════════════════════
// USUARIOS FINANCIEROS (lectura para finAdmin del propio colegio)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/usuarios — listar usuarios financieros del colegio
router.get('/usuarios', finAuth, async (req, res) => {
  try {
    const lista = await FinUsuario.find({ colegioId: req.colegioId }, '-password -__v').lean();
    res.json(lista);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTE RESUMEN (totales del colegio)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/fin/reporte/resumen?anoPago=2026
router.get('/reporte/resumen', finAuth, async (req, res) => {
  try {
    const ano = req.query.anoPago || String(new Date().getFullYear());
    const [resumen] = await Pago.aggregate([
      { $match: { colegioId: req.colegioId, anoPago: ano, estado: { $ne: 'anulado' } } },
      { $group: {
        _id:            null,
        totalPagado:    { $sum: { $cond: [{ $eq: ['$estado','pagado']                   }, '$valorFinal', 0] } },
        totalPendiente: { $sum: { $cond: [{ $in: ['$estado',['pendiente','vencido']]     }, '$valorFinal', 0] } },
        totalAnulado:   { $sum: { $cond: [{ $eq: ['$estado','anulado']                  }, '$valorFinal', 0] } },
        cantPagado:     { $sum: { $cond: [{ $eq: ['$estado','pagado']                   }, 1, 0] } },
        cantPendiente:  { $sum: { $cond: [{ $in: ['$estado',['pendiente','vencido']]     }, 1, 0] } },
      }},
    ]);
    res.json(resumen || { totalPagado:0, totalPendiente:0, totalAnulado:0, cantPagado:0, cantPendiente:0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════════════
// COMPROBANTES DE PAGO
// ═══════════════════════════════════════════════════

// POST /api/fin/comprobantes/solicitar
router.post('/comprobantes/solicitar', finAuth, async (req, res) => {
  try {
    if (req.finUser.role !== 'finAdmin')
      return res.status(403).json({ error: 'Solo finAdmin puede solicitar comprobantes' });
    const { pagoId } = req.body;
    const pago = await Pago.findOne({ id: pagoId, colegioId: req.colegioId }).lean();
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.estado === 'pagado') return res.status(400).json({ error: 'Este pago ya está confirmado' });
    const existe = await Comprobante.findOne({ pagoId, colegioId: req.colegioId, estado: { $in: ['solicitado','enviado'] } }).lean();
    if (existe) return res.status(400).json({ error: 'Ya hay una solicitud activa para este pago', comprobante: existe });
    const uid = require('crypto').randomUUID();
    const comp = await Comprobante.create({
      id: uid, colegioId: req.colegioId, pagoId,
      estId: pago.estId, estNombre: pago.estNombre,
      salon: pago.salon, conceptoNombre: pago.conceptoNombre,
      valorFinal: pago.valorFinal, anoPago: pago.anoPago,
      estado: 'solicitado', solicitadoTs: new Date().toISOString().slice(0,10),
    });
    res.status(201).json(comp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/comprobantes
router.get('/comprobantes', finAuth, async (req, res) => {
  try {
    const filter = { colegioId: req.colegioId };
    if (req.query.estId)  filter.estId  = req.query.estId;
    if (req.query.estado) filter.estado = req.query.estado;
    if (req.query.pagoId) filter.pagoId = req.query.pagoId;
    const list = await Comprobante.find(filter, '-dataUrl').sort({ createdAt: -1 }).limit(200).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/comprobantes/est/:estId — para el estudiante (token normal)
router.get('/comprobantes/est/:estId', async (req, res) => {
  try {
    const authH = req.headers.authorization || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sin token' });
    const jwt2 = require('jsonwebtoken');
    const payload = jwt2.verify(token, process.env.JWT_SECRET || 'secret');
    if (payload.id !== req.params.estId) return res.status(403).json({ error: 'Sin permiso' });
    const list = await Comprobante.find({ estId: req.params.estId }, '-dataUrl').sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fin/comprobantes/crear — estudiante sube comprobante sin esperar solicitud del financiero
// IMPORTANTE: esta ruta debe estar ANTES de /comprobantes/:id/... para que Express no confunda 'crear' como id
router.post('/comprobantes/crear', async (req, res) => {
  try {
    const authH = req.headers.authorization || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sin token' });
    const jwt2 = require('jsonwebtoken');
    let payload;
    try { payload = jwt2.verify(token, process.env.JWT_SECRET || 'secret'); }
    catch { return res.status(401).json({ error: 'Token inválido' }); }

    const { pagoId, dataUrl, fileType, fileName } = req.body;
    if (!pagoId || !dataUrl) return res.status(400).json({ error: 'Faltan pagoId o dataUrl' });

    const pago = await Pago.findOne({ id: pagoId }).lean();
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.estId !== payload.id) return res.status(403).json({ error: 'Sin permiso sobre este pago' });
    if (pago.estado === 'pagado') return res.status(400).json({ error: 'Este pago ya está confirmado como pagado' });
    if (pago.estado === 'anulado') return res.status(400).json({ error: 'Este pago está anulado' });

    const existe = await Comprobante.findOne({
      pagoId, estado: { $in: ['solicitado', 'enviado', 'aprobado'] }
    }).lean();
    if (existe) {
      return res.status(400).json({ error: 'Ya hay un comprobante activo para este pago', comprobante: existe });
    }

    const hoy = new Date().toISOString().slice(0, 10);
    const comp = await Comprobante.create({
      id:             require('crypto').randomUUID(),
      colegioId:      pago.colegioId,
      pagoId,
      estId:          pago.estId,
      estNombre:      pago.estNombre,
      salon:          pago.salon,
      conceptoNombre: pago.conceptoNombre,
      valorFinal:     pago.valorFinal,
      anoPago:        pago.anoPago,
      estado:         'enviado',
      dataUrl,
      fileType:       fileType || '',
      fileName:       fileName || 'comprobante',
      solicitadoTs:   hoy,
      enviadoTs:      hoy,
    });

    const { dataUrl: _skip, ...compSafe } = comp.toObject();
    res.status(201).json(compSafe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/comprobantes/:id/enviar — estudiante sube archivo
router.put('/comprobantes/:id/enviar', async (req, res) => {
  try {
    const authH = req.headers.authorization || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sin token' });
    const jwt2 = require('jsonwebtoken');
    const payload = jwt2.verify(token, process.env.JWT_SECRET || 'secret');
    const comp = await Comprobante.findOne({ id: req.params.id }).lean();
    if (!comp) return res.status(404).json({ error: 'No encontrado' });
    if (comp.estId !== payload.id) return res.status(403).json({ error: 'Sin permiso' });
    if (!['solicitado','rechazado'].includes(comp.estado))
      return res.status(400).json({ error: 'No puedes subir comprobante en este estado' });
    const { dataUrl, fileType, fileName } = req.body;
    if (!dataUrl) return res.status(400).json({ error: 'Falta el archivo' });
    const updated = await Comprobante.findOneAndUpdate(
      { id: req.params.id },
      { estado: 'enviado', dataUrl, fileType: fileType||'', fileName: fileName||'comprobante',
        enviadoTs: new Date().toISOString().slice(0,10), motivoRechazo: '' },
      { new: true, select: '-dataUrl' }
    );
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fin/comprobantes/:id/revisar — finAdmin aprueba o rechaza
router.put('/comprobantes/:id/revisar', finAuth, async (req, res) => {
  try {
    if (req.finUser.role !== 'finAdmin')
      return res.status(403).json({ error: 'Solo finAdmin puede revisar comprobantes' });
    const { accion, motivoRechazo } = req.body;
    const comp = await Comprobante.findOne({ id: req.params.id, colegioId: req.colegioId }).lean();
    if (!comp) return res.status(404).json({ error: 'No encontrado' });
    if (comp.estado !== 'enviado') return res.status(400).json({ error: 'Solo puedes revisar comprobantes enviados' });
    const hoy = new Date().toISOString().slice(0,10);
    if (accion === 'aprobar') {
      await Comprobante.findOneAndUpdate({ id: comp.id },
        { estado: 'aprobado', revisadoTs: hoy, revisadoPor: req.finUser.nombre || req.finUser.email });
      await Pago.findOneAndUpdate({ id: comp.pagoId, colegioId: req.colegioId },
        { estado: 'pagado', fechaPago: hoy, metodoPago: 'Transferencia / comprobante',
          registradoPor: req.finUser.nombre || req.finUser.email });
      return res.json({ ok: true, accion: 'aprobado', pagoId: comp.pagoId });
    }
    if (accion === 'rechazar') {
      if (!motivoRechazo) return res.status(400).json({ error: 'Debes indicar el motivo del rechazo' });
      await Comprobante.findOneAndUpdate({ id: comp.id },
        { estado: 'rechazado', motivoRechazo, revisadoTs: hoy,
          revisadoPor: req.finUser.nombre || req.finUser.email, dataUrl: '' });
      return res.json({ ok: true, accion: 'rechazado', pagoId: comp.pagoId });
    }
    res.status(400).json({ error: 'Acción inválida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fin/comprobantes/:id/archivo
router.get('/comprobantes/:id/archivo', finAuth, async (req, res) => {
  try {
    const comp = await Comprobante.findOne({ id: req.params.id, colegioId: req.colegioId }, 'dataUrl fileType').lean();
    if (!comp) return res.status(404).json({ error: 'No encontrado' });
    res.json({ dataUrl: comp.dataUrl, fileType: comp.fileType });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;