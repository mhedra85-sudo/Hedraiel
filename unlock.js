/* Hedra V6.4 – Unlock.js (robust) */
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("lockOverlay");
  const input = document.getElementById("pinInput");
  const btn = document.getElementById("unlockBtn");

  if(!overlay || !input || !btn) return;

  const DEFAULT_PIN = "1234";

  function getPin(){
    return (localStorage.getItem("hedra_pin") || DEFAULT_PIN).trim();
  }

  function showError(msg){
    try{
      input.focus();
      input.style.border = "2px solid rgba(220,38,38,.9)";
      setTimeout(()=>input.style.border="", 600);
    }catch(_){}
    alert(msg);
  }

  function unlock(){
    const val = String(input.value||"").trim();
    if(!val) return;
    if(val === getPin()){
      overlay.style.display = "none";
      input.value = "";
      return;
    }
    showError("PIN غير صحيح");
  }

  // force enable (in case previous code disabled it)
  btn.disabled = false;
  btn.style.pointerEvents = "auto";

  btn.addEventListener("click", unlock);
  input.addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlock(); });
});
