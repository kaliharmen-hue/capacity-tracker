export type V2FunctionalImpact =
  | "No impact"
  | "Managed with extra effort"
  | "Reduced or postponed activities"
  | "Unable to manage essential activities"
  | "";

export type V2ImmediateEffect =
  | "Noticeably better"
  | "Slightly better"
  | "No noticeable change"
  | "Felt worse"
  | "Not sure"
  | "";

export interface V2DailyEntry {
  schemaVersion: 1;
  date: string;
  physicalFatigue: number | "";
  cognitiveDifficulty: number | "";
  functionalImpact: V2FunctionalImpact;
  notes: string;
  bioLightFullSpectrum: boolean;
  bioLightBrightness: string;
  bioLightInfrared: boolean;
  bioLightEffect: V2ImmediateEffect;
  vagustimDaytime: boolean;
  vagustimDaytimeEffect: V2ImmediateEffect;
  vagustimEvening: boolean;
  updatedAt: string;
}

export const functionalImpactOptions: V2FunctionalImpact[] = [
  "No impact",
  "Managed with extra effort",
  "Reduced or postponed activities",
  "Unable to manage essential activities"
];

export const immediateEffectOptions: V2ImmediateEffect[] = [
  "Noticeably better",
  "Slightly better",
  "No noticeable change",
  "Felt worse",
  "Not sure"
];

export function createEmptyV2Entry(date: string): V2DailyEntry {
  return {
    schemaVersion: 1,
    date,
    physicalFatigue: "",
    cognitiveDifficulty: "",
    functionalImpact: "",
    notes: "",
    bioLightFullSpectrum: false,
    bioLightBrightness: "",
    bioLightInfrared: false,
    bioLightEffect: "",
    vagustimDaytime: false,
    vagustimDaytimeEffect: "",
    vagustimEvening: false,
    updatedAt: ""
  };
}

export function normaliseV2Entry(value: Partial<V2DailyEntry> & Pick<V2DailyEntry, "date">): V2DailyEntry {
  return { ...createEmptyV2Entry(value.date), ...value, schemaVersion: 1 };
}

