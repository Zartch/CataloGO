import type {
  Categoria,
  CollectionLink,
  Configuracion,
  EntityId,
  Familia,
  Item,
  NamedEntity,
} from '../domain/entities';

export type ItemSortField =
  | 'nombre'
  | 'codigo'
  | 'precio'
  | 'categoria'
  | 'familia'
  | 'coleccion';

export type SortDirection = 'asc' | 'desc';

export interface ItemListQuery {
  texto?: string;
  categoriaId?: EntityId | null;
  familiaId?: EntityId | null;
  coleccionId?: EntityId | null;
  sortBy: ItemSortField;
  sortDir: SortDirection;
  page: number;
  pageSize: number;
}

export interface ItemListResult {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveItemCommand {
  id?: EntityId;
  codigo: string;
  nombre: string;
  precio: number;
  unidadMedida: string;
  descripcion: string | null;
  fotografia: Uint8Array | null;
  fotografiaMime: string | null;
  categoryIds: EntityId[];
  collectionIds: EntityId[];
}

export interface DashboardCard {
  title: string;
  path: string;
  description: string;
}

export interface GeneratePdfCommand {
  coleccionId: EntityId;
  familiaIds: EntityId[];
  mostrarPrecioUnidad: boolean;
  mostrarDescripcion: boolean;
  mostrarSubtitulo: boolean;
  mostrarContacto: boolean;
}

export interface PdfCatalogData {
  configuracion: Configuracion;
  coleccion: NamedEntity;
  items: Item[];
  options: GeneratePdfCommand;
}

export interface ImportExcelRow {
  rowNumber: number;
  codigo: string;
  nombre: string;
  precio: number;
  unidadMedida: string;
  descripcion: string | null;
  categoria: string | null;
  familia: string | null;
  coleccion: string | null;
}

export interface ImportRowError {
  rowNumber: number;
  reason: string;
}

export interface ImportExcelResult {
  importedCount: number;
  updatedCount: number;
  createdCategories: number;
  createdFamilies: number;
  createdCollections: number;
  rowErrors: ImportRowError[];
}

export interface ItemFormState {
  command: SaveItemCommand;
  currentItem: Item | null;
  categorias: Categoria[];
  familias: Familia[];
  colecciones: CollectionLink[];
}
