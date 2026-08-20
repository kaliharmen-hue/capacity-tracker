import { getEntry, saveEntry } from "./db";
import { experimentEndDate, experimentIsActiveOn, experimentName, loadExperiment, type Experiment } from "./experiment-model";
import { createEmptyEntry, sections, todayIso, type DailyEntry, type FieldDefinition } from "./schema";

const form = document.querySelector<HTMLFormElement>("#entry-form");
const dateInput = document.querySelector<HTMLInputElement>("#entry-date");
const sectionsRoot = document.querySelector<HTMLDivElement>("#form-sections");
const autosaveStatus = document.querySelector<HTMLParagraphElement>("#autosave-status");
const exportLink = document.querySelector<HTMLAnchorElement>("#entry-export-link");
const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

let currentEntry = createEmptyEntry(todayIso());
let saveTimer: number | undefined;
let isLoading = false;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function activeExperimentFor(date: string): Experiment | undefined {
  const experiment = loadExperiment();
  return experiment && experimentIsActiveOn(experiment, date) ? experiment : undefined;
}

function visibleSections(date: string) {
  const experiment = activeExperimentFor(date);
  return sections.filter((section) => section.key !== "experiment" || experiment);
}

function fieldValue(name: keyof DailyEntry): DailyEntry[keyof DailyEntry] {
  return currentEntry[name];
}

function renderScoreControl(field: Extract<FieldDefinition, { type: "score" | "scoreOnly" }>): string {
  const value = Number(fieldValue(field.name) || 5);
  return `
    <div class="score-field">
      <label for="${field.name}">${field.label}</label>
      ${field.helperText ? `<p class="field-helper">${field.helperText}</p>` : ""}
      <div class="score-row">
        <span>1</span>
        <input id="${field.name}" name="${field.name}" type="range" min="1" max="10" step="1" value="${value}" />
        <output for="${field.name}">${value}</output>
      </div>
    </div>
  `;
}

function renderSlider(field: Extract<FieldDefinition, { type: "slider" }>): string {
  const storedValue = fieldValue(field.name);
  const value = typeof storedValue === "number" ? storedValue : field.min;
  return `
    <div class="score-field">
      <label for="${field.name}">${field.label}</label>
      ${field.helperText ? `<p class="field-helper">${field.helperText}</p>` : ""}
      <div class="score-row slider-row">
        <span>${field.minLabel ?? field.min}</span>
        <input id="${field.name}" name="${field.name}" type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${value}" />
        <output for="${field.name}">${value}</output>
        <span>${field.maxLabel ?? field.max}</span>
      </div>
    </div>
  `;
}

function renderScore(field: Extract<FieldDefinition, { type: "score" }>): string {
  return `
    ${renderScoreControl(field)}
    <label class="field-label">${field.notesLabel}
      <textarea name="${field.notesName}" rows="3">${String(fieldValue(field.notesName) ?? "")}</textarea>
    </label>
  `;
}

function renderMulti(field: Extract<FieldDefinition, { type: "multi" }>): string {
  const selected = new Set((fieldValue(field.name) as string[]) ?? []);
  return `
    <fieldset class="option-group">
      <legend>${field.label}</legend>
      ${field.helperText ? `<p class="field-helper">${field.helperText}</p>` : ""}
      <div class="chips">
        ${field.options
          .map(
            (option) => `
              <label class="chip">
                <input type="checkbox" name="${field.name}" value="${option}" ${selected.has(option) ? "checked" : ""} />
                <span>${option}</span>
              </label>
            `
          )
          .join("")}
      </div>
    </fieldset>
    ${
      field.notesName
        ? `<label class="field-label">${field.notesLabel ?? "Notes"}<textarea name="${field.notesName}" rows="3">${String(fieldValue(field.notesName) ?? "")}</textarea></label>`
        : ""
    }
  `;
}

