<?php
/**
 * SISTEMA DE GESTIÓN DE OBRAS - SOLGRAM CONTROL
 * -------------------------------------------------------------
 * SCRIPT PHP DE PROCESAMIENTO Y ARCHIVADO DE REPORTES EN LOTES
 * DE EXACTAMENTE 7 DÍAS EN GOOGLE DRIVE Y ENLACE DE FOTOGRAFÍAS.
 * -------------------------------------------------------------
 *
 * NOTA DE SEGURIDAD:
 *   Este endpoint NO es invocado actualmente desde el frontend (que sube
 *   las imágenes directamente a Drive con el token OAuth del usuario).
 *   Si decides exponerlo, ten en cuenta:
 *     - Exige una API key compartida en cabecera Authorization (variable
 *       de entorno SOLGRAM_API_KEY). Si no está definida, el endpoint
 *       rechazará todas las peticiones.
 *     - Restringe CORS al dominio real (variable SOLGRAM_ALLOWED_ORIGIN).
 *     - Limita tamaño y cantidad de imágenes (ver MAX_IMAGES, MAX_BYTES).
 *     - service-account-credentials.json DEBE estar fuera del docroot
 *       o, mínimo, listado en .gitignore (ya lo está).
 *
 * --- ESTRUCTURA SQL RECOMENDADA ---
 *
 * CREATE TABLE IF NOT EXISTS carpetas_reportes (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     folder_drive_id VARCHAR(255) NOT NULL,
 *     nombre_carpeta VARCHAR(100) NOT NULL,
 *     fecha_inicio DATE NOT NULL,
 *     cantidad_reportes INT DEFAULT 0,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 *
 * CREATE TABLE IF NOT EXISTS reportes_diarios (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     fecha_reporte DATE NOT NULL,
 *     supervisor VARCHAR(150) NOT NULL,
 *     wbs_id VARCHAR(100) NOT NULL,
 *     comentarios TEXT,
 *     carpeta_reporte_id INT DEFAULT NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     FOREIGN KEY (carpeta_reporte_id) REFERENCES carpetas_reportes(id) ON DELETE SET NULL
 * ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
 */

// ---------------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------------
define('MAX_IMAGES',     20);                   // máximo número de fotos por reporte
define('MAX_BYTES',      8 * 1024 * 1024);      // 8 MB por imagen
define('ALLOWED_MIMES',  ['png', 'jpeg', 'jpg', 'webp']);

require_once __DIR__ . '/vendor/autoload.php';

// Cabeceras HTTP
$allowedOrigin = getenv('SOLGRAM_ALLOWED_ORIGIN') ?: '';
header('Content-Type: application/json; charset=utf-8');
if ($allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit(0);
}

// ---------------------------------------------------------------------------
// AUTENTICACIÓN: API key compartida vía cabecera Authorization: Bearer ...
// ---------------------------------------------------------------------------
$expectedKey = getenv('SOLGRAM_API_KEY') ?: '';
if ($expectedKey === '') {
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'Endpoint deshabilitado: SOLGRAM_API_KEY no configurada.']);
    exit(0);
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m) || !hash_equals($expectedKey, $m[1])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'No autorizado']);
    exit(0);
}

// ---------------------------------------------------------------------------
// CONFIG DE BASE DE DATOS Y GOOGLE
// ---------------------------------------------------------------------------
$DB_HOST = getenv('DB_HOST') ?: 'localhost';
$DB_USER = getenv('DB_USER') ?: '';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: '';

if ($DB_USER === '' || $DB_NAME === '') {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Configuración SQL incompleta']);
    exit(0);
}

$serviceAccountJson = getenv('GOOGLE_SERVICE_ACCOUNT_JSON') ?: __DIR__ . '/service-account-credentials.json';

