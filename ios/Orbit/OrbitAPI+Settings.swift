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

    /// What a phone can find out about its own connection, one line each, so
    /// "voice is not working" becomes a specific sentence. Never throws: a
    /// failure is a line, not an exception.
    func checkConnection() async -> [String] {
        var out: [String] = []
        do {
            _ = try await today()
            out.append("Server: reachable")
        } catch {
            out.append("Server: cannot reach \(base.absoluteString). Pull and rebuild if the tunnel moved.")
            return out
        }
        do {
            let v = try await voiceToken()
            out.append(v.token != nil ? "Voice token: mints" : "Voice token: none (\(v.reason ?? "no reason given"))")
        } catch {
            out.append("Voice token: request failed (\(error.localizedDescription))")
        }
        do {
            var req = URLRequest(url: base.appendingPathComponent("api/voice/speak"))
            req.url = URL(string: base.appendingPathComponent("api/voice/speak").absoluteString + "?say=greeting")
            req.timeoutInterval = 20
            let (data, resp) = try await URLSession.shared.data(for: req)
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            out.append(status == 200 ? "Speech: \(data.count / 1024) KB of audio" : "Speech: HTTP \(status)")
        } catch {
            out.append("Speech: request failed (\(error.localizedDescription))")
        }
        return out
    }

    /// Back to the opening state. Server-side; the phone only asks.
    func resetDemo() async throws {
        _ = try await send(path: "api/reset", method: "POST", body: Optional<Empty>.none)
    }

    private struct Empty: Encodable {}
}
