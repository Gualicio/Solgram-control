import { defineStorage } from '@aws-amplify/backend';

/**
 * Bucket S3 para Solgram Control.
 *
 * Estructura de paths:
 *   reports/{reportId}/{filename}    -> fotos de los reportes diarios
 *   backups/{yyyy-mm-dd}/{filename}  -> respaldos diarios (zip / json / pdf)
 *   schedules/{filename}             -> XER originales subidos por el admin
 *
 * Hoy las imagenes viajan como base64 dentro de Firestore.
 * Eso revienta a la primera foto pesada (>1 MB hard-limit por doc).
 * Aqui las movemos a S3 y dejamos solo la `key` en el modelo DailyReport.
 */
export const storage = defineStorage({
  name: 'solgramControlStorage',
  access: (allow) => ({
    // Fotos de reportes: cualquiera (incluido supervisor anonimo) puede
    // subir y leer las suyas. Admin puede leer/borrar todo.
    'reports/*': [
      allow.guest.to(['read', 'write']),
      allow.authenticated.to(['read', 'write']),
      allow.groups(['admins']).to(['read', 'write', 'delete']),
    ],
    // Respaldos: solo admin.
    'backups/*': [
      allow.groups(['admins']).to(['read', 'write', 'delete']),
    ],
    // Cronogramas XER: solo admin sube/borra, todos pueden leer
    // (porque la app cachea el XER en cliente al iniciar).
    'schedules/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read']),
      allow.groups(['admins']).to(['read', 'write', 'delete']),
    ],
  }),
});
