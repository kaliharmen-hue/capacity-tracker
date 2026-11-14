import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyV2Entry, functionalImpactOptions, immediateEffectOptions, normaliseV2Entry } from "../src/scripts/v2-schema.ts";

test("V2 entries start unanswered rather than implying no intervention", () => {
  const entry = createEmptyV2Entry("2026-11-04");

  assert.equal(entry.physicalFatigue, "");
  assert.equal(entry.cognitiveDifficulty, "");
  assert.equal(entry.functionalImpact, "");
  assert.equal(entry.entryStatus, "draft");
  assert.equal(entry.bioLightFullSpectrum, false);
  assert.equal(entry.bioLightEffect, "");
  assert.equal(entry.bioLightDurationMinutes, "");
  assert.equal(entry.vagustimDaytimeEffect, "");
});

test("short BioLight sessions retain their actual duration without inventing old durations", () => {
  const older = normaliseV2Entry({date: "2026-11-04", bioLightFullSpectrum: true, bioLightBrightness: "8", entryStatus: "complete"});
  assert.equal(older.bioLightDurationMinutes, "");
  assert.equal(older.bioLightBrightness, "8");
  assert.equal(older.entryStatus, "complete");
  for (const minutes of [10, 20, 40, 60] as const) {
    const saved = normaliseV2Entry({...older, bioLightDurationMinutes: minutes});
    assert.equal(normaliseV2Entry(JSON.parse(JSON.stringify(saved))).bioLightDurationMinutes, minutes);
    assert.equal(saved.bioLightBrightness, "8");
  }
});

test("V2 normalisation preserves explicit zero scores and unchecked protocol states", () => {
  const entry = normaliseV2Entry({
    date: "2026-11-04",
    physicalFatigue: 0,
    cognitiveDifficulty: 0,
    functionalImpact: "No impact",
    entryStatus: "complete",
    bioLightFullSpectrum: false,
    vagustimDaytime: true,
    vagustimDaytimeEffect: "No noticeable change"
  });

  assert.equal(entry.physicalFatigue, 0);
  assert.equal(entry.cognitiveDifficulty, 0);
  assert.equal(entry.bioLightFullSpectrum, false);
  assert.equal(entry.entryStatus, "complete");
  assert.equal(entry.vagustimDaytime, true);
  assert.equal(entry.vagustimDaytimeEffect, "No noticeable change");
});

test("evening observations survive storage and leave historical activities unanswered", () => {
  const older = normaliseV2Entry({date: "2026-11-04", notes: "Existing note"});
  assert.equal(older.eveningForMyself, "");
  assert.equal(older.eveningCompany, "");
  assert.equal(older.eveningNotes, "");
  assert.equal(older.eveningExperience, "");
  // An activity is independent of being alone: company must not erase self-care.
  const saved = normaliseV2Entry(JSON.parse(JSON.stringify({
    ...older, eveningCompany: "Spent the evening with Keith", eveningForMyself: "Using Sensate", eveningNotes: "A quiet evening"
  })));
  assert.equal(saved.eveningForMyself, "Using Sensate");
  assert.equal(saved.notes, "Existing note");
  assert.equal(saved.eveningCompany, "Spent the evening with Keith");
  assert.equal(saved.eveningNotes, "A quiet evening");
  assert.equal(normaliseV2Entry({date: older.date, spentEveningAlone: true}).eveningCompany, "Spent the evening alone");
  assert.equal(normaliseV2Entry({date: older.date, spentEveningAlone: false}).eveningCompany, "");
  assert.equal(normaliseV2Entry({...saved, spentEveningAlone: true}).eveningCompany, "Spent the evening with Keith");
});

test("evening experience is optional and retained without company or activity answers", () => {
  for (const eveningExperience of ["Calm", "Enjoyable / connected", "Triggered", "Argument / conflict", "Anxious", "Restless", "Draining", "Mixed", "Other"] as const) {
    const entry = normaliseV2Entry(JSON.parse(JSON.stringify({date: "2026-11-14", eveningExperience})));
    assert.equal(entry.eveningExperience, eveningExperience);
    assert.equal(entry.eveningCompany, "");
    assert.equal(entry.eveningForMyself, "");
  }
});

test("V2 option lists match the agreed low-burden questionnaire", () => {
  assert.deepEqual(functionalImpactOptions, [
    "No impact",
    "Managed with extra effort",
    "Reduced or postponed activities",
    "Unable to manage essential activities"
  ]);
  assert.deepEqual(immediateEffectOptions, [
    "Noticeably better",
    "Slightly better",
    "No noticeable change",
    "Felt worse",
    "Not sure"
  ]);
});
