import Foundation

/// The Calendar and Settings tabs' half of the API: the import, and the reset.
extension OrbitAPI {

    struct ImportResult {
        /// One sentence the screen can show as-is.
        let summary: String
    }

    /// Timetable and Canvas import. Empty fields are omitted so the server only
    /// touches what was given. The Canvas link is a credential: it is posted
    /// once and never written anywhere on the phone.
    func importCalendars(timetableUrl: String, canvasUrl: String) async throws -> ImportResult {
        struct Body: Encodable {
            let timetableUrl: String?
            let canvasUrl: String?
        }
        let t = timetableUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let c = canvasUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let data = try await send(
            path: "api/import",
            method: "POST",
            body: Body(timetableUrl: t.isEmpty ? nil : t, canvasUrl: c.isEmpty ? nil : c),
            timeout: 30
        )

        // The response shape is the server's to change; read it defensively and
        // say only what is there.
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let warnings = (json["warnings"] as? [String]) ?? []
        let counts = ["blocks", "tasks", "imported", "updated"].compactMap { key -> String? in
            guard let n = json[key] as? Int else { return nil }
            return "\(n) \(key)"
        }
        let head = counts.isEmpty ? "Imported." : "Imported: " + counts.joined(separator: ", ") + "."
        return ImportResult(summary: warnings.isEmpty ? head : head + " " + warnings.joined(separator: " "))
    }

    /// The weekly board, everyone or one group. The standing and the gaps in
    /// it are computed on the server.
    func crew(group: String?) async throws -> Crew {
        var path = "api/leaderboard"
        if let group, let encoded = group.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path += "?group=\(encoded)"
        }
        let data = try await send(path: path, method: "GET", body: Optional<Empty>.none)
        return try decoder.decode(Crew.self, from: data)
    }

    /// Back to the opening state. Server-side; the phone only asks.
    func resetDemo() async throws {
        _ = try await send(path: "api/reset", method: "POST", body: Optional<Empty>.none)
    }

    private struct Empty: Encodable {}
}
