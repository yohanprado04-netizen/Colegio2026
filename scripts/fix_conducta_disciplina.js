/**
 * fix_conducta_disciplina.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEMA QUE RESUELVE:
 *   Algunos documentos en la colección "notas" tienen los campos "disciplina"
 *   y "conducta" guardados SOLO en la raíz del documento (promedio global),
 *   pero NO dentro de cada objeto en el array "periodos[]".
 *
 *   Esto ocurre cuando el profesor calificó conducta/disciplina antes de que
 *   se actualizara el sistema para guardarlos por periodo.
 *
 *   El boletín busca: notas[periodo].disciplina — si no lo encuentra, no muestra
 *   la fila aunque el valor exista a nivel raíz.
 *
 * QUÉ HACE ESTE SCRIPT:
 *   Por cada documento en "notas" que tenga disciplina/conducta en la raíz
 *   pero que sus periodos NO tengan esos campos:
 *     → Distribuye el valor global a cada periodo que tenga materias calificadas
 *     → Recalcula el promedio global (queda igual, ya que todos los periodos
 *       tendrán el mismo valor como punto de partida)
 *
 * USO:
 *   node scripts/fix_conducta_disciplina.js
 *
 * DRY-RUN (ver qué cambiaría sin modificar nada):
 *   DRY_RUN=true node scripts/fix_conducta_disciplina.js          ← Linux/Mac
 *   $env:DRY_RUN="true"; node scripts/fix_conducta_disciplina.js  ← PowerShell
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
if (DRY_RUN) console.log('🔍  MODO DRY-RUN — no se hará ningún cambio\n');

// ─── Schema mínimo para leer/escribir ────────────────────────────────────────
const NotaSchema = new mongoose.Schema({
  estId:      String,
  anoLectivo: String,
  colegioId:  String,
  disciplina: { type: Number, default: null },
  conducta:   { type: Number, default: null },
  periodos: [{
    periodo:    String,
    materias:   mongoose.Schema.Types.Mixed,
    disciplina: { type: Number, default: null },
    conducta:   { type: Number, default: null },
    _id: false,
  }],
}, { collection: 'notas', strict: false });

const Nota = mongoose.model('Nota', NotaSchema);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function periodoTieneNotas(p) {
  const mats = p.materias instanceof Map
    ? [...p.materias.values()]
    : Object.values(p.materias || {});
  return mats.some(v => v && (v.a > 0 || v.c > 0 || v.r > 0));
}

function promedio(valores) {
  if (!valores.length) return null;
  return +(valores.reduce((s, v) => s + v, 0) / valores.length).toFixed(2);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

  // Buscar documentos que tienen disciplina o conducta en la raíz
  const docs = await Nota.find({
    $or: [
      { disciplina: { $ne: null, $exists: true } },
      { conducta:   { $ne: null, $exists: true } },
    ]
  }).lean();

  console.log(`📋  Total documentos con disciplina/conducta global: ${docs.length}\n`);

  let totalActualizados = 0;
  let totalSinCambios   = 0;

  for (const doc of docs) {
    const discGlobal = typeof doc.disciplina === 'number' && !isNaN(doc.disciplina) ? doc.disciplina : null;
    const condGlobal = typeof doc.conducta   === 'number' && !isNaN(doc.conducta)   ? doc.conducta   : null;

    if (discGlobal === null && condGlobal === null) { totalSinCambios++; continue; }

    // Verificar si algún periodo ya tiene los campos
    const periodosSinDisc = doc.periodos.filter(p =>
      periodoTieneNotas(p) && discGlobal !== null &&
      (p.disciplina === null || p.disciplina === undefined || isNaN(p.disciplina))
    );
    const periodosSinCond = doc.periodos.filter(p =>
      periodoTieneNotas(p) && condGlobal !== null &&
      (p.conducta === null || p.conducta === undefined || isNaN(p.conducta))
    );

    const necesitaUpdate = periodosSinDisc.length > 0 || periodosSinCond.length > 0;
    if (!necesitaUpdate) { totalSinCambios++; continue; }

    console.log(`🔧  Est: ${doc.estId} | Año: ${doc.anoLectivo} | Colegio: ${doc.colegioId}`);
    if (discGlobal !== null)
      console.log(`     Disciplina global: ${discGlobal} → distribuir a ${periodosSinDisc.length} periodo(s)`);
    if (condGlobal !== null)
      console.log(`     Conducta global: ${condGlobal} → distribuir a ${periodosSinCond.length} periodo(s)`);

    if (!DRY_RUN) {
      // Construir los periodos actualizados
      const periodosActualizados = doc.periodos.map(p => {
        const tieneNotas = periodoTieneNotas(p);
        const newP = { ...p };

        if (tieneNotas && discGlobal !== null &&
            (p.disciplina === null || p.disciplina === undefined || isNaN(p.disciplina))) {
          newP.disciplina = discGlobal;
        }
        if (tieneNotas && condGlobal !== null &&
            (p.conducta === null || p.conducta === undefined || isNaN(p.conducta))) {
          newP.conducta = condGlobal;
        }
        return newP;
      });

      // Recalcular promedios globales
      const discVals = periodosActualizados
        .filter(p => typeof p.disciplina === 'number' && !isNaN(p.disciplina))
        .map(p => p.disciplina);
      const condVals = periodosActualizados
        .filter(p => typeof p.conducta === 'number' && !isNaN(p.conducta))
        .map(p => p.conducta);

      const updatePayload = { periodos: periodosActualizados };
      if (discVals.length) updatePayload.disciplina = promedio(discVals);
      if (condVals.length) updatePayload.conducta   = promedio(condVals);

      await Nota.updateOne(
        { _id: doc._id },
        { $set: updatePayload }
      );
      console.log(`     ✔ Actualizado correctamente`);
    } else {
      console.log(`     ℹ️  (DRY-RUN) — se actualizaría`);
    }

    totalActualizados++;
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`✅  Documentos actualizados : ${totalActualizados}`);
  console.log(`⏭️  Documentos sin cambios  : ${totalSinCambios}`);
  if (DRY_RUN) console.log('\n⚠️  MODO DRY-RUN — ejecuta sin DRY_RUN=true para aplicar cambios.');
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});