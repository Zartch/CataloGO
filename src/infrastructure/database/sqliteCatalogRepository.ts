import { openDB } from 'idb';
import initSqlJs, { type Database, type QueryExecResult, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { ItemListQuery, ItemListResult, SaveItemCommand } from '../../application/dto';
import type {
  CategoriaRepository,
  CollectionRepository,
  ConfiguracionRepository,
  DashboardRepository,
  DatabasePort,
  FamiliaRepository,
  ImportSupportRepository,
  ItemRepository,
  NamedEntityRepository,
} from '../../domain/repositories';
import type {
  Categoria,
  Configuracion,
  DashboardSummary,
  EntityId,
  Familia,
  Item,
  NamedEntity,
} from '../../domain/entities';
import {
  DEFAULT_CONFIGURATION,
  LATEST_SCHEMA_VERSION,
  SCHEMA_SQL,
  UNCATEGORIZED_FAMILY_NAME,
} from './schema';

type SqlParam = number | string | Uint8Array | null;
type Row = Record<string, unknown>;

const SNAPSHOT_DB = 'catalogogo-db';
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_KEY = 'main';

function rowsFromResult<T extends Row>(result?: QueryExecResult | QueryExecResult[]): T[] {
  const resolved = Array.isArray(result) ? result[0] : result;
  if (!resolved) {
    return [];
  }

  return resolved.values.map((valueRow) => {
    const row: Row = {};
    resolved.columns.forEach((column, index) => {
      row[column] = valueRow[index];
    });
    return row as T;
  });
}

async function snapshotStore() {
  return openDB(SNAPSHOT_DB, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE);
      }
    },
  });
}

function normalizeNamed(value: string) {
  return value.trim();
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
  return null;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value);
}

