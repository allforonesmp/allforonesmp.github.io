/* AllForOne Story Planner — authentication & access control gate.
 *
 * Sessions live in the BreadBackend SDK's own token storage; no password is
 * ever held by this app. Beyond authentication, access is gated by a `members`
 * collection so a signed-in but unapproved account cannot see story data:
 *
 *   • If the collection has no records, the first account becomes owner.
 *   • Owner approves/removes members from Settings → Members.
 *
 * IMPORTANT LIMITATION: BreadBackend's public client key carries no per-user
 * roles, and collection reads are enforced only by project rules. A determined
 * signed-up account could still call the API directly, so open signup must be
 * disabled / invite-only in the BreadBackend dashboard. This gate is the second
 * line of defence, not a substitute for that setting.
 */

import { auth, db, COLLECTIONS, onUnauthorized, ApiError } from "./api.js";
import { el, clear } from "./util.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentMember = null;
let onReady = null;
let settled = false;

export function getUser() {
    return currentUser;
}

export function getMember() {
    return currentMember;
}

export function isOwner() {
    return currentMember?.role === "owner";
}

function showPanel(name) {
    ["Booting", "Login", "Signup", "Forgot", "Verify", "Denied", "Fatal"].forEach((p) => {
        const node = $(`gate${p}`);
        if (node) node.hidden = p.toLowerCase() !== name.toLowerCase();
    });
    const gate = $("gate");
    if (gate) gate.hidden = false;
}

/** Named form control lookup (works with `form.elements` semantics). */
function field(form, name) {
    const el = form.elements && form.elements.namedItem(name);
    return el || form.querySelector(`[name="${name}"]`);
}

function errorText(err) {
    if (!err) return "Something went wrong.";
    if (err instanceof ApiError) return err.message;
    return err.message || err.error || String(err);
}

function setError(id, message) {
    const node = $(id);
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
}

function buttonBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = busy;
    if (busy) {
        btn.dataset.label = btn.textContent;
        clear(btn);
        const span = el("span", { class: "spinner" });
        btn.append(span, document.createTextNode(label || "Working…"));
    } else if (btn.dataset.label) {
        btn.textContent = btn.dataset.label;
    }
}

/* ------------------------------------------------------------- membership */

const OWNER_EMAIL_KEY = "afo_storyplan_owner_email";

async function resolveMembership(user) {
    const email = String(user.email || "").toLowerCase();
    let members = [];
    let listFailed = false;
    try {
        members = await db.list(COLLECTIONS.members, { limit: 500 });
    } catch (err) {
        listFailed = true;
        console.warn("[story-plan] members collection unavailable", err?.message || err);
    }

    if (!members.length) {
        // Bootstrap: the first account claims ownership. Recorded locally too,
        // so a failed first write cannot hand ownership to a later visitor.
        const claimed = localStorage.getItem(OWNER_EMAIL_KEY);
        if (claimed && claimed !== email) {
            return { role: "pending", status: "pending", email, note: "owner-claimed-elsewhere" };
        }
        try {
            const created = await db.create(
                COLLECTIONS.members,
                { email, role: "owner", status: "active", approvedAt: new Date().toISOString(), note: "First account — workspace owner" },
                `member_${email.replace(/[^a-z0-9]/g, "_")}`
            );
            localStorage.setItem(OWNER_EMAIL_KEY, email);
            return created;
        } catch (err) {
            console.warn("[story-plan] could not persist owner membership", err?.message || err);
            if (listFailed) {
                // No members collection at all: run as owner for this session
                // and surface the limitation in Settings.
                localStorage.setItem(OWNER_EMAIL_KEY, email);
                return { email, role: "owner", status: "active", ephemeral: true };
            }
            return { email, role: "pending", status: "pending" };
        }
    }

    const existing = members.find((m) => String(m.email || "").toLowerCase() === email);
    if (existing) {
        if (existing.role === "owner" && existing.status !== "active") {
            return { ...existing, status: "active" };
        }
        return existing;
    }
    if (members.some((m) => m.role === "owner")) {
        return { email, role: "pending", status: "pending" };
    }
    return { email, role: "pending", status: "pending" };
}

/* ------------------------------------------------------------------ flows */

async function enterApp(user, member) {
    currentUser = user;
    currentMember = member;
    $("gate").hidden = true;
    if (onReady) await onReady(user, member);
}

async function afterLogin(user) {
    if (!user) {
        showPanel("Login");
        return;
    }
    if (user.isVerified === false) {
        const copy = $("verifyCopy");
        if (copy) {
            copy.textContent = `${user.email || "Your email"} has not been verified yet. You can still continue — verification protects password resets.`;
        }
        showPanel("Verify");
        // stash the pending user so Continue can proceed
        pendingUser = user;
        return;
    }
    await gateOnUser(user);
}

async function gateOnUser(user) {
    showPanel("Booting");
    const member = await resolveMembership(user);
    if (member.status === "active" || member.status === "approved" || member.role === "owner" || member.role === "editor") {
        await enterApp(user, member);
        return;
    }
    const deniedEmail = $("deniedEmail");
    if (deniedEmail) deniedEmail.textContent = user.email || "—";
    showPanel("Denied");
}

let pendingUser = null;

