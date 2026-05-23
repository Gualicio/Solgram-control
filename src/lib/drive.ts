import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";

let cachedAccessToken: string | null = null;

export const getCachedAccessToken = () => cachedAccessToken;

export async function loginWithGoogleServices(): Promise<string> {
  const provider = new GoogleAuthProvider();
  // Request active scopes for Drive, Calendar, and Gmail Send
  provider.addScope("https://www.googleapis.com/auth/drive");
  provider.addScope("https://www.googleapis.com/auth/gmail.send");
  provider.addScope("https://www.googleapis.com/auth/calendar");

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("No se pudo obtener el token de acceso de Google.");
    }
    cachedAccessToken = credential.accessToken;
    return cachedAccessToken;
  } catch (err: any) {
    console.error("Error signing in with Google: ", err);
    throw err;
  }
}

export async function uploadFileToDrive(
  fileBlob: Blob,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<{ id: string; webViewLink?: string }> {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", fileBlob);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error subiendo a Google Drive: ${errorText}`);
  }

  return response.json();
}

export async function uploadPdfToDrive(
  pdfBlob: Blob,
  fileName: string,
  accessToken: string
): Promise<{ id: string; webViewLink?: string }> {
  return uploadFileToDrive(pdfBlob, fileName, "application/pdf", accessToken);
}

/**
 * Converts a standard Blob to Base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function sendFileByEmail(
  fileBlob: Blob,
  fileName: string,
  subject: string,
  bodyHtml: string,
  accessToken: string,
  mimeType: string = "application/pdf"
): Promise<any> {
  const base64File = await blobToBase64(fileBlob);
  const boundary = "solgram_boundary_split";
  const nl = "\r\n";

  // UTF-8 base64 encoder
  const encodeB64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
  const base64Body = encodeB64(bodyHtml);
  const safeSubject = `=?UTF-8?B?${encodeB64(subject)}?=`;

  const rawMime = [
    `To: solgramcontrol@gmail.com`,
    `Subject: ${safeSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Body,
    ``,
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${fileName}"`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64File,
    ``,
    `--${boundary}--`
  ].join(nl);

  // Since rawMime is purely ASCII now, standard btoa works directly
  const encodedMime = btoa(rawMime)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMime,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error enviando correo por Gmail: ${errorText}`);
  }

  return response.json();
}

/**
 * Sends a PDF file attached which is addressed to the admin (solgramcontrol@gmail.com) via Gmail API
 */
export async function sendPdfReportByEmail(
  pdfBlob: Blob,
  fileName: string,
  subject: string,
  bodyHtml: string,
  accessToken: string
): Promise<any> {
  return sendFileByEmail(pdfBlob, fileName, subject, bodyHtml, accessToken, "application/pdf");
}
