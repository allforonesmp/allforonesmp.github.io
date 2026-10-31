/* =========================================================================
   Authentication — approved-account access to the archive
   ========================================================================= */

import { icon } from "./icons.js";
import { esc } from "./util.js";

export function renderAuth(host, { onLogin, error = "", notice = "", allowOffline = false, onOffline = null, checking = false } = {}) {
    host.hidden = false;
    host.innerHTML = `
    <div class="auth-visual">
        <div class="auth-brand">
            <img src="../images/logo.png" alt="" onerror="this.style.display='none'" />
            <div><b>AllForOne SMP</b><span>Story Plan</span></div>
        </div>
        <div class="auth-copy">
            <div class="eyebrow">Restricted archive</div>
            <h1>The server has a story.<br /><em>This is where it is kept.</em></h1>
            <p>Every character, faction, betrayal and unresolved question — recorded, connected and mapped. Access is limited to approved members of the writing team.</p>
        </div>
        <div class="auth-meta">
            <div><b>AllForOne SMP</b>Production universe</div>
            <div><b>BreadBackend</b>Encrypted cloud archive</div>
            <div><b>Private</b>Approved accounts only</div>
        </div>
    </div>
    <div class="auth-form-wrap">
        <div class="auth-card">
            <div class="eyebrow">Sign in</div>
            <h2>Open the archive</h2>
            <p class="lead">Use the email address and password issued to you by the archive owner.</p>
            ${error ? `<div class="auth-error">${icon("alert")}<div>${esc(error)}</div></div>` : ""}
            ${notice ? `<div class="auth-notice">${icon("info")}<div>${esc(notice)}</div></div>` : ""}
            ${
                allowOffline
                    ? `<div class="auth-notice">${icon("cloudOff")}<div>The backend is unreachable. You have a verified session on this device — you can open the archive in offline mode. Changes will be stored locally until the connection returns.</div></div>
                       <button class="btn full lg" data-offline style="margin-bottom:14px">${icon("cloudOff")} Continue offline</button>
                       <div class="auth-row" style="margin:0 0 14px"><span></span><span style="flex:1;height:1px;background:var(--line-soft)"></span><span>or sign in again</span><span style="flex:1;height:1px;background:var(--line-soft)"></span><span></span></div>`
                    : ""
            }
            <form data-auth-form novalidate>
                <div class="auth-field">
                    <label for="auth-email">Email address</label>
                    <input id="auth-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required />
                </div>
                <div class="auth-field">
                    <label for="auth-password">Password</label>
                    <input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••••" required />
                </div>
                <div class="auth-row">
                    <label class="checkline"><input type="checkbox" data-remember checked /> Keep me signed in</label>
                    <button type="button" class="auth-link" data-forgot>Forgot password?</button>
                </div>
                <button class="btn primary full lg" type="submit" data-submit ${checking ? "disabled" : ""}>
                    ${checking ? "Checking credentials…" : `${icon("lock")} Enter the archive`}
                </button>
            </form>
            <div class="auth-foot">
                <b>Access is by invitation.</b> Accounts are created by the archive owner and checked against the access list on every sign-in. If you need access, contact the owner with the email address you want to use.
                <div class="tiny" style="margin-top:10px;color:var(--faint)">
                    <button type="button" class="auth-link" data-retry-connection>Retry connection</button>
                    <span style="margin:0 6px">·</span>
                    <span>Session protected by BreadBackend</span>
                </div>
            </div>
        </div>
    </div>`;

    const form = host.querySelector("[data-auth-form]");
    const submit = host.querySelector("[data-submit]");
    const emailInput = host.querySelector("#auth-email");
    const passInput = host.querySelector("#auth-password");
    const showError = (msg) => {
        let box = host.querySelector(".auth-error");
        if (!box) {
            box = document.createElement("div");
            box.className = "auth-error";
            host.querySelector(".auth-card .lead").after(box);
        }
        box.innerHTML = `${icon("alert")}<div>${esc(msg)}</div>`;
    };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !/.+@.+\..+/.test(email)) {
            showError("Enter a valid email address.");
            emailInput.focus();
            return;
        }
        if (!password) {
            showError("Enter your password.");
            passInput.focus();
            return;
        }
        submit.disabled = true;
        submit.classList.add("loading");
        showError("");
        host.querySelector(".auth-error")?.remove();
        try {
            await onLogin(email, password, { remember: host.querySelector("[data-remember]").checked });
        } catch (err) {
            submit.disabled = false;
            submit.classList.remove("loading");
            showError(err?.message || "Sign-in failed. Please try again.");
        }
    });

    host.querySelector("[data-offline]")?.addEventListener("click", () => onOffline?.());
    host.querySelector("[data-retry-connection]")?.addEventListener("click", () => location.reload());
    host.querySelector("[data-forgot]")?.addEventListener("click", () => {
        const email = emailInput.value.trim();
        if (!email) {
            showError("Enter your email address first, then choose “Forgot password”.");
            emailInput.focus();
            return;
        }
        window.dispatchEvent(new CustomEvent("afo-forgot-password", { detail: { email } }));
    });
    setTimeout(() => emailInput.focus(), 120);
}

