import { getAllEntries, getClusterDecisions, saveClusterDecision } from "./db";
import {
  associatedEpisode,
  buildCapacityEvents,
  buildMedicationCourses,
  courseEndDate,
  episodeDays,
  featuresForEpisode,
  hormonalRelevanceLabel,
  intervalRange,
  recurringPattern,
  relevantHormonalEpisodes
} from "./review-model";
import { daysBetween, normalizeTimelineEntry, type CapacityCluster, type ClusterDecision, type RawDailyEntry } from "./timeline-model";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const summaryRoot = document.querySelector<HTMLDivElement>("#pmdd-summary");
const patternRoot = document.querySelector<HTMLDivElement>("#pmdd-pattern");
const episodesRoot = document.querySelector<HTMLDivElement>("#pmdd-episodes");
const periodsRoot = document.querySelector<HTMLDivElement>("#pmdd-periods");
const copyButton = document.querySelector<HTMLButtonElement>("#copy-pmdd-summary");
const copyStatus = document.querySelector<HTMLParagraphElement>("#pmdd-copy-status");

const rawEntries = await getAllEntries();
const days = rawEntries.map((entry) => normalizeTimelineEntry(entry as unknown as RawDailyEntry)).sort((a, b) => a.date.localeCompare(b.date));
let decisions = await getClusterDecisions();

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(parseDate(date));
}

function formatRange(start: string, end: string): string {
  return `${formatDate(start, false)}-${formatDate(end)}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function stat(label: string, value: string | number, note = ""): string {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</article>`;
}

function currentStatus(episodes: CapacityCluster[], courses: ReturnType<typeof buildMedicationCourses>): string {
  if (courses.at(-1) && !courses.at(-1)!.stopDate) return "Currently taking PMDD medication";
  const latestDate = days.at(-1)?.date;
  if (latestDate && episodes.some((episode) => episode.endDate === latestDate)) return "Possible hormonal pattern developing";
  return "No current hormonal episode identified";
}

function renderPattern(episodes: CapacityCluster[]): void {
  if (!patternRoot) return;
  const features = recurringPattern(episodes, days);
  patternRoot.innerHTML = features.length
    ? `<div class="frequency-bars">${features.map((feature) => {
        const percent = Math.round((feature.episodeCount / episodes.length) * 100);
        return `<div class="frequency-row"><div><strong>${escapeHtml(feature.label)}</strong><small>${escapeHtml(feature.group)}</small></div><div class="frequency-track" aria-label="${feature.episodeCount} of ${episodes.length} episodes"><span style="width:${percent}%"></span></div><b>${feature.episodeCount}/${episodes.length}</b></div>`;
      }).join("")}</div>`
    : `<p class="empty-state">Not enough reviewed hormonal episodes yet to identify a recurring pattern.</p>`;
}

function rawEpisodeDetail(episode: CapacityCluster): string {
  return episodeDays(episode, days).map((day) => {
    const signs = day.hormonalSigns.filter((sign) => sign !== "No noticeable signs");
    const details = [signs.join(", "), ...day.notes].filter(Boolean).join(" | ");
    return `<li><strong>${formatDate(day.date)}</strong><span>${escapeHtml(day.capacityState ?? "Capacity state unclear")}${details ? ` - ${escapeHtml(details)}` : ""}</span></li>`;
  }).join("");
}

function renderEpisodes(episodes: CapacityCluster[], courses: ReturnType<typeof buildMedicationCourses>): void {
  if (!episodesRoot) return;
  episodesRoot.innerHTML = episodes.length
    ? [...episodes].reverse().map((episode) => {
        const features = featuresForEpisode(episode, days).slice(0, 5);
        const linkedCourses = courses.filter((course) => associatedEpisode(course, episodes)?.id === episode.id);
        const medication = linkedCourses.length ? linkedCourses.map((course) => formatRange(course.startDate, courseEndDate(course))).join(", ") : "No associated course";
        return `<article class="pmdd-episode-card" id="episode-${encodeURIComponent(episode.id)}">
          <div class="pmdd-period-heading"><div><span class="pattern-kicker">${hormonalRelevanceLabel(episode)} hormonal relevance</span><h3>${formatRange(episode.startDate, episode.endDate)}</h3></div><span class="pmdd-status current">${episode.duration} days</span></div>
          <div class="episode-key-facts"><span><small>Lowest energy</small><strong>${episode.lowestEnergy ?? "-"}</strong></span><span><small>Lowest executive clarity</small><strong>${episode.lowestClarity ?? "-"}</strong></span></div>
          <div><h4>Main pattern</h4>${features.length ? `<ul class="compact-list">${features.map((feature) => `<li>${escapeHtml(feature.label)}</li>`).join("")}</ul>` : "<p>No repeated feature group was clear.</p>"}</div>
          <div class="episode-recovery"><p><strong>PMDD medication</strong><br>${escapeHtml(medication)}</p><p><strong>Recovery</strong><br>Improvement ${episode.improvementDate ? `from approximately ${formatDate(episode.improvementDate)}` : "not clearly identified"}<br>Return towards baseline ${episode.apparentReturnDate ? `approximately ${formatDate(episode.apparentReturnDate)}` : "not yet identified"}</p></div>
          <div class="episode-card-actions"><button type="button" class="secondary-button" data-toggle-episode="${episode.id}">View episode detail</button><a class="secondary-button" href="${base}timeline/?month=${episode.startDate.slice(0, 7)}&episode=${encodeURIComponent(episode.id)}">Open in Capacity Timeline</a><button type="button" class="secondary-button" data-toggle-relevance="${episode.id}">Change hormonal relevance</button></div>
          <div class="episode-raw-detail" data-episode-detail="${episode.id}" hidden><h4>Recorded day-by-day detail</h4><ol>${rawEpisodeDetail(episode)}</ol></div>
          <div class="episode-relevance-controls" data-relevance-controls="${episode.id}" hidden><strong>Hormonal relevance</strong><div class="cluster-actions"><button type="button" data-set-relevance="yes">Yes</button><button type="button" data-set-relevance="possible">Possible</button><button type="button" data-set-relevance="no">No</button><button type="button" data-set-relevance="not-reviewed">Not reviewed</button></div></div>
        </article>`;
      }).join("")
    : `<section class="plain-panel"><p>No Capacity Episodes are currently marked Yes or Possible for hormonal relevance. Episodes can be reviewed in the Capacity Timeline.</p><a class="secondary-button" href="${base}timeline/">Open Capacity Timeline</a></section>`;
}

