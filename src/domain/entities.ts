export type EntityId = number;

export interface NamedEntity {
  id: EntityId;
  nombre: string;
}

export type CollectionLink = NamedEntity;

export interface Categoria extends NamedEntity {
  familiaId: EntityId;
  familiaNombre: string;
  sortOrder: number;
}

export interface Familia extends NamedEntity {
  categorias: Categoria[];
}

export interface Item {
  id: EntityId;
  codigo: string;
  nombre: string;
  precio: number;
  unidadMedida: string;
  descripcion: string | null;
  fotografia: Uint8Array | null;
  fotografiaMime: string | null;
  categorias: Categoria[];
  colecciones: CollectionLink[];
}

export interface Configuracion {
  id: 1;
  nombreCompania: string;
  subtitulo: string | null;
  logo: Uint8Array | null;
  logoMime: string | null;
  email: string | null;
  telefono: string | null;
  colorPrimario: string;
  colorSecundario: string;
  moneda: string;
}

export interface DashboardSummary {
  totalItems: number;
  totalCategorias: number;
  totalFamilias: number;
  totalColecciones: number;
}