function uniqueIds(ids: EntityId[]) {
  return [...new Set(ids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function tableExists(db: Database, tableName: string) {
  return rowsFromResult<{ total: number }>(
    db.exec(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName],
    ),
  )[0]?.total === 1;
}

function columnExists(db: Database, tableName: string, columnName: string) {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return rowsFromResult<{ name: string }>(db.exec(`PRAGMA table_info(${tableName})`)).some(
    (row) => String(row.name) === columnName,
  );
}

function getUserVersion(db: Database) {
  return Number(rowsFromResult<{ user_version: number }>(db.exec('PRAGMA user_version'))[0]?.user_version ?? 0);
}

function setUserVersion(db: Database, version: number) {
  db.run(`PRAGMA user_version = ${version}`);
}

function ensureFamilyRecord(db: Database, nombre: string) {
  const normalized = normalizeNamed(nombre);
  const existing = rowsFromResult<{ id: number }>(
    db.exec('SELECT id FROM familias WHERE nombre = ?', [normalized]),
  )[0];
  if (existing) {
    return Number(existing.id);
  }

  db.run('INSERT INTO familias (nombre) VALUES (?)', [normalized]);
  return Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
}

function getNextCategorySortOrder(db: Database, familiaId: EntityId) {
  const current = rowsFromResult<{ max_sort_order: number | null }>(
    db.exec('SELECT MAX(sort_order) AS max_sort_order FROM categorias WHERE familia_id = ?', [familiaId]),
  )[0];
  return Number(current?.max_sort_order ?? -1) + 1;
}

function ensureCategoryRecord(db: Database, familiaId: EntityId, nombre: string) {
  const normalized = normalizeNamed(nombre);
  const existing = rowsFromResult<{ id: number }>(
    db.exec('SELECT id FROM categorias WHERE familia_id = ? AND nombre = ?', [familiaId, normalized]),
  )[0];
  if (existing) {
    return Number(existing.id);
  }

  db.run(
    'INSERT INTO categorias (familia_id, nombre, sort_order) VALUES (?, ?, ?)',
    [familiaId, normalized, getNextCategorySortOrder(db, familiaId)],
  );
  return Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
}

function migrateLegacySchema(db: Database) {
  const hasLegacyItemsClassification =
    tableExists(db, 'items') &&
    columnExists(db, 'items', 'categoria_id') &&
    columnExists(db, 'items', 'familia_id');
  const hasFinalCategories =
    tableExists(db, 'categorias') &&
    columnExists(db, 'categorias', 'familia_id') &&
    tableExists(db, 'item_categoria');

  if (!hasLegacyItemsClassification || hasFinalCategories) {
    return;
  }

  if (tableExists(db, 'categorias')) {
    db.run('ALTER TABLE categorias RENAME TO categorias_legacy');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      familia_id INTEGER NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS item_categoria (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, categoria_id)
    )
  `);

  const uncategorizedFamilyId = ensureFamilyRecord(db, UNCATEGORIZED_FAMILY_NAME);
  const categoryMap = new Map<string, number>();

  if (tableExists(db, 'categorias_legacy')) {
    const legacyCategories = rowsFromResult<{ id: number; nombre: string }>(
      db.exec('SELECT id, nombre FROM categorias_legacy ORDER BY nombre COLLATE NOCASE ASC'),
    );

    for (const legacyCategory of legacyCategories) {
      const familyRows = rowsFromResult<{ familia_id: number | null }>(
        db.exec(
          `
            SELECT DISTINCT familia_id
            FROM items
            WHERE categoria_id = ?
            ORDER BY familia_id ASC
          `,
          [legacyCategory.id],
        ),
      );

      const familyIds = familyRows.length > 0
        ? familyRows.map((row) => (row.familia_id === null ? uncategorizedFamilyId : Number(row.familia_id)))
        : [uncategorizedFamilyId];

      for (const familyId of uniqueIds(familyIds)) {
        const newCategoryId = ensureCategoryRecord(db, familyId, String(legacyCategory.nombre));
        categoryMap.set(`${legacyCategory.id}:${familyId}`, newCategoryId);
      }
    }

    const itemRows = rowsFromResult<{ id: number; categoria_id: number; familia_id: number | null }>(
      db.exec(
        `
          SELECT id, categoria_id, familia_id
          FROM items
          WHERE categoria_id IS NOT NULL
        `,
      ),
    );

    for (const itemRow of itemRows) {
      const familyId = itemRow.familia_id === null ? uncategorizedFamilyId : Number(itemRow.familia_id);
      const mappedCategoryId = categoryMap.get(`${itemRow.categoria_id}:${familyId}`);
      if (!mappedCategoryId) {
        continue;
      }

      db.run(
        'INSERT OR IGNORE INTO item_categoria (item_id, categoria_id, sort_order) VALUES (?, ?, 0)',
        [itemRow.id, mappedCategoryId],
      );
    }

    db.run('DROP TABLE categorias_legacy');
  }
}

function getOrderByClause(query: ItemListQuery) {
  const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';

  switch (query.sortBy) {
    case 'codigo':
      return `i.codigo COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'precio':
      return `i.precio ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'categoria':
      return `CASE WHEN primary_categoria IS NULL THEN 1 ELSE 0 END ASC, primary_categoria COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'familia':
      return `CASE WHEN primary_familia IS NULL THEN 1 ELSE 0 END ASC, primary_familia COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'coleccion':
      return `CASE WHEN primary_collection IS NULL THEN 1 ELSE 0 END ASC, primary_collection COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'nombre':
    default:
      return `i.nombre COLLATE NOCASE ${direction}, i.codigo COLLATE NOCASE ASC`;
  }
}

function mapItemRow(row: Record<string, unknown>): Item {
  return {
    id: Number(row.id),
    codigo: String(row.codigo),
    nombre: String(row.nombre),
    precio: Number(row.precio),
    unidadMedida: String(row.unidad_medida),
    descripcion: nullableText(row.descripcion),
    fotografia: toUint8Array(row.fotografia),
    fotografiaMime: nullableText(row.fotografia_mime),
    categorias: [],
    colecciones: [],
  };
}

function mapConfiguracion(row: Record<string, unknown>): Configuracion {
  return {
    id: 1,
    nombreCompania: String(row.nombre_compania),
    subtitulo: nullableText(row.subtitulo),
    logo: toUint8Array(row.logo),
    logoMime: nullableText(row.logo_mime),
    email: nullableText(row.email),
    telefono: nullableText(row.telefono),
    colorPrimario: String(row.color_primario),
    colorSecundario: String(row.color_secundario),
    moneda: String(row.moneda),
  };
}

function mapCategoriaRow(row: Record<string, unknown>): Categoria {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    familiaId: Number(row.familia_id),
    familiaNombre: String(row.familia_nombre),
    sortOrder: Number(row.sort_order),
  };
}

