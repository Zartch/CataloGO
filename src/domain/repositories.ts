import type { Configuracion, DashboardSummary, EntityId, Item, NamedEntity } from './entities';
import type {
  ImportRowError,
  ItemListQuery,
  ItemListResult,
  SaveItemCommand,
  SortDirection,
} from '../application/dto';

export interface DatabasePort {
  initialize(): Promise<void>;
  exportBinary(): Promise<Uint8Array>;
  importBinary(binary: Uint8Array): Promise<void>;
}

export interface ItemRepository {
  list(query: ItemListQuery): Promise<ItemListResult>;
  getById(id: EntityId): Promise<Item | null>;
  getByCodigo(codigo: string): Promise<Item | null>;
  save(command: SaveItemCommand): Promise<EntityId>;
  delete(id: EntityId): Promise<void>;
  addItemsToCollection(collectionId: EntityId, itemIds: EntityId[]): Promise<void>;
  removeItemFromCollection(collectionId: EntityId, itemId: EntityId): Promise<void>;
}

export interface NamedEntityRepository {
  list(): Promise<NamedEntity[]>;
  save(entity: Partial<NamedEntity> & { nombre: string }): Promise<EntityId>;
  delete(id: EntityId): Promise<void>;
}

export interface CollectionRepository extends NamedEntityRepository {
  listWithCounts(): Promise<Array<NamedEntity & { itemCount: number }>>;
  getById(id: EntityId): Promise<NamedEntity | null>;
}

export interface ConfiguracionRepository {
  get(): Promise<Configuracion>;
  save(configuracion: Configuracion): Promise<void>;
}

export interface DashboardRepository {
  getSummary(): Promise<DashboardSummary>;
}

export interface ImportSupportRepository {
  ensureCategoria(nombre: string): Promise<EntityId>;
  ensureFamilia(nombre: string): Promise<EntityId>;
  ensureColeccion(nombre: string): Promise<EntityId>;
}

export interface RepositoryBundle {
  items: ItemRepository;
  categorias: NamedEntityRepository;
  familias: NamedEntityRepository;
  colecciones: CollectionRepository;
  configuracion: ConfiguracionRepository;
  dashboard: DashboardRepository;
  importSupport: ImportSupportRepository;
  database: DatabasePort;
}

export interface QuerySorting {
  sortBy: ItemListQuery['sortBy'];
  sortDir: SortDirection;
}

export interface ImportErrorCollector {
  push(error: ImportRowError): void;
}
