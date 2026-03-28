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

export class ExcelImportService {
  async parse(file: File): Promise<{ rows: ImportExcelRow[]; rowErrors: ImportRowError[] }> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: '',
    });

    const rows: ImportExcelRow[] = [];
    const rowErrors: ImportRowError[] = [];

    jsonRows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const normalized = Object.fromEntries(
        Object.entries(rawRow).map(([key, value]) => [key.trim().toLowerCase(), value]),
      );

      const missingColumns = EXPECTED_COLUMNS.filter(
        (column) => !(column in normalized),
      );
      if (missingColumns.length > 0) {
        rowErrors.push({
          rowNumber,
          reason: `Faltan columnas esperadas: ${missingColumns.join(', ')}`,
        });
        return;
      }

      const codigo = String(normalized.codigo).trim();
      const nombre = String(normalized.nombre).trim();
      const unidadMedida = String(normalized.unidad_medida).trim();
      const precio = Number(String(normalized.precio).replace(',', '.'));

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

      rows.push({
        rowNumber,
        codigo,
        nombre,
        precio,
        unidadMedida,
        descripcion: String(normalized.descripcion || '').trim() || null,
        categoria: String(normalized.categoria || '').trim() || null,
        familia: String(normalized.familia || '').trim() || null,
        coleccion: String(normalized.coleccion || '').trim() || null,
      });
    });

    return { rows, rowErrors };
  }
}
