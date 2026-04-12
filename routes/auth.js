// routes/auth.js — Login / Logout
'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { Usuario, Bloqueo, Auditoria, Colegio } = require('../models');

const MAX_INTENTOS = 5;
const LOCKOUT_MS   = 30 * 60 * 1000;
const failedAttempts = {};

// Usamos siempre la misma variable para que sea consistente con auth.js
// 🔒 SECURITY: JWT_SECRET DEBE estar en variables de entorno de Render
// Si no está configurado en producción, el servidor no debe arrancar
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET no está configurado en producción. Servidor detenido.');
    process.exit(1);
  } else {
    console.warn('[SEC] ⚠️  JWT_SECRET no definido — usando clave de desarrollo. NO usar en producción.');
  }
}
const JWT_SECRET_FINAL = JWT_SECRET || 'dev_only_secret_cambiar_en_produccion';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

router.post('/login', async (req, res) => {
  try {
    // 🔒 SECURITY: Coercionar a string para prevenir NoSQL injection
    const usuario  = typeof req.body.usuario  === 'string' ? req.body.usuario.trim()  : '';
    const password = typeof req.body.password === 'string' ? req.body.password        : '';

    // 🔒 SECURITY: Forzar tipos string en login
    // Previene NoSQL injection: { usuario: { $gt: "" } } se convierte en "[object Object]"
    // que nunca matchea un usuario real, sin revelar información del error
    if (!usuario || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    // Verificar bloqueo temporal
    // Verificar si el colegio del usuario está activo (no aplica a superadmin)
    if (!['superadmin'].includes((await Usuario.findOne({ usuario }).select('role colegioId').lean())?.role)) {
      const userLight = await Usuario.findOne({ usuario }).select('role colegioId').lean();
      if (userLight?.colegioId) {
        const col = await Colegio.findOne({ id: userLight.colegioId }).select('activo').lean();
        if (col && !col.activo) {
          return res.status(403).json({ error: 'Tu institución está desactivada. Contacta al administrador.' });
        }
      }
    }

    const blk = await Bloqueo.findOne({ usuario, on: true });
    if (blk) {
      const elapsed = Date.now() - new Date(blk.ts).getTime();
      if (elapsed < LOCKOUT_MS) {
        const remaining = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(403).json({ error: `Cuenta bloqueada. Espera ${remaining} min.` });
      }
      // Desbloqueo automático al expirar
      blk.on = false;
      await blk.save();
    }

    const user = await Usuario.findOne({ usuario });
    if (!user) {
      // No revelar si el usuario existe o no
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Verificar contraseña (bcrypt primero, luego legacy sha256)
    const ok = await bcrypt.compare(password, user.password).catch(() => false);
    const sha256legacy = !ok && sha256Match(password, user.password);

    if (!ok && !sha256legacy) {
      failedAttempts[usuario] = (failedAttempts[usuario] || 0) + 1;

      // superadmin y admin nunca se bloquean automáticamente
      if (failedAttempts[usuario] >= MAX_INTENTOS && !['admin', 'superadmin'].includes(user.role)) {
        await Bloqueo.findOneAndUpdate(
          { usuario },
          { on: true, ts: new Date().toISOString() },
          { upsert: true }
        );
        await Auditoria.create({
          ts: new Date().toISOString(), uid: user.id || '?', who: usuario,
          role: user.role || '?', accion: `Cuenta bloqueada tras ${MAX_INTENTOS} intentos fallidos`,
          extra: '', colegioId: user.colegioId || ''
        });
        failedAttempts[usuario] = 0;
        return res.status(403).json({ error: 'Cuenta bloqueada tras 5 intentos. Contacta al administrador.' });
      }

      return res.status(401).json({
        error: `Credenciales incorrectas. Intento ${failedAttempts[usuario]} de ${MAX_INTENTOS}.`
      });
    }

    // Migrar contraseña legacy a bcrypt
    if (sha256legacy) {
      user.password = await bcrypt.hash(password, 12);
      await user.save();
    }

    // Resetear intentos fallidos
    failedAttempts[usuario] = 0;

    // Generar JWT con payload consistente con lo que auth.js espera
    const payload = {
      id:            user.id,
      usuario:       user.usuario,
      role:          user.role,
      nombre:        user.nombre,
      colegioId:     user.colegioId     || null,
      colegioNombre: user.colegioNombre || ''
    };

    const token = jwt.sign(payload, JWT_SECRET_FINAL, { expiresIn: JWT_EXPIRES_IN });

    // Devolver usuario sin datos sensibles
    const userData = user.toObject();
    delete userData.password;
    delete userData._id;
    delete userData.__v;

    res.json({ token, user: userData });
  } catch (err) {
    console.error('[auth/login] Error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/logout', (req, res) => {
  // El logout en JWT es del lado del cliente (limpiar sessionStorage)
  res.json({ ok: true });
});

// ─── Verificar si el token actual sigue siendo válido ───────────────
router.get('/verify', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'Token no provisto' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);

    const user = await Usuario.findOne({ $or: [{ id: decoded.id }, { usuario: decoded.usuario }] }).lean();
    if (!user) return res.status(401).json({ valid: false, error: 'Usuario no encontrado' });
    if (user.blocked) return res.status(403).json({ valid: false, error: 'Cuenta bloqueada' });

    const userData = { ...user };
    delete userData.password;
    delete userData._id;
    delete userData.__v;

    res.json({ valid: true, user: userData });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ valid: false, expired: true, error: 'Sesión expirada' });
    }
    return res.status(401).json({ valid: false, error: 'Token inválido' });
  }
});

// ─── Función de comparación legacy SHA256 ───────────────────────────
function sha256Match(raw, stored) {
  try {
    const SALT = 'EduSistema_v5_2026';
    const hash = crypto.createHash('sha256').update(SALT + raw).digest('hex');
    return hash === stored || raw === stored;
  } catch { return false; }
}

module.exports = router;