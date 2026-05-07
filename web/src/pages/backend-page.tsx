import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Database01,
  GitBranch01,
  SearchLg,
  Table,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { InputBase } from "@/components/base/input/input";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { CurateMindMark } from "@/components/CurateMindMark";
import { GitHubIcon } from "@/components/GitHubIcon";
import { ThemeModeControl } from "@/components/ThemeModeControl";
import { GITHUB_URL } from "@/config/homepage";
import { cn } from "@/lib/cn";

type EntityKey =
  | "projects"
  | "sources"
  | "researchThemes"
  | "researchPositions"
  | "positionVersions"
  | "dataPoints"
  | "tags"
  | "curatorObservations"
  | "mentalModels"
  | "researchLens";

type SnapshotRecord = Record<string, any> & { _id: string };

type Snapshot = {
  metadata: {
    generatedAt: string;
    projectName: string;
    note: string;
    counts: Record<EntityKey, number>;
  };
  entities: Record<EntityKey, SnapshotRecord[]>;
};

type EntityConfig = {
  key: EntityKey;
  label: string;
  description: string;
  columns: Array<{ key: string; label: string }>;
  filters?: Array<{ key: string; label: string }>;
};

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    key: "projects",
    label: "Projects",
    description: "Top level containers that scope demo content.",
    columns: [
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
      { key: "createdDate", label: "Created" },
    ],
  },
  {
    key: "sources",
    label: "Sources",
    description: "Provenance records for ingested external material.",
    columns: [
      { key: "title", label: "Title" },
      { key: "sourceType", label: "Type" },
      { key: "tier", label: "Tier" },
      { key: "status", label: "Status" },
      { key: "wordCount", label: "Words" },
      { key: "publishedDate", label: "Published" },
    ],
    filters: [
      { key: "sourceType", label: "Type" },
      { key: "tier", label: "Tier" },
      { key: "status", label: "Status" },
    ],
  },
  {
    key: "researchThemes",
    label: "Research Themes",
    description: "Macro areas that organize positions.",
    columns: [
      { key: "title", label: "Title" },
      { key: "description", label: "Description" },
      { key: "createdDate", label: "Created" },
    ],
  },
  {
    key: "researchPositions",
    label: "Research Positions",
    description: "Versioned theses under research themes.",
    columns: [
      { key: "title", label: "Title" },
      { key: "theme.title", label: "Theme" },
      { key: "currentVersion.confidenceLevel", label: "Confidence" },
      { key: "currentVersion.status", label: "Status" },
      { key: "createdDate", label: "Created" },
    ],
    filters: [
      { key: "currentVersion.confidenceLevel", label: "Confidence" },
      { key: "currentVersion.status", label: "Status" },
    ],
  },
  {
    key: "positionVersions",
    label: "Position Versions",
    description: "Append only history for each thesis.",
    columns: [
      { key: "position.title", label: "Position" },
      { key: "versionNumber", label: "Version" },
      { key: "confidenceLevel", label: "Confidence" },
      { key: "status", label: "Status" },
      { key: "versionDate", label: "Date" },
    ],
    filters: [
      { key: "confidenceLevel", label: "Confidence" },
      { key: "status", label: "Status" },
    ],
  },
  {
    key: "dataPoints",
    label: "Data Points",
    description: "Atomic claims extracted from source material.",
    columns: [
      { key: "claimText", label: "Claim" },
      { key: "evidenceType", label: "Evidence" },
      { key: "confidence", label: "Confidence" },
      { key: "source.title", label: "Source" },
      { key: "extractionDate", label: "Extracted" },
    ],
    filters: [
      { key: "evidenceType", label: "Evidence" },
      { key: "confidence", label: "Confidence" },
    ],
  },
  {
    key: "tags",
    label: "Tags",
    description: "Flat vocabulary for retrieval and trend detection.",
    columns: [
      { key: "slug", label: "Slug" },
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "dataPoints.length", label: "Data Points" },
    ],
    filters: [{ key: "category", label: "Category" }],
  },
  {
    key: "curatorObservations",
    label: "Curator Observations",
    description: "Connective insights written by the curator.",
    columns: [
      { key: "observationText", label: "Observation" },
      { key: "referencedDataPoints.length", label: "Data Points" },
      { key: "referencedPositions.length", label: "Positions" },
      { key: "capturedDate", label: "Captured" },
    ],
  },
  {
    key: "mentalModels",
    label: "Mental Models",
    description: "Frameworks, analogies, terms, and principles.",
    columns: [
      { key: "title", label: "Name" },
      { key: "modelType", label: "Type" },
      { key: "description", label: "Description" },
      { key: "source.title", label: "Source" },
      { key: "capturedDate", label: "Captured" },
    ],
    filters: [{ key: "modelType", label: "Type" }],
  },
  {
    key: "researchLens",
    label: "Research Lens",
    description: "Generated system artifact used by enrichment.",
    columns: [
      { key: "generatedDate", label: "Generated" },
      { key: "triggeredBy", label: "Trigger" },
      { key: "project.name", label: "Project" },
      { key: "openQuestions", label: "Open Questions" },
    ],
    filters: [{ key: "triggeredBy", label: "Trigger" }],
  },
];

