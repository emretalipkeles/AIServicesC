# Step Progress Renderer — Integration Guide

I've uploaded files that implement real-time step-by-step progress rendering for the AI agent loop. When the AI decides it needs to do autonomous work (call tools, plan steps), the chat shows a collapsible progress list with animated icons instead of raw text.

## Files Included

| File | Target Location | Purpose |
|------|----------------|---------|
| `step-progress-renderer.tsx` | `client/src/components/step-progress-renderer.tsx` | Parses step markers from accumulated content and renders collapsible step list |
| `animated-thinking-indicator.tsx` | `client/src/components/ui/animated-thinking-indicator.tsx` | `ThinkingBars` component — animated bars shown while AI is actively working |
| `css-animations.css` | Merge into `client/src/index.css` | ~200 lines of CSS keyframes for thinking bars, step fade-in, scale-in animations |

## How It Works (End-to-End Flow)

### Backend Side (already wired from Phase 2-5)

The agent loop emits domain events (`AgentLoopEvents.ts`) during execution:
- `thinking` → AI is reasoning about what to do
- `tool_invocation` → AI decided to call a tool
- `tool_progress` → Tool is reporting progress (sub-steps)
- `tool_result` → Tool finished
- `response_chunk` → AI is streaming its final answer
- `loop_completed` → Done

The `AgentLoopEventToSSEAdapter` translates these into SSE events with types:
- `planning` — AI is thinking/planning
- `agent-start` — Tool execution starting
- `agent-chunk` — Tool reporting progress (this is the step text)
- `agent-done` — Tool finished
- `synthesis-chunk` — Final response text streaming
- `synthesis-done` — Complete

### Frontend Side (what you're implementing)

Your chat panel receives these SSE events and builds up a single string with special markers embedded:

```
**Planning:** Analyzing your request...

**Executing:** Searching for relevant data<!-- stepMeta:{"id":"al-step-1","status":"started"} -->

<!-- stepUpdate:{"id":"al-step-1","status":"completed"} -->

**Executing:** Processing results<!-- stepMeta:{"id":"al-step-2","status":"started"} -->

<!-- stepUpdate:{"id":"al-step-2","status":"completed"} -->

---

Here is the final answer based on my analysis...
```

The `StepProgressRenderer` parses this format and renders:
- A collapsible "Working... (3 steps)" header
- Each step with an animated icon (spinning while active, checkmark when done)
- A `---` separator followed by the final markdown response
- `ThinkingBars` animation while the AI is still working

## Step 1: Place Files

Copy `step-progress-renderer.tsx` and `animated-thinking-indicator.tsx` to the locations shown above.

## Step 2: Fix Imports in animated-thinking-indicator.tsx

The original file imports a Prophix logo. **Remove the logo import and replace with your app's logo or a generic AI icon:**

```tsx
// REMOVE this line:
import prophixLogo from "@assets/Prophix_Logo_small_1768494327727.png";

// REPLACE with your app's logo, or use a Lucide icon instead:
import { Bot } from "lucide-react";
```

Then in the JSX, replace `<img src={prophixLogo} .../>` with your icon/logo. Or simplify `AnimatedThinkingIndicator` to just show text + dots if you don't need the fancy logo animation.

**The `ThinkingBars` component needs NO changes** — it's the simple one you actually need.

## Step 3: Fix Imports in step-progress-renderer.tsx

Check these imports resolve in your project:
```tsx
import ReactMarkdown from "react-markdown";      // npm package
import remarkGfm from "remark-gfm";              // npm package
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Cog, Circle } from "lucide-react";
import { ThinkingBars } from "./ui/animated-thinking-indicator";  // adjust path if needed
```

Install if missing: `react-markdown`, `remark-gfm`

## Step 4: Add CSS Animations to index.css

Merge the contents of `css-animations.css` into your app's `client/src/index.css`. These go inside a `@layer base { ... }` or `@layer utilities { ... }` block (or just at the root level within your existing CSS structure).

The critical animations are:
- `.animate-thinking-bar-1` through `.animate-thinking-bar-5` — the pulsing bars
- `.animate-step-fade-in` — step items sliding in from left
- `.animate-scale-in` — checkmark icons popping in
- `.animate-thinking-dot-1/2/3` — the "Working..." dots

## Step 5: Add Tailwind Config (optional)

If you use Tailwind's animation system, add to `tailwind.config.ts` under `theme.extend`:

