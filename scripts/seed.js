// scripts/seed.js — Datos iniciales EduSistema Pro — Adrián Quinto
// Uso: node scripts/seed.js
// ⚠️  Borra y recrea todos los datos existentes
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const connectDB = require('../config/db');
const { Usuario, Salon, Config, Nota, EstHist } = require('../models');

const SALT = 12;
const hash = (pwd) => bcrypt.hash(pwd, SALT);

async function seed() {
  await connectDB();
  console.log('🌱 Iniciando seed...\n');

  // ── Limpiar colecciones ──────────────────────────────────────────
  await Promise.all([
    Usuario.deleteMany({}),
    Salon.deleteMany({}),
    Config.deleteMany({}),
    Nota.deleteMany({}),
    EstHist.deleteMany({}),
  ]);
  console.log('🗑️  Colecciones limpiadas');

  const mP   = ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'];
  const mB   = ['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte'];
  const pers = ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'];
  const ano  = String(new Date().getFullYear());

  // ── Config ──────────────────────────────────────────────────────
  await Config.insertMany([
    { key: 'mP',        value: mP },
    { key: 'mB',        value: mB },
    { key: 'pers',      value: pers },
    { key: 'dr',        value: { s: '', e: '' } },
    { key: 'drPer',     value: {} },
    { key: 'ext',       value: { on: false, s: '', e: '' } },
    { key: 'anoActual', value: ano },
  ]);
  console.log('⚙️  Configuración creada');

  // ── Admin ────────────────────────────────────────────────────────
  // IMPORTANTE: todos los campos del schema deben estar presentes
  await Usuario.create({
    id:            'admin',
    nombre:        'Adrián Quinto',
    ti:            'CC-000001',
    usuario:       'admin',
    password:      await hash('admin123'),
    role:          'admin',
    blocked:       false,
    // campos de estudiante (vacíos para admin)
    salon:         '',
    registrado:    '',
    // campos de profesor (vacíos para admin)
    ciclo:         '',
    salones:       [],
    materias:      [],
    materia:       '',
    salonMaterias: {},
  });
  console.log('👤 Admin creado (usuario: admin / contraseña: admin123)');

  // ── Salones ──────────────────────────────────────────────────────
  const salones = [
    { nombre: '6A', ciclo: 'bachillerato', mats: [] },
    { nombre: '7B', ciclo: 'bachillerato', mats: [] },
    { nombre: '3C', ciclo: 'primaria',     mats: [] },
  ];
  await Salon.insertMany(salones);
  console.log(`🏫 ${salones.length} salones creados`);

  // ── Estudiantes ──────────────────────────────────────────────────
  const estudiantes = [];
  const estHist     = [];
  const notasArr    = [];
  const fecha       = new Date().toLocaleDateString('es-CO');

  for (let i = 1; i <= 10; i++) {
    const id    = `est${i}`;
    const salon = salones[i % 3].nombre;
    const ciclo = salones[i % 3].ciclo;
    const mats  = ciclo === 'primaria' ? mP : mB;

    estudiantes.push({
      id,
      nombre:        `Estudiante ${i}`,
      ti:            `TI-10000${i}`,
      usuario:       `est${i}`,
      password:      await hash(`est${i}123`),
      role:          'est',
      blocked:       false,
      salon,
      registrado:    fecha,
      ciclo:         '',
      salones:       [],
      materias:      [],
      materia:       '',
      salonMaterias: {},
    });

    estHist.push({
      id,
      nombre:     `Estudiante ${i}`,
      ti:         `TI-10000${i}`,
      salon,
      registrado: fecha,
      activo:     true,
      usuario:    `est${i}`,
    });

    const periodos = pers.map(p => ({
      periodo:   p,
      materias:  Object.fromEntries(mats.map(m => [m, { a: 0, c: 0, r: 0 }])),
      disciplina: '',
    }));
    notasArr.push({ estId: id, anoLectivo: ano, periodos, disciplina: '' });
  }

  await Usuario.insertMany(estudiantes);
  await EstHist.insertMany(estHist);
  await Nota.insertMany(notasArr);
  console.log(`🎓 ${estudiantes.length} estudiantes creados`);

  // ── Profesor ─────────────────────────────────────────────────────
  // El profesor se guarda en la colección "usuarios" con role: 'profe'
  await Usuario.create({
    id:            'prf_demo',
    nombre:        'Profesor Demo',
    ti:            'CC-123456',
    usuario:       'profe1',
    password:      await hash('profe123'),
    role:          'profe',
    blocked:       false,
    // campos de estudiante (vacíos para profe)
    salon:         '',
    registrado:    '',
    // campos de profesor
    ciclo:         'bachillerato',
    salones:       ['6A', '7B'],
    materias:      ['Matemáticas', 'Inglés'],
    materia:       'Matemáticas',
    salonMaterias: { '6A': ['Matemáticas'], '7B': ['Inglés'] },
  });
  console.log('👩‍🏫 Profesor Demo creado (usuario: profe1 / contraseña: profe123)');

  console.log('\n✅ Seed completado exitosamente');
  console.log('─────────────────────────────────────────');
  console.log('  Admin:   admin   / admin123');
  console.log('  Profe:   profe1  / profe123');
  console.log('  Estud.:  est1    / est1123  (hasta est10)');
  console.log('─────────────────────────────────────────');
  console.log('\n📋 TODOS los usuarios (admin, profe, estudiantes)');
  console.log('   están en la colección: usuarios');
  console.log('   separados por el campo: role\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en seed:', err.message);
  process.exit(1);
});