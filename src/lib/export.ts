import type { Project, Item, ScheduledItem, TeamMember, GanttOverride } from "@/types";
import { projectSchema } from "./validators";
import { ITEM_COLORS } from "@/types";

// ─── JSON Export / Import ────────────────────────────────────────────────────

export function exportJSON(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJSON(file: File): Promise<Project> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File too large (max 5 MB)");
  }
  const text = await file.text();
  const parsed = JSON.parse(text);
  return projectSchema.parse(parsed); // throws ZodError if invalid
}

// ─── Canvas Export ───────────────────────────────────────────────────────────

const LIGHT_COLORS = {
  bg: "#FFFFFF",
  surface: "#F8F9FC",
  border: "#DAE0EB",
  text: "#1E293B",
  textLight: "#64748B",
  accent: "#2563EB",
  danger: "#DC2626",
  purple: "#7C3AED",
};

const LEFT_PANEL = 380;
const COL_WIDTH = 50; // pixels per day — wider for readability
const ROW_HEIGHT = 40; // taller rows for labels
const HEADER_HEIGHT = 60;
const LEGEND_HEIGHT = 50;
const SCALE = 2; // retina
const BAR_PADDING = 6;
const BAR_HEIGHT = 24;
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Parse a YYYY-MM-DD string to a local-midnight Date.
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Format a Date to YYYY-MM-DD using local calendar.
 */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Returns the x-pixel offset (in logical coordinates) for a given date string
 * relative to rangeStart.
 */
function dateToX(dateStr: string, rangeStart: Date): number {
  const d = parseLocalDate(dateStr);
  const diff = daysDiff(rangeStart, d);
  return LEFT_PANEL + diff * COL_WIDTH;
}

/**
 * Renders the Gantt chart onto an offscreen canvas and returns the canvas.
 * Always uses light theme for print readability.
 */
