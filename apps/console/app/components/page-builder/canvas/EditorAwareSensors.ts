import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { KeyboardSensor, PointerSensor } from "@dnd-kit/core";

// Replacement sensors that ignore events originating inside a Tiptap editor
// (or any other surface that opts out via `data-no-dnd-keyboard="true"`).
//
// Why this exists: when a block hosting a Tiptap editor is the dnd-kit
// "active" item and the user types inside it, hitting Space (or any other
// key in the default keyboard-codes start set) used to make dnd-kit's
// KeyboardSensor fire its `start` activator on the SortableBlock wrapper,
// immediately entering keyboard-drag mode. The fix is to gate the activator
// on whether the event target lives under `[data-no-dnd-keyboard]` — if so,
// the sensor bails and the editor handles the key normally.

const START_CODES = new Set(["Space", "Enter"]);

function isOptOut(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("[data-no-dnd-keyboard]"));
}

function editorAwareKeyboardActivator(
  event: ReactKeyboardEvent,
  options: {
    keyboardCodes?: { start: string[]; cancel: string[]; end: string[] };
    onActivation?: (params: { event: KeyboardEvent }) => void;
  },
  context: { active: { activatorNode: { current: HTMLElement | null } } }
): boolean {
  const native = event.nativeEvent;
  if (isOptOut(native.target)) return false;
  const codes = options.keyboardCodes
    ? new Set(options.keyboardCodes.start)
    : START_CODES;
  if (!codes.has(native.code)) return false;
  const activator = context.active.activatorNode.current;
  if (activator && event.target !== activator) return false;
  event.preventDefault();
  options.onActivation?.({ event: native });
  return true;
}

function editorAwarePointerActivator(
  event: ReactPointerEvent,
  options: { onActivation?: (params: { event: PointerEvent }) => void }
): boolean {
  const native = event.nativeEvent;
  if (!native.isPrimary || native.button !== 0) return false;
  if (isOptOut(native.target)) return false;
  options.onActivation?.({ event: native });
  return true;
}

export class EditorAwareKeyboardSensor extends KeyboardSensor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static activators: any = [
    {
      eventName: "onKeyDown" as const,
      handler: editorAwareKeyboardActivator,
    },
  ];
}

export class EditorAwarePointerSensor extends PointerSensor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static activators: any = [
    {
      eventName: "onPointerDown" as const,
      handler: editorAwarePointerActivator,
    },
  ];
}
