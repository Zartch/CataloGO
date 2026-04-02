export const DEFAULT_CONFIGURATION = {
  id: 1 as const,
  nombreCompania: 'CataloGo',
  subtitulo: 'Catalogos y control local',
  logo: null,
  logoMime: null,
  email: null,
  telefono: null,
  colorPrimario: '#9f3b30',
  colorSecundario: '#f6efe7',
  moneda: 'EUR',
};

export const LATEST_SCHEMA_VERSION = 2;
export const UNCATEGORIZED_FAMILY_NAME = 'Sin familia';

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS familias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  familia_id INTEGER NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS colecciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  unidad_medida TEXT NOT NULL,
  descripcion TEXT,
  categoria_id INTEGER,
  familia_id INTEGER,
  fotografia BLOB,
  fotografia_mime TEXT
);

CREATE TABLE IF NOT EXISTS item_categoria (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, categoria_id)
);

CREATE TABLE IF NOT EXISTS coleccion_item (
  coleccion_id INTEGER NOT NULL REFERENCES colecciones(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (coleccion_id, item_id)
);

CREATE TABLE IF NOT EXISTS configuracion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre_compania TEXT NOT NULL,
  subtitulo TEXT,
  logo BLOB,
  logo_mime TEXT,
  email TEXT,
  telefono TEXT,
  color_primario TEXT NOT NULL,
  color_secundario TEXT NOT NULL,
  moneda TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_familia_nombre ON categorias(familia_id, nombre);
CREATE INDEX IF NOT EXISTS idx_items_codigo ON items(codigo);
CREATE INDEX IF NOT EXISTS idx_items_nombre ON items(nombre);
CREATE INDEX IF NOT EXISTS idx_items_categoria_legacy ON items(categoria_id);
CREATE INDEX IF NOT EXISTS idx_items_familia_legacy ON items(familia_id);
CREATE INDEX IF NOT EXISTS idx_categorias_familia ON categorias(familia_id);
CREATE INDEX IF NOT EXISTS idx_categorias_sort_order ON categorias(familia_id, sort_order, nombre);
CREATE INDEX IF NOT EXISTS idx_item_categoria_item ON item_categoria(item_id);
CREATE INDEX IF NOT EXISTS idx_item_categoria_categoria ON item_categoria(categoria_id);
CREATE INDEX IF NOT EXISTS idx_item_categoria_sort_order ON item_categoria(item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_coleccion_item_item ON coleccion_item(item_id);
CREATE INDEX IF NOT EXISTS idx_coleccion_item_coleccion ON coleccion_item(coleccion_id);
`;
