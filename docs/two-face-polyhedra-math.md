# Two-Face Polyhedra: Math and Integration Notes

## Problem statement

Given two polygon face types, can we determine whether they can form a closed 3D object?

For polyhedra in this project, the practical target is usually:

- closed surface
- genus `g = 0` (sphere-like, no holes)
- convex
- equal edge length
- regular polygon faces

That is stricter than "any mesh with those face sizes."

## 1. Local feasibility at a vertex (angle deficit)

For a regular `n`-gon, interior angle is:

`alpha_n = pi * (1 - 2/n)`

If `a` faces of type `p` and `b` faces of type `q` meet at each vertex, convexity requires:

`a * alpha_p + b * alpha_q < 2*pi`

Equivalent positive angle deficit:

`delta = 2*pi - (a*alpha_p + b*alpha_q) > 0`

If sum is:

- `< 2*pi`: locally convex candidate
- `= 2*pi`: planar tiling, not a convex polyhedron
- `> 2*pi`: impossible for convex closure

## 2. Global counting constraints (Euler + incidence)

Let:

- `F_p` = number of `p`-gon faces
- `F_q` = number of `q`-gon faces
- `E` = edges
- `V` = vertices
- `r = a + b` = vertex valence (same vertex pattern assumed)

Incidence relations:

- `p * F_p + q * F_q = 2E`
- `a * V = p * F_p`
- `b * V = q * F_q`
- `2E = r * V`

Euler for genus `0`:

`V - E + F_p + F_q = 2`

Substitute to get:

`V * (1 - r/2 + a/p + b/q) = 2`

So:

- `D = 1 - r/2 + a/p + b/q`
- `V = 2 / D`
- `F_p = (a*V)/p`
- `F_q = (b*V)/q`

Necessary conditions:

- `D > 0`
- `V, F_p, F_q` are positive integers

## 3. Example: squares + hexagons

`p=6` (hex), `q=4` (square).

Two valid vertex patterns:

1. `a=1, b=2` (one hex, two squares at each vertex)
- Gives `V=12, F_6=2, F_4=6`
- This is the regular hexagonal prism.

2. `a=2, b=1` (two hex, one square at each vertex)
- Gives `V=24, F_6=8, F_4=6`
- This is the truncated octahedron.

Same face pair, different vertex pattern, different solid.

## 4. Why this is necessary but not sufficient

Passing angle + Euler tests does not guarantee realizability with regular equal-edge faces.

Additional constraints:

- A valid combinatorial polyhedron graph must exist (3-connected planar graph for convex case).
- That graph must admit a geometric embedding where all edges are equal and each face is the required regular polygon.
- No self-intersections.

So the pipeline needs:

1. arithmetic feasibility checks
2. graph construction/search
3. geometric solve/validation

## 5. "Teapot" note

A teapot-like form often introduces:

- holes/handles (genus `g > 0`)
- non-convexity
- non-regular faces

Then Euler changes to:

`V - E + F = 2 - 2g`

So "can these two faces make a 3D object?" depends on whether you mean:

- strict convex regular-face polyhedron (`g=0`), or
- broader mesh/topological surface design.

## 6. How to incorporate into this codebase

Current polyhedron flow uses known safe presets/families (`apps/web/src/routes/+page.svelte`, `packages/shared-types/src/index.ts`, `services/geometry-engine/src/index.ts`).

Recommended integration path:

1. Add a new optional "two-face explorer" polyhedron definition in `packages/shared-types/src/index.ts`:
- `faceA: p`
- `faceB: q`
- `vertexPattern: { a, b }`
- optional `genus` (default `0`)

2. Add deterministic feasibility checks in geometry engine:
- angle deficit test
- Euler/integrality test
- bounds/safety checks

3. Initially map only to known realizable families/presets:
- prisms (`n` + squares)
- antiprisms (`n` + triangles)
- bipyramids (`n` + triangles)
- existing mixed presets already supported

4. Later add experimental graph/embedding solver mode:
- candidate planar graph generation
- geometric optimization
- reject unsatisfied/self-intersecting results

5. Surface clear diagnostics in UI:
- "fails angle deficit"
- "fails integer face/vertex counts"
- "no realizable equal-edge embedding found"

## 7. Practical implementation strategy

Phase 1 (low risk):

- Keep preset-based generation as source of truth.
- Add the math checker as "advisor" for user-entered two-face combos.

Phase 2 (experimental):

- Add solver-backed generation for combos outside preset library.
- Gate behind explicit "experimental" toggle.

This keeps exports deterministic while enabling mathematically grounded exploration.

## 8. Productization / User Interface Concepts

To make these mathematical possibilities accessible to non-technical users, we can abstract the constraints into a guided "builder" experience.

### Concept 1: The Constrained Explorer (Linear/Slider Flow)

Instead of asking users for `vertex coefficients` or `angle deficits`, we present a simplified decision tree that only exposes mathematically valid options.

1.  **Primary Slider (`n`):**
    *   "How many sides does your main shape have?"
    *   User picks `n` (e.g., 3=Triangle, 4=Square, 5=Pentagon, 6=Hexagon).

2.  **Configuration Selector ("Version"):**
    *   Because `n` alone doesn't define the shape (e.g., `n=6` could be a Hex Prism, Truncated Octahedron, or Truncated Icosahedron depending on the second face and vertex layout), we present valid "versions" as distinct, clickable options.
    *   The UI calculates all valid integer solutions for `(p=n, q=?, a=?, b=?)` that satisfy the Euler and Angle Deficit constraints.
    *   **Example for `n=4` (Square):**
        *   *Version 1:* Cube (All squares).
        *   *Version 2:* Square Pyramid (Square + Triangles).
        *   *Version 3:* Square Prism (Square + Squares).
    *   **Example for `n=6` (Hexagon):**
        *   *Version 1:* Hexagonal Prism (Hexagon + Squares).
        *   *Version 2:* Truncated Octahedron (Hexagon + Squares, different arrangement).
        *   *Version 3:* Truncated Icosahedron (Hexagon + Pentagons).

This approach "gamifies" the math: users explore what "Version 5" of a Heptagon looks like, without needing to know *why* it exists mathematically.

### Concept 2: The Solution Space Map (Visual Plot)

For a more exploratory and less linear experience, we can visualize the "solution space" as a scatter plot.

*   **Visual Representation:** A 2D grid where dots represent valid 3D shapes.
*   **Axes:**
    *   X-Axis: Number of sides of Face A (`n`).
    *   Y-Axis: Number of sides of Face B (`m`).
*   **Interaction:**
    *   Users see a grid of dots. A dot at `(6, 4)` means "There is a valid shape using Hexagons and Squares."
    *   If multiple shapes exist for `(6, 4)` (like the Prism vs. Truncated Octahedron), the dot could be larger, different colored, or expand into a cluster of sub-choices when clicked.
*   **Pros:** Encourages "hunting" for rare shapes. Visually demonstrates that some combinations (e.g., Heptagons + Octagons) might be impossible (empty space on the plot).
*   **Cons:** Harder to interpret "versions" (same face types, different topology) without 3D clustering or drill-down menus.

### Recommendation
Start with **Concept 1** as the primary creation flow for its clarity. Use **Concept 2** as an advanced "Gallery View" for power users to find specific combinations quickly.
