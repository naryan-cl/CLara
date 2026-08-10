"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import {
  saveMapLayoutConfig,
  resetMapLayoutConfig,
} from "@/app/(app)/admin/actions";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  MAP_LAYOUT_RANGES,
  mapLayoutConfigsEqual,
  parseMapLayoutConfig,
  type MapLayoutConfig,
} from "@/lib/graph/map-layout-config";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

const inputClassName =
  "mt-1 w-full rounded-md border border-cloud bg-sand px-3 py-2 text-sm outline-none focus:border-ink/40";

type FieldSpec =
  | {
      key: keyof Omit<MapLayoutConfig, "radii">;
      label: string;
      min: number;
      max: number;
      step: number;
    }
  | {
      key: "radii";
      radiusKey: keyof MapLayoutConfig["radii"];
      label: string;
      min: number;
      max: number;
      step: number;
    };

const PHYSICS_FIELDS: FieldSpec[] = [
  {
    key: "chargeStrength",
    label: "Repulsion (charge)",
    ...MAP_LAYOUT_RANGES.chargeStrength,
  },
  {
    key: "linkDistance",
    label: "Link distance",
    ...MAP_LAYOUT_RANGES.linkDistance,
  },
  {
    key: "linkStrength",
    label: "Link strength",
    ...MAP_LAYOUT_RANGES.linkStrength,
  },
  {
    key: "collidePadding",
    label: "Collision padding",
    ...MAP_LAYOUT_RANGES.collidePadding,
  },
];

const SIZE_FIELDS: FieldSpec[] = [
  {
    key: "radii",
    radiusKey: "Concept",
    label: "Concept radius",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Framework",
    label: "Framework radius",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Theme",
    label: "Theme radius",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "radii",
    radiusKey: "Atom",
    label: "Atom radius",
    ...MAP_LAYOUT_RANGES.radius,
  },
  {
    key: "spriteScale",
    label: "Sprite scale",
    ...MAP_LAYOUT_RANGES.spriteScale,
  },
  {
    key: "labelFontSize",
    label: "Label font size",
    ...MAP_LAYOUT_RANGES.labelFontSize,
  },
  {
    key: "labelMaxLength",
    label: "Label max length",
    ...MAP_LAYOUT_RANGES.labelMaxLength,
  },
];

/** Tiny sample graph when the stream has no nodes yet — preview still works. */
const SAMPLE_NODES: GraphNode[] = [
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

const SAMPLE_EDGES: GraphEdge[] = [
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

export function MapLayoutAdminPanel({
  streamName,
  initialConfig,
  previewNodes,
  previewEdges,
}: {
  streamName: string;
  initialConfig: MapLayoutConfig;
  previewNodes: GraphNode[];
  previewEdges: GraphEdge[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = !mapLayoutConfigsEqual(config, initialConfig);
  const isDefault = mapLayoutConfigsEqual(config, DEFAULT_MAP_LAYOUT_CONFIG);

  const nodes = previewNodes.length > 0 ? previewNodes : SAMPLE_NODES;
  const edges = previewNodes.length > 0 ? previewEdges : SAMPLE_EDGES;

  const liveConfig = useMemo(() => parseMapLayoutConfig(config), [config]);

  function onNumberChange(field: FieldSpec, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setConfig((current) => setFieldValue(current, field, value));
    setMessage(null);
    setError(null);
  }

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveMapLayoutConfig(config);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Saved — Dashboard and Knowledge Map use these knobs.");
      router.refresh();
    });
  }

  function onReset() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await resetMapLayoutConfig();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfig(DEFAULT_MAP_LAYOUT_CONFIG);
      setMessage("Reset to product defaults.");
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
          Play with physics and sizes for {streamName}. Changes preview live
          below; Save applies them to the Dashboard map and Knowledge Map.
          Apply migration{" "}
          <span className="font-mono text-xs">0022_map_layout_config</span>{" "}
          first.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="font-display text-lg font-medium text-ink">
              Physics
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PHYSICS_FIELDS.map((field) => (
                <label
                  key={field.key === "radii" ? field.radiusKey : field.key}
                  className="block text-sm text-ink"
                >
                  {field.label}
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={fieldValue(config, field)}
                    disabled={pending}
                    onChange={(event) =>
                      onNumberChange(field, event.target.value)
                    }
                    className={inputClassName}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-ink">
              Sizes
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {SIZE_FIELDS.map((field) => (
                <label
                  key={
                    field.key === "radii"
                      ? `r-${field.radiusKey}`
                      : field.key
                  }
                  className="block text-sm text-ink"
                >
                  {field.label}
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={fieldValue(config, field)}
                    disabled={pending}
                    onChange={(event) =>
                      onNumberChange(field, event.target.value)
                    }
                    className={inputClassName}
                  />
                </label>
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
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending || isDefault}
              onClick={onReset}
              className="rounded-md border border-cloud bg-paper px-4 py-2 text-sm text-ink disabled:opacity-50"
            >
              Reset to defaults
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
            {previewNodes.length > 0
              ? "Using this stream’s Knowledge Map nodes."
              : "Sample nodes (stream graph is empty)."}
          </p>
          <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border border-cloud bg-forest-deep">
            <KnowledgeMap
              nodes={nodes}
              edges={edges}
              hideDetailPanel
              layoutConfig={liveConfig}
              className="h-full min-h-[320px]"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
