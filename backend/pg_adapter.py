"""
MAJA shared data layer — a Mongo-compatible async API over Postgres (Supabase).

WHY: the platform's domain logic was written against MongoDB/motor
(`db.profiles.find_one({...})`, `update_one({...}, {"$set": {...}})`, ...).
Rather than rewrite hundreds of call sites, every collection is stored as a
Postgres table `(id TEXT PK, data JSONB, created_at, updated_at)` with hot
fields promoted to generated, indexed columns (see db/schema.sql). This module
exposes a thin async facade that translates the Mongo operations the codebase
actually uses into SQL over those JSONB tables.

Supported (the surface the monolith uses):
  Collection.find_one / find / insert_one / insert_many / update_one /
  update_many / delete_one / delete_many / count_documents / distinct /
  find_one_and_update.  Cursor: .sort().skip().limit().to_list(n).

Filter operators: equality (incl. nested "a.b"), $eq $ne $gt $gte $lt $lte
$in $nin $exists $regex, plus $or / $and / $not. Update operators: $set $inc
$unset $push $pull $addToSet $setOnInsert (+ bare-doc replace).

Anything outside this surface (exotic aggregation pipelines) raises a clear
NotImplementedError so the few such call sites are ported deliberately.
"""

from __future__ import annotations

import os
import re
import uuid
import json
import hashlib
import logging
import asyncpg
from decimal import Decimal
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple


def _json_default(o: Any):
    """JSON-serialize the non-primitive types Mongo/BSON accepted natively but
    `json` does not: datetimes -> ISO strings, Decimal -> float, sets -> list."""
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (set, frozenset)):
        return list(o)
    if isinstance(o, bytes):
        return o.decode("utf-8", "ignore")
    return str(o)


def _dumps(obj: Any, **kw) -> str:
    kw.setdefault("default", _json_default)
    return json.dumps(obj, **kw)


def _as_doc(v: Any) -> Any:
    """asyncpg returns jsonb columns as JSON text — decode to a Python dict/list."""
    return json.loads(v) if isinstance(v, str) else v

logger = logging.getLogger("pg_adapter")

# Identifier guard — table/collection names come from code, never user input,
# but validate anyway so the f-string SQL is always safe.
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _check_ident(name: str) -> str:
    if not _IDENT_RE.match(name or ""):
        raise ValueError(f"Unsafe identifier: {name!r}")
    return name


# Default per-connection statement timeout for the pool (asyncpg's
# `command_timeout`). Without one, a stuck query (lock wait, runaway scan)
# can hold a pool connection — and the request awaiting it — open forever.
# 30s is generous for normal request-path queries; CREATE INDEX CONCURRENTLY
# needs its own, much larger, per-call override (see create_index below).
_PG_COMMAND_TIMEOUT = float(os.environ.get("PG_COMMAND_TIMEOUT", "30"))

# Per-call override for CREATE INDEX CONCURRENTLY, which can legitimately run
# minutes on a large live table — far past _PG_COMMAND_TIMEOUT. Passing
# `timeout=None` to conn.execute() does NOT disable the pool's command_timeout
# for that call: asyncpg's own rule (protocol.pyx _get_timeout_impl) is
# "timeout=None means fall back to the connection's configured
# command_timeout", so an explicit None would still get cut off at 30s. The
# only way to actually widen the budget for this one statement is an
# explicit, larger numeric timeout.
_INDEX_BUILD_TIMEOUT = 600.0  # 10 min; these only run once per index, at boot.


def _now_iso() -> str:
    # Callers that need timestamps pass them in; kept here only for inserts that
    # omit created_at. Avoids importing datetime everywhere.
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ---- result shims (mimic pymongo/motor result objects) ---------------------
class InsertOneResult:
    def __init__(self, inserted_id: str): self.inserted_id = inserted_id

class InsertManyResult:
    def __init__(self, inserted_ids: List[str]): self.inserted_ids = inserted_ids

