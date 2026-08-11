import { buildCrashDriverAnalysis, buildWhoopCapacityComparison } from "./analytics";
import {
  analyseDepressivePattern,
  analyseMeCfsPattern,
  analyseTemporalPattern,
  buildPostExertionalCandidates,
  buildSymptomLightIntervals,
  formatBaselineInterval
} from "./clinical-model";
import { getAllEntries, getClusterDecisions, getPostExertionalResponses, savePostExertionalResponse, type PostExertionalResponse } from "./db";
import { buildCapacityEvents, intervalRange } from "./review-model";
import { normalizeTimelineEntry, resolveHormonalRelevance, type RawDailyEntry } from "./timeline-model";

const overviewRoot = document.querySelector<HTMLElement>("#clinical-overview");
const depressionRoot = document.querySelector<HTMLElement>("#depression-pattern");
const meRoot = document.querySelector<HTMLElement>("#mecfs-pattern");
const followupRoot = document.querySelector<HTMLElement>("#post-exertional-followups");
const contributorsRoot = document.querySelector<HTMLElement>("#other-contributors");
const hormonalRoot = document.querySelector<HTMLElement>("#hormonal-comparison");
const copyStatus = document.querySelector<HTMLElement>("#clinical-copy-status");

const rawEntries = await getAllEntries();
const days = rawEntries
  .map((entry) => normalizeTimelineEntry(entry as unknown as RawDailyEntry))
  .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
  .sort((a, b) => a.date.localeCompare(b.date));
const decisions = await getClusterDecisions();
const events = buildCapacityEvents(days, decisions).filter((event) => event.status !== "rejected" && event.kind === "episode");
let responses = await getPostExertionalResponses();

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function stat(label: string, value: string | number, detail = ""): string {
  return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</article>`;
}

function evidenceRow(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function missingList(items: string[]): string {
  return items.length ? `<ul class="compact-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>No material missing fields identified for the recorded period.</p>`;
}

