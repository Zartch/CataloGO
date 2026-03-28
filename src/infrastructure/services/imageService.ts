export interface BinaryImageValue {
  bytes: Uint8Array | null;
  mime: string | null;
}

function toBlobPart(bytes: Uint8Array) {
  return Uint8Array.from(bytes);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('No se pudo serializar la imagen.'));
    }, type, quality);
  });
}

async function drawIntoCanvas(file: File, maxWidth: number, maxHeight: number) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo preparar el lienzo para procesar la imagen.');
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function blobToBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function prepareItemPhoto(file: File): Promise<BinaryImageValue> {
  const canvas = await drawIntoCanvas(file, 800, 800);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.78);
  return {
    bytes: await blobToBytes(blob),
    mime: 'image/jpeg',
  };
}

export async function prepareLogo(file: File): Promise<BinaryImageValue> {
  if (file.type === 'image/svg+xml') {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type,
    };
  }

  if (file.size <= 500 * 1024) {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type || 'image/png',
    };
  }

  const canvas = await drawIntoCanvas(file, 1200, 1200);
  const blob = await canvasToBlob(canvas, 'image/png');
  return {
    bytes: await blobToBytes(blob),
    mime: 'image/png',
  };
}

export function createObjectUrl(bytes: Uint8Array | null, mime: string | null) {
  if (!bytes || !mime) {
    return null;
  }
  return URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: mime }));
}

export async function toPngBytes(bytes: Uint8Array, mime: string) {
  if (mime === 'image/png') {
    return bytes;
  }

  const blob = new Blob([toBlobPart(bytes)], { type: mime });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('No se pudo rasterizar la imagen.');
    }
    context.drawImage(image, 0, 0);
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    return blobToBytes(pngBlob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
