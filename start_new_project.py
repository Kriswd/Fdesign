import os
import subprocess
import time
import webbrowser
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent


def choose_mode():
    print("请选择启动模式：")
    print("1) 普通用户端")
    print("2) 模板管理端")
    choice = input("输入数字并回车: ").strip()
    if choice == "2":
        return "admin"
    if choice == "1":
        return "user"
    print("输入无效，默认启动普通用户端")
    return "user"


def get_target_url(mode):
    base = "http://localhost:5173"
    if mode == "admin":
        return f"{base}/admin"
    return base


def resolve_npm_executable():
    # Windows specific: prioritize .cmd or .exe
    if os.name == 'nt':
        candidates = ["npm.cmd", "npm.exe"]
    else:
        candidates = ["npm"]

    env_path = os.environ.get("PATH", "")
    for name in candidates:
        for path_dir in env_path.split(os.pathsep):
            full_path = Path(path_dir).joinpath(name)
            if full_path.is_file():
                return str(full_path)
    
    # Fallback: try shutil.which if available or just return "npm" and hope for the best with shell=True if we were using it (but we aren't)
    # If strictly not found in PATH, try common locations? No, user should have it in PATH.
    # Last ditch: if we are on windows and didn't find npm.cmd, maybe user only has node in path?
    # Let's trust PATH first.
    
    raise RuntimeError(f"未找到可执行的 npm ({', '.join(candidates)})，请确认已安装 Node.js 并将 npm 加入 PATH。")


def start_process(npm_args):
    npm_exe = resolve_npm_executable()
    command = [npm_exe] + list(npm_args)
    return subprocess.Popen(command, cwd=str(PROJECT_DIR))


def main():
    mode = choose_mode()
    processes = []
    try:
        server_proc = start_process(["run", "server"])
        processes.append(server_proc)
        time.sleep(1)
        dev_proc = start_process(["run", "dev"])
        processes.append(dev_proc)
        time.sleep(3)
        url = get_target_url(mode)
        print(f"正在打开浏览器: {url}")
        webbrowser.open(url)
        print("前后端已启动，按 Ctrl+C 停止所有进程。")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("收到中断信号，正在停止所有进程...")
    except RuntimeError as e:
        print(f"[错误] {e}")
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            if p.poll() is None:
                try:
                    p.wait(timeout=5)
                except Exception:
                    p.kill()


if __name__ == "__main__":
    main()