function renderPatterns(): void {
  const depression = analyseDepressivePattern(days);
  const me = analyseMeCfsPattern(days, responses);
  const temporal = analyseTemporalPattern(days, events);
  const hormonal = events.filter((event) => ["Yes", "Possible"].includes(resolveHormonalRelevance(event)));

  if (overviewRoot) overviewRoot.innerHTML = [
    stat("Tracked days", temporal.trackedDays, `${temporal.calendarSpanDays} calendar-day span`),
    stat("Temporal pattern", temporal.state),
    stat("Capacity episodes", temporal.episodes),
    stat("Baseline intervals", temporal.baselineIntervals.length, "2 or more consecutive Baseline days")
  ].join("");

  if (depressionRoot) depressionRoot.innerHTML = `
    <header><p class="pattern-kicker">Depressive pattern</p><h3>${escapeHtml(depression.status)}</h3><p>The tracker uses directly recorded mood and enjoyment as core evidence. Fatigue, sleep and cognition remain supporting evidence only.</p></header>
    <dl class="clinical-evidence-list">
      ${evidenceRow("Direct low or flat mood", `${depression.directLowMoodDays} of ${depression.moodRecorded} days with usable mood data`)}
      ${evidenceRow("Enjoyment or connection unavailable", `${depression.reducedInterestDays} of ${depression.interestRecorded} days with a direct answer`)}
      ${evidenceRow("Neutral, good or positive mood on waking during reduced capacity", `${depression.neutralOrPositiveWakingMoodOnReducedDays} of ${depression.reducedCapacityWakingMoodRecorded} answered reduced-capacity days`)}
      ${evidenceRow("Longest continuous core-symptom run", `${depression.longestCoreRun} day${depression.longestCoreRun === 1 ? "" : "s"}`)}
      ${evidenceRow("Strongest 14-day window", depression.strongestWindow ? `${depression.strongestWindow.coreDays} core-symptom days among ${depression.strongestWindow.recordedDays} recorded days, ${formatDate(depression.strongestWindow.startDate)}-${formatDate(depression.strongestWindow.endDate)}` : "Not enough data")}
      ${evidenceRow("Substantial functional impact", `${depression.substantialImpactDays} of ${depression.capacityImpactRecorded} days with an impact answer`)}
    </dl>
    <section><h4>Evidence against a continuously persistent pattern</h4>
      <p>Among ${depression.reducedCapacityInterestRecorded} reduced-capacity days with a direct enjoyment or connection answer, it remained available on ${depression.interestAvailableOnReducedDays}, was partly available on ${depression.interestPartlyAvailableOnReducedDays}, and was unavailable on ${depression.interestUnavailableOnReducedDays}.</p>
      <p>${depression.baselineIntervals.length} baseline interval${depression.baselineIntervals.length === 1 ? " was" : "s were"} recorded: ${depression.baselineIntervals.length ? depression.baselineIntervals.map((interval) => `${formatDate(interval.startDate)}-${formatDate(interval.endDate)} (${interval.days} days)`).join("; ") : "none identified"}.</p>
    </section>
    <section><h4>Missing evidence</h4>${missingList(depression.missingEvidence)}</section>`;

  if (meRoot) meRoot.innerHTML = `
    <header><p class="pattern-kicker">ME/CFS pattern</p><h3>${escapeHtml(me.status)}</h3><p>Generic tiredness does not count as an ME/CFS pattern. The characteristic domains and functional reduction are kept separate.</p></header>
    <dl class="clinical-evidence-list">
      ${evidenceRow("Low usable energy", `${me.fatigueDays} of ${me.energyRecorded} days with energy recorded`)}
      ${evidenceRow("Unrefreshing sleep despite 6+ hours or unknown duration", `${me.unrefreshingSleepDays} of ${me.restorationRecorded} days with restoration recorded`)}
      ${evidenceRow("Lower executive clarity / cognitive signs", `${me.cognitiveDifficultyDays} of ${me.clarityRecorded} days with clarity recorded`)}
      ${evidenceRow("Substantial functional reduction", `${me.substantialImpactDays} of ${me.capacityImpactRecorded} days with an impact answer`)}
      ${evidenceRow("Post-exertional responses", `${me.pemSupportingResponses} supportive, ${me.pemExplicitNoResponses} explicitly not supportive, ${me.pemResponsesRecorded} total recorded`)}
      ${evidenceRow("Continuous complete-pattern duration", me.continuousPatternDays ? `${me.continuousPatternDays} days` : "No continuous clock started")}
    </dl>
    ${me.continuousPatternDays >= 90 ? `<p class="clinical-threshold-note"><strong>Three-month duration threshold reached.</strong> The complete recorded pattern has reached a duration relevant to NICE diagnostic assessment. This does not diagnose ME/CFS.</p>` : ""}
    <section><h4>Recovery evidence</h4><p>${me.baselineIntervals.length} interval${me.baselineIntervals.length === 1 ? "" : "s"} of at least 2 consecutive Baseline days ${me.baselineIntervals.length === 1 ? "was" : "were"} recorded.</p></section>
    <section><h4>Missing evidence</h4>${missingList(me.missingEvidence)}</section>`;

  if (hormonalRoot) {
    const hormonalDateSet = new Set(days.filter((day) => hormonal.some((episode) => day.date >= episode.startDate && day.date <= episode.endDate)).map((day) => day.date));
    const within = days.filter((day) => hormonalDateSet.has(day.date));
    const outside = days.filter((day) => !hormonalDateSet.has(day.date));
    const headDays = within.filter((day) => day.flags.headSwimming);
    const withAppetite = headDays.filter((day) => day.flags.cravings || day.flags.increasedAppetite).length;
    const withBloating = headDays.filter((day) => day.flags.bloating).length;
    const withSensitivity = headDays.filter((day) => day.flags.sensitivity).length;
    const insideAmfexa = within.filter((day) => Boolean(day.amfexaEffect));
    const outsideAmfexa = outside.filter((day) => Boolean(day.amfexaEffect));
    const insideWeak = insideAmfexa.filter((day) => day.amfexaEffect === "Too weak").length;
    const outsideWeak = outsideAmfexa.filter((day) => day.amfexaEffect === "Too weak").length;
    const symptomLight = buildSymptomLightIntervals(days);
    const treated = hormonal.filter((episode) => episode.pmddMedicationDates.length > 0);
    const untreated = hormonal.filter((episode) => episode.pmddMedicationDates.length === 0);
    const average = (values: number[]) => values.length ? (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1) : "Not enough data";
    const treatedEnergy = treated.map((episode) => episode.lowestEnergy).filter((value): value is number => value !== null);
    const untreatedEnergy = untreated.map((episode) => episode.lowestEnergy).filter((value): value is number => value !== null);
    hormonalRoot.innerHTML = `<p>${hormonal.length} of ${events.length} Capacity Episodes ${hormonal.length === 1 ? "is" : "are"} currently marked Yes or Possible for hormonal relevance.</p>
      <dl class="clinical-evidence-list">
        ${evidenceRow("Interval between relevant episode starts", intervalRange(hormonal) ?? "Fewer than 2 relevant episodes")}
        ${evidenceRow("Head-swimming within relevant episodes", `${headDays.length} days; appetite/cravings also present on ${withAppetite}, bloating on ${withBloating}, sensitivity on ${withSensitivity}`)}
        ${evidenceRow("Explicitly symptom-light intervals", `${symptomLight.length}: ${symptomLight.length ? symptomLight.map((interval) => `${formatDate(interval.startDate)}-${formatDate(interval.endDate)} (${interval.days} days)`).join("; ") : "none identified"}`)}
        ${evidenceRow("Amfexa felt too weak inside relevant episodes", `${insideWeak} of ${insideAmfexa.length} days with an effect answer`)}
        ${evidenceRow("Amfexa felt too weak outside relevant episodes", `${outsideWeak} of ${outsideAmfexa.length} days with an effect answer`)}
        ${evidenceRow("Episodes with PMDD medication", `${treated.length}; average duration ${average(treated.map((episode) => episode.duration))} days; average lowest energy ${average(treatedEnergy)}`)}
        ${evidenceRow("Episodes without PMDD medication", `${untreated.length}; average duration ${average(untreated.map((episode) => episode.duration))} days; average lowest energy ${average(untreatedEnergy)}`)}
      </dl>
      <p class="frequency-note">Symptom-light requires directly recorded Baseline capacity, mostly okay/stable mood, available enjoyment or connection, and no directly recorded hormonal pattern. Medication comparisons describe timing and cannot show that medication caused a difference.</p>`;
  }
}

