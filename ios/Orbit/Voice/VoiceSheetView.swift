import SwiftUI

/// Talking to Orbit.
///
/// Deliberately a short sheet rather than a screen. `docs/voice.md` is blunt
/// about it — "voice with no visible effect is just a chatbot" — so the day has
/// to stay on screen behind this. Say "I'm in crisis mode" and the cards above
/// fade while the agent is still saying the word "crisis". A full-screen voice
/// UI would hide the only proof that anything happened.
///
/// The opening is the briefing, never "how can I help you today". It is on
/// screen before the call connects, and if voice is off it is the whole
/// feature: the same sentence, readable, and the phone will read it out.
struct VoiceSheetView: View {
    @Bindable var session: VoiceSession
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Color.orbitHairline)
            body_
            footer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.orbitBackground)
        // The sheet and the page are the same ground, which on the near-black
        // dark theme leaves no seam at all — the transcript reads as floating
        // over Today. One hairline is the whole fix, and it is the same edge
        // every card on this screen already has.
        .overlay(alignment: .top) {
            Rectangle().fill(Color.orbitHairline).frame(height: 1)
        }
        // Short on purpose. At this height the ledger, the struck-through
        // calendar figure and the mode chips are all still on screen above,
        // which is where "I'm in crisis mode" has to be seen to land. Drag it
        // up to read a long transcript; drag Today itself to watch a card.
        .presentationDetents([.height(420), .large])
        .presentationDragIndicator(.visible)
        .presentationBackgroundInteraction(.enabled(upThrough: .height(420)))
        .presentationBackground(Color.orbitBackground)
        .presentationCornerRadius(OrbitMetric.cardRadius)
        .task { await session.prepare() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 3) {
                Text(statusLabel)
                    .orbitEyebrow()
                    .foregroundStyle(statusTint)
                Text("Orbit")
                    .font(.orbitTitle)
                    .orbitTightDisplay()
                    .foregroundStyle(Color.orbitInk)
            }
            Spacer(minLength: 8)

            if session.phase.isLive || session.phase == .connecting {
                Button {
                    Task { await session.hangUp() }
                } label: {
                    Text("End")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitUrgent)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(Capsule().strokeBorder(Color.orbitUrgent.opacity(0.4), lineWidth: 1))
                }
                .buttonStyle(.orbitTile)
            } else {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.orbitInkFaint)
                        .padding(9)
                        .background(Circle().fill(Color.orbitSurfaceInset))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .animation(OrbitMotion.snap(reduceMotion), value: session.phase)
    }

    /// Underscored because `body` is taken. The transcript once there is one,
    /// the briefing until then.
    @ViewBuilder
    private var body_: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let note = session.note {
                        Text(note)
                            .orbitEyebrow()
                            .foregroundStyle(Color.orbitUrgent)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if session.lines.isEmpty {
                        briefingBlock
                    } else {
                        ForEach(Array(session.lines.enumerated()), id: \.element.id) { pair in
                            transcriptLine(pair.element).id(pair.element.id)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: session.lines.last?.id) { _, id in
                guard let id else { return }
                withAnimation(OrbitMotion.snap(reduceMotion)) { proxy.scrollTo(id, anchor: .bottom) }
            }
        }
    }

    private var briefingBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            if session.briefing.isEmpty {
                Text("Reading your day…")
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInkFaint)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    Capsule()
                        .fill(Color.orbitHairline)
                        .frame(width: 2)
                    // Composed by the server from the real ledger. Printed
                    // verbatim — this is the sentence the agent would speak.
                    Text(session.briefing)
                        .font(.orbitBody)
                        .foregroundStyle(Color.orbitInkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// The phone reading the briefing out. Not a substitute for the agent — it
    /// answers nothing — but it is the one thing voice was for that survives
    /// with no keys, no signal and no minutes left, and it is the reason the
    /// "voice is off" state still has something to press.
    private var readAloudButton: some View {
        Button {
            session.toggleReadBriefing()
        } label: {
            HStack(spacing: 7) {
                Image(systemName: session.isReading ? "stop.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 11, weight: .semibold))
                Text(session.isReading ? "Stop" : "Read it to me")
            }
            .orbitEyebrow()
            .foregroundStyle(Color.orbitInk)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(Capsule().fill(Color.orbitSurface))
            .overlay(Capsule().strokeBorder(Color.orbitHairline, lineWidth: 1))
        }
        .buttonStyle(.orbitTile)
        .disabled(session.briefing.isEmpty)
    }

    private func transcriptLine(_ line: VoiceSession.Line) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(line.role == .you ? "You" : "Orbit")
                .orbitEyebrow()
                .foregroundStyle(Color.orbitInkFaint)
            Text(line.text)
                .font(.orbitBody)
                .foregroundStyle(line.role == .you ? Color.orbitInkSoft : Color.orbitInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .bottom)))
    }

    // MARK: - Footer: the button, and what it is doing

    private var footer: some View {
        VStack(spacing: 10) {
            // With no token there is nothing to hold, so there is no orb to
            // hold it. A large dead circle reads as a button that ignores you.
            if case .unavailable = session.phase {
                readAloudButton.padding(.vertical, 12)
            } else {
                orb
            }
            Text(caption)
                .font(.orbitBody)
                .foregroundStyle(Color.orbitInkFaint)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: 38, alignment: .top)

            if session.phase.isLive {
                Toggle(isOn: $session.handsFree) {
                    Text("Hands-free")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkFaint)
                }
                .toggleStyle(.switch)
                .tint(Color.orbitInkSoft)
                .fixedSize()
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 22)
        .animation(OrbitMotion.snap(reduceMotion), value: session.phase)
    }

    @ViewBuilder
    private var orb: some View {
        switch session.phase {
        case .unavailable:
            EmptyView()
        case .idle:
            Button {
                Task { await session.connect() }
            } label: {
                VoiceOrbView(isOpen: false, turn: .listening, level: 0)
            }
            .buttonStyle(.orbitTile)
        case .connecting:
            VoiceOrbView(isOpen: false, turn: .thinking, level: 0)
        case .live:
            VoiceOrbView(isOpen: session.micOpen, turn: session.turn, level: session.level)
                // Hold, not tap, and `pressing` rather than a `DragGesture`:
                // it reports false on cancel as well as on lift, which is the
                // case that matters. A notification or the control centre swipe
                // takes the touch away without ever ending a drag, and a mic
                // that stays open because iOS stole the finger is the exact
                // always-listening behaviour push-to-talk exists to remove.
                // The generous distance stops a thumb drifting mid-sentence
                // from hanging up on you.
                .onLongPressGesture(minimumDuration: .infinity, maximumDistance: 800) {
                    // Never fires: the press cannot outlast an infinite minimum.
                } onPressingChanged: { isPressing in
                    guard !session.handsFree else { return }
                    session.setMic(open: isPressing)
                }
                .sensoryFeedback(.impact(weight: .medium), trigger: session.micOpen)
        }
    }

    // MARK: - Words

    private var statusLabel: String {
        switch session.phase {
        case .idle: return "Push to talk"
        case .connecting: return "Connecting"
        case .unavailable: return "Voice is off"
        case .live:
            if session.micOpen { return "Listening" }
            switch session.turn {
            case .speaking: return "Orbit is speaking"
            case .thinking: return "Looking it up"
            case .listening: return "Your turn"
            }
        }
    }

    private var statusTint: Color {
        switch session.phase {
        case .unavailable: return .orbitUrgent
        case .live: return session.micOpen ? .orbitAccentInk : .orbitInkFaint
        default: return .orbitInkFaint
        }
    }

    private var caption: String {
        switch session.phase {
        case .idle:
            return "Tap to start. The mic stays shut between turns."
        case .connecting:
            return "Waking Orbit up."
        case .unavailable(let reason):
            return "\(reason). The briefing above is the same text it would read."
        case .live:
            if session.handsFree {
                return "Open mic. It hears everything in the room, including the next table."
            }
            return session.micOpen
                ? "Release to send."
                : "Hold to talk. Hold while it is speaking to cut in."
        }
    }
}
