"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpTip } from "@/components/HelpTip";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import {
  saveMapLayoutConfig,
  resetMapLayoutConfig,
} from "@/app/(app)/admin/actions";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  MAP_LAYOUT_FIELD_HELP,
  MAP_LAYOUT_RANGES,
  mapLayoutConfigsEqual,
  parseMapLayoutConfig,
  type MapLayoutConfig,
  type MapLayoutSurface,
  type StreamMapLayouts,
} from "@/lib/graph/map-layout-config";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

const inputClassName =
  "mt-1 w-full rounded-md border border-cloud bg-sand px-3 py-2 text-sm outline-none focus:border-ink/40";

type FieldSpec =
  | {
      key: keyof Omit<MapLayoutConfig, "radii">;
      label: string;
      helpKey: string;
      min: number;
      max: number;
      step: number;
    }
  | {
      key: "radii";
      radiusKey: keyof MapLayoutConfig["radii"];
      label: string;
      helpKey: string;
      min: number;
      max: number;
      step: number;
    };

const PHYSICS_FIELDS: FieldSpec[] = [
  {
    key: "chargeStrength",
    label: "Repulsion (charge)",
    helpKey: "chargeStrength",
    ...MAP_LAYOUT_RANGES.chargeStrength,
  },
  {
    key: "linkDistance",
    label: "Link distance",
    helpKey: "linkDistance",
    ...MAP_LAYOUT_RANGES.linkDistance,
  },
  {
    key: "linkStrength",
    label: "Link strength",
    helpKey: "linkStrength",
    ...MAP_LAYOUT_RANGES.linkStrength,
  },
  {
    key: "collidePadding",
    label: "Collision padding",
    helpKey: "collidePadding",
    ...MAP_LAYOUT_RANGES.collidePadding,
  },
];

const KNOWLEDGE_MAP_SIZE_FIELDS: FieldSpec[] = [
  {
    key: "radii",
    radiusKey: "Concept",
    label: "High-closeness radius",
    helpKey: "radiusHighCloseness",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Atom",
    label: "Low-closeness radius",
    helpKey: "radiusLowCloseness",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "labelFontSize",
    label: "Label font size",
    helpKey: "labelFontSize",
    ...MAP_LAYOUT_RANGES.labelFontSize,
  },
  {
    key: "labelMaxLength",
    label: "Label max length",
    helpKey: "labelMaxLength",
    ...MAP_LAYOUT_RANGES.labelMaxLength,
  },
];

const DASHBOARD_SIZE_FIELDS: FieldSpec[] = [
  {
    key: "radii",
    radiusKey: "Framework",
    label: "Session radius",
    helpKey: "radiusSession",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Concept",
    label: "Chat radius",
    helpKey: "radiusChat",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Theme",
    label: "Record radius",
    helpKey: "radiusRecord",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Atom",
    label: "Upload radius",
    helpKey: "radiusUpload",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "spriteScale",
    label: "Sprite scale",
    helpKey: "spriteScale",
    ...MAP_LAYOUT_RANGES.spriteScale,
  },
  {
    key: "labelFontSize",
    label: "Label font size",
    helpKey: "labelFontSize",
    ...MAP_LAYOUT_RANGES.labelFontSize,
  },
  {
    key: "labelMaxLength",
    label: "Label max length",
    helpKey: "labelMaxLength",
    ...MAP_LAYOUT_RANGES.labelMaxLength,
  },
];

