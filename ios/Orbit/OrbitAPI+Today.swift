import Foundation

/// The Today screen's half of the API. Kept in its own file so the map screen's
/// `OrbitAPI.swift` and this can be edited by two people without colliding.
extension OrbitAPI {

    /// Thrown with the server's own status code so callers can tell "already
    /// resolved" (409) from "unreachable", which the UI words differently.
    struct HTTPError: Error {
        let status: Int
        var isConflict: Bool { status == 409 }
    }

    // MARK: - Reads

    /// Returns the decoded day and the raw bytes, so the caller can cache the
    /// exact payload it rendered rather than a re-encoding of it.
    func today() async throws -> (day: Today, raw: Data) {
        let data = try await send(path: "api/today", method: "GET", body: Optional<NoBody>.none)
        return (try decoder.decode(Today.self, from: data), data)
    }

    // MARK: - Writes

    func plan() async throws -> PlanResponse {
        let data = try await send(path: "api/plan", method: "POST", body: Optional<NoBody>.none, timeout: 45)
        return try decoder.decode(PlanResponse.self, from: data)
    }

    func decide(proposalId: String, approve: Bool) async throws -> DecisionResponse {
        struct Body: Encodable { let decision: String }
        let data = try await send(
            path: "api/proposals/\(proposalId)",
            method: "POST",
            body: Body(decision: approve ? "approve" : "decline")
        )
        return try decoder.decode(DecisionResponse.self, from: data)
    }

    /// The phone reports how long the work actually took. It never reports XP:
    /// the number and its reasons come back from the server.
    func complete(taskId: String, actualMinutes: Int) async throws -> CompleteResponse {
        struct Body: Encodable { let taskId: String; let actualMinutes: Int }
        let data = try await send(
            path: "api/complete",
            method: "POST",
            body: Body(taskId: taskId, actualMinutes: actualMinutes)
        )
        return try decoder.decode(CompleteResponse.self, from: data)
    }

    func setMode(_ mode: Today.Mode) async throws -> ModeResponse {
        struct Body: Encodable { let mode: String }
        let data = try await send(path: "api/mode", method: "POST", body: Body(mode: mode.rawValue))
        return try decoder.decode(ModeResponse.self, from: data)
    }

    /// Stands in for "this request has no body". `Never` cannot be used here:
    /// it is not Encodable.
    private struct NoBody: Encodable {}

    // MARK: - Transport

    private func send<B: Encodable>(
        path: String,
        method: String,
        body: B?,
        timeout: TimeInterval = 15
    ) async throws -> Data {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = timeout
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw HTTPError(status: status) }
        return data
    }
}
