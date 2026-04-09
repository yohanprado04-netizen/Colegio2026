// routes/sugerencias.js — Sistema de sugerencias para todos los roles → superadmin
'use strict';
const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth');
const { Sugerencia } = require('../models');

// POST /api/sugerencias — cualquier usuario autenticado envía
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { titulo, mensaje, categoria } = req.body;
    if (!mensaje || !mensaje.trim())
      return res.status(400).json({ error: 'El mensaje es requerido' });

    const s = await Sugerencia.create({
      uid:           req.user.id,
      nombre:        req.user.nombre,
      role:          req.user.role,
      colegioId:     req.user.colegioId || '',
      colegioNombre: req.user.colegioNombre || '',
      titulo:        (titulo || '').trim(),
      mensaje:       mensaje.trim(),
      categoria:     categoria || 'general',
      leida:         false,
      ts:            new Date().toISOString(),
    });
    res.status(201).json({ ok: true, id: s._id });
  } catch (err) {
    console.error('Sugerencia POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sugerencias — superadmin ve todas; otros solo las suyas
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'superadmin') {
      filter.uid = req.user.id;
    } else {
      if (req.query.colegioId) filter.colegioId = req.query.colegioId;
      if (req.query.leida !== undefined && req.query.leida !== '')
        filter.leida = req.query.leida === 'true';
    }
    const limit = Math.min(200, parseInt(req.query.limit) || 100);
    const list  = await Sugerencia.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(list);
  } catch (err) {
    console.error('Sugerencia GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sugerencias/count — cantidad no leídas (badge superadmin)
router.get('/count', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') return res.json({ noLeidas: 0 });
    const noLeidas = await Sugerencia.countDocuments({ leida: false });
    res.json({ noLeidas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sugerencias/:id/leer — marcar leída (solo superadmin)
router.put('/:id/leer', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Solo el super admin puede marcar sugerencias' });
    await Sugerencia.findByIdAndUpdate(req.params.id, {
      leida: true,
      leidaTs: new Date().toISOString()
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sugerencias/:id/responder — superadmin responde
router.put('/:id/responder', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Solo el super admin puede responder' });
    const { respuesta } = req.body;
    await Sugerencia.findByIdAndUpdate(req.params.id, {
      respuesta:    respuesta || '',
      respondidaTs: new Date().toISOString(),
      leida:        true,
      leidaTs:      new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sugerencias/:id — solo superadmin
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin')
      return res.status(403).json({ error: 'Sin autorización' });
    await Sugerencia.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;