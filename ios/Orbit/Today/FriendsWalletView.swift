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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// One card per person, each carrying the windows they are in. The server
    /// sends windows with the names in them; a person is the unit here, so
    /// the names are turned inside out. Order is first-appearance, so the
    /// stack is stable between refreshes.
    private struct Friend: Identifiable {
        let name: String
        let windows: [Today.SharedWindow]
        var id: String { name }
    }

    private var friends: [Friend] {
        var order: [String] = []
        var byName: [String: [Today.SharedWindow]] = [:]
        for w in windows {
            for name in w.names {
                if byName[name] == nil { order.append(name) }
                byName[name, default: []].append(w)
            }
        }
        return order.map { Friend(name: $0, windows: byName[$0] ?? []) }
    }

    var body: some View {
        if friends.isEmpty {
            Text("Nobody is free with you today.")
                .font(.subheadline)
                .foregroundStyle(OrbitClassic.inkSoft)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(OrbitClassic.ground.ignoresSafeArea())
        } else {
            VStack(spacing: 0) {
                stack
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
                Text(friend.name)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundStyle(OrbitClassic.ink)
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
