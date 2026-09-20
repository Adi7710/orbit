import SwiftUI
import MapKit
import CoreLocation

/// "If I stand up now, do I make it?" One map, one sheet, one verdict.
/// Polls /api/transit/journey every 15 s while visible. Nothing here computes
/// a time; the server already did.
@MainActor
@Observable
final class JourneyModel {
    var journey: Journey?
    var selected: Int = 0
    var error: String?
    var updatedAt: Date = .distantPast

    // Jersey City to Stevens. These were "Cathedral" and "15:30", which are a
    // building and a class in Pittsburgh. Babbio is where the three courses on
    // the Canvas feed meet; 14:30 is the last of them.
    var from = "Home"
    var to = "Babbio"
    var arriveBy = "14:30"

    private var task: Task<Void, Never>?

    var option: Journey.Option? {
        guard let j = journey, j.options.indices.contains(selected) else { return nil }
        return j.options[selected]
    }

    func start(origin: CLLocationCoordinate2D?) {
        stop()
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.load(origin: origin)
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    func stop() { task?.cancel(); task = nil }

    func load(origin: CLLocationCoordinate2D?) async {
        do {
            let j = try await OrbitAPI.shared.journey(from: from, to: to, arriveBy: to == "Home" ? nil : arriveBy, origin: origin)
            journey = j
            selected = min(selected, max(0, j.options.count - 1))
            updatedAt = .now
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct JourneyMapView: View {
    @State private var model = JourneyModel()
    // Opens at Home in Jersey City, wide enough to hold Hoboken. It was
    // 40.4426, -79.9497, which is Pittsburgh. fit() re-frames once a journey
    // arrives; this is only what the map shows before it has one.
    @State private var camera: MapCameraPosition = .region(.init(center: .init(latitude: 40.7196, longitude: -74.0430), span: .init(latitudeDelta: 0.06, longitudeDelta: 0.06)))
    @State private var locationManager = CLLocationManager()

    /// Sends the student back to Today. The tab bar owns the selection; this
    /// screen only asks. Nil when the map is shown on its own.
    var onHome: (() -> Void)?

    init(onHome: (() -> Void)? = nil) {
        self.onHome = onHome
    }

    /// Seeded with the one place that exists in every region so the pickers
    /// are never empty on the first frame, then replaced by the server's list.
    @State private var places: [String] = ["Home"]

    var body: some View {
        Map(position: $camera) {
            if let j = model.journey {
                // Walk legs, dashed.
                MapPolyline(coordinates: j.walkToStop.coordinates)
                    .stroke(.secondary, style: .init(lineWidth: 3, dash: [2, 7]))
                MapPolyline(coordinates: j.walkToDest.coordinates)
                    .stroke(.secondary, style: .init(lineWidth: 3, dash: [2, 7]))

                // The ride, from the bus to where you get off.
                if let o = model.option {
                    MapPolyline(coordinates: o.coordinates)
                        .stroke(routeColor(o.route, j).opacity(0.35), style: .init(lineWidth: 8, lineCap: .round))
                    MapPolyline(coordinates: o.coordinates)
                        .stroke(routeColor(o.route, j), style: .init(lineWidth: 4, lineCap: .round))
                }

                Annotation("You", coordinate: j.origin.coordinate) {
                    Circle().fill(.blue).frame(width: 16, height: 16)
                        .overlay(Circle().stroke(.white, lineWidth: 3))
                        .shadow(radius: 3)
                }
                Annotation(j.boardStop.name, coordinate: j.boardStop.coordinate) { stopDot("B") }
                Annotation(j.alightStop.name, coordinate: j.alightStop.coordinate) { stopDot("A") }
                Annotation(j.destination.label, coordinate: j.destination.coordinate) {
                    HStack(spacing: 4) {
                        Image(systemName: "graduationcap.fill")
                        if let t = j.destination.arriveByText { Text(t).font(.caption2.bold()) }
                    }
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(.black, in: Capsule()).foregroundStyle(.white).shadow(radius: 3)
                }

                if let v = model.option?.vehicle, let o = model.option {
                    Annotation("\(o.route)", coordinate: v.coordinate) {
                        HStack(spacing: 5) {
                            Image(systemName: "arrowtriangle.up.fill")
                                .font(.system(size: 9))
                                .rotationEffect(.degrees(v.bearing ?? 0))
                            Text(o.route).font(.caption.bold())
                        }
                        .padding(.horizontal, 9).padding(.vertical, 5)
                        .background(routeColor(o.route, j), in: Capsule())
                        .overlay(Capsule().stroke(.white, lineWidth: 2))
                        .foregroundStyle(.black)
                        .shadow(radius: 4)
                        // Smooth glide between 15 s refreshes instead of a jump.
                        .animation(.easeInOut(duration: 1.2), value: v.lat)
                    }
                }
            }
            UserAnnotation()
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .mapControls { MapUserLocationButton(); MapCompass() }
        .safeAreaInset(edge: .top) { header }
        .sheet(isPresented: .constant(true)) {
            sheet
                .presentationDetents([.height(120), .medium, .large])
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                .interactiveDismissDisabled()
        }
        .task {
            locationManager.requestWhenInUseAuthorization()
            model.start(origin: nil)
        }
        .onDisappear { model.stop() }
        .onChange(of: model.journey?.options.first?.tripId) { fit() }
        .onChange(of: model.selected) { fit() }
    }

    // MARK: - Pieces

    /// A way back, the two places, and whether the times are live. The pickers
    /// sit centred as a pair -- from, arrow, to -- each in its own capsule with
    /// an eyebrow above, so the question the map answers reads as one phrase.
    private var header: some View {
        VStack(spacing: 10) {
            HStack {
                if let onHome {
                    Button(action: onHome) {
                        Label("Today", systemImage: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.orbitAccentInk)
                    .accessibilityLabel("Back to Today")
                }
                Spacer()
                if let j = model.journey {
                    Text(j.clock.simulated ? "demo \(j.clock.text)" : j.realtime.tripsOk ? "live" : "timetable")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }

            HStack(spacing: 10) {
                placePicker("From", selection: $model.from)
                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.orbitInkFaint)
                    .padding(.top, 14)
                placePicker("To", selection: $model.to)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.regularMaterial)
        .task {
            if let loaded = try? await OrbitAPI.shared.places(), !loaded.isEmpty {
                places = loaded.map(\.label)
            }
        }
        .onChange(of: model.from) { Task { await model.load(origin: nil) } }
        .onChange(of: model.to) { Task { await model.load(origin: nil) } }
    }

    private func placePicker(_ label: String, selection: Binding<String>) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)
            Picker(label, selection: selection) { ForEach(places, id: \.self, content: Text.init) }
                .labelsHidden()
                .pickerStyle(.menu)
                .tint(Color.orbitInk)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(Color.orbitSurface))
                .overlay(Capsule().strokeBorder(Color.orbitHairline, lineWidth: 1))
        }
    }

    private var sheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let e = model.error { Text(e).font(.footnote).foregroundStyle(.red) }
                if let j = model.journey, let o = model.option {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(leaveIn(o, j) <= 0 ? "Leave now" : "Leave in \(leaveIn(o, j)) min")
                                .font(.title2.weight(.semibold))
                            Text(o.leaveByText).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Label(verdictText(o, j), systemImage: o.verdict.makesIt ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(verdictColor(o), in: Capsule())
                            .foregroundStyle(.white)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        row("figure.walk", "\(j.walkToStop.minutes) min", "walk to \(j.boardStop.name.lowercased())")
                        row("bus.fill", o.departsText, busLine(o))
                        row("chair.lounge.fill", "\(o.rideMinutes) min", "ride to \(j.alightStop.name.lowercased())")
                        row("figure.walk", "\(j.walkToDest.minutes) min", "walk to \(j.destination.label)")
                        row("graduationcap.fill", o.arriveText, j.destination.arriveByText.map { "arrive · class at \($0)" } ?? "arrive")
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(j.options.enumerated()), id: \.element.id) { i, opt in
                                Button { model.selected = i } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(opt.route) · \(opt.departsText)").font(.caption.bold())
                                        Text("leave \(opt.leaveByText) · arrive \(opt.arriveText)").font(.caption2)
                                    }
                                    .padding(10)
                                    .frame(minWidth: 150, alignment: .leading)
                                    .background(i == model.selected ? Color.primary : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                                    .foregroundStyle(i == model.selected ? Color(.systemBackground) : .primary)
                                    .strikethrough(opt.status == "ghost")
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                } else if model.error == nil {
                    Text("Reading the timetable…").foregroundStyle(.secondary)
                }
            }
            .padding()
        }
    }

    private func row(_ icon: String, _ lead: String, _ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).frame(width: 22).foregroundStyle(.secondary)
            Text(lead).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 62, alignment: .leading)
            Text(text).font(.subheadline)
            Spacer(minLength: 0)
        }
    }

    private func busLine(_ o: Journey.Option) -> String {
        var s = "\(o.route) \(o.headsign.lowercased())"
        switch o.status {
        case "live":
            if let d = o.delaySec, abs(d) > 59 { s += " · live, \(abs(d / 60)) min \(d > 0 ? "late" : "early")" } else { s += " · live" }
        case "ghost": s += " · not on the live feed"
        default: s += " · scheduled"
        }
        if let v = o.vehicle { s += (v.simulated == true ? " · scheduled position " : " · bus ") + "\(String(format: "%.1f", Double(v.metersToStop) / 1000)) km away" }
        return s
    }

    private func leaveIn(_ o: Journey.Option, _ j: Journey) -> Int { Int((Double(o.leaveBySec - j.clock.sec) / 60).rounded()) }
    private func verdictText(_ o: Journey.Option, _ j: Journey) -> String {
        guard j.destination.arriveByText != nil else { return o.verdict.makesIt ? "on your way" : "tight" }
        return o.verdict.makesIt ? "you make it, \(o.verdict.marginMin) min to spare" : "you miss it by \(abs(o.verdict.marginMin)) min"
    }
    private func verdictColor(_ o: Journey.Option) -> Color {
        if !o.verdict.makesIt { return .red }
        return o.verdict.marginMin < 5 ? .orange : .green
    }
    private func routeColor(_ route: String, _ j: Journey) -> Color {
        guard let hex = j.routeColors[route] ?? nil, let v = Int(hex, radix: 16) else { return .blue }
        return Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }

    private func stopDot(_ letter: String) -> some View {
        Text(letter).font(.caption2.bold())
            .frame(width: 22, height: 22)
            .background(.white, in: Circle())
            .overlay(Circle().stroke(.black, lineWidth: 3))
            .foregroundStyle(.black)
    }

    /// Fit you, the bus and the alight stop with padding.
    private func fit() {
        guard let j = model.journey else { return }
        var pts = [j.origin.coordinate, j.boardStop.coordinate, j.alightStop.coordinate, j.destination.coordinate]
        if let v = model.option?.vehicle { pts.append(v.coordinate) }
        let lats = pts.map(\.latitude), lons = pts.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lons.min()! + lons.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(0.006, (lats.max()! - lats.min()!) * 1.5),
                                    longitudeDelta: max(0.006, (lons.max()! - lons.min()!) * 1.5))
        withAnimation(.easeInOut) { camera = .region(.init(center: center, span: span)) }
    }
}

#Preview { JourneyMapView() }
