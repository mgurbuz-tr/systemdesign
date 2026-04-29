import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/ui/Icon';
import type { ColumnDef, DbSchema, IndexDef, TableDef } from '@/types';
import { cn } from '@/lib/utils';

const COLUMN_TYPES = [
  'uuid',
  'text',
  'varchar',
  'int',
  'bigint',
  'decimal',
  'bool',
  'timestamp',
  'date',
  'json',
  'jsonb',
  'bytea',
];

interface Props {
  schema: DbSchema;
  onChange: (next: DbSchema) => void;
}

export function DbSchemaEditor({ schema, onChange }: Props) {
  const addTable = () => {
    const name = `table_${schema.tables.length + 1}`;
    const next: DbSchema = {
      tables: [
        ...schema.tables,
        {
          name,
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
          ],
          indexes: [],
        },
      ],
    };
    onChange(next);
  };

  const updateTable = (idx: number, patch: Partial<TableDef>) => {
    const next: DbSchema = {
      tables: schema.tables.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    };
    onChange(next);
  };

  const removeTable = (idx: number) => {
    onChange({ tables: schema.tables.filter((_, i) => i !== idx) });
  };

  const otherTables = schema.tables.map((t) => t.name);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          Tables · {schema.tables.length}
        </h3>
        <button
          onClick={addTable}
          className="flex items-center gap-1 rounded-md border border-border bg-input px-2 py-0.5 text-[10.5px] text-text hover:bg-hover"
        >
          <Icon name="plus" size={10} />
          <span>Table</span>
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {schema.tables.map((table, idx) => (
            <motion.div
              key={`${idx}-${table.name}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden rounded-md border border-border bg-input/40"
            >
              <TableBlock
                table={table}
                otherTables={otherTables.filter((n) => n !== table.name)}
                onChange={(patch) => updateTable(idx, patch)}
                onRemove={() => removeTable(idx)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {schema.tables.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-text-dim">
            Henüz tablo yok. <button onClick={addTable} className="underline">Bir tane ekle</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TableBlock({
  table,
  otherTables,
  onChange,
  onRemove,
}: {
  table: TableDef;
  otherTables: string[];
  onChange: (patch: Partial<TableDef>) => void;
  onRemove: () => void;
}) {
  const addColumn = () => {
    const idx = table.columns.length + 1;
    onChange({
      columns: [
        ...table.columns,
        {
          name: `col_${idx}`,
          type: 'text',
          nullable: true,
          primaryKey: false,
        },
      ],
    });
  };

  const updateColumn = (i: number, patch: Partial<ColumnDef>) => {
    onChange({
      columns: table.columns.map((c, ix) => (ix === i ? { ...c, ...patch } : c)),
    });
  };

  const removeColumn = (i: number) => {
    onChange({ columns: table.columns.filter((_, ix) => ix !== i) });
  };

  const addIndex = () => {
    const i = table.indexes.length + 1;
    onChange({
      indexes: [
        ...table.indexes,
        { name: `${table.name}_idx_${i}`, columns: [], unique: false },
      ],
    });
  };

  const updateIndex = (i: number, patch: Partial<IndexDef>) => {
    onChange({
      indexes: table.indexes.map((ix, k) => (k === i ? { ...ix, ...patch } : ix)),
    });
  };

  const removeIndex = (i: number) => {
    onChange({ indexes: table.indexes.filter((_, k) => k !== i) });
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <input
          value={table.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 border-none bg-transparent font-mono text-[12px] font-medium text-text focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
          aria-label="Remove table"
        >
          <Icon name="trash" size={11} />
        </button>
      </div>

      <div className="px-2 py-1.5">
        <div className="grid grid-cols-[1fr_84px_24px_24px_22px] gap-1 px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-text-dim">
          <span>Name</span>
          <span>Type</span>
          <span title="Primary key">PK</span>
          <span title="Nullable">NUL</span>
          <span />
        </div>
        {table.columns.map((col, i) => (
          <ColumnRow
            key={i}
            col={col}
            otherTables={otherTables}
            onChange={(p) => updateColumn(i, p)}
            onRemove={() => removeColumn(i)}
          />
        ))}
        <button
          onClick={addColumn}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1 text-[10.5px] text-text-dim hover:border-accent hover:text-text"
        >
          <Icon name="plus" size={10} />
          <span>Add column</span>
        </button>
      </div>

      {(table.indexes.length > 0 || table.columns.length > 1) && (
        <div className="border-t border-border-light px-2 py-1.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-text-dim">
              Indexes
            </span>
            <button
              onClick={addIndex}
              className="flex items-center gap-0.5 text-[10px] text-text-dim hover:text-text"
            >
              <Icon name="plus" size={9} />
              <span>idx</span>
            </button>
          </div>
          {table.indexes.map((ix, i) => (
            <IndexRow
              key={i}
              index={ix}
              columns={table.columns.map((c) => c.name)}
              onChange={(p) => updateIndex(i, p)}
              onRemove={() => removeIndex(i)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ColumnRow({
  col,
  otherTables,
  onChange,
  onRemove,
}: {
  col: ColumnDef;
  otherTables: string[];
  onChange: (p: Partial<ColumnDef>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_84px_24px_24px_22px] items-center gap-1 py-0.5">
      <input
        value={col.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-6 rounded border border-transparent bg-transparent px-1.5 font-mono text-[11px] text-text focus:border-border focus:bg-input focus:outline-none"
      />
      <select
        value={col.type}
        onChange={(e) => onChange({ type: e.target.value })}
        className="h-6 rounded border border-transparent bg-transparent px-1 font-mono text-[10.5px] text-text-dim hover:bg-input focus:border-border focus:bg-input focus:outline-none"
      >
        {COLUMN_TYPES.map((t) => (
          <option key={t} value={t} className="bg-panel text-text">
            {t}
          </option>
        ))}
      </select>
      <Toggle
        on={col.primaryKey}
        onClick={() =>
          onChange({ primaryKey: !col.primaryKey, nullable: col.primaryKey ? col.nullable : false })
        }
      />
      <Toggle on={col.nullable} onClick={() => onChange({ nullable: !col.nullable })} />
      <button
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
        aria-label="Remove column"
      >
        <Icon name="trash" size={10} />
      </button>
      {otherTables.length > 0 && (
        <div className="col-span-5 -mt-0.5 flex items-center gap-1 pl-2 text-[10px] text-text-dim">
          <span>FK →</span>
          <select
            value={col.foreignKey ? `${col.foreignKey.table}.${col.foreignKey.column}` : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) onChange({ foreignKey: undefined });
              else {
                const [table, column] = v.split('.');
                if (table && column) onChange({ foreignKey: { table, column } });
              }
            }}
            className="h-5 flex-1 rounded border border-transparent bg-transparent font-mono text-[10px] text-text-dim hover:bg-input focus:border-border focus:bg-input focus:outline-none"
          >
            <option value="" className="bg-panel">
              none
            </option>
            {otherTables.map((t) => (
              <option key={t} value={`${t}.id`} className="bg-panel">
                {t}.id
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function IndexRow({
  index,
  columns,
  onChange,
  onRemove,
}: {
  index: IndexDef;
  columns: string[];
  onChange: (p: Partial<IndexDef>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_24px_22px] items-center gap-1 py-0.5">
      <input
        value={index.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-6 rounded border border-transparent bg-transparent px-1.5 font-mono text-[10.5px] text-text-dim focus:border-border focus:bg-input focus:outline-none"
      />
      <select
        multiple={false}
        value={index.columns[0] ?? ''}
        onChange={(e) => onChange({ columns: e.target.value ? [e.target.value] : [] })}
        className="h-6 rounded border border-transparent bg-transparent px-1 font-mono text-[10.5px] text-text-dim focus:border-border focus:bg-input focus:outline-none"
      >
        <option value="" className="bg-panel">
          column…
        </option>
        {columns.map((c) => (
          <option key={c} value={c} className="bg-panel">
            {c}
          </option>
        ))}
      </select>
      <button
        onClick={() => onChange({ unique: !index.unique })}
        title={index.unique ? 'Unique' : 'Non-unique'}
        className={cn(
          'h-5 rounded text-[9px] font-bold tracking-wider',
          index.unique ? 'text-accent' : 'text-text-dim',
        )}
      >
        {index.unique ? 'UQ' : 'IX'}
      </button>
      <button
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded text-text-dim hover:bg-hover hover:text-[#c96442]"
        aria-label="Remove index"
      >
        <Icon name="trash" size={10} />
      </button>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn(
        'h-5 w-5 rounded text-[10px] font-bold',
        on ? 'text-accent' : 'text-text-dim',
      )}
    >
      {on ? '●' : '○'}
    </button>
  );
}
