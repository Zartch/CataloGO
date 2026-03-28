import * as XLSX from 'xlsx';
import type { ImportExcelRow, ImportRowError } from '../../application/dto';

const EXPECTED_COLUMNS = [
  'codigo',
  'nombre',
  'precio',
  'unidad_medida',
  'descripcion',
  'categoria',
  'familia',
  'coleccion',
] as const;

type SheetMatrix = string[][];

interface ParseResult {
  rows: ImportExcelRow[];
  rowErrors: ImportRowError[];
}

interface ParsedPrice {
  precio: number;
  unidadMedida: string;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseDecimal(value: unknown) {
  const normalized = normalizeText(value);
  const numeric = normalized.match(/-?[\d.,]+/);
  if (!numeric) {
    return Number.NaN;
  }

  const compact = numeric[0].includes(',') && numeric[0].includes('.')
    ? numeric[0].replace(/\./g, '').replace(',', '.')
    : numeric[0].replace(',', '.');

  return Number(compact);
}

function isEmptyRow(row: unknown[]) {
  return row.every((cell) => !normalizeText(cell));
}

function findHeaderRowIndex(rows: SheetMatrix) {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return EXPECTED_COLUMNS.every((column) => normalized.includes(column));
  });
}

function findReportHeaderRowIndex(rows: SheetMatrix) {
  return rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized[0] === 'article' && normalized[5] === 'nom' && normalized.includes('preus');
  });
}

function parseHeaderTable(rows: SheetMatrix, headerRowIndex: number): ParseResult {
  const headers = rows[headerRowIndex].map(normalizeHeader);
  const parsedRows: ImportExcelRow[] = [];
  const rowErrors: ImportRowError[] = [];

  rows.slice(headerRowIndex + 1).forEach((row, index) => {
    if (isEmptyRow(row)) {
      return;
    }

    const rowNumber = headerRowIndex + index + 2;
    const normalized = Object.fromEntries(
      headers
        .map((header, columnIndex) => [header, row[columnIndex] ?? ''] as const)
        .filter(([header]) => header),
    );

    const codigo = normalizeText(normalized.codigo);
    const nombre = normalizeText(normalized.nombre);
    const unidadMedida = normalizeText(normalized.unidad_medida);
    const precio = parseDecimal(normalized.precio);

    if (!codigo || !nombre || !unidadMedida) {
      rowErrors.push({
        rowNumber,
        reason: 'codigo, nombre y unidad_medida son obligatorios',
      });
      return;
    }

    if (!Number.isFinite(precio) || precio < 0) {
      rowErrors.push({
        rowNumber,
        reason: 'precio invalido',
      });
      return;
    }

    parsedRows.push({
      rowNumber,
      codigo,
      nombre,
      precio,
      unidadMedida,
      descripcion: normalizeText(normalized.descripcion) || null,
      categoria: normalizeText(normalized.categoria) || null,
      familia: normalizeText(normalized.familia) || null,
      coleccion: normalizeText(normalized.coleccion) || null,
    });
  });

  return { rows: parsedRows, rowErrors };
}

function parseGroupValue(value: string) {
  const [, name = value] = value.split(',', 2);
  return normalizeText(name);
}

function isReportGroupRow(row: string[]) {
  const nonEmptyCells = row
    .map((cell, index) => [index, normalizeText(cell)] as const)
    .filter(([, cell]) => cell);

  return nonEmptyCells.length === 1 && nonEmptyCells[0][0] === 0;
}

function parsePrice(value: string): ParsedPrice | null {
  const normalized = normalizeText(value);
  const precio = parseDecimal(normalized);
  if (!Number.isFinite(precio) || precio < 0) {
    return null;
  }

  const unitMatch = normalized.match(/\/\s*([A-Za-z0-9._-]+)\s*$/);
  return {
    precio,
    unidadMedida: unitMatch?.[1]?.trim() || 'UN',
  };
}

function isReportItemRow(row: string[]) {
  const codigo = normalizeText(row[0]);
  const nombre = normalizeText(row[5]);
  return Boolean(codigo && nombre && !codigo.toLowerCase().startsWith('total'));
}

function parseReportTable(rows: SheetMatrix, headerRowIndex: number): ParseResult {
  const parsedRows: ImportExcelRow[] = [];
  const rowErrors: ImportRowError[] = [];
  const groupLevels: string[] = [];

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;

    if (isEmptyRow(row)) {
      continue;
    }

    if (isReportGroupRow(row)) {
      const groupLabel = normalizeText(row[0]);
      if (/^total\b/i.test(groupLabel)) {
        break;
      }
      if (/^tarifa\b/i.test(groupLabel)) {
        continue;
      }

      const groupValue = parseGroupValue(groupLabel);
      if (groupValue) {
        groupLevels.push(groupValue);
      }
      continue;
    }

    if (!isReportItemRow(row)) {
      continue;
    }

    const precio = parsePrice(row[16] ?? '');
    if (!precio) {
      rowErrors.push({
        rowNumber,
        reason: 'precio invalido',
      });
      continue;
    }

    const codigo = normalizeText(row[0]);
    const nombre = normalizeText(row[5]);
    const categoria = groupLevels[2] ?? null;
    const familia = groupLevels[1] ?? groupLevels[0] ?? null;
    const coleccion = groupLevels[1] ? groupLevels[0] : null;

    parsedRows.push({
      rowNumber,
      codigo,
      nombre,
      precio: precio.precio,
      unidadMedida: precio.unidadMedida,
      descripcion: null,
      categoria,
      familia,
      coleccion,
    });
  }

  return { rows: parsedRows, rowErrors };
}

export class ExcelImportService {
  async parse(file: File): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as SheetMatrix;

    const headerRowIndex = findHeaderRowIndex(matrix);
    if (headerRowIndex >= 0) {
      return parseHeaderTable(matrix, headerRowIndex);
    }

    const reportHeaderRowIndex = findReportHeaderRowIndex(matrix);
    if (reportHeaderRowIndex >= 0) {
      return parseReportTable(matrix, reportHeaderRowIndex);
    }

    return {
      rows: [],
      rowErrors: [
        {
          rowNumber: 1,
          reason: `No se encontro una tabla importable. Columnas esperadas: ${EXPECTED_COLUMNS.join(', ')}`,
        },
      ],
    };
  }
}
