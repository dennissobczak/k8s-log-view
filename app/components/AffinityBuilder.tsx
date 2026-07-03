"use client";

import { useMemo, useRef, useState } from "react";

// Graphical builder for Kubernetes pod scheduling affinity. Everything here is
// client-side and cluster-free: the user assembles rules and we serialize them
// to the `affinity:` YAML block that goes under a Pod spec. No server actions.

type RuleKind = "nodeAffinity" | "podAffinity" | "podAntiAffinity";
type Enforcement = "required" | "preferred";
type Operator = "In" | "NotIn" | "Exists" | "DoesNotExist" | "Gt" | "Lt";

// Operators that take no `values` list.
const UNARY_OPERATORS: Operator[] = ["Exists", "DoesNotExist"];

// Node label selectors support the full set; pod label selectors (used by pod
// affinity/anti-affinity) do not support Gt/Lt.
const NODE_OPERATORS: Operator[] = [
  "In",
  "NotIn",
  "Exists",
  "DoesNotExist",
  "Gt",
  "Lt",
];
const POD_OPERATORS: Operator[] = ["In", "NotIn", "Exists", "DoesNotExist"];

type Expression = {
  id: number;
  key: string;
  operator: Operator;
  values: string; // comma-separated in the UI, split on serialize
};

type Rule = {
  id: number;
  kind: RuleKind;
  enforcement: Enforcement;
  weight: number; // only used when enforcement === "preferred" (1–100)
  topologyKey: string; // only used by pod (anti-)affinity
  namespaces: string; // optional comma-separated list, pod (anti-)affinity only
  expressions: Expression[];
};

const KIND_META: Record<
  RuleKind,
  { label: string; blurb: string; accent: string }
> = {
  nodeAffinity: {
    label: "Node affinity",
    blurb: "Schedule onto nodes whose labels match",
    accent: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  },
  podAffinity: {
    label: "Pod affinity",
    blurb: "Co-locate near pods matching these labels",
    accent: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  },
  podAntiAffinity: {
    label: "Pod anti-affinity",
    blurb: "Keep away from pods matching these labels",
    accent: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  },
};

// ---------------------------------------------------------------------------
// Minimal YAML serializer. The app pulls in no YAML dependency, and the shapes
// we emit are small and known, so we hand-roll a serializer over plain JS
// values (objects, arrays, strings, numbers). Undefined/null and empty arrays
// are dropped so optional fields simply disappear.
// ---------------------------------------------------------------------------

type YamlValue =
  | string
  | number
  | boolean
  | YamlValue[]
  | { [key: string]: YamlValue | undefined };

const pad = (depth: number) => "  ".repeat(depth);

function scalar(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  // Quote anything that could be misread as structure, a number, or a keyword.
  const needsQuote =
    value === "" ||
    /[:#{}[\],&*!|>'"%@`]/.test(value) ||
    /^[\s]|[\s]$/.test(value) ||
    /^(true|false|null|~|-?\d)/i.test(value);
  return needsQuote ? JSON.stringify(value) : value;
}

function emit(value: YamlValue, depth: number): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => emitListItem(item, depth));
  }
  if (value !== null && typeof value === "object") {
    const lines: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined || child === null) continue;
      if (Array.isArray(child)) {
        if (child.length === 0) continue;
        lines.push(`${pad(depth)}${key}:`);
        lines.push(...emit(child, depth + 1));
      } else if (typeof child === "object") {
        lines.push(`${pad(depth)}${key}:`);
        lines.push(...emit(child, depth + 1));
      } else {
        lines.push(`${pad(depth)}${key}: ${scalar(child)}`);
      }
    }
    return lines;
  }
  return [`${pad(depth)}${scalar(value)}`];
}

// Render one array element, prefixing its first line with "- ".
function emitListItem(item: YamlValue, depth: number): string[] {
  if (item === null || typeof item !== "object") {
    return [`${pad(depth)}- ${scalar(item as string | number | boolean)}`];
  }
  const inner = emit(item, depth + 1);
  if (inner.length === 0) return [`${pad(depth)}- {}`];
  inner[0] = `${pad(depth)}- ${inner[0].slice(pad(depth + 1).length)}`;
  return inner;
}

// ---------------------------------------------------------------------------
// Rule → Kubernetes object shape
// ---------------------------------------------------------------------------

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchExpressions(rule: Rule): YamlValue[] {
  return rule.expressions
    .filter((e) => e.key.trim() !== "")
    .map((e) => {
      const term: { [key: string]: YamlValue | undefined } = {
        key: e.key.trim(),
        operator: e.operator,
      };
      if (!UNARY_OPERATORS.includes(e.operator)) {
        term.values = splitList(e.values);
      }
      return term;
    });
}