class UpdateResult:
    def __init__(self, matched: int, modified: int, upserted_id: Optional[str] = None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id

class DeleteResult:
    def __init__(self, deleted: int): self.deleted_count = deleted


class Database:
    """Async DB handle. `db.collection` or `db["collection"]` -> Collection."""

    def __init__(self, pool: Optional[asyncpg.Pool] = None, *, dsn: str = "",
                 min_size: int = 1, max_size: int = 10):
        self._pool = pool
        self._dsn = dsn
        self._min = min_size
        self._max = max_size
        self._cols: Dict[str, "Collection"] = {}
        self._ensured: set[str] = set()
        self._columns_cache: Dict[str, set] = {}
        self._connect_lock = None  # created lazily to avoid binding a loop early

    @classmethod
    async def connect(cls, dsn: str, *, min_size: int = 1, max_size: int = 10) -> "Database":
        pool = await asyncpg.create_pool(
            dsn=dsn, min_size=min_size, max_size=max_size,
            command_timeout=_PG_COMMAND_TIMEOUT,
        )
        return cls(pool)

    @classmethod
    def lazy(cls, dsn: str, *, min_size: int = 1, max_size: int = 10) -> "Database":
        """Construct without connecting. The pool is created on the first call
        to `ensure_connected()` (run this in an async startup hook) or on first
        query. Lets synchronous module-load code hold a `db` reference."""
        return cls(pool=None, dsn=dsn, min_size=min_size, max_size=max_size)

    async def ensure_connected(self) -> "Database":
        if self._pool is not None:
            return self
        import asyncio
        if self._connect_lock is None:
            self._connect_lock = asyncio.Lock()
        async with self._connect_lock:
            if self._pool is None:
                if not self._dsn:
                    raise RuntimeError("Database has no pool and no DSN to connect with")
                self._pool = await asyncpg.create_pool(
                    dsn=self._dsn, min_size=self._min, max_size=self._max,
                    command_timeout=_PG_COMMAND_TIMEOUT,
                )
        return self

    async def close(self):
        await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool

    def __getitem__(self, name: str) -> "Collection":
        if name not in self._cols:
            self._cols[name] = Collection(self, _check_ident(name))
        return self._cols[name]

    def __getattr__(self, name: str) -> "Collection":
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    async def ensure_table(self, table: str) -> None:
        """Create a collection table on first use if the migration didn't ship
        one (long-tail collections). Same shape as the modelled tables."""
        await self.ensure_connected()
        if table in self._ensured:
            return
        _check_ident(table)
        # "IF NOT EXISTS" is NOT atomic against a concurrent creator: both
        # sessions pass the existence check, then collide in the system catalog
        # (duplicate key on pg_type_typname_nsp_index / pg_class_relname_nsp_index).
        # Two requests touching a long-tail collection for the first time hit
        # this and 500. The loser of the race can treat it as success -- the
        # table exists either way.
        async with self._pool.acquire() as conn:
            try:
                await conn.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id TEXT PRIMARY KEY,
                        data JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                """)
            except (asyncpg.exceptions.UniqueViolationError,
                    asyncpg.exceptions.DuplicateTableError):
                pass
            try:
                await conn.execute(
                    f"CREATE INDEX IF NOT EXISTS {table}_data_gin ON {table} USING gin(data);"
                )
            except (asyncpg.exceptions.UniqueViolationError,
                    asyncpg.exceptions.DuplicateTableError,
                    asyncpg.exceptions.DuplicateObjectError):
                pass
        self._ensured.add(table)

    async def list_collection_names(self) -> List[str]:
        """Mongo parity: collection names = the public base tables. Callers use
        this purely as an existence check before querying a long-tail collection.
        Without it, __getattr__ hands back a Collection and calling it raises
        "'Collection' object is not callable"."""
        await self.ensure_connected()
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
            )
        return [r["table_name"] for r in rows]

    async def _table_columns(self, table: str) -> Dict[str, str]:
        """Promoted column name -> SQL data_type.

        Returns a dict, not a set: every caller only does `field in promoted`
        (still works), but the value lets _bind() see that e.g. `created_at` is
        TIMESTAMPTZ and coerce an ISO string into a real datetime before binding.
        """
        if table in self._columns_cache:
            return self._columns_cache[table]
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name = $1",
                table,
            )
        cols = {r["column_name"]: r["data_type"] for r in rows}
        self._columns_cache[table] = cols
        return cols


class _Param:
    """Monotonic $1,$2,... allocator for one query."""
    def __init__(self): self.vals: List[Any] = []
    def add(self, v: Any) -> str:
        self.vals.append(v)
        return f"${len(self.vals)}"


class Collection:
    # operator -> SQL comparison template
    _CMP = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<=", "$ne": "<>", "$eq": "="}

    def __init__(self, db: Database, table: str):
        self._db = db
        self._t = table

    # ---- helpers -----------------------------------------------------------
    def _field_sql(self, field: str, promoted: set) -> str:
        """SQL text expression for a (possibly dotted) document field."""
        _check_field(field)  # defence-in-depth: field names are interpolated
        if field in promoted:
            return field  # promoted/indexed column
        if "." in field:
            path = "{" + ",".join(field.split(".")) + "}"
            return f"(data #>> '{path}')"
        return f"(data ->> '{field}')"

    def _bind(self, field: str, value: Any, promoted: set, p: _Param) -> str:
        """Placeholder for a filter value, bound with the right Python type.

        A promoted field is a REAL typed column (created_at TIMESTAMPTZ, ...), so
        asyncpg binds the parameter as that type. Passing _as_text() there sends an
        ISO string and asyncpg raises
            DataError: invalid input for query argument $N: '2026-…' (expected a
            datetime.date or datetime.datetime instance, got 'str')
        Non-promoted fields live in JSONB and are compared as text, where the ISO
        string is what we want.
        """
        if field in promoted:
            coltype = (promoted.get(field) or "") if isinstance(promoted, dict) else ""
            if coltype.startswith("timestamp") or coltype == "date":
                if isinstance(value, (datetime, date)):
                    return p.add(value)
                if isinstance(value, str):
                    # Callers routinely pass .isoformat() strings.
                    try:
                        return p.add(datetime.fromisoformat(value.replace("Z", "+00:00")))
                    except ValueError:
                        pass
            elif coltype == "boolean":
                # Same class of bug as the timestamp case above, found via a 500
                # on "feature this wish": _as_text(True) sends 'true' and asyncpg
                # refuses to bind text into a boolean parameter. JSON booleans
                # also arrive as the strings 'true'/'false' from JSONB.
                if isinstance(value, bool):
                    return p.add(value)
                if isinstance(value, str) and value.lower() in ("true", "false"):
                    return p.add(value.lower() == "true")
            elif coltype in ("smallint", "integer", "bigint"):
                if isinstance(value, bool):
                    return p.add(int(value))
                if isinstance(value, int):
                    return p.add(value)
                if isinstance(value, str):
                    try:
                        return p.add(int(value))
                    except ValueError:
                        pass
            elif coltype in ("numeric", "real", "double precision"):
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return p.add(float(value))
                if isinstance(value, str):
                    try:
                        return p.add(float(value))
                    except ValueError:
                        pass
        return p.add(_as_text(value))

    def _cmp_value(self, field: str, field_sql: str, op: str, value: Any,
                   promoted: set, p: _Param) -> str:
        # Numeric-aware comparison for ordering operators; ISO strings sort
        # lexically so text compare is correct for dates too.
        # Allocate the placeholder INSIDE each branch: allocating up front left an
        # unreferenced $N in the numeric path, and asyncpg rejects a query whose
        # parameter never appears in the SQL ("could not determine data type").
        if op in ("$gt", "$gte", "$lt", "$lte") and isinstance(value, (int, float)) and not isinstance(value, bool):
            return f"NULLIF({field_sql}, '')::numeric {self._CMP[op]} {p.add(value)}"
        return f"{field_sql} {self._CMP[op]} {self._bind(field, value, promoted, p)}"

    def _clause(self, field: str, cond: Any, promoted: set, p: _Param) -> str:
        fsql = self._field_sql(field, promoted)
        if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
            parts = []
            for op, val in cond.items():
                if op == "$eq":
                    parts.append(self._eq(field, fsql, val, promoted, p))
                elif op == "$ne":
                    parts.append(f"({fsql} IS DISTINCT FROM {p.add(_as_text(val))})")
                elif op in ("$gt", "$gte", "$lt", "$lte"):
                    parts.append(self._cmp_value(field, fsql, op, val, promoted, p))
                elif op == "$in":
                    parts.append(self._in(field, fsql, val, promoted, p, negate=False))
                elif op == "$nin":
                    parts.append(self._in(field, fsql, val, promoted, p, negate=True))
                elif op == "$exists":
                    has = f"(data ? '{field}')" if "." not in field and field not in promoted else f"{fsql} IS NOT NULL"
                    parts.append(has if val else f"NOT {has}")
                elif op == "$regex":
                    flags = cond.get("$options", "")
                    rx = "~*" if "i" in flags else "~"
                    parts.append(f"{fsql} {rx} {p.add(val)}")
                elif op == "$options":
                    continue
                else:
                    raise NotImplementedError(f"Unsupported operator {op} on {field}")
            return "(" + " AND ".join(parts) + ")"
        return self._eq(field, fsql, cond, promoted, p)

    def _eq(self, field: str, fsql: str, val: Any, promoted: set, p: _Param) -> str:
        if val is None:
            return f"({fsql} IS NULL)"
        if isinstance(val, re.Pattern):
            # Mongo accepts a compiled pattern as a filter value; this adapter
            # never did, and used to fall through to JSONB containment against
            # the repr of the object — a filter that silently matched nothing.
            # The guest check-in dedup was broken this way for its whole life.
            # Refuse loudly instead: an unsupported query should fail, not
            # quietly return the wrong rows.
            raise NotImplementedError(
                f"compiled regex passed as a filter value for {field!r}; "
                f'use {{"$regex": "...", "$options": "i"}} instead')
        if field in promoted or "." in field:
            return f"{fsql} = {self._bind(field, val, promoted, p)}"
        # Non-promoted top-level scalar -> JSONB containment (GIN-indexed).
        return f"data @> {p.add(_dumps({field: val}))}::jsonb"

    def _in(self, field, fsql, values, promoted, p, *, negate) -> str:
        if not isinstance(values, (list, tuple)):
            raise ValueError("$in/$nin expects a list")
        if not values:
            return "FALSE" if not negate else "TRUE"
        arr = p.add([_as_text(v) for v in values])
        expr = f"{fsql} = ANY({arr}::text[])"
        return f"NOT ({expr})" if negate else expr

    def _where(self, flt: Optional[Dict], promoted: set, p: _Param) -> str:
        if not flt:
            return "TRUE"
        parts = []
        for key, cond in flt.items():
            if key == "$or":
                parts.append("(" + " OR ".join(self._where(c, promoted, p) for c in cond) + ")")
            elif key == "$and":
                parts.append("(" + " AND ".join(self._where(c, promoted, p) for c in cond) + ")")
            elif key == "$nor":
                parts.append("NOT (" + " OR ".join(self._where(c, promoted, p) for c in cond) + ")")
            elif key.startswith("$"):
                raise NotImplementedError(f"Unsupported top-level operator {key}")
            else:
                parts.append(self._clause(key, cond, promoted, p))
        return " AND ".join(parts) if parts else "TRUE"

    # ---- update translation ------------------------------------------------
    def _build_update_expr(self, update: Dict, p: _Param) -> Tuple[str, Optional[Dict]]:
        """Return (data_sql_expr, set_on_insert_doc). data_sql_expr transforms
        the existing `data` column."""
        if not any(k.startswith("$") for k in update):
            # bare doc -> full replace (keep id)
            return p.add(_dumps(update)) + "::jsonb", None
        expr = "data"
        set_on_insert = None
        for op, fields in update.items():
            if op == "$set":
                for k, v in fields.items():
                    expr = f"jsonb_set({expr}, '{{{_path(k)}}}', {p.add(_dumps(v))}::jsonb, true)"
            elif op == "$setOnInsert":
                set_on_insert = fields
            elif op == "$inc":
                for k, v in fields.items():
                    cur = f"COALESCE((({expr}) #>> '{{{_path(k)}}}')::numeric, 0)"
                    expr = f"jsonb_set({expr}, '{{{_path(k)}}}', to_jsonb({cur} + {p.add(v)}), true)"
            elif op == "$unset":
                for k in fields:
                    if "." in k:
                        expr = f"({expr} #- '{{{_path(k)}}}')"
                    else:
                        expr = f"({expr} - {p.add(k)})"
            elif op == "$push":
                for k, v in fields.items():
                    val = v.get("$each") if isinstance(v, dict) and "$each" in v else [v]
                    expr = (f"jsonb_set({expr}, '{{{_path(k)}}}', "
                            f"COALESCE({expr} #> '{{{_path(k)}}}', '[]'::jsonb) || {p.add(_dumps(val))}::jsonb, true)")
            elif op == "$addToSet":
                for k, v in fields.items():
                    # append only if not already present (scalar-safe)
                    arr = f"COALESCE({expr} #> '{{{_path(k)}}}', '[]'::jsonb)"
                    valjson = p.add(_dumps(v))
                    expr = (f"jsonb_set({expr}, '{{{_path(k)}}}', "
                            f"CASE WHEN {arr} @> {valjson}::jsonb THEN {arr} "
                            f"ELSE {arr} || jsonb_build_array({valjson}::jsonb) END, true)")
            elif op == "$pull":
                for k, v in fields.items():
                    valjson = p.add(_dumps(v))
                    arr = f"COALESCE({expr} #> '{{{_path(k)}}}', '[]'::jsonb)"
                    expr = (f"jsonb_set({expr}, '{{{_path(k)}}}', "
                            f"COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements({arr}) e "
                            f"WHERE e <> {valjson}::jsonb), '[]'::jsonb), true)")
            else:
                raise NotImplementedError(f"Unsupported update operator {op}")
        return expr, set_on_insert

    # ---- public API --------------------------------------------------------
    async def find_one(self, flt: Optional[Dict] = None, projection: Optional[Dict] = None,
                       sort: Optional[List[Tuple[str, int]]] = None) -> Optional[Dict]:
        # Mongo's find_one takes sort=[(field, -1)]; several call sites rely on it
        # to grab the newest row. Delegate to the cursor, which already builds the
        # ORDER BY, instead of duplicating that SQL here.
        if sort:
            rows = await self.find(flt, projection).sort(sort).limit(1).to_list(1)
            return rows[0] if rows else None
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        where = self._where(flt or {}, promoted, p)
        # Projection pushdown: fetch only the requested JSONB fields from the DB
        # instead of shipping the whole document and trimming in Python. Big
        # transfer saver for fat docs (profiles carry large theme/custom JSONB).
        sel, pushed = _select_expr(projection)
        sql = f"SELECT {sel} AS data FROM {self._t} WHERE {where} LIMIT 1"
        async with self._db.pool.acquire() as conn:
            row = await conn.fetchrow(sql, *p.vals)
        if not row:
            return None
        data = _as_doc(row["data"])
        return data if pushed else _project(data, projection)

    def find(self, flt: Optional[Dict] = None, projection: Optional[Dict] = None) -> "Cursor":
        return Cursor(self, flt or {}, projection)

    async def insert_one(self, doc: Dict) -> InsertOneResult:
        await self._db.ensure_table(self._t)
        doc = dict(doc)
        doc.pop("_id", None)
        _id = str(doc.get("id") or uuid.uuid4().hex)
        doc["id"] = _id
        async with self._db.pool.acquire() as conn:
            await conn.execute(
                f"INSERT INTO {self._t} (id, data) VALUES ($1, $2::jsonb)",
                _id, _dumps(doc),
            )
        return InsertOneResult(_id)

    async def insert_many(self, docs: List[Dict]) -> InsertManyResult:
        ids = []
        for d in docs:
            r = await self.insert_one(d)
            ids.append(r.inserted_id)
        return InsertManyResult(ids)

    async def update_one(self, flt: Dict, update: Dict, upsert: bool = False) -> UpdateResult:
        return await self._update(flt, update, upsert, many=False)

    async def update_many(self, flt: Dict, update: Dict, upsert: bool = False) -> UpdateResult:
        return await self._update(flt, update, upsert, many=True)

    async def _update(self, flt: Dict, update: Dict, upsert: bool, many: bool) -> UpdateResult:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        data_expr, set_on_insert = self._build_update_expr(update, p)
        where = self._where(flt or {}, promoted, p)
        limit_cte = "" if many else f" AND id IN (SELECT id FROM {self._t} WHERE {where} LIMIT 1)"
        # For single update, restrict via subquery; simplest portable form:
        if many:
            sql = f"UPDATE {self._t} SET data = {data_expr}, updated_at = now() WHERE {where} RETURNING id"
        else:
            # need a fresh param set for the inner where (params already consumed
            # in order); reuse same builder by appending — rebuild cleanly:
            p2 = _Param()
            data_expr2, _ = self._build_update_expr(update, p2)
            where2 = self._where(flt or {}, promoted, p2)
            # FOR UPDATE for the same reason as find_one_and_update: a guarded
            # single-row update ("set X only while status is still Y") has to
            # re-check its condition after taking the row lock, or two callers
            # both pass the check and both write.
            sql = (f"UPDATE {self._t} SET data = {data_expr2}, updated_at = now() "
                   f"WHERE id = (SELECT id FROM {self._t} WHERE {where2} LIMIT 1 FOR UPDATE) "
                   f"RETURNING id")
            p = p2
        async with self._db.pool.acquire() as conn:
            rows = await conn.fetch(sql, *p.vals)
            matched = len(rows)
            if matched == 0 and upsert:
                # Build the new doc from filter equalities + $set/$setOnInsert.
                newdoc: Dict[str, Any] = {}
                for k, v in (flt or {}).items():
                    if not k.startswith("$") and not isinstance(v, dict):
                        newdoc[k] = v
                if any(k.startswith("$") for k in update):
                    newdoc.update(update.get("$set", {}))
                    newdoc.update(update.get("$setOnInsert", {}))
                    for k, v in update.get("$inc", {}).items():
                        newdoc[k] = (newdoc.get(k) or 0) + v
                else:
                    newdoc.update(update)
                _id = str(newdoc.get("id") or uuid.uuid4().hex)
                newdoc["id"] = _id
                await conn.execute(
                    f"INSERT INTO {self._t} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
                    _id, _dumps(newdoc),
                )
                return UpdateResult(0, 0, upserted_id=_id)
        return UpdateResult(matched, matched)

    async def find_one_and_update(self, flt: Dict, update: Dict, *, return_document: bool = False,
                                  upsert: bool = False, projection: Optional[Dict] = None) -> Optional[Dict]:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        data_expr, _ = self._build_update_expr(update, p)
        where = self._where(flt or {}, promoted, p)
        ret = "data" if return_document else "data"  # after-image; pre-image rarely used here
        # FOR UPDATE is what makes this a compare-and-swap.
        #
        # Without it the inner SELECT runs against the transaction's snapshot
        # and the outer UPDATE matches on `id` alone, so two concurrent callers
        # both saw the row as unclaimed, both passed the filter, and both
        # updated it — the second simply waited for the row lock and then wrote
        # anyway, never re-checking the condition it was supposed to be
        # guarding. Mongo's findAndModify is atomic per document; this was not,
        # and several call sites depend on it being so:
        #   * the publish lock (two clicks published one wedding twice),
        #   * the invoice-number counter,
        #   * face-search session and dead-letter claims, which media_reconcile
        #     documents as "CAS via find_one_and_update, status guard in the
        #     filter (house rule)".
        # With FOR UPDATE the loser blocks on the row, then Postgres re-runs the
        # qual against the committed version (READ COMMITTED / EvalPlanQual); if
        # it no longer matches, no row comes back and the caller sees None —
        # exactly the "somebody else got there first" signal it expects.
        sql = (f"UPDATE {self._t} SET data = {data_expr}, updated_at = now() "
               f"WHERE id = (SELECT id FROM {self._t} WHERE {where} LIMIT 1 FOR UPDATE) "
               f"RETURNING {ret}")
        async with self._db.pool.acquire() as conn:
            row = await conn.fetchrow(sql, *p.vals)
        if not row:
            if upsert:
                await self.update_one(flt, update, upsert=True)
                return await self.find_one(flt, projection)
            return None
        # `_as_doc` is not optional: asyncpg hands back a jsonb column as JSON
        # TEXT, and every other read path here decodes it. This one returned the
        # raw string, so find_one_and_update — the atomic claim behind publish,
        # invoice numbering, face-search session claims and the storage-plan
        # swap — handed its caller a str. `POST /api/weddings/{id}/publish`
        # died on `wedding.get('title')` with "'str' object has no attribute
        # 'get'", which the handler turned into a 500 for every publish.
        return _project(_as_doc(row["data"]), projection)

    async def delete_one(self, flt: Dict) -> DeleteResult:
        return await self._delete(flt, many=False)

    async def delete_many(self, flt: Dict) -> DeleteResult:
        return await self._delete(flt, many=True)

    async def _delete(self, flt: Dict, many: bool) -> DeleteResult:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        where = self._where(flt or {}, promoted, p)
        if many:
            sql = f"DELETE FROM {self._t} WHERE {where}"
        else:
            sql = f"DELETE FROM {self._t} WHERE id = (SELECT id FROM {self._t} WHERE {where} LIMIT 1)"
        async with self._db.pool.acquire() as conn:
            res = await conn.execute(sql, *p.vals)
        # res like "DELETE <n>"
        n = int(res.split()[-1]) if res and res.split()[-1].isdigit() else 0
        return DeleteResult(n)

    async def count_documents(self, flt: Optional[Dict] = None) -> int:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        where = self._where(flt or {}, promoted, p)
        async with self._db.pool.acquire() as conn:
            row = await conn.fetchrow(f"SELECT count(*) AS n FROM {self._t} WHERE {where}", *p.vals)
        return int(row["n"])

    async def distinct(self, field: str, flt: Optional[Dict] = None) -> List[Any]:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        p = _Param()
        where = self._where(flt or {}, promoted, p)
        fsql = self._field_sql(field, promoted)
        async with self._db.pool.acquire() as conn:
            rows = await conn.fetch(f"SELECT DISTINCT {fsql} AS v FROM {self._t} WHERE {where}", *p.vals)
        return [r["v"] for r in rows]

    def aggregate(self, pipeline: List[Dict]) -> "_AggResult":
        """Minimal aggregation. Supports $match, $group ($sum/$avg/$min/$max/
        $first/$count), $sort, $skip, $limit, $project, $count. The leading
        $match is pushed to SQL; remaining stages run in Python over the matched
        documents (fine for the bounded analytics totals these are used for).
        Returns an object usable as `await agg`, `async for r in agg`, or
        `await agg.to_list(n)` to match the various call sites."""
        return _AggResult(self, pipeline)

    async def _run_pipeline(self, pipeline: List[Dict]) -> List[Dict]:
        await self._db.ensure_table(self._t)
        promoted = await self._db._table_columns(self._t)
        # Fast path: push a simple [ $match?, $group, $sort?, $limit? ] pipeline
        # entirely to SQL (GROUP BY) so the DB does the summing and only the
        # grouped rows travel back — no loading every matched document into
        # Python. Covers the revenue/blessings/credit totals.
        fast = await self._try_sql_aggregate(pipeline, promoted)
        if fast is not None:
            return fast
        stages = list(pipeline or [])
        # leading $match -> SQL
        first_match = {}
        if stages and "$match" in stages[0]:
            first_match = stages.pop(0)["$match"]
        p = _Param()
        where = self._where(first_match or {}, promoted, p)
        async with self._db.pool.acquire() as conn:
            rows = await conn.fetch(f"SELECT data FROM {self._t} WHERE {where}", *p.vals)
        docs: List[Dict] = [_as_doc(r["data"]) for r in rows]
        for stage in stages:
            (op, spec), = stage.items()
            if op == "$match":
                docs = [d for d in docs if _py_match(d, spec)]
            elif op == "$group":
                docs = _py_group(docs, spec)
            elif op == "$sort":
                for f, d in reversed(list(spec.items())):
                    docs.sort(key=lambda x: (_get_field(x, f) is None, _get_field(x, f)), reverse=(d < 0))
            elif op == "$skip":
                docs = docs[int(spec):]
            elif op == "$limit":
                docs = docs[:int(spec)]
            elif op == "$count":
                docs = [{spec: len(docs)}]
            elif op == "$project":
                docs = [_py_project(d, spec) for d in docs]
            else:
                raise NotImplementedError(f"aggregate stage {op} not supported (collection {self._t})")
        return docs

    async def _try_sql_aggregate(self, pipeline: List[Dict], promoted: set) -> Optional[List[Dict]]:
        """Translate [ $match?, $group, $sort?, $limit? ] to a single GROUP BY
        query. Returns the result rows, or None if the pipeline isn't this
        simple shape (caller falls back to the Python executor)."""
        stages = list(pipeline or [])
        if not stages:
            return None
        match_spec = {}
        if "$match" in stages[0]:
            match_spec = stages.pop(0)["$match"]
        if not stages or "$group" not in stages[0]:
            return None
        group = stages.pop(0)["$group"]
        sort_spec = limit_n = None
        for st in stages:
            if "$sort" in st and sort_spec is None:
                sort_spec = st["$sort"]
            elif "$limit" in st and limit_n is None:
                limit_n = st["$limit"]
            else:
                return None  # anything else -> not the fast shape

        # _id must be null or a single "$field" reference.
        id_expr = group.get("_id")
        if id_expr is None:
            id_sql, group_by = "NULL", ""
        elif isinstance(id_expr, str) and id_expr.startswith("$"):
            field = id_expr[1:]
            id_sql = field if field in promoted else f"(data ->> '{field}')"
            group_by = f" GROUP BY {id_sql}"
        else:
            return None

        select_cols = [f"{id_sql} AS _id"]
        out_names = ["_id"]
        for out, acc in group.items():
            if out == "_id":
                continue
            if not isinstance(acc, dict) or len(acc) != 1:
                return None
            (fn, arg), = acc.items()
            if fn == "$sum":
                if arg == 1:
                    col = "COUNT(*)"
                elif isinstance(arg, str) and arg.startswith("$"):
                    col = f"COALESCE(SUM(NULLIF(data ->> '{arg[1:]}','')::numeric), 0)"
                else:
                    return None
            elif fn == "$count":
                col = "COUNT(*)"
            elif fn in ("$avg", "$min", "$max") and isinstance(arg, str) and arg.startswith("$"):
                aggfn = {"$avg": "AVG", "$min": "MIN", "$max": "MAX"}[fn]
                col = f"{aggfn}(NULLIF(data ->> '{arg[1:]}','')::numeric)"
            else:
                return None
            select_cols.append(f"{col} AS {_check_ident(out) if _IDENT_RE.match(out) else 'x'}")
            out_names.append(out)

        p = _Param()
        where = self._where(match_spec or {}, promoted, p)
        sql = f"SELECT {', '.join(select_cols)} FROM {self._t} WHERE {where}{group_by}"
        if sort_spec:
            f, d = next(iter(sort_spec.items()))
            key = f if f in out_names else (f if f in promoted else f"(data ->> '{f}')")
            sql += f" ORDER BY {key} {'ASC' if d >= 0 else 'DESC'}"
        if limit_n:
            sql += f" LIMIT {int(limit_n)}"
        async with self._db.pool.acquire() as conn:
            rows = await conn.fetch(sql, *p.vals)
        out = []
        for r in rows:
            d = {}
            for name in out_names:
                v = r[name]
                if isinstance(v, Decimal):  # numerics come back as Decimal
                    v = int(v) if v == v.to_integral_value() else float(v)
                d[name] = v
            out.append(d)
        return out

    async def create_index(
        self,
        keys: Any,
        *,
        name: Optional[str] = None,
        unique: bool = False,
        sparse: bool = False,
        partial: Optional[str] = None,    # raw SQL predicate for a partial index
        expireAfterSeconds: Optional[int] = None,
        background: bool = True,          # Mongo kwarg; every build here is CONCURRENTLY
        **_ignored: Any,
    ) -> Optional[str]:
        """Create the index for real. Mongo spec in, Postgres index out.

        This used to be `return None` with a comment saying indexes were
        declared in `db/schema.sql` — a path that does not exist (the file is
        `microservices/db/schema.sql`), and which in any case only ever runs on
        a FRESH volume. So the ~40 create_index calls the server makes at
        startup created nothing, on a new database or an old one, while
        logging "ready". The seven composite `profiles_admin_*` indexes behind
        the studio dashboard's `find(admin_id …).sort(created_at desc)` are
        declared nowhere else, so they simply did not exist — which is the
        quadratic slowdown the call site's own comment says it was fixing.

        A schema file cannot fix that, because an already-initialised database
        never re-runs it. Only creating the index at runtime reaches production.

        Semantics:
          * key expressions come from `_field_sql`, the SAME translation the
            query builder uses, so an index can never be built on an expression
            the planner will not recognise (promoted column vs `data->>'k'`).
          * `sparse=True` -> a partial index `WHERE <expr> IS NOT NULL`, which
            is what sparse means for these call sites (skip rows missing the
            field) and keeps the index small.
          * `unique=True` -> UNIQUE. If existing rows already violate it the
            build fails and raises; every call site logs that warning. A
            uniqueness constraint that cannot be built is worth a loud line —
            it means duplicates are already in the table.
          * CONCURRENTLY, so building one on a large live table does not take a
            write lock. It cannot run inside a transaction, hence its own
            connection with no transaction block.
          * Already exists -> a catalog check returns immediately, so the
            steady-state boot cost is one cheap query per declaration.

        Returns the index name, or None when nothing was created.
        """
        await self._db.ensure_table(self._t)

        # ---- normalise the Mongo key spec -------------------------------
        if isinstance(keys, str):
            spec: List[Tuple[str, int]] = [(keys, 1)]
        elif isinstance(keys, (list, tuple)):
            spec = []
            for item in keys:
                if isinstance(item, str):
                    spec.append((item, 1))
                else:
                    field, direction = item
                    spec.append((field, int(direction)))
        else:
            raise ValueError(f"unsupported index key spec: {keys!r}")
        if not spec:
            return None

        promoted = await self._db._table_columns(self._t)
        cols = []
        for field, direction in spec:
            expr = self._field_sql(field, promoted)
            cols.append(f"{expr} {'ASC' if direction >= 0 else 'DESC'}")

        idx_name = name or f"{self._t}_{'_'.join(f for f, _ in spec)}_idx"
        _check_ident(idx_name)
        if len(idx_name) > 63:
            # Postgres truncates identifiers at 63 bytes, which would silently
            # merge two long declarations into one name. Keep it deterministic.
            digest = hashlib.sha1(idx_name.encode()).hexdigest()[:8]
            idx_name = f"{idx_name[:54]}_{digest}"

        if expireAfterSeconds is not None:
            # Postgres has no TTL index. The btree still gets built (the field
            # is queried), but rows are NOT expired by it — whoever relies on
            # expiry needs a sweeper. Said once per index, not per boot loop.
            logger.warning(
                "[pg] %s.%s: expireAfterSeconds=%s has no Postgres equivalent; "
                "the index is created but rows will NOT expire on their own",
                self._t, idx_name, expireAfterSeconds,
            )

        async with self._db.pool.acquire() as conn:
            exists = await conn.fetchval(
                "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' "
                "AND tablename = $1 AND indexname = $2",
                self._t, idx_name,
            )
            if exists:
                return idx_name

            ddl = (f"CREATE {'UNIQUE ' if unique else ''}INDEX CONCURRENTLY "
                   f"IF NOT EXISTS {idx_name} ON {self._t} ({', '.join(cols)})")
            if partial:
                # Caller-supplied raw predicate, e.g. "(data->>'status') = 'active'".
                # Write it in data->> form so it is valid whether or not the field
                # was promoted to a generated column (schema.sql vs ensure_table).
                ddl += f" WHERE {partial}"
            elif sparse:
                # Partial index over the rows that HAVE every indexed field.
                # Stricter than Mongo (which keeps a compound-sparse row that
                # has any one of them), and deliberately so: the call sites use
                # sparse to keep an index off the majority of rows —
                # `(admin_id, deleted_at) sparse` exists to serve the trash
                # list, and predicating on admin_id alone (always present)
                # would index the whole table and defeat the point.
                preds = " AND ".join(
                    f"{self._field_sql(f, promoted)} IS NOT NULL" for f, _ in spec)
                ddl += f" WHERE {preds}"
            # CONCURRENTLY is invalid inside a transaction block; asyncpg only
            # opens one when asked, so a bare execute() here is autocommit.
            # Explicit timeout override — see _INDEX_BUILD_TIMEOUT above for
            # why `timeout=None` would NOT have exempted this from the pool's
            # command_timeout.
            await conn.execute(ddl, timeout=_INDEX_BUILD_TIMEOUT)

        logger.info("[pg] created index %s on %s", idx_name, self._t)
        return idx_name


class Cursor:
    def __init__(self, coll: Collection, flt: Dict, projection: Optional[Dict]):
        self._c = coll
        self._flt = flt
        self._proj = projection
        self._sort: List[Tuple[str, int]] = []
        self._skip = 0
        self._limit = 0

    def sort(self, key_or_list, direction: int = 1) -> "Cursor":
        if isinstance(key_or_list, str):
            self._sort = [(key_or_list, direction)]
        else:
            self._sort = list(key_or_list)
        return self

    def skip(self, n: int) -> "Cursor":
        self._skip = n; return self

    def limit(self, n: int) -> "Cursor":
        self._limit = n; return self

    def __aiter__(self):
        self._aiter = None
        return self

    async def __anext__(self):
        if self._aiter is None:
            self._aiter = iter(await self.to_list())
        try:
            return next(self._aiter)
        except StopIteration:
            raise StopAsyncIteration

    async def to_list(self, length: Optional[int] = None) -> List[Dict]:
        coll = self._c
        await coll._db.ensure_table(coll._t)
        promoted = await coll._db._table_columns(coll._t)
        p = _Param()
        where = coll._where(self._flt or {}, promoted, p)
        order = ""
        if self._sort:
            cols = []
            for f, d in self._sort:
                fsql = coll._field_sql(f, promoted)
                cols.append(f"{fsql} {'ASC' if d >= 0 else 'DESC'}")
            order = " ORDER BY " + ", ".join(cols)
        lim = self._limit or (length or 0)
        # A negative limit/skip is a bad request param (e.g. `?limit=-1`). It is
        # truthy in Python, so without this clamp it reaches Postgres as
        # `LIMIT -1`, which raises "LIMIT must not be negative" — a bare 500 on
        # every route that funnels a query param straight into here. Clamp to the
        # existing "falsy means unbounded" convention so it degrades, not crashes.
        if lim < 0:
            lim = 0
        skip_v = self._skip if (self._skip and self._skip > 0) else 0
        limit_sql = f" LIMIT {int(lim)}" if lim else ""
        offset_sql = f" OFFSET {int(skip_v)}" if skip_v else ""
        sel, pushed = _select_expr(self._proj)
        sql = f"SELECT {sel} AS data FROM {coll._t} WHERE {where}{order}{offset_sql}{limit_sql}"
        async with coll._db.pool.acquire() as conn:
            rows = await conn.fetch(sql, *p.vals)
        if pushed:
            return [_as_doc(r["data"]) for r in rows]
        return [_project(_as_doc(r["data"]), self._proj) for r in rows]


# ---- module helpers --------------------------------------------------------
# Mongo-style document field/key names this adapter will interpolate into SQL.
# Real keys in this codebase are alnum + underscore + dot (nesting) + a leading
# digit for array indices. Anything else (quotes, braces, whitespace) is refused
# so a field/key name can never break out of the JSONB path/operator it sits in —
# regardless of whether a caller ever passes a user-controlled key. Values are
# always bound as $N parameters; this guards the NAMES.
_SAFE_FIELD = re.compile(r"^[A-Za-z0-9_.\-\[\]]+$")


def _check_field(name: str) -> None:
    if not isinstance(name, str) or not _SAFE_FIELD.match(name):
        raise ValueError(f"unsafe document field/key name: {name!r}")


def _path(dotted: str) -> str:
    """'a.b.c' -> 'a,b,c' for a Postgres text[] path literal."""
    _check_field(dotted)  # defence-in-depth: dotted key is interpolated below
    return ",".join(dotted.split("."))


def _as_text(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dict, list)):
        return _dumps(v)
    return str(v)


class _AggResult:
    """Lazy aggregation result. Works as `await agg`, `async for`, `.to_list()`."""
    def __init__(self, coll: "Collection", pipeline: List[Dict]):
        self._coll = coll
        self._pipeline = pipeline
        self._cache: Optional[List[Dict]] = None

    async def _run(self) -> List[Dict]:
        if self._cache is None:
            self._cache = await self._coll._run_pipeline(self._pipeline)
        return self._cache

    def __await__(self):
        return self._run().__await__()

    async def to_list(self, length: Optional[int] = None) -> List[Dict]:
        rows = await self._run()
        return rows[:length] if length else rows

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        rows = await self._run()
        if self._idx >= len(rows):
            raise StopAsyncIteration
        row = rows[self._idx]
        self._idx += 1
        return row


def _get_field(doc: Dict, field: str):
    if field.startswith("$"):
        field = field[1:]
    cur: Any = doc
    for part in field.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _resolve(doc: Dict, expr: Any):
    """Resolve a $group _id / accumulator argument."""
    if isinstance(expr, str) and expr.startswith("$"):
        return _get_field(doc, expr)
    if isinstance(expr, dict):
        return {k: _resolve(doc, v) for k, v in expr.items()}
    return expr


def _py_match(doc: Dict, spec: Dict) -> bool:
    for k, cond in spec.items():
        v = _get_field(doc, k)
        if isinstance(cond, dict) and any(str(o).startswith("$") for o in cond):
            for op, val in cond.items():
                if op == "$eq" and not (v == val): return False
                if op == "$ne" and not (v != val): return False
                if op == "$gt" and not (v is not None and v > val): return False
                if op == "$gte" and not (v is not None and v >= val): return False
                if op == "$lt" and not (v is not None and v < val): return False
                if op == "$lte" and not (v is not None and v <= val): return False
                if op == "$in" and v not in val: return False
                if op == "$nin" and v in val: return False
        else:
            if v != cond:
                return False
    return True


def _py_group(docs: List[Dict], spec: Dict) -> List[Dict]:
    id_expr = spec.get("_id")
    accs = {k: v for k, v in spec.items() if k != "_id"}
    groups: Dict[Any, Dict] = {}
    order: List[Any] = []
    for d in docs:
        key = _resolve(d, id_expr)
        hkey = _dumps(key, sort_keys=True, default=str)
        if hkey not in groups:
            groups[hkey] = {"_id": key, **{k: None for k in accs}}
            order.append(hkey)
        g = groups[hkey]
        for out, acc in accs.items():
            (fn, arg), = acc.items()
            val = _resolve(d, arg) if not (isinstance(arg, dict) and not arg) else None
            if fn == "$sum":
                g[out] = (g[out] or 0) + (val if isinstance(val, (int, float)) else (1 if arg == 1 else 0))
            elif fn == "$count":
                g[out] = (g[out] or 0) + 1
            elif fn == "$avg":
                g.setdefault("__cnt_" + out, 0)
                if isinstance(val, (int, float)):
                    g[out] = (g[out] or 0) + val
                    g["__cnt_" + out] += 1
            elif fn == "$min":
                g[out] = val if g[out] is None else min(g[out], val)
            elif fn == "$max":
                g[out] = val if g[out] is None else max(g[out], val)
            elif fn == "$first":
                if g[out] is None:
                    g[out] = val
    out_rows = []
    for hkey in order:
        g = groups[hkey]
        for out, acc in accs.items():
            (fn, _), = acc.items()
            if fn == "$avg":
                cnt = g.pop("__cnt_" + out, 0)
                g[out] = (g[out] / cnt) if cnt else 0
        out_rows.append(g)
    return out_rows


def _py_project(doc: Dict, spec: Dict) -> Dict:
    includes = [k for k, v in spec.items() if v and k != "_id"]
    if includes:
        out = {k: _get_field(doc, k) for k in includes}
        if spec.get("_id", 1):
            out["_id"] = doc.get("_id")
        return out
    excludes = [k for k, v in spec.items() if not v]
    return {k: v for k, v in doc.items() if k not in excludes}


def _select_expr(projection: Optional[Dict]) -> Tuple[str, bool]:
    """Build the SELECT expression for a Mongo projection so only the needed
    JSONB fields leave the database. Returns (sql_expr, pushed_down). Falls back
    to ("data", False) for anything unsupported (dotted/odd keys) — the caller
    then trims in Python."""
    if not projection:
        return "data", False
    proj = {k: v for k, v in projection.items() if k != "_id"}
    if not proj:
        return "data", False
    # only simple top-level identifier keys are safe to inline
    if any(not _IDENT_RE.match(k) for k in proj):
        return "data", False
    includes = [k for k, v in proj.items() if v]
    excludes = [k for k, v in proj.items() if not v]
    if includes:
        keys = list(dict.fromkeys(includes + ["id"]))  # always keep id, dedupe
        pairs = ", ".join(f"'{k}', data->'{k}'" for k in keys)
        return f"jsonb_build_object({pairs})", True
    if excludes:
        expr = "data"
        for k in excludes:
            expr = f"({expr} - '{k}')"
        return expr, True
    return "data", False


def _project(doc: Dict, projection: Optional[Dict]) -> Dict:
    if not projection:
        return doc
    # Mongo-style include/exclude. {"_id":0} is a no-op (we have no _id).
    proj = {k: v for k, v in projection.items() if k != "_id"}
    if not proj:
        return doc
    includes = [k for k, v in proj.items() if v]
    excludes = [k for k, v in proj.items() if not v]
    if includes:
        return {k: doc[k] for k in includes if k in doc} | ({"id": doc["id"]} if "id" in doc else {})
    if excludes:
        return {k: v for k, v in doc.items() if k not in excludes}
    return doc
