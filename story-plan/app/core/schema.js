/* =========================================================================
   Entity metadata + field schemas
   One source of truth for lists, forms, labels and reference resolution.
   ========================================================================= */

export const IMPORTANCE = [
    { value: 1, label: "Minor" },
    { value: 2, label: "Notable" },
    { value: 3, label: "Significant" },
    { value: 4, label: "Major" },
    { value: 5, label: "World-changing" },
];

export const CANON = [
    { value: "confirmed", label: "Confirmed canon" },
    { value: "planned", label: "Planned" },
    { value: "rumour", label: "Rumour" },
    { value: "theory", label: "Theory" },
    { value: "noncanon", label: "Non-canon" },
    { value: "retconned", label: "Retconned" },
];

export const CANON_LABEL = Object.fromEntries(CANON.map((c) => [c.value, c.label]));

export const CHARACTER_STATUS = [
    { value: "alive", label: "Alive" },
    { value: "missing", label: "Missing" },
    { value: "dead", label: "Deceased" },
    { value: "undead", label: "Undead / resurrected" },
    { value: "retired", label: "Retired" },
    { value: "planned", label: "Not yet introduced" },
];

export const EVENT_CATEGORIES = [
    { value: "introduction", label: "Character introduction" },
    { value: "development", label: "Character development" },
    { value: "political", label: "Political event" },
    { value: "war", label: "War / battle" },
    { value: "betrayal", label: "Betrayal" },
    { value: "discovery", label: "Discovery" },
    { value: "death", label: "Death" },
    { value: "mystery", label: "Mystery" },
    { value: "alliance", label: "Alliance" },
    { value: "election", label: "Election" },
    { value: "faction", label: "Faction conflict" },
    { value: "personal", label: "Personal conflict" },
    { value: "world", label: "World-changing event" },
    { value: "construction", label: "Construction / founding" },
];

export const EVENT_ICONS = {
    introduction: "user",
    development: "sparkles",
    political: "crown",
    war: "swords",
    betrayal: "mask",
    discovery: "compass",
    death: "skull",
    mystery: "key",
    alliance: "shield",
    election: "ballot",
    faction: "flag",
    personal: "heart",
    world: "globe",
    construction: "building",
};

export const STORYLINE_STATUS = [
    { value: "planned", label: "Planned" },
    { value: "upcoming", label: "Upcoming" },
    { value: "active", label: "Active" },
    { value: "onhold", label: "On hold" },
    { value: "completed", label: "Completed" },
    { value: "abandoned", label: "Abandoned" },
];

export const PHASES = [
    { value: "introduction", label: "Introduction" },
    { value: "development", label: "Development" },
    { value: "escalation", label: "Escalation" },
    { value: "climax", label: "Climax" },
    { value: "resolution", label: "Resolution" },
];

export const MYSTERY_STATUS = [
    { value: "undiscovered", label: "Undiscovered" },
    { value: "partial", label: "Partially discovered" },
    { value: "investigating", label: "Under investigation" },
    { value: "solved", label: "Solved" },
    { value: "abandoned", label: "Abandoned" },
];

export const SECRET_STATUS = [
    { value: "hidden", label: "Hidden" },
    { value: "partial", label: "Partly known" },
    { value: "revealed", label: "Revealed" },
    { value: "abandoned", label: "Abandoned" },
];