```ts
keyframes: {
  "scale-in": {
    from: { opacity: "0", transform: "scale(0.95)" },
    to: { opacity: "1", transform: "scale(1)" },
  },
},
animation: {
  "scale-in": "scale-in 0.2s ease-out",
},
```

This is optional since the CSS class `.animate-scale-in` in `css-animations.css` already handles it directly.

## Step 6: Wire Into Your Chat Panel (THE KEY PART)

This is where you connect the SSE events to the step renderer. In your chat panel's SSE handler, you need to track state and build the marked-up string.

### State Variables

Add these tracking variables inside your SSE message handler:

```tsx
let hasAgentLoopSteps = false;
let currentStepId = '';
let stepCounter = 0;
let accumulatedContent = '';
let hasFinalResponseSeparator = false;
```

### SSE Event Handling

For each SSE event type, build up `accumulatedContent` with the markers:

```tsx
case 'planning': {
  const planContent = data.content || 'Planning next step...';
  if (hasAgentLoopSteps) {
    accumulatedContent += (accumulatedContent ? '\n\n' : '') + `**Planning:** ${planContent}`;
  }
  break;
}

case 'agent-start': {
  // If we already had a final response separator, re-add it (for multi-tool flows)
  if (hasFinalResponseSeparator) {
    accumulatedContent += '\n\n---\n\n';
  }
  hasAgentLoopSteps = true;
  hasFinalResponseSeparator = false;
  break;
}

case 'agent-chunk': {
  if (data.content && hasAgentLoopSteps) {
    stepCounter++;
    currentStepId = `al-step-${stepCounter}`;
    const meta = `<!-- stepMeta:${JSON.stringify({ id: currentStepId, status: 'started' })} -->`;
    accumulatedContent += (accumulatedContent ? '\n\n' : '') + `**Executing:** ${data.content}${meta}`;
  } else if (data.content) {
    accumulatedContent += data.content;
  }
  break;
}

case 'agent-done': {
  if (hasAgentLoopSteps && currentStepId) {
    const meta = `<!-- stepUpdate:${JSON.stringify({ id: currentStepId, status: 'completed' })} -->`;
    accumulatedContent += `\n\n${meta}`;
  }
  break;
}

case 'synthesis-chunk': {
  if (data.content) {
    // Add separator before the final response starts
    if (hasAgentLoopSteps && !hasFinalResponseSeparator) {
      hasFinalResponseSeparator = true;
      accumulatedContent += '\n\n---\n\n';
    }
    accumulatedContent += data.content;
  }
  break;
}

case 'synthesis-done': {
  // Stream complete — mark as done
  break;
}
```

### Message Interface

Add `isAutonomousRunning` to your message type:

```tsx
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isAutonomousRunning?: boolean;  // ADD THIS
  statusMessage?: string;
}
```

Set `isAutonomousRunning = true` whenever you receive `agent-start`, `agent-chunk`, `planning` events. Set it to `false` on `synthesis-done` or stream completion.

### Render Logic

In your message rendering, detect when to use the step renderer:

```tsx
{!isUser && (
  message.isAutonomousRunning || 
  message.content.includes('**Planning:**') || 
  message.content.includes('**Executing:**')
) ? (
  <StepProgressRenderer
    content={message.content}
    isStreaming={message.isStreaming || false}
    isRunning={message.isAutonomousRunning || false}
  />
) : (
  // Your normal markdown message rendering
  <ReactMarkdown>{message.content}</ReactMarkdown>
)}
```

## Step 7: Verify

1. When the AI gives a direct answer (no tools), messages render normally — no step UI
2. When the AI calls tools, you see a collapsible "Working... (N steps)" with animated step items
3. Each step shows a spinning icon while active, then a green checkmark when done
4. After all steps complete, the final response appears below a separator
5. The step list is collapsible — clicking the header toggles it
6. `ThinkingBars` (animated pulsing bars) appear while the AI is actively working

## Summary of What Renders What

```
User asks complex question
  → AI decides to use tools
  → Backend emits: planning → agent-start → agent-chunk → agent-done → synthesis-chunk → synthesis-done
  → Frontend builds: **Planning:** ... **Executing:** ...<!-- stepMeta --> ... <!-- stepUpdate --> ... --- ... final text
  → StepProgressRenderer parses the markers and renders:
      ┌─────────────────────────────┐
      │ ▾ Working... (3 steps)      │
      │   ⚙ Analyzing request       │
      │   ✓ Searching data           │
      │   ⟳ Processing results       │
      │                              │
      │ ████ (thinking bars)         │
      │                              │
      │ Here is the final answer...  │
      └─────────────────────────────┘
```
