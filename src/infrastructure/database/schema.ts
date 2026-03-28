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

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS familias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
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
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  familia_id INTEGER REFERENCES familias(id) ON DELETE SET NULL,
  fotografia BLOB,
  fotografia_mime TEXT
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

CREATE INDEX IF NOT EXISTS idx_items_codigo ON items(codigo);
CREATE INDEX IF NOT EXISTS idx_items_nombre ON items(nombre);
CREATE INDEX IF NOT EXISTS idx_items_categoria ON items(categoria_id);
CREATE INDEX IF NOT EXISTS idx_items_familia ON items(familia_id);
CREATE INDEX IF NOT EXISTS idx_coleccion_item_item ON coleccion_item(item_id);
CREATE INDEX IF NOT EXISTS idx_coleccion_item_coleccion ON coleccion_item(coleccion_id);
`;
