import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import type { PdfCatalogData } from '../../application/dto';
import type { Item } from '../../domain/entities';
import { toPngBytes } from './imageService';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_BOTTOM = 54;
const FOOTER_BAND_HEIGHT = 32;
const GRID_COLUMNS = 2;
const GRID_GAP = 14;
const CARD_WIDTH = (PAGE_WIDTH - MARGIN * 2 - GRID_GAP) / GRID_COLUMNS;
const CARD_HEIGHT = 192;
const CARD_FOOTER_HEIGHT = 54;
const FAMILY_SEPARATOR_HEIGHT = 32;
const CATEGORY_SEPARATOR_HEIGHT = 24;
const HEADER_GAP = 10;
const BLOCK_GAP = 18;
const FRAME_THICKNESS = 0.6;
const CARD_BORDER_WIDTH = 0.35;
const GRADIENT_SEGMENTS = 40;

type PdfColor = ReturnType<typeof rgb>;
type EmbeddedFont = Awaited<ReturnType<PDFDocument['embedFont']>>;

interface CatalogEntry {
  familyName: string;
  categoryName: string;
  item: Item;
}

interface CatalogGroup {
  familyName: string;
  categoryName: string;
  items: Item[];
}

interface ThemeColors {
  primary: PdfColor;
  secondary: PdfColor;
  pageTint: PdfColor;
  border: PdfColor;
  placeholder: PdfColor;
  footerFill: PdfColor;
  footerText: PdfColor;
  bodyText: PdfColor;
  mutedText: PdfColor;
  cardFooter: PdfColor;
  cardFooterText: PdfColor;
  coverBandText: PdfColor;
  coverBodyText: PdfColor;
  familyFill: PdfColor;
  familyText: PdfColor;
  categoryFill: PdfColor;
  categoryText: PdfColor;
  gradientStart: PdfColor;
  gradientEnd: PdfColor;
}

interface PageState {
  page: PDFPage;
  cursorY: number;
  lastFamilyName: string | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(value: string) {
  const clean = value.replace('#', '');
  const normalized = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const parsed = Number.parseInt(normalized, 16);
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function mixColors(left: PdfColor, right: PdfColor, ratio: number) {
  const weight = clamp(ratio, 0, 1);
  return rgb(
    left.red + (right.red - left.red) * weight,
    left.green + (right.green - left.green) * weight,
    left.blue + (right.blue - left.blue) * weight,
  );
}

function lighten(color: PdfColor, amount: number) {
  return mixColors(color, rgb(1, 1, 1), amount);
}

function darken(color: PdfColor, amount: number) {
  return mixColors(color, rgb(0, 0, 0), amount);
}

function relativeLuminance(color: PdfColor) {
  const convertChannel = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return (
    convertChannel(color.red) * 0.2126 +
    convertChannel(color.green) * 0.7152 +
    convertChannel(color.blue) * 0.0722
  );
}

function contrastRatio(left: PdfColor, right: PdfColor) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const brightest = Math.max(leftLuminance, rightLuminance);
  const darkest = Math.min(leftLuminance, rightLuminance);
  return (brightest + 0.05) / (darkest + 0.05);
}

export function pickReadableTextColor(background: PdfColor) {
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  return contrastRatio(background, black) >= contrastRatio(background, white) ? black : white;
}

function fitTextToWidth(value: string, maxWidth: number, font: EmbeddedFont, size: number) {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return value;
  }

