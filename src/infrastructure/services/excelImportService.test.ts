import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelImportService } from './excelImportService';

function buildFile(rows: string[][], name = 'import.xlsx') {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function sparseRow(length: number, values: Record<number, string>) {
  const row = new Array<string>(length).fill('');
  Object.entries(values).forEach(([index, value]) => {
    row[Number(index)] = value;
  });
  return row;
}

describe('ExcelImportService', () => {
  it('detecta una tabla con cabecera desplazada y la importa', async () => {
    const service = new ExcelImportService();
    const file = buildFile([
      ['Informe exportado'],
      [''],
      ['codigo', 'nombre', 'precio', 'unidad_medida', 'descripcion', 'categoria', 'familia', 'coleccion'],
      ['A-1', 'Articulo A', '12,5', 'unidad', 'Texto', 'Categoria A', 'Familia A', 'Coleccion A'],
    ]);

    const result = await service.parse(file);

    expect(result.rowErrors).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 4,
        codigo: 'A-1',
        nombre: 'Articulo A',
        precio: 12.5,
        unidadMedida: 'unidad',
        descripcion: 'Texto',
        categoria: 'Categoria A',
        familia: 'Familia A',
        coleccion: 'Coleccion A',
      },
    ]);
  });

  it('importa el formato de listado ERP agrupado del .xls real', async () => {
    const service = new ExcelImportService();
    const file = buildFile([
      ['Empresa: Demo'],
      [''],
      sparseRow(17, { 0: 'Article', 5: 'Nom', 11: 'Tarifa', 15: 'Mon', 16: 'Preus' }),
      ['Tarifa P:V:P:'],
      ['25, TEMPORADA'],
      ['25, PASQUA'],
      sparseRow(17, { 0: '2525098', 5: 'ANECS PIRATES', 11: 'P:V:P:', 15: 'EUR', 16: '13,00 €/UN' }),
      ['Total 1 registros en el informe'],
    ], 'import.xls');

    const result = await service.parse(file);

    expect(result.rowErrors).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 7,
        codigo: '2525098',
        nombre: 'ANECS PIRATES',
        precio: 13,
        unidadMedida: 'UN',
        descripcion: null,
        categoria: null,
        familia: 'PASQUA',
        coleccion: 'TEMPORADA',
      },
    ]);
  });
});
