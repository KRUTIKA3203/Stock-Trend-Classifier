/* ============================================================
   EMERGENCY MODE — BYPASS COGNITO, ALWAYS LOGGED IN
============================================================ */

console.warn("🚨 EMERGENCY MODE ENABLED — Cognito disabled!");

sessionStorage.setItem("access_token", "demo-token-123");   // Force logged-in state

// Fake logout (just clears token and reloads)
function logout() {
    sessionStorage.clear();
    window.location.href = "index.html";
}
