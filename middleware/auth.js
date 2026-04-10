// middleware/auth.js — Middleware de autenticación JWT
'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '937de67300b008518a38bb94b513681c7f3d6a1f522212011b188125c931344de15f323e61fab6f2d1b20b1dafaae7515a7d4a6d377a4f209ce64383dcf614ee';

/**
 * verifyToken — Verifica el JWT en el header Authorization
 */
function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no provisto' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada', expired: true });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * requireRole — Verifica que el usuario tenga el rol requerido
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };