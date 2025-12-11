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

    print("━" * 50 + "\n")
    print(data)


if __name__ == "__main__":
    search_player("箱山遥人")
    # search_player("清宫幸太郎")
    # search_player("末吉良丞")
    # search_player("宗山塁")
    # search_player("横山悠")
    # search_player("织田翔希")
    # search_player("石田雄星")