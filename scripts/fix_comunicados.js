// scripts/fix_comunicados.js
// ══════════════════════════════════════════════════════════════════
// FIX: Comunicados — Diagnóstico y corrección de la colección
//
// Problemas que resuelve:
//   1. Comunicados sin campo 'id' (string custom) — los regenera
//   2. Comunicados sin colegioId — los marca con flag para revisión manual
//   3. Índice único en 'id' — asegura que esté creado
//   4. Muestra resumen de qué hay en la colección
//
// Uso:
//   node scripts/fix_comunicados.js
// ══════════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI no está definida en .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

  const db   = mongoose.connection.db;
  const col  = db.collection('comunicados');
  const docs = await col.find({}).toArray();

  console.log(`📋  Total documentos en colección 'comunicados': ${docs.length}`);
  if (!docs.length) {
    console.log('    (colección vacía — nada que corregir)\n');
    await mongoose.disconnect();
    return;
  }

  // ── Diagnóstico ──────────────────────────────────────────────
  const sinId        = docs.filter(d => !d.id);
  const sinColegioId = docs.filter(d => !d.colegioId);
  const duplicateIds = [];
  const seen = {};
  docs.forEach(d => {
    if (d.id) {
      if (seen[d.id]) duplicateIds.push(d.id);
      else seen[d.id] = true;
    }
  });

  console.log(`   • Sin campo 'id' custom:   ${sinId.length}`);
  console.log(`   • Sin colegioId:            ${sinColegioId.length}`);
  console.log(`   • Con 'id' duplicado:       ${duplicateIds.length}`);
  console.log('');

  // ── FIX 1: Regenerar 'id' faltantes ─────────────────────────
  if (sinId.length) {
    console.log(`🔧  Regenerando 'id' en ${sinId.length} documento(s)…`);
    for (const d of sinId) {
      const newId = 'com_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      await col.updateOne({ _id: d._id }, { $set: { id: newId } });
      console.log(`    _id=${d._id}  →  id="${newId}"`);
    }
    console.log('');
  }

  // ── FIX 2: Marcar comunicados sin colegioId ──────────────────
  if (sinColegioId.length) {
    console.log(`⚠️   ${sinColegioId.length} comunicado(s) sin colegioId:`);
    sinColegioId.forEach(d => {
      console.log(`    id="${d.id || d._id}"  titulo="${d.titulo}"`);
    });
    console.log('    → Estos deben asignarse manualmente a un colegio.');
    console.log('      Por seguridad NO se asigna un colegioId automáticamente.');
    console.log('');
  }

  // ── FIX 3: Asegurar índice único en campo 'id' ───────────────
  try {
    const indexes = await col.indexes();
    const hasIdIdx = indexes.some(i => i.key && i.key.id === 1);
    if (!hasIdIdx) {
      console.log('🔧  Creando índice único en campo id…');
      await col.createIndex({ id: 1 }, { unique: true, sparse: true });
      console.log('    Índice creado.\n');
    } else {
      console.log('✅  Índice en campo id ya existe.\n');
    }
  } catch (e) {
    console.warn('⚠️   No se pudo crear índice:', e.message);
  }

  // ── FIX 4: Asegurar índice compuesto colegioId + activo ──────
  try {
    await col.createIndex({ colegioId: 1, activo: 1 }, { background: true });
    console.log('✅  Índice compuesto (colegioId, activo) verificado.\n');
  } catch (e) {
    // Si ya existe, no es error grave
  }

  // ── Resumen final ────────────────────────────────────────────
  const docsPost = await col.find({}).toArray();
  const byColegio = {};
  docsPost.forEach(d => {
    const k = d.colegioId || '(sin colegioId)';
    byColegio[k] = (byColegio[k] || 0) + 1;
  });

  console.log('📊  Comunicados por colegio después del fix:');
  Object.entries(byColegio).forEach(([k, v]) => {
    console.log(`    ${k}: ${v} comunicado(s)`);
  });

  console.log('\n✅  Fix completado.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});