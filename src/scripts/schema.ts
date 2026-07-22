export type Quality = "Good" | "Okay" | "Poor" | "";
export type Ternary = "Yes" | "No" | "Unsure" | "Somewhat" | "N/A" | "";
export type FatigueLevel = "No" | "Mild" | "Moderate" | "Significant" | "";

export interface DailyEntry {
  date: string;
  energyScore: number;
  energyPattern: string;
  endOfDayEnergy: string;
  energyNotes: string;
  clarityScore: number;
  clarityNotes: string;
  executiveDemandLevel: string;
  executiveDemandTypes: string[];
  executiveFriction: string[];
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
  amfexaDose: string;
  amfexaEffect: string;
  amfexaWearOffTime: string;
  adhdMedicationNotes: string;
  bowelMovementToday: Ternary;
  bowelMovementDescription: string;
  feltFullyEmptied: Ternary;
  digestiveSymptoms: string[];
  digestionNotes: string;
  overallState: string;
  nervousSystemState: string[];
  nervousSystemNotes: string;
  morningActivationScore: number | "";
  activationFirstNotice: string;
  laterActivation: string;
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
  workSatisfactionScore: number | "";
  activity1Type: string;
  activity1Time: string;
  activity1ExecutiveDemandScore: number | "";
  activity1CapacityEffect: string;
  activity1MeaningScore: number | "";
  activity2Type: string;
  activity2Time: string;
  activity2ExecutiveDemandScore: number | "";
  activity2CapacityEffect: string;
  activity2MeaningScore: number | "";
  activity3Type: string;
  activity3Time: string;
  activity3ExecutiveDemandScore: number | "";
  activity3CapacityEffect: string;
  activity3MeaningScore: number | "";
  activity4Type: string;
  activity4Time: string;
  activity4ExecutiveDemandScore: number | "";
  activity4CapacityEffect: string;
  activity4MeaningScore: number | "";
  flowContentmentActivity: string;
  capacityRemainingScore: number | "";
  innerCriticScore: number | "";
  innerCriticNotes: string;
  reflectionInfluencedToday: string;
  biggestEnergyDrain: string;
  capacityImprovedBy: string;
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
    helperText?: string;
  fields: FieldDefinition[];
}

