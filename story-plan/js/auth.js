/* AllForOne Story Planner — authentication & access control gate.
 *
 * Sessions live in the BreadBackend SDK's own token storage; no password is
 * ever held by this app.
 *
 * ACCESS = OWNER APPROVAL (see access.js). Email verification is not needed.
 * The owner approves each account once, and each location (IP address) the
 * account signs in from. Until both are approved the data layer stays locked
 * (api.js setDataAccess) and the user sees the "waiting for approval" screen,
 * which re-checks by itself. Approval is re-checked while the app is open, so
 * a revoked account — or a move to a new, unapproved location — locks it.
 *
 * The `members` collection is still OPTIONAL and only sets roles / blocks:
 *   { email, role: "owner" | "admin" | "editor" | "viewer" }
 *   { email, status: "revoked" }
 */

import { auth, db, COLLECTIONS, onUnauthorized, setDataAccess, ApiError } from "./api.js";
import { el, clear } from "./util.js";
import { checkAccess, isOwnerEmail } from "./access.js";

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
    return currentMember?.role === "owner" || isOwnerEmail(currentUser?.email);
}

/** True for the one account that approves everyone else. */
export function isApprover() {
    return isOwnerEmail(currentUser?.email);
}

function showPanel(name) {
    ["Booting", "Login", "Signup", "Forgot", "Denied", "Fatal"].forEach((p) => {
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

/* ------------------------------------------------------------ access watch */

/** Lock the data layer and take the workspace off screen. */
function lockWorkspace() {
    setDataAccess(false);
    currentMember = null;
    stopAccessWatch();
    stopPendingPoll();
    const app = $("app");
    if (app) app.hidden = true;
}

/* While the app is open, re-check approval every couple of minutes (and when
 * the tab comes back), so a revoked account or a new unapproved location locks
 * the workspace without a reload. Network hiccups are ignored. */
const RECHECK_MS = 2 * 60 * 1000;
let recheckTimer = null;
let rechecking = false;

async function recheckAccess() {
    if (rechecking || !currentMember || document.hidden || !currentUser) return;
    rechecking = true;
    try {
        const result = await checkAccess(currentUser);
        if (!result.allowed && currentMember) {
            lockWorkspace();
            showPending(currentUser, result);
        }
    } catch (_) {
        /* 401s are handled by onUnauthorized; anything else is transient */
    } finally {
        rechecking = false;
    }
}

function startAccessWatch() {
    stopAccessWatch();
    recheckTimer = setInterval(recheckAccess, RECHECK_MS);
    document.addEventListener("visibilitychange", recheckAccess);
}

function stopAccessWatch() {
    if (recheckTimer) clearInterval(recheckTimer);
    recheckTimer = null;
    document.removeEventListener("visibilitychange", recheckAccess);
}

/* On the waiting screen, quietly check every 20 s so the user gets in as soon
 * as the owner approves — no need to keep pressing "Check again". */
const PENDING_POLL_MS = 20 * 1000;
let pendingTimer = null;

function startPendingPoll() {
    stopPendingPoll();
    pendingTimer = setInterval(async () => {
        if (document.hidden || !currentUser) return;
        try {
            const result = await checkAccess(currentUser);
            if (result.allowed) {
                stopPendingPoll();
                await gateOnUser(currentUser);
            } else {
                showPending(currentUser, result);
            }
        } catch (_) {
            /* keep waiting */
        }
    }, PENDING_POLL_MS);
}

function stopPendingPoll() {
    if (pendingTimer) clearInterval(pendingTimer);
    pendingTimer = null;
}

/* ------------------------------------------------------------- membership */


/** Roles that may enter the workspace. Anything else is refused. */
const ALLOWED_ROLES = ["owner", "admin", "editor", "viewer"];

/** Statuses that mean "the operator has let this account in". */
const ALLOWED_STATUSES = ["active", "approved"];

function normaliseEmail(value) {
    return String(value || "").trim().toLowerCase();
}

/** Role given to an approved account that has no members record. */
const DEFAULT_ROLE = "editor";

/**
 * Work out the role of an approved account, and whether the operator has
 * blocked it. The members collection is optional: no record (or an unreadable
 * collection) means "approved, default role".
 *
 * Returns { allowed: boolean, member, reason } with reason allowed | not-approved.
 */
async function resolveMembership(user) {
    const email = normaliseEmail(user.email);
    const fallback = { email: user.email || "", role: isOwnerEmail(user.email) ? "owner" : DEFAULT_ROLE, status: "active", implicit: true };
    let members = [];
    try {
        members = await db.list(COLLECTIONS.members, { limit: 500 });
    } catch (err) {
        console.warn("[story-plan] members collection unavailable", err?.message || err);
    }
    members = Array.isArray(members) ? members : [];

    const entry = email ? members.find((m) => normaliseEmail(m.email) === email) : null;
    if (!entry) return { allowed: true, member: fallback, reason: "allowed" };

    const role = String(entry.role || DEFAULT_ROLE).toLowerCase();
    const status = String(entry.status || "active").toLowerCase();
    if (!ALLOWED_ROLES.includes(role) || !ALLOWED_STATUSES.includes(status)) {
        return { allowed: false, member: entry, reason: "not-approved" };
    }
    return { allowed: true, member: { ...entry, role, status }, reason: "allowed" };
}

/* ------------------------------------------------------------------ flows */

async function enterApp(user, member) {
    currentUser = user;
    currentMember = member;
    $("gate").hidden = true;
    stopPendingPoll();
    startAccessWatch();
    if (onReady) await onReady(user, member);
}

async function afterLogin(user) {
    if (!user) {
        showPanel("Login");
        return;
    }
    await gateOnUser(user);
}

/**
 * Render the waiting / refused screen. `info` is either a checkAccess() result
 * ({ stage, status, ip }) or a string reason ("not-approved", "list-unavailable").
 */
function showPending(user, info) {
    const emailNode = $("deniedEmail");
    if (emailNode) emailNode.textContent = user?.email || "—";

    const reason = typeof info === "string" ? info : info?.stage === "location" ? `location-${info.status}` : `account-${info?.status || "pending"}`;
    const title = $("deniedTitle");
    if (title) title.textContent = reason.endsWith("denied") || reason === "not-approved" ? "Access refused" : "Waiting for approval";

    const messages = {
        "account-pending": "Your account is waiting for the owner to approve it. This page checks again by itself every 20 seconds — you can leave it open.",
        "account-denied": "The owner has refused access for this account.",
        "location-pending": `Your account is approved, but you're signing in from a new location (${info?.ip || "unknown IP"}). The owner needs to approve this location first. This page checks again by itself every 20 seconds.`,
        "location-denied": `The owner has refused access from this location (${info?.ip || "unknown IP"}).`,
        "not-approved": "The owner has blocked this account in the members list.",
        "list-unavailable": "The backend could not be reached to confirm your access, so it is refused for safety. Try again.",
    };
    const reasonNode = $("deniedReason");
    if (reasonNode) reasonNode.textContent = messages[reason] || "This account is not approved for this workspace.";

    const noteNode = $("deniedVerifyNote");
    if (noteNode) {
        noteNode.hidden = true;
        noteNode.textContent = "";
    }

    showPanel("Denied");
    if (reason.endsWith("pending")) startPendingPoll();
    else stopPendingPoll();
}

/**
 * The single entry decision. Owner approval (account, then location) comes
 * first: until both are approved, no workspace collection is touched and the
 * data layer stays locked. An approved account is in, unless a `members`
 * record blocks it.
 */
async function gateOnUser(user) {
    showPanel("Booting");
    let access;
    try {
        access = await checkAccess(user);
    } catch (err) {
        if (err?.status === 401) throw err;
        console.warn("[story-plan] access check failed", err?.message || err);
        lockWorkspace();
        showPending(user, "list-unavailable");
        return;
    }
    if (!access.allowed) {
        lockWorkspace();
        showPending(user, access);
        return;
    }
    setDataAccess(true);
    let resolved;
    try {
        resolved = await resolveMembership(user);
    } catch (err) {
        lockWorkspace();
        showPending(user, "list-unavailable");
        return;
    }
    if (resolved.allowed) {
        await enterApp(user, resolved.member);
        return;
    }
    lockWorkspace();
    showPending(user, resolved.reason);
}

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
            setError(
                "loginError",
                "Account created. Sign in — the owner has to approve your account before the workspace opens."
            );
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

    // --- denied panel
    $("deniedReload").addEventListener("click", async () => {
        const btn = $("deniedReload");
        buttonBusy(btn, true, "Checking…");
        try {
            const fresh = await auth.me();
            if (fresh) currentUser = fresh;
            if (!currentUser) {
                showPanel("Login");
                return;
            }
            await gateOnUser(currentUser);
        } catch (err) {
            if (err?.status === 401) {
                currentUser = null;
                showPanel("Login");
                setError("loginError", "Your session expired. Please sign in again.");
            } else {
                showPending(currentUser, "list-unavailable");
            }
        } finally {
            buttonBusy(btn, false);
        }
    });
    $("deniedLogout").addEventListener("click", async () => {
        await auth.logout();
        lockWorkspace();
        currentUser = null;
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
        lockWorkspace();
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
    lockWorkspace();
    showPanel("Login");
    settled = false;
}
