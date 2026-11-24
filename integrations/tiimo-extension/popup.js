document.getElementById("read").addEventListener("click", async () => {
 const output = document.getElementById("result");
 try {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url || new URL(tab.url).origin !== "https://webapp.tiimoapp.com") throw new Error("Open the Tiimo planner first.");
  const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
   return {capturedAt:new Date().toISOString(), title:document.title, visibleText:document.body.innerText, inputs:[...document.querySelectorAll("input")].filter(el=>visible(el)&&["text","search"].includes(el.type)).map(el=>el.value).filter(Boolean)};
  }});
  output.textContent=JSON.stringify(result,null,2);
 } catch(error){output.textContent=error.message;}
});