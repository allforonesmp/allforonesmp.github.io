/* AllForOne Story Planner — authentication & access control gate.
 *
 * Sessions live in the BreadBackend SDK's own token storage; no password is
 * ever held by this app. Beyond authentication, two operator-controlled checks
 * decide access, in this order:
 *
 * 1. VERIFIED EMAIL (hard requirement, checked first). The account's email
 *    must be marked verified on the backend. The operator does that by hand in
 *    the BreadBackend console. This app never verifies an address itself: it
 *    makes no verification call, sends no verification mail and has no
 *    "resend" button. Until the account is verified the app reads and writes
 *    NOTHING — not even the members list — and the data layer stays locked
 *    (api.js setDataAccess). A missing/unknown verification state counts as
 *    unverified.
 *
 * 2. MEMBERS ALLOWLIST. A verified account must also have an entry in the
 *    `members` collection:
 *
 *        { email: "them@example.com", role: "editor", status: "active" }
 *
 * Anything else lands on the Access pending screen, which offers exactly two
 * actions: "check again" (re-asks the backend) and "sign out". Verification is
 * re-checked while the app is open, so un-verifying an account locks it out.
 *
 * IMPORTANT LIMITATION: this is a client-side gate. BreadBackend's public
 * client key carries no per-user roles, so a determined signed-up account could
 * still call the API directly unless the project rules on the backend also
 * require a verified email / restrict signup. Set that in the dashboard too.
 */

import { auth, db, COLLECTIONS, onUnauthorized, setDataAccess, ApiError } from "./api.js";
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

/* ----------------------------------------------------------- verification */

/**
 * True only when the backend explicitly reports the email as verified. The
 * flag is set by the operator in the backend console; nothing in this app can
 * change it. Missing, null or non-boolean values are treated as unverified.
 */
export function isEmailVerified(user) {
    if (!user || typeof user !== "object") return false;
    return [user.isVerified, user.emailVerified, user.email_verified, user.verified].some((v) => v === true);
}

/** Lock the data layer and take the workspace off screen. */
function lockWorkspace() {
    setDataAccess(false);
    currentMember = null;
    stopVerificationWatch();
    const app = $("app");
    if (app) app.hidden = true;
}

/* While the app is open, periodically re-ask the backend whether the account
 * is still verified, so the operator un-verifying it takes effect without a
 * reload. Network hiccups are ignored; only an explicit "not verified" locks. */
const RECHECK_MS = 2 * 60 * 1000;
let recheckTimer = null;
let rechecking = false;

async function recheckVerification() {
    if (rechecking || !currentMember || document.hidden) return;
    rechecking = true;
    try {
        const fresh = await auth.me();
        if (fresh && currentMember && !isEmailVerified(fresh)) {
            currentUser = fresh;
            lockWorkspace();
            showPending(fresh, "unverified");
        }
    } catch (_) {
        /* 401s are handled by onUnauthorized; anything else is transient */
    } finally {
        rechecking = false;
    }
}

function startVerificationWatch() {
    stopVerificationWatch();
    recheckTimer = setInterval(recheckVerification, RECHECK_MS);
    document.addEventListener("visibilitychange", recheckVerification);
}

function stopVerificationWatch() {
    if (recheckTimer) clearInterval(recheckTimer);
    recheckTimer = null;
    document.removeEventListener("visibilitychange", recheckVerification);
}

/* ------------------------------------------------------------- membership */


/** Roles that may enter the workspace. Anything else is refused. */
const ALLOWED_ROLES = ["owner", "admin", "editor", "viewer"];

/** Statuses that mean "the operator has let this account in". */
const ALLOWED_STATUSES = ["active", "approved"];

function normaliseEmail(value) {
    return String(value || "").trim().toLowerCase();
}

/**
 * Look the signed-in account up in the operator-managed allowlist.
 *
 * Returns { allowed: boolean, member, reason, allMembers }.
 * `reason` is one of: allowed | not-listed | not-approved | list-unavailable.
 *
 * There is deliberately NO bootstrap path: an empty members collection means
 * nobody gets in, including whoever signed up first.
 */
async function resolveMembership(user) {
    const email = normaliseEmail(user.email);
    let members = [];
    try {
        members = await db.list(COLLECTIONS.members, { limit: 500 });
    } catch (err) {
        // An unreadable allowlist must refuse, never fall open.
        console.warn("[story-plan] members collection unavailable", err?.message || err);
        return { allowed: false, member: null, reason: "list-unavailable", allMembers: [] };
    }
    members = Array.isArray(members) ? members : [];

    if (!email) {
        return { allowed: false, member: null, reason: "not-listed", allMembers: members };
    }

    const entry = members.find((m) => normaliseEmail(m.email) === email);
    if (!entry) {
        return { allowed: false, member: null, reason: "not-listed", allMembers: members };
    }

    const role = String(entry.role || "editor").toLowerCase();
    const status = String(entry.status || "").toLowerCase();
    if (!ALLOWED_ROLES.includes(role)) {
        return { allowed: false, member: entry, reason: "not-approved", allMembers: members };
    }
    if (!ALLOWED_STATUSES.includes(status)) {
        return { allowed: false, member: entry, reason: "not-approved", allMembers: members };
    }

    return { allowed: true, member: entry, reason: "allowed", allMembers: members };
}

/* ------------------------------------------------------------------ flows */

async function enterApp(user, member) {
    currentUser = user;
    currentMember = member;
    $("gate").hidden = true;
    startVerificationWatch();
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
 * Render the pending screen. Used for every refusal — unverified email,
 * unlisted account, unapproved row, unreadable collection. No path from here
 * into the app.
 */
function showPending(user, reason) {
    const emailNode = $("deniedEmail");
    if (emailNode) emailNode.textContent = user?.email || "—";

    const reasonNode = $("deniedReason");
    if (reasonNode) {
        reasonNode.textContent =
            reason === "unverified"
                ? "This account's email has not been verified by the operator. Until it is, nothing in this workspace can be read or changed."
                : reason === "not-approved"
                ? "Your address is listed, but the operator has not set it to active yet."
                : reason === "list-unavailable"
                  ? "The access list could not be read, so access is refused for safety."
                  : "Your account is not on this workspace's access list.";
    }

    const noteNode = $("deniedVerifyNote");
    if (noteNode) {
        noteNode.hidden = reason !== "unverified";
        noteNode.textContent =
            reason === "unverified"
                ? "Verification is done by the operator, by hand. No email will be sent to you and there is nothing to click — send them the address above and wait."
                : "";
    }

    showPanel("Denied");
}

/**
 * The single entry decision. Email verification comes first: an unverified
 * account is refused before any collection is touched and the data layer stays
 * locked. Only then is `members` read — fresh from the database every time, so
 * an operator's edit takes effect on the next load or "Check again".
 */
async function gateOnUser(user) {
    showPanel("Booting");
    if (!isEmailVerified(user)) {
        lockWorkspace();
        showPending(user, "unverified");
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
    if (resolved.reason === "list-unavailable") {
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
                "Account created. Sign in — the operator must verify your email by hand before the workspace opens."
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
