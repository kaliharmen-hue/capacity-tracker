import { getAllEntries, getClusterDecisions } from "./db";
import { buildCapacityEvents, hormonalRelevanceLabel } from "./review-model";
import { activeSymptomKeys, daysBetween, monthDates, monthKey, normalizeTimelineEntry, shiftMonth, symptomDefinitions, type NormalizedTimelineDay, type RawDailyEntry } from "./timeline-model";

const root = document.querySelector<HTMLElement>("#timeline-report");
const params = new URLSearchParams(window.location.search);
const entries = await getAllEntries();
const allDays = entries.map((entry) => normalizeTimelineEntry(entry as unknown as RawDailyEntry)).sort((a, b) => a.date.localeCompare(b.date));
const decisions = await getClusterDecisions();
const selectedMonth = params.get("month") || monthKey(allDays.at(-1)?.date ?? new Date().toISOString().slice(0, 10));

function monthEnd(month: string): string { return monthDates(month).at(-1)!; }
function rangeDates(): { start: string; end: string; label: string } {
  const range = params.get("range") || "month";
  if (range === "custom" && params.get("start") && params.get("end")) return { start: params.get("start")!, end: params.get("end")!, label: "Custom range" };
  const count = range === "6months" ? 6 : range === "3months" ? 3 : 1;
  const startMonth = shiftMonth(selectedMonth, -(count - 1));
  return { start: `${startMonth}-01`, end: monthEnd(selectedMonth), label: count === 1 ? "Current month" : `Previous ${count} months` };
}
const reportRange = rangeDates();
const days = allDays.filter((day) => day.date >= reportRange.start && day.date <= reportRange.end);
const events = buildCapacityEvents(allDays, decisions).filter((event) => event.status !== "rejected" && event.endDate >= reportRange.start && event.startDate <= reportRange.end);
const dayMap = new Map(days.map((day) => [day.date, day]));
const symptomMap = new Map(symptomDefinitions.map((definition) => [definition.key, definition]));

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string { return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function stateClass(day?: NormalizedTimelineDay): string { return day?.capacityState === "Baseline" ? "baseline" : day?.capacityState === "Slightly reduced" ? "slight" : day?.capacityState === "Reduced" ? "reduced" : day?.capacityState === "Significant reduction" ? "significant" : "empty"; }
function markers(day?: NormalizedTimelineDay): string {
  if (!day) return "";
  return activeSymptomKeys(day).slice(0, 3).map((key) => symptomMap.get(key)?.abbreviation ?? "").filter(Boolean).join(" ");
}

function monthsInRange(): string[] {
  const months: string[] = [];
  let current = monthKey(reportRange.start);
  const finalMonth = monthKey(reportRange.end);
  while (current <= finalMonth) { months.push(current); current = shiftMonth(current, 1); }
  return months;
}

function calendar(month: string): string {
  const dates = monthDates(month);
  const offset = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `<section class="report-calendar"><h3>${formatDate(`${month}-01`, { month: "long", year: "numeric" })}</h3><div class="report-weekdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="report-calendar-grid">${Array.from({ length: offset }, () => "<i></i>").join("")}${dates.map((date) => {
    const day = dayMap.get(date);
    const outside = date < reportRange.start || date > reportRange.end;
    return `<div class="report-day ${outside ? "outside" : stateClass(day)}"><b>${Number(date.slice(-2))}</b>${day && !outside ? `<small>E${day.energy ?? "-"} X${day.clarity ?? "-"}</small><em>${markers(day)}</em>` : ""}</div>`;
  }).join("")}</div></section>`;
}

function weeklyPoints(key: "energy" | "clarity" | "sleepHours" | "amfexaDose"): Array<number | null> {
  const total = daysBetween(reportRange.start, reportRange.end) + 1;
  const buckets = Array.from({ length: Math.ceil(total / 7) }, () => [] as number[]);
  days.forEach((day) => { const value = day[key]; if (value !== null) buckets[Math.floor(daysBetween(reportRange.start, day.date) / 7)].push(value); });
  return buckets.map((bucket) => bucket.length ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length : null);
}

function trend(label: string, values: Array<number | null>, max: number, colour: string): string {
  const width = 600; const height = 110; const padding = 12; const denominator = Math.max(1, values.length - 1);
  const points = values.map((value, index) => value === null ? null : `${padding + index / denominator * (width - padding * 2)},${height - padding - value / max * (height - padding * 2)}`);
  const segments: string[] = []; let current: string[] = [];
  points.forEach((point) => { if (point) current.push(point); else if (current.length) { segments.push(current.join(" ")); current = []; } }); if (current.length) segments.push(current.join(" "));
  return `<div class="trend-chart"><div><strong>${label}</strong><small>Weekly average</small></div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} trend"><line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis"/>${segments.map((segment) => `<polyline points="${segment}" fill="none" stroke="${colour}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</svg></div>`;
}

function episodeCards(): string {
  return events.filter((event) => event.kind === "episode").map((event) => `<article class="report-card"><div class="report-card-heading"><div><span>Capacity Episode</span><h3>${formatDate(event.startDate)}-${formatDate(event.endDate)}</h3></div><strong>${event.duration} days</strong></div><div class="report-facts"><span>Lowest energy <b>${event.lowestEnergy ?? "-"}</b></span><span>Lowest executive clarity <b>${event.lowestClarity ?? "-"}</b></span><span>Hormonal relevance <b>${hormonalRelevanceLabel(event)}</b></span></div></article>`).join("") || "<p>No Capacity Episodes in this range.</p>";
}

const weakDates = days.filter((day) => day.amfexaEffect.toLowerCase() === "too weak").map((day) => formatDate(day.date));
if (root) root.innerHTML = `<header class="report-header"><p class="eyebrow">Personal Operating System</p><h1>Capacity Timeline Visual Report</h1><p>${reportRange.label}: ${formatDate(reportRange.start)}-${formatDate(reportRange.end)}<br>Generated ${formatDate(new Date().toISOString().slice(0, 10))}</p></header><section><h2>Capacity State</h2><p>Each colour is a provisional daily summary derived from the recorded energy, executive clarity and related capacity markers. Missing days remain unknown.</p><div class="state-legend"><span><i class="state-key baseline"></i>Baseline</span><span><i class="state-key slight"></i>Slightly reduced</span><span><i class="state-key reduced"></i>Reduced</span><span><i class="state-key significant"></i>Significant reduction</span><span><i class="state-key empty"></i>No entry</span></div></section><section><h2>Capacity calendar</h2><div class="report-calendars">${monthsInRange().map(calendar).join("")}</div></section><section><h2>Capacity episodes</h2><div class="report-card-list">${episodeCards()}</div></section><section><h2>Trends</h2><div class="trend-list">${trend("Energy", weeklyPoints("energy"), 10, "#3f6f63")}${trend("Executive clarity", weeklyPoints("clarity"), 10, "#8f5d68")}${trend("Sleep", weeklyPoints("sleepHours"), 10, "#557c9a")}${trend("Amfexa dose", weeklyPoints("amfexaDose"), 20, "#a36c32")}</div>${weakDates.length ? `<p><strong>Amfexa recorded as too weak:</strong> ${escapeHtml(weakDates.join(", "))}</p>` : "<p>No reduced Amfexa-effect dates were recorded in this range.</p>"}</section><footer><p>Capacity Episodes are neutral as to cause. Hormonal relevance is reviewed separately.</p><p><strong>Personal longitudinal tracking data. This report does not establish a diagnosis.</strong></p></footer>`;
document.querySelector("#print-report")?.addEventListener("click", () => window.print());
