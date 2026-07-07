export type Quality = "Good" | "Okay" | "Poor" | "";
export type Ternary = "Yes" | "No" | "Unsure" | "Somewhat" | "N/A" | "";
export type FatigueLevel = "No" | "Mild" | "Moderate" | "Significant" | "";

export interface DailyEntry {
  date: string;
  energyScore: number;
  energyNotes: string;
  clarityScore: number;
  clarityNotes: string;
  executiveDemandLevel: string;
  executiveDemandTypes: string[];
  emotionalState: string[];
  emotionalNotes: string;
  socialTolerance: string[];
  socialNotes: string;
  sleepHours: number;
  sleepQuality: Quality;
  wakingTime: string;
  feltRestored: Ternary;
  hotWaking: Ternary;
  sleepFragmentation: Ternary;
  ruminationOnWaking: Ternary;
  sleepNotes: string;
  hormonalSigns: string[];
  hormonalNotes: string;
  familiarHormonalPattern: string;
  possibleLutealPhase: Ternary;
  possiblePeriodSign: Ternary;
  cycleNotes: string;
  fatigueLevel: FatigueLevel;
  fatigueWorstTime: string;
  fatigueNotes: string;
  pmddMedicationTaken: Ternary;
  medicationSideEffects: string[];
  medicationSideEffectSeverity: string;
  medicationNotes: string;
  amfexaDose: number;
  amfexaEffect: string;
  amfexaWearOffTime: string;
  bowelMovementToday: Ternary;
  bowelMovementDescription: string;
  feltFullyEmptied: Ternary;
  digestiveSymptoms: string[];
  digestionNotes: string;
  nervousSystemState: string[];
  nervousSystemNotes: string;
  morningActivationScore: number | "";
  activationSigns: string[];
  coffees: number;
  amfexaTaken: Ternary;
  amfexaNotes: string;
  activationNotes: string;
  movedToday: Ternary;
  movementTypes: string[];
  movementIntensity: string;
  movementEffect: string;
  cooldownDone: Ternary;
  movementNotes: string;
  load: string[];
  loadNotes: string;
  recovery: string[];
  recoveryNotes: string;
  capacityRemainingScore: number | "";
  innerCriticScore: number | "";
  innerCriticNotes: string;
  overloadIncreasedBy: string;
  firstCapacityDropSign: string;
  unexpectedlyHelped: string;
  earlyWarningSigns: string;
  easierOrHarder: string;
  updatedAt: string;
}

export interface SectionDefinition {
  key: string;
  title: string;
  prompt?: string;
  fields: FieldDefinition[];
}

export type FieldDefinition =
  | {
      type: "score";
      name: keyof DailyEntry;
      notesName: keyof DailyEntry;
      label: string;
      notesLabel: string;
    }
  | {
      type: "multi";
      name: keyof DailyEntry;
      label: string;
      options: string[];
      notesName?: keyof DailyEntry;
      notesLabel?: string;
    }
  | {
      type: "textarea";
      name: keyof DailyEntry;
      label: string;
    }
  | {
      type: "number";
      name: keyof DailyEntry;
      label: string;
      min?: number;
      step?: number;
      max?: number;
    }
  | {
      type: "select";
      name: keyof DailyEntry;
      label: string;
      options: string[];
    }
  | {
      type: "time";
      name: keyof DailyEntry;
      label: string;
    };

