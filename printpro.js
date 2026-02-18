/* Hedra V6.4 – PrintPRO (preview + print + save-as-pdf) */
(function(){
  const $ = (id)=>document.getElementById(id);

  function ensure(){
    const ov=$("printOverlay"), fr=$("printFrame");
    if(!ov||!fr) throw new Error("Print overlay not found");
    return {ov, fr};
  }

  function frameSetHTML(fr, html){
    // srcdoc keeps it same-origin and fast
    fr.srcdoc = html;
  }

  function getFrameWindow(fr){
    return fr.contentWindow;
  }

  function download(filename, text, mime="text/html;charset=utf-8"){
    const blob = new Blob([text], {type:mime});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  let ctx=null;

  function open({title="طباعة", meta="—", fullHtml="", shortHtml=""}){
    const {ov, fr}=ensure();
    ctx={title, meta, fullHtml, shortHtml, mode:"full"};
    $("printMeta").textContent = meta;
    $("toggleShortInvoice").checked = false;
    frameSetHTML(fr, fullHtml);
    ov.style.display="block";
  }

  function close(){
    const {ov}=ensure();
    ov.style.display="none";
    ctx=null;
  }

  function updateMode(){
    if(!ctx) return;
    const {fr}=ensure();
    const isShort = $("toggleShortInvoice").checked;
    ctx.mode = isShort ? "short":"full";
    frameSetHTML(fr, isShort ? (ctx.shortHtml||ctx.fullHtml) : ctx.fullHtml);
  }

  function printNow(){
    if(!ctx) return;
    const {fr}=ensure();
    const w = getFrameWindow(fr);
    if(!w) return;
    w.focus();
    w.print();
  }

  function saveAsPdf(){
    // Honest behavior: uses browser print dialog to Save as PDF (best Arabic support)
    printNow();
  }

  function downloadHtml(){
    if(!ctx) return;
    const html = ($("toggleShortInvoice").checked ? (ctx.shortHtml||ctx.fullHtml) : ctx.fullHtml);
    const safe = String(ctx.title||"print").replace(/[\\/:*?"<>|]+/g,"-");
    download(`${safe}.html`, html, "text/html;charset=utf-8");
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const ov=$("printOverlay");
    if(!ov) return;
    $("btnPrintClose")?.addEventListener("click", close);
    ov.addEventListener("click",(e)=>{ if(e.target===ov) close(); });
    $("toggleShortInvoice")?.addEventListener("change", updateMode);
    $("btnPrintNow")?.addEventListener("click", printNow);
    $("btnPrintPdf")?.addEventListener("click", saveAsPdf);
    $("btnPrintDownloadHtml")?.addEventListener("click", downloadHtml);
  });

  window.PrintPRO = { open, close };
})();
