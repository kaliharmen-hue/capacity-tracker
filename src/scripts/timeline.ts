import { getAllEntries, getClusterDecisions, saveClusterDecision } from "./db";
import {
  activeSymptomKeys,
  buildBaselineProfile,
  buildTimelineCsv,
  latestMonthWithData,
  monthDates,
  monthKey,
  normalizeTimelineEntry,
  resolveHormonalRelevance,
  shiftMonth,
  symptomDefinitions,
  type CapacityCluster,
  type ClusterDecision,
  type NormalizedTimelineDay,
  type RawDailyEntry
} from "./timeline-model";
import { buildCapacityEvents } from "./review-model";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const monthTitle = document.querySelector<HTMLHeadingElement>("#selected-month");
const calendarRoot = document.querySelector<HTMLDivElement>("#capacity-calendar");
const detailRoot = document.querySelector<HTMLElement>("#day-detail");
const timelineRoot = document.querySelector<HTMLDivElement>("#metric-timeline");
const clusterRoot = document.querySelector<HTMLDivElement>("#cluster-list");
const baselineRoot = document.querySelector<HTMLElement>("#baseline-profile");
const legendRoot = document.querySelector<HTMLDivElement>("#indicator-legend");
const statusRoot = document.querySelector<HTMLParagraphElement>("#timeline-status");
const hormoneFocusControl = document.querySelector<HTMLInputElement>("#hormone-focus");
const reportRangeControl = document.querySelector<HTMLSelectElement>("#visual-report-range");
const customReportRange = document.querySelector<HTMLElement>("#custom-report-range");
const reportStartDate = document.querySelector<HTMLInputElement>("#report-start-date");
const reportEndDate = document.querySelector<HTMLInputElement>("#report-end-date");

const rawEntries = await getAllEntries();
const days = rawEntries
  .map((entry) => normalizeTimelineEntry(entry as unknown as RawDailyEntry))
  .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
  .sort((a, b) => a.date.localeCompare(b.date));
let decisions = await getClusterDecisions();
const requestedMonth = new URLSearchParams(window.location.search).get("month");
const requestedEpisode = new URLSearchParams(window.location.search).get("episode");
let selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : latestMonthWithData(days, new Date().toISOString().slice(0, 10));
let hormoneFocus = false;

const dayMap = new Map(days.map((day) => [day.date, day]));
const symptomMap = new Map(symptomDefinitions.map((definition) => [definition.key, definition]));

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatValue(value: string | number | null, suffix = ""): string {
  return value === null || value === "" ? "Not recorded" : `${value}${suffix}`;
}

function stateClass(day: NormalizedTimelineDay): string {
  return day.capacityState === "Baseline"
    ? "baseline"
    : day.capacityState === "Slightly reduced"
      ? "slight"
      : day.capacityState === "Reduced"
        ? "reduced"
        : day.capacityState === "Significant reduction"
          ? "significant"
          : "unclear";
}

function stateShort(day: NormalizedTimelineDay): string {
  return day.capacityState === "Baseline"
    ? "Baseline"
    : day.capacityState === "Slightly reduced"
      ? "Slight"
      : day.capacityState === "Reduced"
        ? "Reduced"
        : day.capacityState === "Significant reduction"
          ? "Signif."
          : "Unclear";
}

function allClusters(): CapacityCluster[] {
  return buildCapacityEvents(days, decisions);
}

function clusterForDate(date: string, clusters = allClusters()): CapacityCluster | undefined {
  return clusters.find((cluster) => cluster.status !== "rejected" && date >= cluster.startDate && date <= cluster.endDate);
}

function renderLegend(): void {
  if (!legendRoot) return;
  legendRoot.innerHTML = symptomDefinitions
    .map(
      (definition) =>
        `<span class="indicator-legend-item ${hormoneFocus && definition.hormoneFocus ? "emphasised" : ""}"><b>${definition.abbreviation}</b>${definition.label}</span>`
    )
    .join("");
}

