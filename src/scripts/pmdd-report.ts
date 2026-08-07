import { getAllEntries, getClusterDecisions } from "./db";
import { associatedEpisode, assessMedicationResponse, buildCapacityEvents, buildMedicationCourses, courseEndDate, featuresForEpisode, intervalRange, recurringPattern, relevantHormonalEpisodes } from "./review-model";
import { daysBetween, normalizeTimelineEntry, type RawDailyEntry } from "./timeline-model";

const root = document.querySelector<HTMLElement>("#gp-report");
const entries = await getAllEntries();
const days = entries.map((entry) => normalizeTimelineEntry(entry as unknown as RawDailyEntry)).sort((a, b) => a.date.localeCompare(b.date));
const decisions = await getClusterDecisions();
const episodes = relevantHormonalEpisodes(buildCapacityEvents(days, decisions));
const courses = buildMedicationCourses(days);

function formatDate(date: string, includeYear = true): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(includeYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function range(start: string, end: string): string {
  return `${formatDate(start, false)}-${formatDate(end)}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function status(): string {
  if (courses.at(-1) && !courses.at(-1)!.stopDate) return "Currently taking PMDD medication";
  const latest = days.at(-1)?.date;
  return latest && episodes.some((episode) => episode.endDate === latest) ? "Possible hormonal pattern developing" : "No current hormonal episode identified";
}

function bars(): string {
  const features = recurringPattern(episodes, days);
  return features.length ? `<div class="frequency-bars">${features.map((feature) => `<div class="frequency-row"><div><strong>${escapeHtml(feature.label)}</strong><small>${escapeHtml(feature.group)}</small></div><div class="frequency-track"><span style="width:${Math.round(feature.episodeCount / episodes.length * 100)}%"></span></div><b>${feature.episodeCount} of ${episodes.length} episodes</b></div>`).join("")}</div><p class="frequency-note">Counts show the number of reviewed episodes containing each feature, not individual symptom days. With only ${episodes.length} reviewed episode${episodes.length === 1 ? "" : "s"}, these patterns remain provisional.</p>` : "<p>Not enough reviewed episodes yet.</p>";
}

function episodeSummary(episode: (typeof episodes)[number]): string {
  const features = featuresForEpisode(episode, days).slice(0, 5);
  const linked = courses.filter((course) => associatedEpisode(course, episodes)?.id === episode.id);
  const subjective = decisions.find((item) => item.id === episode.id)?.medicationHelped;
  const subjectiveLabel = subjective === "yes" ? "Yes" : subjective === "partly" ? "Partly" : subjective === "no" ? "No" : subjective === "unsure" ? "Unsure" : "Not recorded";
  const response = linked.length ? assessMedicationResponse(linked[0], days) : null;
  return `<article class="report-card"><div class="report-card-heading"><div><span>Possible hormonal episode</span><h3>${range(episode.startDate, episode.endDate)}</h3></div><strong>${episode.duration} days</strong></div><div class="report-facts"><span>Lowest energy <b>${episode.lowestEnergy ?? "-"}</b></span><span>Lowest executive clarity <b>${episode.lowestClarity ?? "-"}</b></span></div><h4>Main symptom pattern</h4><ul class="compact-list">${features.map((feature) => `<li>${escapeHtml(feature.label)}</li>`).join("") || "<li>No clear repeated feature group</li>"}</ul><p><strong>Medication:</strong> ${linked.length ? linked.map((course) => range(course.startDate, courseEndDate(course))).join(", ") : "No associated medication course"}</p>${response ? `<p><strong>Medication response:</strong> ${escapeHtml(response.label)}. My view: ${subjectiveLabel}.<br><small>${escapeHtml(response.detail)}</small></p>` : ""}<p><strong>Recovery:</strong> Improvement ${episode.improvementDate ? `from approximately ${formatDate(episode.improvementDate)}` : "not clearly identified"}; return towards baseline ${episode.apparentReturnDate ? `approximately ${formatDate(episode.apparentReturnDate)}` : "not yet identified"}.</p></article>`;
}

function timeline(): string {
  if (!episodes.length) return "<p>No reviewed hormonal episodes yet.</p>";
  return `<div class="report-episode-timeline">${episodes.map((episode, index) => {
    const linked = courses.filter((course) => associatedEpisode(course, episodes)?.id === episode.id);
    return `<div class="report-timeline-row"><span class="timeline-index">${index + 1}</span><div><strong>${range(episode.startDate, episode.endDate)}</strong><small>${episode.duration} days</small><span class="episode-line"></span>${linked.map((course) => `<small>Medication ${range(course.startDate, courseEndDate(course))} (approximately Day ${daysBetween(episode.startDate, course.startDate) + 1})</small>`).join("")}${episode.improvementDate ? `<small>Improvement from ${formatDate(episode.improvementDate)}</small>` : ""}${episode.apparentReturnDate ? `<small>Return towards baseline ${formatDate(episode.apparentReturnDate)}</small>` : ""}</div></div>`;
  }).join("")}</div>`;
}

if (root) root.innerHTML = `<header class="report-header"><p class="eyebrow">Personal Operating System</p><h1>PMDD / Hormonal Pattern Review</h1><p>Generated ${formatDate(new Date().toISOString().slice(0, 10))}</p></header><section><h2>Working hypothesis</h2><p>Recurring hormonally related symptoms are being investigated alongside intermittent PMDD medication trials. PMDD remains a working hypothesis and is not yet established.</p></section><section><h2>Overview</h2><div class="report-overview"><span><small>Possible hormonal episodes</small><strong>${episodes.length}</strong></span><span><small>PMDD medication courses</small><strong>${courses.length}</strong></span><span><small>Provisional interval</small><strong>${intervalRange(episodes) ?? "Not enough data"}</strong></span><span><small>Current status</small><strong>${status()}</strong></span></div></section><section><h2>Recurring hormonal pattern</h2>${bars()}</section><section><h2>Episode timeline</h2>${timeline()}</section><section><h2>Episode summaries and medication response</h2><div class="report-card-list">${episodes.map(episodeSummary).join("") || "<p>No relevant episodes to summarise.</p>"}</div><p class="report-method-note">Medication response compares recorded capacity, energy and executive clarity during the three days before each start with the following five days. An improvement following medication is an observed sequence, not proof that medication caused it.</p></section><footer><p>The wider Capacity Timeline records all periods of reduced capacity, including those that may have other causes. This PMDD Review focuses on patterns considered potentially hormonally related.</p><p><strong>Personal longitudinal tracking data. This report does not establish a diagnosis.</strong></p></footer>`;

document.querySelector("#print-report")?.addEventListener("click", () => window.print());
