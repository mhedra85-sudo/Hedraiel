
// Hedra V6.4 – Robust Unlock System
document.addEventListener("DOMContentLoaded", function () {

  const overlay = document.getElementById("lockOverlay");
  const input = document.getElementById("pinInput");
  const btn = document.getElementById("unlockBtn");

  if (!overlay || !input || !btn) {
    console.warn("Unlock elements not found.");
    return;
  }

  const DEFAULT_PIN = "1234";
  const SAVED_PIN = localStorage.getItem("hedra_pin") || DEFAULT_PIN;

  function unlock() {
    const value = input.value.trim();
    if (!value) return;

    if (value === SAVED_PIN) {
      overlay.style.display = "none";
      input.value = "";
    } else {
      input.style.border = "2px solid red";
      setTimeout(() => input.style.border = "", 500);
      alert("PIN غير صحيح");
    }
  }

  btn.addEventListener("click", unlock);
  input.addEventListener("keydown", function(e){
    if (e.key === "Enter") unlock();
  });

  btn.disabled = false;
  btn.style.pointerEvents = "auto";
});
