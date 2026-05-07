import { useQuery } from "convex/react";
import { api } from "@/api";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { OpenSourceSection } from "@/components/OpenSourceSection";
import { SiteFooter } from "@/components/SiteFooter";

// ── Type helpers ─────────────────────────────────────────────

type FieldDef = {
  name: string;
  type: string;
  desc: string;
};

// ── Static entity metadata ────────────────────────────────────

const ENTITY_DEFS = [
  {
    key: "projects" as const,
    tableName: "projects",
    displayName: "Projects",
    description:
      "Top-level containers that scope all content. Every source, tag, theme, and position belongs to a project.",
    fields: [
      { name: "name", type: "string", desc: "Project name" },
      { name: "description", type: "string", desc: "Optional project description" },
      { name: "createdDate", type: "string", desc: "Creation date (ISO 8601)" },
    ] as FieldDef[],
  },
  {
    key: "sources" as const,
    tableName: "sources",
    displayName: "Sources",
    description:
      "Provenance records for every piece of external content. Full text and storage IDs are never exposed here.",
    fields: [
      { name: "title", type: "string", desc: "Source title" },
      {
        name: "sourceType",
        type: "enum",
        desc: "Format: article, report, podcast, video, whitepaper, book, newsletter, social, other",
      },
      { name: "tier", type: "1 | 2 | 3", desc: "Curation priority. Tier 1 is highest." },
      {
        name: "status",
        type: "enum",
        desc: "Pipeline status: indexed, extracted, or failed",
      },
      { name: "wordCount", type: "number", desc: "Approximate word count of the source" },
      { name: "publishedDate", type: "string", desc: "Original publication date" },
      { name: "authorName", type: "string", desc: "Primary author (optional)" },
      { name: "publisherName", type: "string", desc: "Publishing outlet (optional)" },
      {
        name: "urlAccessibility",
        type: "enum",
        desc: "Access level: public, paywalled, or private",
      },
      { name: "ingestedDate", type: "string", desc: "Date this source was ingested" },
    ] as FieldDef[],
  },
  {
    key: "dataPoints" as const,
    tableName: "dataPoints",
    displayName: "Data Points",
    description:
      "Atomic claims extracted from sources. Each data point is a single, immutable insight written in the curator's own words. Verbatim anchor quotes are never shown here.",
    fields: [
      { name: "claimText", type: "string", desc: "The extracted claim in the curator's words" },
      {
        name: "evidenceType",
        type: "enum",
        desc: "Category: statistic, framework, prediction, case-study, observation, recommendation",
      },
      {
        name: "confidence",
        type: "enum",
        desc: "Curator confidence: strong, moderate, or suggestive",
      },
      { name: "extractionNote", type: "string", desc: "Optional context note from the curator" },
      { name: "extractionDate", type: "string", desc: "Date this data point was extracted" },
    ] as FieldDef[],
  },
  {
    key: "tags" as const,
    tableName: "tags",
    displayName: "Tags",
    description:
      "A flat, project-scoped controlled vocabulary. Tags are assigned to data points during enrichment and power retrieval and trend detection.",
    fields: [
      { name: "slug", type: "string", desc: "Machine-readable identifier (e.g. agent-adoption)" },
      { name: "name", type: "string", desc: "Human-readable display name" },
      { name: "category", type: "string", desc: "Optional grouping category" },
      {
        name: "dataPointCount",
        type: "derived",
        desc: "Number of data points linked to this tag (computed at query time)",
      },
    ] as FieldDef[],
  },
  {
    key: "researchPositions" as const,
    tableName: "researchPositions + positionVersions",
    displayName: "Research Positions",
    description:
      "Versioned theses organized under research themes. Each position has an identity record and an append-only chain of version records. The sample shows the current version's stance.",
    fields: [
      { name: "title", type: "string", desc: "Position title" },
      {
        name: "currentStance",
        type: "string",
        desc: "The active thesis text (from the current position version)",
      },
      {
        name: "confidenceLevel",
        type: "enum",
        desc: "Confidence level: emerging, active, or established",
      },
      {
        name: "themeName",
        type: "string",
        desc: "Parent research theme (joined from researchThemes)",
      },
    ] as FieldDef[],
  },
  {
    key: "curatorObservations" as const,
    tableName: "curatorObservations",
    displayName: "Curator Observations",
    description:
      "The curator's connective insights that bridge data points and research positions. Immutable once written.",
    fields: [
      {
        name: "observationText",
        type: "string",
        desc: "The observation itself, written by the curator",
      },
      {
        name: "referencedDataPoints",
        type: "id[]",
        desc: "Data point IDs this observation is connected to",
      },
      {
        name: "referencedPositions",
        type: "id[]",
        desc: "Research position IDs this observation informs",
      },
      { name: "capturedDate", type: "string", desc: "Date the observation was recorded" },
    ] as FieldDef[],
  },
  {
    key: "mentalModels" as const,
    tableName: "mentalModels",
    displayName: "Mental Models",
    description:
      "Frameworks, analogies, terms, and principles captured during source extraction. Immutable once created.",
    fields: [
      { name: "title", type: "string", desc: "Name of the model, framework, or term" },
      {
        name: "modelType",
        type: "enum",
        desc: "Category: framework, analogy, term, metaphor, or principle",
      },
      { name: "description", type: "string", desc: "One-sentence explanation" },
      { name: "capturedDate", type: "string", desc: "Date this model was captured" },
    ] as FieldDef[],
  },
];