try {
    $pdo = new PDO(
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );

    $rawInput = file_get_contents('php://input');
    if (strlen($rawInput) > MAX_IMAGES * MAX_BYTES + 1024 * 1024) {
        throw new Exception("Payload demasiado grande.");
    }

    $inputData = json_decode($rawInput, true);
    if (empty($inputData)) {
        throw new Exception("Datos de entrada vacíos o JSON mal formado.");
    }

    $date         = preg_match('/^\d{4}-\d{2}-\d{2}$/', $inputData['date'] ?? '') ? $inputData['date'] : date('Y-m-d');
    $supervisor   = trim((string)($inputData['supervisor'] ?? ''));
    $primaryWbsId = trim((string)($inputData['primaryWbsId'] ?? ''));
    $comments     = (string)($inputData['comments'] ?? '');
    $images       = is_array($inputData['images'] ?? null) ? $inputData['images'] : [];

    if ($supervisor === '' || $primaryWbsId === '') {
        throw new Exception("Faltan parámetros críticos (supervisor, primaryWbsId).");
    }
    if (mb_strlen($supervisor) > 150 || mb_strlen($primaryWbsId) > 100 || mb_strlen($comments) > 5000) {
        throw new Exception("Parámetros exceden el tamaño permitido.");
    }
    if (count($images) > MAX_IMAGES) {
        throw new Exception("Máximo " . MAX_IMAGES . " imágenes por reporte.");
    }

    if (!file_exists($serviceAccountJson)) {
        throw new Exception("Archivo de credenciales de Cuenta de Servicio no encontrado.");
    }

    $googleClient = new Google\Client();
    $googleClient->setAuthConfig($serviceAccountJson);
    $googleClient->addScope(Google\Service\Drive::DRIVE);

    $driveService = new Google\Service\Drive($googleClient);

    $pdo->beginTransaction();

    $stmt = $pdo->query("SELECT * FROM carpetas_reportes ORDER BY id DESC LIMIT 1");
    $lastFolder = $stmt->fetch();

    $folderId = null;
    $dbFolderRecordId = null;
    $shouldCreateNewFolder = false;

    if (!$lastFolder) {
        $shouldCreateNewFolder = true;
    } else {
        $cantidadActual = (int)$lastFolder['cantidad_reportes'];
        if ($cantidadActual >= 7) {
            $shouldCreateNewFolder = true;
        } else {
            $folderId = $lastFolder['folder_drive_id'];
            $dbFolderRecordId = (int)$lastFolder['id'];
            $updateStmt = $pdo->prepare("UPDATE carpetas_reportes SET cantidad_reportes = cantidad_reportes + 1 WHERE id = ?");
            $updateStmt->execute([$dbFolderRecordId]);
        }
    }

    if ($shouldCreateNewFolder) {
        $folderName = "Lote_Reportes_" . $date;

        $folderMetadata = new Google\Service\Drive\DriveFile([
            'name' => $folderName,
            'mimeType' => 'application/vnd.google-apps.folder',
        ]);

        $driveFolder = $driveService->files->create($folderMetadata, [
            'fields' => 'id'
        ]);

        $folderId = $driveFolder->id;

        $insertFolderStmt = $pdo->prepare("
            INSERT INTO carpetas_reportes (folder_drive_id, nombre_carpeta, fecha_inicio, cantidad_reportes)
            VALUES (?, ?, ?, 1)
        ");
        $insertFolderStmt->execute([$folderId, $folderName, $date]);
        $dbFolderRecordId = (int)$pdo->lastInsertId();
    }

    $uploadedPhotosDriveIds = [];

    foreach ($images as $index => $base64Image) {
        if (!is_string($base64Image)) continue;

        $imageType = 'jpg';
        if (preg_match('/^data:image\/(\w+);base64,/', $base64Image, $type)) {
            $imageType = strtolower($type[1]);
            $base64Image = substr($base64Image, strpos($base64Image, ',') + 1);
        }
        if (!in_array($imageType, ALLOWED_MIMES, true)) {
            continue;
        }

        $binaryData = base64_decode($base64Image, true);
        if ($binaryData === false || strlen($binaryData) === 0 || strlen($binaryData) > MAX_BYTES) {
            continue;
        }

        $photoName = "Foto_" . ($index + 1) . "_" . $date . "." . $imageType;
        $photoMetadata = new Google\Service\Drive\DriveFile([
            'name' => $photoName,
            'parents' => [$folderId]
        ]);

        $driveServicePhoto = $driveService->files->create(
            $photoMetadata,
            [
                'data'       => $binaryData,
                'mimeType'   => 'image/' . ($imageType === 'jpg' ? 'jpeg' : $imageType),
                'uploadType' => 'media',
                'fields'     => 'id'
            ]
        );

        $uploadedPhotosDriveIds[] = [
            'name'     => $photoName,
            'drive_id' => $driveServicePhoto->id
        ];
    }

    $insertReportStmt = $pdo->prepare("
        INSERT INTO reportes_diarios (fecha_reporte, supervisor, wbs_id, comentarios, carpeta_reporte_id)
        VALUES (?, ?, ?, ?, ?)
    ");
    $insertReportStmt->execute([
        $date,
        $supervisor,
        $primaryWbsId,
        $comments,
        $dbFolderRecordId
    ]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Reporte diario procesado exitosamente en Google Drive.',
        'metadata' => [
            'folder_batch_drive_id' => $folderId,
            'folder_record_sql_id'  => $dbFolderRecordId,
            'photos_uploaded_count' => count($uploadedPhotosDriveIds),
            'photos_details'        => $uploadedPhotosDriveIds
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('upload_report.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Ocurrió un error en el procesamiento.'
    ], JSON_UNESCAPED_UNICODE);
}