  let trimmed = value.trim();
  while (trimmed.length > 0 && font.widthOfTextAtSize(`${trimmed}...`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }

  return trimmed.length > 0 ? `${trimmed}...` : '...';
}

function buildTheme(primary: PdfColor, secondary: PdfColor): ThemeColors {
  const pageTint = mixColors(rgb(1, 1, 1), secondary, 0.2);
  const border = mixColors(primary, secondary, 0.5);
  const placeholder = mixColors(rgb(0.96, 0.95, 0.94), secondary, 0.25);
  const footerFill = mixColors(rgb(1, 1, 1), secondary, 0.55);
  const bodyText = pickReadableTextColor(pageTint);
  const mutedText = mixColors(bodyText, pageTint, 0.55);
  const cardFooter = mixColors(secondary, primary, 0.18);
  const familyFill = mixColors(primary, secondary, 0.28);
  const categoryFill = mixColors(secondary, primary, 0.18);

  return {
    primary,
    secondary,
    pageTint,
    border,
    placeholder,
    footerFill,
    footerText: pickReadableTextColor(footerFill),
    bodyText,
    mutedText,
    cardFooter,
    cardFooterText: pickReadableTextColor(cardFooter),
    coverBandText: pickReadableTextColor(primary),
    coverBodyText: pickReadableTextColor(secondary),
    familyFill,
    familyText: pickReadableTextColor(familyFill),
    categoryFill,
    categoryText: pickReadableTextColor(categoryFill),
    gradientStart: darken(primary, 0.16),
    gradientEnd: mixColors(primary, secondary, 0.6),
  };
}

function buildCatalogGroups(items: Item[]) {
  const entries: CatalogEntry[] = [];
  const unclassified: Item[] = [];

  for (const item of items) {
    if (item.categorias.length === 0) {
      unclassified.push(item);
      continue;
    }

    item.categorias.forEach((categoria) => {
      entries.push({
        familyName: categoria.familiaNombre,
        categoryName: categoria.nombre,
        item,
      });
    });
  }

  entries.sort((left, right) => {
    const familyResult = left.familyName.localeCompare(right.familyName, 'es', { sensitivity: 'base' });
    if (familyResult !== 0) {
      return familyResult;
    }
    const categoryResult = left.categoryName.localeCompare(right.categoryName, 'es', { sensitivity: 'base' });
    if (categoryResult !== 0) {
      return categoryResult;
    }
    return left.item.nombre.localeCompare(right.item.nombre, 'es', { sensitivity: 'base' });
  });

  const groups: CatalogGroup[] = [];
  for (const entry of entries) {
    const currentGroup = groups[groups.length - 1];
    if (
      currentGroup &&
      currentGroup.familyName === entry.familyName &&
      currentGroup.categoryName === entry.categoryName
    ) {
      currentGroup.items.push(entry.item);
      continue;
    }

    groups.push({
      familyName: entry.familyName,
      categoryName: entry.categoryName,
      items: [entry.item],
    });
  }

  if (unclassified.length > 0) {
    groups.push({
      familyName: 'Sin clasificacion',
      categoryName: 'Sin categoria',
      items: unclassified,
    });
  }

  return groups;
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

function drawHorizontalGradient(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  start: PdfColor,
  end: PdfColor,
) {
  const segmentWidth = width / GRADIENT_SEGMENTS;

  for (let index = 0; index < GRADIENT_SEGMENTS; index += 1) {
    page.drawRectangle({
      x: x + segmentWidth * index,
      y,
      width: segmentWidth + 0.25,
      height,
      color: mixColors(start, end, index / Math.max(1, GRADIENT_SEGMENTS - 1)),
    });
  }
}

function drawGradientFrame(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  start: PdfColor,
  end: PdfColor,
) {
  drawHorizontalGradient(page, x, y + height - FRAME_THICKNESS, width, FRAME_THICKNESS, start, end);
  drawHorizontalGradient(page, x, y, width, FRAME_THICKNESS, end, start);

  page.drawRectangle({
    x,
    y,
    width: FRAME_THICKNESS,
    height,
    color: start,
  });

  page.drawRectangle({
    x: x + width - FRAME_THICKNESS,
    y,
    width: FRAME_THICKNESS,
    height,
    color: end,
  });
}

function drawSeparator(
  page: PDFPage,
  label: string,
  x: number,
  cursorY: number,
  width: number,
  height: number,
  fillColor: PdfColor,
  startColor: PdfColor,
  endColor: PdfColor,
  textColor: PdfColor,
  font: EmbeddedFont,
  fontSize: number,
) {
  const y = cursorY - height;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: fillColor,
  });
  drawGradientFrame(page, x, y, width, height, startColor, endColor);

  page.drawText(fitTextToWidth(label, width - 24, font, fontSize), {
    x: x + 12,
    y: y + height / 2 - fontSize * 0.35,
    size: fontSize,
    color: textColor,
    font,
  });

