import SwiftUI

/// Who is free when you are, one card at a time.
///
/// A rail of chips made five friends into five glances and no detail. This is
/// a wallet: the friend on top is read in full, the rest are stacked beneath
/// with their names showing, and dragging the top card up deals the next one
/// forward. One person at a time is the right unit — you are deciding who to
/// message, not scanning a table.
struct FriendsWalletView: View {

    let windows: [Today.SharedWindow]
    let accent: Color

    @State private var front = 0
    @State private var drag: CGFloat = 0
    /// Who is in which crew. The server assigns it; this is a join, not a
    /// decision — see `GET /api/leaderboard`, which carries `group` per row.
    @State private var crew: Crew?
    @State private var filter = FriendsWalletView.everyone
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// One card per person, each carrying the windows they are in. The server
    /// sends windows with the names in them; a person is the unit here, so
    /// the names are turned inside out. Order is first-appearance, so the
    /// stack is stable between refreshes.
    static let everyone = "Everyone"

    private struct Friend: Identifiable {
        let id: String
        let name: String
        let group: String?
        let windows: [Today.SharedWindow]
    }

    /// Every person in today's shared windows, keyed by user id where the
    /// server sends one and by name on an older payload.
    private var allFriends: [Friend] {
        var order: [String] = []
        var name: [String: String] = [:]
        var byKey: [String: [Today.SharedWindow]] = [:]
        for w in windows {
            for (i, person) in w.names.enumerated() {
                let key = w.userIds?.indices.contains(i) == true ? w.userIds![i] : person
                if byKey[key] == nil { order.append(key); name[key] = person }
                byKey[key, default: []].append(w)
            }
        }
        return order.map {
            Friend(id: $0, name: name[$0] ?? $0, group: group(of: $0), windows: byKey[$0] ?? [])
        }
    }

    private var friends: [Friend] {
        filter == Self.everyone ? allFriends : allFriends.filter { $0.group == filter }
    }

    private func group(of userId: String) -> String? {
        crew?.rows.first { $0.userId == userId }?.group
    }

    /// Everyone, then whichever crews the server says exist.
    private var filters: [String] {
        var out = [Self.everyone]
        let fromRows = allFriends.compactMap(\.group)
        for g in (crew?.groups ?? []) where fromRows.contains(g) { out.append(g) }
        return out
    }

    var body: some View {
        if allFriends.isEmpty {
            Text("Nobody is free with you today.")
                .font(.subheadline)
                .foregroundStyle(OrbitClassic.inkSoft)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(OrbitClassic.ground.ignoresSafeArea())
        } else {
            VStack(spacing: 0) {
                if filters.count > 1 {
                    Picker("", selection: $filter) {
                        ForEach(filters, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .onChange(of: filter) { _, _ in front = 0 }
                }
                if friends.isEmpty {
                    Text("Nobody from \(filter) is free with you today.")
                        .font(.subheadline)
                        .foregroundStyle(OrbitClassic.inkSoft)
                        .padding(.top, 44)
                } else {
                    stack
                }
                Spacer(minLength: 0)
                if friends.count > 1 {
                    Text("Swipe a card up for the next one · \(front + 1) of \(friends.count)")
                        .font(.footnote)
                        .foregroundStyle(OrbitClassic.inkFaint)
                        .padding(.bottom, 18)
                }
            }
            .frame(maxWidth: .infinity)
            .background(OrbitClassic.ground.ignoresSafeArea())
            .task { crew = try? await OrbitAPI.shared.crew(group: nil) }
        }
    }

    private var stack: some View {
        ZStack(alignment: .top) {
            ForEach(Array(friends.enumerated()), id: \.element.id) { index, friend in
                let depth = position(of: index)
                if depth <= 3 {
                    card(friend, isFront: depth == 0)
                        // Each card behind sits a little lower and a little
                        // narrower, so the one on top is unmistakably the one
                        // being read.
                        .scaleEffect(1 - CGFloat(depth) * 0.04, anchor: .top)
                        .offset(y: CGFloat(depth) * 26 + (depth == 0 ? min(0, drag) : 0))
                        .opacity(depth == 0 ? 1 : 0.9)
                        .zIndex(Double(friends.count - depth))
                        .gesture(depth == 0 ? dragGesture : nil)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .animation(reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.82), value: front)
    }

    /// How many cards back this one is from the front, wrapping round.
    private func position(of index: Int) -> Int {
        let n = friends.count
        return (index - front + n) % n
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { drag = $0.translation.height }
            .onEnded { value in
                if value.translation.height < -60, friends.count > 1 {
                    front = (front + 1) % friends.count
                }
                drag = 0
            }
    }

    private func card(_ friend: Friend, isFront: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text(String(friend.name.prefix(1)).uppercased())
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(accent))
                VStack(alignment: .leading, spacing: 1) {
                    Text(friend.name)
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(OrbitClassic.ink)
                    if let g = friend.group {
                        Text(g.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.9)
                            .foregroundStyle(OrbitClassic.inkFaint)
                    }
                }
                Spacer(minLength: 0)
            }

            if isFront {
                Divider()
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(friend.windows.enumerated()), id: \.offset) { _, w in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(w.startText)–\(w.endText)")
                                .font(.system(.subheadline, design: .monospaced))
                                .foregroundStyle(OrbitClassic.ink)
                            Spacer(minLength: 8)
                            Text("\(w.minutes) min")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(accent.opacity(0.14)))
                        }
                        if w.names.count > 1 {
                            Text("with " + w.names.filter { $0 != friend.name }.joined(separator: ", "))
                                .font(.footnote)
                                .foregroundStyle(OrbitClassic.inkFaint)
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(OrbitClassic.surface)
                .shadow(color: .black.opacity(0.10), radius: 10, y: 4)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(OrbitClassic.hairline, lineWidth: 1)
        )
    }
}
