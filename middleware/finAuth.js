// middleware/finAuth.js — Protege las rutas del módulo financiero
// Solo permite acceso a tokens con role 'finAdmin' o 'finUser'.
'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_secret_cambiar_en_produccion';

module.exports = function finAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token financiero no provisto' });

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Solo roles financieros pueden acceder
    if (!['finAdmin', 'finUser'].includes(decoded.role))
      return res.status(403).json({ error: 'Acceso denegado: se requiere rol financiero' });

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Sesión financiera expirada', expired: true });
    return res.status(401).json({ error: 'Token financiero inválido' });
  }
};