export type FieldDefinition =
  | {
      type: "info";
      text: string;
    }
  | {
      type: "score";
      name: keyof DailyEntry;
      notesName: keyof DailyEntry;
      label: string;
      notesLabel: string;
      helperText?: string;
    }
  | {
      type: "scoreOnly";
      name: keyof DailyEntry;
      label: string;
      helperText?: string;
    }
  | {
      type: "multi";
      name: keyof DailyEntry;
      label: string;
      options: string[];
      notesName?: keyof DailyEntry;
      notesLabel?: string;
      helperText?: string;
    }
  | {
      type: "textarea";
      name: keyof DailyEntry;
      label: string;
      helperText?: string;
      showWhen?: {
        name: keyof DailyEntry;
        min?: number;
      };
    }
  | {
      type: "number";
      name: keyof DailyEntry;
      label: string;
      min?: number;
      step?: number;
      max?: number;
      helperText?: string;
    }
  | {
      type: "slider";
      name: keyof DailyEntry;
      label: string;
      min: number;
      max: number;
      step: number;
      helperText?: string;
      minLabel?: string;
      maxLabel?: string;
    }
  | {
      type: "select";
      name: keyof DailyEntry;
      label: string;
      options: string[];
      helperText?: string;
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
export const refinedExecutiveDemandOptions = [
  "Computer work",
  "Coaching / clients",
  "Creative work",
  "Admin",
  "Meetings",
  "Social interaction",
  "Repetitive tasks",
  "High task switching",
  "Decision-making",
  "Other"
];
export const executiveFrictionOptions = [
  "Interruptions",
  "Waiting for other people",
  "Too many decisions",
  "Task switching",
  "Boring/repetitive work",
  "Relationship stress",
  "Fatigue",
  "Poor sleep",
  "Physical symptoms",
  "Perfectionism",
  "Other"
];
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
export const overallStateOptions = ["Calm", "Balanced", "Engaged", "Activated", "Wired", "Drained", "Shutdown"];
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
  "High cognitive demand",
  "Constant interruptions",
  "Too many task switches",
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
  "Variety / change of environment",
  "Doing something for myself",
  "Music",
  "Reduced pressure",
  "Flow state",
  "Being heard/seen",
  "Emotional repair"
];
export const energyPatternOptions = [
  "Steady all day",
  "Low in the morning",
  "Afternoon crash",
  "Evening crash",
  "Up and down",
  "Tired but functional",
  "Exhausted / pushed too far"
];
export const endOfDayEnergyOptions = [
  "Exhausted / did too much",
  "Running on fumes",
  "Still had a little energy left",
  "Felt okay but ready to stop",
  "Felt fine",
  "Still had plenty left"
];
export const activationFirstNoticeOptions = [
  "Immediately on waking",
  "Morning",
  "Midday",
  "Afternoon",
  "Evening",
  "Only during a specific event",
  "Not at all"
];
export const simplifiedActivationOptions = ["Heart pounding", "Shallow breathing", "Jumpy", "Feeling on edge", "Defensive / reactive", "None"];
export const amfexaDoseOptions = ["0", "2.5", "5", "7.5", "10", "12.5", "15", "17.5", "20"];
export const activityTypeOptions = [
  "H47 / marketing work",
  "PT / coaching",
  "IPNB / learning",
  "Book / writing",
  "AI project",
  "Admin / life tasks",
  "Social / family",
  "Housework",
  "Training",
  "Other"
];
export const activityTimeOptions = ["Less than 30 mins", "30-60 mins", "1-2 hours", "2-4 hours", "4+ hours"];
export const activityCapacityEffectOptions = [
  "Much more energised",
  "Slightly more energised",
  "No real change",
  "Slightly drained",
  "Very drained"
];
export const activityExecutiveDemandHelper =
  "How much did today's activities require from my executive system? Think about planning, organising, switching tasks, holding information in mind, making decisions, inhibiting distractions, and maintaining focus.<br><br>0-1: Almost no executive effort (holiday, relaxing, passive activities)<br>2-3: Light demand (simple routine tasks, driving familiar routes, easy conversations)<br>4-5: Moderate demand (some planning, meetings, emails, a few task switches)<br>6-7: High demand (sustained concentration, coaching, creative thinking, multiple decisions, problem-solving)<br>8-9: Very high demand (complex planning, constant switching, deadlines, mentally intense work)<br>10: Near maximum demand (brain felt stretched all day, constantly juggling multiple cognitive demands)";
export const activityMeaningHelper =
  "Considering the effort this activity required, how much did it give back? This isn't about enjoyment or how tired I felt afterwards. It's about whether the activity felt worthwhile, nourishing, helped me grow, aligned with my values, or added something meaningful to my life.<br><br>0 = It took far more than it gave back.<br>10 = It gave me far more than it cost.";

