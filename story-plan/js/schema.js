/* AllForOne Story Planner — entity schema.
 *
 * One declarative definition per entity type. This single source powers:
 *   • the generic editor (components/editor.js)
 *   • detail views (pages/*)
 *   • the cross-reference index (store.js LINKS)
 *   • global search
 *   • exports
 */

export const OPTIONS = {
    seasonStatus: ["Planning", "Active", "Completed", "Archived"],
    chapterStatus: ["Planning", "Active", "Completed", "Archived"],
    arcStatus: ["Planning", "Active", "Developing", "On Hold", "Completed", "Abandoned"],
    threadStatus: ["Not Started", "Active", "Developing", "On Hold", "Resolved", "Abandoned"],
    eventStatus: [
        "Idea",
        "Planned",
        "In Development",
        "Ready",
        "Scheduled",
        "In Progress",
        "Completed",
        "Cancelled",
        "Archived",
    ],
    importance: ["Minor", "Low", "Medium", "High", "Critical"],
    eventCategory: [
        "Discovery",
        "Confrontation",
        "Conflict",
        "Betrayal",
        "Revelation",
        "World Change",
        "Faction Move",
        "Character Moment",
        "Mystery",
        "Ceremony",
        "Other",
    ],
    characterStatus: ["Active", "Missing", "Deceased", "Retired", "Unknown", "Archived"],
    characterType: ["Player Character", "NPC", "Deity", "Spirit", "Creature", "Construct", "Other"],
    role: [
        "Protagonist",
        "Antagonist",
        "Main Character",
        "Supporting Character",
        "Recurring Character",
        "Minor Character",
        "Neutral Character",
        "Mentor",
        "Comic Relief",
        "Wildcard",
    ],
    relType: [
        "Friends",
        "Allies",
        "Enemies",
        "Rivals",
        "Family",
        "Mentor",
        "Subordinate",
        "Former Allies",
        "Betrayal",
        "Manipulation",
        "Neutral",
        "Unknown",
    ],
    relStatus: ["Active", "Developing", "Strained", "Estranged", "Broken", "Ended", "Unknown"],
    knowledge: [
        "Public Knowledge",
        "Character Knowledge",
        "Restricted Knowledge",
        "Secret",
        "Unknown",
        "Unconfirmed",
        "Confirmed",
    ],
    loreCategory: [
        "History",
        "Ancient History",
        "Mysteries",
        "Legends",
        "Organisations",
        "Factions",
        "Important Events",
        "Locations",
        "Artefacts",
        "Characters",
        "Technology",
        "World Rules",
        "Secrets",
        "Unexplained Phenomena",
    ],
    factionStatus: ["Active", "Forming", "Dormant", "Disbanded", "Destroyed", "Archived"],
    dimension: ["Overworld", "Nether", "End", "Custom"],
    locationType: [
        "Settlement",
        "Stronghold",
        "Ruin",
        "Landmark",
        "Dungeon",
        "Portal",
        "Wilderness",
        "Structure",
        "Arena",
        "Other",
    ],
    sceneStatus: ["Outline", "Draft", "Planned", "Ready", "Recorded", "Done", "Cut"],
    storyboardStatus: ["Planning", "Draft", "Ready", "In Use", "Complete", "Archived"],
    notePriority: ["Low", "Medium", "High", "Urgent"],
    noteCategory: ["Idea", "Question", "Plot Hole", "Character Idea", "Event Idea", "Lore Idea", "Setting", "Feedback"],
    eventKind: ["Main Event", "Normal Event"],
    strength: [1, 2, 3, 4, 5],
};

const F = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

/* ------------------------------------------------------------------ entities */

