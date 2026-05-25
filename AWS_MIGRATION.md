# Migracion a AWS Amplify Gen 2

Este documento describe el plan de migracion de Solgram Control desde
Firebase / Google Cloud hacia AWS Amplify Gen 2.

## Estado actual

| Fase | Descripcion | Estado |
|------|-------------|--------|
| 0    | Setup base de Amplify (auth + data + storage)               | En este PR |
| 1    | Reemplazar `LoginScreen` por Cognito + grupo admins         | Pendiente |
| 2    | Migrar listeners y CRUD de Firestore a AppSync subscriptions| Pendiente |
| 3    | Mover fotos de base64 a S3 (con resize en cliente)          | Pendiente |
| 4    | (Opcional) Lambda + Bedrock para chat de Solgramia          | **Saltada** |
| 5    | Hosting en Amplify Hosting + dominio                        | Pendiente |
| 6    | Cleanup: eliminar Firebase, Google Drive, PHP backend       | Pendiente |

> Decisiones del usuario: region `us-east-1`, todo a AWS, chat IA pospuesto,
> ya tiene cuenta AWS.

## Arquitectura objetivo

```
                          +---------------------+
                          |   CloudFront + S3   |  (Amplify Hosting)
                          |  (estaticos React)  |
                          +----------+----------+
                                     |
                                     v
+-----------------+        +---------+----------+        +-----------------+
|   Cognito User  | <----> |     AppSync        | <----> |    DynamoDB     |
|  Pool + Groups  |        |  (GraphQL realtime)|        |   (NoSQL)       |
|   "admins"      |        +---------+----------+        +-----------------+
+--------+--------+                  |
         |                           v
         |                   +-------+--------+
         +-----------------> |   S3 Bucket    |
              guest /        |  reports/*     |
              auth.          |  backups/*     |
                             |  schedules/*   |
                             +----------------+
```

## Recursos provisionados por este PR

Al ejecutar `npx ampx sandbox` desde `/projects/sandbox/Solgram-control`,
Amplify creara automaticamente:

- **Cognito User Pool** con login por email + grupo `admins`.
- **Cognito Identity Pool** con rol *unauthenticated* habilitado
  (equivalente al modo anonimo de Firebase para los supervisores).
- **AppSync GraphQL API** con DynamoDB como datasource.
- **5 tablas DynamoDB**: `DailyReport`, `Worker`, `License`,
  `ExtraHoursReport`, `ProjectConfig`.
- **S3 Bucket** con paths `reports/`, `backups/`, `schedules/`
  y reglas IAM por rol.

## Como arrancarlo localmente

1. Instalar las nuevas dependencias:
   ```bash
   npm install
   ```
2. Configurar credenciales AWS (una sola vez):
   ```bash
   aws configure
   # Access Key, Secret, region us-east-1
   ```
3. Lanzar el sandbox personal de Amplify:
   ```bash
   npm run amplify:sandbox
   ```
   Esto crea recursos AWS reales (en tu cuenta) y genera el archivo
   `amplify_outputs.json` que el cliente React leera para configurarse.
   El archivo esta gitignored.

4. Crear el primer admin manualmente desde la consola de Cognito o:
   ```bash
   aws cognito-idp admin-create-user \
     --user-pool-id <USER_POOL_ID> \
     --username admin@ejemplo.cl \
     --temporary-password Solgram2025!

   aws cognito-idp admin-add-user-to-group \
     --user-pool-id <USER_POOL_ID> \
     --username admin@ejemplo.cl \
     --group-name admins
   ```

5. Correr la app como siempre:
   ```bash
   npm run dev
   ```

   Por ahora la app sigue usando Firebase. En el PR siguiente (Fase 1)
   reemplazamos el login.

## Notas

- Este PR **no toca codigo existente** ni dependencias de Firebase.
  La app sigue funcionando exactamente igual contra Firestore.
- `amplify_outputs.json` se genera por desarrollador y nunca se commitea.
- Para destruir el sandbox: `npm run amplify:sandbox:delete`.
- Costo estimado del sandbox encendido: <$1/dia para una obra mediana.
