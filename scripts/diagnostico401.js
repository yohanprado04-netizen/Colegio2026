/**
 * scripts/diagnostico401.js
 * Ejecutar con: node scripts/diagnostico401.js
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');

console.log('\n🔍 DIAGNÓSTICO DE ERROR 401 — EduSistema Pro\n');
console.log('─'.repeat(55));

// 1. Variables de entorno
console.log('\n1. Variables de entorno:');
const vars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'PORT', 'NODE_ENV'];
vars.forEach(v => {
  const val = process.env[v];
  if (!val) {
    console.log(`   ❌ ${v} → NO DEFINIDA`);
  } else {
    const display = v === 'MONGODB_URI'
      ? val.replace(/:([^:@/]+)@/, ':***@')
      : v === 'JWT_SECRET'
        ? `(${val.length} caracteres) ✓`
        : val;
    console.log(`   ✅ ${v} → ${display}`);
  }
});

// 2. JWT_SECRET
console.log('\n2. JWT_SECRET:');
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.log('   ❌ No definido → usando fallback inseguro');
} else if (secret === 'cualquier_clave_segura_aqui') {
  console.log('   ⚠️  Valor por defecto. Genera uno seguro con: npm run gen-secret');
} else if (secret.length < 32) {
  console.log(`   ⚠️  Muy corto (${secret.length} chars). Usa al menos 64 caracteres aleatorios.`);
} else {
  console.log(`   ✅ Seguro (${secret.length} caracteres)`);
}

// 3. Test JWT
console.log('\n3. Test JWT:');
try {
  const testSecret = secret || 'fallback';
  const token = jwt.sign({ id: 'test', usuario: 'test', role: 'admin' }, testSecret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, testSecret);
  console.log(`   ✅ Generación y verificación correctas (id=${decoded.id})`);
} catch (err) {
  console.log(`   ❌ Error JWT: ${err.message}`);
}

// 4. MongoDB URI
console.log('\n4. MONGODB_URI:');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.log('   ❌ No definida');
} else if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
  console.log('   ❌ Formato inválido. Debe empezar con mongodb:// o mongodb+srv://');
} else {
  const match = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)/);
  if (match) {
    console.log(`   ✅ Formato correcto`);
    console.log(`   → Usuario: ${match[1]}`);
    console.log(`   → Host:    ${match[3]}`);
    console.log(`   → Contraseña: ${'*'.repeat(Math.min(match[2].length, 8))} (${match[2].length} caracteres)`);
  }
}

// 5. Test conexión MongoDB
console.log('\n5. Test conexión a MongoDB:');
if (!uri) {
  console.log('   ⏭  Saltando — MONGODB_URI no definida');
  printSummary();
} else {
  const mongoose = require('mongoose');
  mongoose.connect(uri, {
    dbName: process.env.DB_NAME || 'edusistema',
    serverSelectionTimeoutMS: 10000,
  }).then(conn => {
    console.log(`   ✅ Conexión exitosa`);
    console.log(`   → Host: ${conn.connection.host}`);
    console.log(`   → BD:   ${conn.connection.name}`);
    mongoose.disconnect();
    printSummary(true);
  }).catch(err => {
    console.log(`   ❌ Error: ${err.message}`);
    if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.log('\n   ══ SOLUCIÓN "bad auth" ══════════════════════════════');
      console.log('   El usuario/contraseña en MONGODB_URI no son correctos.');
      console.log('   Sigue estos pasos:');
      console.log('');
      console.log('   PASO 1 — Verifica el usuario en Atlas:');
      console.log('     1. Entra a https://cloud.mongodb.com');
      console.log('     2. Menú izquierdo → "Database Access"');
      console.log('     3. Busca el usuario en la lista');
      console.log('        • Si NO existe → crea uno nuevo con "Add New Database User"');
      console.log('          Role: "Atlas admin" o "Read and write to any database"');
      console.log('        • Si SÍ existe → haz clic en "Edit" → "Edit Password"');
      console.log('          → escribe una contraseña nueva sin caracteres especiales');
      console.log('          → copia esa contraseña exacta');
      console.log('');
      console.log('   PASO 2 — Actualiza el .env:');
      console.log('     Abre el archivo .env y reemplaza la contraseña:');
      console.log('     MONGODB_URI=mongodb+srv://USUARIO:NUEVA_CONTRASEÑA@prado04.t4d8ob8.mongodb.net/edusistema?retryWrites=true&w=majority&appName=prado04');
      console.log('');
      console.log('   PASO 3 — Verifica Network Access:');
      console.log('     1. En Atlas → "Network Access"');
      console.log('     2. Agrega tu IP actual, o pon 0.0.0.0/0 (cualquier IP) para desarrollo');
      console.log('');
      console.log('   PASO 4 — Vuelve a correr: node scripts/diagnostico401.js');
      console.log('   ═══════════════════════════════════════════════════════');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.log('   → Sin conexión a internet o el host no existe.');
      console.log('   → Verifica tu conexión y el nombre del cluster en la URI.');
    } else if (err.message.includes('IP') || err.message.includes('whitelist')) {
      console.log('   → Tu IP no está en la lista blanca de Atlas.');
      console.log('   → En Atlas → Network Access → Add IP Address → Add Current IP');
    }
    printSummary(false);
  });
}

function printSummary(connected) {
  console.log('\n' + '─'.repeat(55));
  if (connected === true) {
    console.log('🎉 Todo OK — el servidor debería funcionar sin errores 401');
    console.log('   Ejecuta: npm run dev\n');
  } else if (connected === false) {
    console.log('🔧 Aún hay problemas. Sigue las instrucciones de arriba.');
    console.log('   Después de corregir el .env, corre de nuevo: npm run diagnostico\n');
  } else {
    console.log('📋 Revisa los puntos marcados con ❌ o ⚠️ arriba.\n');
  }
}
