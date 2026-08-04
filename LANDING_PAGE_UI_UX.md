# Mochi Landing Page UI/UX Guide

## Purpose

The landing page presents Mochi as a calm, private Windows companion. Its job is to make the product feel useful before it feels technical: a single gentle place for plans, important messages, focus time, routines, and reminders.

The page avoids the visual language of a busy productivity dashboard. Instead, it uses a paced story that moves from a wide, peaceful first impression into increasingly specific product moments.

## Experience principles

1. **Calm over urgency**
   Spacious layouts, soft paper scenery, restrained motion, and short copy reduce visual pressure. Mochi should feel like it makes the day lighter rather than adds another tool to manage.

2. **Show the product, not just claims**
   The app previews contain plausible tasks, meetings, emails, focus states, and local-data cues. Visitors should understand what Mochi does by scanning the interface examples.

3. **Privacy is a product benefit**
   Local-first behavior is communicated in the hero, the feature story, and the privacy section. It is not hidden in legal or technical copy.

4. **Use illustration as atmosphere**
   Papercraft and zen imagery frames key moments. It is intentionally not used behind every panel, so the page retains contrast and the product UI remains the focus.

5. **Give each chapter one job**
   Every section answers one visitor question. Avoid combining multiple product narratives in one visual block.

## Page flow

| Section | Visitor question | UI treatment | Main message |
| --- | --- | --- | --- |
| Hero | What is Mochi? | Large product window in a Japanese zen landscape | A private desktop companion that keeps the day together. |
| Product promise | Why would I need it? | Editorial headline, short purpose statement, three product cards | Less juggling across tabs, inboxes, and systems. |
| Daily overview | What will I see when I open it? | “Today” window with priorities, meeting, and suggested next action | Start the day knowing what matters. |
| Email | How does it help with messages? | Reply-focused message list | Bring important email forward and leave noise behind. |
| Focus | How does it support deep work? | One-click focus states and companion feedback | Start focus gently and return to the day without friction. |
| Routines | Does it support wellbeing? | Warm routine card set | Small prompts for breaks, hydration, stretching, and wind-downs. |
| Privacy | Is my information safe? | Dark, quieter information panel | Data stays on the computer by default. |
| Optional intelligence | Do I need to connect services? | Three progressive connection cards | Mochi works alone. AI, Gmail, calendar, and providers are opt-in. |
| Closing CTA and footer | What do I do next? | Sakura-led call to action and compact footer | Download for Windows and begin with one manageable task. |

## Visual system

### Colour

- **Warm cream and off-white** form the primary canvas and give the page breathing room.
- **Deep navy** is used for headlines and core UI text to maintain strong readability.
- **Sakura pink, zen mint, and lavender** provide gentle states and visual grouping.
- **Dark plum** is reserved for product windows and privacy-related information, making actual product UI feel grounded and secure.

Colour accents should signal a section or state, not decorate every object. Keep gradients soft and avoid highly saturated fills outside primary CTA buttons.

### Typography

- Headlines are large, compact, and confident. They carry the product story.
- Eyebrows are uppercase with spaced lettering. They give orientation without competing with headings.
- Supporting copy remains short, concrete, and human.
- Interface labels are deliberately smaller and more functional, creating contrast between the product UI and the landing-page narrative.

Avoid em dashes in landing-page copy. Prefer a short sentence, a comma, or a colon.

### Imagery

The visual theme is 3D papercraft zen scenery. Use it in three roles:

1. **Hero setting:** an expansive landscape that introduces Mochi’s calm personality.
2. **Section atmosphere:** a limited number of distinct, purpose-made scenes such as the routine alcove or the privacy sanctuary.
3. **Closing reward:** a lighter, celebratory sakura scene for the download call to action.

Use a different scene for each major illustrated section. Reusing the same mountains too often makes the product journey feel repetitive. Where product information is the priority, favor simple gradients, paper texture, or unobtrusive decorative shapes instead.

### App previews

Product previews are not pixel-perfect screenshots. They are purposeful representations of the actual app:

- Realistic task names, message states, and meeting information help visitors imagine daily use.
- The app’s dark surface, soft pink metrics, rounded panels, and local-status badges should remain consistent.
- Preview density must stay low enough to scan at a glance.
- On small screens, simplify the preview rather than shrinking unreadable detail.

## Layout and spacing

- Desktop chapters have generous minimum heights so a visitor can pause on one idea at a time.
- The hero opens with the largest visual space, then the product-promise section provides a clean bridge into the detailed feature story.
- Section content is centered or uses a balanced two-column layout when an interface preview benefits from a companion explanation.
- Product cards use consistent radii, soft borders, and layered shadows. Their preview area is visually distinct from the explanatory copy below.
- Do not use large empty space without purpose. If a section feels sparse, first improve hierarchy, copy, or composition before adding more decoration.

## Motion and scroll behavior

On desktop, sections use proximity scroll snapping to give the feature journey a chapter-like rhythm. Scroll-linked entrance animations are enabled only for browsers that support view timelines and only when reduced motion is not requested.

- Copy enters first with a short upward movement.
- Product panels arrive slightly later with a small scale and blur transition.
- Hover effects on cards are subtle lifts, not large movements.
- The floating Mochi companion provides personality without obscuring essential content.

All motion should remain optional and non-blocking. The page must be fully understandable when motion is disabled.

## Responsive rules

Mobile and tablet behavior is intentional rather than a compressed desktop layout:

- Navigation reduces to the essential brand and download action.
- Hero imagery uses a dedicated mobile composition so the scene remains visible behind the app preview.
- Two-column feature sections stack with explanatory copy first when that makes the story easier to read.
- Dense product previews hide secondary UI or simplify their layout at narrow widths.
- Three-card grids become a single readable column.
- Dedicated mobile assets are used for the focus and closing CTA backgrounds so important scenery is not cropped away.
- The floating Mochi guide scales down and its speech bubble is hidden on smaller screens to prevent overlap.

Check each section at desktop, tablet, and phone sizes whenever changing section height, background imagery, or card density.

## Content guidelines

- Lead with outcomes such as “know what matters” or “bring the right things forward.”
- Follow with the specific feature only after the benefit is clear.
- Keep claims accurate. Gmail, calendar, and AI are optional connections, not required setup.
- Describe privacy plainly: local data, no mandatory account, and connections only when chosen.
- Keep the tone gentle and capable. Mochi should never sound judgmental, frantic, or overly corporate.

## Implementation map

- `apps/web/src/components/LandingPage.tsx` contains the page structure and section content.
- `apps/web/src/components/HeroDiorama.tsx` contains the hero app preview and garden composition.
- `apps/web/src/components/Footer.tsx` contains footer content.
- `apps/web/src/index.css` contains the visual system, section variants, responsive rules, scroll behavior, and animation fallbacks.
- `apps/web/public/` contains generated papercraft backgrounds and mobile-specific image compositions.

When adding a new section, begin by defining its visitor question and the smallest visual proof needed to answer it. Keep the new section aligned with this story rather than introducing another unrelated visual style.
