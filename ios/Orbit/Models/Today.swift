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
    }

    struct TaskItem: Decodable, Identifiable, Hashable {
        let id: String
        let title: String
        let domain: String
        let estimateMinutes: Int
        let planningMinutes: Int
        let courseCode: String?
        let dueAt: String?
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