  return y - HEADER_GAP;
}

function createContentPage(pdf: PDFDocument, theme: ThemeColors): PageState {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: theme.pageTint,
  });

  return {
    page,
    cursorY: PAGE_HEIGHT - MARGIN,
    lastFamilyName: null,
  };
}

function canFit(cursorY: number, requiredHeight: number) {
  return cursorY - requiredHeight >= CONTENT_BOTTOM;
}

function getRowsThatFit(cursorY: number) {
  return Math.max(0, Math.floor((cursorY - CONTENT_BOTTOM + GRID_GAP) / (CARD_HEIGHT + GRID_GAP)));
}

async function drawItemCard(
  pdf: PDFDocument,
  page: PDFPage,
  item: Item,
  x: number,
  y: number,
  currency: string,
  theme: ThemeColors,
  showDescription: boolean,
  showPriceAndUnit: boolean,
  font: EmbeddedFont,
  boldFont: EmbeddedFont,
) {
  const imageHeight = CARD_HEIGHT - CARD_FOOTER_HEIGHT;
  const image = await embedImage(pdf, item.fotografia, item.fotografiaMime);
  const cardTextWidth = CARD_WIDTH - 16;

  page.drawRectangle({
    x,
    y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    color: rgb(1, 1, 1),
    borderColor: theme.border,
    borderWidth: CARD_BORDER_WIDTH,
  });

  page.drawRectangle({
    x,
    y,
    width: CARD_WIDTH,
    height: CARD_FOOTER_HEIGHT,
    color: theme.cardFooter,
  });

  if (image) {
    drawContainedImage(page, image, x + 8, y + CARD_FOOTER_HEIGHT + 8, CARD_WIDTH - 16, imageHeight - 16);
  } else {
    page.drawRectangle({
      x: x + 8,
      y: y + CARD_FOOTER_HEIGHT + 8,
      width: CARD_WIDTH - 16,
      height: imageHeight - 16,
      color: theme.placeholder,
    });

    const placeholderLabel = 'Sin foto';
    page.drawText(placeholderLabel, {
      x: x + CARD_WIDTH / 2 - boldFont.widthOfTextAtSize(placeholderLabel, 10) / 2,
      y: y + CARD_FOOTER_HEIGHT + imageHeight / 2 - 5,
      size: 10,
      color: pickReadableTextColor(theme.placeholder),
      font: boldFont,
    });
  }

  page.drawText(fitTextToWidth(item.nombre, cardTextWidth, boldFont, 10), {
    x: x + 8,
    y: y + 31,
    size: 10,
    color: theme.cardFooterText,
    font: boldFont,
  });

  const metaLabel = showPriceAndUnit
    ? `${item.precio.toFixed(2)} ${currency} / ${item.unidadMedida}`
    : item.unidadMedida;

  page.drawText(fitTextToWidth(metaLabel, cardTextWidth, font, 8), {
    x: x + 8,
    y: y + 19,
    size: 8,
    color: theme.cardFooterText,
    font,
  });

  if (showDescription && item.descripcion) {
    page.drawText(fitTextToWidth(item.descripcion, cardTextWidth, font, 7), {
      x: x + 8,
      y: y + 8,
      size: 7,
      color: theme.cardFooterText,
      font,
    });
  }
}

function drawCover(
  cover: PDFPage,
  data: PdfCatalogData,
  theme: ThemeColors,
  logo: PDFImage | null,
  familySummary: string,
  font: EmbeddedFont,
  boldFont: EmbeddedFont,
) {
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: theme.secondary });
  cover.drawRectangle({ x: 0, y: PAGE_HEIGHT - 170, width: PAGE_WIDTH, height: 170, color: theme.primary });

  drawHorizontalGradient(
    cover,
    0,
    PAGE_HEIGHT - 170 - FRAME_THICKNESS,
    PAGE_WIDTH,
    FRAME_THICKNESS,
    theme.gradientStart,
    theme.gradientEnd,
  );

  if (logo) {
    const dims = logo.scale(Math.min(0.22, 110 / Math.max(logo.height, 1)));
    cover.drawImage(logo, {
      x: PAGE_WIDTH / 2 - dims.width / 2,
      y: PAGE_HEIGHT - 252,
      width: dims.width,
      height: dims.height,
    });
  }

  const infoBoxX = MARGIN;
  const infoBoxWidth = PAGE_WIDTH - MARGIN * 2;
  const infoBoxY = PAGE_HEIGHT - 520;
  const infoBoxHeight = 190;

  cover.drawRectangle({
    x: infoBoxX,
    y: infoBoxY,
    width: infoBoxWidth,
    height: infoBoxHeight,
    color: lighten(theme.secondary, 0.08),
  });
  drawGradientFrame(
    cover,
    infoBoxX,
    infoBoxY,
    infoBoxWidth,
    infoBoxHeight,
    theme.gradientStart,
    theme.gradientEnd,
  );

  const companyName = fitTextToWidth(data.configuracion.nombreCompania || 'CataloGo', infoBoxWidth - 36, boldFont, 28);
  cover.drawText(companyName, {
    x: infoBoxX + 18,
    y: infoBoxY + infoBoxHeight - 44,
    size: 28,
    color: theme.coverBodyText,
    font: boldFont,
  });

  cover.drawText(fitTextToWidth(data.coleccion.nombre, infoBoxWidth - 36, font, 16), {
    x: infoBoxX + 18,
    y: infoBoxY + infoBoxHeight - 84,
    size: 16,
    color: theme.coverBodyText,
    font,
  });

  cover.drawText(fitTextToWidth(familySummary, infoBoxWidth - 36, font, 12), {
    x: infoBoxX + 18,
    y: infoBoxY + infoBoxHeight - 108,
    size: 12,
    color: theme.coverBodyText,
    font,
  });

  let detailY = infoBoxY + infoBoxHeight - 134;
  if (data.options.mostrarSubtitulo && data.configuracion.subtitulo) {
    cover.drawText(fitTextToWidth(data.configuracion.subtitulo, infoBoxWidth - 36, font, 13), {
      x: infoBoxX + 18,
      y: detailY,
      size: 13,
      color: theme.coverBodyText,
      font,
    });
    detailY -= 24;
  }

  if (data.options.mostrarContacto) {
    const coverContact = [data.configuracion.email, data.configuracion.telefono].filter(Boolean).join(' | ');
    if (coverContact) {
      cover.drawText(fitTextToWidth(coverContact, infoBoxWidth - 36, font, 12), {
        x: infoBoxX + 18,
        y: detailY,
        size: 12,
        color: theme.coverBodyText,
        font,
      });
    }
  }

  cover.drawText('Catalogo', {
    x: MARGIN,
    y: PAGE_HEIGHT - 70,
    size: 16,
    color: theme.coverBandText,
    font: boldFont,
  });
}

function drawFooter(
  page: PDFPage,
  pageIndex: number,
  totalPages: number,
  theme: ThemeColors,
  logo: PDFImage | null,
  footerContact: string,
  font: EmbeddedFont,
) {
  if (pageIndex > 0) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: FOOTER_BAND_HEIGHT,
      color: theme.footerFill,
    });
    drawHorizontalGradient(page, 0, FOOTER_BAND_HEIGHT - FRAME_THICKNESS, PAGE_WIDTH, FRAME_THICKNESS, theme.gradientEnd, theme.gradientStart);

    if (logo) {
      const dims = logo.scale(0.08);
      page.drawImage(logo, {
        x: MARGIN,
        y: 6,
        width: dims.width,
        height: dims.height,
      });
    }

    if (footerContact) {
      page.drawText(fitTextToWidth(footerContact, PAGE_WIDTH - MARGIN * 2 - 110, font, 9), {
        x: MARGIN + (logo ? 52 : 0),
        y: 18,
        size: 9,
        color: theme.footerText,
        font,
      });
    }
  }

  const pageNumberColor = pageIndex > 0 ? theme.footerText : theme.coverBodyText;
  page.drawText(`${pageIndex + 1} / ${totalPages}`, {
    x: PAGE_WIDTH - 80,
    y: 18,
    size: 10,
    color: pageNumberColor,
    font,
  });
}

