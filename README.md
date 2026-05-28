# EduSistema — Plataforma Académica Multi-Colegio

> Sistema de gestión académica completo para instituciones educativas colombianas. Maneja estudiantes, profesores, notas tripartitas, boletines PDF históricos, excusas, comunicados, simulacros ICFES y más — en una sola plataforma web multi-tenant con aislamiento total por colegio.

---

## Tabla de contenido

1. [Descripción general](#descripción-general)
2. [Requisitos funcionales](#requisitos-funcionales)
3. [Requisitos no funcionales](#requisitos-no-funcionales)
4. [Diagrama de clases UML](#diagrama-de-clases-uml)
5. [Diagrama de casos de uso](#diagrama-de-casos-de-uso)
6. [Stack tecnológico](#stack-tecnológico)
7. [Estructura del proyecto](#estructura-del-proyecto)
8. [Variables de entorno](#variables-de-entorno)
9. [Instalación y puesta en marcha](#instalación-y-puesta-en-marcha)
10. [Despliegue en producción](#despliegue-en-producción)
11. [Arquitectura de la integración](#arquitectura-de-la-integración)
12. [API — Endpoints principales](#api--endpoints-principales)
13. [Modelos de base de datos](#modelos-de-base-de-datos)
14. [Roles y permisos](#roles-y-permisos)
15. [Módulos del sistema](#módulos-del-sistema)
16. [Sistema de calificaciones](#sistema-de-calificaciones)
17. [Credenciales iniciales](#credenciales-iniciales)
18. [Scripts disponibles](#scripts-disponibles)
19. [Seguridad](#seguridad)
20. [Guía de diseño — CSS](#guía-de-diseño--css)

---

## Descripción general

EduSistema Pro es una plataforma SaaS académica diseñada para colegios colombianos. Permite que múltiples colegios operen de forma completamente aislada (multi-tenant) desde un único backend, con control total sobre:

- Registro y gestión de estudiantes y profesores por ciclo (Primaria y Bachillerato)
- Calificación tripartita (Aptitud / Actitud / Responsabilidad) por periodo
- Generación de boletines PDF individuales y masivos con histórico completo por año lectivo
- Sistema de excusas con respuesta del profesor y notificación automática al estudiante
- Comunicados del admin y del superadmin visibles según rol y colegio destino
- Simulacro ICFES con preguntas reales 2023-2025 para estudiantes de bachillerato
- Control de asistencias, clases virtuales, tareas, talleres y recuperaciones
- Horarios semanales para profesores asignados por el administrador del colegio
- Auditoría de acciones y gestión de bloqueos de cuentas aislada por colegio

---

## Requisitos funcionales

Los requisitos funcionales describen **qué debe hacer** el sistema.

### RF-01 · Autenticación y sesión

| ID | Descripción |
|---|---|
| RF-01.1 | El sistema debe permitir iniciar sesión con usuario y contraseña cifrada (bcrypt). |
| RF-01.2 | El sistema debe emitir un token JWT con duración de 12 horas tras un login exitoso. |
| RF-01.3 | El sistema debe bloquear automáticamente cuentas de estudiantes y profesores tras 5 intentos fallidos. |
| RF-01.4 | Los administradores y superadmins nunca deben ser bloqueados automáticamente. |
| RF-01.5 | El sistema debe permitir que el administrador desbloquee cuentas manualmente. |
| RF-01.6 | El sistema debe redirigir al usuario a su panel según su rol (superadmin, admin, profe, est). |

### RF-02 · Gestión de colegios (Superadmin)

| ID | Descripción |
|---|---|
| RF-02.1 | El superadmin debe poder crear, editar y desactivar colegios. |
| RF-02.2 | Cada colegio debe tener nombre, NIT, dirección, teléfono y logo. |
| RF-02.3 | El superadmin debe poder crear y gestionar el administrador de cada colegio. |
| RF-02.4 | El superadmin debe poder enviar comunicados globales a todos los colegios o a colegios específicos, segmentados por rol. |
| RF-02.5 | El superadmin debe poder ver estadísticas globales de uso de la plataforma. |

### RF-03 · Gestión de salones

| ID | Descripción |
|---|---|
| RF-03.1 | El administrador debe poder crear salones con nombre, ciclo (primaria/bachillerato) y jornada (mañana/tarde/noche). |
| RF-03.2 | Los salones deben ordenarse automáticamente de forma alfanumérica (1A, 1B, 2A, 2B…). |
| RF-03.3 | El administrador debe poder asignar materias personalizadas a cada salón. |
| RF-03.4 | El administrador debe poder asignar áreas académicas a un salón, donde cada área contiene una o más materias. |

### RF-04 · Gestión de usuarios

| ID | Descripción |
|---|---|
| RF-04.1 | El administrador debe poder crear, editar y eliminar estudiantes, asignándolos a un salón. |
| RF-04.2 | El administrador debe poder crear, editar y eliminar profesores, asignándoles salones y materias. |
| RF-04.3 | El sistema debe soportar carga masiva de estudiantes y profesores mediante archivo CSV. |
| RF-04.4 | El sistema debe permitir descargar una plantilla CSV con el formato requerido. |
| RF-04.5 | El administrador debe poder exportar la lista de estudiantes de un salón a formato Excel. |
| RF-04.6 | El sistema debe registrar un historial de estudiantes eliminados con opción de restauración. |

### RF-05 · Sistema de notas

| ID | Descripción |
|---|---|
| RF-05.1 | El sistema debe calcular la definitiva con la fórmula tripartita: `(Aptitud × pA%) + (Actitud × pC%) + (Responsabilidad × pR%)`. |
| RF-05.2 | Los porcentajes de ponderación deben ser configurables por colegio. |
| RF-05.3 | Las notas deben registrarse por periodo (hasta 4 periodos por año lectivo). |
| RF-05.4 | El profesor debe poder ingresar notas solo para sus propios salones y materias asignadas. |
| RF-05.5 | La conducta y la disciplina deben calificarse de 0.0 a 5.0 de forma independiente por periodo. |
| RF-05.6 | El sistema debe calcular el promedio anual de conducta y disciplina desde los valores por periodo. |
| RF-05.7 | El sistema debe registrar el salón del estudiante en el año lectivo en que se calificó para mantener aislamiento histórico. |
| RF-05.8 | La definitiva debe actualizarse en pantalla en tiempo real al ingresar los tres componentes. |
| RF-05.9 | La tabla de notas debe soportar navegación por teclado con Tab y Enter entre campos. |

### RF-06 · Boletines

| ID | Descripción |
|---|---|
| RF-06.1 | El sistema debe generar boletines PDF individuales por estudiante, periodo y año lectivo. |
| RF-06.2 | El sistema debe generar boletines masivos para todos los estudiantes de un salón. |
| RF-06.3 | Al descargar boletines de un año anterior, el sistema debe mostrar el salón y las materias de ese año, no los del año actual. |
| RF-06.4 | El boletín debe incluir datos del estudiante, notas por materia y periodo, conducta, disciplina, promedio general y desempeño. |
| RF-06.5 | El boletín debe mostrar el logo del colegio si está configurado. |
| RF-06.6 | El boletín debe indicar la jornada del salón (mañana/tarde/noche). |

### RF-07 · Excusas

| ID | Descripción |
|---|---|
| RF-07.1 | El estudiante debe poder enviar excusas dirigidas a su profesor o al administrador. |
| RF-07.2 | El profesor debe poder responder la excusa con texto, días extra concedidos y fecha límite de entrega. |
| RF-07.3 | Al iniciar sesión, el estudiante debe recibir notificación automática si tiene respuestas sin leer. |
| RF-07.4 | La respuesta debe incluir un aviso de que el trabajo debe entregarse dentro del tiempo estipulado. |
| RF-07.5 | El estudiante debe poder marcar la respuesta como leída. |

### RF-08 · Comunicados

| ID | Descripción |
|---|---|
| RF-08.1 | El administrador debe poder crear comunicados con título, mensaje, destinatario, color y rango de fechas. |
| RF-08.2 | Los comunicados deben mostrarse solo durante el periodo de vigencia configurado. |
| RF-08.3 | El superadmin debe poder crear comunicados globales visibles en todos los colegios o en colegios seleccionados. |
| RF-08.4 | Los comunicados deben segmentarse por rol: todos, solo admins, solo profes, solo estudiantes. |
| RF-08.5 | Los comunicados de un colegio no deben ser visibles en ningún otro colegio. |

### RF-09 · Asistencias

| ID | Descripción |
|---|---|
| RF-09.1 | El profesor debe poder registrar la asistencia diaria de cada estudiante (presente, ausente, tarde). |
| RF-09.2 | El administrador debe poder consultar y exportar reportes de asistencia por salón y rango de fechas. |
| RF-09.3 | El estudiante debe poder consultar su historial de asistencias. |

### RF-10 · Clases virtuales y tareas

| ID | Descripción |
|---|---|
| RF-10.1 | El profesor debe poder publicar enlaces de clases virtuales (Meet, Zoom, Teams) para sus salones. |
| RF-10.2 | El profesor debe poder asignar tareas y talleres con fecha límite y archivo adjunto. |
| RF-10.3 | El estudiante debe poder subir su entrega de tarea como archivo adjunto. |
| RF-10.4 | El profesor debe poder marcar una tarea entregada como revisada. |

### RF-11 · Recuperaciones

| ID | Descripción |
|---|---|
| RF-11.1 | El sistema debe identificar automáticamente los estudiantes con 1 o 2 materias perdidas susceptibles de recuperación. |
| RF-11.2 | El profesor debe poder subir el plan de recuperación individual para cada estudiante. |
| RF-11.3 | El estudiante debe poder consultar su historial de recuperaciones. |
| RF-11.4 | El sistema debe indicar qué nota mínima necesita el estudiante en los periodos restantes para ganar el año. |

### RF-12 · Simulacro ICFES

| ID | Descripción |
|---|---|
| RF-12.1 | El módulo debe estar disponible únicamente para estudiantes de bachillerato. |
| RF-12.2 | El sistema debe ofrecer 20 preguntas por asignatura en 5 áreas: Lectura Crítica, Matemáticas, Sociales y Ciudadanas, Ciencias Naturales e Inglés. |
| RF-12.3 | Las preguntas y opciones de respuesta deben ordenarse aleatoriamente en cada sesión. |
| RF-12.4 | El sistema no debe informar si la respuesta es correcta o incorrecta durante la sesión activa. |
| RF-12.5 | El progreso debe guardarse localmente para que el estudiante pueda continuar después de pausar. |
| RF-12.6 | Al completar todas las respuestas de una asignatura, el sistema debe mostrar el resultado (X/20). |

### RF-13 · Horarios de profesores

| ID | Descripción |
|---|---|
| RF-13.1 | El administrador debe poder asignar un horario semanal a cada profesor de bachillerato. |
| RF-13.2 | El horario debe organizarse en franjas horarias (filas) × días de la semana (columnas). |
| RF-13.3 | En cada celda el administrador debe poder asignar un salón y una materia de las asignadas al profesor. |
| RF-13.4 | El profesor debe poder ver su horario y acceder al ingreso de notas haciendo clic en cualquier clase. |
| RF-13.5 | El administrador debe poder agregar o quitar franjas horarias libremente. |

### RF-14 · Auditoría y reportes

| ID | Descripción |
|---|---|
| RF-14.1 | El sistema debe registrar en auditoría cada cambio de nota, login, bloqueo y acción relevante. |
| RF-14.2 | El administrador debe poder consultar el log de auditoría filtrado por usuario, fecha y tipo de acción. |
| RF-14.3 | El sistema debe generar reportes de rendimiento académico por salón y periodo en formato Excel y PDF. |

---

## Requisitos no funcionales

Los requisitos no funcionales describen **cómo debe comportarse** el sistema.

### RNF-01 · Rendimiento

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-01.1 | La carga inicial (GET /api/db) debe ser eficiente. | Respuesta < 3 s para colegios con hasta 1.000 estudiantes. |
| RNF-01.2 | La generación de boletín PDF individual no debe bloquear la UI. | Boletín disponible en < 4 s. |
| RNF-01.3 | El guardado de una nota debe reflejarse de forma inmediata. | Actualización de definitiva en < 500 ms. |
| RNF-01.4 | Las búsquedas en listas de estudiantes deben ser instantáneas. | Filtrado en < 100 ms para hasta 500 registros. |

### RNF-02 · Seguridad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-02.1 | Las contraseñas deben almacenarse únicamente como hash bcrypt. | Sin contraseñas en texto plano en la BD. |
| RNF-02.2 | Todas las rutas protegidas deben validar el JWT antes de procesar. | Respuesta 401 para token inválido o ausente. |
| RNF-02.3 | Debe aplicarse rate limiting en el endpoint de login. | Máximo 10 intentos / IP en 15 minutos. |
| RNF-02.4 | Los datos de un colegio no deben ser accesibles desde la sesión de otro. | Todo query de BD filtra por `colegioId` del token. |
| RNF-02.5 | Las cabeceras HTTP de seguridad deben estar activadas. | Headers Helmet aplicados en todas las respuestas. |
| RNF-02.6 | El CORS debe permitir solo los orígenes configurados. | Solicitudes de orígenes no autorizados → 403. |

### RNF-03 · Disponibilidad y confiabilidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-03.1 | El sistema debe estar disponible durante el horario escolar. | Disponibilidad ≥ 99 % de 6:00 a 22:00. |
| RNF-03.2 | La pérdida de conexión no debe corromper datos parcialmente guardados. | Cada guardado de nota es una operación atómica. |
| RNF-03.3 | El backend debe reconectarse automáticamente a MongoDB si la conexión se pierde. | Reconexión automática configurada en Mongoose. |

### RNF-04 · Usabilidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-04.1 | La interfaz debe ser usable en escritorio desde 1.024 px de ancho. | Sin scroll horizontal en resolución ≥ 1.024 px. |
| RNF-04.2 | El sistema debe dar retroalimentación visual inmediata tras cada acción. | Badge "✓ Guardado" visible tras guardar; alertas descriptivas. |
| RNF-04.3 | Los formularios de notas deben soportar navegación por teclado. | Tab y Enter avanzan al siguiente campo. |
| RNF-04.4 | Los mensajes de error deben ser comprensibles para usuarios no técnicos. | Sin trazas de código visibles al usuario final. |

### RNF-05 · Mantenibilidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-05.1 | El backend debe separar rutas, modelos y middleware en módulos independientes. | Estructura `routes/`, `models/`, `middleware/` verificable. |
| RNF-05.2 | Las variables sensibles no deben estar en el código fuente. | Sin credenciales hardcodeadas en archivos `.js`. |
| RNF-05.3 | El sistema debe incluir scripts de migración y diagnóstico reutilizables. | Scripts en `scripts/` ejecutables sin modificar producción. |
| RNF-05.4 | Las funciones de cálculo deben estar desacopladas de la UI. | `def()`, `gprom()`, `bDes()` usables sin acceso al DOM. |

### RNF-06 · Escalabilidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-06.1 | Múltiples colegios simultáneos no deben degradarse entre sí. | Aislamiento por `colegioId` en todos los modelos. |
| RNF-06.2 | La adición de un colegio no debe requerir cambios en el código. | Alta de colegios desde panel superadmin sin tocar código. |
| RNF-06.3 | Los índices de MongoDB deben cubrir los campos de búsqueda frecuente. | Índices en `colegioId`, `estId`, `anoLectivo`, `usuario`. |

### RNF-07 · Compatibilidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-07.1 | El sistema debe funcionar en los navegadores modernos más usados en Colombia. | Compatible con Chrome 100+, Firefox 100+, Edge 100+. |
| RNF-07.2 | Los boletines y reportes Excel deben abrirse sin software adicional. | PDF descargable; Excel compatible con Office 2016+. |

### RNF-08 · Privacidad y legalidad

| ID | Descripción | Criterio de aceptación |
|---|---|---|
| RNF-08.1 | No deben almacenarse contraseñas en texto plano en ningún log ni BD. | Verificable mediante inspección de la colección `usuarios`. |
| RNF-08.2 | La información académica de un estudiante solo debe ser visible por sí mismo, su profesor y el admin del colegio. | Verificado en los middlewares de rol de cada ruta. |

---

## Diagrama de clases UML

Las entidades del sistema y sus relaciones. Las referencias entre colecciones se representan como campos `String` (MongoDB no impone FK nativas; la integridad se garantiza en la capa de aplicación).

```
┌─────────────────────────────────────────┐
│          <<entity>> Colegio             │
├─────────────────────────────────────────┤
│ + id           : String  {PK}           │
│ + nombre       : String                 │
│ + nit          : String  {unique}       │
│ + direccion    : String                 │
│ + telefono     : String                 │
│ + logo         : String  (base64/URL)   │
│ + activo       : Boolean                │
│ + sedes        : String[]               │
│ + jornadas     : String[]               │
│ + createdBy    : String                 │
└───────────────────┬─────────────────────┘
                    │ 1  tiene  *
         ┌──────────┼───────────┐
         ▼          ▼           ▼
┌──────────────┐ ┌───────────┐ ┌─────────────────────────────────────┐
│ <<entity>>   │ │<<entity>> │ │          <<entity>> Usuario          │
│   Salon      │ │  Area     │ ├─────────────────────────────────────┤
├──────────────┤ ├───────────┤ │ + id           : String  {PK}       │
│ nombre       │ │ nombre    │ │ + nombre       : String              │
│ ciclo        │ │ ciclo     │ │ + ti           : String              │
│ jornada      │ │ orden     │ │ + usuario      : String  {unique}    │
│ mats[]       │ │ colegioId │ │ + password     : String  (bcrypt)    │
│ colegioId    │ └─────┬─────┘ │ + role         : enum                │
└──────────────┘       │       │   {superadmin|admin|profe|est}       │
                       │ 1     │ + blocked      : Boolean             │
                       │ tiene │ + colegioId    : String  {FK}        │
                       │ *     │ + salon        : String  (est)       │
                 ┌─────▼─────┐ │ + salones      : String[]  (profe)   │
                 │<<entity>> │ │ + ciclo        : enum                │
                 │ Materia   │ │ + materias     : String[]            │
                 ├───────────┤ └───────────────────────────────────────┘
                 │ nombre    │         │                  │
                 │ ciclo     │      est│              profe│
                 │ orden     │         │                  │
                 │ areaNombre│         ▼                  ▼
                 │ colegioId │  ┌────────────┐   ┌──────────────────┐
                 └───────────┘  │<<entity>>  │   │ <<entity>> VClase│
                                │   Nota     │   ├──────────────────┤
                                ├────────────┤   │ id, profId       │
                                │ estId {FK} │   │ salon, link      │
                                │ anoLectivo │   │ fecha, hora      │
                                │ salon      │   │ titulo, colegioId│
                                │ colegioId  │   └──────────────────┘
                                │ disciplina │
                                │ conducta   │
                                │ periodos[] │
                                └─────┬──────┘
                                      │ 1  compuesto de  *
                                      ▼
                         ┌──────────────────────────┐
                         │   <<entity>> NotaPeriodo  │
                         ├──────────────────────────┤
                         │ + periodo    : String     │
                         │ + materias   : Map<       │
                         │    String, TriNota>       │
                         │ + disciplina : Number     │
                         │ + conducta   : Number     │
                         └────────────┬─────────────┘
                                      │ 1  valor de  *
                                      ▼
                         ┌──────────────────────────┐
                         │     <<value>> TriNota     │
                         ├──────────────────────────┤
                         │ + a : Number  (Aptitud)   │
                         │ + c : Number  (Actitud)   │
                         │ + r : Number  (Respons.)  │
                         │ ─────────────────────── │
                         │ + definitiva() : Number   │
                         │  = a×pA + c×pC + r×pR    │
                         └──────────────────────────┘


┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│         <<entity>> Excusa            │   │         <<entity>> Upload            │
├──────────────────────────────────────┤   │        (Entrega de tarea)            │
│ estId         : String  {FK}         │   ├──────────────────────────────────────┤
│ enombre       : String               │   │ id            : String  {PK}         │
│ salon         : String               │   │ estId         : String  {FK}         │
│ fecha         : String               │   │ profId        : String  {FK}         │
│ dest          : String               │   │ materia       : String               │
│ causa         : String               │   │ periodo       : String               │
│ desc          : String               │   │ nombre        : String               │
│ leida         : Boolean              │   │ desc          : String               │
│ respProf      : String               │   │ fecha         : String               │
│ respProfNombre: String               │   │ size          : Number               │
│ respTs        : String               │   │ type          : String               │
│ diasExtra     : Number               │   │ revisado      : Boolean              │
│ fechaLimite   : String               │   │ revisadoTs    : String               │
│ talleres      : TallerFile[]         │   │ colegioId     : String  {FK}         │
│ respLeida     : Boolean              │   └──────────────────────────────────────┘
│ colegioId     : String  {FK}         │
└──────────────────────────────────────┘   ┌──────────────────────────────────────┐
                                           │           <<entity>> Plan            │
┌──────────────────────────────────────┐   │          (Tarea asignada)            │
│       <<entity>> Recuperacion        │   ├──────────────────────────────────────┤
├──────────────────────────────────────┤   │ id            : String  {PK}         │
│ id          : String  {PK}           │   │ estId         : String  {FK}         │
│ estId       : String  {FK}           │   │ profId        : String  {FK}         │
│ profId      : String  {FK}           │   │ salon         : String               │
│ materia     : String                 │   │ materia       : String               │
│ nombre      : String                 │   │ titulo        : String               │
│ type        : String                 │   │ desc          : String               │
│ dataUrl     : String                 │   │ fechaLimite   : String               │
│ desc        : String                 │   │ archNombre    : String               │
│ fecha       : String                 │   │ archDataUrl   : String               │
│ revisado    : Boolean                │   │ fecha         : String               │
│ revisadoTs  : String                 │   │ visto         : Boolean              │
│ colegioId   : String  {FK}           │   │ revisado      : Boolean              │
└──────────────────────────────────────┘   │ colegioId     : String  {FK}         │
                                           └──────────────────────────────────────┘

┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│        <<entity>> Asistencia         │   │       <<entity>> Comunicado          │
├──────────────────────────────────────┤   ├──────────────────────────────────────┤
│ fecha       : String                 │   │ id              : String  {PK}       │
│ salon       : String                 │   │ titulo          : String             │
│ colegioId   : String  {FK}           │   │ mensaje         : String             │
│ registros[] :                        │   │ para            : enum               │
│  ┌──────────────────────────────┐    │   │  {todos|profe|est|admin}             │
│  │ estId  : String  {FK}        │    │   │ color           : enum               │
│  │ estado : enum                │    │   │  {azul|verde|naranja|rojo|morado}    │
│  │  {presente|ausente|tarde}    │    │   │ fechaInicio     : String             │
│  └──────────────────────────────┘    │   │ fechaFin        : String             │
└──────────────────────────────────────┘   │ activo          : Boolean            │
                                           │ colegioId       : String  {FK}       │
┌──────────────────────────────────────┐   │ esSuperAdmin    : Boolean            │
│         <<entity>> Bloqueo           │   │ colegiosDestino : String[]           │
├──────────────────────────────────────┤   │ creadoPor       : String             │
│ usuario     : String  {unique}       │   └──────────────────────────────────────┘
│ on          : Boolean                │
│ ts          : String                 │   ┌──────────────────────────────────────┐
│ colegioId   : String  {FK}           │   │        <<entity>> Auditoria          │
└──────────────────────────────────────┘   ├──────────────────────────────────────┤
                                           │ ts          : String                 │
┌──────────────────────────────────────┐   │ uid         : String  {FK→Usuario}   │
│  <<entity>> Config (clave-valor)     │   │ who         : String                 │
├──────────────────────────────────────┤   │ role        : String                 │
│ key       : String                   │   │ accion      : String                 │
│ value     : Mixed                    │   │ mat         : String                 │
│ colegioId : String  {FK}             │   │ old, nw     : String                 │
│ ────────────────────────────────     │   │ ip          : String                 │
│ Claves conocidas:                    │   │ extra       : String                 │
│  anoActual · pers · notaPct          │   │ colegioId   : String  {FK}           │
│  mP · mB · dr · drPer · ext         │   └──────────────────────────────────────┘
│  salAreas · horarioPorProf           │
│  notasAbiertas                       │   ┌──────────────────────────────────────┐
└──────────────────────────────────────┘   │       <<entity>> EstHist             │
                                           │   (Historial de estudiantes)         │
┌──────────────────────────────────────┐   ├──────────────────────────────────────┤
│      <<entity>> Sugerencia           │   │ id             : String  {PK}        │
├──────────────────────────────────────┤   │ nombre         : String              │
│ uid         : String  {FK}           │   │ ti             : String              │
│ nombre      : String                 │   │ salon          : String              │
│ role        : String                 │   │ activo         : Boolean             │
│ colegioId   : String  {FK}           │   │ eliminado      : String              │
│ titulo      : String                 │   │ restaurado     : String              │
│ mensaje     : String                 │   │ snapSalon      : String              │
│ categoria   : String                 │   │ snapMats       : String[]            │
│ leida       : Boolean                │   │ snapDisciplina : String              │
│ respuesta   : String                 │   │ colegioId      : String  {FK}        │
│ respondidaTs: String                 │   └──────────────────────────────────────┘
│ ts          : String                 │
└──────────────────────────────────────┘
```

### Relaciones entre entidades

```
Colegio        1 ──── * Usuario          (un colegio tiene muchos usuarios)
Colegio        1 ──── * Salon            (un colegio tiene muchos salones)
Colegio        1 ──── * Area             (un colegio tiene muchas áreas)
Area           1 ──── * Materia          (un área contiene muchas materias)
Usuario[est]   1 ──── * Nota             (un estudiante tiene una nota por año)
Nota           1 ──── * NotaPeriodo      (una nota contiene hasta 4 periodos)
NotaPeriodo    1 ──── * TriNota          (un periodo tiene una TriNota por materia)
Usuario[est]   1 ──── * Excusa           (un estudiante envía varias excusas)
Usuario[profe] 1 ──── * VClase           (un profesor publica varias clases virtuales)
Usuario[profe] 1 ──── * Plan             (un profesor asigna varios planes de trabajo)
Usuario[est]   1 ──── * Upload           (un estudiante sube varias entregas)
Usuario[profe] 1 ──── * Recuperacion    (un profesor sube varios planes de recuperación)
Salon          1 ──── * Asistencia       (un salón tiene registros de asistencia por fecha)
Colegio        1 ──── * Comunicado       (un colegio tiene varios comunicados)
Colegio        1 ──── * Config           (un colegio tiene pares clave-valor de config)
Colegio        1 ──── * Auditoria        (un colegio tiene un log de auditoría)
Colegio        1 ──── * Sugerencia       (un colegio tiene sugerencias de sus usuarios)
Usuario        1 ──── 1 Bloqueo          (una cuenta puede tener un registro de bloqueo)
```

---

## Diagrama de casos de uso

```
                  ╔═══════════════════════════════════════════════════════════════╗
                  ║                     EduSistema Pro                           ║
                  ║                                                               ║
 ┌────────────┐   ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
 │ Superadmin │───╫─►│   Gestionar colegios    │  │  Comunicados globales    │  ║
 └────────────┘   ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │ Ver estadísticas globales│  │  Gestionar superadmin    │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║                                                               ║
 ┌────────────┐   ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
 │   Admin    │───╫─►│   Gestionar usuarios    │  │   Gestionar salones      │  ║
 └────────────┘   ║  └─────────────────────────┘  └──────────────────────────┘  ║
       │          ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
       │          ║  │  Gestión de notas (all) │  │  Publicar comunicados    │  ║
       │          ║  └─────────────────────────┘  └──────────────────────────┘  ║
       │          ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
       │          ║  │   Asignar horarios      │  │   Ver auditoría          │  ║
       │          ║  └─────────────────────────┘  └──────────────────────────┘  ║
       │          ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
       │          ║  │   Gestionar bloqueos    │  │   Reportes y exportación │  ║
       │          ║  └─────────────────────────┘  └──────────────────────────┘  ║
       │          ║                                                               ║
 ┌─────┴──────┐   ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
 │  Profesor  │───╫─►│  Ingresar notas propias │  │  Registrar asistencias   │  ║
 └────────────┘   ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │   Responder excusas     │  │  Publicar clases virt.   │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │   Asignar tareas        │  │  Subir recuperaciones    │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │   Ver mi horario        │  │  Ver comunicados         │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║                                                               ║
 ┌────────────┐   ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
 │ Estudiante │───╫─►│   Ver mi boletín PDF    │  │   Enviar excusas         │  ║
 └────────────┘   ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │   Simulacro ICFES       │  │   Entregar tareas        │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │   Ver asistencias       │  │   Ver comunicados        │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ║  ┌─────────────────────────┐  ┌──────────────────────────┐  ║
                  ║  │  Historial recuper.     │  │   Enviar sugerencias     │  ║
                  ║  └─────────────────────────┘  └──────────────────────────┘  ║
                  ╚═══════════════════════════════════════════════════════════════╝
```

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla (SPA) | — |
| Backend | Node.js + Express | Express 4.19 |
| Base de datos | MongoDB Atlas | Mongoose 8.5 |
| Autenticación | JWT + bcryptjs | jsonwebtoken 9 |
| Seguridad | Helmet + CORS + express-rate-limit | — |
| Reportes | SheetJS (Excel) + jsPDF (PDF) | — |
| Fuentes | Outfit + JetBrains Mono | Google Fonts |
| Despliegue recomendado | Render / Railway | — |

---

## Estructura del proyecto

```
edusistema/
├── index.html              ← SPA principal (toda la UI en un solo archivo)
├── app.js                  ← Lógica de la app (render, cálculos, PDF, Excel)
├── api-layer.js            ← Puente UI ↔ backend REST
├── styles.css              ← Estilos visuales completos
├── server.js               ← Servidor Express principal
├── .env                    ← Variables de entorno (NO commitear)
├── package.json
├── config/
│   └── db.js               ← Conexión a MongoDB Atlas
├── middleware/
│   └── auth.js             ← JWT middleware (authMiddleware, requireRole)
├── models/
│   └── index.js            ← 18 esquemas Mongoose
├── routes/
│   ├── auth.js             ← POST /api/auth/login
│   ├── api.js              ← CRUD principal
│   ├── db.js               ← GET /api/db (carga multi-tenant)
│   ├── superadmin.js       ← Rutas exclusivas superadmin
│   └── sugerencias.js      ← Módulo sugerencias
└── scripts/
    ├── seed.js             ← Datos iniciales de prueba
    ├── diagnostico401.js   ← Diagnóstico errores de autenticación
    ├── fix_all_indexes.js  ← Reparación de índices MongoDB
    ├── fix_salones_*.js    ← Scripts de migración de salones
    └── setup_areas.js      ← Configuración inicial de áreas
```

---

## Variables de entorno

```env
# Base de datos
MONGODB_URI=mongodb+srv://USUARIO:CONTRASEÑA@CLUSTER.mongodb.net/edusistema?retryWrites=true&w=majority

# Seguridad
JWT_SECRET=cadena-aleatoria-larga-y-segura-minimo-64-caracteres

# Servidor
PORT=3001
NODE_ENV=production

# CORS
FRONTEND_URL=https://tu-frontend.onrender.com
```

Genera el `JWT_SECRET` con:

```bash
npm run gen-secret
```

> **⚠️ Nunca subas el `.env` a un repositorio público.**

---

## Instalación y puesta en marcha

### Requisitos previos
- Node.js 18 o superior
- Cuenta en [MongoDB Atlas](https://cloud.mongodb.com) con un clúster creado

### Pasos

```bash
# 1. Clonar e instalar
git clone https://github.com/tu-usuario/edusistema.git
cd edusistema
npm install

# 2. Configurar entorno
cp .env.example .env
# Edita .env con tus credenciales reales

# 3. Seed de datos iniciales
npm run seed

# 4. Iniciar servidor
npm run dev     # desarrollo con auto-recarga
npm start       # producción
```

**MongoDB Atlas — Network Access:**
- Desarrollo: `0.0.0.0/0`
- Producción: agrega únicamente la IP de tu servidor backend

**Integrar api-layer.js:**
```html
<!-- Justo antes de </body> en index.html -->
<script src="api-layer.js"></script>
```

**Configurar URL del backend en api-layer.js:**
```javascript
const API_BASE = 'https://tu-backend.onrender.com'; // línea 4
```

---

## Despliegue en producción

### Render (recomendado)
1. Conecta tu repo en [render.com](https://render.com) → New Web Service
2. Build Command: `npm install` · Start Command: `npm start`
3. Añade todas las variables del `.env` en la sección Environment
4. Copia la URL pública generada a `API_BASE` en `api-layer.js`

### Railway
1. New Project → Deploy from GitHub en [railway.app](https://railway.app)
2. Añade las variables de entorno en la sección Variables
3. Railway detecta Node.js automáticamente y ejecuta `npm start`
4. Copia la URL pública a `API_BASE` en `api-layer.js`

---

## Arquitectura de la integración

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (index.html + app.js + api-layer.js)      │
│                                                     │
│  app.js      → render UI, cálculos, PDF, Excel      │
│  api-layer.js→ sobreescribe funciones de app.js     │
│               para comunicarse con el backend REST  │
│                                                     │
│  Login → GET /api/db → window.DB (estado global)   │
│  Toda la UI lee window.DB directamente              │
│  Acciones del usuario → llamadas REST puntuales     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/JSON + JWT Bearer
                       ▼
┌─────────────────────────────────────────────────────┐
│  BACKEND Express (server.js + routes/)              │
│                                                     │
│  POST /api/auth/login        → emite JWT            │
│  GET  /api/db                → objeto DB completo   │
│  PUT  /api/notas/:id/:per/:m → nota tripartita      │
│  PUT  /api/config/:key       → configuración        │
│  CRUD /api/usuarios          → est y profes         │
│  CRUD /api/excusas           → excusas              │
│  CRUD /api/comunicados       → comunicados          │
│  + /api/superadmin/*         → gestión global       │
└──────────────────────┬──────────────────────────────┘
                       │ Mongoose — filtro por colegioId
                       ▼
┌─────────────────────────────────────────────────────┐
│  MongoDB Atlas — 18 colecciones                     │
│  Aislamiento total por campo colegioId en cada doc  │
└─────────────────────────────────────────────────────┘
```

---

## API — Endpoints principales

Todos los endpoints protegidos requieren: `Authorization: Bearer <token>`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login → JWT |
| GET | `/api/db` | todos | Carga completa del colegio |
| POST | `/api/usuarios` | admin | Crear usuario |
| PUT | `/api/usuarios/:id` | admin | Editar usuario |
| DELETE | `/api/usuarios/:id` | admin | Eliminar usuario |
| PUT | `/api/notas/:estId/:periodo/:materia` | profe, admin | Guardar nota tripartita |
| PUT | `/api/notas/:estId/disciplina` | profe, admin | Disciplina por periodo |
| PUT | `/api/notas/:estId/conducta` | profe, admin | Conducta por periodo |
| GET | `/api/excusas` | todos | Listar excusas |
| POST | `/api/excusas` | est | Crear excusa |
| PUT | `/api/excusas/:id/responder` | profe, admin | Responder excusa |
| PUT | `/api/excusas/:id/leida` | est | Marcar como leída |
| PUT | `/api/config/:key` | admin | Guardar configuración |
| GET | `/api/comunicados` | todos | Comunicados vigentes (propios + SA globales) |
| POST | `/api/comunicados` | admin | Crear comunicado |
| PUT | `/api/comunicados/:id` | admin | Editar comunicado |
| DELETE | `/api/comunicados/:id` | admin | Eliminar comunicado |
| GET | `/api/superadmin/colegios` | superadmin | Listar colegios |
| POST | `/api/superadmin/colegios` | superadmin | Crear colegio |
| PUT | `/api/superadmin/colegios/:id` | superadmin | Editar colegio |
| POST | `/api/superadmin/comunicados` | superadmin | Comunicado global |
| PUT | `/api/superadmin/comunicados/:id` | superadmin | Editar comunicado global |
| DELETE | `/api/superadmin/comunicados/:id` | superadmin | Eliminar comunicado global |

---

## Modelos de base de datos

**18 colecciones MongoDB:**

`colegios` · `usuarios` · `salones` · `areas` · `materias` · `configs` · `planestudios` · `notas` · `asistencias` · `excusas` · `vclases` · `uploads` · `plans` · `recuperaciones` · `auditoria` · `esthists` · `bloqueos` · `comunicados`

Ver campos completos en la sección [Diagrama de clases UML](#diagrama-de-clases-uml).

---

## Roles y permisos

| Acción | superadmin | admin | profe | est |
|---|:---:|:---:|:---:|:---:|
| Gestionar colegios | ✅ | — | — | — |
| Comunicados globales | ✅ | — | — | — |
| Gestionar usuarios | — | ✅ | — | — |
| Configurar salones y materias | — | ✅ | — | — |
| Asignar horarios | — | ✅ | — | — |
| Gestionar bloqueos | — | ✅ | — | — |
| Ver auditoría | — | ✅ | — | — |
| Ingresar notas (todas) | — | ✅ | — | — |
| Ingresar notas (propias) | — | — | ✅ | — |
| Ver notas y boletín propio | — | — | — | ✅ |
| Responder excusas | — | ✅ | ✅ | — |
| Enviar excusas | — | — | — | ✅ |
| Registrar asistencias | — | ✅ | ✅ | — |
| Publicar clases virtuales | — | — | ✅ | — |
| Simulacro ICFES | — | — | — | ✅ (bach.) |

---

## Módulos del sistema

| Módulo | Roles | Descripción |
|---|---|---|
| Panel General | admin | Estadísticas del colegio en tiempo real |
| Salones & Grados | admin | CRUD de salones con jornada y orden alfanumérico |
| Primaria / Bachillerato | admin | Vista por salón → lista de estudiantes con acciones completas |
| Gestión de Notas | admin | Tabla tripartita para todos los salones y materias |
| Ingresar Notas | profe | Grid de materias asignadas → tabla de calificación académica |
| Horarios | admin/profe | Asignación y visualización de horario semanal |
| Excusas | profe/est | Envío, respuesta y notificación automática |
| Comunicados | admin/sa/todos | Publicación con vigencia, color y segmentación por rol |
| Boletines PDF | admin/est | Generación individual o masiva con historial histórico |
| Asistencias | profe/est | Registro diario y consulta histórica |
| Clases Virtuales | profe/est | Publicación de enlaces y visualización |
| Tareas & Talleres | profe/est | Asignación, entrega y revisión de trabajos |
| Recuperaciones | profe/est | Plan de recuperación individual por materia |
| Simulacro ICFES | est (bach.) | 5 áreas × 20 preguntas con progreso guardado |
| Bloqueos | admin | Gestión de cuentas bloqueadas aislada por colegio |
| Auditoría | admin | Log completo de acciones del colegio |
| Sugerencias | todos | Canal de retroalimentación a los administradores |

---

## Sistema de calificaciones

```
Definitiva = (Aptitud × pA) + (Actitud × pC) + (Responsabilidad × pR)
```

Los porcentajes son configurables por colegio (predeterminado: **60% / 20% / 20%**).

### Escala de desempeño

| Rango | Desempeño |
|---|---|
| 4.6 – 5.0 | Superior |
| 4.0 – 4.5 | Alto |
| 3.0 – 3.9 | Básico |
| 0.1 – 2.9 | Bajo |

### Conducta y disciplina

Se califican de **0.0 a 5.0 por periodo de forma independiente**. Para el boletín anual se promedia el valor de los periodos con datos registrados.

### Aislamiento histórico de boletines

Cuando un estudiante descarga un boletín de un año anterior, el sistema usa el salón y las materias registradas en ese año (campo `salon` en cada documento `Nota`), no los del año en curso.

---

## Credenciales iniciales

Después de `npm run seed`:

| Rol | Usuario | Contraseña |
|---|---|---|
| Superadmin | `superadmin` | `super123` |
| Admin | `admin` | `admin123` |
| Profesor | `profe1` | `profe123` |
| Estudiante | `est1` – `est10` | `est1123` – `est10123` |

> **⚠️ Cambia todas las contraseñas antes de ir a producción.**

---

## Scripts disponibles

```bash
npm start                                  # Servidor en producción
npm run dev                                # Servidor con nodemon (desarrollo)
npm run seed                               # Datos iniciales de prueba
npm run diagnostico                        # Diagnóstico de errores 401
npm run gen-secret                         # Genera JWT_SECRET seguro

# Migración y mantenimiento
node scripts/fix_all_indexes.js            # Repara índices duplicados
node scripts/fix_salones_colegioid.js      # Asigna colegioId a salones sin él
node scripts/fix_salones_nombre.js         # Normaliza nombres de salones
node scripts/setup_areas.js               # Configura áreas académicas iniciales
```

---

## Seguridad

| Mecanismo | Configuración |
|---|---|
| Contraseñas | bcrypt, salt rounds 10 |
| JWT | HS256, expira en 12 horas |
| Rate limit general | 100 req / 15 min / IP |
| Rate limit login | 10 intentos / 15 min / IP |
| Bloqueo de cuenta | 5 intentos fallidos → bloqueo (solo est y profe) |
| Helmet | Headers HTTP de seguridad en todas las respuestas |
| CORS | Lista blanca por `FRONTEND_URL` en `.env` |
| Multi-tenant | Cada query filtra por `colegioId` del token JWT |
| Bloqueos aislados | Admin no ve ni gestiona bloqueos de otros colegios |
| Comunicados aislados | `colegioId` en cada doc; SA comunica explícitamente |

---

## Guía de diseño — CSS

### Variables CSS principales

```css
/* Paleta */
--nv, --nv2, --nv3   → azul marino (sidebar, topbar)
--bl, --bl2, --bl3   → azul primario (botones, énfasis)
--tl                 → teal (acentos, logo)
--red  --ora  --grn  → rojo / naranja / verde (estados académicos)
--sl, --sl2, --sl3   → grises (texto secundario y terciario)

/* Tipografía */
--fn  → 'Outfit', sans-serif        (interfaz general)
--mn  → 'JetBrains Mono', monospace (números, códigos, documentos)

/* Geometría */
--r / --rl / --rxl   → border-radius: 10px / 16px / 22px
--sw                 → ancho del sidebar: 258px
```

### Clases utilitarias clave

| Clase | Descripción |
|---|---|
| `.btn .bn / .bb / .bs / .bd / .bg` | Botones: marino / azul / verde / rojo / outline |
| `.btn .sm / .xs` | Tamaños: pequeño / muy pequeño |
| `.card` | Tarjeta blanca con borde y sombra |
| `.bdg .bbl / .bgr / .brd / .bor` | Badges: azul / verde / rojo / naranja |
| `.sc .scg / .scr / .sco` | Pills de puntaje: verde / rojo / naranja |
| `.al .alb / .aly / .alr / .alg` | Alertas: azul / amarilla / roja / verde |
| `.sr .scc` | Grid de tarjetas estadísticas |
| `.fg` | Grid de formulario auto-fill |
| `.ph` | Encabezado de página |
| `.mty` | Estado vacío centrado |
| `.tw` | Contenedor de tabla con scroll horizontal |
| `.srch` | Barra de búsqueda estilizada |

---

*EduSistema · Para instituciones educativas colombianas*