export function renderGanttCanvas(
  items: Item[],
  scheduled: ScheduledItem[],
  team: TeamMember[],
  overrides: GanttOverride[],
  deadline: string | null
): HTMLCanvasElement | null {
  if (items.length === 0) return null;

  const scheduledMap = new Map<string, ScheduledItem>();
  for (const s of scheduled) {
    scheduledMap.set(s.itemId, s);
  }

  const teamMap = new Map<string, TeamMember>();
  for (const t of team) {
    teamMap.set(t.id, t);
  }

  const todayStr = formatLocalDate(new Date());

  // Compute date range
  let minDate = parseLocalDate(todayStr);
  let maxDate = parseLocalDate(todayStr);

  for (const s of scheduled) {
    if (s.startDate) {
      const sd = parseLocalDate(s.startDate);
      if (sd < minDate) minDate = sd;
    }
    if (s.endDate) {
      const ed = parseLocalDate(s.endDate);
      if (ed > maxDate) maxDate = ed;
    }
  }

  if (deadline) {
    const dl = parseLocalDate(deadline);
    if (dl > maxDate) maxDate = dl;
  }

  const rangeStart = addDays(minDate, -3);
  const rangeEnd = addDays(maxDate, 5);
  const totalDays = daysDiff(rangeStart, rangeEnd) + 1;

  // Canvas dimensions (logical)
  const logicalWidth = LEFT_PANEL + totalDays * COL_WIDTH;
  const logicalHeight = HEADER_HEIGHT + items.length * ROW_HEIGHT + LEGEND_HEIGHT;

  // Create offscreen canvas at 2x for retina
  const canvas = document.createElement("canvas");
  canvas.width = logicalWidth * SCALE;
  canvas.height = logicalHeight * SCALE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(SCALE, SCALE);

  // ── a. White background ──────────────────────────────────────────────────
  ctx.fillStyle = LIGHT_COLORS.bg;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // ── b. Header row ────────────────────────────────────────────────────────
  ctx.fillStyle = LIGHT_COLORS.surface;
  ctx.fillRect(0, 0, logicalWidth, HEADER_HEIGHT);

  ctx.fillStyle = LIGHT_COLORS.text;
  ctx.font = `bold 16px ${FONT_FAMILY}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Gantt Chart", 12, HEADER_HEIGHT / 2 - 10);

  ctx.fillStyle = LIGHT_COLORS.textLight;
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.fillText(`Exported ${new Date().toLocaleDateString()}`, 12, HEADER_HEIGHT / 2 + 8);

  // ── c. Column headers (day labels) ───────────────────────────────────────
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let i = 0; i < totalDays; i++) {
    const day = addDays(rangeStart, i);
    const dow = day.getDay();
    const x = LEFT_PANEL + i * COL_WIDTH;

    // Shade weekends
    if (dow === 0 || dow === 6) {
      ctx.fillStyle = "#F1F5F9";
      ctx.fillRect(x, HEADER_HEIGHT, COL_WIDTH, logicalHeight - HEADER_HEIGHT);
    }

    // Two-line label: day name on top, date number below
    ctx.fillStyle = (dow === 0 || dow === 6) ? "#94A3B8" : LIGHT_COLORS.textLight;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Month label on the 1st
    if (day.getDate() === 1 || i === 0) {
      ctx.font = `bold 11px ${FONT_FAMILY}`;
      ctx.fillStyle = LIGHT_COLORS.text;
      ctx.fillText(`${monthNames[day.getMonth()]}`, x + COL_WIDTH / 2, HEADER_HEIGHT - 30);
    }

    // Day of week
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = (dow === 0 || dow === 6) ? "#94A3B8" : LIGHT_COLORS.textLight;
    ctx.fillText(dayNames[dow], x + COL_WIDTH / 2, HEADER_HEIGHT - 18);

    // Date number
    ctx.font = `bold 11px ${FONT_FAMILY}`;
    ctx.fillText(String(day.getDate()), x + COL_WIDTH / 2, HEADER_HEIGHT - 5);
  }

  // Left panel background
  ctx.fillStyle = LIGHT_COLORS.surface;
  ctx.fillRect(0, HEADER_HEIGHT, LEFT_PANEL, logicalHeight - HEADER_HEIGHT - LEGEND_HEIGHT);

  // ── d. Horizontal grid lines ─────────────────────────────────────────────
  ctx.strokeStyle = LIGHT_COLORS.border;
  ctx.lineWidth = 0.5;

  for (let row = 0; row <= items.length; row++) {
    const y = HEADER_HEIGHT + row * ROW_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(logicalWidth, y);
    ctx.stroke();
  }

  // Vertical grid lines for each column boundary
  for (let i = 0; i <= totalDays; i++) {
    const x = LEFT_PANEL + i * COL_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, HEADER_HEIGHT);
    ctx.lineTo(x, logicalHeight - LEGEND_HEIGHT);
    ctx.stroke();
  }

  // Left panel border
  ctx.strokeStyle = LIGHT_COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_PANEL, HEADER_HEIGHT);
  ctx.lineTo(LEFT_PANEL, logicalHeight - LEGEND_HEIGHT);
  ctx.stroke();

  // ── e & f. Task rows + colored bars ─────────────────────────────────────
  items.forEach((item, rowIndex) => {
    const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
    const s = scheduledMap.get(item.id);

    // Row background (alternate)
    if (rowIndex % 2 === 0) {
      ctx.fillStyle = "#FAFBFC";
      ctx.fillRect(0, y, LEFT_PANEL, ROW_HEIGHT);
    }

    // Indentation based on parentId
    const indent = item.parentId ? (item.type === "task" || item.type === "bug" ? 28 : 14) : 0;

    // Type indicator dot
    ctx.fillStyle = ITEM_COLORS[item.type];
    ctx.beginPath();
    ctx.arc(indent + 12, y + ROW_HEIGHT / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Task label in left panel
    ctx.fillStyle = LIGHT_COLORS.text;
    ctx.font = `${item.type === "epic" ? "bold " : ""}12px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const maxLabelWidth = LEFT_PANEL - indent - 24;
    let label = item.title;
    while (label.length > 3 && ctx.measureText(label).width > maxLabelWidth) {
      label = label.slice(0, -1);
    }
    if (label !== item.title) label += "…";

    ctx.fillText(label, indent + 20, y + ROW_HEIGHT / 2);

    // Draw bar
    if (s && s.startDate && s.endDate) {
      const barX = dateToX(s.startDate, rangeStart);
      const barEndX = dateToX(s.endDate, rangeStart) + COL_WIDTH;
      const barWidth = Math.max(barEndX - barX, COL_WIDTH);
      const barY = y + BAR_PADDING;
      const barH = BAR_HEIGHT;

      // Bar color: first assignee color or item type color
      let barColor = ITEM_COLORS[item.type];
      const ids = item.assigneeIds ?? [];
      if (ids.length > 0) {
        const member = teamMap.get(ids[0]);
        if (member) barColor = member.color;
      }

      // Draw bar with rounded corners
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barH, 4);
      ctx.fill();

      // Critical path: purple border
      if (s.isCritical) {
        ctx.strokeStyle = LIGHT_COLORS.purple;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barH, 4);
        ctx.stroke();
      }

      // ── g. Smart bar labels ─────────────────────────────────────────
      // Strategy: try INSIDE first (white text). If bar too narrow, put label OUTSIDE (dark text to the right).
      ctx.font = `11px ${FONT_FAMILY}`;
      ctx.textBaseline = "middle";

      const barLabel = item.title;
      const insideMaxW = barWidth - 10;

      // Can we fit the full label or a truncated version inside?
      if (ctx.measureText(barLabel).width <= insideMaxW) {
        // Full label fits inside
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";
        ctx.fillText(barLabel, barX + 5, barY + barH / 2);
      } else {
        // Try truncated inside
        let truncated = barLabel;
        while (truncated.length > 3 && ctx.measureText(truncated + "…").width > insideMaxW) {
          truncated = truncated.slice(0, -1);
        }

        if (truncated.length > 5 && ctx.measureText(truncated + "…").width <= insideMaxW) {
          // Truncated label fits inside (at least 5 chars + ellipsis)
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "left";
          ctx.fillText(truncated + "…", barX + 5, barY + barH / 2);
        } else {
          // Bar is too narrow: draw label OUTSIDE (to the right of the bar)
          ctx.fillStyle = LIGHT_COLORS.text;
          ctx.textAlign = "left";
          ctx.font = `11px ${FONT_FAMILY}`;

          // Truncate external label if it would go beyond the canvas
          const availableRight = logicalWidth - (barX + barWidth + 8);
          let extLabel = barLabel;
          while (extLabel.length > 3 && ctx.measureText(extLabel).width > availableRight) {
            extLabel = extLabel.slice(0, -1);
          }
          if (extLabel !== barLabel) extLabel += "…";

          ctx.fillText(extLabel, barX + barWidth + 6, barY + barH / 2);
        }
      }

      // Assignee initials badge(s) at right edge of bar (inside)
      if (ids.length > 0 && barWidth > 40) {
        let badgeX = barX + barWidth - 6;
        for (let ai = Math.min(ids.length, 3) - 1; ai >= 0; ai--) {
          const m = teamMap.get(ids[ai]);
          if (!m) continue;
          const initial = m.name[0].toUpperCase();
          const badgeRadius = 7;
          // White circle with member color text
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.arc(badgeX - badgeRadius, barY + barH / 2, badgeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = m.color;
          ctx.font = `bold 9px ${FONT_FAMILY}`;
          ctx.textAlign = "center";
          ctx.fillText(initial, badgeX - badgeRadius, barY + barH / 2 + 1);
          badgeX -= badgeRadius * 2 + 2;
        }
      }
    }
  });

  // ── h. Dependency arrows (Bézier curves) ─────────────────────────────────
  ctx.strokeStyle = LIGHT_COLORS.textLight;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);

  const itemIndexMap = new Map<string, number>();
  items.forEach((item, i) => itemIndexMap.set(item.id, i));

  for (const item of items) {
    const toIndex = itemIndexMap.get(item.id);
    if (toIndex === undefined) continue;
    const toScheduled = scheduledMap.get(item.id);
    if (!toScheduled?.startDate) continue;

    for (const depId of item.dependencies) {
      const fromIndex = itemIndexMap.get(depId);
      if (fromIndex === undefined) continue;
      const fromScheduled = scheduledMap.get(depId);
      if (!fromScheduled?.endDate) continue;

      const fromX = dateToX(fromScheduled.endDate, rangeStart) + COL_WIDTH;
      const fromY = HEADER_HEIGHT + fromIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
      const toX = dateToX(toScheduled.startDate, rangeStart);
      const toY = HEADER_HEIGHT + toIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      const cp1x = fromX + (toX - fromX) * 0.5;
      ctx.bezierCurveTo(cp1x, fromY, cp1x, toY, toX, toY);
      ctx.stroke();

      // Arrowhead
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - 6, toY - 4);
      ctx.lineTo(toX - 6, toY + 4);
      ctx.closePath();
      ctx.fillStyle = LIGHT_COLORS.textLight;
      ctx.fill();
      ctx.setLineDash([3, 2]);
    }
  }

  ctx.setLineDash([]);

  // ── i. Today line ─────────────────────────────────────────────────────────
  const todayX = dateToX(todayStr, rangeStart) + COL_WIDTH / 2;
  if (todayX >= LEFT_PANEL && todayX <= logicalWidth) {
    ctx.strokeStyle = LIGHT_COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(todayX, HEADER_HEIGHT);
    ctx.lineTo(todayX, logicalHeight - LEGEND_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // "Today" pill label at top
    const todayLabel = "Today";
    ctx.font = `bold 10px ${FONT_FAMILY}`;
    const tw = ctx.measureText(todayLabel).width;
    ctx.fillStyle = LIGHT_COLORS.accent;
    ctx.beginPath();
    ctx.roundRect(todayX - tw / 2 - 6, HEADER_HEIGHT + 2, tw + 12, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(todayLabel, todayX, HEADER_HEIGHT + 10);
  }

  // ── j. Deadline line ──────────────────────────────────────────────────────
  if (deadline) {
    const dlX = dateToX(deadline, rangeStart) + COL_WIDTH / 2;
    if (dlX >= LEFT_PANEL && dlX <= logicalWidth) {
      ctx.strokeStyle = LIGHT_COLORS.danger;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(dlX, HEADER_HEIGHT);
      ctx.lineTo(dlX, logicalHeight - LEGEND_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      // "Deadline" pill label at bottom
      const dlLabel = "Deadline";
      ctx.font = `bold 10px ${FONT_FAMILY}`;
      const dlw = ctx.measureText(dlLabel).width;
      ctx.fillStyle = LIGHT_COLORS.danger;
      ctx.beginPath();
      ctx.roundRect(dlX - dlw / 2 - 6, logicalHeight - LEGEND_HEIGHT - 20, dlw + 12, 16, 8);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dlLabel, dlX, logicalHeight - LEGEND_HEIGHT - 12);
    }
  }

  // ── l. Legend ─────────────────────────────────────────────────────────────
  const legendY = logicalHeight - LEGEND_HEIGHT + 8;
  const legendItems: { label: string; color: string }[] = [
    { label: "Epic", color: ITEM_COLORS.epic },
    { label: "Story", color: ITEM_COLORS.story },
    { label: "Task", color: ITEM_COLORS.task },
    { label: "Bug", color: ITEM_COLORS.bug },
    { label: "Critical Path", color: LIGHT_COLORS.purple },
    { label: "Today", color: LIGHT_COLORS.accent },
    { label: "Deadline", color: LIGHT_COLORS.danger },
  ];

  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.textBaseline = "middle";

  // Draw a subtle top border for legend
  ctx.strokeStyle = LIGHT_COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, logicalHeight - LEGEND_HEIGHT);
  ctx.lineTo(logicalWidth, logicalHeight - LEGEND_HEIGHT);
  ctx.stroke();

  let legendX = 12;
  for (const leg of legendItems) {
    // Rounded swatch
    ctx.fillStyle = leg.color;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY + 2, 14, 14, 3);
    ctx.fill();
    // Label
    ctx.fillStyle = LIGHT_COLORS.text;
    ctx.textAlign = "left";
    ctx.fillText(leg.label, legendX + 18, legendY + 9);
    legendX += ctx.measureText(leg.label).width + 36;
    if (legendX > logicalWidth - 80) break;
  }

  return canvas;
}

export function exportGanttPNG(
  items: Item[],
  scheduled: ScheduledItem[],
  team: TeamMember[],
  overrides: GanttOverride[],
  deadline: string | null
): void {
  if (items.length === 0) return;

  requestAnimationFrame(() => {
    const canvas = renderGanttCanvas(items, scheduled, team, overrides, deadline);
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `gantt-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  });
}

export function exportGanttPDF(
  items: Item[],
  scheduled: ScheduledItem[],
  team: TeamMember[],
  overrides: GanttOverride[],
  deadline: string | null
): void {
  if (items.length === 0) return;

  requestAnimationFrame(() => {
    const canvas = renderGanttCanvas(items, scheduled, team, overrides, deadline);
    if (!canvas) return;

    const canvasDataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;

    // Safe DOM construction instead of document.write
    const style = win.document.createElement("style");
    style.textContent = `
      @page { size: landscape; margin: 10mm; }
      body { margin: 0; display: flex; justify-content: center; }
      img { max-width: 100%; height: auto; }
    `;
    win.document.head.appendChild(style);

    const img = win.document.createElement("img");
    img.src = canvasDataUrl;
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.onload = () => setTimeout(() => win.print(), 200);
    win.document.body.appendChild(img);
  });
}
