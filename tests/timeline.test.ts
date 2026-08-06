import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClusterDecision,
  buildBaselineProfile,
  buildTimelineCsv,
  detectCapacityClusters,
  latestMonthWithData,
  monthDates,
  normalizeTimelineEntry,
  shiftMonth,
  type ClusterDecision,
  type RawDailyEntry
} from "../src/scripts/timeline-model.ts";

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

test("detects the representative July 2026 reduced-capacity cluster without hard-coding dates", () => {
  const days = [
    entry("2026-07-19", { energyScore: 6, clarityScore: 6, clarityNotes: "Muddy thinking" }),
    entry("2026-07-20", { energyScore: 5, clarityScore: 5, hormonalSigns: ["Bloating"] }),
    entry("2026-07-21", { energyScore: 4, clarityScore: 3, clarityNotes: "Wading through treacle", hormonalSigns: ["Cravings"] }),
    entry("2026-07-22", { energyScore: 4, clarityScore: 3, clarityNotes: "Head swimming", pmddMedicationTaken: "Yes" }),
    entry("2026-07-23", { energyScore: 5, clarityScore: 4, hormonalSigns: ["Cravings", "Increased appetite"] }),
    entry("2026-07-24", { energyScore: 4, clarityScore: 5, hormonalSigns: ["Bloating", "Increased sensitivity"] }),
    entry("2026-07-25", { energyScore: 4, clarityScore: 4, amfexaEffect: "Too weak" }),
    entry("2026-07-26", { energyScore: 5, clarityScore: 5, hormonalSigns: ["Bloating"] }),
    entry("2026-07-27", { energyScore: 6, clarityScore: 6 }),
    entry("2026-08-03", { energyScore: 8, clarityScore: 8, overallState: "Balanced" })
  ];
  const clusters = detectCapacityClusters(days);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].startDate, "2026-07-19");
  assert.equal(clusters[0].endDate, "2026-07-26");
  assert.equal(clusters[0].lowestClarity, 3);
  assert.equal(clusters[0].apparentReturnDate, "2026-08-03");
});

test("missing days break a consecutive cluster", () => {
  const clusters = detectCapacityClusters([
    entry("2026-08-01", { energyScore: 4, clarityScore: 4 }),
    entry("2026-08-03", { energyScore: 4, clarityScore: 4 })
  ]);
  assert.equal(clusters.length, 0);
});

test("manual cluster confirmation, rejection and adjusted dates do not alter source days", () => {
  const days = [entry("2026-08-01", { energyScore: 4, clarityScore: 4 }), entry("2026-08-02", { energyScore: 4, clarityScore: 4 })];
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

test("CSV export preserves missing values and includes cluster IDs", () => {
  const days = [entry("2026-08-01", { energyScore: 4, clarityScore: 4, hormonalSigns: ["Bloating"] }), entry("2026-08-02", { energyScore: 4, clarityScore: 4 })];
  const csv = buildTimelineCsv(days, detectCapacityClusters(days));
  assert.match(csv, /capacity_state/);
  assert.match(csv, /Significant reduction|Reduced/);
  assert.match(csv, /auto:2026-08-01:2026-08-02/);
  assert.match(csv, /Bloating/);
});
