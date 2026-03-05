import os
import agent_core.config_loader

agent_core.config_loader.ensure_config()

from agent_core.runner import run


if __name__ == "__main__":
    if not (os.environ.get("EMP_CODE") or "").strip():
        exit(1)
    run()
