import SwiftUI

/// Where a card goes when you tap it.
///
/// This is not a sheet. It shares a `Namespace` with the deck, so the card that
/// was tapped grows into this view: same rounded rect, same title, one
/// continuous movement. A sheet would slide a second, unrelated surface over
/// the top and lose the thread between the two.
struct ClassDetailView: View {
    let block: Today.DayBlock
    let namespace: Namespace.ID
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tint: Color {
        switch block.status {
        case .now:   return .orbitLive
        case .next:  return .orbitAccent
        case .done:  return .orbitInkFaint
        case .later: return .orbitInkSoft
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // The scrim is its own layer so dismissing does not animate the
            // card and the background as one group.
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel("Close")

            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let code = block.courseCode {
                            Text(code)
                                .font(.orbitCaption)
                                .foregroundStyle(tint)
                        }
                        Text(block.title)
                            .font(.orbitDisplay)
                            .foregroundStyle(Color.orbitInk)
                            .matchedGeometryEffect(id: "title-\(block.id)", in: namespace)
                    }
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Color.orbitInkSoft)
                            .padding(10)
                            .background(Circle().fill(Color.orbitHairline))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close")
                }

                if block.status == .now, let progress = block.progress {
                    HStack(spacing: 16) {
                        CircularProgressRing(progress: progress, tint: tint, lineWidth: 8) {
                            VStack(spacing: 0) {
                                Text("\(block.remainingMinutes ?? 0)")
                                    .font(.orbitNumeric)
                                    .foregroundStyle(Color.orbitInk)
                                Text("min left")
                                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                                    .foregroundStyle(Color.orbitInkFaint)
                            }
                        }
                        .frame(width: 92, height: 92)

                        VStack(alignment: .leading, spacing: 6) {
                            GradientTagView(text: "In Progress", tint: tint, systemImage: "dot.radiowaves.left.and.right", filled: true)
                            Text("Started \(block.startText), ends \(block.endText)")
                                .font(.orbitBody)
                                .monospacedDigit()
                                .foregroundStyle(Color.orbitInkSoft)
                        }
                        Spacer(minLength: 0)
                    }
                }

                detailRows

                Spacer(minLength: 0)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                let shape = RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                ZStack {
                    shape.fill(.ultraThinMaterial)
                    shape.fill(tint.opacity(0.08))
                    shape.strokeBorder(LinearGradient.orbitEdge, lineWidth: 1)
                }
                .matchedGeometryEffect(id: "card-\(block.id)", in: namespace)
            }
            .padding(.horizontal, 18)
            .padding(.top, 90)
        }
        .transition(reduceMotion ? .opacity : .identity)
    }

    private var detailRows: some View {
        VStack(alignment: .leading, spacing: 10) {
            row("clock", "\(block.startText) to \(block.endText)", "\(block.minutes) minutes")
            if let place = block.place {
                row("mappin.and.ellipse", place, "where you need to be")
            }
            row("square.grid.2x2", block.kind.capitalized, "on your calendar")
        }
    }

    private func row(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInk)
                Text(subtitle)
                    .font(.orbitCaption)
                    .foregroundStyle(Color.orbitInkFaint)
            }
            Spacer(minLength: 0)
        }
    }
}
