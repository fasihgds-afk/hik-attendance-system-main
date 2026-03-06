"""
Device enrollment: server registration + GUI enrollment dialog.
"""

import platform
import tkinter as tk
import requests

from .constants import AGENT_VERSION, THEME
from .config import log, save_config, resource_path
from .http_client import http


# ─── Server Enrollment ───────────────────────────────────────────

def enroll(server_url, emp_code):
    """Enroll this device with the HR server. Returns config dict."""
    url = f"{server_url.rstrip('/')}/api/agent/enroll"
    payload = {
        "empCode": emp_code,
        "deviceName": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "agentVersion": AGENT_VERSION,
    }

    log.info("Enrolling device for %s at %s ...", emp_code, url)
    resp = http.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    raw = resp.json()
    data = raw.get("data") or raw
    if raw.get("success") is False:
        raise RuntimeError(raw.get("error", "Enrollment failed"))

    config = {
        "serverUrl": server_url.rstrip("/"),
        "empCode": emp_code,
        "deviceId": data["deviceId"],
        "deviceToken": data["deviceToken"],
        "heartbeatIntervalSec": data.get("heartbeatIntervalSec", 180),
    }

    save_config(config)
    log.info("Enrolled successfully! Device ID: %s", config["deviceId"])
    return config


# ─── GUI Enrollment Dialog ───────────────────────────────────────

def gui_enroll():
    """Show a GUI dialog for first-time enrollment. Returns config or None."""
    result = {"config": None}

    root = tk.Tk()
    root.title("GDS Attendance Agent — Setup")
    root.overrideredirect(False)
    root.resizable(False, False)
    root.configure(bg="#000000")
    root.attributes("-topmost", True)

    W, H = 460, 520
    root.geometry(f"{W}x{H}")
    root.update_idletasks()
    x = (root.winfo_screenwidth() - W) // 2
    y = (root.winfo_screenheight() - H) // 2
    root.geometry(f"{W}x{H}+{x}+{y}")

    root.grid_rowconfigure(0, weight=1)
    root.grid_columnconfigure(0, weight=1)
    outer = tk.Frame(root, bg="#3b82f6", padx=2, pady=2)
    outer.grid(row=0, column=0, sticky="nsew")
    card = tk.Frame(outer, bg="#0a0a0a", padx=2, pady=2)
    card.pack(fill="both", expand=True)

    header = tk.Frame(card, bg="#020617", height=88)
    header.pack(fill="x")
    header.pack_propagate(False)
    hc = tk.Frame(header, bg="#020617")
    hc.pack(expand=True, padx=24, pady=18)
    try:
        logo_path = resource_path("gds.png")
        logo_img = tk.PhotoImage(file=logo_path)
        logo_img = logo_img.subsample(max(1, logo_img.width() // 72), max(1, logo_img.width() // 72))
        root._logo = logo_img
        tk.Label(hc, image=logo_img, bg="#020617").pack(side="left", padx=(0, 18))
    except Exception:
        pass
    tb = tk.Frame(hc, bg="#020617")
    tb.pack(side="left")
    tk.Label(tb, text="Global Digital Solutions", font=("Segoe UI", 16, "bold"),
             fg="white", bg="#020617").pack(anchor="w")
    tk.Label(tb, text="Device Registration", font=("Segoe UI", 10),
             fg="#3b82f6", bg="#020617").pack(anchor="w", pady=(2, 0))

    body = tk.Frame(card, bg="#0a0a0a", padx=28, pady=28)
    body.pack(fill="both", expand=True)

    tk.Label(body, text="Employee Code", font=("Segoe UI", 11, "bold"),
             bg="#0a0a0a", fg="#e2e8f0").pack(anchor="w")
    tk.Label(body, text="Enter the code assigned by HR (e.g. EMP001)",
             font=("Segoe UI", 9), fg="#64748b", bg="#0a0a0a").pack(anchor="w", pady=(0, 6))
    emp_var = tk.StringVar()
    emp_frame = tk.Frame(body, bg="#3b82f6", padx=2, pady=2)
    emp_frame.pack(fill="x", pady=(0, 20))
    emp_entry = tk.Entry(emp_frame, textvariable=emp_var,
                         font=("Segoe UI", 12),
                         bg="#1e293b", fg="#f1f5f9", insertbackground="#3b82f6",
                         relief="flat", borderwidth=0)
    emp_entry.pack(fill="x", ipady=12, padx=14, pady=4)

    tk.Label(body, text="Server URL", font=("Segoe UI", 11, "bold"),
             bg="#0a0a0a", fg="#e2e8f0").pack(anchor="w")
    tk.Label(body, text="Attendance portal address",
             font=("Segoe UI", 9), fg="#64748b", bg="#0a0a0a").pack(anchor="w", pady=(0, 6))
    url_var = tk.StringVar(value="https://ams.globaldigitsolutions.com")
    url_frame = tk.Frame(body, bg="#3b82f6", padx=2, pady=2)
    url_frame.pack(fill="x", pady=(0, 20))
    url_entry = tk.Entry(url_frame, textvariable=url_var,
                         font=("Segoe UI", 12),
                         bg="#1e293b", fg="#f1f5f9", insertbackground="#3b82f6",
                         relief="flat", borderwidth=0)
    url_entry.pack(fill="x", ipady=12, padx=14, pady=4)

    status = tk.Label(body, text="", font=("Segoe UI", 10), bg="#0a0a0a")
    status.pack(pady=(0, 14))

    def on_connect():
        emp = emp_var.get().strip()
        url = url_var.get().strip()
        if not emp:
            status.config(text="Please enter your employee code.", fg="#ef4444")
            return
        if not url:
            status.config(text="Please enter the server URL.", fg="#ef4444")
            return
        status.config(text="Connecting...", fg="#3b82f6")
        btn.config(state="disabled")
        root.update()
        try:
            config = enroll(url, emp)
            result["config"] = config
            status.config(text="Success! Starting agent...", fg="#22c55e")
            root.after(800, root.quit)
        except requests.ConnectionError:
            status.config(text="Cannot connect. Check your network.", fg="#ef4444")
            btn.config(state="normal")
        except Exception as e:
            status.config(text=f"Error: {str(e)[:60]}", fg="#ef4444")
            btn.config(state="normal")

    btn = tk.Button(body, text="Connect & Start",
                    font=("Segoe UI", 12, "bold"),
                    bg="#22c55e", fg="#020617",
                    activebackground="#16a34a", activeforeground="#020617",
                    relief="flat", padx=28, pady=12, cursor="hand2",
                    command=on_connect, highlightthickness=0, bd=0)
    btn.pack(fill="x")
    btn.bind("<Enter>", lambda e: btn.config(bg="#16a34a"))
    btn.bind("<Leave>", lambda e: btn.config(bg="#22c55e"))
    root.bind("<Return>", on_connect)

    footer = tk.Frame(card, bg="#0f172a", height=40)
    footer.pack(fill="x")
    footer.pack_propagate(False)
    tk.Label(footer, text=f"Version {AGENT_VERSION}",
             font=("Segoe UI", 9), fg="#64748b", bg="#0f172a").pack(expand=True)

    root.protocol("WM_DELETE_WINDOW", root.quit)
    emp_entry.focus_set()
    root.mainloop()

    try:
        root.destroy()
    except Exception:
        pass

    return result["config"]
