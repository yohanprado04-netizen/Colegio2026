// models/index.js — Todos los modelos de MongoDB para EduSistema Pro
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// USUARIO (admin, profe, estudiante — colección unificada)
// ─────────────────────────────────────────────────────────────────────────────
const UsuarioSchema = new Schema({
  // Identificación
  id:         { type: String, required: true, unique: true }, // id interno (est_xxx, prf_xxx, admin)
  nombre:     { type: String, required: true, trim: true },
  ti:         { type: String, default: '' },
  usuario:    { type: String, required: true, unique: true, trim: true },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['admin', 'profe', 'est'], required: true },
  blocked:    { type: Boolean, default: false },

  // Solo estudiantes
  salon:      { type: String, default: '' },
  registrado: { type: String, default: '' },

  // Solo profesores
  ciclo:         { type: String, enum: ['primaria', 'bachillerato', ''], default: '' },
  salones:       [{ type: String }],
  materias:      [{ type: String }],
  materia:       { type: String, default: '' },
  salonMaterias: { type: Schema.Types.Mixed, default: {} }, // { salon: [materias] }
}, { timestamps: true, collection: 'usuarios' });

// ─────────────────────────────────────────────────────────────────────────────
// SALÓN
// ─────────────────────────────────────────────────────────────────────────────
const SalonSchema = new Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
  ciclo:  { type: String, enum: ['primaria', 'bachillerato'], required: true },
  mats:   [{ type: String }], // materias propias del salón (vacío = usar globales)
}, { timestamps: true, collection: 'salones' });

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN GLOBAL (materias globales, periodos, rangos de fechas, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const ConfigSchema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { collection: 'config' });

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS  — tripartita por estudiante / periodo / materia
// ─────────────────────────────────────────────────────────────────────────────
const NotaEntradaSchema = new Schema({
  a: { type: Number, default: 0, min: 0, max: 5 }, // Aptitud 60%
  c: { type: Number, default: 0, min: 0, max: 5 }, // Actitud 20%
  r: { type: Number, default: 0, min: 0, max: 5 }, // Responsabilidad 20%
}, { _id: false });

const NotaPeriodoSchema = new Schema({
  periodo:     { type: String, required: true },
  materias:    { type: Map, of: NotaEntradaSchema, default: {} }, // { materia: {a,c,r} }
  disciplina:  { type: String, default: '' },
}, { _id: false });

const NotaSchema = new Schema({
  estId:       { type: String, required: true },
  anoLectivo:  { type: String, required: true, default: () => String(new Date().getFullYear()) },
  periodos:    [NotaPeriodoSchema],
  disciplina:  { type: String, default: '' },
}, { timestamps: true, collection: 'notas' });
NotaSchema.index({ estId: 1, anoLectivo: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA
// ─────────────────────────────────────────────────────────────────────────────
const AsistenciaSchema = new Schema({
  fecha:    { type: String, required: true },  // 'YYYY-MM-DD'
  salon:    { type: String, required: true },
  registros: [{
    estId:  { type: String, required: true },
    estado: { type: String, enum: ['presente', 'ausente', 'tarde'], default: 'presente' },
  }],
}, { timestamps: true, collection: 'asistencias' });
AsistenciaSchema.index({ fecha: 1, salon: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// EXCUSA
// ─────────────────────────────────────────────────────────────────────────────
const ExcusaSchema = new Schema({
  estId:    { type: String, required: true },
  enombre:  { type: String, required: true },
  salon:    { type: String, default: '' },
  fecha:    { type: String, required: true },
  dest:     { type: String, required: true },
  causa:    { type: String, required: true },
  desc:     { type: String, default: '' },
  leida:    { type: Boolean, default: false },
  ts:       { type: String, default: '' },
}, { timestamps: true, collection: 'excusas' });

// ─────────────────────────────────────────────────────────────────────────────
// CLASE VIRTUAL
// ─────────────────────────────────────────────────────────────────────────────
const VClaseSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  profId:      { type: String, required: true },
  profNombre:  { type: String, default: '' },
  materias:    { type: String, default: '' },
  salon:       { type: String, required: true },
  fecha:       { type: String, required: true },
  hora:        { type: String, required: true },
  link:        { type: String, required: true },
  desc:        { type: String, default: '' },
  ts:          { type: String, default: '' },
}, { timestamps: true, collection: 'vclases' });

// ─────────────────────────────────────────────────────────────────────────────
// TAREA / UPLOAD (archivo enviado por estudiante)
// ─────────────────────────────────────────────────────────────────────────────
const UploadSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  profId:      { type: String, default: '' },
  profNombre:  { type: String, default: '' },
  materia:     { type: String, required: true },
  periodo:     { type: String, required: true },
  nombre:      { type: String, required: true },   // filename
  desc:        { type: String, default: '' },
  fecha:       { type: String, required: true },
  size:        { type: Number, default: 0 },
  type:        { type: String, default: '' },
  dataUrl:     { type: String, default: '' },      // base64 — en prod usar URL a Storage
  revisado:    { type: Boolean, default: false },
  revisadoTs:  { type: String, default: '' },
}, { timestamps: true, collection: 'uploads' });

// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE RECUPERACIÓN (del profesor al estudiante)
// ─────────────────────────────────────────────────────────────────────────────
const PlanSchema = new Schema({
  id:           { type: String, required: true, unique: true },
  estId:        { type: String, required: true },
  estNombre:    { type: String, required: true },
  salon:        { type: String, required: true },
  materia:      { type: String, required: true },
  profId:       { type: String, required: true },
  profNombre:   { type: String, required: true },
  titulo:       { type: String, required: true },
  desc:         { type: String, default: '' },
  fechaLimite:  { type: String, default: '' },
  archNombre:   { type: String, default: '' },
  archDataUrl:  { type: String, default: '' },
  archType:     { type: String, default: '' },
  fecha:        { type: String, required: true },
  visto:        { type: Boolean, default: false },
  esSalon:      { type: Boolean, default: false },
  planId:       { type: String, default: '' },
  // Archivado
  archivado:    { type: Boolean, default: false },
  _periodo:     { type: String, default: '' },
  _archivedAt:  { type: String, default: '' },
}, { timestamps: true, collection: 'planes' });

// ─────────────────────────────────────────────────────────────────────────────
// RECUPERACIÓN (respuesta del estudiante)
// ─────────────────────────────────────────────────────────────────────────────
const RecuperacionSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  salon:       { type: String, default: '' },
  materia:     { type: String, required: true },
  profId:      { type: String, required: true },
  planId:      { type: String, default: '' },
  nombre:      { type: String, required: true },   // filename
  type:        { type: String, default: '' },
  dataUrl:     { type: String, default: '' },
  desc:        { type: String, default: '' },
  fecha:       { type: String, required: true },
  revisado:    { type: Boolean, default: false },
  revisadoTs:  { type: String, default: '' },
  ts:          { type: String, default: '' },
  // Archivado
  archivado:   { type: Boolean, default: false },
  _periodo:    { type: String, default: '' },
  _archivedAt: { type: String, default: '' },
}, { timestamps: true, collection: 'recuperaciones' });

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────
const AuditoriaSchema = new Schema({
  ts:    { type: String, required: true },
  uid:   { type: String, default: '' },
  who:   { type: String, default: '' },
  role:  { type: String, default: '' },
  est:   { type: String, default: '' },
  mat:   { type: String, default: '' },
  old:   { type: String, default: '' },
  nw:    { type: String, default: '' },
  ip:    { type: String, default: '' },
  // Campos adicionales de logAudit
  user:   { type: String, default: '' },
  accion: { type: String, default: '' },
  extra:  { type: String, default: '' },
}, { timestamps: true, collection: 'auditoria' });

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL ESTUDIANTE
// ─────────────────────────────────────────────────────────────────────────────
const EstHistSchema = new Schema({
  id:              { type: String, required: true, unique: true },
  nombre:          { type: String, required: true },
  ti:              { type: String, default: '' },
  salon:           { type: String, default: '' },
  registrado:      { type: String, default: '' },
  activo:          { type: Boolean, default: true },
  eliminado:       { type: String, default: '' },
  restaurado:      { type: String, default: '' },
  usuario:         { type: String, default: '' },
  password:        { type: String, default: '' },
  snapSalon:       { type: String, default: '' },
  snapMats:        [{ type: String }],
  snapDisciplina:  { type: String, default: '—' },
  snapNotas:       { type: Schema.Types.Mixed, default: {} },
  snapNotasPorAno: { type: Schema.Types.Mixed, default: {} },
  snapAsist:       { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'est_historial' });

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEOS DE USUARIO
// ─────────────────────────────────────────────────────────────────────────────
const BloqueoSchema = new Schema({
  usuario: { type: String, required: true, unique: true },
  on:      { type: Boolean, default: true },
  ts:      { type: String, default: '' },
}, { collection: 'bloqueos' });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  Usuario:      mongoose.model('Usuario',      UsuarioSchema),
  Salon:        mongoose.model('Salon',        SalonSchema),
  Config:       mongoose.model('Config',       ConfigSchema),
  Nota:         mongoose.model('Nota',         NotaSchema),
  Asistencia:   mongoose.model('Asistencia',   AsistenciaSchema),
  Excusa:       mongoose.model('Excusa',       ExcusaSchema),
  VClase:       mongoose.model('VClase',       VClaseSchema),
  Upload:       mongoose.model('Upload',       UploadSchema),
  Plan:         mongoose.model('Plan',         PlanSchema),
  Recuperacion: mongoose.model('Recuperacion', RecuperacionSchema),
  Auditoria:    mongoose.model('Auditoria',    AuditoriaSchema),
  EstHist:      mongoose.model('EstHist',      EstHistSchema),
  Bloqueo:      mongoose.model('Bloqueo',      BloqueoSchema),
};
