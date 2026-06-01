export const meta = {
  name: 'code-review-patterns',
  description: 'Code review focused on architectural patterns + anti-patterns: detect across diverse lenses, adversarially verify, synthesize a categorized report',
  whenToUse: 'When you want a pattern-oriented code review: which architectural patterns the codebase uses (with evidence) and which anti-patterns it contains (verified to cut false positives).',
  phases: [
    { title: 'Inventory', detail: 'one agent maps files, layers, and stack' },
    { title: 'Detect & Verify', detail: 'per-lens pattern + anti-pattern detection, each anti-pattern adversarially verified (fact + judgment)' },
    { title: 'Synthesize', detail: 'one agent dedupes and produces the final categorized report' },
  ],
}

// ---------------------------------------------------------------------------
// Target: which files to review. Override by passing args as a JSON object:
//   { root, files: [{path, role}], description }
// Defaults are scoped to this repo (k8s-log-view).
// ---------------------------------------------------------------------------
const ROOT = (args && args.root) || '/home/non-root/k8s-log-view'

const FILES = (args && args.files) || [
  { path: `${ROOT}/app/page.tsx`,                role: 'Server Component — home page; fetches pods/namespaces and renders PodTable' },
  { path: `${ROOT}/app/layout.tsx`,              role: 'Root layout — fonts, metadata, html/body shell' },
  { path: `${ROOT}/app/components/PodTable.tsx`, role: 'Client Component (~433 lines) — table, logs dialog, events dialog, all client state' },
  { path: `${ROOT}/app/lib/k8s.ts`,              role: 'Data-access layer — @kubernetes/client-node calls (pods, namespaces, events, logs)' },
  { path: `${ROOT}/app/lib/actions.ts`,          role: 'Server Actions layer — fetchPodLogs / fetchPodEvents' },
  { path: `${ROOT}/app/lib/definitions.ts`,      role: 'Shared type definitions (currently empty)' },
  { path: `${ROOT}/next.config.ts`,              role: 'Next.js config' },
]

const DESCRIPTION = (args && args.description) ||
  'k8s-log-view: a Next.js 16 (App Router) + React 19 app that lists Kubernetes pods across namespaces ' +
  'and shows per-pod logs and events, backed by @kubernetes/client-node. Styling via Tailwind v4.'

const FILE_LIST = FILES.map(f => `- ${f.path}\n    ${f.role}`).join('\n')

// AGENTS.md in this repo warns that this is a MODIFIED Next.js whose APIs/conventions
// may differ from training data, and instructs reading node_modules/next/dist/docs/
// before judging framework usage. Pass this to every agent so framework verdicts are grounded.
const GROUND_RULES = [
  `PROJECT: ${DESCRIPTION}`,
  ``,
  `FILES UNDER REVIEW:`,
  FILE_LIST,
  ``,
  `IMPORTANT GROUND RULES:`,
  `- Read the actual files with the Read tool before making any claim. Cite evidence as path:line.`,
  `- This repo's AGENTS.md states this is a MODIFIED Next.js — conventions may differ from your training data.`,
  `  Before calling any Next.js/React usage a pattern OR an anti-pattern, consult ${ROOT}/node_modules/next/dist/docs/`,
  `  (and ${ROOT}/AGENTS.md). Do not flag something as wrong just because it differs from older Next.js.`,
  `- Distinguish "intentional pattern" from "incidental/leftover code". Scaffolding cruft and dead code count as anti-patterns.`,
].join('\n')

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stack: { type: 'array', items: { type: 'string' }, description: 'Frameworks/libraries/language features in use' },
    layers: { type: 'array', items: { type: 'string' }, description: 'Architectural layers/boundaries you can identify' },
    fileRoles: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { path: { type: 'string' }, role: { type: 'string' }, isClient: { type: 'boolean' } },
        required: ['path', 'role'],
      },
    },
    summary: { type: 'string', description: '3-5 sentence architectural summary' },
  },
  required: ['stack', 'layers', 'fileRoles', 'summary'],
}

const DETECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lens: { type: 'string' },
    patterns: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Canonical pattern name, e.g. "Server Components data fetching", "Container/Presentational split"' },
          category: { type: 'string', description: 'e.g. architecture, react, data-flow, framework-convention' },
          evidence: { type: 'array', items: { type: 'string' }, description: 'path:line citations proving the pattern is used' },
          description: { type: 'string', description: 'What the pattern is and how it manifests here' },
          assessment: { type: 'string', description: 'Is it applied well? Any caveat?' },
        },
        required: ['name', 'category', 'evidence', 'description'],
      },
    },
    antiPatterns: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          location: { type: 'string', description: 'path:line (or path:lineStart-lineEnd)' },
          description: { type: 'string', description: 'Why it is an anti-pattern and the concrete harm/risk' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          recommendation: { type: 'string' },
        },
        required: ['title', 'location', 'description', 'severity', 'recommendation'],
      },
    },
  },
  required: ['lens', 'patterns', 'antiPatterns'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'reasoning'],
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    patternsUsed: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          locations: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          assessment: { type: 'string' },
        },
        required: ['name', 'category', 'locations', 'description'],
      },
    },
    antiPatterns: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          location: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          description: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['title', 'location', 'severity', 'description', 'recommendation'],
      },
    },
    overallAssessment: { type: 'string', description: 'A few sentences: architectural health, biggest wins, biggest risks' },
  },
  required: ['patternsUsed', 'antiPatterns', 'overallAssessment'],
}

