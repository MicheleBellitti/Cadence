/**
 * A minimal in-memory Firestore double for unit tests.
 *
 * Deliberately NOT a full reimplementation of the Admin SDK — it supports
 * exactly the operations `project-data.ts` needs: `.doc().get()`,
 * `.collection().get()`, `.collection().doc().collection().get()` (for
 * subcollections), and `.where(field, op, value).get()` (for the
 * `memberIds array-contains uid` query in `listProjectsForUser`).
 *
 * Cast an instance with `as unknown as Firestore` when passing it to code
 * typed against the real Admin SDK — this double is structurally unrelated
 * to that (private-field-bearing) class on purpose, so a mismatch between
 * the two would be a type error, not a silent bug.
 */

export type FakeData = Record<string, unknown>;

type WhereOp = "==" | "array-contains";

interface FakeFilter {
  field: string;
  op: WhereOp;
  value: unknown;
}

function matchesFilter(data: FakeData, filter: FakeFilter): boolean {
  const fieldValue = data[filter.field];
  if (filter.op === "array-contains") {
    return Array.isArray(fieldValue) && fieldValue.includes(filter.value);
  }
  return fieldValue === filter.value;
}

export class FakeDocSnapshot {
  constructor(
    public readonly id: string,
    private readonly _data: FakeData | undefined
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  data(): FakeData | undefined {
    return this._data;
  }
}

export class FakeQuerySnapshot {
  constructor(public readonly docs: FakeDocSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }
}

export class FakeQuery {
  constructor(
    private readonly fs: FakeFirestore,
    private readonly path: string,
    private readonly filters: FakeFilter[]
  ) {}

  where(field: string, op: WhereOp, value: unknown): FakeQuery {
    return new FakeQuery(this.fs, this.path, [...this.filters, { field, op, value }]);
  }

  async get(): Promise<FakeQuerySnapshot> {
    const docs = this.fs
      .docsUnder(this.path)
      .filter((doc) => this.filters.every((f) => matchesFilter(doc.data() ?? {}, f)));
    return new FakeQuerySnapshot(docs);
  }
}

export class FakeDocRef {
  constructor(
    private readonly fs: FakeFirestore,
    private readonly path: string,
    public readonly id: string
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    return new FakeDocSnapshot(this.id, this.fs.rawDoc(this.path));
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this.fs, `${this.path}/${name}`);
  }
}

export class FakeCollectionRef {
  constructor(
    private readonly fs: FakeFirestore,
    private readonly path: string
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.fs, `${this.path}/${id}`, id);
  }

  where(field: string, op: WhereOp, value: unknown): FakeQuery {
    return new FakeQuery(this.fs, this.path, [{ field, op, value }]);
  }

  async get(): Promise<FakeQuerySnapshot> {
    return new FakeQuery(this.fs, this.path, []).get();
  }
}

export class FakeFirestore {
  private readonly docsByPath = new Map<string, FakeData>();

  /** Seeds (or overwrites) a document at an explicit slash-joined path, e.g. `"projects/p1/items/i1"`. */
  seed(path: string, data: FakeData): void {
    this.docsByPath.set(path, data);
  }

  rawDoc(path: string): FakeData | undefined {
    return this.docsByPath.get(path);
  }

  /** Direct children of `path` (exactly one segment deeper), as doc snapshots. */
  docsUnder(path: string): FakeDocSnapshot[] {
    const prefix = `${path}/`;
    const result: FakeDocSnapshot[] = [];
    for (const [key, data] of this.docsByPath) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.includes("/")) continue; // not a direct child — belongs to a deeper subcollection
      result.push(new FakeDocSnapshot(rest, data));
    }
    return result;
  }

  collection(name: string): FakeCollectionRef {
    return new FakeCollectionRef(this, name);
  }
}

// ─── Higher-level seeding for tests ─────────────────────────────────────────

export interface SeedProjectInput {
  id: string;
  name: string;
  deadline?: string | null;
  ownerId: string;
  memberIds: string[];
  activeSprint?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items?: Array<FakeData & { id: string }>;
  team?: Array<FakeData & { id: string }>;
  sprints?: Array<FakeData & { id: string }>;
  /** doc id must equal the overridden item's id, matching the real schema. */
  overrides?: Array<{ id: string; startDate: string }>;
}

export interface SeedUserInput {
  uid: string;
  projectId?: string | null;
  email?: string;
  displayName?: string;
}

export function buildFakeFirestore(opts: {
  projects?: SeedProjectInput[];
  users?: SeedUserInput[];
}): FakeFirestore {
  const fs = new FakeFirestore();

  for (const project of opts.projects ?? []) {
    const { id, items, team, sprints, overrides, ...rest } = project;
    fs.seed(`projects/${id}`, {
      name: rest.name,
      deadline: rest.deadline ?? null,
      ownerId: rest.ownerId,
      memberIds: rest.memberIds,
      activeSprint: rest.activeSprint ?? null,
      createdAt: rest.createdAt ?? "2026-01-01T00:00:00.000Z",
      updatedAt: rest.updatedAt ?? "2026-01-01T00:00:00.000Z",
    });
    for (const item of items ?? []) {
      const { id: itemId, ...data } = item;
      fs.seed(`projects/${id}/items/${itemId}`, data);
    }
    for (const member of team ?? []) {
      const { id: memberId, ...data } = member;
      fs.seed(`projects/${id}/team/${memberId}`, data);
    }
    for (const sprint of sprints ?? []) {
      const { id: sprintId, ...data } = sprint;
      fs.seed(`projects/${id}/sprints/${sprintId}`, data);
    }
    for (const override of overrides ?? []) {
      fs.seed(`projects/${id}/overrides/${override.id}`, { startDate: override.startDate });
    }
  }

  for (const user of opts.users ?? []) {
    fs.seed(`users/${user.uid}`, {
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      projectId: user.projectId ?? null,
    });
  }

  return fs;
}
