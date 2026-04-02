import { PDFDocument, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { PdfCatalogData } from '../../application/dto';
import type { Item } from '../../domain/entities';
import { PdfService, pickReadableTextColor } from './pdfService';

function buildItem(
  id: number,
  name: string,
  familyId: number,
  familyName: string,
  categoryId: number,
  categoryName: string,
): Item {
  return {
    id,
    codigo: `SKU-${id}`,
    nombre: name,
    precio: 10 + id,
    unidadMedida: 'unidad',
    descripcion: `Descripcion ${id}`,
    fotografia: null,
    fotografiaMime: null,
    categorias: [
      {
        id: categoryId,
        nombre: categoryName,
        familiaId: familyId,
        familiaNombre: familyName,
        sortOrder: id,
      },
    ],
    colecciones: [],
  };
}

describe('pdfService helpers', () => {
  it('elige texto negro para fondos claros y blanco para fondos oscuros', () => {
    expect(pickReadableTextColor(rgb(0.95, 0.95, 0.95))).toMatchObject({ red: 0, green: 0, blue: 0 });
    expect(pickReadableTextColor(rgb(0.12, 0.12, 0.12))).toMatchObject({ red: 1, green: 1, blue: 1 });
  });
});

describe('PdfService', () => {
  it('aprovecha la pagina colocando varias categorias cuando caben', async () => {
    const data: PdfCatalogData = {
      configuracion: {
        id: 1,
        nombreCompania: 'Empresa Demo',
        subtitulo: 'Coleccion de temporada',
        logo: null,
        logoMime: null,
        email: 'hola@demo.test',
        telefono: '600000000',
        colorPrimario: '#c59b28',
        colorSecundario: '#f5ecd1',
        moneda: 'EUR',
      },
      coleccion: {
        id: 7,
        nombre: 'Primavera',
      },
      items: [
        buildItem(1, 'Articulo 1', 10, 'Muebles', 100, 'Mesas'),
        buildItem(2, 'Articulo 2', 10, 'Muebles', 100, 'Mesas'),
        buildItem(3, 'Articulo 3', 10, 'Muebles', 101, 'Sillas'),
        buildItem(4, 'Articulo 4', 10, 'Muebles', 101, 'Sillas'),
      ],
      options: {
        coleccionId: 7,
        familiaIds: [],
        mostrarPrecioUnidad: true,
        mostrarDescripcion: true,
        mostrarSubtitulo: true,
        mostrarContacto: true,
      },
    };

    const bytes = await new PdfService().generate(data);
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPages()).toHaveLength(2);
  });
});
