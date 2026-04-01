import { openDB } from 'idb';
import initSqlJs, { type Database, type QueryExecResult, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { ItemListQuery, ItemListResult, SaveItemCommand } from '../../application/dto';
import type {
  CollectionRepository,
  ConfiguracionRepository,
  DashboardRepository,
  DatabasePort,
  ImportSupportRepository,
  ItemRepository,
  NamedEntityRepository,
} from '../../domain/repositories';
import type { Configuracion, DashboardSummary, EntityId, Item, NamedEntity } from '../../domain/entities';
import { DEFAULT_CONFIGURATION, SCHEMA_SQL } from './schema';

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

function getOrderByClause(query: ItemListQuery) {
  const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';

  switch (query.sortBy) {
    case 'codigo':
      return `i.codigo COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'precio':
      return `i.precio ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'categoria':
      return `CASE WHEN c.nombre IS NULL THEN 1 ELSE 0 END ASC, c.nombre COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
    case 'familia':
      return `CASE WHEN f.nombre IS NULL THEN 1 ELSE 0 END ASC, f.nombre COLLATE NOCASE ${direction}, i.nombre COLLATE NOCASE ASC`;
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
    categoriaId: row.categoria_id === null ? null : Number(row.categoria_id),
    categoriaNombre: nullableText(row.categoria_nombre),
    familiaId: row.familia_id === null ? null : Number(row.familia_id),
    familiaNombre: nullableText(row.familia_nombre),
    fotografia: toUint8Array(row.fotografia),
    fotografiaMime: nullableText(row.fotografia_mime),
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
    db.run(SCHEMA_SQL);
    db.run('PRAGMA foreign_keys = ON');
    this.ensureConfigurationRow(db);
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
    db.run(SCHEMA_SQL);
    db.run('PRAGMA foreign_keys = ON');
    this.ensureConfigurationRow(db);
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
    protected readonly table: 'categorias' | 'familias' | 'colecciones',
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
      return Number(
        rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id,
      );
    });
  }

  async delete(id: EntityId) {
    await this.port.withTransaction((db) => {
      db.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
    });
  }
}

class SqliteCollectionRepository
  extends BaseNamedEntityRepository
  implements CollectionRepository
{
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
      return row ? mapConfiguracion(row) : mapConfiguracion(DEFAULT_CONFIGURATION as unknown as Record<string, unknown>);
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

  async ensureCategoria(nombre: string) {
    return this.ensureEntity('categorias', nombre);
  }

  async ensureFamilia(nombre: string) {
    return this.ensureEntity('familias', nombre);
  }

  async ensureColeccion(nombre: string) {
    return this.ensureEntity('colecciones', nombre);
  }

  private async ensureEntity(table: 'categorias' | 'familias' | 'colecciones', nombre: string) {
    return this.port.withTransaction((db) => {
      const normalized = normalizeNamed(nombre);
      const existing = rowsFromResult<{ id: number }>(
        db.exec(`SELECT id FROM ${table} WHERE nombre = ?`, [normalized]),
      )[0];
      if (existing) {
        return Number(existing.id);
      }

      db.run(`INSERT INTO ${table} (nombre) VALUES (?)`, [normalized]);
      return Number(
        rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id,
      );
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
          AND (?2 IS NULL OR i.categoria_id = ?2)
          AND (?3 IS NULL OR i.familia_id = ?3)
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
              c.nombre AS categoria_nombre,
              f.nombre AS familia_nombre,
              (
                SELECT MIN(col2.nombre)
                FROM coleccion_item ci3
                JOIN colecciones col2 ON col2.id = ci3.coleccion_id
                WHERE ci3.item_id = i.id
              ) AS primary_collection
            FROM items i
            LEFT JOIN categorias c ON c.id = i.categoria_id
            LEFT JOIN familias f ON f.id = i.familia_id
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

      if (items.length > 0) {
        const ids = items.map((item) => item.id).join(', ');
        const links = rowsFromResult<{ item_id: number; id: number; nombre: string }>(
          db.exec(`
            SELECT ci.item_id, col.id, col.nombre
            FROM coleccion_item ci
            JOIN colecciones col ON col.id = ci.coleccion_id
            WHERE ci.item_id IN (${ids})
            ORDER BY col.nombre COLLATE NOCASE ASC
          `),
        );

        const linkMap = new Map<number, Item['colecciones']>();
        for (const link of links) {
          const list = linkMap.get(Number(link.item_id)) ?? [];
          list.push({ id: Number(link.id), nombre: String(link.nombre) });
          linkMap.set(Number(link.item_id), list);
        }

        items.forEach((item) => {
          item.colecciones = linkMap.get(item.id) ?? [];
        });
      }

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
        db.exec(
          `
            SELECT i.*, c.nombre AS categoria_nombre, f.nombre AS familia_nombre
            FROM items i
            LEFT JOIN categorias c ON c.id = i.categoria_id
            LEFT JOIN familias f ON f.id = i.familia_id
            WHERE i.id = ?
          `,
          [id],
        ),
      )[0];
      if (!row) {
        return null;
      }
      const item = mapItemRow(row);
      const links = rowsFromResult<{ id: number; nombre: string }>(
        db.exec(
          `
            SELECT col.id, col.nombre
            FROM coleccion_item ci
            JOIN colecciones col ON col.id = ci.coleccion_id
            WHERE ci.item_id = ?
            ORDER BY col.nombre COLLATE NOCASE ASC
          `,
          [id],
        ),
      );
      item.colecciones = links.map((link) => ({
        id: Number(link.id),
        nombre: String(link.nombre),
      }));
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
      const filteredIds = excludedIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

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
           SET codigo = ?, nombre = ?, precio = ?, unidad_medida = ?, descripcion = ?, categoria_id = ?, familia_id = ?, fotografia = ?, fotografia_mime = ?
           WHERE id = ?`,
          [
            command.codigo,
            command.nombre,
            command.precio,
            command.unidadMedida,
            command.descripcion,
            command.categoriaId,
            command.familiaId,
            command.fotografia,
            command.fotografiaMime,
            command.id,
          ],
        );
      } else {
        db.run(
          `INSERT INTO items (
            codigo, nombre, precio, unidad_medida, descripcion, categoria_id, familia_id, fotografia, fotografia_mime
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            command.codigo,
            command.nombre,
            command.precio,
            command.unidadMedida,
            command.descripcion,
            command.categoriaId,
            command.familiaId,
            command.fotografia,
            command.fotografiaMime,
          ],
        );
        command.id = Number(
          rowsFromResult<{ id: number }>(db.exec('SELECT last_insert_rowid() AS id'))[0].id,
        );
      }

      db.run('DELETE FROM coleccion_item WHERE item_id = ?', [command.id]);
      for (const collectionId of command.collectionIds) {
        db.run('INSERT OR IGNORE INTO coleccion_item (coleccion_id, item_id) VALUES (?, ?)', [
          collectionId,
          command.id,
        ]);
      }

      return Number(command.id);
    });
  }

  async delete(id: EntityId) {
    await this.port.withTransaction((db) => {
      db.run('DELETE FROM items WHERE id = ?', [id]);
    });
  }

  async addItemsToCollection(collectionId: EntityId, itemIds: EntityId[]) {
    await this.port.withTransaction((db) => {
      for (const itemId of itemIds) {
        db.run('INSERT OR IGNORE INTO coleccion_item (coleccion_id, item_id) VALUES (?, ?)', [
          collectionId,
          itemId,
        ]);
      }
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
  const categorias = new BaseNamedEntityRepository(port, 'categorias');
  const familias = new BaseNamedEntityRepository(port, 'familias');
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
