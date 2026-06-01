import { getAllEntries, importEntries } from "./db";
import { sections, todayIso, type DailyEntry } from "./schema";

const dateInput = document.querySelector<HTMLInputElement>("#export-date");
const preview = document.querySelector<HTMLPreElement>("#export-preview");
const importInput = document.querySelector<HTMLInputElement>("#import-json");
const backupStatus = document.querySelector<HTMLDivElement>("#backup-status");
const copyStatus = document.querySelector<HTMLParagraphElement>("#copy-status");
const shareActions = document.querySelector<HTMLDivElement>("#share-actions");
const sharePreviewButton = document.querySelector<HTMLButtonElement>("[data-share-preview]");
const selectPreviewButton = document.querySelector<HTMLButtonElement>("[data-select-preview]");
const backupKey = "capacity-tracker-last-json-backup";
let latestPreviewText = "";

dateInput!.value = todayIso();

function renderBackupStatus(): void {
  if (!backupStatus) return;
  const lastBackup = localStorage.getItem(backupKey);
  if (!lastBackup) {
    backupStatus.innerHTML = `
      <div class="notice-card warm">
        <strong>No backup recorded yet</strong>
        <p>Once I have real entries here, exporting a JSON backup gives me a copy I can restore later.</p>
      </div>
    `;
    return;
  }

  const lastDate = new Date(lastBackup);
  const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
  const tone = daysSince >= 7 ? "warm" : "calm";
  const message =
    daysSince >= 7
      ? "It has been a week or more since the last JSON backup recorded in this browser."
      : "A JSON backup has been recorded recently in this browser.";

  backupStatus.innerHTML = `
    <div class="notice-card ${tone}">
      <strong>Last backup: ${lastDate.toLocaleDateString()}</strong>
      <p>${message}</p>
    </div>
  `;
}

function download(filename: string, content: string, type = "text/plain"): void {
  if (!content.trim()) {
    setPreview("There is nothing to export yet. Save an entry first, then come back here.");
    return;
  }
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
  if (!entries.length) return "";
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
  latestPreviewText = content;
  if (preview) preview.textContent = content;
  if (shareActions) shareActions.hidden = !content.trim();
}

function showEmptyState(scope: string): string {
  const message = `No entries saved for ${scope} yet. I can fill in today's tracker first, then export or copy it here.`;
  if (copyStatus) copyStatus.textContent = message;
  return message;
}

async function copyForChatGPT(content: string): Promise<void> {
  setPreview(content);
  if (!content.trim()) return;
  if (await sharePreviewText()) return;
  try {
    await navigator.clipboard.writeText(content);
    if (copyStatus) copyStatus.textContent = "Copied. I can paste this into my ChatGPT project thread now.";
  } catch {
    selectPreviewText();
  }
}

async function sharePreviewText(): Promise<boolean> {
  if (!latestPreviewText.trim()) return false;
  if (!navigator.share) return false;
  try {
    await navigator.share({
      title: "Capacity Tracker export",
      text: latestPreviewText
    });
    if (copyStatus) copyStatus.textContent = "Shared. I can paste it into ChatGPT from there.";
    return true;
  } catch {
    return false;
  }
}

function selectPreviewText(): void {
  if (!preview) return;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(preview);
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (copyStatus) copyStatus.textContent = "Preview text is selected. I can tap Copy, then paste into ChatGPT.";
}

document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
  button.addEventListener("click", async () => {
    const entries = await getAllEntries();
    const selectedDate = dateInput?.value || todayIso();
    const action = button.dataset.export;

    if (action === "day-md") {
      const entry = entries.find((item) => item.date === selectedDate);
      const content = entry ? markdownForEntry(entry) : showEmptyState(selectedDate);
      setPreview(content);
      if (entry) download(`capacity-${selectedDate}.md`, content, "text/markdown");
    }

    if (action === "day-copy") {
      const entry = entries.find((item) => item.date === selectedDate);
      const content = entry ? markdownForEntry(entry) : showEmptyState(selectedDate);
      await copyForChatGPT(content);
    }

    if (action === "month-md") {
      const month = selectedDate.slice(0, 7);
      const content = entries
        .filter((entry) => entry.date.startsWith(month))
        .map(markdownForEntry)
        .join("\n---\n");
      setPreview(content || showEmptyState(month));
      if (content) download(`capacity-${month}.md`, content, "text/markdown");
    }

    if (action === "month-copy") {
      const month = selectedDate.slice(0, 7);
      const content = entries
        .filter((entry) => entry.date.startsWith(month))
        .map(markdownForEntry)
        .join("\n---\n");
      await copyForChatGPT(content || showEmptyState(month));
    }

    if (action === "csv") {
      const content = csv(entries);
      setPreview(content || showEmptyState("any date"));
      if (content) download("capacity-tracker.csv", content, "text/csv");
    }

    if (action === "json") {
      const content = JSON.stringify(entries, null, 2);
      setPreview(entries.length ? content : showEmptyState("any date"));
      if (entries.length) {
        download("capacity-tracker-backup.json", content, "application/json");
        localStorage.setItem(backupKey, new Date().toISOString());
        renderBackupStatus();
      }
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

sharePreviewButton?.addEventListener("click", () => {
  void sharePreviewText();
});

selectPreviewButton?.addEventListener("click", selectPreviewText);

renderBackupStatus();