export const emotionalOptions = ["Stable", "Calm", "Sensitive", "Low", "Flat", "Agitated", "Overwhelmed", "Anxious", "Motivated"];
export const socialOptions = [
  "Wanted connection",
  "Neutral",
  "Low tolerance",
  "Overwhelmed by interaction",
  "Wanted to withdraw"
];
export const executiveDemandOptions = ["Computer work", "Coaching / clients", "Admin", "Creative work", "Meetings", "Social interaction", "Varied day"];
export const hormonalOptions = [
  "No noticeable signs",
  "Bloating",
  "Cravings",
  "Increased appetite",
  "Irritability spikes",
  "Tearfulness",
  "Increased sensitivity",
  "Head pressure/tension",
  "Tightness/body tension",
  "Feeling hot/cold",
  "Unusual body aches or pains",
  "Skin changes/spots",
  "Breast tenderness",
  "Breast changes",
  "Sudden bowel movement change"
];
export const digestiveOptions = [
  "None",
  "Bloating",
  "Constipation feeling",
  "Fewer bowel movements than usual",
  "Increased gas",
  "Gas",
  "Abdominal discomfort",
  "Sudden bowel movement change",
  "Diarrhoea",
  "Appetite changes"
];
export const medicationSideEffectOptions = [
  "None",
  "Nausea",
  "Headache",
  "Dizziness",
  "Increased fatigue",
  "Insomnia",
  "Sleep disruption",
  "Increased anxiety",
  "Feeling emotionally flat",
  "Feeling emotionally numb",
  "Reduced appetite",
  "Increased appetite",
  "Digestive changes",
  "Sweating/hot flushes",
  "Restlessness",
  "Sexual side effects",
  "Other"
];
export const nervousOptions = [
  "Wired but tired",
  "Shutdown/heavy",
  "Calm/regulated",
  "Activated/anxious",
  "Numb/disconnected",
  "Motivated/engaged"
];
export const activationOptions = [
  "Amfexa effects noticeable",
  "Amfexa felt weak/not noticeable",
  "Caffeine intake",
  "Heart pounding/pulse awareness",
  "Adrenaline feelings",
  "Wired but exhausted",
  "Internal restlessness",
  "Sensitivity to noise/stimulation",
  "Sleep fragmentation",
  "Emotional flattening/numbness",
  "Feeling on edge",
  "Overstimulated by media/screens",
  "Shallow breathing/not breathing fully",
  "Felt like I could keep going and going",
  "No noticeable activation"
];
export const movementOptions = [
  "Walking",
  "Cardio",
  "Upper weights",
  "Lower weights",
  "Full body",
  "Sport",
  "Coaching",
  "Cardio circuits",
  "Mobility/stretching",
  "Rest day",
  "Other"
];
export const loadOptions = [
  "Poor sleep",
  "Pain / physical discomfort",
  "Computer work",
  "Work pressure",
  "Conflict",
  "Relationship stress",
  "Emotional conversations",
  "Financial worries",
  "Heat",
  "Feeling trapped",
  "Feeling unsupported/carrying too much",
  "Self-silencing/keeping things in",
  "Too much stimulation",
  "TV/media stimulation",
  "Screen stimulation",
  "Noise/social environments",
  "Social events",
  "Biodanza",
  "Intense work day",
  "Heavy training",
  "Other"
];
export const recoveryOptions = [
  "Quiet",
  "Nature",
  "Movement",
  "Creativity",
  "Meaningful connection",
  "Time alone",
  "Structure/routine",
  "Low stimulation",
  "Therapy",
  "Doing something for myself",
  "Music",
  "Reduced pressure",
  "Flow state",
  "Being heard/seen",
  "Emotional repair"
];

