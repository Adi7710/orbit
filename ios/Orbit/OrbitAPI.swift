import Foundation
import CoreLocation

/// Talks to the Orbit server. Every number on screen comes from here; the app
/// never recomputes a time. Base URL is read from Info.plist key ORBIT_API_BASE
/// so the simulator can point at a laptop and TestFlight at Vercel.
actor OrbitAPI {
    static let shared = OrbitAPI()

    let base: URL = {
        let s = Bundle.main.object(forInfoDictionaryKey: "ORBIT_API_BASE") as? String
        return URL(string: s?.isEmpty == false ? s! : "http://localhost:3123")!
    }()

    let decoder = JSONDecoder()

    func journey(from: String, to: String, arriveBy: String? = nil, origin: CLLocationCoordinate2D? = nil) async throws -> Journey {
        var c = URLComponents(url: base.appendingPathComponent("api/transit/journey"), resolvingAgainstBaseURL: false)!
        var q = [URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to)]
        if let arriveBy { q.append(.init(name: "arriveBy", value: arriveBy)) }
        if let origin {
            q.append(.init(name: "lat", value: String(origin.latitude)))
            q.append(.init(name: "lon", value: String(origin.longitude)))
        }
        c.queryItems = q
        var req = URLRequest(url: c.url!)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 10
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try decoder.decode(Journey.self, from: data)
    }
}

// MARK: - Models (mirror /api/transit/journey exactly)

struct Journey: Decodable {
    struct Clock: Decodable { let sec: Int; let text: String; let simulated: Bool }
    struct Place: Decodable { let lat: Double; let lon: Double; let label: String; let arriveByText: String? }
    struct Stop: Decodable { let id: String; let name: String; let lat: Double; let lon: Double }
    struct Walk: Decodable { let minutes: Int; let meters: Int; let polyline: [[Double]]; let source: String }
    struct Realtime: Decodable { let tripsOk: Bool; let vehiclesOk: Bool }

    let clock: Clock
    let origin: Place
    let destination: Place
    let boardStop: Stop
    let alightStop: Stop
    let walkToStop: Walk
    let walkToDest: Walk
    let options: [Option]
    let realtime: Realtime
    let routeColors: [String: String?]

    struct Option: Decodable, Identifiable {
        struct Vehicle: Decodable { let id: String; let lat: Double; let lon: Double; let bearing: Double?; let ageSec: Int; let metersToStop: Int }
        struct Verdict: Decodable { let makesIt: Bool; let marginMin: Int }

        let route: String
        let headsign: String
        let tripId: String
        let departsSec: Int
        let departsText: String
        let scheduledText: String
        let status: String          // "live" | "scheduled" | "ghost"
        let delaySec: Int?
        let vehicle: Vehicle?
        let leaveBySec: Int
        let leaveByText: String
        let rideMinutes: Int
        let arriveSec: Int
        let arriveText: String
        let verdict: Verdict
        let shape: [[Double]]

        var id: String { tripId }
        var coordinates: [CLLocationCoordinate2D] { shape.map { .init(latitude: $0[0], longitude: $0[1]) } }
    }
}

extension Journey.Walk {
    var coordinates: [CLLocationCoordinate2D] { polyline.map { .init(latitude: $0[0], longitude: $0[1]) } }
}

extension Journey.Place { var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) } }
extension Journey.Stop { var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) } }
extension Journey.Option.Vehicle { var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) } }
