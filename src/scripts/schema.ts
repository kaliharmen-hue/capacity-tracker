export type Quality = "Good" | "Okay" | "Poor" | "";
export type Ternary = "Yes" | "No" | "Unsure" | "Somewhat" | "N/A" | "";
export type FatigueLevel = "No" | "Mild" | "Moderate" | "Significant" | "";

export interface DailyEntry {
  date: string;
  energyScore: number;
  energyNotes: string;
  clarityScore: number;
  clarityNotes: string;
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
  possibleLutealPhase: Ternary;
  possiblePeriodSign: Ternary;
  cycleNotes: string;
  fatigueLevel: FatigueLevel;
  fatigueNotes: string;
  bowelMovementToday: Ternary;
  bowelMovementDescription: string;
  feltFullyEmptied: Ternary;
  digestiveSymptoms: string[];
  digestionNotes: string;
  nervousSystemState: string[];
  nervousSystemNotes: string;
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
  overloadIncreasedBy: string;
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

export const emotionalOptions = ["Stable", "Sensitive", "Agitated", "Low", "Overwhelmed", "Flat", "Calm"];
export const socialOptions = [
  "Wanted connection",
  "Neutral",
  "Low tolerance",
  "Overwhelmed by interaction",
  "Wanted to withdraw"
];
export const hormonalOptions = [
  "Bloating",
  "Breast changes",
  "Irritability spikes",
  "Tearfulness",
  "Cravings",
  "Feeling hot/cold",
  "Increased sensitivity",
  "Head pressure/tension",
  "Back pain",
  "Tightness/body tension",
  "No noticeable signs"
];
export const digestiveOptions = [
  "Bloating",
  "Constipation feeling",
  "Fewer bowel movements than usual",
  "Increased gas",
  "Abdominal discomfort",
  "Sudden bowel movement change",
  "None"
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
  "Upper weights",
  "Lower weights",
  "Cardio circuits",
  "Walking",
  "Mobility/stretching",
  "Rest day",
  "Other"
];
export const loadOptions = [
  "Social events",
  "Biodanza",
  "Conflict",
  "Intense work day",
  "Poor sleep",
  "Heavy training",
  "Emotional conversations",
  "Too much stimulation",
  "TV/media stimulation",
  "Relationship stress",
  "Noise/social environments",
  "Financial worries",
  "Feeling trapped",
  "Self-silencing/keeping things in",
  "Feeling unsupported/carrying too much",
  "Heat",
  "Work pressure"
];
export const recoveryOptions = [
  "Quiet",
  "Meaningful connection",
  "Time alone",
  "Movement",
  "Music",
  "Nature",
  "Reduced pressure",
  "Creativity",
  "Flow state",
  "Low stimulation",
  "Structure/routine",
  "Being heard/seen",
  "Emotional repair",
  "Doing something for myself"
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
    title: "Brain clarity",
    fields: [
      {
        type: "score",
        name: "clarityScore",
        notesName: "clarityNotes",
        label: "How clear or foggy does my thinking feel?",
        notesLabel: "Clarity notes"
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
    title: "Social tolerance",
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
    title: "Cycle / hormonal signs",
    fields: [
      { type: "multi", name: "hormonalSigns", label: "What signs did I notice?", options: hormonalOptions },
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
      { type: "textarea", name: "fatigueNotes", label: "Fatigue notes" }
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
      { type: "multi", name: "activationSigns", label: "What activation signs did I notice?", options: activationOptions },
      { type: "number", name: "coffees", label: "How many coffees did I have?", min: 0, step: 1 },
      { type: "select", name: "amfexaTaken", label: "Did I take Amfexa?", options: ["", "Yes", "No"] },
      { type: "textarea", name: "amfexaNotes", label: "Amfexa notes" },
      { type: "textarea", name: "activationNotes", label: "Activation notes" }
    ]
  },
  {
    key: "movement",
    title: "Training / movement",
    fields: [
      { type: "select", name: "movedToday", label: "Did I train or move today?", options: ["", "Yes", "No"] },
      { type: "multi", name: "movementTypes", label: "What kind of movement happened?", options: movementOptions },
      { type: "select", name: "movementIntensity", label: "How intense was it?", options: ["", "Very light", "Moderate", "Hard"] },
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
    title: "Regulation / recovery",
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
    key: "reflection",
    title: "End of day reflection",
    fields: [
      { type: "textarea", name: "overloadIncreasedBy", label: "What seemed to increase overload?" },
      { type: "textarea", name: "earlyWarningSigns", label: "Any early warning signs I noticed?" },
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
    possibleLutealPhase: "",
    possiblePeriodSign: "",
    cycleNotes: "",
    fatigueLevel: "",
    fatigueNotes: "",
    bowelMovementToday: "",
    bowelMovementDescription: "",
    feltFullyEmptied: "",
    digestiveSymptoms: [],
    digestionNotes: "",
    nervousSystemState: [],
    nervousSystemNotes: "",
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
    overloadIncreasedBy: "",
    earlyWarningSigns: "",
    easierOrHarder: "",
    updatedAt: new Date().toISOString()
  };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
