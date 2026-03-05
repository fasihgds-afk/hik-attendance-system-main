import tkinter as tk
from tkinter import ttk, messagebox
from .constants import BREAK_CATEGORIES


def prompt_break_reason():
    """Always-on-top break form. User must select category and reason."""
    result = {"category": None, "reason": None}

    root = tk.Tk()
    root.title("GDS - Break Reason Required")
    root.geometry("500x320")
    root.configure(bg="#0a1424")
    root.attributes("-topmost", True)
    root.resizable(False, False)

    frame = tk.Frame(root, bg="#0f1f35")
    frame.pack(fill="both", expand=True, padx=18, pady=18)

    tk.Label(
        frame,
        text="GDS - Break Submission",
        fg="white",
        bg="#0f1f35",
        font=("Segoe UI", 14, "bold"),
    ).pack(anchor="w", pady=(8, 8), padx=12)

    tk.Label(frame, text="Category", fg="#d1d5db", bg="#0f1f35").pack(anchor="w", padx=12)
    combo = ttk.Combobox(frame, values=list(BREAK_CATEGORIES), state="readonly")
    combo.pack(fill="x", padx=12, pady=(4, 10))
    combo.current(0)

    tk.Label(frame, text="Reason / Comment (required)", fg="#d1d5db", bg="#0f1f35").pack(anchor="w", padx=12)
    reason_entry = tk.Entry(frame)
    reason_entry.pack(fill="x", padx=12, pady=(4, 16))

    def submit():
        category = (combo.get() or "").strip()
        reason = (reason_entry.get() or "").strip()
        if not category or not reason:
            messagebox.showerror("Validation", "Category and reason/comment are required.")
            return
        result["category"] = category
        result["reason"] = reason
        root.destroy()

    btn = tk.Button(
        frame,
        text="Submit",
        bg="#10b981",
        fg="white",
        activebackground="#059669",
        command=submit,
    )
    btn.pack(anchor="e", padx=12, pady=8)

    root.protocol("WM_DELETE_WINDOW", lambda: None)
    root.mainloop()
    return result["category"], result["reason"]


def show_violation_popup():
    """Persistent 'Violation Detected' popup for auto-clicker. Blocks until user acknowledges."""
    root = tk.Tk()
    root.title("GDS - Violation Detected")
    root.geometry("420x200")
    root.configure(bg="#1a0a0a")
    root.attributes("-topmost", True)
    root.resizable(False, False)

    frame = tk.Frame(root, bg="#2d1515", padx=24, pady=24)
    frame.pack(fill="both", expand=True)

    tk.Label(
        frame,
        text="Violation Detected",
        fg="#ef4444",
        bg="#2d1515",
        font=("Segoe UI", 16, "bold"),
    ).pack(anchor="w", pady=(0, 8))

    tk.Label(
        frame,
        text="Synthetic input or auto-clicker detected. This may be reported.",
        fg="#fca5a5",
        bg="#2d1515",
        font=("Segoe UI", 10),
        wraplength=360,
    ).pack(anchor="w", pady=(0, 20))

    def dismiss():
        root.destroy()

    tk.Button(
        frame,
        text="Acknowledge",
        bg="#dc2626",
        fg="white",
        command=dismiss,
    ).pack(anchor="e")
    root.mainloop()
