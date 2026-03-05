"""
Load agent config from agent_config.ini beside the executable.
Sets os.environ so constants pick up values.
Shows first-run prompt if EMP_CODE is missing.
"""
import os
import sys


def _config_dir():
    """Directory containing the exe (or script) - for config file lookup."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _config_path():
    return os.path.join(_config_dir(), "agent_config.ini")


def load_config():
    """Load agent_config.ini and set environment variables."""
    import uuid
    config_path = _config_path()
    if not os.path.isfile(config_path):
        return

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            section = None
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("[") and line.endswith("]"):
                    section = line[1:-1].strip().lower()
                    continue
                if "=" in line and (section is None or section == "agent"):
                    key, _, val = line.partition("=")
                    key = key.strip().upper().replace("-", "_")
                    val = val.strip().strip('"').strip("'")
                    if key:
                        os.environ[key] = val
        # Ensure DEVICE_TOKEN exists for heartbeat API
        if not (os.environ.get("DEVICE_TOKEN") or "").strip():
            token = str(uuid.uuid4())
            os.environ["DEVICE_TOKEN"] = token
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                found = False
                for i, ln in enumerate(lines):
                    if ln.strip().upper().startswith("DEVICE_TOKEN="):
                        lines[i] = f"DEVICE_TOKEN={token}\n"
                        found = True
                        break
                if not found:
                    lines.append(f"DEVICE_TOKEN={token}\n")
                with open(config_path, "w", encoding="utf-8") as f:
                    f.writelines(lines)
            except Exception:
                pass
    except Exception:
        pass


def _prompt_first_run():
    """Show dialog to enter EMP_CODE and API URL, save to config."""
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        return False

    root = tk.Tk()
    root.title("GDS Agent - First Run Setup")
    root.geometry("420x220")
    root.configure(bg="#0a1424")
    root.resizable(False, False)

    frame = tk.Frame(root, bg="#0f1f35", padx=20, pady=20)
    frame.pack(fill="both", expand=True)

    tk.Label(frame, text="GDS Agent Setup", fg="white", bg="#0f1f35", font=("Segoe UI", 14, "bold")).pack(anchor="w", pady=(0, 12))

    tk.Label(frame, text="Employee Code (required)", fg="#d1d5db", bg="#0f1f35").pack(anchor="w")
    emp_entry = tk.Entry(frame, width=40)
    emp_entry.pack(fill="x", pady=(4, 10))

    tk.Label(frame, text="Portal API URL (e.g. http://localhost:3000)", fg="#d1d5db", bg="#0f1f35").pack(anchor="w")
    api_entry = tk.Entry(frame, width=40)
    api_entry.insert(0, "http://localhost:3000")
    api_entry.pack(fill="x", pady=(4, 14))

    def save_and_exit():
        import uuid
        emp = (emp_entry.get() or "").strip()
        api = (api_entry.get() or "").strip() or "http://localhost:3000"
        if not emp:
            messagebox.showerror("Required", "Employee Code is required.")
            return
        token = str(uuid.uuid4())
        os.environ["EMP_CODE"] = emp
        os.environ["AGENT_API_BASE"] = api.rstrip("/")
        os.environ["DEVICE_TOKEN"] = token
        config_path = _config_path()
        content = f"""[agent]
AGENT_API_BASE={api.rstrip("/")}
EMP_CODE={emp}
DEVICE_ID=whealthsvc-win
DEVICE_TOKEN={token}
HEARTBEAT_SECONDS=15
IDLE_THRESHOLD_SECONDS=180
"""
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            messagebox.showerror("Error", f"Could not save config: {e}")
            return
        root.destroy()

    tk.Button(frame, text="Save & Start Agent", bg="#10b981", fg="white", command=save_and_exit).pack(anchor="e", pady=4)
    root.mainloop()
    return bool(os.environ.get("EMP_CODE"))


def ensure_config():
    """Load config; if EMP_CODE missing, show first-run prompt."""
    load_config()
    if (os.environ.get("EMP_CODE") or "").strip():
        return
    _prompt_first_run()