function responseSummary(response: PostExertionalResponse): string {
  return `${response.worseningTiming || "timing not answered"}; disproportionate: ${response.disproportionate || "not answered"}; recovery: ${response.recoveryDuration || "not answered"}`;
}

function renderFollowups(): void {
  if (!followupRoot) return;
  const candidates = buildPostExertionalCandidates(days, responses);
  const pending = candidates.map((candidate) => `<form class="post-exertional-card" data-exposure-date="${candidate.exposureDate}">
    <header><div><span class="pattern-kicker">Activity on ${formatDate(candidate.exposureDate)}</span><h4>Check the response after this activity</h4></div></header>
    <p>${escapeHtml(candidate.reasons.join(", "))}${candidate.laterReductionDate ? `; reduced capacity was then recorded on ${formatDate(candidate.laterReductionDate)}` : ""}.</p>
    <label class="field-label">Did symptoms become noticeably worse after the activity?<select name="worseningTiming" required><option value="">Not answered</option><option>No</option><option>Immediately</option><option>Several hours later</option><option>The following day</option><option>Unsure</option></select></label>
    <label class="field-label">Was the reaction disproportionate to what I did?<select name="disproportionate" required><option value="">Not answered</option><option>No</option><option>Possibly</option><option>Yes</option><option>Unsure</option></select></label>
    <label class="field-label">How long did it take to return to the previous baseline?<select name="recoveryDuration" required><option value="">Not answered</option><option>Less than a few hours</option><option>Same day</option><option>1 day</option><option>2-3 days</option><option>4+ days</option><option>Not recovered yet</option></select></label>
    <label class="field-label">Anything useful to record?<textarea name="notes" rows="2"></textarea></label>
    <button class="primary-button" type="submit">Save response</button>
  </form>`).join("");
  const recorded = responses.length ? `<div class="recorded-response-list"><h4>Recorded responses</h4>${[...responses].reverse().map((response) => `<article><strong>${formatDate(response.exposureDate)}</strong><span>${escapeHtml(responseSummary(response))}</span></article>`).join("")}</div>` : "";
  followupRoot.innerHTML = pending || recorded ? `${pending}${recorded}` : `<p>No post-exertional follow-up has been triggered from the recorded data yet.</p>`;
}

