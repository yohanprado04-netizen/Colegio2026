// scripts/seed.js — Datos iniciales EduSistema Pro
// Uso: node scripts/seed.js
// ⚠️  Borra y recrea todos los datos existentes
require('dotenv').config();
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const connectDB = require('../config/db');
const {
  Usuario, Colegio, Salon, Config,
  Nota, EstHist
} = require('../models');

const SALT = 12;
const hash = (pwd) => bcrypt.hash(pwd, SALT);

async function seed() {
  await connectDB();
  console.log('🌱 Iniciando seed...\n');

  // ── Limpiar colecciones ──────────────────────────────────────────
  await Promise.all([
    Usuario.deleteMany({}),
    Colegio.deleteMany({}),
    Salon.deleteMany({}),
    Config.deleteMany({}),
    Nota.deleteMany({}),
    EstHist.deleteMany({}),
  ]);
  console.log('🗑️  Colecciones limpiadas');

  // ── Super Admin ─────────────────────────────────────────────────
  await Usuario.create({
    id:            'superadmin',
    nombre:        'Super Administrador',
    ti:            '',
    usuario:       'superadmin',
    password:      await hash('superadmin123'),
    role:          'superadmin',
    blocked:       false,
    colegioId:     null,
    colegioNombre: '',
    salon:         '',
    registrado:    '',
    ciclo:         '',
    salones:       [],
    materias:      [],
    materia:       '',
    salonMaterias: {},
  });
  console.log('🌐 Super Admin creado (usuario: superadmin / contraseña: superadmin123)');

  // ── Colegio Demo ─────────────────────────────────────────────────
  const colegioId    = 'col_demo';
  const colegioNombre = 'Colegio Demo';
  await Colegio.create({
    id:        colegioId,
    nombre:    colegioNombre,
    codigo:    'DEMO-001',
    direccion: 'Calle 1 # 2-3',
    telefono:  '3001234567',
    sedes:     ['Principal'],
    jornadas:  ['Mañana', 'Tarde'],
    activo:    true,
    createdBy: 'superadmin',
  });
  console.log(`🏫 Colegio Demo creado (id: ${colegioId})`);

  const mP   = ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'];
  const mB   = ['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte'];
  const pers = ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'];
  const ano  = String(new Date().getFullYear());

  // ── Config del colegio demo ──────────────────────────────────────
  await Config.insertMany([
    { key: 'mP',        value: mP,                      colegioId },
    { key: 'mB',        value: mB,                      colegioId },
    { key: 'pers',      value: pers,                    colegioId },
    { key: 'dr',        value: { s: '', e: '' },        colegioId },
    { key: 'drPer',     value: {},                      colegioId },
    { key: 'ext',       value: { on: false, s:'',e:'' },colegioId },
    { key: 'anoActual', value: ano,                     colegioId },
  ]);
  console.log('⚙️  Configuración del colegio demo creada');

  // ── Admin del colegio demo ───────────────────────────────────────
  await Usuario.create({
    id:            'admin_demo',
    nombre:        'Admin Demo',
    ti:            'CC-000001',
    usuario:       'admin',
    password:      await hash('admin123'),
    role:          'admin',
    blocked:       false,
    colegioId,
    colegioNombre,
    salon:         '',
    registrado:    '',
    ciclo:         '',
    salones:       [],
    materias:      [],
    materia:       '',
    salonMaterias: {},
  });
  console.log('👤 Admin creado (usuario: admin / contraseña: admin123)');

  // ── Salones del colegio demo ─────────────────────────────────────
  const salones = [
    { nombre: '6A', ciclo: 'bachillerato', mats: [], colegioId },
    { nombre: '7B', ciclo: 'bachillerato', mats: [], colegioId },
    { nombre: '3C', ciclo: 'primaria',     mats: [], colegioId },
  ];
  await Salon.insertMany(salones);
  console.log(`🏫 ${salones.length} salones creados`);

  // ── Estudiantes ──────────────────────────────────────────────────
  const estudiantes = [];
  const estHist     = [];
  const notasArr    = [];
  const fecha       = new Date().toLocaleDateString('es-CO');

  for (let i = 1; i <= 10; i++) {
    const id    = `est${i}_${colegioId}`;
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
      colegioId,
      colegioNombre,
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
      colegioId,
    });

    const periodos = pers.map(p => ({
      periodo:   p,
      materias:  Object.fromEntries(mats.map(m => [m, { a: 0, c: 0, r: 0 }])),
      disciplina: '',
    }));
    notasArr.push({ estId: id, anoLectivo: ano, periodos, disciplina: '', colegioId });
  }

  await Usuario.insertMany(estudiantes);
  await EstHist.insertMany(estHist);
  await Nota.insertMany(notasArr);
  console.log(`🎓 ${estudiantes.length} estudiantes creados`);

  // ── Profesor ─────────────────────────────────────────────────────
  await Usuario.create({
    id:            'prf_demo',
    nombre:        'Profesor Demo',
    ti:            'CC-123456',
    usuario:       'profe1',
    password:      await hash('profe123'),
    role:          'profe',
    blocked:       false,
    colegioId,
    colegioNombre,
    salon:         '',
    registrado:    '',
    ciclo:         'bachillerato',
    salones:       ['6A', '7B'],
    materias:      ['Matemáticas', 'Inglés'],
    materia:       'Matemáticas',
    salonMaterias: { '6A': ['Matemáticas'], '7B': ['Inglés'] },
  });
  console.log('👩‍🏫 Profesor Demo creado (usuario: profe1 / contraseña: profe123)');

  console.log('\n✅ Seed completado exitosamente');
  console.log('─────────────────────────────────────────');
  console.log('  SuperAdmin: superadmin / superadmin123');
  console.log('  Admin:      admin      / admin123');
  console.log('  Profe:      profe1     / profe123');
  console.log('  Estud.:     est1       / est1123  (hasta est10)');
  console.log('─────────────────────────────────────────');
  console.log('\n  El superadmin ve TODOS los colegios.');
  console.log('  admin/profe/est ven solo su colegioId.\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en seed:', err.message);
  process.exit(1);
});
