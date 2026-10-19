import { useEffect, useRef, type RefObject } from "react";

let nextSheetId = 0;

// Keep panel contents mounted: drafts, library filters and scroll positions survive.
export function useEditorSheet(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return;
    const previous = document.activeElement;
    const navigation = Array.from(sheet.closest(".responsive-editor")?.querySelectorAll<HTMLElement>(".editor-rail, .mobile-editor-views") || []);
    const background: { element: HTMLElement; inert: boolean }[] = [];
    for (let node: HTMLElement | null = sheet; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== node && !navigation.includes(sibling) && !sibling.classList.contains("editor-sheet-backdrop")) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      if (node.parentElement === document.body) break;
    }
    const focusable = () => [sheet, ...navigation].flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')))
      .filter(element => element.getClientRects().length && !element.closest('[hidden], [inert]'));
    const containsFocus = () => [sheet, ...navigation].some(root => root.contains(document.activeElement));
    (sheet.querySelector<HTMLElement>('[data-sheet-close]') || focusable()[0] || sheet).focus();
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); sheet.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !containsFocus())) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !containsFocus())) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      for (const { element, inert } of background) element.inert = inert;
      if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, [open, ref]);
}

// One same-URL entry lets browser/Android Back dismiss the editor's active sheet.
export function useSheetBack(open: boolean, onClose: () => void | boolean) {
  const close = useRef(onClose), desiredOpen = useRef(open);
  const entry = useRef<string | null>(null);
  const pending = useRef<{ action: () => void; reopen: boolean } | null>(null);
  close.current = onClose; desiredOpen.current = open;
  const push = () => {
    const token = `${Date.now()}-${++nextSheetId}`;
    entry.current = token;
    history.pushState({ ...history.state, imagegenSheet: token }, "");
  };
  useEffect(() => {
    const back = () => {
      const token = entry.current;
      if (!token || history.state?.imagegenSheet === token) return;
      entry.current = null;
      const queued = pending.current;
      pending.current = null;
      if (queued) {
        queued.action();
        if (queued.reopen && desiredOpen.current) push();
      } else if (close.current() === false) push();
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (entry.current && history.state?.imagegenSheet === entry.current) history.back();
    };
  }, []);
  useEffect(() => {
    if (open) {
      if (!entry.current && !pending.current) push();
    } else if (entry.current && history.state?.imagegenSheet === entry.current && !pending.current) {
      // A breakpoint change can finish while Back is in flight. Drain that entry
      // before opening another one, without closing a newly reopened panel.
      pending.current = { action: () => {}, reopen: true };
      history.back();
    }
  }, [open]);
  return (action: () => void) => {
    if (entry.current && history.state?.imagegenSheet === entry.current) {
      const alreadyPending = !!pending.current;
      pending.current = { action, reopen: false };
      // Keep the modal background inert until the entry has been consumed.
      if (!alreadyPending) history.back();
    } else action();
  };
}
