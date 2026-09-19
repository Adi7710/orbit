import SwiftUI

/// Where a tile goes when you tap it.
///
/// Not a sheet. It shares a `Namespace` with the deck, so the tile that was
/// tapped grows into this: same rounded rect, same title, one continuous
/// movement. A sheet would slide a second, unrelated surface over the top and
/// lose the thread between the two.
///
/// The panel is an opaque surface rather than a material. The reference's
/// detail screens are flat paper, and an opaque fill also means the scrim
/// behind it is the only thing being composited over the list.
struct ClassDetailView: View {
    let block: Today.DayBlock
    let namespace: Namespace.ID
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isLive: Bool { block.status == .now }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // Its own layer, so dismissing does not animate the panel and the
            // background as one group.
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel("Close")

            VStack(alignment: .leading, spacing: 22) {
                head
                if isLive, let progress = block.progress { liveDial(progress) }
                detailRows
                Spacer(minLength: 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                    .fill(Color.orbitSurface)
                    .overlay(
                        RoundedRectangle(cornerRadius: OrbitMetric.cardRadius, style: .continuous)
                            .strokeBorder(Color.orbitHairline, lineWidth: 1)
                    )
                    .matchedGeometryEffect(id: "card-\(block.id)", in: namespace)
            }
            .padding(.horizontal, 16)
            .padding(.top, 84)
        }
        .transition(reduceMotion ? .opacity : .identity)
    }

    private var head: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                if let code = block.courseCode {
                    Text(code)
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitAccentInk)
                }
                Text(block.title)
                    .font(.orbitDisplay)
                    .orbitTightDisplay()
                    .foregroundStyle(Color.orbitInk)
                    .matchedGeometryEffect(id: "title-\(block.id)", in: namespace)
            }
            Spacer(minLength: 0)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.orbitInkSoft)
                    .padding(11)
                    .background(Circle().fill(Color.orbitSurfaceInset))
            }
            .buttonStyle(.orbitTile)
            .accessibilityLabel("Close")
        }
    }

    private func liveDial(_ progress: Double) -> some View {
        HStack(spacing: 18) {
            RadialDialView(progress: progress, tint: .orbitAccentInk, tickCount: 40) {
                VStack(spacing: 1) {
                    Text("\(block.remainingMinutes ?? 0)")
                        .font(.orbitNumeric)
                        .foregroundStyle(Color.orbitInk)
                    Text("min left")
                        .orbitEyebrow()
                        .foregroundStyle(Color.orbitInkFaint)
                }
            }
            .frame(width: 112, height: 112)

            VStack(alignment: .leading, spacing: 8) {
                GradientTagView(text: "In progress", tint: .orbitAccent, filled: true)
                    .orbitBloom(.orbitAccent, radius: 12)
                Text("Started \(block.startText), ends \(block.endText)")
                    .font(.orbitBody)
                    .monospacedDigit()
                    .foregroundStyle(Color.orbitInkSoft)
            }
            Spacer(minLength: 0)
        }
    }

    private var detailRows: some View {
        VStack(alignment: .leading, spacing: 14) {
            row("clock", "\(block.startText) to \(block.endText)", "\(block.minutes) minutes")
            if let place = block.place {
                row("mappin.and.ellipse", place, "where you need to be")
            }
            row("square.grid.2x2", block.kind.capitalized, "on your calendar")
        }
    }

    private func row(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(Color.orbitSurfaceInset)
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.orbitInkSoft)
            }
            .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.orbitBody)
                    .foregroundStyle(Color.orbitInk)
                Text(subtitle)
                    .orbitEyebrow()
                    .foregroundStyle(Color.orbitInkFaint)
            }
            Spacer(minLength: 0)
        }
    }
}