// Build the full `affinity:` object from the rule list, or null if nothing is
// worth emitting yet.
function buildAffinity(rules: Rule[]): { affinity: YamlValue } | null {
  const affinity: { [key in RuleKind]?: YamlValue } = {};

  for (const kind of Object.keys(KIND_META) as RuleKind[]) {
    const kindRules = rules.filter(
      (r) => r.kind === kind && matchExpressions(r).length > 0,
    );
    if (kindRules.length === 0) continue;

    const required = kindRules.filter((r) => r.enforcement === "required");
    const preferred = kindRules.filter((r) => r.enforcement === "preferred");
    const block: { [key: string]: YamlValue } = {};

    if (kind === "nodeAffinity") {
      if (required.length > 0) {
        block.requiredDuringSchedulingIgnoredDuringExecution = {
          nodeSelectorTerms: required.map((r) => ({
            matchExpressions: matchExpressions(r),
          })),
        };
      }
      if (preferred.length > 0) {
        block.preferredDuringSchedulingIgnoredDuringExecution = preferred.map(
          (r) => ({
            weight: r.weight,
            preference: { matchExpressions: matchExpressions(r) },
          }),
        );
      }
    } else {
      // pod affinity / anti-affinity share the same shape
      if (required.length > 0) {
        block.requiredDuringSchedulingIgnoredDuringExecution = required.map(
          (r) => podAffinityTerm(r),
        );
      }
      if (preferred.length > 0) {
        block.preferredDuringSchedulingIgnoredDuringExecution = preferred.map(
          (r) => ({ weight: r.weight, podAffinityTerm: podAffinityTerm(r) }),
        );
      }
    }

    affinity[kind] = block;
  }

  if (Object.keys(affinity).length === 0) return null;
  return { affinity };
}