export class PdfService {
  async generate(data: PdfCatalogData) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const primary = hexToRgb(data.configuracion.colorPrimario);
    const secondary = hexToRgb(data.configuracion.colorSecundario);
    const theme = buildTheme(primary, secondary);
    const logo = await embedImage(pdf, data.configuracion.logo, data.configuracion.logoMime);
    const groups = buildCatalogGroups(data.items);
    const familySummary = data.options.familiaIds.length > 0 ? 'Familias seleccionadas' : 'Todas las familias';

    const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawCover(cover, data, theme, logo, familySummary, font, boldFont);

    if (groups.length === 0) {
      const emptyPage = createContentPage(pdf, theme);
      emptyPage.page.drawText('La seleccion no contiene items.', {
        x: MARGIN,
        y: PAGE_HEIGHT - 100,
        size: 18,
        color: theme.bodyText,
        font: boldFont,
      });
    } else {
      let currentPage: PageState | null = null;

      for (const group of groups) {
        let itemIndex = 0;

        while (itemIndex < group.items.length) {
          if (!currentPage) {
            currentPage = createContentPage(pdf, theme);
          }

          let needsFamilySeparator = currentPage.lastFamilyName !== group.familyName;
          const minimumHeight =
            (needsFamilySeparator ? FAMILY_SEPARATOR_HEIGHT + HEADER_GAP : 0) +
            CATEGORY_SEPARATOR_HEIGHT +
            HEADER_GAP +
            CARD_HEIGHT;

          if (!canFit(currentPage.cursorY, minimumHeight)) {
            currentPage = createContentPage(pdf, theme);
            needsFamilySeparator = true;
          }

          if (needsFamilySeparator) {
            currentPage.cursorY = drawSeparator(
              currentPage.page,
              group.familyName,
              MARGIN,
              currentPage.cursorY,
              PAGE_WIDTH - MARGIN * 2,
              FAMILY_SEPARATOR_HEIGHT,
              theme.familyFill,
              theme.gradientStart,
              theme.gradientEnd,
              theme.familyText,
              boldFont,
              14,
            );
            currentPage.lastFamilyName = group.familyName;
          }

          currentPage.cursorY = drawSeparator(
            currentPage.page,
            group.categoryName,
            MARGIN + 12,
            currentPage.cursorY,
            PAGE_WIDTH - MARGIN * 2 - 12,
            CATEGORY_SEPARATOR_HEIGHT,
            theme.categoryFill,
            theme.gradientStart,
            theme.gradientEnd,
            theme.categoryText,
            font,
            11,
          );

          const rowsThatFit = getRowsThatFit(currentPage.cursorY);
          const chunkSize = Math.min(group.items.length - itemIndex, rowsThatFit * GRID_COLUMNS);

          for (let localIndex = 0; localIndex < chunkSize; localIndex += 1) {
            const column = localIndex % GRID_COLUMNS;
            const row = Math.floor(localIndex / GRID_COLUMNS);
            const x = MARGIN + column * (CARD_WIDTH + GRID_GAP);
            const y = currentPage.cursorY - CARD_HEIGHT - row * (CARD_HEIGHT + GRID_GAP);

            await drawItemCard(
              pdf,
              currentPage.page,
              group.items[itemIndex + localIndex],
              x,
              y,
              data.configuracion.moneda,
              theme,
              data.options.mostrarDescripcion,
              data.options.mostrarPrecioUnidad,
              font,
              boldFont,
            );
          }

          const rowsUsed = Math.ceil(chunkSize / GRID_COLUMNS);
          currentPage.cursorY -= rowsUsed * CARD_HEIGHT + Math.max(0, rowsUsed - 1) * GRID_GAP + BLOCK_GAP;
          itemIndex += chunkSize;
        }
      }
    }

    const pages = pdf.getPages();
    const footerContact =
      data.options.mostrarContacto
        ? [data.configuracion.email, data.configuracion.telefono].filter(Boolean).join(' | ')
        : '';

    pages.forEach((page, index) => {
      drawFooter(page, index, pages.length, theme, logo, footerContact, font);
    });

    return pdf.save();
  }
}