export const sections: SectionDefinition[] = [
  {
    key: "energy",
    title: "Energy",
    fields: [
      {
        type: "score",
        name: "energyScore",
        notesName: "energyNotes",
        label: "How much usable energy do I actually have today?",
        notesLabel: "Energy notes"
      }
    ]
  },
  {
    key: "clarity",
    title: "Executive capacity",
    fields: [
      {
        type: "score",
        name: "clarityScore",
        notesName: "clarityNotes",
        label: "How mentally clear did I feel today?",
        notesLabel: "Brain clarity notes"
      },
      {
        type: "select",
        name: "executiveDemandLevel",
        label: "How much executive demand was there today?",
        options: ["", "Very low", "Low", "Moderate", "High", "Very high"]
      },
      {
        type: "multi",
        name: "executiveDemandTypes",
        label: "What mainly demanded my brain today?",
        options: executiveDemandOptions
      }
    ]
  },
  {
    key: "emotional",
    title: "Emotional state",
    fields: [
      { type: "multi", name: "emotionalState", label: "What emotional states are present?", options: emotionalOptions },
      { type: "textarea", name: "emotionalNotes", label: "Emotional notes" }
    ]
  },
  {
    key: "social",
    title: "Social capacity",
    fields: [
      { type: "multi", name: "socialTolerance", label: "How did connection or interaction feel?", options: socialOptions },
      { type: "textarea", name: "socialNotes", label: "Social notes" }
    ]
  },
  {
    key: "sleep",
    title: "Sleep",
    fields: [
      { type: "number", name: "sleepHours", label: "How many hours did I sleep?", min: 0, step: 0.25 },
      { type: "select", name: "sleepQuality", label: "How was sleep quality?", options: ["", "Good", "Okay", "Poor"] },
      { type: "time", name: "wakingTime", label: "If I woke early, what time was it?" },
      { type: "select", name: "feltRestored", label: "Did I feel restored?", options: ["", "Yes", "Somewhat", "No"] },
      { type: "select", name: "hotWaking", label: "Did I wake hot?", options: ["", "Yes", "No"] },
      { type: "select", name: "sleepFragmentation", label: "Was sleep fragmented?", options: ["", "Yes", "No"] },
      { type: "select", name: "ruminationOnWaking", label: "Was there rumination on waking?", options: ["", "Yes", "No"] },
      { type: "textarea", name: "sleepNotes", label: "Sleep notes" }
    ]
  },
  {
    key: "hormonal",
    title: "Hormonal pattern",
    fields: [
      { type: "multi", name: "hormonalSigns", label: "What signs did I notice?", options: hormonalOptions },
      {
        type: "select",
        name: "familiarHormonalPattern",
        label: "Does today feel like my familiar hormonal pattern?",
        options: ["", "No", "Slightly", "Yes", "Unsure"]
      },
      { type: "textarea", name: "hormonalNotes", label: "Hormonal notes" }
    ]
  },
  {
    key: "cycle",
    title: "Possible cycle phase",
    fields: [
      { type: "select", name: "possibleLutealPhase", label: "Possible luteal phase?", options: ["", "Yes", "No", "Unsure"] },
      { type: "select", name: "possiblePeriodSign", label: "Possible period sign?", options: ["", "Yes", "No", "Unsure"] },
      { type: "textarea", name: "cycleNotes", label: "Cycle phase notes" }
    ]
  },
  {
    key: "fatigue",
    title: "Fatigue",
    fields: [
      { type: "select", name: "fatigueLevel", label: "Was fatigue noticeable today?", options: ["", "No", "Mild", "Moderate", "Significant"] },
      {
        type: "select",
        name: "fatigueWorstTime",
        label: "When was fatigue worst?",
        options: ["", "Morning", "Midday", "Afternoon", "Evening", "Constant"]
      },
      { type: "textarea", name: "fatigueNotes", label: "Fatigue notes" }
    ]
  },
  {
    key: "medication",
    title: "Medication",
    fields: [
      { type: "number", name: "amfexaDose", label: "Amfexa dose in mg", min: 0, step: 2.5 },
      {
        type: "select",
        name: "amfexaEffect",
        label: "How did Amfexa feel today?",
        options: ["", "Too weak", "About right", "Too strong", "Not taken", "Hard to tell"]
      },
      { type: "time", name: "amfexaWearOffTime", label: "What time did Amfexa seem to wear off?" },
      { type: "select", name: "pmddMedicationTaken", label: "Did I take my PMDD medication today?", options: ["", "Yes", "No"] },
      {
        type: "multi",
        name: "medicationSideEffects",
        label: "Did I notice any side effects today?",
        options: medicationSideEffectOptions
      },
      {
        type: "select",
        name: "medicationSideEffectSeverity",
        label: "Side effect severity",
        options: ["", "Mild", "Moderate", "Significant"]
      },
      { type: "textarea", name: "medicationNotes", label: "Medication notes" }
    ]
  },
  {
    key: "digestion",
    title: "Digestion",
    fields: [
      { type: "select", name: "bowelMovementToday", label: "Did I have a bowel movement today?", options: ["", "Yes", "No", "Not sure"] },
      {
        type: "select",
        name: "bowelMovementDescription",
        label: "If yes, which best describes it?",
        options: ["", "Hard/difficult", "Normal", "Loose", "More complete than usual", "Smaller/less complete than usual"]
      },
      { type: "select", name: "feltFullyEmptied", label: "Did I feel fully emptied?", options: ["", "Yes", "No", "Not sure"] },
      { type: "multi", name: "digestiveSymptoms", label: "What digestive signs did I notice?", options: digestiveOptions },
      { type: "textarea", name: "digestionNotes", label: "Digestion notes" }
    ]
  },
  {
    key: "nervous",
    title: "Nervous system state",
    fields: [
      { type: "multi", name: "nervousSystemState", label: "What nervous system states are present?", options: nervousOptions },
      { type: "textarea", name: "nervousSystemNotes", label: "Nervous system notes" }
    ]
  },
  {
    key: "activation",
    title: "Physiological activation",
    fields: [
      {
        type: "number",
        name: "morningActivationScore",
        label: "Before coffee, food or medication, how activated did my body already feel? (0-10)",
        min: 0,
        max: 10,
        step: 1
      },
      { type: "multi", name: "activationSigns", label: "What activation signs did I notice?", options: activationOptions },
      { type: "number", name: "coffees", label: "How many coffees did I have?", min: 0, step: 1 },
      { type: "select", name: "amfexaTaken", label: "Did I take Amfexa?", options: ["", "Yes", "No"] },
      { type: "textarea", name: "amfexaNotes", label: "Amfexa notes" },
      { type: "textarea", name: "activationNotes", label: "Activation notes" }
    ]
  },
  {
    key: "movement",
    title: "Movement",
    fields: [
      { type: "select", name: "movedToday", label: "Did I train or move today?", options: ["", "Yes", "No"] },
      { type: "multi", name: "movementTypes", label: "What kind of movement happened?", options: movementOptions },
      { type: "select", name: "movementIntensity", label: "How intense was it?", options: ["", "Very light", "Light", "Moderate", "Hard"] },
      { type: "select", name: "movementEffect", label: "What was the effect afterwards?", options: ["", "Helped regulate me", "Neutral", "Drained me", "Hard to tell"] },
      { type: "select", name: "cooldownDone", label: "Did I do a cooldown?", options: ["", "Yes", "No", "N/A"] },
      { type: "textarea", name: "movementNotes", label: "Movement notes" }
    ]
  },
  {
    key: "load",
    title: "Load",
    fields: [
      { type: "multi", name: "load", label: "What added load today?", options: loadOptions },
      { type: "textarea", name: "loadNotes", label: "Load notes" }
    ]
  },
  {
    key: "recovery",
    title: "Recovery",
    fields: [
      {
        type: "multi",
        name: "recovery",
        label: "What genuinely seemed to help regulate or restore me today?",
        options: recoveryOptions
      },
      { type: "textarea", name: "recoveryNotes", label: "Recovery notes" }
    ]
  },
  {
    key: "capacity",
    title: "Capacity remaining",
    prompt: "At the end of today, 0 = completely empty and 10 = I could easily have kept going.",
    fields: [
      {
        type: "number",
        name: "capacityRemainingScore",
        label: "How much reserve did I still have left? (0-10)",
        min: 0,
        max: 10,
        step: 1
      }
    ]
  },
  {
    key: "innerCritic",
    title: "Inner critic",
    prompt: "0 = quiet and 10 = relentless.",
    fields: [
      { type: "number", name: "innerCriticScore", label: "How loud was my inner critic today? (0-10)", min: 0, max: 10, step: 1 },
      { type: "textarea", name: "innerCriticNotes", label: "Inner critic notes" }
    ]
  },
  {
    key: "reflection",
    title: "End of day reflection",
    fields: [
      { type: "textarea", name: "overloadIncreasedBy", label: "What seemed to increase overload?" },
      { type: "textarea", name: "firstCapacityDropSign", label: "What was the first sign my capacity was beginning to drop?" },
      { type: "textarea", name: "unexpectedlyHelped", label: "Did anything unexpectedly help today?" },
      { type: "textarea", name: "earlyWarningSigns", label: "Any other early warning signs I noticed?" },
      { type: "textarea", name: "easierOrHarder", label: "Did anything feel unexpectedly easier or harder today?" }
    ]
  }
];

