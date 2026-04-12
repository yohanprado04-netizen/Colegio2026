/**
 * setup_areas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Migración única para el sistema de Áreas.
 * Ejecutar UNA SOLA VEZ después de desplegar el código con el modelo Area.
 *
 * QUÉ HACE:
 *   1. Agrega el campo `areaNombre: ''` a todas las materias existentes
 *      que no lo tengan (no toca las que ya lo tienen).
 *   2. Crea la colección `areas` con sus índices correctos multi-tenant.
 *   3. Verifica que el índice de `materias` esté correcto.
 *
 * USO:
 *   node scripts/setup_areas.js
 *
 * DRY-RUN (solo muestra qué haría, sin cambios):
 *   DRY_RUN=true node scripts/setup_areas.js          ← Linux/Mac
 *   $env:DRY_RUN="true"; node scripts/setup_areas.js  ← PowerShell
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  Falta MONGO_URI en .env');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log('\n🔧  setup_areas.js — Migración del sistema de Áreas');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (modificará datos en Atlas)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB Atlas\n');

  // ── 1. AGREGAR areaNombre A MATERIAS EXISTENTES ──────────────────────────────
  console.log('📚  [1/3] Actualizando colección "materias" — agregando campo areaNombre...');
  const colMaterias = mongoose.connection.collection('materias');

  const totalMaterias = await colMaterias.countDocuments({});
  const sinAreaNombre = await colMaterias.countDocuments({ areaNombre: { $exists: false } });
  const yaConCampo   = totalMaterias - sinAreaNombre;

  console.log(`     Total materias:        ${totalMaterias}`);
  console.log(`     Ya tienen areaNombre:  ${yaConCampo}`);
  console.log(`     Sin areaNombre:        ${sinAreaNombre}`);

  if (sinAreaNombre > 0) {
    if (!DRY_RUN) {
      const result = await colMaterias.updateMany(
        { areaNombre: { $exists: false } },
        { $set: { areaNombre: '' } }
      );
      console.log(`  ✅  ${result.modifiedCount} materias actualizadas con areaNombre: ''\n`);
    } else {
      console.log(`  [DRY-RUN] Se actualizarían ${sinAreaNombre} materias con areaNombre: ''\n`);
    }
  } else {
    console.log('  ✅  Todas las materias ya tienen el campo areaNombre\n');
  }

  // ── 2. CREAR COLECCIÓN areas CON ÍNDICES CORRECTOS ───────────────────────────
  console.log('📂  [2/3] Configurando colección "areas"...');
  const colAreas = mongoose.connection.collection('areas');

  // Verificar si ya existe la colección
  const collections = await mongoose.connection.db.listCollections({ name: 'areas' }).toArray();
  const existeAreas = collections.length > 0;

  if (!existeAreas) {
    console.log('     Colección "areas" no existe — se creará al insertar el primer documento.');
  } else {
    const totalAreas = await colAreas.countDocuments({});
    console.log(`     Colección "areas" existe — ${totalAreas} áreas registradas.`);
  }

  // Índices necesarios para areas
  const indicesAreas = await (existeAreas ? colAreas.indexes() : Promise.resolve([]));
  console.log('     Índices actuales en "areas":');
  if (indicesAreas.length === 0) {
    console.log('       (ninguno — colección nueva o vacía)');
  } else {
    indicesAreas.forEach(i => console.log(`       - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
  }

  // Índice compuesto único: nombre + ciclo + colegioId (multi-tenant)
  const nombreIdx = 'nombre_1_ciclo_1_colegioId_1';
  const tieneIdx  = indicesAreas.some(i => i.name === nombreIdx);

  if (!tieneIdx) {
    console.log(`\n  ⚠️   Falta índice "${nombreIdx}" en "areas". Creando...`);
    if (!DRY_RUN) {
      try {
        await colAreas.createIndex(
          { nombre: 1, ciclo: 1, colegioId: 1 },
          { unique: true, name: nombreIdx }
        );
        console.log(`  ✅  Índice "${nombreIdx}" creado correctamente`);
      } catch (e) {
        console.error(`  ❌  Error creando índice: ${e.message}`);
      }
    } else {
      console.log(`  [DRY-RUN] Se crearía índice { nombre:1, ciclo:1, colegioId:1 } UNIQUE`);
    }
  } else {
    console.log(`\n  ✅  Índice "${nombreIdx}" ya existe en "areas"`);
  }

  // Índice simple: colegioId (para filtros por tenant)
  const cidIdx    = 'colegioId_1';
  const tieneCid  = indicesAreas.some(i => i.name === cidIdx);
  if (!tieneCid) {
    console.log(`  ⚠️   Falta índice "${cidIdx}" en "areas". Creando...`);
    if (!DRY_RUN) {
      try {
        await colAreas.createIndex({ colegioId: 1 }, { name: cidIdx });
        console.log(`  ✅  Índice "${cidIdx}" creado correctamente\n`);
      } catch (e) {
        console.error(`  ❌  Error creando índice colegioId: ${e.message}\n`);
      }
    } else {
      console.log(`  [DRY-RUN] Se crearía índice { colegioId:1 }\n`);
    }
  } else {
    console.log(`  ✅  Índice "${cidIdx}" ya existe en "areas"\n`);
  }

  // ── 3. VERIFICAR ÍNDICES DE materias ─────────────────────────────────────────
  console.log('🔍  [3/3] Verificando índices de colección "materias"...');
  const idxMat = await colMaterias.indexes();
  console.log('     Índices actuales:');
  idxMat.forEach(i => console.log(`       - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));

  // El índice correcto debe ser nombre+ciclo+colegioId
  const matIdx = 'nombre_1_ciclo_1_colegioId_1';
  const tieneMatIdx = idxMat.some(i => i.name === matIdx);
  if (!tieneMatIdx) {
    console.log(`\n  ⚠️   Falta índice "${matIdx}" en "materias". Creando...`);
    if (!DRY_RUN) {
      try {
        await colMaterias.createIndex(
          { nombre: 1, ciclo: 1, colegioId: 1 },
          { unique: true, name: matIdx }
        );
        console.log(`  ✅  Índice "${matIdx}" creado en "materias"\n`);
      } catch (e) {
        console.error(`  ❌  Error: ${e.message}\n`);
      }
    } else {
      console.log(`  [DRY-RUN] Se crearía índice { nombre:1, ciclo:1, colegioId:1 } UNIQUE\n`);
    }
  } else {
    console.log(`\n  ✅  Índice "${matIdx}" ya existe en "materias"\n`);
  }

  // ── REPORTE FINAL ─────────────────────────────────────────────────────────────
  console.log('\n📊  ESTADO FINAL:');

  const matFinal = await colMaterias.indexes();
  console.log('\n  [materias]');
  matFinal.forEach(i => console.log(`   - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
  const sinArea2 = await colMaterias.countDocuments({ areaNombre: { $exists: false } });
  console.log(`   Campo areaNombre faltante: ${sinArea2} docs (debe ser 0)`);

  const areasFinal = await colAreas.indexes().catch(() => []);
  console.log('\n  [areas]');
  if (areasFinal.length === 0) {
    console.log('   (colección vacía — los índices se crearán al primer insert)');
  } else {
    areasFinal.forEach(i => console.log(`   - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
  }

  await mongoose.disconnect();
  console.log('\n🏁  Migración completada. Reinicia el servidor para aplicar los cambios.\n');
}

main().catch(err => {
  console.error('❌  Error fatal:', err.message);
  process.exit(1);
});