function podAffinityTerm(rule: Rule): YamlValue {
  const term: { [key: string]: YamlValue | undefined } = {
    labelSelector: { matchExpressions: matchExpressions(rule) },
    topologyKey: rule.topologyKey.trim() || "kubernetes.io/hostname",
  };
  const ns = splitList(rule.namespaces);
  if (ns.length > 0) term.namespaces = ns;
  return term;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AffinityBuilder() {
  const idRef = useRef(1);
  const nextId = () => idRef.current++;

  const [rules, setRules] = useState<Rule[]>([]);
  const [wrapDeployment, setWrapDeployment] = useState(false);
  const [copied, setCopied] = useState(false);

  function addRule(kind: RuleKind) {
    setRules((prev) => [
      ...prev,
      {
        id: nextId(),
        kind,
        enforcement: "required",
        weight: 50,
        topologyKey: "kubernetes.io/hostname",
        namespaces: "",
        expressions: [
          { id: nextId(), key: "", operator: "In", values: "" },
        ],
      },
    ]);
  }

  function updateRule(id: number, patch: Partial<Rule>) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function removeRule(id: number) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function addExpression(ruleId: number) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              expressions: [
                ...r.expressions,
                { id: nextId(), key: "", operator: "In", values: "" },
              ],
            }
          : r,
      ),
    );
  }

  function updateExpression(
    ruleId: number,
    exprId: number,
    patch: Partial<Expression>,
  ) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              expressions: r.expressions.map((e) =>
                e.id === exprId ? { ...e, ...patch } : e,
              ),
            }
          : r,
      ),
    );
  }

  function removeExpression(ruleId: number, exprId: number) {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, expressions: r.expressions.filter((e) => e.id !== exprId) }
          : r,
      ),
    );
  }

  const yaml = useMemo(() => {
    const built = buildAffinity(rules);
    if (!built) return "";
    if (!wrapDeployment) {
      return emit(built, 0).join("\n");
    }
    const deployment: YamlValue = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "my-app" },
      spec: {
        replicas: 3,
        selector: { matchLabels: { app: "my-app" } },
        template: {
          metadata: { labels: { app: "my-app" } },
          spec: {
            ...(built as { affinity: YamlValue }),
            containers: [{ name: "app", image: "nginx:latest" }],
          },
        },
      },
    };
    return emit(deployment, 0).join("\n");
  }, [rules, wrapDeployment]);

  async function copy() {
    if (!yaml) return;
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure origin, denied permission);
      // silently ignore — the YAML is still visible for manual copy.
    }
  }

  const hasRules = rules.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ---- Builder column ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_META) as RuleKind[]).map((kind) => (
            <button
              key={kind}
              onClick={() => addRule(kind)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-700"
            >
              + {KIND_META[kind].label}
            </button>
          ))}
        </div>

        {!hasRules && (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
            Add a rule above to start building an affinity spec.
          </div>
        )}

        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onUpdate={(patch) => updateRule(rule.id, patch)}
            onRemove={() => removeRule(rule.id)}
            onAddExpression={() => addExpression(rule.id)}
            onUpdateExpression={(exprId, patch) =>
              updateExpression(rule.id, exprId, patch)
            }
            onRemoveExpression={(exprId) => removeExpression(rule.id, exprId)}
          />
        ))}
      </div>

      {/* ---- Output column ---- */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
              Generated YAML
            </h2>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={wrapDeployment}
                onChange={(e) => setWrapDeployment(e.target.checked)}
                className="accent-sky-500"
              />
              Wrap in Deployment
            </label>
            <button
              onClick={copy}
              disabled={!yaml}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-200">
            {yaml || (
              <span className="text-zinc-600">
                # affinity will appear here as you add rules
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule card
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onUpdate,
  onRemove,
  onAddExpression,
  onUpdateExpression,
  onRemoveExpression,
}: {
  rule: Rule;
  onUpdate: (patch: Partial<Rule>) => void;
  onRemove: () => void;
  onAddExpression: () => void;
  onUpdateExpression: (exprId: number, patch: Partial<Expression>) => void;
  onRemoveExpression: (exprId: number) => void;
}) {
  const meta = KIND_META[rule.kind];
  const isPod = rule.kind !== "nodeAffinity";
  const operators = rule.kind === "nodeAffinity" ? NODE_OPERATORS : POD_OPERATORS;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${meta.accent}`}
        >
          {meta.label}
        </span>
        <span className="text-xs text-zinc-500">{meta.blurb}</span>
        <button
          onClick={onRemove}
          className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          aria-label="Remove rule"
        >
          Remove
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-1.5 text-zinc-400">
          Scheduling
          <select
            value={rule.enforcement}
            onChange={(e) =>
              onUpdate({ enforcement: e.target.value as Enforcement })
            }
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 outline-none focus:border-sky-500"
          >
            <option value="required">Required (hard)</option>
            <option value="preferred">Preferred (soft)</option>
          </select>
        </label>

        {rule.enforcement === "preferred" && (
          <label className="flex items-center gap-1.5 text-zinc-400">
            Weight
            <input
              type="number"
              min={1}
              max={100}
              value={rule.weight}
              onChange={(e) =>
                onUpdate({
                  weight: Math.max(
                    1,
                    Math.min(100, Number(e.target.value) || 1),
                  ),
                })
              }
              className="w-16 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 outline-none focus:border-sky-500"
            />
          </label>
        )}

        {isPod && (
          <label className="flex items-center gap-1.5 text-zinc-400">
            Topology key
            <input
              type="text"
              value={rule.topologyKey}
              onChange={(e) => onUpdate({ topologyKey: e.target.value })}
              placeholder="kubernetes.io/hostname"
              className="w-52 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-200 outline-none focus:border-sky-500"
            />
          </label>
        )}
      </div>

      {isPod && (
        <label className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400">
          Namespaces
          <input
            type="text"
            value={rule.namespaces}
            onChange={(e) => onUpdate({ namespaces: e.target.value })}
            placeholder="optional, comma-separated — defaults to the pod's own"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-200 outline-none focus:border-sky-500"
          />
        </label>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {isPod ? "Pod label selector" : "Node label match"}
        </div>
        <div className="flex flex-col gap-2">
          {rule.expressions.map((expr) => {
            const unary = UNARY_OPERATORS.includes(expr.operator);
            return (
              <div key={expr.id} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={expr.key}
                  onChange={(e) =>
                    onUpdateExpression(expr.id, { key: e.target.value })
                  }
                  placeholder="key"
                  className="w-36 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-sky-500"
                />
                <select
                  value={expr.operator}
                  onChange={(e) =>
                    onUpdateExpression(expr.id, {
                      operator: e.target.value as Operator,
                    })
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-sky-500"
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={expr.values}
                  onChange={(e) =>
                    onUpdateExpression(expr.id, { values: e.target.value })
                  }
                  disabled={unary}
                  placeholder={unary ? "— no values —" : "value1, value2"}
                  className="min-w-[8rem] flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <button
                  onClick={() => onRemoveExpression(expr.id)}
                  disabled={rule.expressions.length === 1}
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                  aria-label="Remove expression"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={onAddExpression}
          className="mt-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
        >
          + Add expression
        </button>
      </div>
    </div>
  );
}
