import firebaseConfig from "../../firebase-applet-config.json";
import { getCachedAccessToken, loginWithGoogleServices } from "./drive";

// Loaded script promises to avoid double injection
let gapiLoadPromise: Promise<any> | null = null;
let pickerLoadPromise: Promise<any> | null = null;

export interface PickerFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface PickerOptions {
  mimeTypeFilter?: string[]; // e.g., ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"]
  onPicked: (file: PickerFile, blob: Blob) => void | Promise<void>;
  onCancel?: () => void;
  notify?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

/**
 * Loads the base gapi client script dynamically
 */
export function loadGapi(): Promise<any> {
  if (gapiLoadPromise) return gapiLoadPromise;

  gapiLoadPromise = new Promise((resolve, reject) => {
    if ((window as any).gapi) {
      resolve((window as any).gapi);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve((window as any).gapi);
    };
    script.onerror = (err) => {
      gapiLoadPromise = null;
      reject(new Error("No se pudo cargar el script de Google API (gapi)."));
    };
    document.body.appendChild(script);
  });

  return gapiLoadPromise;
}

/**
 * Loads the Picker library via gapi
 */
export function loadPicker(): Promise<any> {
  if (pickerLoadPromise) return pickerLoadPromise;

  pickerLoadPromise = new Promise(async (resolve, reject) => {
    try {
      const gapi = await loadGapi();
      gapi.load("picker", {
        callback: () => {
          if ((window as any).google && (window as any).google.picker) {
            resolve((window as any).google.picker);
          } else {
            pickerLoadPromise = null;
            reject(new Error("No se encontró el objeto google.picker."));
          }
        },
        onerror: (err: any) => {
          pickerLoadPromise = null;
          reject(new Error("Error al cargar el módulo Google Picker: " + JSON.stringify(err)));
        },
      });
    } catch (err) {
      pickerLoadPromise = null;
      reject(err);
    }
  });

  return pickerLoadPromise;
}

/**
 * Downloads a file from Google Drive as a Blob using the provided accessToken
 */
export async function downloadDriveFile(fileId: string, accessToken: string): Promise<Blob> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al descargar archivo de Google Drive: ${errorText}`);
  }

  return response.blob();
}

/**
 * Opens the Google Picker dialog
 */
export async function openGooglePicker(options: PickerOptions): Promise<void> {
  try {
    if (options.notify) {
      options.notify("info", "Iniciando Google Picker...");
    }

    // 1. Ensure access token is available. If not, trigger login.
    let accessToken = getCachedAccessToken();
    if (!accessToken) {
      accessToken = await loginWithGoogleServices();
    }

    // 2. Load the google picker script
    const pickerLib = await loadPicker();
    const gapi = await loadGapi();

    const apiKey = firebaseConfig.apiKey;
    const appId = firebaseConfig.messagingSenderId; // In Firebase context, this is the Google Project Number and serves as appId

    if (!apiKey) {
      throw new Error("No se configuró la API Key en firebase-applet-config.json");
    }

    // 3. Set up the document view with mimeType filters if provided
    const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
    
    // Enable showing folder and file hierarchy
    view.setIncludeFolders(true);
    
    if (options.mimeTypeFilter && options.mimeTypeFilter.length > 0) {
      view.setMimeTypes(options.mimeTypeFilter.join(","));
    }

    // 4. Build and show the picker
    const picker = new (window as any).google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback(async (data: any) => {
        if (data.action === (window as any).google.picker.Action.PICKED) {
          const doc = data.docs[0];
          const fileId = doc.id;
          const fileName = doc.name;
          const mimeType = doc.mimeType;

          if (options.notify) {
            options.notify("info", `Descargando "${fileName}" desde Google Drive...`);
          }

          try {
            // Download the file contents
            const blob = await downloadDriveFile(fileId, accessToken!);
            
            if (options.notify) {
              options.notify("success", `"${fileName}" cargado con éxito.`);
            }

            // Trigger the onPicked callback
            await options.onPicked({ id: fileId, name: fileName, mimeType }, blob);
          } catch (downloadErr: any) {
            console.error("Error downloading file from picker:", downloadErr);
            if (options.notify) {
              options.notify("error", "Error al descargar el archivo: " + downloadErr.message);
            }
          }
        } else if (data.action === (window as any).google.picker.Action.CANCEL) {
          if (options.onCancel) {
            options.onCancel();
          }
        }
      })
      .build();

    picker.setVisible(true);
  } catch (err: any) {
    console.error("Error en Google Picker:", err);
    if (options.notify) {
      options.notify("error", "Error con Google Picker: " + err.message);
    }
  }
}
