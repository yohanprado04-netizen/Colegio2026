// fix_colegioId.js — Script de reparación ONE-TIME para corregir colegioId
// en TODOS los usuarios (estudiantes, profes, admins) en MongoDB Atlas.
//
// USO: node fix_colegioId.js
// Ejecutar UNA sola vez desde la raíz del proyecto.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const ATLAS_URI = process.env.MONGODB_URI ||
  'mongodb+srv://yohanprado04_db_user:pradera123@prado04.t4d8ob8.mongodb.net/edusistema?retryWrites=true&w=majority';

const SalonSchema = new mongoose.Schema({
  nombre: String, ciclo: String, colegioId: String, colegioNombre: String,
}, { collection: 'salones' });

const UsuarioSchema = new mongoose.Schema({
  id: String, nombre: String, usuario: String, role: String,
  colegioId: String, colegioNombre: String,
  salon: String, salones: [String],
}, { collection: 'usuarios' });

const ColegioSchema = new mongoose.Schema({
  id: String, nombre: String, activo: Boolean,
}, { collection: 'colegios' });

const Salon   = mongoose.model('Salon',   SalonSchema);
const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Colegio = mongoose.model('Colegio', ColegioSchema);

async function main() {
  console.log('🔌 Conectando a MongoDB Atlas...');
  await mongoose.connect(ATLAS_URI, { dbName: 'edusistema', serverSelectionTimeoutMS: 15000 });
  console.log('✅ Conectado\n');

  // Cargar todos los colegios
  const colegios = await Colegio.find().lean();
  console.log(`🏫 Colegios en Atlas: ${colegios.length}`);
  colegios.forEach(c => console.log(`   - ${c.id}  →  ${c.nombre}`));
  console.log('');

  let totalReparados = 0;

  for (const colegio of colegios) {
    const cid = colegio.id;
    const cnombre = colegio.nombre;

    // Obtener salones correctos de este colegio
    const salones = await Salon.find({ colegioId: cid }).lean();
    const salonNames = salones.map(s => s.nombre);

    if (!salonNames.length) {
      console.log(`⚠️  Colegio "${cnombre}" no tiene salones — omitiendo`);
      continue;
    }

    console.log(`\n🔍 Colegio: "${cnombre}" (${cid})`);
    console.log(`   Salones: ${salonNames.join(', ')}`);

    // ── Reparar estudiantes ───────────────────────────────────────────────
    // Buscar estudiantes cuyo salón pertenece a este colegio
    // pero cuyo colegioId es diferente (incorrecto)
    const estsConSalonCorrecto = await Usuario.find({
      role: 'est',
      salon: { $in: salonNames },
      colegioId: { $ne: cid },
    }).lean();

    if (estsConSalonCorrecto.length) {
      console.log(`   👨‍🎓 ${estsConSalonCorrecto.length} estudiantes con colegioId incorrecto → reparando...`);
      estsConSalonCorrecto.forEach(e =>
        console.log(`      Est: "${e.nombre}" salon="${e.salon}" colegioId_actual="${e.colegioId}" → "${cid}"`)
      );
      const r = await Usuario.updateMany(
        { _id: { $in: estsConSalonCorrecto.map(e => e._id) } },
        { $set: { colegioId: cid, colegioNombre: cnombre } }
      );
      console.log(`   ✅ Estudiantes reparados: ${r.modifiedCount}`);
      totalReparados += r.modifiedCount;
    } else {
      console.log(`   ✅ Estudiantes: OK (todos tienen colegioId correcto)`);
    }

    // ── Reparar profes ────────────────────────────────────────────────────
    const profsConSalonCorrecto = await Usuario.find({
      role: 'profe',
      salones: { $elemMatch: { $in: salonNames } },
      colegioId: { $ne: cid },
    }).lean();

    if (profsConSalonCorrecto.length) {
      console.log(`   👩‍🏫 ${profsConSalonCorrecto.length} profes con colegioId incorrecto → reparando...`);
      profsConSalonCorrecto.forEach(p =>
        console.log(`      Prof: "${p.nombre}" salones="${(p.salones||[]).join(',')}" colegioId_actual="${p.colegioId}" → "${cid}"`)
      );
      const r = await Usuario.updateMany(
        { _id: { $in: profsConSalonCorrecto.map(p => p._id) } },
        { $set: { colegioId: cid, colegioNombre: cnombre } }
      );
      console.log(`   ✅ Profes reparados: ${r.modifiedCount}`);
      totalReparados += r.modifiedCount;
    } else {
      console.log(`   ✅ Profes: OK`);
    }

    // ── Reparar admins ────────────────────────────────────────────────────
    const adminsIncorrectos = await Usuario.find({
      role: 'admin',
      colegioId: { $ne: cid },
      $or: [
        // Admin con nombre que contiene el nombre del colegio
        { colegioNombre: cnombre },
        // Admin cuyo usuario coincide con el patrón admin_<cid>
        { id: new RegExp(`admin.*${cid}`) },
      ]
    }).lean();

    if (adminsIncorrectos.length) {
      console.log(`   👤 ${adminsIncorrectos.length} admins con colegioId incorrecto → reparando...`);
      const r = await Usuario.updateMany(
        { _id: { $in: adminsIncorrectos.map(a => a._id) } },
        { $set: { colegioId: cid, colegioNombre: cnombre } }
      );
      console.log(`   ✅ Admins reparados: ${r.modifiedCount}`);
      totalReparados += r.modifiedCount;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Reparación completa. Total usuarios reparados: ${totalReparados}`);
  console.log('   Los usuarios ahora tienen su colegioId correcto.');
  console.log('   Reinicia el servidor para que los cambios surtan efecto.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});