async function checkSession() {
    if (!auth.hasToken()) {
        showPanel("Login");
        return;
    }
    showPanel("Booting");
    try {
        const user = await auth.me();
        if (!user) {
            showPanel("Login");
            return;
        }
        currentUser = user;
        $("gate").hidden = true;
        if (user.isVerified === false) {
            const copy = $("verifyCopy");
            if (copy) copy.textContent = `${user.email || "Your email"} has not been verified yet. You can still continue — verification protects password resets.`;
            pendingUser = user;
            showPanel("Verify");
            return;
        }
        await gateOnUser(user);
    } catch (err) {
        if (err?.status === 401) {
            showPanel("Login");
        } else {
            const copy = $("fatalCopy");
            if (copy) copy.textContent = errorText(err);
            showPanel("Fatal");
        }
    }
}

function wire() {
    // --- navigation between panels
    document.querySelectorAll("[data-gate-go]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.gateGo;
            setError("loginError", "");
            setError("signupError", "");
            setError("resetError", "");
            showPanel(target.charAt(0).toUpperCase() + target.slice(1));
        });
    });

    // --- login
    $("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector("button[type=submit]");
        setError("loginError", "");
        const email = field(form, "email").value.trim();
        const password = field(form, "password").value;
        if (!email || !password) {
            setError("loginError", "Enter your email and password.");
            return;
        }
        buttonBusy(btn, true, "Signing in…");
        try {
            await auth.login(email, password);
            const user = await auth.me();
            field(form, "password").value = "";
            if (!user) {
                setError("loginError", "Signed in, but the backend did not return a user context.");
                showPanel("Login");
                return;
            }
            await afterLogin(user);
        } catch (err) {
            setError("loginError", errorText(err));
        } finally {
            buttonBusy(btn, false);
        }
    });

    // --- signup
    $("signupForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector("button[type=submit]");
        setError("signupError", "");
        const email = field(form, "email").value.trim();
        const password = field(form, "password").value;
        const confirm = field(form, "confirm").value;
        if (password.length < 8) {
            setError("signupError", "Use at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("signupError", "Passwords do not match.");
            return;
        }
        buttonBusy(btn, true, "Creating…");
        try {
            await auth.signup(email, password);
            try {
                await auth.login(email, password);
                const user = await auth.me();
                form.reset();
                if (user) {
                    await afterLogin(user);
                    return;
                }
            } catch (_) {
                /* fall through to manual sign in */
            }
            form.reset();
            showPanel("Login");
            setError("loginError", "Account created. Sign in to continue — an owner must approve new accounts.");
        } catch (err) {
            setError("signupError", errorText(err));
        } finally {
            buttonBusy(btn, false);
        }
    });

    // --- forgot password
    $("forgotForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector("button[type=submit]");
        buttonBusy(btn, true, "Sending…");
        try {
            await auth.forgotPassword(field(form, "email").value);
            const note = $("forgotNote");
            note.hidden = false;
            note.textContent = "If that address has an account, a reset token is on its way. Paste the token below.";
            $("resetForm").hidden = false;
        } catch (err) {
            const note = $("forgotNote");
            note.hidden = false;
            note.textContent = errorText(err);
        } finally {
            buttonBusy(btn, false);
        }
    });

    $("resetForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector("button[type=submit]");
        setError("resetError", "");
        const token = field(form, "token").value.trim();
        const password = field(form, "password").value;
        if (!token || password.length < 8) {
            setError("resetError", "Enter the reset token and a password of at least 8 characters.");
            return;
        }
        buttonBusy(btn, true, "Updating…");
        try {
            await auth.resetPassword(token, password);
            form.reset();
            showPanel("Login");
            setError("loginError", "Password updated. Sign in with your new password.");
        } catch (err) {
            setError("resetError", errorText(err));
        } finally {
            buttonBusy(btn, false);
        }
    });

    // --- verification panel
    $("verifyContinue").addEventListener("click", async () => {
        if (!pendingUser) {
            showPanel("Login");
            return;
        }
        await gateOnUser(pendingUser);
    });
    $("verifyResend").addEventListener("click", async () => {
        const email = pendingUser?.email;
        if (!email) return;
        const btn = $("verifyResend");
        buttonBusy(btn, true, "Sending…");
        try {
            await auth.resendVerification(email);
            setError("loginError", "");
            const copy = $("verifyCopy");
            if (copy) copy.textContent = "Verification email sent — check your inbox, then continue.";
        } catch (err) {
            const copy = $("verifyCopy");
            if (copy) copy.textContent = errorText(err);
        } finally {
            buttonBusy(btn, false);
        }
    });
    $("verifyLogout").addEventListener("click", async () => {
        await auth.logout();
        pendingUser = null;
        showPanel("Login");
    });

    // --- denied panel
    $("deniedReload").addEventListener("click", async () => {
        if (!currentUser) {
            showPanel("Login");
            return;
        }
        await gateOnUser(currentUser);
    });
    $("deniedLogout").addEventListener("click", async () => {
        await auth.logout();
        currentUser = null;
        currentMember = null;
        showPanel("Login");
    });

    // --- fatal
    $("fatalRetry").addEventListener("click", () => checkSession());

    // --- expired sessions anywhere in the app
    onUnauthorized(() => {
        if (!settled) return;
        showPanel("Login");
        setError("loginError", "Your session expired. Please sign in again.");
        currentUser = null;
        currentMember = null;
        const app = $("app");
        if (app) app.hidden = true;
    });
}

export async function startGate(ready) {
    onReady = ready;
    wire();
    showPanel("Booting");
    await checkSession();
    settled = true;
}

export async function signOut() {
    await auth.logout();
    currentUser = null;
    currentMember = null;
    const app = $("app");
    if (app) app.hidden = true;
    showPanel("Login");
    settled = false;
}
