import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * Schema de datos para Solgram Control sobre AppSync + DynamoDB.
 *
 * Reemplaza las colecciones de Firestore. La traduccion 1-a-1 es:
 *
 *   /reports/{id}      -> DailyReport
 *   /workers/{id}      -> Worker
 *   /licenses/{id}     -> License
 *   /extraHours/{id}   -> ExtraHoursReport
 *   /config/{key}      -> ProjectConfig (key: "global" | "schedule" | "shift")
 *   /admins/{uid}      -> grupo "admins" del User Pool (no es modelo)
 *
 * Reglas de autorizacion:
 *   - allow.guest()         -> Identity Pool unauthenticated role (supervisor anonimo).
 *   - allow.authenticated() -> usuario logeado en Cognito que NO es admin.
 *   - allow.group('admins') -> miembros del grupo admins en el User Pool.
 *
 * Esto reemplaza firestore.rules.
 */
const schema = a.schema({
  // ----------------------------------------------------------------
  // Reportes diarios de terreno
  // ----------------------------------------------------------------
  DailyReport: a
    .model({
      date: a.string().required(), // YYYY-MM-DD
      sup: a.string().required(),
      wbs: a.string().required(),
      tipo: a.string().required(),
      detalle: a.string(),
      workers: a.string().array(),
      // [{ name: string, hours: number }]
      workersDetail: a.json(),
      hours: a.float(),
      // [{ name, hours, status }]
      subLabors: a.json(),
      p6Matched: a.boolean(),
      source: a.string(),
      // [{ workerName, hours }]
      extraHours: a.json(),
      status: a.enum(['pendiente', 'ejecucion', 'listo']),
      // S3 keys (no base64). Se sube con Storage.uploadData a `reports/{id}/...`.
      images: a.string().array(),
      taskId: a.string(),
      legacyId: a.float(),
    })
    .authorization((allow) => [
      // Supervisores anonimos pueden crear y leer reportes.
      allow.guest().to(['create', 'read', 'update']),
      // Usuarios autenticados (no admin) tambien.
      allow.authenticated().to(['create', 'read', 'update']),
      // Solo admins pueden borrar y marcar 'listo' (validado en resolver custom).
      allow.group('admins'),
    ])
    .secondaryIndexes((index) => [
      // Para consultar "reportes por dia" sin escanear toda la coleccion.
      index('date').sortKeys(['sup']),
    ]),

  // ----------------------------------------------------------------
  // Trabajadores del proyecto
  // ----------------------------------------------------------------
  Worker: a
    .model({
      nombre: a.string().required(),
      rut: a.string(),
      cargo: a.string(),
      ubicacion: a.string(),
      grupo: a.string(),
      jornada: a.string(),
      hh: a.float().default(0),
      hhe: a.float().default(0),
      estado: a.enum(['Turno', 'Descanso', 'Licencia', 'Sin Turno']),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('admins'), // CRUD completo
    ]),

  // ----------------------------------------------------------------
  // Licencias / permisos
  // ----------------------------------------------------------------
  License: a
    .model({
      nombre: a.string().required(),
      rut: a.string(),
      cargo: a.string(),
      grupo: a.string(),
      desde: a.string().required(), // YYYY-MM-DD
      hasta: a.string().required(),
      dias: a.integer(),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),

  // ----------------------------------------------------------------
  // Horas extras sueltas (registro detallado)
  // ----------------------------------------------------------------
  ExtraHoursReport: a
    .model({
      date: a.string().required(),
      workerName: a.string().required(),
      hours: a.float().required(),
    })
    .authorization((allow) => [
      allow.guest().to(['create', 'read']),
      allow.authenticated().to(['create', 'read']),
      allow.group('admins'),
    ]),

  // ----------------------------------------------------------------
  // Configuracion global del proyecto.
  // Equivalente a /config/{global|schedule|shift|licenses|extraHours}.
  //
  // - key="schedule" guarda el XER comprimido en `compressedSchedule`.
  // - key="shift"    guarda anchorDate / anchorShift / cycleDays / hoursPerShift.
  // - key="global"   guarda el resto en el blob `data` (JSON libre).
  // ----------------------------------------------------------------
  ProjectConfig: a
    .model({
      key: a.string().required(),
      compressedSchedule: a.string(),
      anchorDate: a.string(),
      anchorShift: a.enum(['A', 'B']),
      cycleDays: a.integer(),
      hoursPerShift: a.integer(),
      data: a.json(),
      updatedAt: a.string(),
    })
    .identifier(['key'])
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // El cliente usa Identity Pool por default (incluye guest + authenticated).
    // Las llamadas con JWT de Cognito (incluyendo grupo admins) tambien funcionan.
    defaultAuthorizationMode: 'identityPool',
  },
});
