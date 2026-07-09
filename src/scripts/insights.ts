import {
  buildInsights,
  describeNextDayEnergyChange,
  filterRecent,
  relationalStressLevel,
  relationalStressScore
} from "./analytics";
import { getAllEntries } from "./db";
import type { DailyEntry } from "./schema";

const visualRoot = document.querySelector<HTMLDivElement>("#pattern-visuals");
const insightList = document.querySelector<HTMLDivElement>("#insight-list");
const entries = filterRecent(await getAllEntries(), 30);
const insights = buildInsights(entries);

function countTags(entries: DailyEntry[], key: "load" | "recovery"): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry[key]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);
}

function renderTagCloud(title: string, subtitle: string, tags: Array<{ label: string; count: number }>, tone: string): string {
  const max = Math.max(1, ...tags.map((tag) => tag.count));
  return `
    <article class="pattern-card">
      <h3>${title}</h3>
      <p>${subtitle}</p>
      <div class="tag-cloud">
        ${
          tags.length
            ? tags
                .map(
                  (tag) =>
                    `<span class="pattern-pill ${tone}" style="--weight: ${0.72 + (tag.count / max) * 0.6}">${tag.label}<small>${tag.count}</small></span>`
                )
                .join("")
            : `<span class="quiet-note">Not enough data yet</span>`
        }
      </div>
    </article>
  `;
}

function displayOptionalScore(value: number | ""): string {
  return typeof value === "number" ? String(value) : "-";
}

function renderRecentRibbon(entries: DailyEntry[]): string {
  const recent = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  return `
    <article class="pattern-card full-span">
      <h3>Recent days as a rhythm</h3>
      <p>Each tile holds energy, capability, relational load, and one recovery hint for that day.</p>
      <div class="day-ribbon">
        ${
          recent.length
            ? recent
                .map((entry) => {
                  const score = relationalStressScore(entry);
                  const level = relationalStressLevel(score).toLowerCase();
                  const recovery = entry.recovery[0] ?? "No recovery tag";
                  return `
                    <div class="rhythm-tile ${level}">
                      <span>${entry.date.slice(5)}</span>
                      <strong>${entry.energyScore}</strong>
                      <small>Capacity ${displayOptionalScore(entry.capacityRemainingScore)}</small>
                      <small>${recovery}</small>
                    </div>
                  `;
                })
                .join("")
            : `<span class="quiet-note">Save a few days and this will become a visual rhythm.</span>`
        }
      </div>
    </article>
  `;
}

function renderCapacityPattern(entries: DailyEntry[]): string {
  const recent = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  return `
    <article class="pattern-card">
      <h3>Energy is not the same as capability</h3>
      <p>This keeps tiredness separate from how capable I felt to keep going.</p>
      <div class="energy-steps">
        ${
          recent.length
            ? recent
                .map(
                  (entry) => `
                    <div class="energy-step">
                      <span>${entry.date.slice(5)}</span>
                      <strong>${entry.energyScore}</strong>
                      <small>R ${displayOptionalScore(entry.capacityRemainingScore)}</small>
                    </div>
                  `
                )
                .join("")
            : `<span class="quiet-note">Save a few days and this will show energy beside capacity.</span>`
        }
      </div>
    </article>
  `;
}

function renderVisuals(): void {
  if (!visualRoot) return;
  const nextDay = describeNextDayEnergyChange(entries);
  const lowEnergyDays = entries.filter((entry) => entry.energyScore <= 4);
  const highEnergyDays = entries.filter((entry) => entry.energyScore >= 7);

  visualRoot.innerHTML = `
    <article class="pattern-card featured-pattern ${nextDay.tone}">
      <span class="pattern-kicker">Relational load -> next day</span>
      <h3>${nextDay.label}</h3>
      <p>${nextDay.detail}</p>
      <div class="energy-steps">
        ${
          nextDay.rows.slice(-6).length
            ? nextDay.rows
                .slice(-6)
                .map(
                  (row) => `
                    <div class="energy-step ${row.level.toLowerCase()}">
                      <span>${row.date.slice(5)}</span>
                      <strong>${row.nextEnergy}</strong>
                      <small>${row.change > 0 ? "+" : ""}${row.change}</small>
                    </div>
                  `
                )
                .join("")
            : `<span class="quiet-note">Not enough linked days yet</span>`
        }
      </div>
    </article>
    ${renderTagCloud("What tends to gather around lower-energy days?", "Load tags from days scored 4 or below.", countTags(lowEnergyDays, "load"), "warm")}
    ${renderTagCloud("What tends to gather around steadier days?", "Recovery tags from days scored 7 or above.", countTags(highEnergyDays, "recovery"), "calm")}
    ${renderCapacityPattern(entries)}
    ${renderRecentRibbon(entries)}
  `;
}

renderVisuals();

if (insightList) {
  insightList.innerHTML = insights
    .map(
      (insight) => `
        <article class="insight-card">
          <p>${insight}</p>
        </article>
      `
    )
    .join("");

  const latest = entries.at(-1);
  if (latest) {
    const score = relationalStressScore(latest);
    insightList.insertAdjacentHTML(
      "afterbegin",
      `<article class="insight-card featured"><p>Latest relational stress score: ${score} (${relationalStressLevel(score)}). Energy, clarity, and capability are still separate signals.</p></article>`
    );
  }
}
