"use client";

import { useMemo } from "react";
import { TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BurndownData } from "@/lib/burndown-utils";

interface BurndownChartProps {
  data: BurndownData | null;
  sprintName?: string;
}

// ─── Chart constants ────────────────────────────────────────────────────────

const CHART_WIDTH = 600;
const CHART_HEIGHT = 240;
const PADDING = { top: 20, right: 20, bottom: 40, left: 40 };
const PLOT_W = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_H = CHART_HEIGHT - PADDING.top - PADDING.bottom;

// ─── Component ──────────────────────────────────────────────────────────────

export function BurndownChart({ data, sprintName }: BurndownChartProps) {
  const points = data?.points ?? [];
  const totalItems = data?.totalItems ?? 0;
  const completedItems = data?.completedItems ?? 0;
  const hasData = data !== null && points.length > 0;

  // Compute SVG paths and labels — hook must run unconditionally
  const { idealPath, actualPath, xLabels, yMax, yTicks, todayX } = useMemo(() => {
    if (!hasData) {
      return { idealPath: "", actualPath: "", xLabels: [], yMax: 0, yTicks: [], todayX: -1 };
    }
    const yMax = totalItems;

    // X scale: point index → pixel
    const xScale = (i: number) =>
      PADDING.left + (i / (points.length - 1 || 1)) * PLOT_W;
    // Y scale: value → pixel (inverted — 0 at bottom)
    const yScale = (v: number) =>
      PADDING.top + (1 - v / (yMax || 1)) * PLOT_H;

    // Ideal line path (full sprint)
    const idealParts = points.map((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ideal);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    // Actual line path (only up to today — skip sentinel -1 values)
    const actualPoints = points.filter((p) => p.remaining >= 0);
    const actualParts = actualPoints.map((p, i) => {
      const originalIndex = points.indexOf(p);
      const x = xScale(originalIndex);
      const y = yScale(p.remaining);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    // Today vertical line position
    const todayIdx = actualPoints.length - 1;
    const todayXPos = todayIdx >= 0 ? xScale(points.indexOf(actualPoints[todayIdx])) : -1;

    // X-axis labels: show ~6 evenly spaced dates
    const labelCount = Math.min(6, points.length);
    const step = Math.max(1, Math.floor((points.length - 1) / Math.max(1, labelCount - 1)));
    const xLabels: { x: number; label: string }[] = [];
    for (let i = 0; i < points.length; i += step) {
      const date = points[i].date;
      // Format as "Apr 3"
      const d = new Date(date + "T00:00:00Z");
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      xLabels.push({ x: xScale(i), label });
    }
    // Always include last date
    if (xLabels.length > 0 && xLabels[xLabels.length - 1].x < xScale(points.length - 1) - 30) {
      const last = points[points.length - 1];
      const d = new Date(last.date + "T00:00:00Z");
      xLabels.push({
        x: xScale(points.length - 1),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }

    // Y-axis ticks: ~4 ticks
    const yTicks: { y: number; label: string }[] = [];
    const tickStep = Math.max(1, Math.ceil(yMax / 4));
    for (let v = 0; v <= yMax; v += tickStep) {
      yTicks.push({ y: yScale(v), label: String(v) });
    }
    // Always include max
    if (yTicks.length === 0 || yTicks[yTicks.length - 1].label !== String(yMax)) {
      yTicks.push({ y: yScale(yMax), label: String(yMax) });
    }

    return {
      idealPath: idealParts.join(" "),
      actualPath: actualParts.join(" "),
      xLabels,
      yMax,
      yTicks,
      todayX: todayXPos,
    };
  }, [points, totalItems, hasData]);

  if (!hasData) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <TrendingDown size={16} className="text-[var(--accent)]" />
          Burndown Chart
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          No active sprint with items. Start a sprint to see the burndown chart.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <TrendingDown size={16} className="text-[var(--accent)]" />
          Burndown Chart
        </h2>
        <div className="flex items-center gap-2">
          {sprintName && <Badge variant="blue">{sprintName}</Badge>}
          <span className="text-xs text-[var(--text-tertiary)]">
            {completedItems}/{totalItems} done
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full max-w-full"
          style={{ minWidth: 320 }}
          aria-label={`Burndown chart: ${completedItems} of ${totalItems} items completed`}
        >
          {/* Grid lines */}
          {yTicks.map(({ y, label }) => (
            <g key={label}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={CHART_WIDTH - PADDING.right}
                y2={y}
                stroke="var(--border)"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
              <text
                x={PADDING.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--text-tertiary)"
                fontSize={10}
              >
                {label}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ x, label }) => (
            <text
              key={label + x}
              x={x}
              y={CHART_HEIGHT - PADDING.bottom + 18}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={10}
            >
              {label}
            </text>
          ))}

          {/* Axes */}
          <line
            x1={PADDING.left}
            y1={PADDING.top}
            x2={PADDING.left}
            y2={CHART_HEIGHT - PADDING.bottom}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <line
            x1={PADDING.left}
            y1={CHART_HEIGHT - PADDING.bottom}
            x2={CHART_WIDTH - PADDING.right}
            y2={CHART_HEIGHT - PADDING.bottom}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {/* Today marker */}
          {todayX > 0 && (
            <>
              <line
                x1={todayX}
                y1={PADDING.top}
                x2={todayX}
                y2={CHART_HEIGHT - PADDING.bottom}
                stroke="var(--text-tertiary)"
                strokeWidth={0.5}
                strokeDasharray="2 3"
              />
              <text
                x={todayX}
                y={PADDING.top - 6}
                textAnchor="middle"
                fill="var(--text-tertiary)"
                fontSize={9}
              >
                Today
              </text>
            </>
          )}

          {/* Ideal line */}
          <path
            d={idealPath}
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={0.6}
          />

          {/* Actual line */}
          {actualPath && (
            <path
              d={actualPath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Actual line dots */}
          {points
            .filter((p) => p.remaining >= 0)
            .map((p) => {
              const idx = points.indexOf(p);
              const x =
                PADDING.left + (idx / (points.length - 1 || 1)) * PLOT_W;
              const y =
                PADDING.top +
                (1 - p.remaining / (yMax || 1)) * PLOT_H;
              return (
                <circle
                  key={p.date}
                  cx={x}
                  cy={y}
                  r={3}
                  fill="var(--accent)"
                  stroke="var(--bg-surface)"
                  strokeWidth={1.5}
                />
              );
            })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-[var(--accent)] rounded" />
          <span className="text-xs text-[var(--text-secondary)]">Actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-0.5 rounded"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--text-tertiary) 0, var(--text-tertiary) 4px, transparent 4px, transparent 8px)",
            }}
          />
          <span className="text-xs text-[var(--text-secondary)]">Ideal</span>
        </div>
      </div>
    </div>
  );
}
