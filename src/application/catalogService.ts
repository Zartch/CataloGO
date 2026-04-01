import type {
  GeneratePdfCommand,
  ImportExcelResult,
  ItemListQuery,
  SaveItemCommand,
} from './dto';
import type { Configuracion, EntityId, NamedEntity } from '../domain/entities';
import type { RepositoryBundle } from '../domain/repositories';
import type { ExcelImportService } from '../infrastructure/services/excelImportService';
import type { PdfService } from '../infrastructure/services/pdfService';

function assertRequired(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`El campo "${label}" es obligatorio.`);
  }
}

export class CatalogService {
  constructor(
    private readonly repositories: RepositoryBundle,
    private readonly excelService: ExcelImportService,
    private readonly pdfService: PdfService,
  ) {}

  async initialize() {
    await this.repositories.database.initialize();
  }

  async getDashboardSummary() {
    return this.repositories.dashboard.getSummary();
  }

  async listItems(query: ItemListQuery) {
    return this.repositories.items.list(query);
  }

  async getItem(id: EntityId) {
    return this.repositories.items.getById(id);
  }

  async getNextItemWithoutPhoto(excludedIds: EntityId[] = []) {
    return this.repositories.items.getNextWithoutPhoto(excludedIds);
  }

  async saveItem(command: SaveItemCommand) {
    assertRequired(command.codigo, 'codigo');
    assertRequired(command.nombre, 'nombre');
    assertRequired(command.unidadMedida, 'unidad_medida');

    if (!Number.isFinite(command.precio) || command.precio < 0) {
      throw new Error('El precio debe ser un numero positivo.');
    }

    const existing = await this.repositories.items.getByCodigo(command.codigo.trim());
    if (existing && existing.id !== command.id) {
      throw new Error('El codigo ya existe.');
    }

    return this.repositories.items.save({
      ...command,
      codigo: command.codigo.trim(),
      nombre: command.nombre.trim(),
      unidadMedida: command.unidadMedida.trim(),
      descripcion: command.descripcion?.trim() || null,
    });
  }

  async deleteItem(id: EntityId) {
    await this.repositories.items.delete(id);
  }

  async listCategorias() {
    return this.repositories.categorias.list();
  }

  async saveCategoria(entity: Partial<NamedEntity> & { nombre: string }) {
    assertRequired(entity.nombre, 'nombre');
    return this.repositories.categorias.save({ ...entity, nombre: entity.nombre.trim() });
  }

  async deleteCategoria(id: EntityId) {
    await this.repositories.categorias.delete(id);
  }

  async listFamilias() {
    return this.repositories.familias.list();
  }

  async saveFamilia(entity: Partial<NamedEntity> & { nombre: string }) {
    assertRequired(entity.nombre, 'nombre');
    return this.repositories.familias.save({ ...entity, nombre: entity.nombre.trim() });
  }

  async deleteFamilia(id: EntityId) {
    await this.repositories.familias.delete(id);
  }

  async listColecciones() {
    return this.repositories.colecciones.listWithCounts();
  }

  async listColeccionesFlat() {
    return this.repositories.colecciones.list();
  }

  async getColeccion(id: EntityId) {
    return this.repositories.colecciones.getById(id);
  }

  async saveColeccion(entity: Partial<NamedEntity> & { nombre: string }) {
    assertRequired(entity.nombre, 'nombre');
    return this.repositories.colecciones.save({ ...entity, nombre: entity.nombre.trim() });
  }

  async deleteColeccion(id: EntityId) {
    await this.repositories.colecciones.delete(id);
  }

  async addItemsToCollection(collectionId: EntityId, itemIds: EntityId[]) {
    await this.repositories.items.addItemsToCollection(collectionId, itemIds);
  }

  async removeItemFromCollection(collectionId: EntityId, itemId: EntityId) {
    await this.repositories.items.removeItemFromCollection(collectionId, itemId);
  }

  async getConfiguracion() {
    return this.repositories.configuracion.get();
  }

  async saveConfiguracion(configuracion: Configuracion) {
    if (!configuracion.moneda) {
      throw new Error('La moneda es obligatoria.');
    }

    await this.repositories.configuracion.save({
      ...configuracion,
      nombreCompania: configuracion.nombreCompania.trim(),
      subtitulo: configuracion.subtitulo?.trim() || null,
      email: configuracion.email?.trim() || null,
      telefono: configuracion.telefono?.trim() || null,
    });
  }

  async importExcel(file: File): Promise<ImportExcelResult> {
    const parsedRows = await this.excelService.parse(file);
    const rowErrors = [...parsedRows.rowErrors];
    let importedCount = 0;
    let updatedCount = 0;
    const createdCategories = new Set<number>();
    const createdFamilies = new Set<number>();
    const createdCollections = new Set<number>();

    for (const row of parsedRows.rows) {
      try {
        const existing = await this.repositories.items.getByCodigo(row.codigo);
        const categoriaId = row.categoria
          ? await this.repositories.importSupport.ensureCategoria(row.categoria)
          : null;
        const familiaId = row.familia
          ? await this.repositories.importSupport.ensureFamilia(row.familia)
          : null;
        const coleccionId = row.coleccion
          ? await this.repositories.importSupport.ensureColeccion(row.coleccion)
          : null;

        if (categoriaId) {
          createdCategories.add(categoriaId);
        }
        if (familiaId) {
          createdFamilies.add(familiaId);
        }
        if (coleccionId) {
          createdCollections.add(coleccionId);
        }

        const currentCollectionIds = existing?.colecciones.map((item) => item.id) ?? [];
        if (coleccionId && !currentCollectionIds.includes(coleccionId)) {
          currentCollectionIds.push(coleccionId);
        }

        await this.saveItem({
          id: existing?.id,
          codigo: row.codigo,
          nombre: row.nombre,
          precio: row.precio,
          unidadMedida: row.unidadMedida,
          descripcion: row.descripcion,
          categoriaId,
          familiaId,
          fotografia: existing?.fotografia ?? null,
          fotografiaMime: existing?.fotografiaMime ?? null,
          collectionIds: currentCollectionIds,
        });

        if (existing) {
          updatedCount += 1;
        } else {
          importedCount += 1;
        }
      } catch (error) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          reason: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return {
      importedCount,
      updatedCount,
      createdCategories: createdCategories.size,
      createdFamilies: createdFamilies.size,
      createdCollections: createdCollections.size,
      rowErrors,
    };
  }

  async exportDatabase() {
    return this.repositories.database.exportBinary();
  }

  async importDatabase(file: File) {
    const buffer = await file.arrayBuffer();
    await this.repositories.database.importBinary(new Uint8Array(buffer));
  }

  async generatePdf(command: GeneratePdfCommand) {
    const coleccion = await this.repositories.colecciones.getById(command.coleccionId);
    if (!coleccion) {
      throw new Error('La coleccion seleccionada no existe.');
    }

    const items = (
      await this.repositories.items.list({
        coleccionId: command.coleccionId,
        sortBy: 'familia',
        sortDir: 'asc',
        page: 1,
        pageSize: 1000,
      })
    ).items;

    const configuracion = await this.repositories.configuracion.get();
    return this.pdfService.generate({
      coleccion,
      configuracion,
      items,
      options: command,
    });
  }
}
