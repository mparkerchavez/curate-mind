// Quick script to query DPs by tag slug via Convex HTTP API
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const client = new ConvexHttpClient("https://dashing-butterfly-734.convex.cloud");

const tagSlug = process.argv[2];
if (!tagSlug) {
  console.error("Usage: node tag-query.mjs <tag-slug>");
  process.exit(1);
}

// Step 1: Get tag by slug
const tag = await client.query(anyApi.tags.getTagBySlug, { slug: tagSlug });
if (!tag) {
  console.error(`No tag found: ${tagSlug}`);
  process.exit(1);
}

// Step 2: Get DPs by tag
const dps = await client.query(anyApi.tags.getDataPointsByTag, { tagId: tag._id });

// Output clean JSON (no embeddings)
console.log(JSON.stringify({
  tag: tag.name,
  slug: tagSlug,
  count: dps.length,
  dataPoints: dps.map(dp => ({
    id: dp._id,
    claim: dp.claimText,
    type: dp.evidenceType,
    confidence: dp.confidence,
    source: dp.sourceTitle,
    tier: dp.sourceTier,
  }))
}, null, 2));