// ── Helpers ───────────────────────────────────────────────────

function truncate(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "..." : text;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ────────────────────────────────────────────

function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary">
      {count.toLocaleString()} records
    </span>
  );
}

function FieldTable({ fields }: { fields: FieldDef[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-secondary">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-secondary bg-secondary">
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
              Field
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
              Type
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
              Description
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary">
          {fields.map((f) => (
            <tr key={f.name} className="bg-primary">
              <td className="whitespace-nowrap px-4 py-2.5">
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary">
                  {f.name}
                </code>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <span className="font-mono text-xs text-tertiary">{f.type}</span>
              </td>
              <td className="px-4 py-2.5 text-sm text-tertiary">{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <code className="block font-mono text-xs text-quaternary">{label}</code>
      <p className="mt-0.5 text-sm leading-5 text-secondary">{value}</p>
    </div>
  );
}

// ── Entity sections ───────────────────────────────────────────

function ProjectsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[0].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((p: any) => (
          <div key={p._id} className="rounded-2xl border border-secondary bg-secondary p-4">
            <p className="text-sm font-semibold text-primary">{p.name}</p>
            {p.description && (
              <p className="mt-1 text-sm text-tertiary">{truncate(p.description)}</p>
            )}
            <p className="mt-2 font-mono text-xs text-quaternary">
              created {formatDate(p.createdDate)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function SourcesSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[1].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((s: any) => (
          <div key={s._id} className="rounded-2xl border border-secondary bg-secondary p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-primary">{truncate(s.title, 100)}</p>
              {(s.authorName || s.publisherName) && (
                <p className="mt-0.5 text-xs text-tertiary">
                  {[s.authorName, s.publisherName].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <SampleRow label="sourceType" value={s.sourceType} />
              <SampleRow label="tier" value={String(s.tier)} />
              <SampleRow label="status" value={s.status} />
              <SampleRow label="wordCount" value={s.wordCount?.toLocaleString()} />
              <SampleRow label="publishedDate" value={formatDate(s.publishedDate)} />
              <SampleRow label="urlAccessibility" value={s.urlAccessibility} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DataPointsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[2].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((dp: any) => (
          <div key={dp._id} className="rounded-2xl border border-secondary bg-secondary p-4 space-y-3">
            <p className="text-sm leading-6 text-primary">{truncate(dp.claimText)}</p>
            <div className="flex flex-wrap gap-3">
              <SampleRow label="evidenceType" value={dp.evidenceType} />
              {dp.confidence && <SampleRow label="confidence" value={dp.confidence} />}
              <SampleRow label="extractionDate" value={formatDate(dp.extractionDate)} />
            </div>
            {dp.extractionNote && (
              <div>
                <code className="font-mono text-xs text-quaternary">extractionNote</code>
                <p className="mt-0.5 text-sm text-tertiary">{truncate(dp.extractionNote)}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function TagsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[3].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((tag: any) => (
          <div key={tag._id} className="rounded-2xl border border-secondary bg-secondary p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <code className="font-mono text-sm font-semibold text-primary">{tag.slug}</code>
                <p className="mt-0.5 text-sm text-tertiary">{tag.name}</p>
              </div>
              <span className="shrink-0 text-xs text-quaternary">
                {tag.dataPointCount} data points
              </span>
            </div>
            {tag.category && (
              <p className="mt-2 font-mono text-xs text-quaternary">
                category: {tag.category}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function PositionsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[4].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((pos: any) => (
          <div key={pos._id} className="rounded-2xl border border-secondary bg-secondary p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-primary">{pos.title}</p>
              {pos.themeName && (
                <p className="mt-0.5 text-xs text-quaternary">
                  theme: {pos.themeName}
                </p>
              )}
            </div>
            {pos.currentStance && (
              <p className="text-sm leading-6 text-secondary">{truncate(pos.currentStance)}</p>
            )}
            {pos.confidenceLevel && (
              <SampleRow label="confidenceLevel" value={pos.confidenceLevel} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ObservationsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[5].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((obs: any) => (
          <div key={obs._id} className="rounded-2xl border border-secondary bg-secondary p-4 space-y-3">
            <p className="text-sm leading-6 text-primary">{truncate(obs.observationText)}</p>
            <div className="flex flex-wrap gap-3">
              <SampleRow label="linkedDpCount" value={String(obs.linkedDpCount)} />
              <SampleRow label="capturedDate" value={formatDate(obs.capturedDate)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MentalModelsSection({ data }: { data: any }) {
  return (
    <>
      <FieldTable fields={ENTITY_DEFS[6].fields} />
      <div className="mt-4 space-y-3">
        {data.sample.map((mm: any) => (
          <div key={mm._id} className="rounded-2xl border border-secondary bg-secondary p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary">{mm.title}</p>
                <p className="mt-1 text-sm leading-6 text-tertiary">
                  {truncate(mm.description)}
                </p>
              </div>
              <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-quaternary ring-1 ring-inset ring-secondary">
                {mm.modelType}
              </code>
            </div>
            <p className="mt-3 font-mono text-xs text-quaternary">
              captured {formatDate(mm.capturedDate)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function BackendPage() {
  const data = useQuery(api.backend.getBackendSummary);

  const entityCount = data
    ? data.projects.count +
      data.sources.count +
      data.dataPoints.count +
      data.tags.count +
      data.researchPositions.count +
      data.curatorObservations.count +
      data.mentalModels.count
    : null;

  return (
    <div className="bg-primary">
      <div className="mx-auto max-w-4xl px-6 py-10 lg:py-14">
        {/* Page header */}
        <div className="border-b border-secondary pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            System transparency
          </p>
          <h1 className="mt-2 text-display-xs font-semibold tracking-[-0.01em] text-primary lg:text-display-sm">
            What the system stores
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-tertiary">
            A live view of every entity type in the Convex database, including real record counts,
            field definitions, and sample data. This page is read-only and updates in real time.
            Verbatim source text and internal storage IDs are never shown.
          </p>
          {entityCount !== null && (
            <p className="mt-4 text-xs text-quaternary">
              {entityCount.toLocaleString()} total records across 7 entity types
            </p>
          )}
        </div>

        {/* Loading state */}
        {data === undefined && (
          <div className="flex min-h-[16rem] items-center justify-center">
            <LoadingIndicator type="line-simple" size="lg" label="Loading database summary" />
          </div>
        )}

        {/* Entity sections */}
        {data !== undefined && (
          <div className="divide-y divide-secondary">
            {/* 1. Projects */}
            <section className="py-10">
              <EntityHeader
                def={ENTITY_DEFS[0]}
                count={data.projects.count}
              />
              <ProjectsSection data={data.projects} />
            </section>

            {/* 2. Sources */}
            <section className="py-10">
              <EntityHeader def={ENTITY_DEFS[1]} count={data.sources.count} />
              <SourcesSection data={data.sources} />
            </section>

            {/* 3. Data Points */}
            <section className="py-10">
              <EntityHeader def={ENTITY_DEFS[2]} count={data.dataPoints.count} />
              <DataPointsSection data={data.dataPoints} />
            </section>

            {/* 4. Tags */}
            <section className="py-10">
              <EntityHeader def={ENTITY_DEFS[3]} count={data.tags.count} />
              <TagsSection data={data.tags} />
            </section>

            {/* 5. Research Positions */}
            <section className="py-10">
              <EntityHeader
                def={ENTITY_DEFS[4]}
                count={data.researchPositions.count}
              />
              <PositionsSection data={data.researchPositions} />
            </section>

            {/* 6. Curator Observations */}
            <section className="py-10">
              <EntityHeader
                def={ENTITY_DEFS[5]}
                count={data.curatorObservations.count}
              />
              <ObservationsSection data={data.curatorObservations} />
            </section>

            {/* 7. Mental Models */}
            <section className="py-10">
              <EntityHeader
                def={ENTITY_DEFS[6]}
                count={data.mentalModels.count}
              />
              <MentalModelsSection data={data.mentalModels} />
            </section>
          </div>
        )}
      </div>

      <OpenSourceSection />
      <SiteFooter />
    </div>
  );
}

function EntityHeader({ def, count }: { def: (typeof ENTITY_DEFS)[number]; count: number }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <code className="font-mono text-xs text-quaternary">{def.tableName}</code>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-primary">
          {def.displayName}
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-tertiary">{def.description}</p>
      </div>
      <div className="shrink-0 pt-6">
        <CountBadge count={count} />
      </div>
    </div>
  );
}
