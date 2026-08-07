import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClusterDecision,
  buildBaselineProfile,
  buildTimelineCsv,
  classifyHormonalPattern,
  detectCapacityClusters,
  extractContextFactors,
  latestMonthWithData,
  monthDates,
  normalizeTimelineEntry,
  resolveHormonalRelevance,
  shiftMonth,
  type ClusterDecision,
  type RawDailyEntry
} from "../src/scripts/timeline-model.ts";
import { assessMedicationResponse, associatedEpisode, buildMedicationCourses, buildMoodCapacityPattern, intervalRange, recurringPattern } from "../src/scripts/review-model.ts";

function entry(date: string, values: RawDailyEntry = {}) {
  return normalizeTimelineEntry({ date, ...values });
}

test("normalises current and historical field names without changing the source", () => {
  const historical: RawDailyEntry = {
    date: "2026-07-21",
    usableEnergy: "4",
    brainClarityScore: "3",
    nervousSystemState: ["Shutdown/heavy"],
    physiologicalActivationScore: 7,
    amfexaNotes: "Medication felt less effective",
    hormonalSigns: [],
    cycleSigns: ["Bloating", "Cravings"]
  };
  const before = JSON.stringify(historical);
  const normalised = normalizeTimelineEntry(historical);

  assert.equal(normalised.energy, 4);
  assert.equal(normalised.clarity, 3);
  assert.equal(normalised.overallState, "Shutdown/heavy");
  assert.equal(normalised.flags.activation, true);
  assert.equal(normalised.flags.reducedMedicationEffect, true);
  assert.deepEqual(normalised.hormonalSigns, ["Bloating", "Cravings"]);
  assert.equal(JSON.stringify(historical), before);
});

test("does not classify a blank entry as Baseline", () => {
  const day = entry("2026-08-01");
  assert.equal(day.capacityState, null);
});

test("scores significant, reduced, slightly reduced and baseline days transparently", () => {
  assert.equal(entry("2026-08-01", { energyScore: 3, clarityScore: 7 }).capacityState, "Significant reduction");
  assert.equal(entry("2026-08-02", { energyScore: 5, clarityScore: 5 }).capacityState, "Reduced");
  assert.equal(entry("2026-08-03", { energyScore: 6, clarityScore: 8 }).capacityState, "Slightly reduced");
  assert.equal(entry("2026-08-04", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }).capacityState, "Baseline");
});

test("recognises severe cognitive descriptions", () => {
  const day = entry("2026-07-22", { energyScore: 7, clarityScore: 7, clarityNotes: "My head was swimming and I felt mildly intoxicated." });
  assert.equal(day.capacityState, "Significant reduction");
  assert.equal(day.flags.headSwimming, true);
});

test("blank calendar dates remain distinct from recorded dates", () => {
  const dates = monthDates("2026-02");
  assert.equal(dates.length, 28);
  assert.equal(dates[0], "2026-02-01");
  assert.equal(dates.at(-1), "2026-02-28");
  const entries = new Map([["2026-02-02", entry("2026-02-02", { energyScore: 8, clarityScore: 8 })]]);
  assert.equal(entries.has("2026-02-01"), false);
});

test("starts an episode after three impaired days in a rolling four-day period", () => {
  const days = [
    entry("2026-07-21", { energyScore: 4, clarityScore: 3, clarityNotes: "Wading through treacle", hormonalSigns: ["Cravings"] }),
    entry("2026-07-22", { energyScore: 4, clarityScore: 3, clarityNotes: "Head swimming", pmddMedicationTaken: "Yes" }),
    entry("2026-07-23", { energyScore: 6, clarityScore: 6 }),
    entry("2026-07-24", { energyScore: 5, clarityScore: 4, hormonalSigns: ["Cravings", "Increased appetite"] }),
    entry("2026-07-25", { energyScore: 5, clarityScore: 5 }),
    entry("2026-07-26", { energyScore: 6, clarityScore: 6 }),
    entry("2026-07-27", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }),
    entry("2026-07-28", { energyScore: 8, clarityScore: 8, overallState: "Balanced" })
  ];
  const clusters = detectCapacityClusters(days);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].kind, "episode");
  assert.equal(clusters[0].startDate, "2026-07-21");
  assert.equal(clusters[0].endDate, "2026-07-26");
  assert.equal(clusters[0].significantDays, 2);
  assert.equal(clusters[0].reducedDays, 2);
});

test("one or two impaired days are Capacity Dips and missing days break sequences", () => {
  const clusters = detectCapacityClusters([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ]);
  assert.deepEqual(clusters.map((cluster) => cluster.kind), ["dip", "dip"]);
});

