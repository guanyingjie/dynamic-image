import requests
from bs4 import BeautifulSoup
from urllib.parse import quote
import re
import time
import json

# ================= 配置区 =================
# 你的 Cloudflare Worker 代理地址
WORKER_URL = "https://search.yingjie.icu"


# =========================================

class KyurekiUltimateSpider:
    def __init__(self):
        # 伪装头：模拟 Googlebot，这是穿透 403 最有效的伪装之一
        self.headers = {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

    def _request_via_worker(self, target_url):
        """通过 Worker 代理发送请求"""
        proxy_url = f"{WORKER_URL}?url={quote(target_url)}"
        try:
            return requests.get(proxy_url, headers=self.headers, timeout=25)
        except Exception as e:
            print(f"[!] Worker 请求异常: {e}")
            return None

    def search_player_id(self, name):
        """步骤1: 通过 Yahoo Japan 搜索球员 ID"""
        print(f"[*] 正在全网搜索: {name} ...")
        # Yahoo JP 对球历网的收录非常全
        query = f"site:kyureki.com {name}"
        search_url = f"https://search.yahoo.co.jp/search?p={quote(query)}"

        # 搜索也走代理，防止 Yahoo 封锁本地 IP
        resp = self._request_via_worker(search_url)

        if not resp or resp.status_code != 200:
            print("[-] 搜索请求失败 (可能 Worker 暂时不可用)。")
            return None

        soup = BeautifulSoup(resp.text, 'html.parser')
        # 查找包含 /player/ 的链接
        for a in soup.find_all('a', href=True):
            if "kyureki.com/player/" in a['href']:
                # 清洗 URL
                clean_url = a['href'].split('?')[0]
                if clean_url.startswith("http:"):
                    clean_url = clean_url.replace("http:", "https:")
                print(f"[+] 找到球员主页: {clean_url}")
                return clean_url

        print("[-] 未找到该球员的球历网页面。")
        return None

    def get_player_data(self, url):
        """步骤2: 智能获取数据 (优先最新，失败则通过时光机)"""

        # --- 策略 A: 尝试获取最新数据 ---
        print("[*] 策略 A: 尝试通过代理获取最新数据...")
        resp = self._request_via_worker(url)

        # 检查是否成功 (有些 403 会返回 200 但内容是 Access Denied)
        if resp and resp.status_code == 200 and "Forbidden" not in resp.text and "Access Denied" not in resp.text:
            print("[+] 成功连接实时网站！")
            self.parse_html(resp.text, source="实时数据")
            return

        # --- 策略 B: 失败，切换到时光机 ---
        print(f"[-] 策略 A 遭遇防火墙拦截 (状态码: {resp.status_code if resp else 'Error'})")
        print("[*] 策略 B: 启动 Archive.org 时光机救援...")
        self.get_from_archive(url)

    def get_from_archive(self, original_url):
        """从 Archive.org 获取最近的快照"""
        # 查询最近的快照 API
        api_url = f"https://archive.org/wayback/available?url={original_url}"

        try:
            # 这个请求可以直接本地发，Archive.org 不怎么封 IP
            api_resp = requests.get(api_url, timeout=15)
            data = api_resp.json()

            if not data.get('archived_snapshots'):
                print("[-] 遗憾：Archive.org 尚未收录该页面。")
                return

            snapshot_url = data['archived_snapshots']['closest']['url']
            print(f"[+] 找到历史快照: {snapshot_url}")

            # 下载快照内容
            content_resp = requests.get(snapshot_url, headers=self.headers, timeout=30)
            if content_resp.status_code == 200:
                self.parse_html(content_resp.text, source="历史快照")
            else:
                print(f"[!] 快照下载失败: {content_resp.status_code}")

        except Exception as e:
            print(f"[!] Archive 步骤出错: {e}")

    def parse_html(self, html, source="未知"):
        """核心解析器: 兼容新旧两种 HTML 结构"""
        soup = BeautifulSoup(html, 'html.parser')

        # 1. 提取名字
        name_tag = soup.find('h1')
        if name_tag:
            name = name_tag.get_text(strip=True)
        else:
            name = soup.title.string if soup.title else "未知球员"

        print("\n" + "━" * 50)
        print(f"⚾  球员档案: {name}")
        print(f"   (数据来源: {source})")
        print("━" * 50)

        # 2. 遍历表格行
        rows = soup.find_all('tr')
        resume_data = None  # 暂存履历

        for row in rows:
            key = None
            val_cell = None

            # --- 适配逻辑 ---
            # 情况 1: 标准结构 <th>Key</th> <td>Value</td>
            if row.find('th'):
                key = row.find('th').get_text(strip=True)
                val_cell = row.find('td')

            # 情况 2: Archive/旧版结构 <td><b>Key</b></td> <td>Value</td>
            else:
                cells = row.find_all('td')
                if len(cells) >= 2 and cells[0].find('b'):
                    key = cells[0].find('b').get_text(strip=True)
                    val_cell = cells[1]

            # --- 数据处理 ---
            if key and val_cell:
                # 排除 Archive 注入的干扰行
                if "Capture" in key or "Wayback" in key:
                    continue

                # A. 处理 "全国大会" 或 "战绩" (多行列表)
                if "全国大会" in key or "戦績" in key:
                    print(f"【 {key} 】")
                    # get_text(separator="\n") 自动把 <br> 变成换行
                    lines = val_cell.get_text(separator="\n").split('\n')
                    for line in lines:
                        if line.strip():
                            print(f"  • {line.strip()}")

                # B. 处理 "履历" (暂存，最后画图)
                elif "経歴" in key:
                    resume_data = val_cell.get_text(strip=True)

                # C. 普通字段
                else:
                    val = val_cell.get_text(strip=True)
                    # 只打印非空的有效信息
                    if val:
                        # 全角空格对齐
                        print(f"{key.ljust(6, chr(12288))}: {val}")

        print("-" * 50)

        # 3. 绘制履历路径图
        if resume_data:
            print("【 📅 职业履历路径 】")
            # 拆分路径 (兼容箭头 > ＞ 和空格)
            parts = re.split(r'[>＞\s　]+', resume_data)
            parts = [p for p in parts if p]

            if parts:
                print("START")
                for i, part in enumerate(parts):
                    prefix = "  ▼" if i > 0 else "  │"
                    # 这里逻辑微调，确保箭头在每行之间
                    if i > 0:
                        print(f"  ▼")
                    print(f"  │  {part}")
                print("END")
            else:
                print(resume_data)

        print("━" * 50 + "\n")


# --- 主程序入口 ---
if __name__ == "__main__":
    spider = KyurekiUltimateSpider()

    # 在这里输入你想搜索的球员名字
    # 建议使用日文汉字以提高准确率
    target_name = "宗山塁"

    # 运行
    player_url = spider.search_player_id(target_name)

    if player_url:
        spider.get_player_data(player_url)