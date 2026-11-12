/** Presentation only: keep saved values and privacy preferences untouched. */
export function refreshOptionalFields() {
  const breakfast = document.querySelector<HTMLSelectElement>("#breakfast-choice");
  const other = document.querySelector<HTMLElement>("#breakfast-other-field");
  if (other) other.hidden = breakfast?.value !== "Other quick protein breakfast";
  document.querySelectorAll<HTMLDetailsElement>("[data-optional-note]").forEach(details => {
    const note = details.querySelector<HTMLTextAreaElement>("textarea");
    details.open = Boolean(note?.value.trim());
  });
}

export function openCapacityDialog(id: string, target?: string) {
  const dialog = document.getElementById(id);
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (!dialog.open) dialog.showModal();
  if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
}

export function initCapacityUI() {
  document.querySelectorAll<HTMLButtonElement>("[data-open-dialog]").forEach(button => {
    button.addEventListener("click", () => openCapacityDialog(button.dataset.openDialog!, button.dataset.dialogTarget));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
  document.querySelector("#breakfast-choice")?.addEventListener("change", () => {
    const other = document.querySelector<HTMLElement>("#breakfast-other-field");
    const breakfast = document.querySelector<HTMLSelectElement>("#breakfast-choice");
    if (other) other.hidden = breakfast?.value !== "Other quick protein breakfast";
  });
  // Remember only a section on this device; never persist form contents here.
  const ids = ["capacity-form", "v2-check-in", "v2-food-section"];
  document.querySelectorAll<HTMLAnchorElement>(".capacity-day-controls nav a").forEach(link => {
    link.addEventListener("click", () => {
      try { sessionStorage.setItem("personal-os-last-section", link.hash.slice(1)); } catch { /* Optional convenience. */ }
    });
  });
  if (!location.hash) {
    try {
      const id = sessionStorage.getItem("personal-os-last-section");
      if (id && ids.includes(id)) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    } catch { /* Storage is optional. */ }
  }
}