export const sections: SectionDefinition[] = [
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
    key: "energy",
    title: "Energy",
    fields: [
      {
        type: "scoreOnly",
        name: "energyScore",
        label: "How much usable energy did I have today?"
      },
      { type: "select", name: "energyPattern", label: "Energy pattern today", options: ["", ...energyPatternOptions] },
      { type: "select", name: "endOfDayEnergy", label: "End-of-day energy", options: ["", ...endOfDayEnergyOptions] },
      { type: "textarea", name: "energyNotes", label: "Energy notes" }
    ]
  },
  {
    key: "clarity",
    title: "Executive capacity",
    prompt:
      "This is about how well my brain worked today: focus, task switching, organising, decision-making, word recall, and how much effort thinking required.",
    fields: [
      {
        type: "scoreOnly",
        name: "clarityScore",
        label: "How mentally clear did I feel today?"
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
        options: refinedExecutiveDemandOptions
      },
      { type: "textarea", name: "clarityNotes", label: "Executive capacity notes" }
    ]
  },
  {
    key: "executiveFriction",
    title: "Executive friction",
    fields: [
      {
        type: "multi",
        name: "executiveFriction",
        label: "What got in the way of doing good work today?",
        helperText: "Tick all that apply.",
        options: executiveFrictionOptions
      }
    ]
  },
  {
    key: "medication",
    title: "ADHD medication",
    fields: [
      { type: "select", name: "amfexaDose", label: "Dose (mg)", options: amfexaDoseOptions },
      {
        type: "select",
        name: "amfexaEffect",
        label: "Today's effect",
        options: ["", "Too weak", "About right", "Too strong"]
      },
      { type: "textarea", name: "adhdMedicationNotes", label: "Anything notable?" }
    ]
  },
  {
    key: "pmddMedication",
    title: "PMDD medication",
    fields: [
      {
        type: "select",
        name: "pmddMedicationTaken",
        label: "Did I take my PMDD medication today?",
        options: ["", "Yes", "No"]
      },
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
      { type: "textarea", name: "medicationNotes", label: "PMDD medication notes" }
    ]
  },
  {
    key: "activation",
    title: "Activation",
    prompt:
      "Activation means my nervous system becoming revved up, tense, anxious, overstimulated, defensive, restless, or on edge.",
    fields: [
      {
        type: "select",
        name: "activationFirstNotice",
        label: "When did I first notice my system becoming activated today?",
        options: ["", ...activationFirstNoticeOptions]
      },
      { type: "multi", name: "activationSigns", label: "Activation signs", options: simplifiedActivationOptions },
      { type: "textarea", name: "activationNotes", label: "Activation notes" }
    ]
  },
  {
    key: "nervous",
    title: "Overall state",
    fields: [
      { type: "select", name: "overallState", label: "What was my overall state today?", options: ["", ...overallStateOptions] },
      { type: "textarea", name: "nervousSystemNotes", label: "Overall state notes" }
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
    key: "digestion",
    title: "Digestion",
    fields: [
      { type: "select", name: "bowelMovementToday", label: "Bowel movement", options: ["", "Yes", "No", "Not sure"] },
      {
        type: "select",
        name: "bowelMovementDescription",
        label: "Stool type",
        options: ["", "Hard/difficult", "Normal", "Loose", "More complete than usual", "Smaller/less complete than usual"]
      },
      { type: "multi", name: "digestiveSymptoms", label: "Digestive changes", options: digestiveOptions },
      { type: "textarea", name: "digestionNotes", label: "Digestion notes" }
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
    key: "activityFit",
    title: "Activity fit / meaning",
    prompt:
      "This section helps identify which activities drain me, which are neutral, and which leave me feeling more like myself.",
    fields: [
      { type: "info", text: "Activity 1" },
      { type: "select", name: "activity1Type", label: "Activity", options: ["", ...activityTypeOptions] },
      { type: "select", name: "activity1Time", label: "Time", options: ["", ...activityTimeOptions] },
      {
        type: "slider",
        name: "activity1ExecutiveDemandScore",
        label: "Executive demand (0-10)",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityExecutiveDemandHelper
      },
      {
        type: "select",
        name: "activity1CapacityEffect",
        label: "After doing this activity I felt...",
        options: ["", ...activityCapacityEffectOptions]
      },
      {
        type: "slider",
        name: "activity1MeaningScore",
        label: "Meaning / contentment",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityMeaningHelper
      },
      { type: "info", text: "Activity 2" },
      { type: "select", name: "activity2Type", label: "Activity", options: ["", ...activityTypeOptions] },
      { type: "select", name: "activity2Time", label: "Time", options: ["", ...activityTimeOptions] },
      {
        type: "slider",
        name: "activity2ExecutiveDemandScore",
        label: "Executive demand (0-10)",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityExecutiveDemandHelper
      },
      {
        type: "select",
        name: "activity2CapacityEffect",
        label: "After doing this activity I felt...",
        options: ["", ...activityCapacityEffectOptions]
      },
      {
        type: "slider",
        name: "activity2MeaningScore",
        label: "Meaning / contentment",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityMeaningHelper
      },
      { type: "info", text: "Activity 3" },
      { type: "select", name: "activity3Type", label: "Activity", options: ["", ...activityTypeOptions] },
      { type: "select", name: "activity3Time", label: "Time", options: ["", ...activityTimeOptions] },
      {
        type: "slider",
        name: "activity3ExecutiveDemandScore",
        label: "Executive demand (0-10)",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityExecutiveDemandHelper
      },
      {
        type: "select",
        name: "activity3CapacityEffect",
        label: "After doing this activity I felt...",
        options: ["", ...activityCapacityEffectOptions]
      },
      {
        type: "slider",
        name: "activity3MeaningScore",
        label: "Meaning / contentment",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityMeaningHelper
      },
      { type: "info", text: "Activity 4" },
      { type: "select", name: "activity4Type", label: "Activity", options: ["", ...activityTypeOptions] },
      { type: "select", name: "activity4Time", label: "Time", options: ["", ...activityTimeOptions] },
      {
        type: "slider",
        name: "activity4ExecutiveDemandScore",
        label: "Executive demand (0-10)",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityExecutiveDemandHelper
      },
      {
        type: "select",
        name: "activity4CapacityEffect",
        label: "After doing this activity I felt...",
        options: ["", ...activityCapacityEffectOptions]
      },
      {
        type: "slider",
        name: "activity4MeaningScore",
        label: "Meaning / contentment",
        min: 0,
        max: 10,
        step: 1,
        helperText: activityMeaningHelper
      },
      {
        type: "textarea",
        name: "flowContentmentActivity",
        label: "Which activity gave me the greatest sense of flow or contentment today?"
      }
    ]
  },
  {
    key: "capacity",
    title: "Capacity check",
    prompt: "This is about sustainability: how much capacity was left at the end of the day, not whether I wanted to keep working.",
    fields: [
      {
        type: "number",
        name: "capacityRemainingScore",
        label: "How much capacity did I have left? (0 = exhausted / pushed beyond capacity, 10 = still had plenty left)",
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
      { type: "textarea", name: "innerCriticNotes", label: "What was it saying?", showWhen: { name: "innerCriticScore", min: 3 } }
    ]
  },
  {
    key: "reflection",
    title: "End of day reflection",
    fields: [
      {
        type: "textarea",
        name: "reflectionInfluencedToday",
        label: "What most influenced today?",
        helperText:
          "Think about the single biggest factor that shaped the day overall. This could be sleep, hormones, pain, work type, relationships, environment, medication, cognitive demand or something else. The aim is to identify the dominant influence rather than list everything that happened."
      },
      { type: "textarea", name: "biggestEnergyDrain", label: "What was today's biggest energy drain?" },
      { type: "textarea", name: "capacityImprovedBy", label: "What most improved my capacity?" }
    ]
  }
];

export function createEmptyEntry(date: string): DailyEntry {
  return {
    date,
    energyScore: 5,
    energyPattern: "",
    endOfDayEnergy: "",
    energyNotes: "",
    clarityScore: 5,
    clarityNotes: "",
    executiveDemandLevel: "",
    executiveDemandTypes: [],
    executiveFriction: [],
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
    amfexaDose: "15",
    amfexaEffect: "",
    amfexaWearOffTime: "",
    adhdMedicationNotes: "",
    bowelMovementToday: "",
    bowelMovementDescription: "",
    feltFullyEmptied: "",
    digestiveSymptoms: [],
    digestionNotes: "",
    overallState: "",
    nervousSystemState: [],
    nervousSystemNotes: "",
    morningActivationScore: "",
    activationFirstNotice: "",
    laterActivation: "",
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
    workSatisfactionScore: "",
    activity1Type: "",
    activity1Time: "",
    activity1ExecutiveDemandScore: "",
    activity1CapacityEffect: "",
    activity1MeaningScore: "",
    activity2Type: "",
    activity2Time: "",
    activity2ExecutiveDemandScore: "",
    activity2CapacityEffect: "",
    activity2MeaningScore: "",
    activity3Type: "",
    activity3Time: "",
    activity3ExecutiveDemandScore: "",
    activity3CapacityEffect: "",
    activity3MeaningScore: "",
    activity4Type: "",
    activity4Time: "",
    activity4ExecutiveDemandScore: "",
    activity4CapacityEffect: "",
    activity4MeaningScore: "",
    flowContentmentActivity: "",
    capacityRemainingScore: "",
    innerCriticScore: "",
    innerCriticNotes: "",
    reflectionInfluencedToday: "",
    biggestEnergyDrain: "",
    capacityImprovedBy: "",
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
