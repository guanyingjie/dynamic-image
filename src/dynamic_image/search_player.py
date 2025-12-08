import requests

# 你的 Worker 地址
WORKER_API = "https://search.yingjie.icu"  # 确保这里不需要加 /proxy 等路径，直接根路径即可


def search_player(name):
    print(f"[*] 正在请求云端 API 查询: {name} ...")

    try:
        # 极简调用：直接传参
        response = requests.get(WORKER_API, params={"name": name}, timeout=30)

        if response.status_code == 200:
            data = response.json()
            display_result(data)
        else:
            print(f"[!] API 错误: {response.status_code}")
            print(f"    信息: {response.text}")

    except Exception as e:
        print(f"[!] 网络请求失败: {e}")


def display_result(data):
    """
    负责漂亮地打印 JSON 数据
    """
    print("\n" + "━" * 50)
    print(f"⚾  {data.get('name')}  ⚾")
    print(f"   (来源: {data.get('source')} | URL: {data.get('url')})")
    print("━" * 50)

    # 1. 打印基本资料 (Profile)
    if 'profile' in data:
        for k, v in data['profile'].items():
            # ljust 对齐需要考虑到中文宽度，这里简单处理，你可以优化
            print(f"{k}: {v}")

    print("-" * 50)

    # 2. 打印履历/全国大会 (History)
    if data.get('history') and len(data['history']) > 0:
        print("【 🏆 参赛/履历记录 】")
        for item in data['history']:
            print(f"  • {item}")

    # 3. 打印原始履历 (Raw Resume) 并尝试画图
    elif data.get('raw_resume'):
        print("【 📅 职业路径 】")
        parts = data['raw_resume'].replace("＞", ">").split(">")
        for i, part in enumerate(parts):
            arrow = "  ▼" if i > 0 else "START"
            if i > 0: print(arrow)
            print(f"  │  {part.strip()}")

    print("━" * 50 + "\n")


if __name__ == "__main__":
    # 直接输入名字即可
    search_player("佐藤龍月")