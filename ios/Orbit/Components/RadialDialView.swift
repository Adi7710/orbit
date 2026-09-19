import SwiftUI

/// The radiating tick dial.
///
/// Every tick in the arc is one `move`/`addLine` pair inside a **single**
/// `Path`, so the whole dial is one view and one stroke — not 56 rotated
/// rectangles. `animatableData` carries the sweep, which means SwiftUI
/// interpolates the fill position itself and the path is rebuilt on the
/// render thread rather than by a `withAnimation` re-running the body.
///
/// The value is a proportion the server already decided. Nothing here works
/// out what the number should be.
struct RadialDialView<Label: View>: View {
    /// 0...1.
    let progress: Double
    let tint: Color
    let tickCount: Int
    let lineWidth: CGFloat
    let tickLength: CGFloat
    let label: () -> Label

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var swept: Double = 0

    /// Written out rather than left to the memberwise initialiser. The
    /// memberwise one would work, but this view is generic, takes a trailing
    /// `@ViewBuilder` closure and has private state declared after it — three
    /// things that each have their own initialiser subtleties. An explicit
    /// init costs eight lines and removes the question.
    init(
        progress: Double,
        tint: Color = .orbitAccentInk,
        tickCount: Int = 56,
        lineWidth: CGFloat = 2.5,
        tickLength: CGFloat = 11,
        @ViewBuilder label: @escaping () -> Label
    ) {
        self.progress = progress
        self.tint = tint
        self.tickCount = tickCount
        self.lineWidth = lineWidth
        self.tickLength = tickLength
        self.label = label
    }

    /// An arc open at the bottom: starts low on the left, sweeps over the top.
    private let startAngle: Double = 160
    private let sweepAngle: Double = 220

    private var clamped: Double { min(max(progress, 0), 1) }

    var body: some View {
        ZStack {
            DialTicks(
                from: 0,
                to: 1,
                tickCount: tickCount,
                startAngle: startAngle,
                sweepAngle: sweepAngle,
                tickLength: tickLength
            )
            .stroke(Color.orbitInkFaint.opacity(0.35), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            DialTicks(
                from: 0,
                to: swept,
                tickCount: tickCount,
                startAngle: startAngle,
                sweepAngle: sweepAngle,
                tickLength: tickLength
            )
            .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            label()
        }
        .onAppear {
            // The dial fills itself on arrival, which is the one piece of
            // motion in the reference that is pure delight rather than
            // feedback. Under Reduce Motion it is simply already full.
            if reduceMotion {
                swept = clamped
            } else {
                withAnimation(OrbitMotion.sweepCurve.delay(0.12)) { swept = clamped }
            }
        }
        .onChange(of: clamped) { _, new in
            withAnimation(OrbitMotion.sweep(reduceMotion)) { swept = new }
        }
        .accessibilityElement(children: .combine)
    }
}

extension RadialDialView where Label == EmptyView {
    init(progress: Double, tint: Color = .orbitAccentInk, tickCount: Int = 56) {
        self.init(progress: progress, tint: tint, tickCount: tickCount, label: { EmptyView() })
    }
}

/// The ticks themselves. Split out as a `Shape` so the arc can animate without
/// the enclosing view rebuilding.
struct DialTicks: Shape {
    var from: Double
    var to: Double
    let tickCount: Int
    let startAngle: Double
    let sweepAngle: Double
    let tickLength: CGFloat

    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(from, to) }
        set {
            from = newValue.first
            to = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard tickCount > 1 else { return path }

        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let outer = min(rect.width, rect.height) / 2
        let inner = max(outer - tickLength, 1)
        let lo = min(from, to)
        let hi = max(from, to)

        for index in 0..<tickCount {
            let t = Double(index) / Double(tickCount - 1)
            guard t >= lo - 0.0001, t <= hi + 0.0001 else { continue }
            let radians = (startAngle + sweepAngle * t) * .pi / 180
            let dx = cos(radians)
            let dy = sin(radians)
            path.move(to: CGPoint(x: centre.x + inner * dx, y: centre.y + inner * dy))
            path.addLine(to: CGPoint(x: centre.x + outer * dx, y: centre.y + outer * dy))
        }
        return path
    }
}
