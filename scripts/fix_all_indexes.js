/**
 * fix_all_indexes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Elimina TODOS los índices legacy (single-field unique) que bloquean el
 * sistema multi-tenant. Afecta las colecciones: config, notas, salones, areas, materias.
 *
 * PROBLEMAS QUE RESUELVE:
 *   1. config   → index "key_1"          → bloquea guardar ext/dr/pers por colegio
 *   2. notas    → index "estId_1_anoLectivo_1" → bloquea notas de mismo est en 2 colegios
 *   3. salones  → index "nombre_1"        → bloquea crear salones en nuevos colegios
 *   4. areas    → crea índices multi-tenant si no existen
 *   5. materias → verifica índice compuesto con colegioId
 *
 * USO:
 *   node scripts/fix_all_indexes.js
 *
 * DRY-RUN (sin cambios):
 *   $env:DRY_RUN="true"; node scripts/fix_all_indexes.js   ← PowerShell
 *   DRY_RUN=true node scripts/fix_all_indexes.js           ← Linux/Mac
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌  Falta MONGO_URI en .env'); process.exit(1); }

const DRY_RUN = process.env.DRY_RUN === 'true';

// Índices a eliminar: { colección, nombre_del_índice, índice_correcto_que_debe_existir }
const FIXES = [
  {
    col:        'config',
    dropIndex:  'key_1',
    createIndex: { fields: { key: 1, colegioId: 1 }, options: { unique: true, name: 'key_1_colegioId_1' } },
    description: 'Config: key único sin colegioId → bloquea guardar ext/dr/pers/periodos por colegio',
  },
  {
    col:        'notas',
    dropIndex:  'estId_1_anoLectivo_1',
    createIndex: { fields: { estId: 1, anoLectivo: 1, colegioId: 1 }, options: { unique: true, name: 'estId_1_anoLectivo_1_colegioId_1' } },
    description: 'Notas: índice sin colegioId → bloquea guardar notas ("No matching document" al save())',
  },
  {
    col:        'salones',
    dropIndex:  'nombre_1',
    createIndex: { fields: { nombre: 1, colegioId: 1 }, options: { unique: true, name: 'nombre_1_colegioId_1' } },
    description: 'Salones: nombre único sin colegioId → bloquea crear salones en nuevos colegios',
  },
  {
    col:        'materias',
    dropIndex:  null, // no hay índice legacy a eliminar
    createIndex: { fields: { nombre: 1, ciclo: 1, colegioId: 1 }, options: { unique: true, name: 'nombre_1_ciclo_1_colegioId_1' } },
    description: 'Materias: índice compuesto multi-tenant (nombre+ciclo+colegioId)',
  },
];

// ── Configuración de índices para colecciones nuevas (areas) ─────────────────
// Estas colecciones no tienen índices legacy, solo necesitan crearse correctos.
const NEW_COL_INDEXES = [
  {
    col:         'areas',
    description: 'Áreas: colección nueva para agrupar materias por colegio',
    indexes: [
      { fields: { nombre: 1, ciclo: 1, colegioId: 1 }, options: { unique: true, name: 'nombre_1_ciclo_1_colegioId_1' } },
      { fields: { colegioId: 1 },                       options: { name: 'colegioId_1' } },
    ],
  },
];

// ── Índices de excusas: no UNIQUE, solo para búsqueda rápida ────────────────
const EXCUSAS_INDEXES = [
  {
    col:         'excusas',
    description: 'Excusas: índices para filtrar por colegio y por estudiante',
    indexes: [
      { fields: { colegioId: 1 },           options: { name: 'colegioId_1' } },
      { fields: { estId: 1, colegioId: 1 },  options: { name: 'estId_1_colegioId_1' } },
      { fields: { dest: 1, colegioId: 1 },   options: { name: 'dest_1_colegioId_1' } },
      { fields: { salon: 1, colegioId: 1 },  options: { name: 'salon_1_colegioId_1' } },
    ],
  },
];

async function fixCollection(fix) {
  const col = mongoose.connection.collection(fix.col);
  const indexes = await col.indexes();

  console.log(`\n📋  [${fix.col}] Índices actuales:`);
  indexes.forEach(i => console.log(`     - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${i.key ? JSON.stringify(i.key) : ''}`));

  // ── Eliminar índice problemático ─────────────────────────────────────────────
  const problematic = indexes.find(i => i.name === fix.dropIndex);
  if (problematic) {
    console.log(`\n  ⚠️   Índice problemático: "${fix.dropIndex}" → ${fix.description}`);
    if (!DRY_RUN) {
      try {
        await col.dropIndex(fix.dropIndex);
        console.log(`  🗑️   "${fix.dropIndex}" eliminado ✅`);
      } catch (e) {
        console.error(`  ❌  Error eliminando "${fix.dropIndex}": ${e.message}`);
      }
    } else {
      console.log(`  [DRY-RUN] Se eliminaría "${fix.dropIndex}"`);
    }
  } else {
    console.log(`\n  ✅  Índice "${fix.dropIndex}" no existe (ya fue eliminado o nunca existió)`);
  }

  // ── Crear índice correcto si no existe ───────────────────────────────────────
  const correctName = fix.createIndex.options.name;
  const correct = indexes.find(i => i.name === correctName);
  if (!correct) {
    console.log(`  ⚠️   Índice correcto "${correctName}" no existe. Creando...`);
    if (!DRY_RUN) {
      try {
        await col.createIndex(fix.createIndex.fields, fix.createIndex.options);
        console.log(`  ✅  "${correctName}" creado correctamente`);
      } catch (e) {
        if (e.code === 11000 || e.code === 85 || e.code === 86) {
          console.warn(`  ⚠️   No se pudo crear "${correctName}" (datos duplicados): ${e.message}`);
          console.log(`       → Ejecuta primero fix_salones_colegioId.js para limpiar docs huérfanos`);
        } else {
          console.error(`  ❌  Error creando "${correctName}": ${e.message}`);
        }
      }
    } else {
      console.log(`  [DRY-RUN] Se crearía índice ${JSON.stringify(fix.createIndex.fields)} UNIQUE`);
    }
  } else {
    console.log(`  ✅  Índice correcto "${correctName}" ya existe`);
  }
}

async function main() {
  console.log('\n🔧  fix_all_indexes.js — Limpieza de índices legacy multi-tenant');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (modificará índices en Atlas)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB Atlas');

  for (const fix of FIXES) {
    await fixCollection(fix);
  }

  // ── Colecciones nuevas (areas): crear índices si no existen ─────────────────
  console.log('\n\n🆕  Verificando índices de colecciones nuevas...');
  for (const entry of NEW_COL_INDEXES) {
    const col = mongoose.connection.collection(entry.col);
    let existingIdxs = [];
    try { existingIdxs = await col.indexes(); } catch (_) {}
    console.log(`\n  [${entry.col}] — ${entry.description}`);
    if (existingIdxs.length === 0) console.log('    (colección vacía o nueva)');
    else existingIdxs.forEach(i => console.log(`    - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));

    for (const idx of entry.indexes) {
      const ya = existingIdxs.find(i => i.name === idx.options.name);
      if (ya) {
        console.log(`  ✅  Índice "${idx.options.name}" ya existe`);
      } else {
        console.log(`  ⚠️   Creando índice "${idx.options.name}"...`);
        if (!DRY_RUN) {
          try {
            await col.createIndex(idx.fields, idx.options);
            console.log(`  ✅  Índice "${idx.options.name}" creado correctamente`);
          } catch (e) {
            console.error(`  ❌  Error: ${e.message}`);
          }
        } else {
          console.log(`  [DRY-RUN] Se crearía índice ${JSON.stringify(idx.fields)} ${idx.options.unique ? 'UNIQUE' : ''}`);
        }
      }
    }
  }

  // ── Migración: agregar areaNombre a materias que no lo tengan ─────────────────
  console.log('\n\n🔄  Migrando campo areaNombre en colección "materias"...');
  const colMat = mongoose.connection.collection('materias');
  const sinCampo = await colMat.countDocuments({ areaNombre: { $exists: false } });
  if (sinCampo > 0) {
    if (!DRY_RUN) {
      const res = await colMat.updateMany({ areaNombre: { $exists: false } }, { $set: { areaNombre: '' } });
      console.log(`  ✅  ${res.modifiedCount} materias actualizadas con areaNombre: ''`);
    } else {
      console.log(`  [DRY-RUN] Se actualizarían ${sinCampo} materias con areaNombre: ''`);
    }
  } else {
    console.log('  ✅  Todas las materias ya tienen el campo areaNombre');
  }

  // ── Reporte final ────────────────────────────────────────────────────────────
  console.log('\n\n📊  ESTADO FINAL DE ÍNDICES:');
  const todasCols = [...FIXES.map(f => f.col), ...NEW_COL_INDEXES.map(e => e.col)];
  const colsUnicas = [...new Set(todasCols)];
  for (const colName of colsUnicas) {
    const col = mongoose.connection.collection(colName);
    let indexes = [];
    try { indexes = await col.indexes(); } catch (_) {}
    console.log(`\n  [${colName}]`);
    if (!indexes.length) console.log('    (sin índices o colección vacía)');
    else indexes.forEach(i => console.log(`   - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
  }

  // ── Índices de excusas ──────────────────────────────────────────────────────
  console.log('\n\n🆕  Verificando índices de colección excusas...');
  for (const entry of EXCUSAS_INDEXES) {
    const col = mongoose.connection.collection(entry.col);
    let existingIdxs = [];
    try { existingIdxs = await col.indexes(); } catch (_) {}
    console.log(`\n  [${entry.col}] — ${entry.description}`);
    if (!existingIdxs.length) console.log('    (colección vacía o nueva)');
    else existingIdxs.forEach(i => console.log(`    - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
    for (const idx of entry.indexes) {
      const ya = existingIdxs.find(i => i.name === idx.options.name);
      if (ya) {
        console.log(`  ✅  "${idx.options.name}" ya existe`);
      } else {
        console.log(`  ⚠️   Creando "${idx.options.name}"...`);
        if (!DRY_RUN) {
          try {
            await col.createIndex(idx.fields, idx.options);
            console.log(`  ✅  "${idx.options.name}" creado`);
          } catch (e) { console.error(`  ❌  Error: ${e.message}`); }
        } else {
          console.log(`  [DRY-RUN] Se crearía ${JSON.stringify(idx.fields)}`);
        }
      }
    }
  }

  // ── Reporte: excusas sin colegioId (creadas antes del fix multi-tenant) ─────
  const colExc = mongoose.connection.collection('excusas');
  const sinColegio = await colExc.countDocuments({
    $or: [{ colegioId: { $exists: false } }, { colegioId: '' }, { colegioId: null }]
  });
  if (sinColegio > 0) {
    console.log(`\n  ℹ️   ${sinColegio} excusa(s) sin colegioId — visibles a todos los colegios hasta migración manual.`);
  } else {
    console.log('\n  ✅  Todas las excusas tienen colegioId');
  }

    await mongoose.disconnect();
  console.log('\n🏁  Listo. Reinicia el servidor en Render para aplicar los cambios.\n');
}

main().catch(err => {
  console.error('❌  Error fatal:', err.message);
  process.exit(1);
});