export const RELATION_TYPES = [
    { value: "friendship", label: "Friendship", kind: "ally", color: "var(--r-ally)" },
    { value: "family", label: "Family", kind: "family", color: "var(--r-family)" },
    { value: "romance", label: "Romantic", kind: "romance", color: "var(--r-romance)" },
    { value: "rivalry", label: "Rivalry", kind: "conflict", color: "var(--r-conflict)" },
    { value: "enemy", label: "Enemy", kind: "enemy", color: "var(--r-enemy)" },
    { value: "alliance", label: "Alliance", kind: "ally", color: "var(--r-ally)" },
    { value: "betrayal", label: "Betrayal", kind: "enemy", color: "var(--r-enemy)" },
    { value: "mentor", label: "Mentor & student", kind: "mentor", color: "var(--r-mentor)" },
    { value: "business", label: "Business partners", kind: "ally", color: "var(--r-ally)" },
    { value: "distrust", label: "Mutual distrust", kind: "conflict", color: "var(--r-conflict)" },
    { value: "unrequited", label: "Unrequited loyalty", kind: "ally", color: "var(--r-ally)" },
    { value: "secret", label: "Secret collaboration", kind: "secret", color: "var(--r-secret)" },
    { value: "debt", label: "Life debt", kind: "family", color: "var(--r-family)" },
    { value: "neutral", label: "Acquaintance", kind: "historic", color: "var(--r-historic)" },
];

export const RELATION_STATUS = [
    { value: "active", label: "Current" },
    { value: "strained", label: "Strained" },
    { value: "broken", label: "Broken" },
    { value: "ended", label: "Ended" },
    { value: "secret", label: "Secret" },
    { value: "planned", label: "Planned" },
];

export const EDGE_KINDS = [
    { value: "ally", label: "Allies / friendship", color: "#4fbf82" },
    { value: "enemy", label: "Enemies / rivalry", color: "#e05d52" },
    { value: "family", label: "Family", color: "#5f96e8" },
    { value: "conflict", label: "Conflict", color: "#e09a4f" },
    { value: "secret", label: "Secret", color: "#a67ce8" },
    { value: "historic", label: "Historical / structural", color: "#6f7b89" },
    { value: "romance", label: "Romantic", color: "#e07fae" },
    { value: "mentor", label: "Mentorship", color: "#4ec7bd" },
];

export const LOCATION_TYPES = [
    { value: "town", label: "Town / settlement" },
    { value: "kingdom", label: "Kingdom / nation" },
    { value: "base", label: "Base" },
    { value: "ruin", label: "Ruins" },
    { value: "battlefield", label: "Battlefield" },
    { value: "prison", label: "Prison" },
    { value: "meeting", label: "Meeting place" },
    { value: "facility", label: "Secret facility" },
    { value: "landmark", label: "Landmark" },
    { value: "wilds", label: "Wilderness" },
];

export const ITEM_TYPES = [
    { value: "weapon", label: "Weapon" },
    { value: "armour", label: "Armour" },
    { value: "book", label: "Book / document" },
    { value: "artefact", label: "Artefact" },
    { value: "symbol", label: "Symbol of authority" },
    { value: "keepsake", label: "Personal keepsake" },
    { value: "resource", label: "Rare resource" },
];

export const ITEM_STATUS = [
    { value: "active", label: "In use" },
    { value: "hidden", label: "Hidden" },
    { value: "lost", label: "Lost" },
    { value: "destroyed", label: "Destroyed" },
    { value: "contested", label: "Contested" },
    { value: "planned", label: "Planned" },
];

export const FACTION_STATUS = [
    { value: "active", label: "Active" },
    { value: "rising", label: "Rising" },
    { value: "declining", label: "Declining" },
    { value: "dissolved", label: "Dissolved" },
    { value: "planned", label: "Planned" },
];

export const LOCATION_CONDITION = [
    { value: "thriving", label: "Thriving" },
    { value: "stable", label: "Stable" },
    { value: "damaged", label: "Damaged" },
    { value: "ruined", label: "Ruined" },
    { value: "abandoned", label: "Abandoned" },
    { value: "secret", label: "Secret" },
];

export const ROLE_OPTIONS = [
    { value: "owner", label: "Owner / keeper" },
    { value: "admin", label: "Editor" },
    { value: "viewer", label: "Viewer" },
];

