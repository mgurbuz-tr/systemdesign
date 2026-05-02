/**
 * `schema` capability — DB node'ları için tablo/kolon/FK/index şeması.
 * Default merge: augment (mevcut tabloları korur, eksikleri ekler).
 */
import { z } from 'zod';
import type { DbSchema, NodeData, TableDef } from '@/types';
import type { NodeCapability } from './types';
import { dedupeBy, makeAppliesTo } from './zod-shared';

/**
 * Lenient şema: AI sıkça \`type\`/\`nullable\`/\`primaryKey\` alanlarını es geçiyor.
 * Hepsi default'lu — AI sadece \`name\` versin yeterli; gerisi otomatik dolar.
 */
/**
 * Foreign key — AI farklı şekillerde yazabiliyor:
 *   - {"table":"users","column":"id"}        (canonical)
 *   - "users(id)" / "users.id" / "users:id"   (SQL-ish string)
 *   - {"references":"users(id)"}              (sugar)
 *   - {"referenceTable":"users","referenceColumn":"id"}
 *   - {"referenced_table":"users","referenced_column":"id"}
 * Hepsini canonical'a normalize ediyoruz; tanımayanı drop ediyoruz.
 */
const ForeignKeySchema = z.preprocess(
  (val) => {
    const parsePair = (s: string): { table: string; column: string } | null => {
      const m = s.match(/^\s*([a-zA-Z_][\w]*)\s*[.(:]\s*([a-zA-Z_][\w]*)\s*\)?\s*$/);
      return m ? { table: m[1]!, column: m[2]! } : null;
    };
    if (typeof val === 'string') {
      const r = parsePair(val);
      return r ?? undefined;
    }
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if (typeof obj.table === 'string' && typeof obj.column === 'string') {
        return { table: obj.table, column: obj.column };
      }
      if (typeof obj.references === 'string') {
        const r = parsePair(obj.references);
        if (r) return r;
      }
      if (
        typeof obj.referenceTable === 'string' &&
        typeof obj.referenceColumn === 'string'
      ) {
        return { table: obj.referenceTable, column: obj.referenceColumn };
      }
      if (
        typeof obj.referenced_table === 'string' &&
        typeof obj.referenced_column === 'string'
      ) {
        return {
          table: obj.referenced_table,
          column: obj.referenced_column,
        };
      }
      return undefined;
    }
    return undefined;
  },
  z.object({ table: z.string(), column: z.string() }).optional(),
);

const ColumnSchema = z.object({
  name: z.string(),
  type: z.string().default('text'),
  nullable: z.boolean().default(true),
  primaryKey: z.boolean().default(false),
  unique: z.boolean().optional(),
  default: z.string().optional(),
  foreignKey: ForeignKeySchema,
});

/**
 * AI sıkça index'lerde \`name\` vermiyor (sadece \`{"columns":["x"]}\`).
 * Eksikse columns'tan otomatik üret: \`tableX_a_b_idx\` gibi.
 */
const IndexSchema = z
  .object({
    name: z.string().optional(),
    columns: z.array(z.string()).default([]),
    unique: z.boolean().default(false),
  })
  .transform((idx) => ({
    name: idx.name ?? `${idx.columns.join('_') || 'idx'}_idx`,
    columns: idx.columns,
    unique: idx.unique,
  }));

const TableSchema = z.object({
  name: z.string(),
  columns: z.array(ColumnSchema).default([]),
  indexes: z.array(IndexSchema).default([]),
});

export const DbSchemaSchema = z.object({
  tables: z.array(TableSchema).default([]),
});

export const schemaCapability: NodeCapability<DbSchema> = {
  id: 'schema',
  label: 'Schema',
  patchOp: 'set_schema',
  schema: DbSchemaSchema as unknown as z.ZodType<DbSchema>,
  mergeStrategy: 'augment',
  order: 10,
  appliesTo: makeAppliesTo('schema'),
  read: (node: NodeData) => node.schema,
  write: (node, value) => ({ ...node, schema: value }),
  merge: (prev, incoming) => {
    if (!prev || prev.tables.length === 0) return incoming;
    // Tablo bazında dedupe — mevcut tablo adı geliyorsa mevcut korunur,
    // sadece yeni tablolar eklenir. AI augment modu "eksiği tamamla" der.
    const merged: TableDef[] = dedupeBy(
      [...prev.tables, ...incoming.tables],
      (t) => t.name.toLowerCase(),
    );
    return { tables: merged };
  },
  promptInstruction: (mode) => {
    if (mode === 'replace') {
      return (
        'Generate the TABLES for this DB node FROM SCRATCH: the core tables ' +
        'connected services need, their columns (PK, FK, NOT NULL, UNIQUE), ' +
        'and the necessary indexes. Write everything in one set_schema patch. ' +
        'Ignore any existing tables — this is replace mode.'
      );
    }
    return (
      'Suggest the MISSING tables/indexes for this DB node. Existing tables ' +
      'must be copied verbatim into the payload, with new ones appended. Emit ' +
      'a single set_schema patch listing all tables (existing + new).'
    );
  },
};