test("an episode ends only before two consecutive Baseline days", () => {
  const clusters = detectCapacityClusters([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-04", { energyScore: 6, clarityScore: 6 }),
    entry("2026-08-05", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-06", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }),
    entry("2026-08-07", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }),
    entry("2026-08-08", { energyScore: 4, clarityScore: 4 })
  ]);
  assert.equal(clusters[0].kind, "episode");
  assert.equal(clusters[0].startDate, "2026-08-01");
  assert.equal(clusters[0].endDate, "2026-08-05");
  assert.equal(clusters[1].kind, "dip");
  assert.equal(clusters[1].startDate, "2026-08-08");
});

test("missing days and Slightly reduced days do not count as Baseline recovery", () => {
  const clusters = detectCapacityClusters([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-04", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }),
    entry("2026-08-06", { energyScore: 8, clarityScore: 8, overallState: "Balanced" }),
    entry("2026-08-07", { energyScore: 6, clarityScore: 6 })
  ]);
  assert.equal(clusters[0].kind, "episode");
  assert.equal(clusters[0].endDate, "2026-08-07");
});

test("hormonal classification requires two categories across two recorded days", () => {
  const episodeDays = [
    entry("2026-08-01", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating", "Cravings"] }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating"] }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ];
  const pattern = classifyHormonalPattern(episodeDays);
  assert.equal(pattern.isPossible, true);
  assert.equal(pattern.confidence, "low");
  assert.equal(pattern.evidenceDayCount, 2);
  assert.deepEqual(pattern.categories.map((category) => category.key), ["appetite", "bloating"]);
});

test("three hormonal categories produce moderate confidence", () => {
  const pattern = classifyHormonalPattern([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating", "Cravings"] }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Increased sensitivity"], clarityNotes: "Brain fog" })
  ]);
  assert.equal(pattern.isPossible, true);
  assert.equal(pattern.confidence, "moderate");
});

test("poor sleep, activation and relationship stress remain context rather than hormonal evidence", () => {
  const day = entry("2026-08-01", {
    energyScore: 4,
    clarityScore: 4,
    sleepQuality: "Poor",
    activationSigns: ["Feeling on edge"],
    load: ["Relationship stress", "High cognitive demand"]
  });
  assert.equal(classifyHormonalPattern([day, day]).isPossible, false);
  assert.deepEqual(extractContextFactors(day), ["Poor sleep", "High cognitive demand", "Relationship stress", "Activation"]);
});

test("manual cluster confirmation, rejection and adjusted dates do not alter source days", () => {
  const days = [
    entry("2026-08-01", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ];
  const cluster = detectCapacityClusters(days)[0];
  const decision: ClusterDecision = {
    id: cluster.id,
    status: "confirmed",
    startDate: "2026-07-31",
    endDate: "2026-08-03",
    updatedAt: new Date().toISOString()
  };
  const confirmed = applyClusterDecision(cluster, decision);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.startDate, "2026-07-31");
  assert.equal(confirmed.duration, 4);
  const rejected = applyClusterDecision(cluster, { ...decision, status: "rejected" });
  assert.equal(rejected.status, "rejected");
  assert.equal(days[0].date, "2026-08-01");
});

test("month navigation works across year boundaries and defaults to latest data", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(latestMonthWithData([entry("2026-07-01"), entry("2026-08-06")], "2026-01-01"), "2026-08");
});

test("builds a median baseline only after five suitable days", () => {
  const four = Array.from({ length: 4 }, (_, index) => entry(`2026-08-0${index + 1}`, { energyScore: 8, clarityScore: 8, sleepHours: 7, overallState: "Balanced", amfexaDose: "15" }));
  assert.equal(buildBaselineProfile(four), null);
  const profile = buildBaselineProfile([...four, entry("2026-08-05", { energyScore: 9, clarityScore: 8, sleepHours: 8, overallState: "Balanced", amfexaDose: "15" })]);
  assert.equal(profile?.count, 5);
  assert.equal(profile?.energy, 8);
  assert.equal(profile?.amfexaDose, 15);
});

test("CSV export preserves missing values and includes episode IDs", () => {
  const days = [
    entry("2026-08-01", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating"] }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ];
  const csv = buildTimelineCsv(days, detectCapacityClusters(days));
  assert.match(csv, /capacity_state/);
  assert.match(csv, /Significant reduction|Reduced/);
  assert.match(csv, /auto:episode:2026-08-01:2026-08-03/);
  assert.match(csv, /Bloating/);
});

test("resolves current and legacy hormonal relevance decisions", () => {
  const episode = detectCapacityClusters([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating"] }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Cravings"] }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ])[0];
  assert.equal(resolveHormonalRelevance(episode), "Possible");
  assert.equal(resolveHormonalRelevance({ ...episode, hormonalDecision: "yes" }), "Yes");
  assert.equal(resolveHormonalRelevance({ ...episode, hormonalDecision: "not-hormonal" }), "No");
  assert.equal(resolveHormonalRelevance({ ...episode, hormonalDecision: "unsure" }), "Not reviewed");
});

