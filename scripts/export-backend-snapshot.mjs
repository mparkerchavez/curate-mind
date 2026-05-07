import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "web", "public", "backend-snapshot.json");

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, "web", ".env.local"));

const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("CONVEX_URL or VITE_CONVEX_URL must be set before exporting the backend snapshot.");
}

const projectId =
  process.env.CURATE_MIND_PROJECT_ID ||
  process.env.VITE_CURATE_MIND_PROJECT_ID ||
  undefined;

const client = new ConvexHttpClient(convexUrl);

const PAGE_SIZES = {
  projects: 100,
  sources: 2,
  researchThemes: 100,
  researchPositions: 100,
  positionVersions: 100,
  dataPoints: 25,
  tags: 100,
  curatorObservations: 50,
  mentalModels: 25,
  researchLens: 50,
  dataPointTags: 250,
  curatorObservationTags: 250,
  mentalModelTags: 250,
};

const FIRST_CLASS_ENTITIES = [
  "projects",
  "sources",
  "researchThemes",
  "researchPositions",
  "positionVersions",
  "dataPoints",
  "tags",
  "curatorObservations",
  "mentalModels",
  "researchLens",
];

const RELATIONSHIP_TABLES = [
  "dataPointTags",
  "curatorObservationTags",
  "mentalModelTags",
];

const raw = {};
for (const table of [...FIRST_CLASS_ENTITIES, ...RELATIONSHIP_TABLES]) {
  raw[table] = await fetchAll(table);
  console.log(`${table}: ${raw[table].length}`);
}

const snapshot = buildSnapshot(raw);
assertSafeSnapshot(snapshot);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);

async function fetchAll(table) {
  let cursor = null;
  let isDone = false;
  const records = [];

  while (!isDone) {
    const args = {
      table,
      cursor,
      numItems: PAGE_SIZES[table],
    };
    if (projectId) args.projectId = projectId;

    const result = await client.query(anyApi.backend.exportEntityPage, args);
    records.push(...result.page);
    cursor = result.continueCursor;
    isDone = result.isDone;
  }

  return records;
}

function buildSnapshot(rawData) {
  const projects = sortByDate(rawData.projects, "createdDate");
  const sources = sortByDate(rawData.sources, "ingestedDate");
  const researchThemes = sortByTitle(rawData.researchThemes);
  const researchPositions = sortByTitle(rawData.researchPositions);
  const positionVersions = sortByDate(rawData.positionVersions, "versionDate");
  const dataPoints = sortByNumber(rawData.dataPoints, "dpSequenceNumber");
  const tags = sortByTitle(rawData.tags, "slug");
  const curatorObservations = sortByDate(rawData.curatorObservations, "capturedDate");
  const mentalModels = sortByDate(rawData.mentalModels, "capturedDate");
  const researchLens = sortByDate(rawData.researchLens, "generatedDate");

  const projectById = mapById(projects);
  const sourceById = mapById(sources);
  const themeById = mapById(researchThemes);
  const positionById = mapById(researchPositions);
  const versionById = mapById(positionVersions);
  const dataPointById = mapById(dataPoints);
  const tagById = mapById(tags);
  const observationById = mapById(curatorObservations);
  const mentalModelById = mapById(mentalModels);

  const dataPointTagLinks = groupBy(rawData.dataPointTags, "dataPointId");
  const observationTagLinks = groupBy(rawData.curatorObservationTags, "curatorObservationId");
  const mentalModelTagLinks = groupBy(rawData.mentalModelTags, "mentalModelId");

  for (const project of projects) {
    project.sources = compactRefs(sources.filter((source) => source.projectId === project._id), summarizeSource);
    project.themes = compactRefs(researchThemes.filter((theme) => theme.projectId === project._id), summarizeTheme);
    project.tags = compactRefs(tags.filter((tag) => tag.projectId === project._id), summarizeTag);
    project.researchLens = compactRefs(researchLens.filter((lens) => lens.projectId === project._id), summarizeLens);
  }

  for (const source of sources) {
    source.project = summarizeProject(projectById.get(source.projectId));
    source.dataPoints = compactRefs(dataPoints.filter((dp) => dp.sourceId === source._id), summarizeDataPoint);
    source.mentalModels = compactRefs(mentalModels.filter((model) => model.sourceId === source._id), summarizeMentalModel);
    source.sourceRelationships = (source.sourceRelationships ?? []).map((relationship) => ({
      relationship: relationship.relationship,
      source: summarizeSource(sourceById.get(relationship.sourceId)) ?? { _id: relationship.sourceId },
    }));
  }

  for (const theme of researchThemes) {
    theme.project = summarizeProject(projectById.get(theme.projectId));
    theme.positions = compactRefs(
      researchPositions.filter((position) => position.themeId === theme._id),
      summarizePosition,
    );
  }

  for (const position of researchPositions) {
    position.theme = summarizeTheme(themeById.get(position.themeId));
    position.currentVersion = summarizePositionVersion(versionById.get(position.currentVersionId));
    position.versions = compactRefs(
      positionVersions.filter((version) => version.positionId === position._id),
      summarizePositionVersion,
    );
  }

  for (const version of positionVersions) {
    version.position = summarizePosition(positionById.get(version.positionId));
    version.supportingEvidence = compactRefsById(version.supportingEvidence, dataPointById, summarizeDataPoint);
    version.counterEvidence = compactRefsById(version.counterEvidence, dataPointById, summarizeDataPoint);
    version.curatorObservations = compactRefsById(version.curatorObservations, observationById, summarizeObservation);
    version.mentalModels = compactRefsById(version.mentalModels, mentalModelById, summarizeMentalModel);
  }

  for (const dataPoint of dataPoints) {
    dataPoint.source = summarizeSource(sourceById.get(dataPoint.sourceId));
    dataPoint.tags = compactRefsById(
      (dataPointTagLinks.get(dataPoint._id) ?? []).map((link) => link.tagId),
      tagById,
      summarizeTag,
    );
    dataPoint.relatedDataPoints = compactRefsById(dataPoint.relatedDataPoints, dataPointById, summarizeDataPoint);
    dataPoint.positions = compactRefs(
      positionVersions.filter((version) =>
        containsRef(version.supportingEvidence, dataPoint._id) ||
        containsRef(version.counterEvidence, dataPoint._id),
      ),
      (version) => summarizePosition(positionById.get(version.positionId)),
    );
  }

  for (const tag of tags) {
    tag.project = summarizeProject(projectById.get(tag.projectId));
    tag.dataPoints = compactRefsById(
      rawData.dataPointTags.filter((link) => link.tagId === tag._id).map((link) => link.dataPointId),
      dataPointById,
      summarizeDataPoint,
    );
    tag.curatorObservations = compactRefsById(
      rawData.curatorObservationTags.filter((link) => link.tagId === tag._id).map((link) => link.curatorObservationId),
      observationById,
      summarizeObservation,
    );
    tag.mentalModels = compactRefsById(
      rawData.mentalModelTags.filter((link) => link.tagId === tag._id).map((link) => link.mentalModelId),
      mentalModelById,
      summarizeMentalModel,
    );
  }

  for (const observation of curatorObservations) {
    observation.tags = compactRefsById(
      (observationTagLinks.get(observation._id) ?? []).map((link) => link.tagId),
      tagById,
      summarizeTag,
    );
    observation.referencedDataPoints = compactRefsById(
      observation.referencedDataPoints,
      dataPointById,
      summarizeDataPoint,
    );
    observation.referencedPositions = compactRefsById(
      observation.referencedPositions,
      positionById,
      summarizePosition,
    );
  }

  for (const model of mentalModels) {
    model.source = summarizeSource(sourceById.get(model.sourceId));
    model.sourceDataPoint = summarizeDataPoint(dataPointById.get(model.sourceDataPointId));
    model.tags = compactRefsById(
      (mentalModelTagLinks.get(model._id) ?? []).map((link) => link.tagId),
      tagById,
      summarizeTag,
    );
  }

  for (const lens of researchLens) {
    lens.project = summarizeProject(projectById.get(lens.projectId));
  }

  const entities = {
    projects,
    sources,
    researchThemes,
    researchPositions,
    positionVersions,
    dataPoints,
    tags,
    curatorObservations,
    mentalModels,
    researchLens,
  };

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "Curate Mind sanitized Convex export",
      projectName: projects[0]?.name ?? "Curate Mind",
      note: "Source bodies, verification quotes, file pointers, vectors, and hashes are omitted.",
      counts: Object.fromEntries(Object.entries(entities).map(([key, value]) => [key, value.length])),
    },
    entities,
  };
}

