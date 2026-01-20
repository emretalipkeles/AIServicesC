# Design Guidelines: Prophix AI Customer Journey Platform

## Design Approach
**Reference-Based**: Inspired by Replit's sophisticated developer interface with split-screen layout, combined with Linear's refined typography and Stripe's professional restraint. The design emphasizes productivity while maintaining visual delight through subtle animations and premium finishes.

## Brand Identity
**Primary Accent**: Prophix Red (#E94B3C) - used exclusively for all interactive states, focus indicators, active tabs, selections, and primary CTAs. This creates a strong, consistent brand presence throughout the application.

## Core Layout System

### Split-Screen Architecture
- **Left Panel**: 30% width (min 320px, max 400px) - AI Agent Chat
- **Right Panel**: 70% width - Tabbed Content Area
- **Divider**: Subtle 1px border with resize handle capability for future enhancement
- **Spacing**: Tailwind units of 2, 4, 6, and 8 for consistent rhythm

### Panel Specifications
**AI Chat Panel (Left)**:
- Fixed width sidebar with slight padding (p-4 to p-6)
- Conversation history scrollable area
- Auto-expanding textarea at bottom with subtle shadow elevation
- Minimal chrome to maximize conversation focus

**Tabbed Content Panel (Right)**:
- Tab bar at top (h-12 to h-14) with horizontal layout
- Active tab indicated by Prophix red bottom border (border-b-2)
- Content area fills remaining viewport height
- Generous padding (p-6 to p-8) for breathing room

## Typography Hierarchy

**Font Stack**:
- Primary: Inter (Google Fonts) - clean, modern, excellent readability
- Monospace: JetBrains Mono for code/technical elements

**Scale**:
- Headings: text-2xl to text-3xl (bold/semibold)
- Body: text-base (regular)
- Small text: text-sm
- Labels: text-xs to text-sm (medium weight)

## Theme System

### Dark Mode (Default)
- **Background**: Deep charcoal (#0F1419)
- **Surface**: Elevated panels (#1A1F26)
- **Text Primary**: Near white (#E8E9EB)
- **Text Secondary**: Muted gray (#9BA1A6)
- **Borders**: Subtle (#2D3239)
- **Prophix Red Glow**: Soft red shadow with 40% opacity

### Light Mode
- **Background**: Off-white (#FAFAFA)
- **Surface**: Pure white (#FFFFFF)
- **Text Primary**: Deep gray (#1A1F26)
- **Text Secondary**: Medium gray (#5F6368)
- **Borders**: Light gray (#E5E7EB)
- **Prophix Red Glow**: Softer red shadow with 25% opacity

### Theme Toggle
- Position: Top-right corner of interface
- Icon: Sun/moon with smooth rotation transition (180deg)
- Background: Subtle surface color with hover lift effect
- Persist preference in localStorage

## Component Design

### AI Chat Textarea
**Resting State**:
- Compact height (h-12)
- Rounded corners (rounded-lg)
- Subtle border matching theme
- Placeholder text in secondary color

**Focus State**:
- Prophix red glow effect (box-shadow with 8px blur, 60% opacity)
- Border transitions to Prophix red
- Auto-expands vertically as user types (max-h-64)
- Smooth height transition (300ms ease)

**Send Button**:
- Positioned inline right
- Prophix red background
- Icon-only (paper plane)
- Disabled state when empty

### Tab Navigation
- Horizontal layout with even spacing
- Tab items: px-4, py-3
- Active tab: Prophix red bottom border (border-b-2), bold text
- Inactive tabs: Secondary text color, regular weight
- Hover: Smooth opacity change (0.7 to 1.0)
- Tab transition: 200ms ease for border appearance

### Journey Dashboard Cards

**Card Grid**: 
- 2-column layout (grid-cols-2) with gap-6
- Each card fills equal space

**Card Design - "Start New Journey"**:
- Gradient background: Prophix red to deeper red variation
- White text with drop shadow
- Large icon (w-16, h-16) - Plus or Rocket
- Title: text-xl, bold
- Description: text-sm, 80% opacity
- Hover: Lift effect (translateY -4px) with increased shadow
- Cursor: pointer

**Card Design - "Select Client to Continue"**:
- Gradient background: Slate to blue variation
- White text with drop shadow
- Large icon (w-16, h-16) - Users or Folder
- Same typography as New Journey card
- Hover: Matching lift effect
- Cursor: pointer

**Card Structure**:
- Padding: p-8
- Border radius: rounded-xl
- Height: min-h-64 for consistent proportions
- Center-aligned content (flex column)

## Micro-Interactions

**Hover States**:
- Cards: Scale 1.02, shadow increase, 200ms ease
- Buttons: Brightness 110%, 150ms ease
- Tabs: Opacity 70% to 100%, 200ms ease

**Focus States**:
- All interactive elements receive Prophix red outline or glow
- Keyboard navigation clearly visible

**Transitions**:
- Theme switching: 300ms ease on all color properties
- Tab switching: Content fade (opacity 0 to 1, 200ms)
- Textarea expansion: Height transition 300ms ease-out

## Glassmorphism & Depth

**Chat Panel**:
- Subtle backdrop blur on conversation bubbles
- Semi-transparent background (95% opacity)
- Layered shadows for depth perception

**Main Content**:
- Cards use multi-layered shadows (0px 4px 6px, 0px 10px 20px)
- Slight gradient overlays for visual richness

## Visual Refinement

**Shadows**:
- Small: 0 1px 3px rgba(0,0,0,0.1)
- Medium: 0 4px 6px rgba(0,0,0,0.1)
- Large: 0 10px 20px rgba(0,0,0,0.15)

**Borders**:
- Default: 1px solid with theme-appropriate color
- Focus: 2px solid Prophix red

**Animations**:
- Minimal and purposeful only
- No distracting motion
- Smooth, professional timing curves (ease, ease-out)

## Accessibility
- Maintain 4.5:1 contrast ratio for all text
- Focus indicators visible in both themes
- Keyboard navigation fully supported
- Aria labels for icon-only buttons