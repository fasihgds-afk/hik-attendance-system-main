"""
IdlePopup — fullscreen break reason form.

Created and managed EXCLUSIVELY on the Tkinter main thread.
Never instantiated from a background thread.

Network calls (break_reason) are dispatched to a worker thread,
with result polling via root.after() — the UI never blocks.
Hardened against widget-destroyed crashes with TclError guards.
"""

import time
import threading
import tkinter as tk

from .constants import THEME, BREAK_REASONS
from .config import log, resource_path
from .api import send_break_reason


_SUBMIT_TIMEOUT = 50  # Max seconds to wait for API before forcing failure


class IdlePopup:
    """
    Lifecycle (all on main thread):
      show()         → creates Toplevel
      _on_submit()   → validates, starts async API call, polls for result
      _finish()      → destroys Toplevel, calls on_submitted callback
    """

    def __init__(self, root, config, on_submitted):
        self._root = root
        self._config = config
        self._on_submitted = on_submitted
        self._toplevel = None
        self._submit_result = None
        self._submit_start_time = 0.0

    @property
    def is_visible(self):
        return self._toplevel is not None

    def show(self):
        """Show the fullscreen popup. Must be called from main thread."""
        if self._toplevel is not None:
            return

        self._submit_result = None
        self._submit_start_time = 0.0

        try:
            self._build_ui()
        except Exception as e:
            log.error("Failed to build popup UI: %s", e, exc_info=True)
            self._toplevel = None

    def hide(self):
        """Destroy the popup Toplevel. Must be called from main thread."""
        if self._toplevel is not None:
            try:
                self._toplevel.destroy()
            except Exception:
                pass
            self._toplevel = None

    # ─── UI construction ─────────────────────────────────────

    def _build_ui(self):
        top = tk.Toplevel(self._root)
        self._toplevel = top
        top.title("Break Reason")
        top.configure(bg="#000000")

        top.attributes("-fullscreen", True)
        top.attributes("-topmost", True)

        def stay_on_top():
            try:
                top.attributes("-topmost", True)
                top.lift()
                top.after(1000, stay_on_top)
            except tk.TclError:
                pass
        top.after(500, stay_on_top)

        top.protocol("WM_DELETE_WINDOW", lambda: None)
        top.bind("<Alt-F4>", lambda e: "break")
        top.bind("<Escape>", lambda e: "break")

        top.grid_rowconfigure(0, weight=1)
        top.grid_columnconfigure(0, weight=1)

        top.grid_rowconfigure(0, weight=1)
        top.grid_columnconfigure(0, weight=1)
        outer = tk.Frame(top, bg="#22c55e", padx=2, pady=2)
        outer.grid(row=0, column=0)
        card = tk.Frame(outer, bg="#0a0a0a", padx=2, pady=2)
        card.pack(padx=1, pady=1)

        header = tk.Frame(card, bg="#020617", height=88)
        header.pack(fill="x")
        header.pack_propagate(False)
        hc = tk.Frame(header, bg="#020617")
        hc.pack(expand=True, padx=28, pady=18)
        try:
            logo_path = resource_path("gds.png")
            logo_img = tk.PhotoImage(file=logo_path)
            logo_img = logo_img.subsample(max(1, logo_img.width() // 72), max(1, logo_img.width() // 72))
            top._logo = logo_img
            tk.Label(hc, image=logo_img, bg="#020617").pack(side="left", padx=(0, 20))
        except Exception:
            pass
        tb = tk.Frame(hc, bg="#020617")
        tb.pack(side="left")
        tk.Label(tb, text="Global Digital Solutions", font=("Segoe UI", 16, "bold"),
                 fg="white", bg="#020617").pack(anchor="w")
        tk.Label(tb, text="Break Reason Required", font=("Segoe UI", 10),
                 fg="#22c55e", bg="#020617").pack(anchor="w", pady=(2, 0))

        notice = tk.Frame(card, bg="#14532d", height=44)
        notice.pack(fill="x")
        notice.pack_propagate(False)
        tk.Label(notice, text="You have been idle. Please select a break category and provide a reason.",
                 font=("Segoe UI", 11), fg="#86efac", bg="#14532d").pack(expand=True)

        body = tk.Frame(card, bg="#0a0a0a", padx=32, pady=28)
        body.pack(fill="both")

        tk.Label(body, text="Break category", font=("Segoe UI", 11, "bold"),
                 bg="#0a0a0a", fg="#e2e8f0").pack(anchor="w", pady=(0, 8))
        self._reason_var = tk.StringVar(value="")
        self._custom_var = tk.StringVar(value="")
        radio_frame = tk.Frame(body, bg="#1e293b", highlightbackground="#22c55e", highlightthickness=2)
        radio_frame.pack(fill="x", pady=(0, 20))
        for i, reason in enumerate(BREAK_REASONS):
            rb = tk.Radiobutton(
                radio_frame, text=reason, variable=self._reason_var, value=reason,
                font=("Segoe UI", 12), bg="#1e293b", fg="#f1f5f9",
                activebackground="#334155", activeforeground="#f1f5f9",
                selectcolor="#22c55e", anchor="w", padx=20, pady=12,
                command=lambda: self._safe_widget_config(self._submit_btn, state="normal"),
            )
            rb.pack(fill="x")
            if i < len(BREAK_REASONS) - 1:
                tk.Frame(radio_frame, bg="#334155", height=1).pack(fill="x")

        tk.Label(body, text="Reason details (required)", font=("Segoe UI", 11, "bold"),
                 bg="#0a0a0a", fg="#e2e8f0").pack(anchor="w", pady=(0, 8))
        tk.Label(body, text="e.g. Meeting with manager, Lunch, Prayer break",
                 font=("Segoe UI", 9), bg="#0a0a0a", fg="#64748b").pack(anchor="w", pady=(0, 6))
        entry_frame = tk.Frame(body, bg="#22c55e", padx=2, pady=2)
        entry_frame.pack(fill="x")
        self._reason_entry = tk.Entry(
            entry_frame, textvariable=self._custom_var,
            font=("Segoe UI", 12), width=50,
            bg="#1e293b", fg="#f1f5f9", insertbackground="#22c55e",
            relief="flat", borderwidth=0,
        )
        self._reason_entry.pack(fill="x", ipady=12, padx=14, pady=4)

        self._status_label = tk.Label(body, text="", font=("Segoe UI", 10), bg="#0a0a0a")
        self._status_label.pack(pady=(16, 0))

        self._submit_btn = tk.Button(
            body, text="Submit",
            font=("Segoe UI", 12, "bold"),
            bg="#22c55e", fg="#020617",
            activebackground="#16a34a", activeforeground="#020617",
            relief="flat", padx=28, pady=12, state="disabled", cursor="hand2",
            command=self._on_submit, highlightthickness=0, bd=0,
        )
        self._submit_btn.pack(pady=(16, 0), fill="x")
        self._submit_btn.bind("<Enter>", lambda e: self._safe_widget_config(self._submit_btn, bg="#16a34a"))
        self._submit_btn.bind("<Leave>", lambda e: self._safe_widget_config(self._submit_btn, bg="#22c55e"))

        footer = tk.Frame(card, bg="#0f172a", height=40)
        footer.pack(fill="x")
        footer.pack_propagate(False)
        tk.Label(footer, text="This information is required for attendance tracking.",
                 font=("Segoe UI", 9), bg="#0f172a", fg="#64748b").pack(expand=True)

        log.info("Popup shown (main thread)")

    # ─── Safe widget helpers ─────────────────────────────────

    def _safe_widget_config(self, widget, **kwargs):
        """Configure a widget, silently ignoring TclError if destroyed."""
        try:
            widget.config(**kwargs)
        except (tk.TclError, AttributeError):
            pass

    # ─── Submit flow (non-blocking, crash-hardened) ──────────

    def _on_submit(self):
        """Validate → start async API call → poll for result."""
        if self._toplevel is None:
            return

        try:
            reason = self._reason_var.get()
            custom = self._custom_var.get().strip()
        except (tk.TclError, AttributeError):
            return

        if not reason:
            self._safe_widget_config(self._status_label, text="Please select a category.", fg=THEME["error"])
            return
        if not custom:
            self._safe_widget_config(
                self._status_label,
                text="Please type your reason \u2014 it is required.",
                fg=THEME["error"],
            )
            try:
                self._reason_entry.focus_set()
            except (tk.TclError, AttributeError):
                pass
            return

        self._safe_widget_config(self._submit_btn, state="disabled")
        self._safe_widget_config(self._status_label, text="Submitting...", fg=THEME["primary"])
        self._submit_result = None
        self._submit_start_time = time.time()

        config = self._config
        r, c = reason, custom

        def do_call():
            try:
                out = send_break_reason(config, r, c)
                self._submit_result = out
            except Exception as e:
                log.error("Break reason submit thread error: %s", e)
                self._submit_result = (False, None)

        threading.Thread(target=do_call, daemon=True).start()
        self._poll_submit(reason, custom)

    def _poll_submit(self, reason, custom):
        """Poll for API result without blocking the main thread."""
        if self._toplevel is None:
            self._finish(reason, custom)
            return

        # Timeout guard: if the API hangs, force failure after _SUBMIT_TIMEOUT seconds
        if self._submit_result is None:
            if time.time() - self._submit_start_time > _SUBMIT_TIMEOUT:
                log.warning("Submit poll timed out after %ds", _SUBMIT_TIMEOUT)
                self._submit_result = (False, None)
            else:
                try:
                    self._root.after(150, lambda: self._poll_submit(reason, custom))
                except tk.TclError:
                    pass
                return

        try:
            ok = self._submit_result and (self._submit_result[0] if isinstance(self._submit_result, tuple) else self._submit_result)
            if ok:
                was_buffered = isinstance(self._submit_result, tuple) and self._submit_result[1] == "buffered"
                msg = "Saved locally. Will sync when back online." if was_buffered else "Submitted! Closing..."
                self._safe_widget_config(self._status_label, text=msg, fg=THEME["success"])
                self._root.after(400, lambda: self._finish(reason, custom))
            else:
                self._safe_widget_config(
                    self._status_label,
                    text="Could not reach server. Check your connection and try again.",
                    fg=THEME["error"],
                )
                self._safe_widget_config(self._submit_btn, state="normal")
        except tk.TclError:
            self._finish(reason, custom)

    def _finish(self, reason, custom):
        """Close popup and notify the app."""
        self.hide()
        if self._on_submitted:
            try:
                self._on_submitted(reason, custom)
            except Exception as e:
                log.error("on_submitted callback error: %s", e)