const ENTITY_BY_KEY = new Map(ENTITY_CONFIGS.map((config) => [config.key, config]));

export default function BackendPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeEntity, setActiveEntity] = useState<EntityKey>("sources");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/backend-snapshot.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("The static backend snapshot could not be loaded.");
        return response.json();
      })
      .then((data: Snapshot) => {
        if (cancelled) return;
        setSnapshot(data);
        const initial = data.entities.sources?.[0]?._id ?? null;
        setSelectedId(initial);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "The static backend snapshot could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const idIndex = useMemo(() => {
    const index = new Map<string, { entity: EntityKey; record: SnapshotRecord }>();
    if (!snapshot) return index;
    for (const config of ENTITY_CONFIGS) {
      for (const record of snapshot.entities[config.key] ?? []) {
        index.set(record._id, { entity: config.key, record });
      }
    }
    return index;
  }, [snapshot]);

  const activeConfig = ENTITY_BY_KEY.get(activeEntity)!;
  const activeRecords = snapshot?.entities[activeEntity] ?? [];
  const selectedRecord = selectedId ? idIndex.get(selectedId)?.record ?? null : null;

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return activeRecords.filter((record) => {
      if (normalizedSearch && !recordSearchText(record).includes(normalizedSearch)) return false;
      for (const [key, value] of Object.entries(filters)) {
        if (!value) continue;
        if (String(resolvePath(record, key) ?? "") !== value) return false;
      }
      return true;
    });
  }, [activeRecords, filters, search]);

  function selectEntity(key: EntityKey) {
    setActiveEntity(key);
    setSearch("");
    setFilters({});
    setSelectedId(snapshot?.entities[key]?.[0]?._id ?? null);
  }

  function navigateToRecord(recordId: string) {
    const target = idIndex.get(recordId);
    if (!target) return;
    setActiveEntity(target.entity);
    setSearch("");
    setFilters({});
    setSelectedId(recordId);
  }

  if (error) return <BackendError message={error} />;
  if (!snapshot) return <BackendLoading />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-primary">
      <BackendHeader />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-secondary bg-secondary_subtle">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-3xl">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                  Backend transparency
                </p>
                <h1 className="mt-2 text-display-xs font-semibold tracking-[-0.01em] text-primary lg:text-display-sm">
                  Static database explorer
                </h1>
                <p className="mt-3 text-sm leading-6 text-tertiary">
                  Browse the readable demo dataset exported from Convex. Source bodies, verification quotes,
                  file pointers, vectors, and hashes are omitted from this public snapshot.
                </p>
              </div>
              <div className="cm-surface-raised w-72 rounded-2xl border p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                  Snapshot
                </p>
                <p className="mt-2 text-sm font-medium text-primary">{snapshot.metadata.projectName}</p>
                <p className="mt-1 text-xs leading-5 text-tertiary">
                  Generated {formatDate(snapshot.metadata.generatedAt)}
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-5">
              {topMetrics(snapshot).map((metric) => (
                <div key={metric.label} className="cm-surface-raised rounded-xl border px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-primary">{formatNumber(metric.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
          <aside className="cm-content-panel h-max rounded-2xl border p-2">
            <div className="px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                Entities
              </p>
            </div>
            <nav className="space-y-1">
              {ENTITY_CONFIGS.map((config) => (
                <button
                  key={config.key}
                  type="button"
                  onClick={() => selectEntity(config.key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                    activeEntity === config.key
                      ? "bg-brand-primary_alt text-brand-secondary"
                      : "text-secondary hover:bg-secondary_hover hover:text-primary",
                  )}
                >
                  <span>{config.label}</span>
                  <span className="text-xs tabular-nums text-quaternary">
                    {formatNumber(snapshot.metadata.counts[config.key] ?? 0)}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            <div className="cm-content-panel overflow-hidden rounded-2xl border">
              <div className="border-b border-secondary px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Table className="size-5 text-quaternary" />
                      <h2 className="text-lg font-semibold tracking-[-0.01em] text-primary">
                        {activeConfig.label}
                      </h2>
                      <Badge type="color" size="sm" color="gray">
                        {formatNumber(filteredRecords.length)} shown
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-tertiary">{activeConfig.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="min-w-72 flex-1">
                    <InputBase
                      size="sm"
                      icon={SearchLg}
                      value={search}
                      onChange={(event) => setSearch(event.currentTarget.value)}
                      placeholder={`Search ${activeConfig.label.toLowerCase()}`}
                    />
                  </div>
                  {activeConfig.filters?.map((filter) => (
                    <select
                      key={filter.key}
                      value={filters[filter.key] ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, [filter.key]: value }));
                      }}
                      className="h-9 rounded-lg border border-secondary bg-primary px-3 text-sm text-secondary shadow-xs outline-brand transition focus:outline-2 focus:outline-offset-2"
                    >
                      <option value="">{filter.label}: all</option>
                      {filterOptions(activeRecords, filter.key).map((option) => (
                        <option key={option} value={option}>
                          {filter.label}: {option}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary">
                    <tr className="border-b border-secondary">
                      {activeConfig.columns.map((column) => (
                        <th key={column.key} className="px-5 py-3 text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {filteredRecords.map((record) => (
                      <tr
                        key={record._id}
                        onClick={() => setSelectedId(record._id)}
                        className={cn(
                          "cursor-pointer transition hover:bg-secondary_hover",
                          selectedId === record._id && "bg-brand-primary_alt",
                        )}
                      >
                        {activeConfig.columns.map((column) => (
                          <td key={column.key} className="max-w-[26rem] px-5 py-3 align-top text-sm leading-6 text-secondary">
                            {formatCell(resolvePath(record, column.key))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DetailPanel
            record={selectedRecord}
            entity={selectedId ? idIndex.get(selectedId)?.entity ?? activeEntity : activeEntity}
            onNavigate={navigateToRecord}
          />
        </section>
      </main>
    </div>
  );
}

function BackendHeader() {
  return (
    <header className="shrink-0 border-b border-secondary bg-primary px-4 py-2.5 lg:px-5">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <CurateMindMark className="size-8 text-primary" />
          <span className="text-base font-semibold tracking-[-0.02em] text-primary">Curate Mind</span>
        </Link>
        <div className="flex-1" />
        <nav className="flex items-center gap-7">
          <Link to="/themes" className="text-sm font-medium text-secondary transition hover:text-primary">
            Themes
          </Link>
          <Link to="/ask" className="text-sm font-medium text-secondary transition hover:text-primary">
            Ask
          </Link>
          <Link to="/methodology" className="text-sm font-medium text-secondary transition hover:text-primary">
            Methodology
          </Link>
          <Link to="/backend" className="text-sm font-medium text-primary">
            Data Model
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary transition hover:text-primary"
          >
            <GitHubIcon className="size-4" />
            GitHub
          </a>
          <ThemeModeControl />
        </nav>
      </div>
    </header>
  );
}

function DetailPanel({
  record,
  entity,
  onNavigate,
}: {
  record: SnapshotRecord | null;
  entity: EntityKey;
  onNavigate: (id: string) => void;
}) {
  if (!record) {
    return (
      <aside className="cm-content-panel h-max rounded-2xl border p-5">
        <p className="text-sm text-tertiary">Select a record to inspect its fields and relationships.</p>
      </aside>
    );
  }

  const config = ENTITY_BY_KEY.get(entity)!;
  const entries = Object.entries(record).filter(([, value]) => !isRelationshipValue(value));
  const relationships = Object.entries(record).filter(([, value]) => isRelationshipValue(value));

  return (
    <aside className="cm-content-panel h-max max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border">
      <div className="border-b border-secondary px-5 py-4">
        <div className="flex items-center gap-2">
          <Database01 className="size-5 text-quaternary" />
          <p className="text-sm font-semibold text-primary">{config.label}</p>
        </div>
        <p className="mt-2 break-all font-mono text-xs text-quaternary">{record._id}</p>
      </div>

      <div className="px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">Fields</p>
        <dl className="mt-3 space-y-3">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt className="font-mono text-xs text-quaternary">{key}</dt>
              <dd className="mt-1 text-sm leading-6 text-secondary">{formatDetailValue(value)}</dd>
            </div>
          ))}
        </dl>

        {relationships.length > 0 && (
          <div className="mt-6 border-t border-secondary pt-4">
            <div className="flex items-center gap-2">
              <GitBranch01 className="size-4 text-quaternary" />
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                Relationships
              </p>
            </div>
            <div className="mt-3 space-y-4">
              {relationships.map(([key, value]) => (
                <RelationshipGroup key={key} label={key} value={value} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function RelationshipGroup({
  label,
  value,
  onNavigate,
}: {
  label: string;
  value: any;
  onNavigate: (id: string) => void;
}) {
  const records = Array.isArray(value) ? value : [value];
  const linked = records.filter(Boolean);
  if (!linked.length) return null;

  return (
    <div>
      <p className="font-mono text-xs text-quaternary">{label}</p>
      <div className="mt-2 space-y-2">
        {linked.slice(0, 12).map((item, index) => {
          const record = item.source && item.relationship ? item.source : item;
          const id = record?._id;
          return (
            <Button
              key={`${label}-${id ?? "unlinked"}-${index}`}
              size="xs"
              color="secondary"
              className="w-full justify-between whitespace-normal text-left"
              iconTrailing={id ? ArrowRight : undefined}
              onClick={() => id && onNavigate(id)}
            >
              {item.relationship ? `${item.relationship}: ` : ""}
              {relationshipLabel(record)}
            </Button>
          );
        })}
        {linked.length > 12 && (
          <p className="text-xs text-quaternary">{formatNumber(linked.length - 12)} more linked records</p>
        )}
      </div>
    </div>
  );
}

function BackendLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-primary">
      <LoadingIndicator type="line-simple" size="lg" label="Loading backend snapshot" />
    </div>
  );
}

function BackendError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-primary">
      <BackendHeader />
      <div className="mx-auto max-w-3xl px-6 py-10 lg:py-14">
        <section className="cm-content-panel rounded-2xl border p-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">Backend transparency</p>
          <h1 className="mt-2 text-display-xs font-semibold tracking-[-0.01em] text-primary">Snapshot unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-tertiary">{message}</p>
        </section>
      </div>
    </div>
  );
}

function topMetrics(snapshot: Snapshot) {
  return [
    { label: "Sources", value: snapshot.metadata.counts.sources },
    { label: "Claims", value: snapshot.metadata.counts.dataPoints },
    { label: "Tags", value: snapshot.metadata.counts.tags },
    { label: "Positions", value: snapshot.metadata.counts.researchPositions },
    { label: "Models", value: snapshot.metadata.counts.mentalModels },
  ];
}

function filterOptions(records: SnapshotRecord[], key: string) {
  return Array.from(
    new Set(records.map((record) => resolvePath(record, key)).filter((value) => value !== null && value !== undefined && value !== "")),
  )
    .map(String)
    .sort((a, b) => a.localeCompare(b));
}

function recordSearchText(record: SnapshotRecord) {
  return JSON.stringify(record).toLowerCase();
}

function resolvePath(record: any, path: string): any {
  return path.split(".").reduce((value, part) => {
    if (part === "length" && Array.isArray(value)) return value.length;
    return value?.[part];
  }, record);
}

function isRelationshipValue(value: any) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => item && typeof item === "object" && "_id" in item);
  return "_id" in value;
}

function relationshipLabel(record: any) {
  return record?.title ?? record?.name ?? record?.slug ?? record?.claimText ?? record?.observationText ?? record?._id ?? "Linked record";
}

function formatCell(value: any) {
  if (value === null || value === undefined || value === "") return <span className="text-quaternary">Not set</span>;
  if (typeof value === "number") return <span className="tabular-nums">{formatNumber(value)}</span>;
  return truncate(String(value), 140);
}

function formatDetailValue(value: any) {
  if (value === null || value === undefined || value === "") return <span className="text-quaternary">Not set</span>;
  if (Array.isArray(value)) return value.length ? value.join(", ") : <span className="text-quaternary">None</span>;
  if (typeof value === "number") return <span className="tabular-nums">{formatNumber(value)}</span>;
  return String(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(parsed));
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trimEnd()}...`;
}