function renderContributors(): void {
  if (!contributorsRoot) return;
  const analysis = buildCrashDriverAnalysis(rawEntries);
  const whoop = buildWhoopCapacityComparison(rawEntries);
  contributorsRoot.innerHTML = `<div class="section-title"><div><p class="eyebrow">Not a differential diagnosis</p><h3>Other tracked contributors</h3><p>These compare crash-pattern days with other recorded energy-pattern days. They show associations, not causes or exclusions.</p></div></div>
    ${analysis.drivers.length ? `<div class="crash-driver-list">${analysis.drivers.map((driver) => `<div><strong>${escapeHtml(driver.label)}</strong><span>${driver.crashDays} of ${analysis.crashDays} crash-pattern days</span><small>${Math.round(driver.comparisonRate * analysis.comparisonDays)} of ${analysis.comparisonDays} comparison days</small></div>`).join("")}</div>` : `<p>At least 3 crash-pattern days and 3 comparison days are needed before contributors are shown.</p>`}
    <p class="frequency-note">${escapeHtml(analysis.coffeeDetail)}</p>
    <div class="whoop-comparison"><h4>WHOOP Recovery and subjective capacity</h4><p>${escapeHtml(whoop.status)}</p><p>High WHOOP Recovery with low subjective capacity: ${whoop.highWhoopReducedCapacityDays} of ${whoop.pairedDays} paired days. Low WHOOP Recovery with high subjective capacity: ${whoop.lowWhoopBaselineDays} of ${whoop.pairedDays} paired days.</p><small>Broad bands are used only as a readable comparison. This does not establish statistical independence.</small></div>`;
}

