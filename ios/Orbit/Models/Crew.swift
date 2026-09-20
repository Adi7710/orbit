import Foundation

/// One `Codable` mirroring `GET /api/leaderboard`.
///
/// Everything competitive here is written by the server: the rank, the two
/// gaps that make it a race, and each row's share of the leader's total for
/// the bar. The phone prints these. It never subtracts one XP total from
/// another, which is the same rule as every other number in the app.
struct Crew: Decodable {
    let rows: [Row]
    let me: Standing?
    let groups: [String]
    let group: String?

    struct Row: Decodable, Identifiable, Hashable {
        let userId: String
        let name: String
        let xpWeek: Int
        let streakWeeks: Int
        let ringsClosed: Int
        let group: String?
        let rank: Int
        /// This row against the leader, 0...1. The leader is 1.
        let share: Double

        var id: String { userId }
    }

    struct Standing: Decodable, Hashable {
        let rank: Int
        let total: Int
        let xpWeek: Int
        let ahead: Gap?
        let behind: Gap?

        struct Gap: Decodable, Hashable {
            let name: String
            let byXp: Int
        }
    }
}