test("builds medication courses independently and associates them with overlapping episodes", () => {
  const days = [
    entry("2026-07-20", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "No" }),
    entry("2026-07-21", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "No" }),
    entry("2026-07-22", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "Yes" }),
    entry("2026-07-23", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "Yes" }),
    entry("2026-07-24", { energyScore: 6, clarityScore: 6, pmddMedicationTaken: "No" })
  ];
  const episode = detectCapacityClusters(days).find((item) => item.kind === "episode")!;
  const courses = buildMedicationCourses(days);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].startDate, "2026-07-22");
  assert.equal(courses[0].medicationDates.length, 2);
  assert.equal(associatedEpisode(courses[0], [episode])?.id, episode.id);
});

test("recurring pattern groups equivalent recorded features by episode", () => {
  const days = [
    entry("2026-07-01", { hormonalSigns: ["Cravings"], energyScore: 4, clarityScore: 4 }),
    entry("2026-07-02", { hormonalSigns: ["Increased appetite"], energyScore: 4, clarityScore: 4 })
  ];
  const fakeEpisodes = [
    { ...detectCapacityClusters([entry("2026-07-01", { energyScore: 4, clarityScore: 4 }), entry("2026-07-02", { energyScore: 4, clarityScore: 4 }), entry("2026-07-03", { energyScore: 4, clarityScore: 4 })])[0], endDate: "2026-07-01" },
    { ...detectCapacityClusters([entry("2026-07-02", { energyScore: 4, clarityScore: 4 }), entry("2026-07-03", { energyScore: 4, clarityScore: 4 }), entry("2026-07-04", { energyScore: 4, clarityScore: 4 })])[0], startDate: "2026-07-02", endDate: "2026-07-02" }
  ];
  const appetite = recurringPattern(fakeEpisodes, days).find((feature) => feature.key === "appetite");
  assert.equal(appetite?.episodeCount, 2);
  assert.equal(intervalRange(fakeEpisodes), "1-1 days");
});

test("describes improvement after a medication start without claiming causation", () => {
  const days = [
    entry("2026-07-20", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "No" }),
    entry("2026-07-21", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "No" }),
    entry("2026-07-22", { energyScore: 4, clarityScore: 4, pmddMedicationTaken: "Yes" }),
    entry("2026-07-23", { energyScore: 6, clarityScore: 6, pmddMedicationTaken: "Yes" }),
    entry("2026-07-24", { energyScore: 7, clarityScore: 7, overallState: "Balanced", pmddMedicationTaken: "No" })
  ];
  const response = assessMedicationResponse(buildMedicationCourses(days)[0], days);
  assert.equal(response.trajectory, "improvement-followed");
  assert.equal(response.label, "Improvement followed medication");
  assert.match(response.detail, /cannot show that medication caused/);
  assert.equal(response.beforeDays, 2);
  assert.equal(response.afterDays, 2);
});

test("keeps medication response inconclusive when comparison data is missing", () => {
  const days = [
    entry("2026-07-22", { pmddMedicationTaken: "Yes" }),
    entry("2026-07-23", { pmddMedicationTaken: "No" })
  ];
  const response = assessMedicationResponse(buildMedicationCourses(days)[0], days);
  assert.equal(response.trajectory, "insufficient");
  assert.equal(response.label, "Not enough data");
});

test("keeps mood, interest and waking capacity distinct in the GP pattern", () => {
  const pattern = buildMoodCapacityPattern([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4, underlyingMood: "Mostly okay / stable", interestAvailable: "Yes", wakingChanges: ["Lower energy"], overallState: "Balanced" }),
    entry("2026-08-02", { energyScore: 4, clarityScore: 4, underlyingMood: "Low for most of the day", interestAvailable: "No", wakingChanges: ["Lower mood"] }),
    entry("2026-08-03", { energyScore: 7, clarityScore: 7, underlyingMood: "Low for most of the day", overallState: "Balanced" }),
    entry("2026-08-05", { energyScore: 7, clarityScore: 7, underlyingMood: "Flat or numb", overallState: "Balanced" })
  ]);
  assert.equal(pattern.reducedDays, 2);
  assert.equal(pattern.reducedWithStableMood, 1);
  assert.equal(pattern.reducedWithInterest, 1);
  assert.equal(pattern.reducedWithCapacityChangeOnWaking, 1);
  assert.equal(pattern.reducedWithStableOverallState, 1);
  assert.equal(pattern.longestLowMoodRun, 2);
});