function buildExactSummary(): string {
  const depression = analyseDepressivePattern(days);
  const me = analyseMeCfsPattern(days, responses);
  const temporal = analyseTemporalPattern(days, events);
  const hormonal = events.filter((event) => ["Yes", "Possible"].includes(resolveHormonalRelevance(event)));
  const whoop = buildWhoopCapacityComparison(rawEntries);
  const symptomLight = buildSymptomLightIntervals(days);
  return [
    "Clinical Pattern Evidence",
    `Generated: ${formatDate(new Date().toISOString().slice(0, 10))}`,
    "",
    `Tracked period: ${temporal.trackedDays} days across ${temporal.calendarSpanDays} calendar days.`,
    `Temporal pattern: ${temporal.state}. ${temporal.description}`,
    `Baseline intervals: ${temporal.baselineIntervals.length}${temporal.baselineIntervals.length ? ` (${temporal.baselineIntervals.map(formatBaselineInterval).join("; ")})` : ""}.`,
    "",
    `Depressive pattern: ${depression.status}.`,
    `Direct low or flat mood: ${depression.directLowMoodDays} of ${depression.moodRecorded} days with usable mood data.`,
    `Enjoyment or connection unavailable: ${depression.reducedInterestDays} of ${depression.interestRecorded} days with a direct answer.`,
    `Neutral, good or positive waking mood during reduced capacity: ${depression.neutralOrPositiveWakingMoodOnReducedDays} of ${depression.reducedCapacityWakingMoodRecorded} answered reduced-capacity days.`,
    `Longest continuous core-symptom run: ${depression.longestCoreRun} days.`,
    `Reduced-capacity enjoyment/connection: available ${depression.interestAvailableOnReducedDays}, partly available ${depression.interestPartlyAvailableOnReducedDays}, unavailable ${depression.interestUnavailableOnReducedDays}, among ${depression.reducedCapacityInterestRecorded} answered reduced-capacity days.`,
    `Substantial functional impact: ${depression.substantialImpactDays} of ${depression.capacityImpactRecorded} days with an impact answer.`,
    "",
    `ME/CFS pattern: ${me.status}.`,
    `Low usable energy: ${me.fatigueDays} of ${me.energyRecorded} days with energy recorded.`,
    `Unrefreshing sleep: ${me.unrefreshingSleepDays} of ${me.restorationRecorded} days with restoration recorded.`,
    `Cognitive difficulty: ${me.cognitiveDifficultyDays} of ${me.clarityRecorded} days with clarity recorded.`,
    `Substantial functional reduction: ${me.substantialImpactDays} of ${me.capacityImpactRecorded} days with an impact answer.`,
    `Post-exertional responses: ${me.pemSupportingResponses} supportive, ${me.pemExplicitNoResponses} explicitly not supportive, ${me.pemResponsesRecorded} total.`,
    `Continuous complete-pattern duration: ${me.continuousPatternDays} days.`,
    ...(me.continuousPatternDays >= 90 ? ["The complete recorded pattern has reached 3 months. This duration is relevant to clinical assessment but does not establish a diagnosis."] : []),
    "",
    `Hormonal comparison: ${hormonal.length} of ${events.length} Capacity Episodes are marked Yes or Possible for hormonal relevance.`,
    `Explicitly symptom-light intervals: ${symptomLight.length}${symptomLight.length ? ` (${symptomLight.map(formatBaselineInterval).join("; ")})` : ""}.`,
    `WHOOP comparison: ${whoop.status} High-WHOOP/low-capacity days: ${whoop.highWhoopReducedCapacityDays} of ${whoop.pairedDays}; low-WHOOP/high-capacity days: ${whoop.lowWhoopBaselineDays} of ${whoop.pairedDays}.`,
    "",
    "These summaries organise recorded observations. They do not diagnose or exclude depression, ME/CFS, PMDD or another condition."
  ].join("\n");
}

followupRoot?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = (event.target as HTMLElement).closest<HTMLFormElement>("form[data-exposure-date]");
  if (!form?.dataset.exposureDate) return;
  const data = new FormData(form);
  await savePostExertionalResponse({
    exposureDate: form.dataset.exposureDate,
    worseningTiming: String(data.get("worseningTiming") || "") as PostExertionalResponse["worseningTiming"],
    disproportionate: String(data.get("disproportionate") || "") as PostExertionalResponse["disproportionate"],
    recoveryDuration: String(data.get("recoveryDuration") || "") as PostExertionalResponse["recoveryDuration"],
    notes: String(data.get("notes") || ""),
    updatedAt: new Date().toISOString()
  });
  responses = await getPostExertionalResponses();
  renderPatterns();
  renderFollowups();
});

document.querySelector<HTMLButtonElement>("#copy-clinical-summary")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildExactSummary());
    if (copyStatus) copyStatus.textContent = "Exact clinical-pattern summary copied.";
  } catch {
    if (copyStatus) copyStatus.textContent = "Copy did not complete. Please try again from the installed app or browser.";
  }
});

renderPatterns();
renderFollowups();
renderContributors();