function attachCategoriesAndCollections(db: Database, items: Item[]) {
  if (items.length === 0) {
    return;
  }

  const ids = items.map((item) => item.id).join(', ');
  const categories = rowsFromResult<{
    item_id: number;
    id: number;
    nombre: string;
    familia_id: number;
    familia_nombre: string;
    sort_order: number;
  }>(
    db.exec(`
      SELECT
        ic.item_id,
        c.id,
        c.nombre,
        c.familia_id,
        f.nombre AS familia_nombre,
        ic.sort_order
      FROM item_categoria ic
      JOIN categorias c ON c.id = ic.categoria_id
      JOIN familias f ON f.id = c.familia_id
      WHERE ic.item_id IN (${ids})
      ORDER BY ic.item_id ASC, ic.sort_order ASC, c.sort_order ASC, c.nombre COLLATE NOCASE ASC
    `),
  );

  const categoryMap = new Map<number, Item['categorias']>();
  for (const category of categories) {
    const list = categoryMap.get(Number(category.item_id)) ?? [];
    list.push({
      id: Number(category.id),
      nombre: String(category.nombre),
      familiaId: Number(category.familia_id),
      familiaNombre: String(category.familia_nombre),
      sortOrder: Number(category.sort_order),
    });
    categoryMap.set(Number(category.item_id), list);
  }

  const collectionLinks = rowsFromResult<{ item_id: number; id: number; nombre: string }>(
    db.exec(`
      SELECT ci.item_id, col.id, col.nombre
      FROM coleccion_item ci
      JOIN colecciones col ON col.id = ci.coleccion_id
      WHERE ci.item_id IN (${ids})
      ORDER BY ci.item_id ASC, col.nombre COLLATE NOCASE ASC
    `),
  );

  const collectionMap = new Map<number, Item['colecciones']>();
  for (const link of collectionLinks) {
    const list = collectionMap.get(Number(link.item_id)) ?? [];
    list.push({ id: Number(link.id), nombre: String(link.nombre) });
    collectionMap.set(Number(link.item_id), list);
  }

  items.forEach((item) => {
    item.categorias = categoryMap.get(item.id) ?? [];
    item.colecciones = collectionMap.get(item.id) ?? [];
  });
}

export class BrowserSqliteDatabasePort implements DatabasePort {
  private sqlPromise?: Promise<SqlJsStatic>;
  private dbPromise?: Promise<Database>;

  async initialize() {
    await this.getDatabase();
  }

  async exportBinary() {
    const db = await this.getDatabase();
    return db.export();
  }

  async importBinary(binary: Uint8Array) {
    const SQL = await this.getSqlJs();
    const db = new SQL.Database(binary);
    db.run('PRAGMA foreign_keys = OFF');
    migrateLegacySchema(db);
    db.run(SCHEMA_SQL);
    this.ensureConfigurationRow(db);
    setUserVersion(db, LATEST_SCHEMA_VERSION);
    db.run('PRAGMA foreign_keys = ON');
    this.dbPromise = Promise.resolve(db);
    await this.persist(db);
  }

  async withDatabase<T>(run: (db: Database) => Promise<T> | T): Promise<T> {
    const db = await this.getDatabase();
    db.run('PRAGMA foreign_keys = ON');
    return run(db);
  }

