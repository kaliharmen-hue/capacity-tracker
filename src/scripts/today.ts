import { getEntry, saveEntry } from "./db";
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

function fieldValue(name: keyof DailyEntry): DailyEntry[keyof DailyEntry] {
  return currentEntry[name];
}

function renderScore(field: Extract<FieldDefinition, { type: "score" }>): string {
  const value = Number(fieldValue(field.name) || 5);
  return `
    <div class="score-field">
      <label for="${field.name}">${field.label}</label>
      <div class="score-row">
        <span>1</span>
        <input id="${field.name}" name="${field.name}" type="range" min="1" max="10" step="1" value="${value}" />
        <output for="${field.name}">${value}</output>
      </div>
    </div>
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
  if (field.type === "score") return renderScore(field);
  if (field.type === "multi") return renderMulti(field);
  if (field.type === "textarea") {
    return `<label class="field-label">${field.label}<textarea name="${field.name}" rows="3">${String(fieldValue(field.name) ?? "")}</textarea></label>`;
  }
  if (field.type === "number") {
    return `<label class="field-label">${field.label}<input name="${field.name}" type="number" min="${field.min ?? ""}" step="${field.step ?? 1}" value="${Number(fieldValue(field.name) ?? 0)}" /></label>`;
  }
  if (field.type === "time") {
    return `<label class="field-label">${field.label}<input name="${field.name}" type="time" value="${String(fieldValue(field.name) ?? "")}" /></label>`;
  }
  return `<label class="field-label">${field.label}<select name="${field.name}">${field.options
    .map((option) => `<option value="${option}" ${fieldValue(field.name) === option ? "selected" : ""}>${option || "Not answered"}</option>`)
    .join("")}</select></label>`;
}

function renderForm(): void {
  if (!sectionsRoot || !dateInput) return;
  isLoading = true;
  dateInput.value = currentEntry.date;
  sectionsRoot.innerHTML = sections
    .map(
      (section) => `
        <section class="form-section">
          <h3>${section.title}</h3>
          ${section.fields.map(renderField).join("")}
        </section>
      `
    )
    .join("");

  sectionsRoot.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => {
      const output = input.closest(".score-row")?.querySelector("output");
      if (output) output.textContent = input.value;
    });
  });
  isLoading = false;
}

async function loadEntry(date: string): Promise<void> {
  currentEntry = { ...createEmptyEntry(date), ...((await getEntry(date)) ?? {}) };
  renderForm();
  setAutosaveStatus("Autosaves as I go");
}

function collectEntry(): DailyEntry {
  if (!form || !dateInput) return currentEntry;
  const data = new FormData(form);
  const entry = createEmptyEntry(dateInput.value || todayIso());

  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === "multi") {
        (entry[field.name] as string[]) = data.getAll(String(field.name)).map(String);
      } else if (field.type === "score" || field.type === "number") {
        (entry[field.name] as number) = Number(data.get(String(field.name)) || 0);
        if (field.type === "score") {
          (entry[field.notesName] as string) = String(data.get(String(field.notesName)) || "");
        }
      } else {
        (entry[field.name] as string) = String(data.get(String(field.name)) || "");
      }
    }
  }

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
form?.addEventListener("change", scheduleSave);
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  scheduleSave();
});

const initialDate = new URLSearchParams(window.location.search).get("date") || todayIso();
updateExportLink(initialDate);
void loadEntry(initialDate);
