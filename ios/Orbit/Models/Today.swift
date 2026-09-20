import Foundation

/// Mirrors `GET /api/today` (`src/lib/today.ts`). Every number here was
/// computed on the server. Nothing in this file does arithmetic on a time, and
/// nothing downstream of it should either: if a view needs a new number, it is
/// added to `buildToday()` and to `docs`/`DECISIONS.md`, not derived here.
///
/// Only the fields the iOS client renders are declared. Unknown JSON keys are
/// ignored by `JSONDecoder`, so the server staying ahead of the app is safe;
/// the app inventing a field it wants is not.
struct Today: Decodable {
    let mode: Mode
    let user: User
    let ledger: Ledger
    /// Added for the iOS timeline. Optional so a build of the app still runs
    /// against a server deployed before the field existed — it degrades to the
    /// gaps-only layout instead of showing an empty day.
    let blocks: [DayBlock]?
    let gaps: [Gap]
    let quests: [Quest]
    let bus: Bus?
    let shared: [SharedWindow]
    let tasks: [TaskItem]
    let transit: Transit
    let proposals: [Proposal]
    /// What the weekly review has worked out about this student. Optional so a
    /// build still decodes against a server deployed before the field existed;
    /// empty renders nothing rather than an "all clear" card.
    /// What to let go of when the day will not fit. Empty unless
    /// `ledger.overCommitted`.
    let cuts: [Cut]?
    let learned: [LearnedFact]?
    /// Deadlines the remaining work no longer fits in front of.
    let atRisk: [AtRiskTask]?
    /// What this mode asks the screen to do. The server owns the rules so the
    /// phone and the web app cannot hold different ideas of what Crisis means.
    /// Optional so a build still decodes against a server deployed before it.
    let modeConfig: ModeConfig?
    /// Capacity, which is not the same question as `atRisk`. `atRisk` is the
    /// procrastination aspect saying this student starts too late; this is
    /// arithmetic saying the work does not fit even starting now.
    let feasibility: Feasibility?
    /// What is due, ranked tightest-first by the server.
    let deadlines: [DeadlineItem]?
    /// Crisis only: where the work actually goes, window by window.
    let workBlocks: [WorkBlock]?

    enum Mode: String, Decodable, CaseIterable {
        case normal, crisis, chill
        var label: String {
            switch self {
            case .normal: return "Normal"
            case .crisis: return "Crisis"
            case .chill: return "Chill"
            }
        }
    }

    struct User: Decodable {
        let name: String
        let xpWeek: Int
        let streakWeeks: Int
        let group: String?
    }

    struct Ledger: Decodable {
        let usable: Int
        let naiveFree: Int
        /// Minutes between waking and sleeping. `fixed + travel + meals +
        /// routines + usable` sums to exactly this, which is what makes it the
        /// right whole for the ledger rings. `naiveFree` is NOT that whole —
        /// it already has class taken out. Optional so a build still decodes
        /// against a server deployed before the field existed.
        let awake: Int?
        let travel: Int
        let meals: Int
        let routines: Int
        /// travel + meals + routines, summed by computeLedger(). Optional only so
        /// an older deploy still decodes; the fallback sums the same three.
        let friction: Int?
        let fixed: Int
        let queued: Int
        let slack: Int
        let overCommitted: Bool

        var frictionMinutes: Int { friction ?? (travel + meals + routines) }
    }

    struct DayBlock: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let kind: String            // class | work | event | routine
        let courseCode: String?
        let place: String?
        let startText: String
        let endText: String
        let minutes: Int
        let status: Status
        /// 0...1 while in progress, nil otherwise. Server-computed.
        let progress: Double?
        let remainingMinutes: Int?

        /// Forward-compatible: a status this build has never heard of sorts in
        /// with the rest of the day rather than crashing the whole screen.
        enum Status: String, Decodable, Hashable {
            case now, next, done, later

