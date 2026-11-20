/* AllForOne Story Planner — owner approval of accounts and locations.
 *
 * Nobody gets in just by having an account. The owner (OWNER_EMAIL) approves:
 *   1. each ACCOUNT, once; and
 *   2. each LOCATION (IP address) that account signs in from. A new IP —
 *      new house, school, mobile data — waits for approval again.
 * The owner is always allowed, from anywhere, so they can never be locked out.
 *
 * Requests live in the `access_requests` collection:
 *   acct_<uid>          { kind: "account",  uid, email, status, ... }
 *   ip_<uid>_<ip-key>   { kind: "location", uid, email, ip, userAgent, status, ... }
 * status: "pending" | "approved" | "denied". Users can only create their own
 * requests as "pending"; only the owner can change a status (backend rules).
 *
 * What the backend can and can't enforce:
 *   - BreadBackend rules can't see IP addresses or look up other documents, so
 *     LOCATION approval is enforced by this app.
 *   - ACCOUNT approval is also enforced on the server, by listing approved
 *     emails in the backend rules. rulesFor() builds that JSON so the owner can
 *     paste it into the dashboard after approving someone new.
 */

import { auth, accessDb, ACCESS_COLLECTION } from "./api.js";

export const OWNER_EMAIL = "kaioliver111@gmail.com";

export function normEmail(value) {
    return String(value || "").trim().toLowerCase();
}

export function isOwnerEmail(email) {
    return normEmail(email) === OWNER_EMAIL;
}

const ipKey = (ip) => String(ip).replace(/[^A-Za-z0-9]/g, "-");
export const accountId = (uid) => `acct_${uid}`;
export const locationId = (uid, ip) => `ip_${uid}_${ipKey(ip)}`;

/** The IP address the backend sees for this session (from the session list). */
export async function currentIp() {
    const sessions = await auth.listSessions();
    const mine = sessions.find((s) => s.current) || (sessions.length === 1 ? sessions[0] : null);
    const ip = mine?.ipAddress || mine?.ip || "";
    if (!ip) throw new Error("Couldn't work out which location you're signing in from.");
    return ip;
}

async function readOrRequest(id, data) {
    let doc = null;
    try {
        doc = await accessDb.get(id);
    } catch (err) {
        if (err?.status !== 403) throw err;
    }
    if (doc) return doc;
    try {
        return await accessDb.create(id, { ...data, status: "pending", requestedAt: new Date().toISOString() });
    } catch (err) {
        // Already requested (e.g. from another tab) — still waiting.
        if (err?.status === 409) return { id, ...data, status: "pending" };
        throw err;
    }
}

/**
 * Decide whether this user may enter from where they are now.
 * Returns { allowed, stage: "account" | "location" | null, status, ip }.
 * Creates the pending request(s) the owner needs to see.
 */
export async function checkAccess(user) {
    if (isOwnerEmail(user?.email)) return { allowed: true, stage: null, status: "approved", ip: "" };
    const uid = String(user.id);
    const email = user.email || "";

    const account = await readOrRequest(accountId(uid), { kind: "account", uid, email });
    if (account.status !== "approved") {
        return { allowed: false, stage: "account", status: account.status || "pending", ip: "" };
    }

    const ip = await currentIp();
    const location = await readOrRequest(locationId(uid, ip), {
        kind: "location",
        uid,
        email,
        ip,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
    });
    if (location.status !== "approved") {
        return { allowed: false, stage: "location", status: location.status || "pending", ip };
    }
    return { allowed: true, stage: null, status: "approved", ip };
}

/* ------------------------------------------------------------ owner tools */

export async function listRequests() {
    return accessDb.list();
}

export async function decide(id, status, ownerEmail) {
    return accessDb.update(id, { status, decidedAt: new Date().toISOString(), decidedBy: ownerEmail || OWNER_EMAIL });
}

export async function removeRequest(id) {
    return accessDb.remove(id);
}

/** Emails whose ACCOUNT is approved (plus the owner), sorted. */
export function approvedEmails(requests) {
    const set = new Set([OWNER_EMAIL]);
    requests.filter((r) => r.kind === "account" && r.status === "approved" && r.email).forEach((r) => set.add(normEmail(r.email)));
    return Array.from(set).sort();
}

/** Full BreadBackend rules JSON for this site, given the approved emails. */
export function rulesFor(emails) {
    const q = (e) => `'${String(e).replace(/'/g, "")}'`;
    const team = emails.map((e) => `request.auth.email == ${q(e)}`).join(" || ");
    const owner = `request.auth.email == ${q(OWNER_EMAIL)}`;
    return {
        version: 1, // required by the BreadBackend dashboard
        default: {
            read: { expr: team },
            write: { expr: team },
        },
        collections: {
            [ACCESS_COLLECTION]: {
                read: { expr: `request.auth.uid == resource.data.ownerId || ${owner}` },
                create: {
                    expr: "request.data.uid == request.auth.uid && request.data.email == request.auth.email && request.data.status == 'pending'",
                },
                update: { expr: owner },
                delete: { expr: owner },
            },
            uploads: {
                read: { expr: team },
                write: { expr: team },
            },
        },
    };
}
