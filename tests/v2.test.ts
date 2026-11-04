import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyV2Entry, functionalImpactOptions, immediateEffectOptions, normaliseV2Entry } from "../src/scripts/v2-schema.ts";

test("V2 entries start unanswered rather than implying no intervention", () => {
  const entry = createEmptyV2Entry("2026-11-04");

  assert.equal(entry.physicalFatigue, "");
  assert.equal(entry.cognitiveDifficulty, "");
  assert.equal(entry.functionalImpact, "");
  assert.equal(entry.bioLightFullSpectrum, false);
  assert.equal(entry.bioLightEffect, "");
  assert.equal(entry.vagustimDaytimeEffect, "");
});

test("V2 normalisation preserves explicit zero scores and unchecked protocol states", () => {
  const entry = normaliseV2Entry({
    date: "2026-11-04",
    physicalFatigue: 0,
    cognitiveDifficulty: 0,
    functionalImpact: "No impact",
    bioLightFullSpectrum: false,
    vagustimDaytime: true,
    vagustimDaytimeEffect: "No noticeable change"
  });

  assert.equal(entry.physicalFatigue, 0);
  assert.equal(entry.cognitiveDifficulty, 0);
  assert.equal(entry.bioLightFullSpectrum, false);
  assert.equal(entry.vagustimDaytime, true);
  assert.equal(entry.vagustimDaytimeEffect, "No noticeable change");
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
