// models/index.js
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ColegioSchema = new Schema({
  id:        { type: String, required: true, unique: true },
  nombre:    { type: String, required: true, trim: true },
  nit:       { type: String, required: true, unique: true, trim: true },
  direccion: { type: String, default: '' },
  telefono:  { type: String, default: '' },
  logo:      { type: String, default: '' },
  activo:    { type: Boolean, default: true },
  sedes:     [{ type: String }],
  jornadas:  [{ type: String }],
  createdBy: { type: String, default: 'superadmin' },
}, { timestamps: true, collection: 'colegios' });

const UsuarioSchema = new Schema({
  id:            { type: String, required: true, unique: true },
  nombre:        { type: String, required: true, trim: true },
  ti:            { type: String, default: '' },
  usuario:       { type: String, required: true, unique: true, trim: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ['superadmin','admin','profe','est'], required: true },
  blocked:       { type: Boolean, default: false },
  colegioId:     { type: String, default: null, index: true },
  colegioNombre: { type: String, default: '' },
  salon:         { type: String, default: '' },
  registrado:    { type: String, default: '' },
  ciclo:         { type: String, enum: ['primaria','bachillerato',''], default: '' },
  salones:       [{ type: String }],
  materias:      [{ type: String }],
  materia:       { type: String, default: '' },
  salonMaterias: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'usuarios' });
UsuarioSchema.index({ colegioId: 1, role: 1 });

const SalonSchema = new Schema({
  nombre:        { type: String, required: true, trim: true },
  ciclo:         { type: String, enum: ['primaria','bachillerato'], required: true },
  jornada:       { type: String, enum: ['mañana','tarde','noche',''], default: '' },
  mats:          [{ type: String }],
  colegioId:     { type: String, required: true, index: true },
  colegioNombre: { type: String, default: '' },   // nombre del colegio al que pertenece
}, { timestamps: true, collection: 'salones' });
SalonSchema.index({ nombre: 1, colegioId: 1 }, { unique: true });

// ─── ÁREAS POR COLEGIO ──────────────────────────────────────────────────────
// Cada área agrupa una o más materias. El admin define las áreas y asigna materias.
// La definitiva del área = promedio de definitivas de sus materias.
// Para ganar/perder/recuperar el año se evalúan las áreas, no las materias individuales.
const AreaSchema = new Schema({
  nombre:    { type: String, required: true, trim: true },
  ciclo:     { type: String, enum: ['primaria', 'bachillerato'], required: true },
  colegioId: { type: String, required: true, index: true },
  colegioNombre: { type: String, default: '' },
  orden:     { type: Number, default: 0 },
}, { timestamps: true, collection: 'areas' });
AreaSchema.index({ nombre: 1, ciclo: 1, colegioId: 1 }, { unique: true });

// ─── MATERIAS POR COLEGIO ────────────────────────────────────────────────────
// Colección dedicada para materias de primaria y bachillerato por colegio.
// Reemplaza el uso de config {key:'mP'} y {key:'mB'} que causaban E11000.
const MateriaSchema = new Schema({
  nombre:    { type: String, required: true, trim: true },
  ciclo:     { type: String, enum: ['primaria', 'bachillerato'], required: true },
  colegioId: { type: String, required: true, index: true },
  colegioNombre: { type: String, default: '' },
  orden:     { type: Number, default: 0 },
  areaNombre: { type: String, default: '' }, // nombre del área a la que pertenece esta materia
}, { timestamps: true, collection: 'materias' });
MateriaSchema.index({ nombre: 1, ciclo: 1, colegioId: 1 }, { unique: true });

const ConfigSchema = new Schema({
  key:       { type: String, required: true },
  value:     { type: Schema.Types.Mixed, required: true },
  colegioId: { type: String, default: 'global' },
}, { collection: 'config' });
ConfigSchema.index({ key: 1, colegioId: 1 }, { unique: true });

const PlanEstudiosSchema = new Schema({
  colegioId:  { type: String, required: true, index: true },
  ciclo:      { type: String, enum: ['primaria','bachillerato'], required: true },
  grado:      { type: String, required: true },
  area:       { type: String, required: true },
  asignatura: { type: String, required: true },
  intensidad: { type: Number, default: 0 },
  periodo:    { type: String, default: '' },
}, { timestamps: true, collection: 'plan_estudios' });

const NotaPeriodoSchema = new Schema({
  periodo:    { type: String, required: true },
  materias:   { type: Schema.Types.Mixed, default: {} },
  disciplina: { type: Number, default: null }, // 0.0-5.0 disciplina por periodo
}, { _id: false });

