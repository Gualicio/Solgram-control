import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

/**
 * Backend de Solgram Control en AWS Amplify Gen 2.
 *
 * Este archivo es el punto de entrada que Amplify usa para provisionar
 * todos los recursos (Cognito, AppSync, DynamoDB, S3, IAM) cuando corres:
 *
 *     npx ampx sandbox        # entorno de dev personal
 *     npx ampx pipeline-deploy # produccion (CI/CD desde GitHub)
 *
 * No incluye aun:
 *   - Lambda + Bedrock para el chat de Solgramia (Fase 5, pospuesta).
 *   - Funciones para "marcar reporte como listo" con validacion server-side
 *     (lo agregamos en la Fase 2 cuando migremos los datos).
 */
defineBackend({
  auth,
  data,
  storage,
});
