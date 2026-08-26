/** Limita pentru sigle (firma sau client), aceeasi ca pe server */
export const MAX_LOGO_BYTES = 1024 * 1024;

export interface ImagineAleasa {
  /** continutul fisierului, codificat base64, fara prefixul "data:" */
  data: string;
  mimeType: string;
  /** data URL, folosit pentru previzualizare inainte de salvare */
  dataUrl: string;
}

/** Citeste un fisier ales de utilizator si il pregateste pentru trimitere */
export async function citesteImagine(file: File): Promise<ImagineAleasa> {
  if (file.size > MAX_LOGO_BYTES) throw new Error('Imaginea depășește 1 MB');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return { data: dataUrl.split(',')[1] ?? '', mimeType: file.type, dataUrl };
}

export const TIPURI_IMAGINE = 'image/png,image/jpeg,image/webp,image/svg+xml';
