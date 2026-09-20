import SwiftUI

/// One notice at a time, at the top of Today, every twenty seconds.
///
/// The lines come from `GET /api/pulse`, so the phone and the web say the
/// same thing in the same order; this view only paces and shows them. A tap
/// hides the current one; the next still arrives.
struct PulseBanner: View {

    struct Notice: Decodable, Identifiable, Equatable {
        let id: String
        let kind: String
        let text: String
    }

    @State private var notices: [Notice] = []
    @State private var index = 0
    @State private var hidden = false
    @State private var every: Double = 20

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let n = notices.indices.contains(index) ? notices[index] : nil, !hidden {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: icon(n.kind))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.orbitAccentInk)
                        .frame(width: 20)
                    Text(n.text)
                        .font(.system(size: 14))
                        .foregroundStyle(OrbitClassic.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(OrbitClassic.surface)
                        .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                )
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .onTapGesture { hidden = true }
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .id(n.id)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: index)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: hidden)
        .task {
            await load()
            guard !notices.isEmpty else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(every))
                index = (index + 1) % max(1, notices.count)
                hidden = false
            }
        }
    }

    private func icon(_ kind: String) -> String {
        switch kind {
        case "crew": return "person.2"
        case "body": return "figure.strengthtraining.traditional"
        case "bus": return "tram"
        case "quest": return "star"
        case "life": return "basket"
        case "streak": return "flame"
        case "learn": return "book"
        default: return "circle"
        }
    }

    private func load() async {
        struct Payload: Decodable { let notices: [Notice]; let everySeconds: Double? }
        var req = URLRequest(url: OrbitAPI.shared.base.appendingPathComponent("api/pulse"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 10
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let p = try? JSONDecoder().decode(Payload.self, from: data) else { return }
        notices = p.notices
        every = p.everySeconds ?? 20
    }
}
