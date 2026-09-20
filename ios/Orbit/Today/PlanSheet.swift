import SwiftUI

/// What "Plan my day" produced, and the laws it planned by.
///
/// The mode's promise and its rules used to sit on the home screen, where
/// they described a plan that did not exist yet. They belong here: this is
/// the moment the plan is made, so this is where it is fair to say what the
/// plan was made under.
///
/// The Day Agent can take up to twelve seconds. A spinner with the laws
/// already readable is a better twelve seconds than an empty sheet.
struct PlanSheet: View {

    let config: Today.ModeConfig?
    let plan: PlanResponse?
    let isWorking: Bool
    let accent: Color
    let onAccent: Color

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {

                if let cfg = config {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(cfg.promise)
                                .font(.headline)
                                .foregroundStyle(OrbitClassic.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 6)
                            Text(cfg.difficulty.uppercased())
                                .font(.system(size: 9, weight: .bold))
                                .tracking(0.8)
                                .foregroundStyle(onAccent)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(accent))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Self.laws(cfg), id: \.self) { law in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    Circle().fill(accent).frame(width: 5, height: 5)
                                    Text(law)
                                        .font(.footnote)
                                        .foregroundStyle(OrbitClassic.inkSoft)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(OrbitClassic.surface)
                    )
                }

                if isWorking {
                    HStack(spacing: 10) {
                        ProgressView().tint(accent)
                        Text("Planning your day…")
                            .font(.subheadline)
                            .foregroundStyle(OrbitClassic.inkSoft)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else if let plan {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(plan.narration)
                            .font(.subheadline)
                            .foregroundStyle(OrbitClassic.ink)
                            .fixedSize(horizontal: false, vertical: true)

                        Text("\(plan.proposals.count) proposal\(plan.proposals.count == 1 ? "" : "s") · via \(plan.provider)")
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(0.5)
                            .textCase(.uppercase)
                            .foregroundStyle(OrbitClassic.inkFaint)

                        if !plan.proposals.isEmpty {
                            Text("Approve or decline them under “Waiting on you”.")
                                .font(.footnote)
                                .foregroundStyle(OrbitClassic.inkSoft)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(18)
        }
        .background(OrbitClassic.ground.ignoresSafeArea())
    }

    /// Every line is a field on `modeConfig`, which is `src/core/modes.ts`
    /// serialised. If a law changes on the server it changes here; the phone
    /// never holds its own opinion about what a mode means.
    static func laws(_ cfg: Today.ModeConfig) -> [String] {
        var out: [String] = []

        switch cfg.questStrategy {
        case "one-per-gap": out.append("One quest in every real window")
        case "largest-gap-optional": out.append("One optional thing, in your biggest window")
        case "deadline-blocks": out.append("Deadlines place the work, not templates")
        default: out.append(cfg.questStrategy)
        }

        out.append("Windows count from \(cfg.minUsableGap) min")

        switch cfg.deadlineMode {
        case "quiet-line": out.append("Deadlines stay a quiet line")
        case "due-soon-card": out.append("Due soon gets a card")
        case "drive-day": out.append("Deadlines drive the day")
        default: out.append(cfg.deadlineMode)
        }

        switch cfg.feasibilityMode {
        case "always": out.append("Need against have, always on")
        case "suggest-on-shortfall": out.append("Need against have when you are short")
        default: out.append("No need-against-have meter")
        }

        switch cfg.leaveBy {
        case "first-only": out.append("Only the first leave-by")
        case "banner-all": out.append("Every leave-by, as a banner")
        case "top-bar-all": out.append("Every leave-by, pinned to the top")
        default: out.append(cfg.leaveBy)
        }

        if let rest = cfg.restBreakPerMin {
            out.append("A recovery break per \(rest) min of work")
        }
        return out
    }
}
