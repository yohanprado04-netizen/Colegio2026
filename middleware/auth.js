// middleware/auth.js — Verificación de JWT
'use strict';
const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || '937de67300b008518a38bb94b513681c7f3d6a1f522212011b188125c931344de15f323e61fab6f2d1b20b1dafaae7515a7d4a6d377a4f209ce64383dcf614ee';

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: 'Token no provisto', code: 'NO_TOKEN' });
    }
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Formato de token inválido. Usa: Bearer <token>', code: 'BAD_FORMAT' });
    }

    const token = header.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Token vacío o inválido', code: 'EMPTY_TOKEN' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.', expired: true, code: 'TOKEN_EXPIRED' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Token inválido o manipulado', code: 'TOKEN_INVALID' });
      }
      return res.status(401).json({ error: 'Error verificando token', code: 'TOKEN_ERROR' });
    }

    const user = await Usuario.findOne({
      $or: [
        { id: decoded.id },
        { usuario: decoded.usuario }
      ]
    }).lean();

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado o eliminado', code: 'USER_NOT_FOUND' });
    }

    if (user.blocked) {
      return res.status(403).json({ error: 'Cuenta bloqueada. Contacta al administrador.', code: 'ACCOUNT_BLOCKED' });
    }

    req.user = user;
    req.colegioId = user.colegioId || null;
    next();
  } catch (err) {
    console.error('[auth] Error inesperado:', err.message);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

const verifyToken = authMiddleware;

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado', code: 'NOT_AUTHENTICATED' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Acceso no autorizado. Se requiere rol: ${roles.join(' o ')}`,
      code: 'FORBIDDEN'
    });
  }
  next();
};

const scopeFilter = (req) => {
  if (req.user.role === 'superadmin') return {};
  return { colegioId: req.user.colegioId };
};

module.exports = { authMiddleware, verifyToken, requireRole, scopeFilter };
