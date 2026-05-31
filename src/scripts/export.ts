import { getAllEntries, importEntries } from "./db";
import { sections, todayIso, type DailyEntry } from "./schema";

const dateInput = document.querySelector<HTMLInputElement>("#export-date");
const preview = document.querySelector<HTMLPreElement>("#export-preview");
const importInput = document.querySelector<HTMLInputElement>("#import-json");

dateInput!.value = todayIso();

function download(filename: string, content: string, type = "text/plain"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function markdownForEntry(entry: DailyEntry): string {
  const lines = [`# Daily Capacity Tracker - ${entry.date}`, ""];
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    for (const field of section.fields) {
      if (field.type === "score") {
        lines.push(`- ${field.label}: ${entry[field.name]}/10`);
        lines.push(`- ${field.notesLabel}: ${entry[field.notesName] || ""}`);
      } else if (field.type === "multi") {
        lines.push(`- ${field.label}: ${(entry[field.name] as string[]).join(", ") || "Not ticked"}`);
      } else {
        lines.push(`- ${field.label}: ${entry[field.name] || ""}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function csv(entries: DailyEntry[]): string {
  const headers = Object.keys(entries[0] ?? { date: "" });
  const rows = entries.map((entry) =>
    headers
      .map((header) => {
        const value = (entry as unknown as Record<string, unknown>)[header];
        const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
        return `"${text.replaceAll('"', '""')}"`;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function setPreview(content: string): void {
  if (preview) preview.textContent = content;
}

document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
  button.addEventListener("click", async () => {
    const entries = await getAllEntries();
    const selectedDate = dateInput?.value || todayIso();
    const action = button.dataset.export;

    if (action === "day-md") {
      const entry = entries.find((item) => item.date === selectedDate);
      const content = entry ? markdownForEntry(entry) : `No entry saved for ${selectedDate}.`;
      setPreview(content);
      if (entry) download(`capacity-${selectedDate}.md`, content, "text/markdown");
    }

    if (action === "month-md") {
      const month = selectedDate.slice(0, 7);
      const content = entries
        .filter((entry) => entry.date.startsWith(month))
        .map(markdownForEntry)
        .join("\n---\n");
      setPreview(content || `No entries saved for ${month}.`);
      if (content) download(`capacity-${month}.md`, content, "text/markdown");
    }

    if (action === "csv") {
      const content = csv(entries);
      setPreview(content);
      download("capacity-tracker.csv", content, "text/csv");
    }

    if (action === "json") {
      const content = JSON.stringify(entries, null, 2);
      setPreview(content);
      download("capacity-tracker-backup.json", content, "application/json");
    }
  });
});

importInput?.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  const entries = JSON.parse(text) as DailyEntry[];
  await importEntries(entries);
  setPreview(`Imported ${entries.length} entries.`);
});