export const TYPES = {
    characters: { label: "Characters", singular: "Character", icon: "characters", color: "var(--n-character)" },
    events: { label: "Events", singular: "Event", icon: "events", color: "var(--n-event)" },
    factions: { label: "Factions", singular: "Faction", icon: "factions", color: "var(--n-faction)" },
    storylines: { label: "Storylines", singular: "Storyline", icon: "storylines", color: "var(--n-storyline)" },
    relationships: { label: "Relationships", singular: "Relationship", icon: "relationships", color: "var(--n-character)" },
    mysteries: { label: "Mysteries", singular: "Mystery", icon: "secrets", color: "var(--n-mystery)" },
    secrets: { label: "Secrets", singular: "Secret", icon: "lock", color: "var(--n-mystery)" },
    locations: { label: "Locations", singular: "Location", icon: "locations", color: "var(--n-location)" },
    items: { label: "Items", singular: "Item", icon: "items", color: "var(--n-item)" },
};

export const NODE_TYPES = ["characters", "events", "factions", "locations", "mysteries", "storylines", "items"];

export const REF_LABEL = {
    characters: "name",
    events: "title",
    factions: "name",
    storylines: "name",
    locations: "name",
    items: "name",
    mysteries: "title",
    secrets: "title",
    relationships: "label",
};

export const OPTIONS = {
    IMPORTANCE,
    CANON,
    CHARACTER_STATUS,
    EVENT_CATEGORIES,
    STORYLINE_STATUS,
    PHASES,
    MYSTERY_STATUS,
    SECRET_STATUS,
    RELATION_TYPES,
    RELATION_STATUS,
    LOCATION_TYPES,
    ITEM_TYPES,
    ITEM_STATUS,
    FACTION_STATUS,
    LOCATION_CONDITION,
    ROLE_OPTIONS,
};

/* -------------------------------------------------------------------------
   Field schemas. Referenced collections pick up live data from the store.
   ------------------------------------------------------------------------- */
