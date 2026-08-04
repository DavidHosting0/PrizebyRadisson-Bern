'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'submit', 'checkbox', 'radio', 'reset', 'file'].includes(type);
  }
  return el.isContentEditable;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.tabIndex !== -1,
  );
}

/**
 * Escape closes overlays; optional focus trap + initial focus for dialogs/sheets.
 * Arrow/Enter for list UIs should use `useListKeyboard` separately.
 */
export function useOverlayKeyboard({
  open,
  onClose,
  containerRef,
  trapFocus = true,
  initialFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  containerRef?: RefObject<HTMLElement | null>;
  trapFocus?: boolean;
  initialFocus?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root = containerRef?.current;
    if (root && initialFocus) {
      const focusables = getFocusable(root);
      const preferred =
        root.querySelector<HTMLElement>('[data-autofocus]') ??
        focusables.find((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') ??
        focusables[0];
      preferred?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (!trapFocus || e.key !== 'Tab' || !containerRef?.current) return;
      const focusables = getFocusable(containerRef.current);
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !containerRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !containerRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previousFocus.current?.focus?.();
    };
  }, [open, containerRef, trapFocus, initialFocus]);
}

/**
 * ArrowUp/Down (+ optional Home/End) and Enter for a vertical list of items.
 * Skips when the user is typing in an input/textarea (unless `force` is true).
 */
export function useListKeyboard({
  open,
  itemCount,
  activeIndex,
  setActiveIndex,
  onActivate,
  onEscape,
  orientation = 'vertical',
  force = false,
}: {
  open: boolean;
  itemCount: number;
  activeIndex: number;
  setActiveIndex: (index: number | ((prev: number) => number)) => void;
  onActivate: (index: number) => void;
  onEscape?: () => void;
  orientation?: 'vertical' | 'horizontal';
  force?: boolean;
}) {
  useEffect(() => {
    if (!open || itemCount === 0) return;

    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

    function onKeyDown(e: KeyboardEvent) {
      if (!force && isTypingTarget(e.target)) return;

      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }

      if (e.key === prevKey) {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? itemCount - 1 : i - 1));
        return;
      }
      if (e.key === nextKey) {
        e.preventDefault();
        setActiveIndex((i) => (i >= itemCount - 1 ? 0 : i + 1));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(itemCount - 1);
        return;
      }
      if (e.key === 'Enter') {
        if (activeIndex < 0 || activeIndex >= itemCount) return;
        if (!force && isTypingTarget(e.target)) return;
        e.preventDefault();
        onActivate(activeIndex);
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, itemCount, activeIndex, setActiveIndex, onActivate, onEscape, orientation, force]);
}