function renderField(field: FieldDefinition): string {
  if (field.type === "info") return `<div class="field-divider">${field.text}</div>`;
  if (field.type === "score") return renderScore(field);
  if (field.type === "scoreOnly") return renderScoreControl(field);
  if (field.type === "slider") return renderSlider(field);
  if (field.type === "multi") return renderMulti(field);
  if (field.type === "textarea") {
    const condition = field.showWhen
      ? ` data-show-when="${String(field.showWhen.name)}" data-show-min="${field.showWhen.min ?? ""}"`
      : "";
    return `<label class="field-label"${condition}>${field.label}${field.helperText ? `<span class="field-helper">${field.helperText}</span>` : ""}<textarea name="${field.name}" rows="3">${String(fieldValue(field.name) ?? "")}</textarea></label>`;
  }
  if (field.type === "number") {
    return `<label class="field-label">${field.label}${field.helperText ? `<span class="field-helper">${field.helperText}</span>` : ""}<input name="${field.name}" type="number" min="${field.min ?? ""}" max="${field.max ?? ""}" step="${field.step ?? 1}" value="${String(fieldValue(field.name) ?? "")}" /></label>`;
  }
  if (field.type === "time") {
    return `<label class="field-label">${field.label}<input name="${field.name}" type="time" value="${String(fieldValue(field.name) ?? "")}" /></label>`;
  }
  const condition = field.showWhenValue
    ? ` data-show-when-value="${String(field.showWhenValue.name)}" data-show-value="${field.showWhenValue.value}"`
    : field.showWhenAny
      ? ` data-show-when-any="${String(field.showWhenAny.name)}" data-show-excluding="${(field.showWhenAny.excluding ?? []).join("|")}"`
      : field.showWhenReducedCapacity
        ? ` data-show-when-reduced-capacity="true"`
      : "";
  return `<label class="field-label"${condition}>${field.label}${field.helperText ? `<span class="field-helper">${field.helperText}</span>` : ""}<select name="${field.name}">${field.options
    .map((option) => `<option value="${option}" ${String(fieldValue(field.name) ?? "") === option ? "selected" : ""}>${option || "Not answered"}</option>`)
    .join("")}</select></label>`;
}

function renderForm(): void {
  if (!sectionsRoot || !dateInput) return;
  isLoading = true;
  dateInput.value = currentEntry.date;
  const experiment = activeExperimentFor(currentEntry.date);
  sectionsRoot.innerHTML = visibleSections(currentEntry.date)
    .map(
      (section) => {
        const prompt = section.key === "experiment" && experiment
          ? `<strong>${escapeHtml(experimentName(experiment))}</strong><br>${escapeHtml(experiment.startDate)} to ${escapeHtml(experimentEndDate(experiment))}${experiment.plan ? `<br>${escapeHtml(experiment.plan)}` : ""}`
          : section.prompt;
        return `
        <section class="form-section">
          <h3>${section.title}</h3>
          ${prompt ? `<p class="section-prompt">${prompt}</p>` : ""}
          ${section.fields.map(renderField).join("")}
        </section>
      `;
      }
    )
    .join("");

  sectionsRoot.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => {
      const output = input.closest(".score-row")?.querySelector("output");
      if (output) output.textContent = input.value;
    });
  });
  updateConditionalFields();
  isLoading = false;
}

function updateConditionalFields(): void {
  if (!sectionsRoot) return;
  sectionsRoot.querySelectorAll<HTMLElement>("[data-show-when]").forEach((element) => {
    const fieldName = element.dataset.showWhen;
    const min = Number(element.dataset.showMin || 0);
    const control = fieldName ? sectionsRoot.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${fieldName}"]`) : undefined;
    const value = Number(control?.value || 0);
    element.hidden = !Number.isFinite(value) || value < min;
  });
  sectionsRoot.querySelectorAll<HTMLElement>("[data-show-when-value]").forEach((element) => {
    const source = element.dataset.showWhenValue;
    const control = source ? sectionsRoot.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${source}"]`) : null;
    element.hidden = control?.value !== element.dataset.showValue;
    if (element.hidden) element.querySelector<HTMLSelectElement>("select")!.value = "";
  });
  sectionsRoot.querySelectorAll<HTMLElement>("[data-show-when-any]").forEach((element) => {
    const source = element.dataset.showWhenAny;
    const excluded = new Set((element.dataset.showExcluding ?? "").split("|").filter(Boolean));
    const checked = source ? [...sectionsRoot.querySelectorAll<HTMLInputElement>(`input[name="${source}"]:checked`)].some((input) => !excluded.has(input.value)) : false;
    element.hidden = !checked;
    if (element.hidden) element.querySelector<HTMLSelectElement>("select")!.value = "";
  });
  sectionsRoot.querySelectorAll<HTMLElement>("[data-show-when-reduced-capacity]").forEach((element) => {
    const energy = Number(sectionsRoot.querySelector<HTMLInputElement>('[name="energyScore"]')?.value || 0);
    const clarity = Number(sectionsRoot.querySelector<HTMLInputElement>('[name="clarityScore"]')?.value || 0);
    const remainingRaw = sectionsRoot.querySelector<HTMLInputElement>('[name="capacityRemainingScore"]')?.value ?? "";
    const remaining = remainingRaw === "" ? null : Number(remainingRaw);
    const isReduced = energy <= 4 || clarity <= 4 || (remaining !== null && remaining <= 4);
    element.hidden = !isReduced;
    if (element.hidden) {
      const select = element.querySelector<HTMLSelectElement>("select");
      if (select) select.value = "";
    }
  });
}