export const SCHEMAS = {
    characters: [
        {
            id: "identity",
            title: "Identity",
            fields: [
                { key: "name", label: "Full name", type: "text", required: true, span: 1 },
                { key: "username", label: "Minecraft username", type: "text", hint: "Used for the skin avatar" },
                { key: "nicknames", label: "Nicknames", type: "tags", placeholder: "The Architect, Ash…" },
                { key: "status", label: "Current status", type: "select", options: CHARACTER_STATUS, default: "alive" },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "age", label: "Age", type: "text", placeholder: "24, unknown, ageless…" },
                { key: "occupation", label: "Occupation", type: "text" },
                { key: "factionId", label: "Faction", type: "ref", collection: "factions" },
                { key: "locationId", label: "Current location", type: "ref", collection: "locations" },
                { key: "firstAppearance", label: "First appearance", type: "date" },
                { key: "portraitUrl", label: "Portrait / skin image", type: "image" },
                { key: "tagline", label: "One-line description", type: "text", full: true, placeholder: "A quiet builder with a debt he can never repay." },
                { key: "description", label: "Character overview", type: "textarea", full: true },
                { key: "demo", label: "Part of demonstration archive", type: "bool", adminOnly: true },
            ],
        },
        {
            id: "personality",
            title: "Personality",
            fields: [
                { key: "personality.overview", label: "Personality overview", type: "textarea", full: true },
                { key: "personality.positive", label: "Positive traits", type: "tags" },
                { key: "personality.negative", label: "Negative traits", type: "tags" },
                { key: "personality.habits", label: "Habits", type: "list" },
                { key: "personality.fears", label: "Biggest fears", type: "list" },
                { key: "personality.desires", label: "Greatest desires", type: "list" },
                { key: "personality.beliefs", label: "Beliefs", type: "list" },
                { key: "personality.moralCode", label: "Moral code", type: "textarea", full: true },
            ],
        },
        {
            id: "backstory",
            title: "Backstory",
            fields: [
                { key: "backstory.childhood", label: "Childhood", type: "textarea", full: true },
                { key: "backstory.family", label: "Family background", type: "textarea", full: true },
                { key: "backstory.origin", label: "Origin", type: "textarea", full: true },
                { key: "backstory.experiences", label: "Previous experiences", type: "textarea", full: true },
                { key: "backstory.arrival", label: "How they arrived on the SMP", type: "textarea", full: true },
                { key: "backstory.shaping", label: "What shaped their personality", type: "textarea", full: true },
            ],
        },
        {
            id: "capabilities",
            title: "Strengths & weaknesses",
            fields: [
                { key: "attributes", label: "Attributes", type: "attributes", full: true },
                { key: "strengths.physical", label: "Physical strengths", type: "list" },
                { key: "strengths.combat", label: "Combat abilities", type: "list" },
                { key: "strengths.social", label: "Social abilities", type: "list" },
                { key: "strengths.intelligence", label: "Intelligence", type: "list" },
                { key: "strengths.emotional", label: "Emotional strengths", type: "list" },
                { key: "weaknesses.physical", label: "Physical weaknesses", type: "list" },
                { key: "weaknesses.emotional", label: "Emotional weaknesses", type: "list" },
                { key: "weaknesses.limits", label: "Other limitations", type: "list" },
            ],
        },
        {
            id: "motivations",
            title: "Motivations",
            fields: [
                { key: "motivations.objective", label: "Main objective", type: "textarea", full: true },
                { key: "motivations.secondary", label: "Secondary objectives", type: "list" },
                { key: "motivations.personal", label: "Personal motivations", type: "textarea" },
                { key: "motivations.ambition", label: "Biggest ambition", type: "text" },
                { key: "motivations.sacrifice", label: "Willing to sacrifice", type: "list" },
                { key: "motivations.fearOfLosing", label: "What they fear losing", type: "text" },
                { key: "motivations.quote", label: "Signature line", type: "text", full: true },
            ],
        },
        {
            id: "development",
            title: "Development",
            fields: [
                { key: "development.original", label: "Original personality", type: "textarea" },
                { key: "development.current", label: "Current personality", type: "textarea" },
                { key: "development.changes", label: "How they have changed", type: "textarea", full: true },
                { key: "development.lessons", label: "Lessons learned", type: "list" },
                { key: "development.internalConflict", label: "Current internal conflict", type: "textarea", full: true },
                { key: "development.future", label: "Possible future development", type: "textarea", full: true },
                {
                    key: "journey",
                    label: "Character journey",
                    type: "repeater",
                    full: true,
                    addLabel: "Add milestone",
                    itemLabel: "label",
                    fields: [
                        { key: "label", label: "Milestone", type: "text" },
                        { key: "date", label: "Story date", type: "date" },
                        { key: "note", label: "What changed", type: "textarea" },
                    ],
                },
            ],
        },
        {
            id: "notes",
            title: "Private notes",
            fields: [
                { key: "notes", label: "Writer notes", type: "textarea", full: true, hint: "Not shown anywhere except this record's edit form." },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    events: [
        {
            id: "core",
            title: "Event",
            fields: [
                { key: "title", label: "Event title", type: "text", required: true, full: true },
                { key: "category", label: "Category", type: "select", options: EVENT_CATEGORIES, default: "development" },
                { key: "date", label: "Date", type: "date", required: true },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "phase", label: "Storyline phase", type: "select", options: PHASES, placeholder: "Unassigned" },
                { key: "summary", label: "Short summary", type: "textarea", full: true },
                { key: "description", label: "Full description", type: "textarea", full: true },
            ],
        },
        {
            id: "players",
            title: "Who & where",
            fields: [
                { key: "characterIds", label: "Characters involved", type: "refs", collection: "characters", full: true },
                { key: "factionIds", label: "Factions involved", type: "refs", collection: "factions", full: true },
                { key: "locationId", label: "Location", type: "ref", collection: "locations" },
                { key: "storylineIds", label: "Storylines", type: "refs", collection: "storylines", full: true },
                { key: "relatedEventIds", label: "Related events", type: "refs", collection: "events", full: true },
            ],
        },
        {
            id: "causes",
            title: "Cause & consequence",
            fields: [
                { key: "cause", label: "Cause of the event", type: "textarea", full: true },
                { key: "outcome", label: "Immediate outcome", type: "textarea", full: true },
                { key: "consequences", label: "Long-term consequences", type: "textarea", full: true },
                {
                    key: "consequenceLinks",
                    label: "Consequence links",
                    type: "repeater",
                    full: true,
                    addLabel: "Add consequence",
                    itemLabel: "text",
                    hint: "Each consequence can be bound to a specific record so it surfaces there too.",
                    fields: [
                        { key: "text", label: "Consequence", type: "text" },
                        {
                            key: "targetType",
                            label: "Affects",
                            type: "select",
                            options: [...NODE_TYPES, "secrets"].map((t) => ({ value: t, label: TYPES[t]?.singular || "Secret" })),
                        },
                        { key: "targetId", label: "Record", type: "dynamic-ref", collectionFrom: "targetType" },
                        { key: "note", label: "Detail", type: "textarea" },
                    ],
                },
                { key: "secret", label: "This event is partly hidden", type: "bool" },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
        {
            id: "media",
            title: "Media",
            fields: [{ key: "images", label: "Screenshots & images", type: "images", full: true }],
        },
    ],

    factions: [
        {
            id: "core",
            title: "Faction",
            fields: [
                { key: "name", label: "Name", type: "text", required: true },
                { key: "status", label: "Status", type: "select", options: FACTION_STATUS, default: "active" },
                { key: "color", label: "Banner colour", type: "color", default: "#77d29a" },
                { key: "logoUrl", label: "Symbol / logo", type: "image" },
                { key: "tagline", label: "Motto", type: "text", full: true },
                { key: "description", label: "Description", type: "textarea", full: true },
                { key: "ideology", label: "Ideology", type: "textarea", full: true },
                { key: "objectives", label: "Main objectives", type: "list", full: true },
                { key: "founded", label: "Founded", type: "date" },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
            ],
        },
        {
            id: "people",
            title: "Leadership & members",
            fields: [
                { key: "leaderId", label: "Leader", type: "ref", collection: "characters" },
                { key: "memberIds", label: "Current members", type: "refs", collection: "characters", full: true },
                {
                    key: "membershipHistory",
                    label: "Membership history",
                    type: "repeater",
                    full: true,
                    addLabel: "Add past member",
                    itemLabel: "note",
                    hint: "Leaving a faction never erases the affiliation: past members are preserved here.",
                    fields: [
                        { key: "characterId", label: "Character", type: "ref", collection: "characters" },
                        { key: "role", label: "Role", type: "text" },
                        { key: "from", label: "Joined", type: "date" },
                        { key: "to", label: "Left", type: "date" },
                        { key: "note", label: "Reason", type: "text" },
                    ],
                },
            ],
        },
        {
            id: "world",
            title: "Territory & diplomacy",
            fields: [
                { key: "territory", label: "Territory", type: "textarea" },
                { key: "locationIds", label: "Controlled locations", type: "refs", collection: "locations" },
                { key: "allyIds", label: "Allies", type: "refs", collection: "factions" },
                { key: "enemyIds", label: "Enemies", type: "refs", collection: "factions" },
                { key: "splitFromIds", label: "Split from", type: "refs", collection: "factions", hint: "Factions this group broke away from" },
                { key: "mergedIntoIds", label: "Merged into / successors", type: "refs", collection: "factions", hint: "Where members or the whole faction went next" },
                { key: "dissolved", label: "Dissolved", type: "date" },
                { key: "history", label: "Historical notes", type: "list", full: true },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    storylines: [
        {
            id: "core",
            title: "Storyline",
            fields: [
                { key: "name", label: "Storyline name", type: "text", required: true, full: true },
                { key: "subtitle", label: "Short description", type: "text", full: true },
                { key: "status", label: "Status", type: "select", options: STORYLINE_STATUS, default: "active" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "phase", label: "Current phase", type: "select", options: PHASES, default: "introduction" },
                { key: "startDate", label: "Begins", type: "date" },
                { key: "endDate", label: "Ends / expected end", type: "date" },
                { key: "theme", label: "Main theme", type: "text" },
                { key: "parentId", label: "Parent storyline", type: "ref", collection: "storylines" },
                { key: "premise", label: "Description", type: "textarea", full: true },
                { key: "mainConflict", label: "Main conflict", type: "textarea", full: true },
            ],
        },
        {
            id: "cast",
            title: "Cast & world",
            fields: [
                { key: "characterIds", label: "Characters involved", type: "refs", collection: "characters", full: true },
                { key: "factionIds", label: "Factions involved", type: "refs", collection: "factions", full: true },
                { key: "locationIds", label: "Important locations", type: "refs", collection: "locations", full: true },
                { key: "mysteryIds", label: "Related mysteries", type: "refs", collection: "mysteries", full: true },
            ],
        },
        {
            id: "arc",
            title: "Current situation & resolution",
            fields: [
                { key: "currentSituation", label: "What is happening now", type: "textarea", full: true },
                { key: "potentialResolution", label: "Potential resolution", type: "textarea", full: true },
                { key: "expectedConsequences", label: "Expected consequences", type: "textarea", full: true },
                { key: "demo", label: "Part of demonstration archive", type: "bool", adminOnly: true },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    relationships: [
        {
            id: "core",
            title: "Relationship",
            fields: [
                { key: "aId", label: "Character A", type: "ref", collection: "characters", required: true },
                { key: "bId", label: "Character B", type: "ref", collection: "characters", required: true },
                { key: "type", label: "Relationship type", type: "select", options: RELATION_TYPES, default: "friendship", required: true },
                { key: "status", label: "Current status", type: "select", options: RELATION_STATUS, default: "active" },
                { key: "secret", label: "Secret relationship", type: "bool" },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "startDate", label: "Began", type: "date" },
                { key: "endDate", label: "Ended", type: "date" },
                { key: "description", label: "Description", type: "textarea", full: true },
                { key: "met", label: "How they met", type: "textarea", full: true },
                { key: "history", label: "History together", type: "textarea", full: true },
                { key: "sharedEventIds", label: "Important shared events", type: "refs", collection: "events", full: true },
            ],
        },
        {
            id: "evolution",
            title: "Evolution",
            fields: [
                {
                    key: "evolution",
                    label: "Relationship history",
                    type: "repeater",
                    full: true,
                    addLabel: "Add chapter",
                    itemLabel: "label",
                    hint: "Never overwrite a previous chapter — add the next one. The current relationship stays visible above.",
                    fields: [
                        { key: "label", label: "Chapter", type: "text" },
                        { key: "type", label: "Type at this point", type: "select", options: RELATION_TYPES },
                        { key: "status", label: "Status", type: "select", options: RELATION_STATUS },
                        { key: "date", label: "Date", type: "date" },
                        { key: "note", label: "What happened", type: "textarea" },
                    ],
                },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    mysteries: [
        {
            id: "core",
            title: "Mystery",
            fields: [
                { key: "title", label: "Mystery title", type: "text", required: true, full: true },
                { key: "status", label: "Status", type: "select", options: MYSTERY_STATUS, default: "undiscovered" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "origin", label: "Origin", type: "text" },
                { key: "description", label: "Description", type: "textarea", full: true },
                { key: "characterIds", label: "Characters involved", type: "refs", collection: "characters", full: true },
                { key: "eventIds", label: "Related events", type: "refs", collection: "events", full: true },
                { key: "locationIds", label: "Related locations", type: "refs", collection: "locations", full: true },
            ],
        },
        {
            id: "evidence",
            title: "Investigation",
            fields: [
                { key: "clues", label: "Known clues", type: "list", full: true },
                { key: "theories", label: "Suspected explanations", type: "list", full: true },
                { key: "confirmed", label: "Confirmed information", type: "list", full: true },
                { key: "questions", label: "Unanswered questions", type: "list", full: true },
                { key: "revealPlan", label: "Planned reveal", type: "textarea", full: true },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    secrets: [
        {
            id: "core",
            title: "Secret",
            fields: [
                { key: "title", label: "Secret title", type: "text", required: true, full: true },
                { key: "status", label: "Status", type: "select", options: SECRET_STATUS, default: "hidden" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "description", label: "Public-facing description", type: "textarea", full: true },
                { key: "truth", label: "The truth", type: "textarea", full: true },
            ],
        },
        {
            id: "knowledge",
            title: "Knowledge tracking",
            fields: [
                { key: "holderIds", label: "Characters who know", type: "refs", collection: "characters", full: true },
                { key: "suspectIds", label: "Characters who suspect something", type: "refs", collection: "characters", full: true },
                { key: "unawareIds", label: "Characters completely unaware", type: "refs", collection: "characters", full: true },
                { key: "knowledgeLog", label: "Knowledge changes", type: "repeater", full: true, addLabel: "Record a knowledge change", itemLabel: "note", hint: "Preserved history of who learned what, and when.", fields: [
                    { key: "characterId", label: "Character", type: "ref", collection: "characters" },
                    { key: "state", label: "State", type: "select", options: [{ value: "confirmed", label: "Knows" }, { value: "suspected", label: "Suspects" }, { value: "unaware", label: "Unaware" }] },
                    { key: "date", label: "Date", type: "date" },
                    { key: "note", label: "How they found out", type: "text" },
                ] },
                { key: "evidence", label: "Existing evidence", type: "list", full: true },
                { key: "revealImpact", label: "What happens if revealed", type: "textarea", full: true },
                { key: "revealDate", label: "Planned reveal", type: "date" },
                { key: "relatedEventIds", label: "Related events", type: "refs", collection: "events", full: true },
                { key: "relatedMysteryIds", label: "Related mysteries", type: "refs", collection: "mysteries", full: true },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    locations: [
        {
            id: "core",
            title: "Location",
            fields: [
                { key: "name", label: "Name", type: "text", required: true },
                { key: "type", label: "Type", type: "select", options: LOCATION_TYPES, default: "town" },
                { key: "region", label: "Region", type: "text" },
                { key: "coords", label: "Coordinates", type: "text", placeholder: "x -240, z 1180" },
                { key: "condition", label: "Current condition", type: "select", options: LOCATION_CONDITION, default: "stable" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "imageUrl", label: "Screenshot", type: "image", full: true },
                { key: "description", label: "Description", type: "textarea", full: true },
                { key: "historicalImportance", label: "Historical importance", type: "textarea", full: true },
            ],
        },
        {
            id: "control",
            title: "Control & ownership",
            fields: [
                { key: "controllerFactionId", label: "Controlled by", type: "ref", collection: "factions" },
                { key: "ownerId", label: "Owner", type: "ref", collection: "characters" },
                { key: "characterIds", label: "Characters associated", type: "refs", collection: "characters", full: true },
                { key: "factionIds", label: "Factions associated", type: "refs", collection: "factions", full: true },
                {
                    key: "ownershipHistory",
                    label: "Ownership history",
                    type: "repeater",
                    full: true,
                    addLabel: "Add ownership era",
                    itemLabel: "note",
                    hint: "Ownership changes are preserved — a location can change hands without losing its past.",
                    fields: [
                        { key: "owner", label: "Owner / controller", type: "text" },
                        { key: "factionId", label: "Faction", type: "ref", collection: "factions" },
                        { key: "from", label: "From", type: "date" },
                        { key: "to", label: "To", type: "date" },
                        { key: "note", label: "How it changed", type: "text" },
                    ],
                },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    items: [
        {
            id: "core",
            title: "Item",
            fields: [
                { key: "name", label: "Item name", type: "text", required: true },
                { key: "type", label: "Type", type: "select", options: ITEM_TYPES, default: "artefact" },
                { key: "status", label: "Current status", type: "select", options: ITEM_STATUS, default: "active" },
                { key: "importance", label: "Importance", type: "rating", default: 3 },
                { key: "canon", label: "Canon status", type: "select", options: CANON, default: "confirmed" },
                { key: "ownerId", label: "Current owner", type: "ref", collection: "characters" },
                { key: "locationId", label: "Current location", type: "ref", collection: "locations" },
                { key: "discovered", label: "Discovery date", type: "date" },
                { key: "imageUrl", label: "Image", type: "image", full: true },
                { key: "description", label: "Description", type: "textarea", full: true },
                { key: "origin", label: "Origin", type: "textarea", full: true },
                { key: "significance", label: "Historical significance", type: "textarea", full: true },
                { key: "eventIds", label: "Events associated", type: "refs", collection: "events", full: true },
            ],
        },
        {
            id: "ownership",
            title: "Ownership history",
            fields: [
                {
                    key: "previousOwners",
                    label: "Previous owners",
                    type: "repeater",
                    full: true,
                    addLabel: "Add previous owner",
                    itemLabel: "note",
                    fields: [
                        { key: "characterId", label: "Character", type: "ref", collection: "characters" },
                        { key: "from", label: "From", type: "date" },
                        { key: "to", label: "To", type: "date" },
                        { key: "note", label: "How it changed hands", type: "text" },
                    ],
                },
                { key: "archived", label: "Archived", type: "bool" },
            ],
        },
    ],

    links: [
        {
            id: "core",
            title: "Custom connection",
            fields: [
                { key: "label", label: "Connection label", type: "text", required: true, full: true },
                { key: "fromType", label: "From type", type: "select", options: NODE_TYPES.map((t) => ({ value: t, label: TYPES[t].singular })) },
                { key: "fromId", label: "From record", type: "dynamic-ref", collectionFrom: "fromType", required: true },
                { key: "toType", label: "To type", type: "select", options: NODE_TYPES.map((t) => ({ value: t, label: TYPES[t].singular })) },
                { key: "toId", label: "To record", type: "dynamic-ref", collectionFrom: "toType", required: true },
                { key: "kind", label: "Line style", type: "select", options: EDGE_KINDS, default: "historic" },
                { key: "date", label: "Date", type: "date" },
                { key: "note", label: "Notes", type: "textarea", full: true },
            ],
        },
    ],

    maps: [
        {
            id: "core",
            title: "Saved map",
            fields: [
                { key: "name", label: "Map name", type: "text", required: true, full: true },
                { key: "description", label: "Description", type: "textarea", full: true },
            ],
        },
    ],
};

export const DEFAULT_ATTRIBUTES = [
    { key: "combat", label: "Combat" },
    { key: "diplomacy", label: "Diplomacy" },
    { key: "loyalty", label: "Loyalty" },
    { key: "cunning", label: "Cunning" },
    { key: "resolve", label: "Resolve" },
    { key: "influence", label: "Influence" },
];

export function schemaSections(type) {
    return SCHEMAS[type] || [];
}

export function fieldByKey(type, key) {
    for (const section of SCHEMAS[type] || []) {
        const found = section.fields.find((f) => f.key === key);
        if (found) return found;
    }
    return null;
}

export function optionsFor(field) {
    if (field.options) return field.options;
    return [];
}