  async withTransaction<T>(run: (db: Database) => Promise<T> | T): Promise<T> {
    const db = await this.getDatabase();
    db.run('PRAGMA foreign_keys = ON');
    db.run('BEGIN');
    try {
      const result = await run(db);
      db.run('COMMIT');
      await this.persist(db);
      return result;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  private async getSqlJs() {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs({
        locateFile: () => wasmUrl,
      });
    }
    return this.sqlPromise;
  }

  private async getDatabase() {
    if (!this.dbPromise) {
      this.dbPromise = this.loadDatabase();
    }
    return this.dbPromise;
  }

  private async loadDatabase() {
    const SQL = await this.getSqlJs();
    const store = await snapshotStore();
    const snapshot = await store.get(SNAPSHOT_STORE, SNAPSHOT_KEY);
    const db = snapshot ? new SQL.Database(snapshot as Uint8Array) : new SQL.Database();

    db.run('PRAGMA foreign_keys = OFF');
    if (getUserVersion(db) < LATEST_SCHEMA_VERSION) {
      migrateLegacySchema(db);
    }
    db.run(SCHEMA_SQL);
    this.ensureConfigurationRow(db);
    setUserVersion(db, LATEST_SCHEMA_VERSION);
    db.run('PRAGMA foreign_keys = ON');
    await this.persist(db);
    return db;
  }

  private ensureConfigurationRow(db: Database) {
    const existing = rowsFromResult<{ total: number }>(
      db.exec('SELECT COUNT(*) AS total FROM configuracion'),
    )[0];

    if (!existing || Number(existing.total) === 0) {
      db.run(
        `INSERT INTO configuracion (
          id, nombre_compania, subtitulo, logo, logo_mime, email, telefono, color_primario, color_secundario, moneda
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          DEFAULT_CONFIGURATION.id,
          DEFAULT_CONFIGURATION.nombreCompania,
          DEFAULT_CONFIGURATION.subtitulo,
          DEFAULT_CONFIGURATION.logo,
          DEFAULT_CONFIGURATION.logoMime,
          DEFAULT_CONFIGURATION.email,
          DEFAULT_CONFIGURATION.telefono,
          DEFAULT_CONFIGURATION.colorPrimario,
          DEFAULT_CONFIGURATION.colorSecundario,
          DEFAULT_CONFIGURATION.moneda,
        ],
      );
    }
  }

  private async persist(db: Database) {
    const store = await snapshotStore();
    await store.put(SNAPSHOT_STORE, db.export(), SNAPSHOT_KEY);
  }
}

class BaseNamedEntityRepository implements NamedEntityRepository {
  constructor(
    protected readonly port: BrowserSqliteDatabasePort,
    protected readonly table: 'familias' | 'colecciones',
  ) {}

  async list(): Promise<NamedEntity[]> {
    return this.port.withDatabase((db) =>
      rowsFromResult<{ id: number; nombre: string }>(
        db.exec(`SELECT id, nombre FROM ${this.table} ORDER BY nombre COLLATE NOCASE ASC`),
      ).map((row) => ({
        id: Number(row.id),
        nombre: String(row.nombre),
      })),
    );
  }

  async save(entity: Partial<NamedEntity> & { nombre: string }) {
    return this.port.withTransaction((db) => {
      const nombre = normalizeNamed(entity.nombre);
      if (entity.id) {
        db.run(`UPDATE ${this.table} SET nombre = ? WHERE id = ?`, [nombre, entity.id]);
        return entity.id;
      }

      db.run(`INSERT INTO ${this.table} (nombre) VALUES (?)`, [nombre]);
      return Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
    });
  }

  async delete(id: EntityId) {
    await this.port.withTransaction((db) => {
      db.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
    });
  }
}

class SqliteCategoriaRepository implements CategoriaRepository {
  constructor(private readonly port: BrowserSqliteDatabasePort) {}

  async list() {
    return this.port.withDatabase((db) =>
      rowsFromResult<Record<string, unknown>>(
        db.exec(`
          SELECT c.id, c.nombre, c.familia_id, f.nombre AS familia_nombre, c.sort_order
          FROM categorias c
          JOIN familias f ON f.id = c.familia_id
          ORDER BY f.nombre COLLATE NOCASE ASC, c.sort_order ASC, c.nombre COLLATE NOCASE ASC
        `),
      ).map(mapCategoriaRow),
    );
  }

  async save(entity: { id?: EntityId; nombre: string; familiaId: EntityId }) {
    return this.port.withTransaction((db) => {
      const nombre = normalizeNamed(entity.nombre);
      if (entity.id) {
        db.run('UPDATE categorias SET nombre = ?, familia_id = ? WHERE id = ?', [
          nombre,
          entity.familiaId,
          entity.id,
        ]);
        return entity.id;
      }

      db.run(
        'INSERT INTO categorias (familia_id, nombre, sort_order) VALUES (?, ?, ?)',
        [entity.familiaId, nombre, getNextCategorySortOrder(db, entity.familiaId)],
      );
      return Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
    });
  }

  async delete(id: EntityId) {
    await this.port.withTransaction((db) => {
      db.run('DELETE FROM categorias WHERE id = ?', [id]);
    });
  }

  async move(id: EntityId, familiaId: EntityId, targetIndex: number) {
    await this.port.withTransaction((db) => {
      const current = rowsFromResult<{ id: number; familia_id: number }>(
        db.exec('SELECT id, familia_id FROM categorias WHERE id = ?', [id]),
      )[0];
      if (!current) {
        return;
      }

      const familyRows = rowsFromResult<{ id: number }>(
        db.exec(
          'SELECT id FROM categorias WHERE familia_id = ? AND id <> ? ORDER BY sort_order ASC, nombre COLLATE NOCASE ASC',
          [familiaId, id],
        ),
      );
      const orderedIds = familyRows.map((row) => Number(row.id));
      const safeIndex = Math.max(0, Math.min(targetIndex, orderedIds.length));
      orderedIds.splice(safeIndex, 0, id);

      db.run('UPDATE categorias SET familia_id = ? WHERE id = ?', [familiaId, id]);
      orderedIds.forEach((categoryId, index) => {
        db.run('UPDATE categorias SET sort_order = ? WHERE id = ?', [index, categoryId]);
      });

      if (Number(current.familia_id) !== familiaId) {
        const previousFamilyRows = rowsFromResult<{ id: number }>(
          db.exec(
            'SELECT id FROM categorias WHERE familia_id = ? ORDER BY sort_order ASC, nombre COLLATE NOCASE ASC',
            [Number(current.familia_id)],
          ),
        );
        previousFamilyRows.forEach((row, index) => {
          db.run('UPDATE categorias SET sort_order = ? WHERE id = ?', [index, Number(row.id)]);
        });
      }
    });
  }
}

class SqliteFamilyRepository extends BaseNamedEntityRepository implements FamiliaRepository {
  constructor(port: BrowserSqliteDatabasePort) {
    super(port, 'familias');
  }

  async listWithCategorias() {
    return this.port.withDatabase((db) => {
      const families = rowsFromResult<{ id: number; nombre: string }>(
        db.exec('SELECT id, nombre FROM familias ORDER BY nombre COLLATE NOCASE ASC'),
      ).map((row) => ({
        id: Number(row.id),
        nombre: String(row.nombre),
        categorias: [] as Categoria[],
      }));

      const categories = rowsFromResult<Record<string, unknown>>(
        db.exec(`
          SELECT c.id, c.nombre, c.familia_id, f.nombre AS familia_nombre, c.sort_order
          FROM categorias c
          JOIN familias f ON f.id = c.familia_id
          ORDER BY f.nombre COLLATE NOCASE ASC, c.sort_order ASC, c.nombre COLLATE NOCASE ASC
        `),
      ).map(mapCategoriaRow);

      const familyMap = new Map<number, Familia>();
      families.forEach((family) => familyMap.set(family.id, family));
      categories.forEach((category) => {
        const family = familyMap.get(category.familiaId);
        if (family) {
          family.categorias.push(category);
        }
      });

      return families;
    });
  }

  async listForCollection(collectionId: EntityId) {
    return this.port.withDatabase((db) =>
      rowsFromResult<{ id: number; nombre: string }>(
        db.exec(
          `
            SELECT DISTINCT f.id, f.nombre
            FROM familias f
            JOIN categorias c ON c.familia_id = f.id
            JOIN item_categoria ic ON ic.categoria_id = c.id
            JOIN coleccion_item ci ON ci.item_id = ic.item_id
            WHERE ci.coleccion_id = ?
            ORDER BY f.nombre COLLATE NOCASE ASC
          `,
          [collectionId],
        ),
      ).map((row) => ({
        id: Number(row.id),
        nombre: String(row.nombre),
      })),
    );
  }
}

class SqliteCollectionRepository extends BaseNamedEntityRepository implements CollectionRepository {
  constructor(port: BrowserSqliteDatabasePort) {
    super(port, 'colecciones');
  }

  async listWithCounts() {
    return this.port.withDatabase((db) =>
      rowsFromResult<{ id: number; nombre: string; item_count: number }>(
        db.exec(`
          SELECT col.id, col.nombre, COUNT(ci.item_id) AS item_count
          FROM colecciones col
          LEFT JOIN coleccion_item ci ON ci.coleccion_id = col.id
          GROUP BY col.id, col.nombre
          ORDER BY col.nombre COLLATE NOCASE ASC
        `),
      ).map((row) => ({
        id: Number(row.id),
        nombre: String(row.nombre),
        itemCount: Number(row.item_count),
      })),
    );
  }

  async getById(id: EntityId) {
    return this.port.withDatabase((db) => {
      const row = rowsFromResult<{ id: number; nombre: string }>(
        db.exec('SELECT id, nombre FROM colecciones WHERE id = ?', [id]),
      )[0];
      return row
        ? {
            id: Number(row.id),
            nombre: String(row.nombre),
          }
        : null;
    });
  }
}

class SqliteConfiguracionRepository implements ConfiguracionRepository {
  constructor(private readonly port: BrowserSqliteDatabasePort) {}

  async get() {
    return this.port.withDatabase((db) => {
      const row = rowsFromResult<Record<string, unknown>>(db.exec('SELECT * FROM configuracion WHERE id = 1'))[0];
      return row
        ? mapConfiguracion(row)
        : mapConfiguracion(DEFAULT_CONFIGURATION as unknown as Record<string, unknown>);
    });
  }

  async save(configuracion: Configuracion) {
    await this.port.withTransaction((db) => {
      db.run(
        `UPDATE configuracion
         SET nombre_compania = ?, subtitulo = ?, logo = ?, logo_mime = ?, email = ?, telefono = ?, color_primario = ?, color_secundario = ?, moneda = ?
         WHERE id = 1`,
        [
          configuracion.nombreCompania,
          configuracion.subtitulo,
          configuracion.logo,
          configuracion.logoMime,
          configuracion.email,
          configuracion.telefono,
          configuracion.colorPrimario,
          configuracion.colorSecundario,
          configuracion.moneda,
        ],
      );
    });
  }
}

class SqliteDashboardRepository implements DashboardRepository {
  constructor(private readonly port: BrowserSqliteDatabasePort) {}

  async getSummary(): Promise<DashboardSummary> {
    return this.port.withDatabase((db) => {
      const totals = rowsFromResult<{
        items_total: number;
        categorias_total: number;
        familias_total: number;
        colecciones_total: number;
      }>(
        db.exec(`
          SELECT
            (SELECT COUNT(*) FROM items) AS items_total,
            (SELECT COUNT(*) FROM categorias) AS categorias_total,
            (SELECT COUNT(*) FROM familias) AS familias_total,
            (SELECT COUNT(*) FROM colecciones) AS colecciones_total
        `),
      )[0];

      return {
        totalItems: Number(totals.items_total),
        totalCategorias: Number(totals.categorias_total),
        totalFamilias: Number(totals.familias_total),
        totalColecciones: Number(totals.colecciones_total),
      };
    });
  }
}

class SqliteImportSupportRepository implements ImportSupportRepository {
  constructor(private readonly port: BrowserSqliteDatabasePort) {}

  async ensureCategoria(nombre: string, familiaId: EntityId) {
    return this.port.withTransaction((db) => ensureCategoryRecord(db, familiaId, nombre));
  }

  async ensureFamilia(nombre: string) {
    return this.ensureNamedEntity('familias', nombre);
  }

  async ensureColeccion(nombre: string) {
    return this.ensureNamedEntity('colecciones', nombre);
  }

  private async ensureNamedEntity(table: 'familias' | 'colecciones', nombre: string) {
    return this.port.withTransaction((db) => {
      const normalized = normalizeNamed(nombre);
      const existing = rowsFromResult<{ id: number }>(
        db.exec(`SELECT id FROM ${table} WHERE nombre = ?`, [normalized]),
      )[0];
      if (existing) {
        return Number(existing.id);
      }

      db.run(`INSERT INTO ${table} (nombre) VALUES (?)`, [normalized]);
      return Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
    });
  }
}

class SqliteItemRepository implements ItemRepository {
  constructor(private readonly port: BrowserSqliteDatabasePort) {}

  async list(query: ItemListQuery): Promise<ItemListResult> {
    const searchText = query.texto?.trim().toLowerCase() ? `%${query.texto.trim().toLowerCase()}%` : null;
    const page = Math.max(query.page, 1);
    const pageSize = Math.max(query.pageSize, 1);
    const offset = (page - 1) * pageSize;

    return this.port.withDatabase((db) => {
      const whereClause = `
        WHERE (?1 IS NULL OR LOWER(i.nombre) LIKE ?1 OR LOWER(i.codigo) LIKE ?1)
          AND (?2 IS NULL OR EXISTS (
            SELECT 1
            FROM item_categoria ic_filter_categoria
            WHERE ic_filter_categoria.item_id = i.id AND ic_filter_categoria.categoria_id = ?2
          ))
          AND (?3 IS NULL OR EXISTS (
            SELECT 1
            FROM item_categoria ic_filter_familia
            JOIN categorias c_filter_familia ON c_filter_familia.id = ic_filter_familia.categoria_id
            WHERE ic_filter_familia.item_id = i.id AND c_filter_familia.familia_id = ?3
          ))
          AND (?4 IS NULL OR EXISTS (
            SELECT 1 FROM coleccion_item ci2 WHERE ci2.item_id = i.id AND ci2.coleccion_id = ?4
          ))
      `;

      const baseParams: SqlParam[] = [
        searchText,
        query.categoriaId ?? null,
        query.familiaId ?? null,
        query.coleccionId ?? null,
      ];

      const items = rowsFromResult<Record<string, unknown>>(
        db.exec(
          `
            SELECT
              i.*,
              (
                SELECT c1.nombre
                FROM item_categoria ic1
                JOIN categorias c1 ON c1.id = ic1.categoria_id
                WHERE ic1.item_id = i.id
                ORDER BY ic1.sort_order ASC, c1.sort_order ASC, c1.nombre COLLATE NOCASE ASC
                LIMIT 1
              ) AS primary_categoria,
              (
                SELECT f1.nombre
                FROM item_categoria ic2
                JOIN categorias c2 ON c2.id = ic2.categoria_id
                JOIN familias f1 ON f1.id = c2.familia_id
                WHERE ic2.item_id = i.id
                ORDER BY ic2.sort_order ASC, c2.sort_order ASC, c2.nombre COLLATE NOCASE ASC
                LIMIT 1
              ) AS primary_familia,
              (
                SELECT MIN(col2.nombre)
                FROM coleccion_item ci3
                JOIN colecciones col2 ON col2.id = ci3.coleccion_id
                WHERE ci3.item_id = i.id
              ) AS primary_collection
            FROM items i
            ${whereClause}
            ORDER BY ${getOrderByClause(query)}
            LIMIT ?5 OFFSET ?6
          `,
          [...baseParams, pageSize, offset],
        ),
      ).map(mapItemRow);

      const total = rowsFromResult<{ total: number }>(
        db.exec(
          `
            SELECT COUNT(*) AS total
            FROM items i
            ${whereClause}
          `,
          baseParams,
        ),
      )[0];

      attachCategoriesAndCollections(db, items);

      return {
        items,
        total: Number(total.total),
        page,
        pageSize,
      };
    });
  }

  async getById(id: EntityId) {
    return this.port.withDatabase((db) => {
      const row = rowsFromResult<Record<string, unknown>>(
        db.exec('SELECT i.* FROM items i WHERE i.id = ?', [id]),
      )[0];
      if (!row) {
        return null;
      }

      const item = mapItemRow(row);
      attachCategoriesAndCollections(db, [item]);
      return item;
    });
  }

  async getByCodigo(codigo: string) {
    const trimmedCode = codigo.trim();
    return this.port.withDatabase(async (db) => {
      const row = rowsFromResult<{ id: number }>(
        db.exec('SELECT id FROM items WHERE codigo = ?', [trimmedCode]),
      )[0];
      if (!row) {
        return null;
      }
      return this.getById(Number(row.id));
    });
  }

  async getNextWithoutPhoto(excludedIds: EntityId[]) {
    return this.port.withDatabase(async (db) => {
      const filteredIds = uniqueIds(excludedIds);
      const exclusionClause = filteredIds.length > 0
        ? `AND i.id NOT IN (${filteredIds.map(() => '?').join(', ')})`
        : '';

      const row = rowsFromResult<{ id: number }>(
        db.exec(
          `
            SELECT i.id
            FROM items i
            WHERE i.fotografia IS NULL
              ${exclusionClause}
            ORDER BY i.id ASC
            LIMIT 1
          `,
          filteredIds,
        ),
      )[0];

      if (!row) {
        return null;
      }

      return this.getById(Number(row.id));
    });
  }

  async save(command: SaveItemCommand) {
    return this.port.withTransaction((db) => {
      if (command.id) {
        db.run(
          `UPDATE items
           SET codigo = ?, nombre = ?, precio = ?, unidad_medida = ?, descripcion = ?, fotografia = ?, fotografia_mime = ?
           WHERE id = ?`,
          [
            command.codigo,
            command.nombre,
            command.precio,
            command.unidadMedida,
            command.descripcion,
            command.fotografia,
            command.fotografiaMime,
            command.id,
          ],
        );
      } else {
        db.run(
          `INSERT INTO items (
            codigo, nombre, precio, unidad_medida, descripcion, fotografia, fotografia_mime
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            command.codigo,
            command.nombre,
            command.precio,
            command.unidadMedida,
            command.descripcion,
            command.fotografia,
            command.fotografiaMime,
          ],
        );
        command.id = Number(rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id);
      }

      const itemId = Number(command.id);

      db.run('DELETE FROM item_categoria WHERE item_id = ?', [itemId]);
      uniqueIds(command.categoryIds).forEach((categoryId, index) => {
        db.run(
          'INSERT OR IGNORE INTO item_categoria (item_id, categoria_id, sort_order) VALUES (?, ?, ?)',
          [itemId, categoryId, index],
        );
      });

      db.run('DELETE FROM coleccion_item WHERE item_id = ?', [itemId]);
      uniqueIds(command.collectionIds).forEach((collectionId) => {
        db.run('INSERT OR IGNORE INTO coleccion_item (coleccion_id, item_id) VALUES (?, ?)', [
          collectionId,
          itemId,
        ]);
      });

      return itemId;
    });
  }

  async delete(id: EntityId) {
    await this.port.withTransaction((db) => {
      db.run('DELETE FROM items WHERE id = ?', [id]);
    });
  }

  async addItemsToCollection(collectionId: EntityId, itemIds: EntityId[]) {
    await this.port.withTransaction((db) => {
      uniqueIds(itemIds).forEach((itemId) => {
        db.run('INSERT OR IGNORE INTO coleccion_item (coleccion_id, item_id) VALUES (?, ?)', [
          collectionId,
          itemId,
        ]);
      });
    });
  }

  async removeItemFromCollection(collectionId: EntityId, itemId: EntityId) {
    await this.port.withTransaction((db) => {
      db.run('DELETE FROM coleccion_item WHERE coleccion_id = ? AND item_id = ?', [
        collectionId,
        itemId,
      ]);
    });
  }
}

export function createRepositoryBundle(port: BrowserSqliteDatabasePort) {
  const familias = new SqliteFamilyRepository(port);
  const categorias = new SqliteCategoriaRepository(port);
  const colecciones = new SqliteCollectionRepository(port);

  return {
    items: new SqliteItemRepository(port),
    categorias,
    familias,
    colecciones,
    configuracion: new SqliteConfiguracionRepository(port),
    dashboard: new SqliteDashboardRepository(port),
    importSupport: new SqliteImportSupportRepository(port),
    database: port,
  };
}