const SAMPLE_KM_NODES: GraphNode[] = [
  {
    id: "sample-concept",
    streamId: "preview",
    type: "Concept",
    label: "Shared inquiry",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-framework",
    streamId: "preview",
    type: "Framework",
    label: "Ladder of Inference",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-theme",
    streamId: "preview",
    type: "Theme",
    label: "Belonging",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-atom",
    streamId: "preview",
    type: "Atom",
    label: "Voice",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
];

const SAMPLE_KM_EDGES: GraphEdge[] = [
  {
    id: "e1",
    streamId: "preview",
    sourceNodeId: "sample-concept",
    targetNodeId: "sample-framework",
    relationship: "uses",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "e2",
    streamId: "preview",
    sourceNodeId: "sample-framework",
    targetNodeId: "sample-theme",
    relationship: "supports",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "e3",
    streamId: "preview",
    sourceNodeId: "sample-theme",
    targetNodeId: "sample-atom",
    relationship: "includes",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
];

const SAMPLE_DASH_NODES: GraphNode[] = [
  {
    id: "sample-session",
    streamId: "preview",
    type: "Session",
    label: "Morning circle",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-chat",
    streamId: "preview",
    type: "Chat",
    label: "What shifted",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-record",
    streamId: "preview",
    type: "Record",
    label: "Plenary take",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "sample-upload",
    streamId: "preview",
    type: "Upload",
    label: "Reading notes",
    description: null,
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
];

const SAMPLE_DASH_EDGES: GraphEdge[] = [
  {
    id: "de1",
    streamId: "preview",
    sourceNodeId: "sample-chat",
    targetNodeId: "sample-session",
    relationship: "nested",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "de2",
    streamId: "preview",
    sourceNodeId: "sample-record",
    targetNodeId: "sample-session",
    relationship: "nested",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "de3",
    streamId: "preview",
    sourceNodeId: "sample-upload",
    targetNodeId: "sample-chat",
    relationship: "related",
    sourceDocumentId: null,
    createdAt: "",
    updatedAt: "",
  },
];

function fieldValue(config: MapLayoutConfig, field: FieldSpec): number {
  if (field.key === "radii") {
    return config.radii[field.radiusKey];
  }
  return config[field.key];
}

function setFieldValue(
  config: MapLayoutConfig,
  field: FieldSpec,
  value: number,
): MapLayoutConfig {
  if (field.key === "radii") {
    return {
      ...config,
      radii: { ...config.radii, [field.radiusKey]: value },
    };
  }
  return { ...config, [field.key]: value };
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  value: number;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  const help = MAP_LAYOUT_FIELD_HELP[field.helpKey] ?? "";
  return (
    <div className="block text-sm text-ink">
      <span className="inline-flex items-center gap-1.5">
        {field.label}
        {help ? <HelpTip description={help} /> : null}
      </span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={field.label}
        className={inputClassName}
      />
    </div>
  );
}

export function MapLayoutAdminPanel({
  streamName,
  initialLayouts,
  previewNodes,
  previewEdges,
}: {
  streamName: string;
  initialLayouts: StreamMapLayouts;
  previewNodes: GraphNode[];
  previewEdges: GraphEdge[];
}) {
  const router = useRouter();
  const [surface, setSurface] = useState<MapLayoutSurface>("knowledgeMap");
  const [mapConfig, setMapConfig] = useState(initialLayouts.knowledgeMap);
  const [dashConfig, setDashConfig] = useState(initialLayouts.dashboard);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const config = surface === "knowledgeMap" ? mapConfig : dashConfig;
  const savedConfig =
    surface === "knowledgeMap"
      ? initialLayouts.knowledgeMap
      : initialLayouts.dashboard;
  const dirty = !mapLayoutConfigsEqual(config, savedConfig);
  const isDefault = mapLayoutConfigsEqual(config, DEFAULT_MAP_LAYOUT_CONFIG);
  const liveConfig = useMemo(() => parseMapLayoutConfig(config), [config]);

  const isDashboard = surface === "dashboard";
  const sizeFields = isDashboard
    ? DASHBOARD_SIZE_FIELDS
    : KNOWLEDGE_MAP_SIZE_FIELDS;
  const nodes = isDashboard
    ? SAMPLE_DASH_NODES
    : previewNodes.length > 0
      ? previewNodes
      : SAMPLE_KM_NODES;
  const edges = isDashboard
    ? SAMPLE_DASH_EDGES
    : previewNodes.length > 0
      ? previewEdges
      : SAMPLE_KM_EDGES;

  function setActiveConfig(next: MapLayoutConfig) {
    if (surface === "knowledgeMap") setMapConfig(next);
    else setDashConfig(next);
  }

  function onNumberChange(field: FieldSpec, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setActiveConfig(setFieldValue(config, field, value));
    setMessage(null);
    setError(null);
  }

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveMapLayoutConfig(surface, config);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        surface === "knowledgeMap"
          ? "Saved — Knowledge Map uses these knobs."
          : "Saved — Dashboard map uses these knobs.",
      );
      router.refresh();
    });
  }

  function onReset() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await resetMapLayoutConfig(surface);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActiveConfig(DEFAULT_MAP_LAYOUT_CONFIG);
      setMessage("Reset this tab to product defaults.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-ink/55">
          <Link
            href="/admin"
            className="text-horizon underline-offset-2 hover:underline"
          >
            Admin
          </Link>
          <span className="mx-1.5 text-ink/30">/</span>
          Map layout
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Map &amp; Dashboard layout
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Tune physics and sizes for {streamName}. Knowledge Map and Dashboard
          each have their own knobs — save the tab you are on. Hover the{" "}
          <span className="font-mono text-xs">?</span> next to a field for what
          it does. The preview updates as you type.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Layout surface"
        className="flex flex-wrap gap-1 border-b border-cloud"
      >
        {(
          [
            ["knowledgeMap", "Knowledge Map"],
            ["dashboard", "Dashboard"],
          ] as const
        ).map(([id, label]) => {
          const selected = surface === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                selected
                  ? "border-forest text-forest"
                  : "border-transparent text-ink/45 hover:text-ink/70"
              }`}
              onClick={() => {
                setSurface(id);
                setMessage(null);
                setError(null);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="font-display text-lg font-medium text-ink">
              Physics
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PHYSICS_FIELDS.map((field) => (
                <FieldInput
                  key={field.key === "radii" ? field.radiusKey : field.key}
                  field={field}
                  value={fieldValue(config, field)}
                  disabled={pending}
                  onChange={(raw) => onNumberChange(field, raw)}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-ink">
              Sizes
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {sizeFields.map((field) => (
                <FieldInput
                  key={
                    field.key === "radii"
                      ? `r-${field.radiusKey}`
                      : field.key
                  }
                  field={field}
                  value={fieldValue(config, field)}
                  disabled={pending}
                  onChange={(raw) => onNumberChange(field, raw)}
                />
              ))}
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={onSave}
              className="rounded-md border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save this tab"}
            </button>
            <button
              type="button"
              disabled={pending || isDefault}
              onClick={onReset}
              className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm text-ink disabled:opacity-50"
            >
              Reset this tab
            </button>
          </div>

          {error ? (
            <p className="font-mono text-sm text-danger">{error}</p>
          ) : null}
          {message ? <p className="text-sm text-ink/60">{message}</p> : null}
        </div>

        <section className="flex min-h-[360px] flex-col gap-2">
          <h2 className="font-display text-lg font-medium text-ink">
            Live preview
          </h2>
          <p className="text-xs text-ink/50">
            {isDashboard
              ? "Sample Commons types (Session, Chat, Record, Upload) with Plant sprites."
              : previewNodes.length > 0
                ? "Using this stream’s Knowledge Map nodes."
                : "Sample nodes (stream graph is empty)."}
          </p>
          <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-cloud bg-forest-deep">
            <KnowledgeMap
              nodes={nodes}
              edges={edges}
              hideDetailPanel
              hideChrome
              showLegend
              allowFullscreen={false}
              legendVariant={isDashboard ? "dashboard" : "knowledgeMap"}
              wallpaperTheme={isDashboard ? "plant" : null}
              wallpaperSeed="admin-preview"
              useSprites={isDashboard}
              layoutConfig={liveConfig}
              className="h-full min-h-[320px]"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
