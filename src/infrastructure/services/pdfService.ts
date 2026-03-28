import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import type { PdfCatalogData } from '../../application/dto';
import type { Item } from '../../domain/entities';
import { toPngBytes } from './imageService';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const GRID_COLUMNS = 2;
const GRID_ROWS = 3;
const GRID_GAP = 14;
const CARD_WIDTH = (PAGE_WIDTH - MARGIN * 2 - GRID_GAP) / GRID_COLUMNS;
const CARD_HEIGHT = 214;
const CARD_FOOTER_HEIGHT = 40;

function hexToRgb(value: string) {
  const clean = value.replace('#', '');
  const normalized = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const parsed = Number.parseInt(normalized, 16);
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function groupItems(items: Item[]) {
  const withHierarchy = items.filter((item) => item.familiaNombre || item.categoriaNombre);
  const withoutHierarchy = items.filter((item) => !item.familiaNombre && !item.categoriaNombre);
  const groups = new Map<string, Map<string, Item[]>>();

  for (const item of withHierarchy) {
    const familia = item.familiaNombre ?? 'Sin familia';
    const categoria = item.categoriaNombre ?? 'Sin categoria';
    const familyGroup = groups.get(familia) ?? new Map<string, Item[]>();
    const categoryGroup = familyGroup.get(categoria) ?? [];
    categoryGroup.push(item);
    familyGroup.set(categoria, categoryGroup);
    groups.set(familia, familyGroup);
  }

  return { groups, withoutHierarchy };
}

function flattenItems(items: Item[]) {
  const ordered: Item[] = [];
  const { groups, withoutHierarchy } = groupItems(items);

  for (const [, categoryMap] of groups.entries()) {
    for (const [, groupedItems] of categoryMap.entries()) {
      ordered.push(...groupedItems);
    }
  }

  ordered.push(...withoutHierarchy);
  return ordered;
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null, mime: string | null) {
  if (!bytes || !mime) {
    return null;
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return pdf.embedJpg(bytes);
  }
  const pngBytes = await toPngBytes(bytes, mime);
  return pdf.embedPng(pngBytes);
}

function drawContainedImage(
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

export class PdfService {
  async generate(data: PdfCatalogData) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const primary = hexToRgb(data.configuracion.colorPrimario);
    const secondary = hexToRgb(data.configuracion.colorSecundario);
    const logo = await embedImage(pdf, data.configuracion.logo, data.configuracion.logoMime);
    const orderedItems = flattenItems(data.items);

    const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: secondary });
    cover.drawRectangle({ x: 0, y: PAGE_HEIGHT - 170, width: PAGE_WIDTH, height: 170, color: primary });

    if (logo) {
      const dims = logo.scale(0.22);
      cover.drawImage(logo, {
        x: PAGE_WIDTH / 2 - dims.width / 2,
        y: PAGE_HEIGHT - 250,
        width: dims.width,
        height: dims.height,
      });
    }

    cover.drawText(data.configuracion.nombreCompania || 'CataloGo', {
      x: MARGIN,
      y: PAGE_HEIGHT - 320,
      size: 28,
      color: rgb(1, 1, 1),
      font: boldFont,
    });
    cover.drawText(data.coleccion.nombre, {
      x: MARGIN,
      y: PAGE_HEIGHT - 365,
      size: 16,
      color: rgb(1, 1, 1),
      font,
    });

    if (data.options.mostrarSubtitulo && data.configuracion.subtitulo) {
      cover.drawText(data.configuracion.subtitulo, {
        x: MARGIN,
        y: PAGE_HEIGHT - 392,
        size: 13,
        color: rgb(1, 1, 1),
        font,
      });
    }

    if (data.options.mostrarContacto) {
      const coverContact = [data.configuracion.email, data.configuracion.telefono]
        .filter(Boolean)
        .join(' | ');
      if (coverContact) {
        cover.drawText(coverContact, {
          x: MARGIN,
          y: PAGE_HEIGHT - 418,
          size: 12,
          color: rgb(1, 1, 1),
          font,
        });
      }
    }

    if (orderedItems.length === 0) {
      const emptyPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      emptyPage.drawText('La coleccion no contiene items.', {
        x: MARGIN,
        y: PAGE_HEIGHT - 100,
        size: 18,
        color: primary,
        font: boldFont,
      });
    }

    const pageSize = GRID_COLUMNS * GRID_ROWS;
    for (let pageStart = 0; pageStart < orderedItems.length; pageStart += pageSize) {
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const chunk = orderedItems.slice(pageStart, pageStart + pageSize);

      for (const [itemIndex, item] of chunk.entries()) {
        const column = itemIndex % GRID_COLUMNS;
        const row = Math.floor(itemIndex / GRID_COLUMNS);
        const x = MARGIN + column * (CARD_WIDTH + GRID_GAP);
        const y = PAGE_HEIGHT - MARGIN - (row + 1) * CARD_HEIGHT - row * GRID_GAP;
        const imageHeight = CARD_HEIGHT - CARD_FOOTER_HEIGHT;

        page.drawRectangle({
          x,
          y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          color: rgb(1, 1, 1),
          borderColor: secondary,
          borderWidth: 1,
        });

        page.drawRectangle({
          x,
          y,
          width: CARD_WIDTH,
          height: CARD_FOOTER_HEIGHT,
          color: secondary,
        });

        const image = await embedImage(pdf, item.fotografia, item.fotografiaMime);
        if (image) {
          drawContainedImage(page, image, x + 8, y + CARD_FOOTER_HEIGHT + 8, CARD_WIDTH - 16, imageHeight - 16);
        } else {
          page.drawRectangle({
            x: x + 8,
            y: y + CARD_FOOTER_HEIGHT + 8,
            width: CARD_WIDTH - 16,
            height: imageHeight - 16,
            color: rgb(0.97, 0.95, 0.92),
          });
          page.drawText('Sin foto', {
            x: x + CARD_WIDTH / 2 - 18,
            y: y + CARD_FOOTER_HEIGHT + imageHeight / 2,
            size: 10,
            color: primary,
            font: boldFont,
          });
        }

        page.drawText(item.nombre.slice(0, 28), {
          x: x + 8,
          y: y + 24,
          size: 10,
          color: primary,
          font: boldFont,
        });

        const meta = [item.familiaNombre ?? 'Sin familia', item.categoriaNombre ?? 'Sin categoria']
          .join(' / ')
          .slice(0, 34);
        page.drawText(meta, {
          x: x + 8,
          y: y + 13,
          size: 7,
          color: rgb(0.32, 0.32, 0.32),
          font,
        });

        if (data.options.mostrarPrecioUnidad) {
          page.drawText(`${item.precio.toFixed(2)} ${data.configuracion.moneda} / ${item.unidadMedida}`, {
            x: x + CARD_WIDTH - 98,
            y: y + 24,
            size: 8,
            color: rgb(0.22, 0.22, 0.22),
            font,
          });
        } else {
          page.drawText(item.unidadMedida.slice(0, 12), {
            x: x + CARD_WIDTH - 44,
            y: y + 24,
            size: 8,
            color: rgb(0.22, 0.22, 0.22),
            font,
          });
        }
      }
    }

    const pages = pdf.getPages();
    const footerContact =
      data.options.mostrarContacto
        ? [data.configuracion.email, data.configuracion.telefono].filter(Boolean).join(' | ')
        : '';

    pages.forEach((page, index) => {
      const total = pages.length;

      page.drawText(`${index + 1} / ${total}`, {
        x: PAGE_WIDTH - 80,
        y: 18,
        size: 10,
        color: rgb(0.35, 0.35, 0.35),
        font,
      });

      if (index > 0 && logo) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          height: 32,
          color: rgb(0.96, 0.93, 0.89),
        });
        const dims = logo.scale(0.08);
        page.drawImage(logo, {
          x: MARGIN,
          y: 6,
          width: dims.width,
          height: dims.height,
        });
      }

      if (index > 0 && footerContact) {
        page.drawText(footerContact, {
          x: MARGIN + (logo ? 52 : 0),
          y: 18,
          size: 9,
          color: rgb(0.35, 0.35, 0.35),
          font,
        });
      }
    });

    return pdf.save();
  }
}