export const ENTITIES = {
    seasons: {
        label: "Season",
        plural: "Seasons",
        icon: "layers",
        color: "var(--c-season)",
        title: (d) => d.name || "Untitled season",
        subtitle: (d) => (d.number != null && d.number !== "" ? `Season ${d.number}` : d.status || ""),
        search: ["name", "description", "narrativeSummary", "themes", "conclusion"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("name", "Season name", "text", { required: true, span: 2, placeholder: "Season 1 — The Shattering" }),
                    F("number", "Season number", "number", { span: 1 }),
                    F("status", "Status", "select", { options: OPTIONS.seasonStatus, span: 1 }),
                    F("startDate", "Start date", "date"),
                    F("endDate", "End date", "date"),
                    F("themes", "Main themes", "tags", { span: 2, placeholder: "e.g. Betrayal, Rebirth" }),
                ],
            },
            {
                title: "Narrative",
                fields: [
                    F("description", "Description", "markdown", { span: 2 }),
                    F("narrativeSummary", "Overall narrative summary", "markdown", { span: 2 }),
                    F("conclusion", "Season conclusion", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("importantCharacterIds", "Important characters", "refs", { refType: "characters", span: 2 }),
                    F("majorFactionIds", "Major factions", "refs", { refType: "factions", span: 2 }),
                    F("mainLocationIds", "Main locations", "refs", { refType: "locations", span: 2 }),
                    F("importantLoreIds", "Important lore", "refs", { refType: "lore", span: 2 }),
                ],
            },
        ],
    },

    chapters: {
        label: "Chapter",
        plural: "Chapters",
        icon: "book",
        color: "var(--c-chapter)",
        title: (d) => d.title || "Untitled chapter",
        subtitle: (d) => (d.number != null && d.number !== "" ? `Chapter ${d.number}` : d.status || ""),
        search: ["title", "description", "objective", "openingSituation", "majorDevelopments", "endingSituation"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("title", "Chapter title", "text", { required: true, span: 2 }),
                    F("number", "Chapter number", "number"),
                    F("status", "Status", "select", { options: OPTIONS.chapterStatus }),
                    F("seasonId", "Season", "ref", { refType: "seasons" }),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Narrative",
                fields: [
                    F("objective", "Main narrative objective", "textarea", { span: 2 }),
                    F("openingSituation", "Opening situation", "markdown", { span: 2 }),
                    F("majorDevelopments", "Major developments", "markdown", { span: 2 }),
                    F("endingSituation", "Ending situation", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("importantCharacterIds", "Important characters", "refs", { refType: "characters", span: 2 }),
                    F("eventIds", "Associated events", "refs", { refType: "events", span: 2 }),
                    F("loreIds", "Associated lore", "refs", { refType: "lore", span: 2 }),
                ],
            },
        ],
    },

    story_arcs: {
        label: "Story arc",
        plural: "Story Arcs",
        icon: "branch",
        color: "var(--c-arc)",
        title: (d) => d.name || "Untitled arc",
        subtitle: (d) => d.mainConflict || d.status || "",
        search: ["name", "description", "mainConflict", "narrativePurpose", "prerequisites", "consequences"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("name", "Arc name", "text", { required: true, span: 2 }),
                    F("status", "Status", "select", { options: OPTIONS.arcStatus }),
                    F("progress", "Progress %", "number", { min: 0, max: 100 }),
                    F("seasonId", "Season", "ref", { refType: "seasons" }),
                    F("chapterId", "Chapter", "ref", { refType: "chapters" }),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Dramatic structure",
                fields: [
                    F("mainConflict", "Main conflict", "textarea", { span: 2 }),
                    F("narrativePurpose", "Narrative purpose", "textarea", { span: 2 }),
                    F("startingSituation", "Starting situation", "markdown", { span: 2 }),
                    F("desiredEnding", "Desired ending", "markdown", { span: 2 }),
                    F("prerequisites", "Prerequisites", "markdown", { span: 2 }),
                    F("consequences", "Consequences", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Cast & places",
                fields: [
                    F("mainCharacterIds", "Main characters", "refs", { refType: "characters", span: 2 }),
                    F("supportingCharacterIds", "Supporting characters", "refs", { refType: "characters", span: 2 }),
                    F("antagonistIds", "Antagonists", "refs", { refType: "characters", span: 2 }),
                    F("locationIds", "Important locations", "refs", { refType: "locations", span: 2 }),
                    F("factionIds", "Associated factions", "refs", { refType: "factions", span: 2 }),
                    F("loreIds", "Associated lore", "refs", { refType: "lore", span: 2 }),
                    F("eventIds", "Events in this arc", "refs", { refType: "events", span: 2 }),
                    F("threadIds", "Story threads", "refs", { refType: "story_threads", span: 2 }),
                ],
            },
        ],
    },

    story_threads: {
        label: "Story thread",
        plural: "Story Threads",
        icon: "share",
        color: "var(--c-thread)",
        title: (d) => d.title || "Untitled thread",
        subtitle: (d) => d.status || "",
        search: ["title", "description", "developments", "expectedResolution"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("title", "Thread title", "text", { required: true, span: 2 }),
                    F("status", "Status", "select", { options: OPTIONS.threadStatus }),
                    F("importance", "Importance", "select", { options: OPTIONS.importance }),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Development",
                fields: [
                    F("originEventId", "Origin event", "ref", { refType: "events", span: 2 }),
                    F("developments", "Current developments", "markdown", { span: 2 }),
                    F("expectedResolution", "Expected resolution", "markdown", { span: 2 }),
                    F("notes", "Notes", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("characterIds", "Related characters", "refs", { refType: "characters", span: 2 }),
                    F("factionIds", "Related factions", "refs", { refType: "factions", span: 2 }),
                    F("locationIds", "Related locations", "refs", { refType: "locations", span: 2 }),
                    F("loreIds", "Related lore", "refs", { refType: "lore", span: 2 }),
                    F("eventIds", "Connected events", "refs", { refType: "events", span: 2 }),
                    F("connectedThreadIds", "Connected threads", "refs", { refType: "story_threads", span: 2 }),
                    F("arcIds", "Story arcs", "refs", { refType: "story_arcs", span: 2 }),
                ],
            },
        ],
    },

    events: {
        label: "Event",
        plural: "Events",
        icon: "calendar",
        color: "var(--c-event)",
        title: (d) => d.title || "Untitled event",
        subtitle: (d) => [d.category, d.status].filter(Boolean).join(" · "),
        search: [
            "title",
            "description",
            "background",
            "context",
            "before",
            "sequence",
            "dialogue",
            "revelations",
            "conclusion",
            "tags",
            "code",
        ],
        groups: [
            {
                title: "Basic information",
                fields: [
                    F("title", "Event title", "text", { required: true, span: 2 }),
                    F("kind", "Event type", "segmented", { options: OPTIONS.eventKind }),
                    F("status", "Status", "select", { options: OPTIONS.eventStatus }),
                    F("code", "Event ID", "text", { placeholder: "auto", help: "Short reference code (auto-generated if left blank)." }),
                    F("importance", "Importance", "select", { options: OPTIONS.importance, custom: true }),
                    F("category", "Category", "select", { options: OPTIONS.eventCategory, custom: true }),
                    F("month", "Month", "month", { help: "Planning month used by the year/month timeline views." }),
                    F("plannedDate", "Planned date", "date"),
                    F("actualDate", "Actual date", "date"),
                    F("progress", "Completion %", "number", { min: 0, max: 100 }),
                    F("seasonId", "Season", "ref", { refType: "seasons" }),
                    F("chapterId", "Chapter", "ref", { refType: "chapters" }),
                    F("arcId", "Story arc", "ref", { refType: "story_arcs" }),
                    F("tags", "Tags", "tags", { span: 2 }),
                    F("description", "Event description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Narrative",
                fields: [
                    F("background", "Background", "markdown", { span: 2 }),
                    F("context", "Context", "markdown", { span: 2 }),
                    F("before", "What happens before", "markdown", { span: 2 }),
                    F("sequence", "Main event sequence", "markdown", { span: 2, tall: true }),
                    F("dialogue", "Important dialogue", "markdown", { span: 2 }),
                    F("motivations", "Character motivations", "markdown", { span: 2 }),
                    F("mainConflict", "Main conflict", "textarea", { span: 2 }),
                    F("revelations", "Key revelations", "markdown", { span: 2 }),
                    F("unexpected", "Unexpected developments", "markdown", { span: 2 }),
                    F("conclusion", "Event conclusion", "markdown", { span: 2 }),
                    F("immediateConsequences", "Immediate consequences", "markdown", { span: 2 }),
                    F("longTermConsequences", "Long-term consequences", "markdown", { span: 2 }),
                    F("futureImplications", "Future storyline implications", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Characters",
                fields: [
                    F("mainCharacterIds", "Main characters", "refs", { refType: "characters", span: 2 }),
                    F("supportingCharacterIds", "Supporting characters", "refs", { refType: "characters", span: 2 }),
                    F("antagonistIds", "Antagonists", "refs", { refType: "characters", span: 2 }),
                    F("affectedCharacterIds", "Characters indirectly affected", "refs", { refType: "characters", span: 2 }),
                    F("relationshipsAffected", "Character relationships affected", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("locationIds", "Locations", "refs", { refType: "locations", span: 2 }),
                    F("factionIds", "Factions", "refs", { refType: "factions", span: 2 }),
                    F("loreIds", "Lore", "refs", { refType: "lore", span: 2 }),
                    F("threadIds", "Story threads", "refs", { refType: "story_threads", span: 2 }),
                    F("relatedEventIds", "Related events", "refs", { refType: "events", span: 2 }),
                ],
            },
            {
                title: "Dependencies",
                fields: [
                    F("prerequisiteEventIds", "Prerequisite events", "refs", { refType: "events", span: 2 }),
                    F("leadsToEventIds", "Leads into", "refs", { refType: "events", span: 2 }),
                    F("simultaneousEventIds", "Simultaneous events", "refs", { refType: "events", span: 2 }),
                    F("alternativeEventIds", "Alternative paths", "refs", { refType: "events", span: 2 }),
                    F("dependencyOverride", "Override unmet prerequisites", "bool", {
                        span: 2,
                        help: "Treat this event as narratively ready even if a prerequisite is incomplete.",
                    }),
                ],
            },
            {
                title: "Production",
                fields: [
                    F("prepNotes", "Preparation notes", "markdown", { span: 2 }),
                    F("buildsRequired", "Required Minecraft builds", "markdown", { span: 2 }),
                    F("serverChanges", "Required server changes", "markdown", { span: 2 }),
                    F("participants", "Required participants", "markdown", { span: 2 }),
                    F("itemsProps", "Required items or props", "markdown", { span: 2 }),
                    F("cutscene", "Cutscene requirements", "markdown", { span: 2 }),
                    F("recording", "Recording requirements", "markdown", { span: 2 }),
                    F("organiserNotes", "Event organiser notes", "markdown", { span: 2 }),
                ],
            },
            {
                title: "References",
                fields: [
                    F("images", "Screenshots & images", "images", { span: 2 }),
                    F("attachments", "File attachments", "images", { span: 2, anyFile: true }),
                ],
            },
        ],
    },

    characters: {
        label: "Character",
        plural: "Characters",
        icon: "users",
        color: "var(--c-character)",
        title: (d) => d.name || "Unnamed character",
        subtitle: (d) => [d.username, d.type].filter(Boolean).join(" · "),
        search: ["name", "username", "nickname", "aliases", "personalitySummary", "history", "origin", "code", "notes"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("name", "Character name", "text", { required: true, span: 2 }),
                    F("code", "Character ID", "text", { placeholder: "auto" }),
                    F("type", "Character type", "select", { options: OPTIONS.characterType }),
                    F("username", "Minecraft username", "text"),
                    F("nickname", "Nickname", "text"),
                    F("aliases", "Aliases", "tags", { span: 2, placeholder: "Comma separated" }),
                    F("status", "Current status", "select", { options: OPTIONS.characterStatus }),
                    F("firstAppearance", "First appearance", "date"),
                    F("seasonId", "Associated season", "ref", { refType: "seasons" }),
                    F("factionId", "Primary faction", "ref", { refType: "factions" }),
                    F("image", "Profile image", "image", { span: 2 }),
                ],
            },
            {
                title: "Physical description",
                fields: [
                    F("appearance", "Appearance", "markdown", { span: 2 }),
                    F("clothing", "Clothing", "markdown"),
                    F("armour", "Armour", "markdown"),
                    F("distinguishing", "Distinguishing features", "textarea", { span: 2 }),
                    F("physical", "Physical characteristics", "textarea", { span: 2 }),
                    F("refImages", "Skin / reference images", "images", { span: 2 }),
                ],
            },
            {
                title: "Personality",
                fields: [
                    F("personalitySummary", "Personality summary", "markdown", { span: 2 }),
                    F("positiveTraits", "Positive traits", "tags", { span: 2 }),
                    F("negativeTraits", "Negative traits", "tags", { span: 2 }),
                    F("strengths", "Strengths", "tags", { span: 2 }),
                    F("weaknesses", "Weaknesses", "tags", { span: 2 }),
                    F("fears", "Fears", "tags", { span: 2 }),
                    F("interests", "Interests", "tags", { span: 2 }),
                    F("habits", "Habits", "textarea", { span: 2 }),
                    F("behaviour", "Behaviour patterns", "markdown", { span: 2 }),
                    F("values", "Values", "textarea", { span: 2 }),
                    F("morality", "Morality", "textarea", { span: 2 }),
                    F("personalityChanges", "Personality changes over time", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Background",
                fields: [
                    F("origin", "Origin", "textarea", { span: 2 }),
                    F("history", "History", "markdown", { span: 2 }),
                    F("family", "Family", "textarea", { span: 2 }),
                    F("pastRelationships", "Previous relationships", "markdown", { span: 2 }),
                    F("pastEvents", "Childhood / past events", "markdown", { span: 2 }),
                    F("experiences", "Important experiences", "markdown", { span: 2 }),
                    F("secrets", "Secrets", "markdown", { span: 2 }),
                    F("previousAffiliations", "Previous affiliations", "textarea", { span: 2 }),
                ],
            },
            {
                title: "Motivations",
                fields: [
                    F("primaryMotivation", "Primary motivation", "textarea", { span: 2 }),
                    F("secondaryMotivations", "Secondary motivations", "textarea", { span: 2 }),
                    F("goals", "Goals", "markdown", { span: 2 }),
                    F("ambitions", "Ambitions", "markdown", { span: 2 }),
                    F("personalConflicts", "Personal conflicts", "markdown", { span: 2 }),
                    F("wants", "What they want", "textarea", { span: 2 }),
                    F("willingToDo", "What they are willing to do", "textarea", { span: 2 }),
                ],
            },
            {
                title: "Narrative role",
                fields: [F("roles", "Role labels", "multiselect", { options: OPTIONS.role, span: 2, help: "Multiple labels allowed." })],
            },
            {
                title: "Development",
                fields: [
                    F("startingPersonality", "Starting personality", "markdown", { span: 2 }),
                    F("currentPersonality", "Current personality", "markdown", { span: 2 }),
                    F("developmentStages", "Character development stages", "markdown", { span: 2 }),
                    F("turningPoints", "Important turning points", "markdown", { span: 2 }),
                    F("majorDecisions", "Major decisions", "markdown", { span: 2 }),
                    F("emotionalChanges", "Emotional changes", "markdown", { span: 2 }),
                    F("characterArc", "Character arc", "markdown", { span: 2 }),
                    F("futureDevelopment", "Expected future development", "markdown", { span: 2 }),
                    F("characterConclusion", "Character conclusion", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Knowledge & secrets",
                fields: [
                    F("knownInfo", "Known information", "markdown", { span: 2 }),
                    F("unknownInfo", "Unknown information", "markdown", { span: 2 }),
                    F("secretsHeld", "Secrets they possess", "markdown", { span: 2 }),
                    F("secretsAbout", "Secrets others know about them", "markdown", { span: 2 }),
                    F("falseBeliefs", "False beliefs", "markdown", { span: 2 }),
                    F("discoveries", "Important discoveries", "markdown", { span: 2 }),
                    F("hiding", "Information they are hiding", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("itemIds", "Important items", "tags", { span: 2 }),
                    F("locationIds", "Important locations", "refs", { refType: "locations", span: 2 }),
                    F("factionIds", "Other affiliations", "refs", { refType: "factions", span: 2 }),
                    F("loreIds", "Associated lore", "refs", { refType: "lore", span: 2 }),
                    F("arcIds", "Story arcs", "refs", { refType: "story_arcs", span: 2 }),
                    F("threadIds", "Story threads", "refs", { refType: "story_threads", span: 2 }),
                ],
            },
            {
                title: "Additional",
                fields: [
                    F("dialogueReferences", "Dialogue references", "markdown", { span: 2 }),
                    F("notes", "Notes", "markdown", { span: 2 }),
                    F("futurePlans", "Future plans", "markdown", { span: 2 }),
                    F("images", "Additional images", "images", { span: 2 }),
                ],
            },
        ],
    },

    character_relationships: {
        label: "Relationship",
        plural: "Relationships",
        icon: "link",
        color: "var(--c-character)",
        title: (d) => d.label || d.type || "Relationship",
        subtitle: (d) => d.status || "",
        search: ["type", "description", "history", "reasons", "notes"],
        groups: [
            {
                title: "Pair",
                fields: [
                    F("aId", "Character A", "ref", { refType: "characters", required: true }),
                    F("bId", "Character B", "ref", { refType: "characters", required: true }),
                    F("type", "Relationship type", "select", { options: OPTIONS.relType, custom: true }),
                    F("status", "Current status", "select", { options: OPTIONS.relStatus }),
                    F("strength", "Strength / importance", "select", {
                        options: [
                            { value: "1", label: "1 — passing" },
                            { value: "2", label: "2 — minor" },
                            { value: "3", label: "3 — notable" },
                            { value: "4", label: "4 — major" },
                            { value: "5", label: "5 — defining" },
                        ],
                    }),
                    F("startDate", "Start date", "date"),
                    F("endDate", "End date", "date"),
                ],
            },
            {
                title: "Detail",
                fields: [
                    F("description", "Description", "markdown", { span: 2 }),
                    F("history", "Relationship history", "markdown", { span: 2 }),
                    F("reasons", "Reasons for the relationship", "textarea", { span: 2 }),
                    F("knownToA", "Known to character A", "bool"),
                    F("knownToB", "Known to character B", "bool"),
                    F("eventIds", "Events that influenced it", "refs", { refType: "events", span: 2 }),
                ],
            },
            {
                title: "Change over time",
                fields: [F("historySteps", "Relationship timeline", "historySteps", { span: 2 })],
            },
        ],
    },

    lore: {
        label: "Lore entry",
        plural: "Lore Database",
        icon: "book",
        color: "var(--c-lore)",
        title: (d) => d.title || "Untitled lore",
        subtitle: (d) => d.category || "",
        search: ["title", "shortDescription", "fullExplanation", "origin", "secrets", "code", "tags"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("title", "Lore title", "text", { required: true, span: 2 }),
                    F("code", "Lore ID", "text", { placeholder: "auto" }),
                    F("category", "Category", "select", { options: OPTIONS.loreCategory, custom: true }),
                    F("knowledge", "Knowledge classification", "select", { options: OPTIONS.knowledge }),
                    F("discoveryDate", "Discovery date", "date"),
                    F("tags", "Tags", "tags"),
                    F("shortDescription", "Short description", "textarea", { span: 2 }),
                    F("fullExplanation", "Full explanation", "markdown", { span: 2, tall: true }),
                ],
            },
            {
                title: "Significance",
                fields: [
                    F("origin", "Origin", "markdown", { span: 2 }),
                    F("historicalSignificance", "Historical significance", "markdown", { span: 2 }),
                    F("currentRelevance", "Current relevance", "markdown", { span: 2 }),
                    F("timelineReferences", "Timeline references", "markdown", { span: 2 }),
                ],
            },
            {
                title: "What is and isn't known",
                fields: [
                    F("knownInfo", "Known information", "markdown", { span: 2 }),
                    F("unknownInfo", "Unknown information", "markdown", { span: 2 }),
                    F("secrets", "Secrets (creator knowledge only)", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("characterIds", "Related characters", "refs", { refType: "characters", span: 2 }),
                    F("eventIds", "Related events", "refs", { refType: "events", span: 2 }),
                    F("locationIds", "Related locations", "refs", { refType: "locations", span: 2 }),
                    F("factionIds", "Related factions", "refs", { refType: "factions", span: 2 }),
                    F("relatedLoreIds", "Related lore entries", "refs", { refType: "lore", span: 2 }),
                ],
            },
            {
                title: "Files & notes",
                fields: [
                    F("images", "Images", "images", { span: 2 }),
                    F("attachments", "Attachments", "images", { span: 2, anyFile: true }),
                    F("notes", "Internal notes", "markdown", { span: 2 }),
                ],
            },
        ],
    },

    factions: {
        label: "Faction",
        plural: "Factions",
        icon: "flag",
        color: "var(--c-faction)",
        title: (d) => d.name || "Unnamed faction",
        subtitle: (d) => d.status || "",
        search: ["name", "description", "objectives", "beliefs", "history", "structure", "secrets"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("name", "Faction name", "text", { required: true, span: 2 }),
                    F("status", "Current status", "select", { options: OPTIONS.factionStatus }),
                    F("foundedDate", "Founding date", "date"),
                    F("leaderId", "Leader", "ref", { refType: "characters" }),
                    F("logo", "Logo / image", "image", { span: 2 }),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Beliefs & goals",
                fields: [
                    F("objectives", "Main objectives", "markdown", { span: 2 }),
                    F("beliefs", "Beliefs", "markdown", { span: 2 }),
                    F("structure", "Internal structure", "markdown", { span: 2 }),
                    F("politicalInfluence", "Political influence", "textarea", { span: 2 }),
                    F("history", "History", "markdown", { span: 2 }),
                    F("secrets", "Secrets", "markdown", { span: 2 }),
                    F("futurePlans", "Future plans", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Membership",
                fields: [
                    F("memberIds", "Members", "refs", { refType: "characters", span: 2 }),
                    F("formerMemberIds", "Former members", "refs", { refType: "characters", span: 2 }),
                    F("allyFactionIds", "Allies", "refs", { refType: "factions", span: 2 }),
                    F("enemyFactionIds", "Enemies", "refs", { refType: "factions", span: 2 }),
                    F("rivalFactionIds", "Rivals", "refs", { refType: "factions", span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("eventIds", "Important events", "refs", { refType: "events", span: 2 }),
                    F("locationIds", "Associated locations", "refs", { refType: "locations", span: 2 }),
                    F("loreIds", "Important lore", "refs", { refType: "lore", span: 2 }),
                    F("arcIds", "Story arcs", "refs", { refType: "story_arcs", span: 2 }),
                ],
            },
            { title: "Membership changes", fields: [F("memberHistory", "Membership over time", "memberHistory", { span: 2 })] },
        ],
    },

    faction_relationships: {
        label: "Faction relationship",
        plural: "Faction relationships",
        icon: "share",
        color: "var(--c-faction)",
        title: (d) => d.type || "Faction relationship",
        subtitle: (d) => d.status || "",
        search: ["type", "description", "history"],
        groups: [
            {
                title: "Pair",
                fields: [
                    F("aId", "Faction A", "ref", { refType: "factions", required: true }),
                    F("bId", "Faction B", "ref", { refType: "factions", required: true }),
                    F("type", "Relationship type", "select", { options: ["Alliance", "Rivalry", "War", "Truce", "Vassalage", "Neutral", "Secret pact"], custom: true }),
                    F("status", "Status", "select", { options: OPTIONS.relStatus }),
                    F("strength", "Strength", "select", {
                        options: [
                            { value: "1", label: "1 — nominal" },
                            { value: "2", label: "2 — weak" },
                            { value: "3", label: "3 — notable" },
                            { value: "4", label: "4 — strong" },
                            { value: "5", label: "5 — defining" },
                        ],
                    }),
                    F("startDate", "Start date", "date"),
                    F("endDate", "End date", "date"),
                ],
            },
            {
                title: "Detail",
                fields: [
                    F("description", "Description", "markdown", { span: 2 }),
                    F("history", "History", "markdown", { span: 2 }),
                    F("eventIds", "Related events", "refs", { refType: "events", span: 2 }),
                ],
            },
        ],
    },

    locations: {
        label: "Location",
        plural: "Locations",
        icon: "mapPin",
        color: "var(--c-location)",
        title: (d) => d.name || "Unnamed location",
        subtitle: (d) => [d.dimension, d.type].filter(Boolean).join(" · "),
        search: ["name", "description", "notes", "coords", "code"],
        groups: [
            {
                title: "Identity",
                fields: [
                    F("name", "Location name", "text", { required: true, span: 2 }),
                    F("code", "Location ID", "text", { placeholder: "auto" }),
                    F("type", "Location type", "select", { options: OPTIONS.locationType, custom: true }),
                    F("dimension", "Dimension", "select", { options: OPTIONS.dimension, custom: true }),
                    F("coords", "Coordinates", "text", { placeholder: "x, y, z" }),
                    F("condition", "Current condition", "text", { placeholder: "Intact / Ruined / Under construction" }),
                    F("discoveryDate", "Discovery date", "date"),
                    F("constructionDate", "Construction date", "date"),
                    F("destructionDate", "Destruction date", "date"),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Significance",
                fields: [
                    F("significance", "Historical significance", "markdown", { span: 2 }),
                    F("notes", "Important notes", "markdown", { span: 2 }),
                ],
            },
            {
                title: "Connections",
                fields: [
                    F("characterIds", "Associated characters", "refs", { refType: "characters", span: 2 }),
                    F("factionIds", "Associated factions", "refs", { refType: "factions", span: 2 }),
                    F("eventIds", "Associated events", "refs", { refType: "events", span: 2 }),
                    F("loreIds", "Associated lore", "refs", { refType: "lore", span: 2 }),
                    F("images", "Screenshots", "images", { span: 2 }),
                ],
            },
        ],
    },

    storyboards: {
        label: "Storyboard",
        plural: "Storyboards",
        icon: "list",
        color: "var(--c-event)",
        title: (d) => d.title || "Untitled storyboard",
        subtitle: (d) => d.status || "",
        search: ["title", "description"],
        groups: [
            {
                title: "Storyboard",
                fields: [
                    F("title", "Title", "text", { required: true, span: 2 }),
                    F("status", "Status", "select", { options: OPTIONS.storyboardStatus }),
                    F("eventId", "Linked event", "ref", { refType: "events" }),
                    F("chapterId", "Linked chapter", "ref", { refType: "chapters" }),
                    F("description", "Description", "markdown", { span: 2 }),
                ],
            },
        ],
    },

    notes: {
        label: "Note",
        plural: "Notes & Ideas",
        icon: "note",
        color: "var(--c-note)",
        title: (d) => d.title || "Untitled note",
        subtitle: (d) => [d.category, d.priority].filter(Boolean).join(" · "),
        search: ["title", "content", "tags", "category"],
        groups: [
            {
                title: "Note",
                fields: [
                    F("title", "Title", "text", { required: true, span: 2 }),
                    F("category", "Category", "select", { options: OPTIONS.noteCategory, custom: true }),
                    F("priority", "Priority", "select", { options: OPTIONS.notePriority }),
                    F("pinned", "Pin to top", "bool"),
                    F("tags", "Tags", "tags", { span: 2 }),
                    F("content", "Content", "markdown", { span: 2, tall: true }),
                ],
            },
            {
                title: "Related to",
                fields: [
                    F("characterIds", "Characters", "refs", { refType: "characters", span: 2 }),
                    F("eventIds", "Events", "refs", { refType: "events", span: 2 }),
                    F("loreIds", "Lore", "refs", { refType: "lore", span: 2 }),
                    F("arcIds", "Story arcs", "refs", { refType: "story_arcs", span: 2 }),
                ],
            },
        ],
    },
};

/* Collections that are not user-facing entities but still appear in exports. */
export const SUPPORT_COLLECTIONS = ["diagrams", "planner_settings", "members", "change_history", "storyboard_scenes"];

export function entityFor(collection) {
    return ENTITIES[collection] || null;
}

/** All (collection, field, refType) links — the backbone of cross-referencing. */
export const LINKS = Object.entries(ENTITIES).flatMap(([collection, def]) =>
    def.groups.flatMap((group) =>
        group.fields
            .filter((f) => (f.type === "ref" || f.type === "refs") && f.refType)
            .map((f) => ({ collection, field: f.key, refType: f.refType, label: f.label }))
    )
);