// ---------------------------------------------------------------------------
// Detection lenses — each agent inspects the codebase from a distinct angle so
// coverage is broad and the lenses surface different patterns/anti-patterns.
// ---------------------------------------------------------------------------
const LENSES = [
  {
    key: 'architecture',
    focus:
      'ARCHITECTURE & LAYERING. Module boundaries and separation of concerns; the data-access layer (lib/k8s) vs ' +
      'server-actions layer (lib/actions) vs presentation; server/client component boundary (RSC vs "use client"); ' +
      'coupling, cohesion, dependency direction; where business logic lives; reuse vs duplication across modules.',
  },
  {
    key: 'react-components',
    focus:
      'REACT & COMPONENT DESIGN. Hook usage (useState/useEffect), state ownership and lifting, effect dependencies and ' +
      'cleanup, component composition vs one mega-component, prop design and typing, controlled inputs, list keys, ' +
      'derived-vs-stored state, accessibility (roles/aria), and any rendering or re-render concerns.',
  },
  {
    key: 'data-async-errors',
    focus:
      'DATA-FETCHING, ASYNC & ERROR HANDLING. Concurrency (Promise.all), resource lifecycle (how the k8s client/KubeConfig ' +
      'is created and reused), error propagation and surfacing to the UI, loading/empty/error states, fire-and-forget ' +
      'promises, unhandled rejections, request scoping/caching, and any N+1 or redundant-work patterns.',
  },
  {
    key: 'framework-hygiene',
    focus:
      'NEXT.JS CONVENTIONS & CODE HYGIENE. Correct use of "use server"/"use client" directives, server action definition, ' +
      'metadata/fonts/layout conventions, file-structure conventions — VERIFY against node_modules/next/dist/docs since this ' +
      'is a modified Next.js. ALSO hygiene: dead/unused code, leftover scaffolding (e.g. default metadata), debug logging, ' +
      'commented-out directives, empty files, non-null assertions, magic numbers/indices, and TODO-grade shortcuts.',
  },
]

function detectPrompt(lens, inventory) {
  return [
    `You are reviewing a codebase for ARCHITECTURAL PATTERNS and ANTI-PATTERNS through ONE specific lens.`,
    ``,
    GROUND_RULES,
    ``,
    `SHARED INVENTORY (from a prior pass — verify, don't trust blindly):`,
    JSON.stringify(inventory),
    ``,
    `YOUR LENS = "${lens.key}":`,
    lens.focus,
    ``,
    `TASK:`,
    `1. Read every file relevant to your lens (Read tool). For framework claims, also read the relevant node_modules/next/dist/docs page.`,
    `2. List the architectural/design PATTERNS the code uses that fall under your lens. For each: canonical name, category,`,
    `   path:line evidence, a description, and an honest assessment of whether it is applied well.`,
    `3. List ANTI-PATTERNS under your lens. For each: title, path:line location, why it is harmful, severity, and a fix recommendation.`,
    `Only report items genuinely within your lens (other lenses cover the rest). Be precise; cite real lines. Do not invent.`,
    `If a candidate is actually fine for THIS stack/conventions, do not list it as an anti-pattern.`,
  ].join('\n')
}

function factCheckPrompt(ap, lens) {
  return [
    `You are an ADVERSARIAL FACT-CHECKER. A reviewer claims the following ANTI-PATTERN exists. Try to REFUTE it on the FACTS.`,
    ``,
    GROUND_RULES,
    ``,
    `CLAIM (lens: ${lens}):`,
    `  title: ${ap.title}`,
    `  location: ${ap.location}`,
    `  description: ${ap.description}`,
    ``,
    `Open the cited file/lines with the Read tool and check: does the code ACTUALLY do what the claim says, at that location?`,
    `Is the description factually accurate (not exaggerated, not misreading the code)? Return verdict="confirmed" ONLY if the`,
    `factual basis holds up. If the code does not match, the line is wrong, or the claim misreads the code, return "rejected".`,
    `Judge only the FACTS here, not whether it's "bad style". Default to "rejected" if you cannot verify it.`,
  ].join('\n')
}

