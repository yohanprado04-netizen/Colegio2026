/**
 * scripts/diagnostico401.js
 * Ejecutar con: node scripts/diagnostico401.js
 * Diagnostica las causas más comunes del error 401 en EduSistema Pro
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const jwt = require('jsonwebtoken');

console.log('\n🔍 DIAGNÓSTICO DE ERROR 401 — EduSistema Pro\n');
console.log('─'.repeat(50));

// 1. Verificar .env
console.log('\n1. Variables de entorno:');
const vars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'PORT', 'NODE_ENV'];
let envOk = true;
vars.forEach(v => {
  const val = process.env[v];
  if (!val) {
    console.log(`   ❌ ${v} → NO DEFINIDA`);
    envOk = false;
  } else {
    const display = v === 'MONGODB_URI'
      ? val.replace(/:([^:@]+)@/, ':***@')  // ocultar password
      : v === 'JWT_SECRET' ? '*** (definida)' : val;
    console.log(`   ✅ ${v} → ${display}`);
  }
});

if (!envOk) {
  console.log('\n   ⚠️  Faltan variables en .env. El servidor no funcionará correctamente.');
}

// 2. Verificar JWT_SECRET
console.log('\n2. JWT_SECRET:');
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.log('   ❌ JWT_SECRET no definido → usando fallback hardcodeado (inseguro en producción)');
} else if (secret === 'cualquier_clave_segura_aqui') {
  console.log('   ⚠️  JWT_SECRET tiene el valor por defecto. Cámbialo en producción por una clave aleatoria larga.');
  console.log('   → Genera una con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
} else if (secret.length < 32) {
  console.log('   ⚠️  JWT_SECRET es muy corto (< 32 caracteres). Usa al menos 64 caracteres aleatorios.');
} else {
  console.log('   ✅ JWT_SECRET configurado correctamente');
}

// 3. Test de generación/verificación de JWT
console.log('\n3. Test JWT (generar y verificar):');
try {
  const testSecret = secret || 'cualquier_clave_segura_aqui';
  const token = jwt.sign(
    { id: 'test_user', usuario: 'test', role: 'admin' },
    testSecret,
    { expiresIn: '1h' }
  );
  const decoded = jwt.verify(token, testSecret);
  console.log('   ✅ JWT generado y verificado correctamente');
  console.log(`   → Payload: id=${decoded.id}, role=${decoded.role}`);
} catch (err) {
  console.log('   ❌ Error en JWT:', err.message);
}

// 4. Verificar MONGODB_URI
console.log('\n4. Formato de MONGODB_URI:');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log('   ❌ MONGODB_URI no definida');
} else if (uri.startsWith('mongodb+srv://')) {
  console.log('   ✅ URI de MongoDB Atlas (mongodb+srv://)');
  if (uri.includes('retryWrites=true')) {
    console.log('   ✅ Parámetro retryWrites=true presente');
  } else {
    console.log('   ⚠️  Agrega ?retryWrites=true&w=majority a la URI para mejor confiabilidad');
  }
} else if (uri.startsWith('mongodb://')) {
  console.log('   ✅ URI MongoDB local (mongodb://)');
} else {
  console.log('   ❌ URI con formato inválido. Debe empezar con mongodb:// o mongodb+srv://');
}

// 5. Test de conexión a MongoDB
console.log('\n5. Test de conexión a MongoDB:');
if (!uri) {
  console.log('   ⏭  Saltando — MONGODB_URI no definida');
} else {
  const mongoose = require('mongoose');
  mongoose.connect(uri, {
    dbName: process.env.DB_NAME || 'edusistema',
    serverSelectionTimeoutMS: 8000,
  }).then(conn => {
    console.log(`   ✅ Conectado: ${conn.connection.host}`);
    console.log(`   ✅ Base de datos: ${conn.connection.name}`);
    mongoose.disconnect();
    printSummary();
  }).catch(err => {
    console.log(`   ❌ Error: ${err.message}`);
    if (err.message.includes('Authentication failed')) {
      console.log('   → Verifica usuario y contraseña en la URI');
    }
    if (err.message.includes('ENOTFOUND')) {
      console.log('   → No se puede resolver el host. Verifica tu conexión a internet');
    }
    printSummary();
  });
}

function printSummary() {
  console.log('\n' + '─'.repeat(50));
  console.log('📋 CAUSAS COMUNES DEL ERROR 401:');
  console.log('   1. JWT_SECRET diferente al generar vs al verificar el token');
  console.log('   2. Token no se envía en el header: Authorization: Bearer <token>');
  console.log('   3. Token expirado (por defecto 8h)');
  console.log('   4. Usuario eliminado de la BD después de obtener el token');
  console.log('   5. .env no se carga (líneas con texto sin = antes de MONGODB_URI)');
  console.log('   6. sessionStorage limpiada (token perdido en el frontend)');
  console.log('\n🔧 VERIFICA EN EL FRONTEND:');
  console.log('   - sessionStorage.getItem("edu_jwt") debe devolver el token');
  console.log('   - Las peticiones deben incluir: Authorization: Bearer <token>');
  console.log('\n');
}

// Si no hay MongoDB, imprimir resumen directamente
if (!uri) printSummary();