export function createEmptyEntry(date: string): DailyEntry {
  return {
    date,
    energyScore: 5,
    energyNotes: "",
    clarityScore: 5,
    clarityNotes: "",
    executiveDemandLevel: "",
    executiveDemandTypes: [],
    emotionalState: [],
    emotionalNotes: "",
    socialTolerance: [],
    socialNotes: "",
    sleepHours: 0,
    sleepQuality: "",
    wakingTime: "",
    feltRestored: "",
    hotWaking: "",
    sleepFragmentation: "",
    ruminationOnWaking: "",
    sleepNotes: "",
    hormonalSigns: [],
    hormonalNotes: "",
    familiarHormonalPattern: "",
    possibleLutealPhase: "",
    possiblePeriodSign: "",
    cycleNotes: "",
    fatigueLevel: "",
    fatigueWorstTime: "",
    fatigueNotes: "",
    pmddMedicationTaken: "",
    medicationSideEffects: [],
    medicationSideEffectSeverity: "",
    medicationNotes: "",
    amfexaDose: 15,
    amfexaEffect: "",
    amfexaWearOffTime: "",
    bowelMovementToday: "",
    bowelMovementDescription: "",
    feltFullyEmptied: "",
    digestiveSymptoms: [],
    digestionNotes: "",
    nervousSystemState: [],
    nervousSystemNotes: "",
    morningActivationScore: "",
    activationSigns: [],
    coffees: 0,
    amfexaTaken: "",
    amfexaNotes: "",
    activationNotes: "",
    movedToday: "",
    movementTypes: [],
    movementIntensity: "",
    movementEffect: "",
    cooldownDone: "",
    movementNotes: "",
    load: [],
    loadNotes: "",
    recovery: [],
    recoveryNotes: "",
    capacityRemainingScore: "",
    innerCriticScore: "",
    innerCriticNotes: "",
    overloadIncreasedBy: "",
    firstCapacityDropSign: "",
    unexpectedlyHelped: "",
    earlyWarningSigns: "",
    easierOrHarder: "",
    updatedAt: new Date().toISOString()
  };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