function judgePrompt(ap, lens) {
  return [
    `You are a SENIOR ENGINEER judging whether a claimed anti-pattern is GENUINELY an anti-pattern IN CONTEXT.`,
    ``,
    GROUND_RULES,
    ``,
    `CLAIM (lens: ${lens}):`,
    `  title: ${ap.title}`,
    `  location: ${ap.location}`,
    `  description: ${ap.description}`,
    `  severity asserted: ${ap.severity}`,
    ``,
    `Read the relevant code/docs. Decide: given THIS project's stack, scale, and conventions (modified Next.js — check the docs),`,
    `is this a real anti-pattern worth reporting, or is it acceptable/idiomatic/negligible here? Return verdict="confirmed" if it`,
    `is a genuine issue, "rejected" if it is acceptable in context or merely a nitpick that doesn't warrant flagging. Explain.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
phase('Inventory')
log(`Reviewing ${FILES.length} files for patterns + anti-patterns across ${LENSES.length} lenses`)

const inventory = await agent(
  [
    `Map this codebase so downstream pattern reviewers share an accurate picture.`,
    ``,
    GROUND_RULES,
    ``,
    `Read each file listed above. Produce: the tech stack, the architectural layers/boundaries you can identify,`,
    `the role of each file (and whether it is a client component), and a short architectural summary.`,
  ].join('\n'),
  { label: 'inventory', schema: INVENTORY_SCHEMA },
)

phase('Detect & Verify')
const perLens = await pipeline(
  LENSES,
  // Stage 1: detect patterns + anti-patterns for this lens.
  (lens) =>
    agent(detectPrompt(lens, inventory), {
      label: `detect:${lens.key}`,
      phase: 'Detect & Verify',
      schema: DETECTION_SCHEMA,
    }),
  // Stage 2: adversarially verify each anti-pattern (fact-check + in-context judgment).
  (detection, lens) => {
    const aps = (detection && detection.antiPatterns) || []
    if (aps.length === 0) {
      return Promise.resolve({ lens: lens.key, patterns: (detection && detection.patterns) || [], antiPatterns: [] })
    }
    return parallel(
      aps.map((ap) => () =>
        parallel([
          () => agent(factCheckPrompt(ap, lens.key), { label: `fact:${lens.key}:${ap.title.slice(0, 32)}`, phase: 'Detect & Verify', schema: VERDICT_SCHEMA }),
          () => agent(judgePrompt(ap, lens.key), { label: `judge:${lens.key}:${ap.title.slice(0, 32)}`, phase: 'Detect & Verify', schema: VERDICT_SCHEMA }),
        ]).then(([fact, judge]) => ({
          ...ap,
          lens: lens.key,
          factVerdict: fact ? fact.verdict : 'rejected',
          judgeVerdict: judge ? judge.verdict : 'rejected',
          verifyReasoning: [fact && fact.reasoning, judge && judge.reasoning].filter(Boolean).join(' | '),
          // Confirmed only if BOTH the facts hold AND it's a genuine issue in context.
          confirmed: !!(fact && fact.verdict === 'confirmed' && judge && judge.verdict === 'confirmed'),
        })),
      ),
    ).then((verified) => ({
      lens: lens.key,
      patterns: (detection && detection.patterns) || [],
      antiPatterns: verified.filter(Boolean),
    }))
  },
)

const lensResults = perLens.filter(Boolean)
const allPatterns = lensResults.flatMap((r) => r.patterns.map((p) => ({ ...p, lens: r.lens })))
const allAnti = lensResults.flatMap((r) => r.antiPatterns)
const confirmedAnti = allAnti.filter((a) => a.confirmed)
const rejectedAnti = allAnti.filter((a) => !a.confirmed)
log(`Detected ${allPatterns.length} pattern hits and ${allAnti.length} candidate anti-patterns; ${confirmedAnti.length} survived verification, ${rejectedAnti.length} rejected`)

phase('Synthesize')
const report = await agent(
  [
    `You are writing the FINAL pattern-oriented code-review report. Below are raw findings from ${LENSES.length} lenses.`,
    `Deduplicate patterns that multiple lenses found (merge their evidence/locations). Group the used patterns sensibly by category.`,
    `Include ONLY the verified anti-patterns. Order anti-patterns by severity (high first). Keep evidence as path:line.`,
    `Be accurate and concise; do not introduce new findings that aren't supported below.`,
    ``,
    GROUND_RULES,
    ``,
    `INVENTORY:`,
    JSON.stringify(inventory),
    ``,
    `PATTERNS FOUND (raw, may contain duplicates across lenses):`,
    JSON.stringify(allPatterns),
    ``,
    `VERIFIED ANTI-PATTERNS (only these are real):`,
    JSON.stringify(confirmedAnti.map((a) => ({ title: a.title, location: a.location, severity: a.severity, description: a.description, recommendation: a.recommendation, lens: a.lens }))),
  ].join('\n'),
  { label: 'synthesize', schema: REPORT_SCHEMA },
)

return {
  report,
  stats: {
    files: FILES.length,
    lenses: LENSES.length,
    patternHitsRaw: allPatterns.length,
    antiPatternCandidates: allAnti.length,
    antiPatternsConfirmed: confirmedAnti.length,
    antiPatternsRejected: rejectedAnti.length,
  },
  // Surfaced for transparency — candidates that failed verification (no silent drops).
  rejectedCandidates: rejectedAnti.map((a) => ({
    title: a.title,
    location: a.location,
    lens: a.lens,
    factVerdict: a.factVerdict,
    judgeVerdict: a.judgeVerdict,
    reason: a.verifyReasoning,
  })),
}