            init(from decoder: Decoder) throws {
                let raw = try decoder.singleValueContainer().decode(String.self)
                self = Status(rawValue: raw) ?? .later
            }
        }
    }

    struct Gap: Decodable, Identifiable, Hashable {
        let id: String
        let startText: String
        let endText: String
        let usable: Int
        let fromPlace: String?
        let isEvening: Bool
        let pick: Pick?

        struct Pick: Decodable, Hashable {
            let id: String
            let title: String
            let estimateMinutes: Int
        }
    }

    struct Quest: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let xp: Int
        let kind: String
        let expiresText: String
    }

    struct Bus: Decodable, Hashable {
        let route: String
        let headsign: String
        let leaveByText: String
        let arrivalText: String
        let status: String          // live | scheduled | ghost
        let live: Bool
        let ghost: Bool
        let why: String
        let stopName: String
        let walkToStop: Int
        let rideMinutes: Int
        let classAtText: String?
        let verdict: Verdict?

        struct Verdict: Decodable, Hashable {
            let makesIt: Bool
            let marginMin: Int
        }
    }

    struct SharedWindow: Decodable, Hashable {
        let startText: String
        let endText: String
        let minutes: Int
        let names: [String]
        /// Parallel to `names`. The stable identity, and what joins a person
        /// to their crew row — two people can share a first name, and a
        /// rename would otherwise move someone between groups.
        let userIds: [String]?
    }

    struct TaskItem: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let domain: String
        let estimateMinutes: Int
        let planningMinutes: Int
        let courseCode: String?
        let dueAt: String?
        /// "due tomorrow". Written by the server so the phone never decides
        /// how to say a deadline.
        let dueText: String?
        /// "overdue" | "today" | "soon" | "later". Also the server's, which
        /// is what makes a week view possible without date arithmetic here.
        let bucket: String?
    }

    struct Transit: Decodable, Hashable {
        let clockText: String
        let simulated: Bool
        let realtimeOk: Bool
        /// Why there is nothing to catch. The server writes the sentence; the
        /// app prints it. Present whenever `bus` is nil, which is most of the
        /// day, and the reason "Getting there" is never an empty card.
        let why: String?
        /// The class a departure would be for, when one is still ahead.
        let nextClass: NextClass?

        struct NextClass: Decodable, Hashable {
            let title: String
            let startText: String
            let minutesAway: Int
        }
    }

    struct ModeConfig: Decodable, Hashable {
        let id: String
        let name: String
        let difficulty: String
        let promise: String
        let minUsableGap: Int
        let questsOptional: Bool
        let questStrategy: String
        /// "quiet-line" | "due-soon-card" | "drive-day"
        let deadlineMode: String
        /// "off" | "suggest-on-shortfall" | "always"
        let feasibilityMode: String
        let leaveBy: String
        let restBreakPerMin: Int?

        /// Whether this mode wants the meter on screen for this day. The rule
        /// lives here rather than at the call site so Today and any later page
        /// cannot disagree about it.
        func showsFeasibility(shortfallMin: Int) -> Bool {
            switch feasibilityMode {
            case "always": return true
            case "suggest-on-shortfall": return shortfallMin > 0
            default: return false
            }
        }
    }

    struct Feasibility: Decodable, Hashable {
        let needMin: Int
        let haveMin: Int
        let shortfallMin: Int
        /// Written by code on the server, for the same reason every other
        /// sentence here is: the words can never disagree with the number.
        let message: String
        let deadlines: [Verdict]

        struct Verdict: Decodable, Identifiable, Hashable {
            let id: String
            let title: String
            let fits: Bool
            let slackMin: Int
        }
    }

    struct DeadlineItem: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let dueText: String
        let overdue: Bool
        let remainingEffortMin: Int
        let courseCode: String?
    }

    struct WorkBlock: Decodable, Identifiable, Hashable {
        let deadlineId: String
        let title: String
        let gapId: String
        let minutes: Int
        let startText: String
        let endText: String
        /// True when this block finishes the thing rather than chipping at it.
        let completes: Bool

        var id: String { "\(deadlineId)-\(startText)" }
    }

    struct Cut: Decodable, Identifiable, Hashable {
        let task: CutTask
        let minutesSaved: Int

        struct CutTask: Decodable, Hashable {
            let title: String
        }

        var id: String { task.title }
    }

    struct LearnedFact: Decodable, Identifiable, Hashable {
        let aspect: String
        let label: String
        /// Written by code on the server precisely so the words can never
        /// disagree with the multiplier behind them. The app prints it and
        /// never rephrases it. See DECISIONS, 20 Sept 03:05.
        let sentence: String
        /// "nemotron-hosted" when the model did the last review, "heuristic"
        /// when the rules did. Shown, so the credit is exact.
        let learnedBy: String?
        /// The memo the model wrote to itself, when there is one.
        let memo: String?

        var isNemotron: Bool { learnedBy?.hasPrefix("nemotron") == true }

        /// One aspect can speak about several categories, so the sentence is
        /// part of the identity.
        var id: String { aspect + "::" + sentence }
    }

    struct AtRiskTask: Decodable, Identifiable, Hashable {
        let taskId: String
        let title: String
        let needsMinutes: Int

        var id: String { taskId }
    }

    struct Proposal: Decodable, Identifiable, Hashable {
        let id: String
        let status: String
        let proposal: Body

        struct Body: Decodable, Hashable {
            let kind: String
            let reason: String
            let body: String?
            let to: String?
            let subject: String?
            let building: String?
            let message: String?
        }
    }

    var pendingProposals: [Proposal] { proposals.filter { $0.status == "pending" } }
}

// MARK: - Other endpoints

struct PlanResponse: Decodable {
    let proposals: [Today.Proposal]
    let narration: String
    let provider: String
}

struct DecisionResponse: Decodable {
    let ok: Bool
    let status: String?
    let effect: String?
}

/// `POST /api/complete`. XP and its reasons are the server's answer, never the
/// phone's guess.
struct CompleteResponse: Decodable {
    let ok: Bool
    let xp: Int
    let reasons: [String]
    let planned: Int
    let multiplier: Double
}

struct ModeResponse: Decodable {
    let ok: Bool
    let mode: Today.Mode?
}
