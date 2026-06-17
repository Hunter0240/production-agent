# Product

## Register

product

## Users

Working crew on a live broadcast, querying the production office through the day. They are not desk users: a camera operator on a jib, a utility coiling cable, an A2 at the audio cart, a producer on headset. Each one needs one fact fast and in context, the way they would radio it in: "what's camera call?", "what lens is on the jib?", "which segment has the pyro?", "who's the A2?". The production manager or coordinator owns the paperwork; everyone else queries it.

The defining constraint is that the answer depends on who is asking. Talent contacts stay with the producer line. Crew phone numbers do not go to day-players. The same question returns a different answer, or a denial, depending on the requester's role. Users select that role explicitly in the demo ("ASKING AS"); in production it is pinned server-side and the model cannot talk around it.

## Product Purpose

Production Agent (PA) is permission-aware retrieval over a show's paperwork: the rundown, callsheet, tech specs, gear manifests, crew lists, and venue notes that every live broadcast runs on. It is an MCP server with six role-gated tools, fronted here by a web demo (React client, Node agent backend) so the access model is visible without Claude Desktop.

It exists because querying the production office is the most automatable function on a show, and the office is the bottleneck the whole crew hits all day. Success is a crew member getting the right scoped answer in one turn, and a denial that reads as a real access boundary rather than a model refusal. The longer aim is a leaner production office, from the manager on down.

Working title is "Production Agent"; every show names its own PA, so the wordmark must tolerate a swapped name.

## Brand Personality

Broadcast-truck, not SaaS-dashboard. Three words: precise, on-air, trustworthy. The interface should feel like production-office paperwork and control-room signage: condensed display type, monospace body, tally lights, call-sheet rigor. Confident and terse; it speaks in show language (call times, segments, departments, roles), not generic app copy. The permission boundary is a feature to show off, not hide: a denial should look deliberate and earned, like a stamped document, never like an error.

## Anti-references

- Generic AI/SaaS dashboards: soft cards on white, rounded-everything, Inter, friendly mascots. This is a working tool for working crew, not a marketing console.
- AI-slop aesthetics: purple/blue gradients, glassmorphism, frosted panels, gratuitous blur, emoji.
- Chatbot tropes: speech bubbles, avatar circles, "How can I help you today?" warmth. PA answers like the production office, not a support widget.
- Anything that softens the access boundary. A permission denial must not look like a generic toast or a sad-state illustration.

## Design Principles

- **Show paperwork is the texture.** The visual language is the rundown, the callsheet, the tally light, the control-room rack. Lean into it; do not flatten it into neutral app chrome.
- **The boundary is the demo.** Role scoping is the whole point. Make the active role and the scope of every answer legible at a glance, and make denials feel structural and intentional.
- **Terse, on-air register.** Labels and copy speak the crew's language and stay short. No filler, no chatbot warmth.
- **One fact, in context, fast.** Optimize for a crew member getting a single scoped answer quickly; reward the common queries (camera call, lens, segment, who-is-who).
- **Legible under pressure.** High contrast, unambiguous status (live vs dark), readable on a laptop in a truck. Clarity beats decoration.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor. The product already runs a dark, high-contrast control-room palette; preserve contrast ratios when introducing accents. Status must never rely on color alone: the live/dark tally and any allow/deny state need a text or shape cue alongside the color. Respect `prefers-reduced-motion` for the tally pulse and any reveal animations. Ensure the role selector and chat input are fully keyboard-operable with visible focus.