async function loadEntry(date: string): Promise<void> {
  currentEntry = { ...createEmptyEntry(date), ...((await getEntry(date)) ?? {}) };
  renderForm();
  setAutosaveStatus("Autosaves as I go");
}

function collectEntry(): DailyEntry {
  if (!form || !dateInput) return currentEntry;
  const data = new FormData(form);
  const entry = { ...createEmptyEntry(dateInput.value || todayIso()), ...currentEntry, date: dateInput.value || todayIso() };

  const experiment = activeExperimentFor(entry.date);
  for (const section of visibleSections(entry.date)) {
    for (const field of section.fields) {
      if (field.type === "info") {
        continue;
      } else if (field.type === "multi") {
        (entry[field.name] as string[]) = data.getAll(String(field.name)).map(String);
      } else if (field.type === "score" || field.type === "scoreOnly" || field.type === "number" || field.type === "slider") {
        const rawValue = String(data.get(String(field.name)) ?? "");
        (entry[field.name] as number | "") = rawValue === "" ? "" : Number(rawValue);
        if (field.type === "score") {
          (entry[field.notesName] as string) = String(data.get(String(field.notesName)) || "");
        }
      } else {
        (entry[field.name] as string) = String(data.get(String(field.name)) || "");
      }
    }
  }

  const amfexaDoseFields = ["amfexaDose1", "amfexaDose2", "amfexaDose3"] as const;
  const hasAmfexaTiming = amfexaDoseFields.some((name) => String(entry[name] ?? "") !== "") ||
    ["amfexaTime1", "amfexaTime2", "amfexaTime3"].some((name) => String(entry[name as keyof DailyEntry] ?? "") !== "");
  if (hasAmfexaTiming) {
    const total = amfexaDoseFields.reduce((sum, name) => sum + (Number(entry[name]) || 0), 0);
    entry.amfexaDose = String(total);
  }

  const caffeineAmountFields = ["caffeine1Tablespoons", "caffeine2Tablespoons", "caffeine3Tablespoons", "caffeine4Tablespoons"] as const;
  const caffeineTimeFields = ["caffeine1Time", "caffeine2Time", "caffeine3Time", "caffeine4Time"] as const;
  const hasCaffeineTiming = caffeineAmountFields.some((name) => String(entry[name] ?? "") !== "") || caffeineTimeFields.some((name) => entry[name] !== "");
  if (hasCaffeineTiming) {
    entry.coffees = caffeineAmountFields.filter((name) => String(entry[name] ?? "") !== "").length;
    entry.lastCoffeeTime = caffeineTimeFields.map((name) => String(entry[name] ?? "")).filter(Boolean).sort().at(-1) ?? "";
  }

  if (experiment) entry.experimentName = experimentName(experiment);

  return entry;
}

function setAutosaveStatus(message: string): void {
  if (autosaveStatus) autosaveStatus.textContent = message;
}

function updateExportLink(date: string): void {
  if (exportLink) exportLink.href = `${base}export/?date=${encodeURIComponent(date)}`;
}

function scheduleSave(): void {
  if (isLoading) return;
  window.clearTimeout(saveTimer);
  setAutosaveStatus("Saving...");
  saveTimer = window.setTimeout(async () => {
    const entry = collectEntry();
    await saveEntry(entry);
    currentEntry = entry;
    updateExportLink(entry.date);
    setAutosaveStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }, 550);
}

dateInput?.addEventListener("change", () => {
  window.clearTimeout(saveTimer);
  void loadEntry(dateInput.value);
});

form?.addEventListener("input", scheduleSave);
form?.addEventListener("input", updateConditionalFields);
form?.addEventListener("change", scheduleSave);
form?.addEventListener("change", updateConditionalFields);
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  scheduleSave();
});

const initialDate = new URLSearchParams(window.location.search).get("date") || todayIso();
updateExportLink(initialDate);
void loadEntry(initialDate);