const NotaSchema = new Schema({
  estId:      { type: String, required: true },
  anoLectivo: { type: String, required: true, default: () => String(new Date().getFullYear()) },
  periodos:   [NotaPeriodoSchema],
  disciplina: { type: Number, default: null }, // promedio calculado
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'notas' });
NotaSchema.index({ estId: 1, anoLectivo: 1, colegioId: 1 }, { unique: true }); // multi-tenant: un estudiante puede existir en 2 colegios distintos

const AsistenciaSchema = new Schema({
  fecha:     { type: String, required: true },
  salon:     { type: String, required: true },
  colegioId: { type: String, required: true, index: true },
  registros: [{
    estId:  { type: String, required: true },
    estado: { type: String, enum: ['presente','ausente','tarde'], default: 'presente' },
  }],
}, { timestamps: true, collection: 'asistencias' });
AsistenciaSchema.index({ fecha: 1, salon: 1, colegioId: 1 }, { unique: true });

const ExcusaSchema = new Schema({
  estId:          { type: String, required: true },
  enombre:        { type: String, required: true },
  salon:          { type: String, default: '' },
  fecha:          { type: String, required: true },
  dest:           { type: String, required: true },
  causa:          { type: String, required: true },
  desc:           { type: String, default: '' },
  leida:          { type: Boolean, default: false },
  ts:             { type: String, default: '' },
  colegioId:      { type: String, default: '', index: true },
  // Respuesta del profesor
  respProf:       { type: String, default: '' },        // texto de respuesta
  respProfNombre: { type: String, default: '' },        // nombre del prof que respondió
  respTs:         { type: String, default: '' },        // timestamp respuesta
  // Tiempo prolongado (días extra)
  diasExtra:      { type: Number, default: 0 },
  fechaLimite:    { type: String, default: '' },        // fecha límite para entregar talleres
  // Archivos de talleres adjuntados por el profesor
  talleres: [{
    nombre:    { type: String, default: '' },
    tipo:      { type: String, default: '' },
    base64:    { type: String, default: '' },
    tamanio:   { type: String, default: '' },
    _id: false,
  }],
  // Estado lectura de respuesta por parte del estudiante
  respLeida: { type: Boolean, default: false },
}, { timestamps: true, collection: 'excusas' });

const VClaseSchema = new Schema({
  id:         { type: String, required: true, unique: true },
  profId:     { type: String, required: true },
  profNombre: { type: String, default: '' },
  materias:   { type: String, default: '' },
  salon:      { type: String, required: true },
  fecha:      { type: String, required: true },
  hora:       { type: String, required: true },
  link:       { type: String, required: true },
  desc:       { type: String, default: '' },
  ts:         { type: String, default: '' },
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'vclases' });

const UploadSchema = new Schema({
  id:         { type: String, required: true, unique: true },
  estId:      { type: String, required: true },
  estNombre:  { type: String, required: true },
  profId:     { type: String, default: '' },
  profNombre: { type: String, default: '' },
  materia:    { type: String, required: true },
  periodo:    { type: String, required: true },
  nombre:     { type: String, required: true },
  desc:       { type: String, default: '' },
  fecha:      { type: String, required: true },
  size:       { type: Number, default: 0 },
  type:       { type: String, default: '' },
  dataUrl:    { type: String, default: '' },
  revisado:   { type: Boolean, default: false },
  revisadoTs: { type: String, default: '' },
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'uploads' });

const PlanSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  salon:       { type: String, required: true },
  materia:     { type: String, required: true },
  profId:      { type: String, required: true },
  profNombre:  { type: String, required: true },
  titulo:      { type: String, required: true },
  desc:        { type: String, default: '' },
  fechaLimite: { type: String, default: '' },
  archNombre:  { type: String, default: '' },
  archDataUrl: { type: String, default: '' },
  archType:    { type: String, default: '' },
  fecha:       { type: String, required: true },
  visto:       { type: Boolean, default: false },
  esSalon:     { type: Boolean, default: false },
  planId:      { type: String, default: '' },
  archivado:   { type: Boolean, default: false },
  _periodo:    { type: String, default: '' },
  _archivedAt: { type: String, default: '' },
  colegioId:   { type: String, default: '', index: true },
}, { timestamps: true, collection: 'planes' });

const RecuperacionSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  salon:       { type: String, default: '' },
  materia:     { type: String, required: true },
  profId:      { type: String, required: true },
  planId:      { type: String, default: '' },
  nombre:      { type: String, required: true },
  type:        { type: String, default: '' },
  dataUrl:     { type: String, default: '' },
  desc:        { type: String, default: '' },
  fecha:       { type: String, required: true },
  revisado:    { type: Boolean, default: false },
  revisadoTs:  { type: String, default: '' },
  ts:          { type: String, default: '' },
  archivado:   { type: Boolean, default: false },
  _periodo:    { type: String, default: '' },
  _archivedAt: { type: String, default: '' },
  colegioId:   { type: String, default: '', index: true },
}, { timestamps: true, collection: 'recuperaciones' });

const AuditoriaSchema = new Schema({
  ts:        { type: String, required: true },
  uid:       { type: String, default: '' },
  who:       { type: String, default: '' },
  role:      { type: String, default: '' },
  est:       { type: String, default: '' },
  mat:       { type: String, default: '' },
  old:       { type: String, default: '' },
  nw:        { type: String, default: '' },
  ip:        { type: String, default: '' },
  user:      { type: String, default: '' },
  accion:    { type: String, default: '' },
  extra:     { type: String, default: '' },
  colegioId: { type: String, default: '', index: true },
}, { timestamps: true, collection: 'auditoria' });

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
  colegioId:       { type: String, default: '', index: true },
}, { timestamps: true, collection: 'est_historial' });

const BloqueoSchema = new Schema({
  usuario:   { type: String, required: true, unique: true },
  on:        { type: Boolean, default: true },
  ts:        { type: String, default: '' },
  colegioId: { type: String, default: '', index: true },
}, { collection: 'bloqueos' });

const EstadisticaSchema = new Schema({
  colegioId:   { type: String, required: true },
  fecha:       { type: String, required: true },
  totalEst:    { type: Number, default: 0 },
  totalProfs:  { type: Number, default: 0 },
  promNotas:   { type: Number, default: 0 },
  asistPct:    { type: Number, default: 0 },
  ingresosMes: { type: Number, default: 0 },
}, { timestamps: true, collection: 'estadisticas' });

// ─── SUGERENCIAS ─────────────────────────────────────────────────────────────
const SugerenciaSchema = new Schema({
  uid:           { type: String, required: true },
  nombre:        { type: String, required: true },
  role:          { type: String, required: true },
  colegioId:     { type: String, default: '' },
  colegioNombre: { type: String, default: '' },
  titulo:        { type: String, default: '' },
  mensaje:       { type: String, required: true },
  categoria:     {
    type: String, default: 'general',
    enum: ['general','academico','tecnico','sugerencia','felicitacion','queja']
  },
  leida:        { type: Boolean, default: false },
  leidaTs:      { type: String, default: '' },
  respuesta:    { type: String, default: '' },
  respondidaTs: { type: String, default: '' },
  ts:           { type: String, default: '' },
}, { timestamps: true, collection: 'sugerencias' });
SugerenciaSchema.index({ leida: 1, createdAt: -1 });
SugerenciaSchema.index({ uid: 1 });

module.exports = {
  Area:          mongoose.model('Area',          AreaSchema),
  Materia:       mongoose.model('Materia',       MateriaSchema),
  Colegio:       mongoose.model('Colegio',       ColegioSchema),
  Usuario:       mongoose.model('Usuario',       UsuarioSchema),
  Salon:         mongoose.model('Salon',         SalonSchema),
  Config:        mongoose.model('Config',        ConfigSchema),
  PlanEstudios:  mongoose.model('PlanEstudios',  PlanEstudiosSchema),
  Nota:          mongoose.model('Nota',          NotaSchema),
  Asistencia:    mongoose.model('Asistencia',    AsistenciaSchema),
  Excusa:        mongoose.model('Excusa',        ExcusaSchema),
  VClase:        mongoose.model('VClase',        VClaseSchema),
  Upload:        mongoose.model('Upload',        UploadSchema),
  Plan:          mongoose.model('Plan',          PlanSchema),
  Recuperacion:  mongoose.model('Recuperacion',  RecuperacionSchema),
  Auditoria:     mongoose.model('Auditoria',     AuditoriaSchema),
  EstHist:       mongoose.model('EstHist',       EstHistSchema),
  Bloqueo:       mongoose.model('Bloqueo',       BloqueoSchema),
  Estadistica:   mongoose.model('Estadistica',   EstadisticaSchema),
  Sugerencia:    mongoose.model('Sugerencia',    SugerenciaSchema),
};