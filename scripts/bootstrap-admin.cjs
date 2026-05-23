#!/usr/bin/env node
/**
 * scripts/bootstrap-admin.cjs
 *
 * Crea el documento /admins/{uid} en Firestore para un usuario que YA existe
 * en Firebase Auth, con privilegios de administrador en Solgram Control.
 *
 * Como las reglas de Firestore impiden que el cliente escriba en /admins,
 * este script es la única forma de "ascender" un usuario a admin sin pasar
 * por la consola de Firebase manualmente.
 *
 * Requisitos:
 *   - Variable GOOGLE_APPLICATION_CREDENTIALS (o FIREBASE_SERVICE_ACCOUNT)
 *     apuntando a una cuenta de servicio del proyecto.
 *   - El usuario destino debe existir en Firebase Auth.
 *   - Pasar el email O el uid:
 *
 *      BOOTSTRAP_ADMIN_EMAIL=admin@empresa.cl npm run bootstrap-admin
 *      BOOTSTRAP_ADMIN_UID=AbCd123 npm run bootstrap-admin
 */

const admin = require('firebase-admin');
require('dotenv').config({ override: true });

async function main() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const uidEnv = process.env.BOOTSTRAP_ADMIN_UID;

  if (!email && !uidEnv) {
    console.error('ERROR: define BOOTSTRAP_ADMIN_EMAIL o BOOTSTRAP_ADMIN_UID en .env');
    process.exit(1);
  }

  let uid = uidEnv;
  if (!uid) {
    const user = await admin.auth().getUserByEmail(email);
    uid = user.uid;
  }

  await admin.firestore().collection('admins').doc(uid).set({
    grantedAt: new Date().toISOString(),
    grantedBy: 'bootstrap-admin-script',
  }, { merge: true });

  console.log(`OK: usuario ${email || uid} promovido a admin (uid=${uid}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en bootstrap-admin:', err);
  process.exit(1);
});