function summarizeProject(project) {
  if (!project) return null;
  return pick(project, ["_id", "name", "description"]);
}

function summarizeSource(source) {
  if (!source) return null;
  return pick(source, ["_id", "title", "sourceType", "tier", "status", "publishedDate"]);
}

function summarizeTheme(theme) {
  if (!theme) return null;
  return pick(theme, ["_id", "title", "description"]);
}

function summarizePosition(position) {
  if (!position) return null;
  return pick(position, ["_id", "title", "themeId", "currentVersionId"]);
}

function summarizePositionVersion(version) {
  if (!version) return null;
  return pick(version, ["_id", "positionId", "versionNumber", "confidenceLevel", "status", "versionDate"]);
}

function summarizeDataPoint(dataPoint) {
  if (!dataPoint) return null;
  return pick(dataPoint, ["_id", "claimText", "evidenceType", "confidence", "sourceId"]);
}

function summarizeTag(tag) {
  if (!tag) return null;
  return pick(tag, ["_id", "slug", "name", "category"]);
}

function summarizeObservation(observation) {
  if (!observation) return null;
  return {
    _id: observation._id,
    observationText: truncate(observation.observationText, 160),
    capturedDate: observation.capturedDate,
  };
}

function summarizeMentalModel(model) {
  if (!model) return null;
  return pick(model, ["_id", "title", "modelType", "description"]);
}

function summarizeLens(lens) {
  if (!lens) return null;
  return pick(lens, ["_id", "generatedDate", "triggeredBy"]);
}

function compactRefs(records, summarize) {
  return records.map(summarize).filter(Boolean);
}

function compactRefsById(ids, map, summarize) {
  return [...new Set(ids ?? [])].map((id) => summarize(map.get(id))).filter(Boolean);
}

function containsRef(refs, id) {
  return (refs ?? []).some((ref) => ref?._id === id || ref === id);
}

function mapById(records) {
  return new Map(records.map((record) => [record._id, record]));
}

function groupBy(records, key) {
  const grouped = new Map();
  for (const record of records) {
    const value = record[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(record);
  }
  return grouped;
}

function pick(record, keys) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]).filter(([, value]) => value !== undefined));
}

function sortByTitle(records, key = "title") {
  return [...records].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")));
}

function sortByDate(records, key) {
  return [...records].sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));
}

function sortByNumber(records, key) {
  return [...records].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0));
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value ?? "";
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function assertSafeSnapshot(value) {
  const forbiddenKeys = new Set(["fullText", "anchorQuote", "storageId", "embedding", "contentHash"]);

  function visit(node, pathParts) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...pathParts, String(index)]));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenKeys.has(key)) {
        throw new Error(`Forbidden key found in snapshot: ${[...pathParts, key].join(".")}`);
      }
      visit(child, [...pathParts, key]);
    }
  }

  visit(value, []);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
