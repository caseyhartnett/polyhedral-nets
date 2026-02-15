# Product Entry and Onboarding Plan (Non-Technical Users)

## Decision

Use a **hybrid approach**:

1. A lightweight landing page before the app
2. A guided first-run onboarding flow inside the app
3. Contextual help embedded in the UI (not a separate heavy docs site)

This is the best fit for a browser CAD tool used by non-technical people because it explains value before complexity, then teaches only what is needed in context.

## Why this approach

1. Jumping straight into the UI can create anxiety and drop-off for first-time users.
2. A full documentation-first flow adds too much reading before hands-on success.
3. Non-technical users convert best when they get:
   - clear promise up front,
   - a fast first win,
   - small, contextual explanations while using the tool.

## Target user assumptions

1. User is making physical pottery/paper/ceramic forms and is not CAD-native.
2. User wants printable/exportable outputs quickly (SVG/PDF/STL) without learning geometry terms first.
3. User needs confidence that settings are safe and mistakes are reversible.

## Experience blueprint

### 1) Landing page (pre-app)

Goal: Explain what the tool does in under 30 seconds.

Must include:

1. Simple headline focused on outcome, not technology.
2. Short "How it works" in 3 steps:
   - choose a form,
   - tune dimensions,
   - download template.
3. Visual proof:
   - one animated 3D preview,
   - one net/template preview,
   - one photo/mock of real-world result if available.
4. Primary CTA: `Start with a sample project`
5. Secondary CTA: `Open blank workspace`
6. Reassurance block:
   - no install,
   - runs in browser,
   - instant exports.

### 2) First-run in-app onboarding

Goal: Get user to first successful export in under 5 minutes.

Flow:

1. Welcome modal with two choices:
   - `Guided setup (recommended)`
   - `Skip to editor`
2. Guided setup wizard:
   - choose shape family,
   - choose material/purpose preset,
   - auto-fill safe defaults,
   - preview and export.
3. One-click sample load (pre-filled valid model).
4. Inline success confirmation after export with next step suggestions.

### 3) Contextual help in app

Goal: Remove confusion at the exact decision point.

Implement:

1. Tooltips for advanced terms (seam, allowance, segments).
2. "Why am I seeing this warning?" links near validation messages.
3. Right-side Help panel with:
   - short glossary,
   - common recipes (for common form types),
   - troubleshooting checklist.
4. Empty-state coaching text for first use.

## Content and copy rules

1. Use plain language (grade 6-8 reading level).
2. Prefer outcome phrasing:
   - "Make a printable template"
   - not "Generate unfolded polygonal geometry"
3. Keep one concept per sentence.
4. Use concrete units and examples.
5. Always provide a recommended default for each advanced control.

## Implementation phases

### Phase 1: Pre-release essentials (must-have)

1. Publish minimal landing page with value proposition, examples, and two CTAs.
2. Add first-run modal + guided sample flow.
3. Add contextual tooltips for top 10 confusing terms.
4. Add export success state with next action hints.

### Phase 2: Early public feedback (should-have)

1. Add onboarding progress indicator.
2. Add role-based quick starts (teacher, hobbyist, studio production).
3. Add searchable in-app Help panel.
4. Add "reset to safe defaults" action.

### Phase 3: Optimization (nice-to-have)

1. Add short walkthrough video on landing page.
2. Add interactive "tour mode" overlays for complex controls.
3. Localize key onboarding copy if international adoption grows.

## Feedback loop (lightweight)

Keep this manual for now:

1. Add a short feedback prompt in-app after successful export.
2. Track issues from direct user messages and support notes.
3. Review the top confusion points each release and update tooltips/help content.

## Risks and mitigations

1. Risk: Landing page adds friction.
   Mitigation: Keep direct deep link to app and measure conversion delta.
2. Risk: Over-guidance annoys experienced users.
   Mitigation: Make onboarding skippable and remember preference.
3. Risk: Help content drifts from product behavior.
   Mitigation: Store help content with app code and review in release checklist.

## Definition of done

1. New user can understand value proposition in <30 seconds.
2. New user can complete first successful export in <5 minutes without external support.
3. Top confusion points are explained inline where they occur.
4. User feedback is collected and applied to onboarding copy and defaults.