function renderCourses(courses: ReturnType<typeof buildMedicationCourses>, episodes: CapacityCluster[]): void {
  if (!periodsRoot) return;
  periodsRoot.innerHTML = courses.length
    ? [...courses].reverse().map((course, reverseIndex) => {
        const number = courses.length - reverseIndex;
        const episode = associatedEpisode(course, episodes);
        const episodeDay = episode ? daysBetween(episode.startDate, course.startDate) + 1 : null;
        return `<article class="pmdd-period-card"><div class="pmdd-period-heading"><div><span class="pattern-kicker">Course ${number}</span><h3>${formatRange(course.startDate, courseEndDate(course))}</h3></div><span class="pmdd-status ${course.stopDate ? "complete" : "current"}">${course.stopDate ? "Completed" : "Current"}</span></div>
          <div class="pmdd-period-facts"><span><strong>${course.medicationDates.length}</strong> recorded medication day${course.medicationDates.length === 1 ? "" : "s"}</span></div>
          <p><strong>Associated episode:</strong> ${episode ? formatRange(episode.startDate, episode.endDate) : "None identified"}</p>
          ${episodeDay !== null ? `<p>Medication started approximately Day ${episodeDay}.</p><a class="secondary-button" href="#episode-${encodeURIComponent(episode!.id)}">View associated episode</a>` : ""}
        </article>`;
      }).join("")
    : `<section class="plain-panel"><p>No PMDD medication courses are recorded yet.</p></section>`;
}

function render(): void {
  const events = buildCapacityEvents(days, decisions);
  const episodes = relevantHormonalEpisodes(events);
  const courses = buildMedicationCourses(days);
  const interval = intervalRange(episodes);
  if (summaryRoot) summaryRoot.innerHTML = [stat("Possible hormonal episodes", episodes.length), stat("PMDD medication courses", courses.length), stat("Typical interval", interval ?? "Not enough yet", interval ? "provisional" : ""), stat("Current status", currentStatus(episodes, courses))].join("");
  renderPattern(episodes);
  renderEpisodes(episodes, courses);
  renderCourses(courses, episodes);
}

function buildCopyText(): string {
  const episodes = relevantHormonalEpisodes(buildCapacityEvents(days, decisions));
  const courses = buildMedicationCourses(days);
  const features = recurringPattern(episodes, days);
  return ["PMDD / Hormonal Pattern Review", `Generated: ${formatDate(new Date().toISOString().slice(0, 10))}`, "", "PMDD remains a working hypothesis.", `Possible hormonal episodes: ${episodes.length}`, `PMDD medication courses: ${courses.length}`, `Provisional interval: ${intervalRange(episodes) ?? "not enough data"}`, "", "Recurring pattern", ...(features.length ? features.map((feature) => `- ${feature.label}: ${feature.episodeCount}/${episodes.length}`) : ["- Not enough reviewed episodes yet"]), "", "Personal longitudinal tracking data. This summary does not establish a diagnosis."].join("\n");
}

episodesRoot?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const detailButton = target.closest<HTMLButtonElement>("[data-toggle-episode]");
  if (detailButton?.dataset.toggleEpisode) {
    const detail = episodesRoot.querySelector<HTMLElement>(`[data-episode-detail="${CSS.escape(detailButton.dataset.toggleEpisode)}"]`);
    if (detail) detail.hidden = !detail.hidden;
    return;
  }
  const relevanceButton = target.closest<HTMLButtonElement>("[data-toggle-relevance]");
  if (relevanceButton?.dataset.toggleRelevance) {
    const controls = episodesRoot.querySelector<HTMLElement>(`[data-relevance-controls="${CSS.escape(relevanceButton.dataset.toggleRelevance)}"]`);
    if (controls) controls.hidden = !controls.hidden;
    return;
  }
  const setButton = target.closest<HTMLButtonElement>("[data-set-relevance]");
  const controls = setButton?.closest<HTMLElement>("[data-relevance-controls]");
  if (!setButton?.dataset.setRelevance || !controls?.dataset.relevanceControls) return;
  const episode = buildCapacityEvents(days, decisions).find((item) => item.id === controls.dataset.relevanceControls);
  if (!episode) return;
  const existing = decisions.find((decision) => decision.id === episode.id);
  const decision: ClusterDecision = { id: episode.id, status: existing?.status ?? episode.status, startDate: existing?.startDate ?? episode.startDate, endDate: existing?.endDate ?? episode.endDate, updatedAt: new Date().toISOString(), hormonalDecision: setButton.dataset.setRelevance as ClusterDecision["hormonalDecision"] };
  await saveClusterDecision(decision);
  decisions = await getClusterDecisions();
  render();
});

copyButton?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(buildCopyText()); if (copyStatus) copyStatus.textContent = "PMDD summary copied."; }
  catch { if (copyStatus) copyStatus.textContent = "Copy did not complete. Please try again from the installed app or browser."; }
});

render();
