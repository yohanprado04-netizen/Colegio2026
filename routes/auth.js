// routes/auth.js — Login / Logout
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { Usuario, Bloqueo, Auditoria } = require('../models');

const MAX_INTENTOS = 5;
const LOCKOUT_MS   = 30 * 60 * 1000;
const failedAttempts = {};

router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const blk = await Bloqueo.findOne({ usuario, on: true });
    if (blk) {
      const elapsed = Date.now() - new Date(blk.ts).getTime();
      if (elapsed < LOCKOUT_MS) {
        const remaining = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(403).json({ error: `Cuenta bloqueada. Espera ${remaining} min.` });
      }
      blk.on = false;
      await blk.save();
    }

    const user = await Usuario.findOne({ usuario });
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await bcrypt.compare(password, user.password).catch(() => false);
    const sha256legacy = !ok && sha256Match(password, user.password);

    if (!ok && !sha256legacy) {
      failedAttempts[usuario] = (failedAttempts[usuario] || 0) + 1;
      // superadmin y admin nunca se bloquean automáticamente
      if (failedAttempts[usuario] >= MAX_INTENTOS && !['admin','superadmin'].includes(user.role)) {
        await Bloqueo.findOneAndUpdate(
          { usuario },
          { on: true, ts: new Date().toISOString() },
          { upsert: true }
        );
        await Auditoria.create({
          ts: new Date().toISOString(), uid: '?', who: usuario,
          role: '?', accion: `Cuenta bloqueada tras ${MAX_INTENTOS} intentos fallidos`, extra: '',
          colegioId: user.colegioId || ''
        });
        return res.status(403).json({ error: 'Cuenta bloqueada tras 5 intentos.' });
      }
      return res.status(401).json({
        error: `Credenciales incorrectas. Intento ${failedAttempts[usuario]} de ${MAX_INTENTOS}.`
      });
    }

    if (sha256legacy) {
      user.password = await bcrypt.hash(password, 12);
      await user.save();
    }

    failedAttempts[usuario] = 0;

    const payload = {
      id:           user.id,
      role:         user.role,
      nombre:       user.nombre,
      colegioId:    user.colegioId   || null,
      colegioNombre:user.colegioNombre || ''
    };
   // Forzamos el uso de la clave del .env o la de seguridad
   const secret = process.env.JWT_SECRET || 'cualquier_clave_segura_aqui';
const token = jwt.sign(payload, secret, { expiresIn: '8h' });
    const userData = user.toObject();
    delete userData.password;
    delete userData._id;

    res.json({ token, user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/logout', async (req, res) => {
  res.json({ ok: true });
});

function sha256Match(raw, stored) {
  try {
    const SALT = 'EduSistema_v5_2026';
    const hash = crypto.createHash('sha256').update(SALT + raw).digest('hex');
    return hash === stored || raw === stored;
  } catch { return false; }
}

module.exports = router;