function renderBaseline(): void {
  if (!baselineRoot) return;
  const profile = buildBaselineProfile(days);
  if (!profile) {
    baselineRoot.innerHTML = `<div><p class="eyebrow">Current Baseline Profile</p><h3>More baseline days are needed</h3></div><p>At least five recent recorded days need to meet the provisional Baseline rules.</p>`;
    return;
  }
  baselineRoot.innerHTML = `
    <div><p class="eyebrow">Current Baseline Profile</p><h3>Provisional baseline based on recorded baseline days</h3></div>
    <div class="baseline-values">
      <span><small>Typical energy</small><strong>${formatValue(profile.energy, "/10")}</strong></span>
      <span><small>Typical clarity</small><strong>${formatValue(profile.clarity, "/10")}</strong></span>
      <span><small>Typical sleep</small><strong>${formatValue(profile.sleepHours, "h")}</strong></span>
      <span><small>Overall state</small><strong>${escapeHtml(profile.overallState || "Not recorded")}</strong></span>
      <span><small>Amfexa dose</small><strong>${formatValue(profile.amfexaDose, " mg")}</strong></span>
      <span><small>Usual hormonal signs</small><strong>${escapeHtml(profile.hormonalSigns.join(", ") || "None commonly recorded")}</strong></span>
    </div>
    <p>Based on ${profile.count} baseline days from the most recent 90 days of data.</p>`;
}

function renderIndicators(day: NormalizedTimelineDay): string {
  const keys = activeSymptomKeys(day).sort((left, right) => {
    if (!hormoneFocus) return 0;
    return Number(symptomMap.get(right)?.hormoneFocus) - Number(symptomMap.get(left)?.hormoneFocus);
  });
  const visible = keys.slice(0, hormoneFocus ? 6 : 4);
  return visible
    .map((key) => {
      const definition = symptomMap.get(key)!;
      return `<span class="day-indicator ${hormoneFocus && definition.hormoneFocus ? "emphasised" : ""}" title="${definition.label}" aria-label="${definition.label}">${definition.abbreviation}</span>`;
    })
    .join("");
}

function renderCalendar(): void {
  if (!calendarRoot || !monthTitle) return;
  monthTitle.textContent = formatDate(`${selectedMonth}-01`, { month: "long", year: "numeric" });
  const dates = monthDates(selectedMonth);
  const firstWeekday = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const clusters = allClusters();
  const blanks = Array.from({ length: firstWeekday }, () => `<span class="calendar-spacer" aria-hidden="true"></span>`).join("");
  calendarRoot.innerHTML =
    blanks +
    dates
      .map((date) => {
        const day = dayMap.get(date);
        if (!day) {
          return `<div class="capacity-day empty" aria-label="${formatDate(date)}: no entry"><span class="day-number">${Number(date.slice(-2))}</span><small>No entry</small></div>`;
        }
        const cluster = clusterForDate(date, clusters);
        const hormonal = cluster?.kind === "episode" && ["Yes", "Possible"].includes(resolveHormonalRelevance(cluster));
        const label = `${formatDate(date)}: ${day.capacityState ?? "not enough data"}. Energy ${formatValue(day.energy)}. Executive clarity ${formatValue(day.clarity)}.`;
        return `
          <button type="button" class="capacity-day ${stateClass(day)} ${cluster ? `in-cluster ${cluster.kind}` : ""} ${hormonal ? "hormonal-cluster" : ""} ${hormoneFocus ? "hormone-focus" : ""}" data-date="${date}" aria-label="${escapeHtml(label)}">
            <span class="day-number">${Number(date.slice(-2))}</span>
            <strong>${stateShort(day)}</strong>
            <span class="day-scores"><b>E${day.energy ?? "–"}</b><b>X${day.clarity ?? "–"}</b></span>
            <span class="day-indicators">${renderIndicators(day)}</span>
          </button>`;
      })
      .join("");
}

