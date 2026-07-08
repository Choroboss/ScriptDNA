---
name: Obsidian Script
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c6c6cf'
  on-tertiary: '#2f3037'
  tertiary-container: '#909099'
  on-tertiary-container: '#282930'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e2e1eb'
  tertiary-fixed-dim: '#c6c6cf'
  on-tertiary-fixed: '#1a1b22'
  on-tertiary-fixed-variant: '#45464e'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1440px
  sidebar-width: 260px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is engineered for the elite content creator—the "architect of narrative." The brand personality is hyper-focused, technical, and premium, stripping away the extraneous to leave only the essential tools for creation. It evokes the feeling of a high-end IDE (Integrated Development Environment) but optimized for literary structure and AI-assisted workflow.

The style is **Hyper-Minimalist with a Technical Edge**. It utilizes a "Dark Mode by default" philosophy, drawing from modern developer-centric aesthetics. The interface relies on structural integrity—precise 1px borders and grid alignment—rather than decorative shadows or depth. It is unapologetically monochromatic, using "Electric Indigo" sparingly as a functional signal for activity, success, and focus. 

The emotional response is one of clarity and mastery. By removing visual noise, the design system centers the user’s mind on the script, positioning the AI as a silent, powerful co-pilot rather than a distracting novelty.

## Colors

The palette is anchored in an obsidian foundation to minimize eye strain during long writing sessions. The hierarchy is strictly enforced through luminance and the strategic application of the Indigo accent.

- **Backgrounds**: The primary canvas is `#0a0a0a` (Obsidian), with secondary layers like sidebars using `#121212`.
- **Accents**: `#6366f1` (Electric Indigo) is reserved for active states, primary call-to-actions, and AI-generated highlights.
- **Borders**: All structural divisions use a low-contrast `#262626` or `#3f3f46` for subtle definition.
- **Typography**: Primary content is `#fafafa` for maximum legibility, while metadata and descriptions use `#a1a1aa` (Zinc).
- **Status**: Success is handled by the primary Indigo; destructive actions use a muted `#ef4444` (Crimson) only on hover.

## Typography

Typography is the core of this design system. It uses a triple-font approach to differentiate between structure, content, and metadata.

- **Geist (Headlines)**: Used for structural navigation and page titles. It provides a geometric, technical feel that aligns with the developer-aesthetic.
- **Inter (Body)**: The workhorse for the script editor. Chosen for its exceptional legibility at all sizes and its neutral, "invisible" quality that doesn't distract the writer.
- **JetBrains Mono (Labels/Technical)**: Used for AI status codes, timestamps, word counts, and technical badges. The monospaced nature reinforces the "tooling" aspect of the platform.

Text should be left-aligned in almost all contexts to maintain a strong vertical grid line. Use tight tracking for large headlines and slightly increased tracking for monospaced labels to ensure readability.

## Layout & Spacing

This design system employs a **Fixed-Fluid Hybrid Grid**. The sidebar and utility panels are fixed-width, while the central editor area is fluid but capped at a maximum width of 800px to ensure optimal line length for reading and writing.

- **The 4px Rule**: All spacing must be a multiple of 4px. Use 8px/16px for internal component padding and 24px/32px/48px for layout sections.
- **The Editor Canvas**: The central script editor should be centered with generous horizontal margins to create a "zen" focus mode.
- **Responsive Behavior**: 
    - **Desktop**: 12-column grid, sidebar visible.
    - **Tablet**: Sidebar collapses to an icon-only rail or hamburger menu; margins reduce to 24px.
    - **Mobile**: Single column; all secondary utilities moved to a bottom sheet; editor font size scales to `body-lg` for easier touch-target interaction.

## Elevation & Depth

In this design system, depth is communicated through **Tonal Layering** and **Subtle Outlines** rather than shadows. 

1. **Surface 0 (Background)**: `#0a0a0a` - The base layer.
2. **Surface 1 (Sidebar/Navigation)**: `#121212` - Slightly lifted, separated by a 1px border of `#262626`.
3. **Surface 2 (Cards/Modals)**: `#171717` - The highest level of content.
4. **Active State**: Instead of a shadow, an active card or input is defined by a 1px border of `#6366f1` (Indigo).

Hover states should be indicated by a subtle background shift (e.g., from `#121212` to `#1c1c1c`) rather than an elevation change. This keeps the interface feeling flat, fast, and digital.

## Shapes

The shape language is "Sharp-Technical." While the system uses the `Soft` setting (0.25rem/4px), it is applied with high precision to avoid a "bubbly" appearance.

- **Small Components (Buttons, Inputs, Badges)**: 4px corner radius.
- **Containers (Cards, Modals)**: 8px corner radius.
- **Editor Blocks**: 0px radius (completely sharp) to emphasize the modular, "block-based" nature of the writing experience.

Icons must be **Lucide-style** (2px stroke width, consistent 24x24 bounding box) to match the wire-thin aesthetic of the borders and monospaced type.

## Components

- **Buttons**:
    - *Primary*: Solid `#6366f1` with `#ffffff` text. No gradients.
    - *Secondary*: Transparent background with a `#3f3f46` border. On hover, the border becomes `#fafafa`.
    - *Ghost*: No border, Zinc text, becomes White on hover.
- **Editor Blocks (Notion-style)**:
    - Each paragraph or AI suggestion is a discrete block. 
    - Hovering over a block reveals a hidden "drag handle" and an "AI Rewrite" button in the margin.
- **Technical Badges**:
    - Small, monospaced text in a `#1e1b4b` (Dark Indigo) background with `#818cf8` text. Used for "AI Confidence," "Draft," or "SEO Score."
- **Input Fields**:
    - Minimalist 1px bottom border by default. Transitions to a full 4-sided Indigo border on focus. 
    - Placeholder text is Zinc (`#71717a`).
- **Lists**:
    - Used for script version history or asset libraries.
    - Interactive rows with no visible border between them; separated by 8px of vertical space. 
- **Sidebars**:
    - Left sidebar: Navigation and Workspace folders.
    - Right sidebar (Collapsible): AI Chat/Assistant and Script Metadata.