export function renderAccessDenied(host, { email, onSignOut, onRetry }) {
    host.hidden = false;
    host.innerHTML = `
    <div class="auth-visual">
        <div class="auth-brand">
            <img src="../images/logo.png" alt="" onerror="this.style.display='none'" />
            <div><b>AllForOne SMP</b><span>Story Plan</span></div>
        </div>
        <div class="auth-copy">
            <div class="eyebrow">Access denied</div>
            <h1>This account is not<br /><em>on the access list.</em></h1>
            <p>Your credentials were accepted, but this email has not been approved for the Story Plan archive. Ask the archive owner to add you in Settings → Access control.</p>
        </div>
        <div class="auth-meta">
            <div><b>${esc(email || "Unknown account")}</b>Signed in</div>
            <div><b>0 records</b>Visible to this account</div>
        </div>
    </div>
    <div class="auth-form-wrap">
        <div class="auth-card">
            <div class="eyebrow">Restricted</div>
            <h2>Access not granted</h2>
            <p class="lead">The account <b style="color:var(--text-soft)">${esc(email)}</b> exists, but it is not approved for this archive.</p>
            <div class="auth-notice">${icon("info")}<div>If you believe this is a mistake, the owner can approve this email under Settings → Access control. Nothing from the archive has been loaded on this device.</div></div>
            <button class="btn full lg" data-signout style="margin-bottom:8px">${icon("logout")} Sign out</button>
            <button class="btn full" data-retry>${icon("refresh")} I've been approved — check again</button>
        </div>
    </div>`;
    host.querySelector("[data-signout]")?.addEventListener("click", onSignOut);
    host.querySelector("[data-retry]")?.addEventListener("click", onRetry);
}

export function renderBackendError(host, { message, onRetry }) {
    host.hidden = false;
    host.innerHTML = `
    <div class="auth-form-wrap" style="grid-column:1/-1;min-height:100vh">
        <div class="auth-card" style="text-align:left">
            <div class="eyebrow">Connection</div>
            <h2>Archive unreachable</h2>
            <p class="lead">${esc(message || "The BreadBackend client could not be loaded.")}</p>
            <div class="auth-error">${icon("cloudOff")}<div>The story archive is stored in BreadBackend. Without a connection it cannot verify your access or load your data.</div></div>
            <button class="btn primary full lg" data-retry>${icon("refresh")} Retry connection</button>
            <div class="auth-foot">
                <b>If this keeps happening</b>, check that <span class="mono">kaidaz18.duckdns.org</span> is reachable from this network, that the backend is running, and that no browser extension is blocking the SDK.
            </div>
        </div>
    </div>`;
    host.querySelector("[data-retry]")?.addEventListener("click", () => location.reload());
    onRetry && host.querySelector("[data-retry]").addEventListener("click", onRetry);
}
