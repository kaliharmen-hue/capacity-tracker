import { buildInsights, relationalStressLevel, relationalStressScore } from "./analytics";
import { getAllEntries } from "./db";

const insightList = document.querySelector<HTMLDivElement>("#insight-list");
const entries = await getAllEntries();
const insights = buildInsights(entries);

if (insightList) {
  insightList.innerHTML = insights
    .map(
      (insight) => `
        <article class="insight-card">
          <p>${insight}</p>
        </article>
      `
    )
    .join("");

  const latest = entries.at(-1);
  if (latest) {
    const score = relationalStressScore(latest);
    insightList.insertAdjacentHTML(
      "afterbegin",
      `<article class="insight-card featured"><p>Latest relational stress score: ${score} (${relationalStressLevel(score)}). Energy and capacity are still separate signals.</p></article>`
    );
  }
}
