import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito User Pool + Identity Pool para Solgram Control.
 *
 * Modelo de roles:
 *   - "admins" : usuarios añadidos al grupo `admins` del User Pool
 *                (lo equivalente al doc /admins/{uid} de Firestore).
 *                Login con email + password. Pueden borrar reportes,
 *                editar workers, subir cronograma, etc.
 *
 *   - "guest"  : el supervisor en terreno entra sin credenciales
 *                (Identity Pool unauthenticated role). Equivalente al
 *                signInAnonymously de Firebase. Puede crear reportes
 *                pero NO borrarlos ni cambiarlos a status="listo".
 *
 *   - "authenticated" (no admin): cualquier usuario logeado que aún
 *                no esté en el grupo admins. Por compatibilidad con
 *                el flujo legacy queda con permisos de supervisor.
 *
 * Para promover a un usuario a admin:
 *
 *   aws cognito-idp admin-add-user-to-group \
 *     --user-pool-id <USER_POOL_ID> \
 *     --username <email> \
 *     --group-name admins
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Verifica tu cuenta de Solgram Control',
      verificationEmailBody: (createCode) =>
        `Bienvenido a Solgram Control. Tu codigo de verificacion es: ${createCode()}`,
    },
  },
  groups: ['admins'],
  userAttributes: {
    email: { required: true, mutable: true },
    preferredUsername: { required: false, mutable: true },
  },
});