function detailList(items: Array<[string, string]>): string {
  return `<dl>${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "Not recorded")}</dd></div>`).join("")}</dl>`;
}

function showDayDetail(date: string): void {
  if (!detailRoot) return;
  const day = dayMap.get(date);
  if (!day) return;
  const symptoms = activeSymptomKeys(day).map((key) => symptomMap.get(key)?.label ?? key);
  const cognitiveNotes = day.notes.filter((note) => /fog|muddy|head|swim|treacle|intox|word recall/i.test(note));
  detailRoot.hidden = false;
  detailRoot.innerHTML = `
    <div class="detail-heading">
      <div><p class="eyebrow">Daily summary</p><h3>${formatDate(day.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3></div>
      <button id="close-day-detail" class="icon-button" type="button" aria-label="Close daily summary" title="Close">×</button>
    </div>
    <div class="detail-grid">
      <section><h4>Capacity</h4>${detailList([
        ["Capacity State", day.capacityState ?? "Not enough data"],
        ["Energy", formatValue(day.energy, "/10")],
        ["Executive clarity", formatValue(day.clarity, "/10")],
        ["Overall state", day.overallState],
        ["End-of-day energy", day.endOfDayEnergy]
      ])}<p class="detail-reason">${day.capacityReasons.map(escapeHtml).join(" ")}</p></section>
      <section><h4>Symptoms</h4>${detailList([
        ["Indicators", symptoms.join(", ")],
        ["Hormonal signs", day.hormonalSigns.join(", ")],
        ["Cognitive descriptions", cognitiveNotes.join(" | ")],
        ["Mood changes", day.moodChanges.join(", ")],
        ["Activation", day.flags.activation ? [...day.activationSigns, "Recorded activation"].filter(Boolean).join(", ") : "Not recorded"]
      ])}</section>
      <section><h4>Medication</h4>${detailList([
        ["Amfexa dose", formatValue(day.amfexaDose, " mg")],
        ["Amfexa effect", day.amfexaEffect],
        ["PMDD medication", day.pmddMedicationTaken],
        ["Side effects", day.medicationSideEffects.join(", ")]
      ])}</section>
      <section><h4>Context</h4>${detailList([
        ["Sleep", `${formatValue(day.sleepHours, "h")} · ${day.sleepQuality || "quality not recorded"}`],
        ["Executive friction", day.executiveFriction.join(", ")],
        ["Load", day.load.join(", ")],
        ["Recovery", day.recovery.join(", ")],
        ["Most influential factor", day.reflectionInfluencedToday],
        ["Biggest energy drain", day.biggestEnergyDrain],
        ["What helped", day.capacityImprovedBy]
      ])}</section>
    </div>
    <a class="primary-button detail-entry-link" href="${base}?date=${encodeURIComponent(day.date)}">Open full daily entry</a>`;
  detailRoot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function timelineValue(day: NormalizedTimelineDay | undefined, key: "energy" | "clarity" | "sleepHours" | "amfexaDose"): string {
  const value = day?.[key];
  return value === null || value === undefined ? "" : String(value);
}

function timelineMarkers(day: NormalizedTimelineDay | undefined): string {
  if (!day) return "";
  const markers: string[] = [];
  if (day.flags.pmddMedication) markers.push("PM");
  if (["yes", "slightly"].includes(day.familiarHormonalPattern.toLowerCase())) markers.push("H");
  if (day.flags.brainFog || day.flags.headSwimming) markers.push("Cog");
  if (day.flags.cravings || day.flags.increasedAppetite) markers.push("App");
  return markers.join(" ");
}

function renderTimeline(): void {
  if (!timelineRoot) return;
  const dates = monthDates(selectedMonth);
  const clusters = allClusters();
  const rows: Array<[string, "energy" | "clarity" | "sleepHours" | "amfexaDose"]> = [
    ["Energy", "energy"],
    ["Clarity", "clarity"],
    ["Sleep", "sleepHours"],
    ["Dose", "amfexaDose"]
  ];
  const cell = (date: string, content: string, extra = "") => {
    const cluster = clusterForDate(date, clusters);
    const hormonal = cluster?.kind === "episode" && ["Yes", "Possible"].includes(resolveHormonalRelevance(cluster));
    return `<td class="${cluster ? `cluster-cell ${cluster.kind}` : ""} ${hormonal ? "hormonal-cluster" : ""} ${extra}" ${cluster ? `data-cluster-id="${cluster.id}"` : ""}>${escapeHtml(content) || "<span aria-label=\"Not recorded\">-</span>"}</td>`;
  };
  timelineRoot.innerHTML = `
    <div class="timeline-table-wrap">
      <table class="timeline-table">
        <thead><tr><th scope="col">Measure</th>${dates.map((date) => `<th scope="col">${Number(date.slice(-2))}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(([label, key]) => `<tr><th scope="row">${label}</th>${dates.map((date) => cell(date, timelineValue(dayMap.get(date), key))).join("")}</tr>`).join("")}
          <tr class="marker-row"><th scope="row">Markers</th>${dates.map((date) => cell(date, timelineMarkers(dayMap.get(date)), hormoneFocus ? "hormone-focus" : "")).join("")}</tr>
        </tbody>
      </table>
    </div>
    <p class="timeline-marker-key"><b>PM</b> PMDD medication · <b>H</b> familiar hormonal pattern · <b>Cog</b> brain fog/head swimming · <b>App</b> cravings/appetite</p>`;
}

function effectiveHormonalLabel(cluster: CapacityCluster): string {
  return `Hormonal relevance: ${resolveHormonalRelevance(cluster)}`;
}

function renderEpisodes(): void {
  if (!clusterRoot) return;
  const start = `${selectedMonth}-01`;
  const end = monthDates(selectedMonth).at(-1)!;
  const clusters = allClusters().filter((cluster) => cluster.endDate >= start && cluster.startDate <= end);
  clusterRoot.innerHTML = clusters.length
    ? clusters
        .map((cluster) => {
          const isEpisode = cluster.kind === "episode";
          const relevance = resolveHormonalRelevance(cluster);
          const possibleHormonal = isEpisode && ["Yes", "Possible"].includes(relevance);
          const categoryRows = cluster.hormonalPattern.categories.map((category) => [category.label, `${category.days} day${category.days === 1 ? "" : "s"}`] as [string, string]);
          const contextRows = cluster.contextFactors.map((factor) => [factor.label, `${factor.days} day${factor.days === 1 ? "" : "s"}`] as [string, string]);
          const confidence = cluster.hormonalPattern.confidence === "moderate" ? "Moderate pattern confidence" : cluster.hormonalPattern.confidence === "low" ? "Low pattern confidence" : "Not enough repeated evidence";
          return `
            <article class="cluster-card ${cluster.kind} ${cluster.status} ${possibleHormonal ? "possible-hormonal" : ""}">
              <button class="cluster-summary" type="button" data-open-cluster="${cluster.id}" aria-expanded="false">
                <span><small>${isEpisode ? "Capacity Episode" : "Capacity Dip"}${possibleHormonal ? " · Possible hormonal pattern" : ""}</small><strong>${formatDate(cluster.startDate)} - ${formatDate(cluster.endDate)}</strong></span>
                <span>${cluster.duration} day${cluster.duration === 1 ? "" : "s"}</span>
              </button>
              <div class="cluster-detail" data-cluster-detail="${cluster.id}" hidden>
                <p class="episode-description">${isEpisode ? "A sustained period of reduced capacity. Cause is not assumed." : "One or two impaired days that do not meet the duration threshold for a Capacity Episode."}</p>
                ${detailList([
                  ["Start", formatDate(cluster.startDate)],
                  ["End", formatDate(cluster.endDate)],
                  ["Duration", `${cluster.duration} days`],
                  ["Significant-reduction days", String(cluster.significantDays)],
                  ["Reduced days", String(cluster.reducedDays)],
                  ["Lowest energy", formatValue(cluster.lowestEnergy, "/10")],
                  ["Lowest executive clarity", formatValue(cluster.lowestClarity, "/10")]
                ])}
                ${isEpisode ? `
                  <section class="episode-pattern">
                    <h4>Pattern classification</h4>
                    <strong>${effectiveHormonalLabel(cluster)}</strong>
                    <p>${possibleHormonal ? "A Capacity Episode containing a repeated pattern of hormonal and/or hormone-sensitive symptoms. This is a pattern flag, not a diagnosis." : "The episode does not currently meet the repeated multi-category evidence rule."}</p>
                    ${possibleHormonal ? `<p>${confidence}</p>` : ""}
                    ${categoryRows.length ? `<h5>Recorded evidence categories</h5>${detailList(categoryRows)}` : ""}
                  </section>
                  <section class="episode-context">
                    <h4>Context / possible contributors</h4>
                    ${contextRows.length ? detailList(contextRows) : "<p>No contextual contributors were clearly recorded.</p>"}
                    <p class="legend-note">These factors are shown for interpretation and do not determine the hormonal pattern label.</p>
                  </section>
                  <form class="cluster-decision-form" data-cluster-id="${cluster.id}">
                    <label>Start date<input name="startDate" type="date" value="${cluster.startDate}" /></label>
                    <label>End date<input name="endDate" type="date" value="${cluster.endDate}" /></label>
                    <div class="cluster-actions">
                      <button class="primary-button" type="submit" value="confirmed">Confirm episode / save dates</button>
                      <button class="secondary-button" type="submit" value="rejected">Reject episode</button>
                    </div>
                  </form>
                  <div class="hormonal-decision" data-hormonal-cluster-id="${cluster.id}">
                    <span>Hormonal pattern decision</span>
                    <div class="cluster-actions">
                      <button class="secondary-button" type="button" data-hormonal-decision="yes">Yes</button>
                      <button class="secondary-button" type="button" data-hormonal-decision="possible">Possible</button>
                      <button class="secondary-button" type="button" data-hormonal-decision="no">No</button>
                      <button class="secondary-button" type="button" data-hormonal-decision="not-reviewed">Not reviewed</button>
                    </div>
                  </div>` : ""}
              </div>
            </article>`;
        })
        .join("")
    : `<section class="plain-panel"><p>No Capacity Episodes or Capacity Dips are visible in this month. Three impaired days within a rolling four-day period are needed to start an episode.</p></section>`;
}

function renderMonth(): void {
  renderCalendar();
  renderTimeline();
  renderEpisodes();
  renderLegend();
  if (detailRoot) detailRoot.hidden = true;
}

function setStatus(message: string): void {
  if (statusRoot) statusRoot.textContent = message;
}

document.querySelector("#previous-month")?.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, -1);
  renderMonth();
});
document.querySelector("#next-month")?.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, 1);
  renderMonth();
});
document.querySelector("#current-month")?.addEventListener("click", () => {
  selectedMonth = monthKey(new Date().toISOString().slice(0, 10));
  renderMonth();
});
hormoneFocusControl?.addEventListener("change", () => {
  hormoneFocus = hormoneFocusControl.checked;
  renderMonth();
});
calendarRoot?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-date]");
  if (button?.dataset.date) showDayDetail(button.dataset.date);
});
detailRoot?.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("#close-day-detail")) detailRoot.hidden = true;
});
timelineRoot?.addEventListener("click", (event) => {
  const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cluster-id]");
  if (!cell?.dataset.clusterId) return;
  const button = clusterRoot?.querySelector<HTMLButtonElement>(`[data-open-cluster="${CSS.escape(cell.dataset.clusterId)}"]`);
  button?.click();
  button?.scrollIntoView({ behavior: "smooth", block: "center" });
});
clusterRoot?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-cluster]");
  if (!button?.dataset.openCluster) return;
  const detail = clusterRoot.querySelector<HTMLElement>(`[data-cluster-detail="${CSS.escape(button.dataset.openCluster)}"]`);
  if (!detail) return;
  detail.hidden = !detail.hidden;
  button.setAttribute("aria-expanded", String(!detail.hidden));
});
clusterRoot?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  const id = form.dataset.clusterId;
  if (!id || !submitter) return;
  const data = new FormData(form);
  const existingDecision = decisions.find((item) => item.id === id);
  const decision: ClusterDecision = {
    id,
    status: submitter.value === "rejected" ? "rejected" : "confirmed",
    startDate: String(data.get("startDate") || ""),
    endDate: String(data.get("endDate") || ""),
    updatedAt: new Date().toISOString(),
    hormonalDecision: existingDecision?.hormonalDecision
  };
  if (!decision.startDate || !decision.endDate || decision.startDate > decision.endDate) {
    setStatus("The cluster start date must be on or before its end date.");
    return;
  }
  await saveClusterDecision(decision);
  decisions = await getClusterDecisions();
  setStatus(decision.status === "confirmed" ? "Episode decision saved. The daily logs were not changed." : "Episode rejected. The daily logs were not changed.");
  renderMonth();
});
clusterRoot?.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-hormonal-decision]");
  const wrapper = button?.closest<HTMLElement>("[data-hormonal-cluster-id]");
  if (!button?.dataset.hormonalDecision || !wrapper?.dataset.hormonalClusterId) return;
  const cluster = allClusters().find((item) => item.id === wrapper.dataset.hormonalClusterId);
  if (!cluster || cluster.kind !== "episode") return;
  const existingDecision = decisions.find((item) => item.id === cluster.id);
  const decision: ClusterDecision = {
    id: cluster.id,
    status: existingDecision?.status ?? cluster.status,
    startDate: existingDecision?.startDate ?? cluster.startDate,
    endDate: existingDecision?.endDate ?? cluster.endDate,
    updatedAt: new Date().toISOString(),
    hormonalDecision: button.dataset.hormonalDecision as ClusterDecision["hormonalDecision"]
  };
  await saveClusterDecision(decision);
  decisions = await getClusterDecisions();
  setStatus("Hormonal pattern decision saved separately. The daily logs were not changed.");
  renderMonth();
});
document.querySelector("#export-timeline")?.addEventListener("click", () => {
  const monthDays = days.filter((day) => monthKey(day.date) === selectedMonth);
  const csv = buildTimelineCsv(monthDays, allClusters());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `capacity-timeline-${selectedMonth}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${monthDays.length} recorded day${monthDays.length === 1 ? "" : "s"} for ${selectedMonth}.`);
});
reportRangeControl?.addEventListener("change", () => {
  if (customReportRange) customReportRange.hidden = reportRangeControl.value !== "custom";
});
document.querySelector("#export-visual-report")?.addEventListener("click", () => {
  const range = reportRangeControl?.value ?? "month";
  const params = new URLSearchParams({ range, month: selectedMonth });
  if (range === "custom") {
    const start = reportStartDate?.value ?? "";
    const end = reportEndDate?.value ?? "";
    if (!start || !end || start > end) {
      setStatus("Choose a valid start and end date for the visual report.");
      return;
    }
    params.set("start", start);
    params.set("end", end);
  }
  window.location.href = `${base}timeline/report/?${params.toString()}`;
});

if (reportStartDate) reportStartDate.value = `${selectedMonth}-01`;
if (reportEndDate) reportEndDate.value = monthDates(selectedMonth).at(-1)!;

renderBaseline();
renderMonth();
if (requestedEpisode) {
  const button = clusterRoot?.querySelector<HTMLButtonElement>(`[data-open-cluster="${CSS.escape(requestedEpisode)}"]`);
  button?.click();
  button?.scrollIntoView({ behavior: "smooth", block: "center" });
}
