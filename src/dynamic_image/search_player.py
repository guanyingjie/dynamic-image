import requests
from bs4 import BeautifulSoup
from urllib.parse import quote
import time
import re

# ================= 配置区 =================
# 你的 Cloudflare Worker 代理地址
WORKER_URL = "https://search.yingjie.icu"


# =========================================

class KyurekiWorkerSpider:
    def __init__(self):
        # 伪装头，虽然走代理，但加上更保险
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def _request_via_worker(self, target_url):
        """
        通用方法：通过 Worker 发送请求
        """
        # 构造代理 URL: https://search.yingjie.icu?url=EncodedURL
        proxy_url = f"{WORKER_URL}?url={quote(target_url)}"
        try:
            # 增加 timeout 防止卡死
            response = requests.get(proxy_url, headers=self.headers, timeout=20)
            if response.status_code == 200:
                return response.text
            else:
                print(f"[!] 代理请求返回状态码: {response.status_code}")
                return None
        except Exception as e:
            print(f"[!] 代理请求异常: {e}")
            return None

    def step1_search_player(self, player_name):
        """
        替代方案：通过 Worker 访问 Yahoo Japan 搜索
        """
        print(f"[*] 正在通过代理搜索: {player_name} ...")

        # 使用 Yahoo Japan 搜索 site:kyureki.com
        # Yahoo JP 对日本棒球数据的收录通常比 Google/Bing 更好
        search_query = f"site:kyureki.com {player_name}"
        search_url = f"https://search.yahoo.co.jp/search?p={quote(search_query)}"

        html = self._request_via_worker(search_url)

        if not html:
            print("[-] 搜索页面获取失败。")
            return None

        # 解析 Yahoo 搜索结果
        soup = BeautifulSoup(html, 'html.parser')

        # 查找所有链接
        # 策略：寻找 href 中包含 'kyureki.com/player/' 的链接
        links = soup.find_all('a', href=True)

        for link in links:
            url = link['href']
            # Yahoo 有时会把链接再次重定向，但通常直接包含目标
            if "kyureki.com/player/" in url:
                # 清洗 URL，防止带有 Yahoo 的追踪参数
                clean_url = url.split('?')[0]
                text = link.get_text(strip=True)
                print(f"[+] 找到目标: {text}")
                print(f"    链接: {clean_url}")
                return clean_url

        print("[-] 未在 Yahoo 搜索结果中找到该球员的详情页。")
        return None

    def step2_get_details(self, player_url):
        """
        获取详情页并解析
        """
        print(f"[*] 正在获取详情: {player_url}")
        html = self._request_via_worker(player_url)

        if not html:
            return

        soup = BeautifulSoup(html, 'html.parser')

        # --- 解析展示 ---
        name_tag = soup.find('h1')
        player_name = name_tag.get_text(strip=True) if name_tag else "未知球员"

        print("\n" + "━" * 40)
        print(f"  ⚾  {player_name}  ⚾")
        print("━" * 40)

        rows = soup.find_all('tr')
        found_data = False
        for row in rows:
            th = row.find('th')
            td = row.find('td')
            if th and td:
                key = th.get_text(strip=True)
                val = td.get_text(strip=True)
                if key and val:
                    # 使用全角空格对齐，美观
                    print(f"{key.ljust(6, chr(12288))}: {val}")
                    found_data = True

        if not found_data:
            print("[!] 未解析到表格数据，可能页面结构已变或被反爬拦截。")

        print("━" * 40 + "\n")


# --- 执行 ---
if __name__ == "__main__":
    spider = KyurekiWorkerSpider()

    # 输入你想搜的名字
    target_name = "佐藤龍月"  # 尝试使用日文汉字，"佐藤龙月" 也可以试，但 "龍" 准确率更高

    # 1. 搜索
    url = spider.step1_search_player(target_name)

    # 2. 抓取
    if url:
        spider.step2_get_details(url)