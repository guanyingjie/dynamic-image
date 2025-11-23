from curl_cffi import requests
import sys
import json
import sqlite3
from pathlib import Path
from deep_translator import GoogleTranslator

# 配置文件路径
JSON_FILE = "images/2025-11-21.json"
DB_FILE = "video_download.db"
OUTPUT_DIR = "downloaded_videos"

# 模拟浏览器的 Headers (Sec-Fetch 系列头对于视频请求很重要)
headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.midjourney.com/',
    'Origin': 'https://www.midjourney.com',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'Range': 'bytes=0-',  # 许多视频服务器要求这个头
}


def init_database():
    """初始化数据库，创建表记录视频下载序列"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 创建表：video_sequence 用于记录当前下载到第几个视频
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_sequence (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            current_index INTEGER NOT NULL DEFAULT 0,
            video_id TEXT,
            prompt_content TEXT,
            prompt_content_cn TEXT
        )
    ''')
    
    # 创建表：downloaded_videos 用于记录所有已下载的视频信息
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS downloaded_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL UNIQUE,
            prompt_content TEXT,
            prompt_content_cn TEXT,
            download_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_path TEXT
        )
    ''')
    
    # 检查是否需要添加新列（兼容旧版本数据库）
    cursor.execute("PRAGMA table_info(video_sequence)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'video_id' not in columns:
        cursor.execute('ALTER TABLE video_sequence ADD COLUMN video_id TEXT')
        print("✅ 已添加 video_id 列")
    
    if 'prompt_content' not in columns:
        cursor.execute('ALTER TABLE video_sequence ADD COLUMN prompt_content TEXT')
        print("✅ 已添加 prompt_content 列")
    
    if 'prompt_content_cn' not in columns:
        cursor.execute('ALTER TABLE video_sequence ADD COLUMN prompt_content_cn TEXT')
        print("✅ 已添加 prompt_content_cn 列（中文）")
    
    # 如果表是空的，插入初始记录
    cursor.execute('SELECT COUNT(*) FROM video_sequence')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO video_sequence (id, current_index, video_id, prompt_content, prompt_content_cn) VALUES (1, 0, NULL, NULL, NULL)')
    
    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")


def get_current_sequence():
    """获取当前下载序列号"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT current_index FROM video_sequence WHERE id = 1')
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else 0


def get_last_downloaded_info():
    """获取最后下载的视频信息"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT current_index, video_id, prompt_content, prompt_content_cn FROM video_sequence WHERE id = 1')
    result = cursor.fetchone()
    conn.close()
    if result:
        return {
            'index': result[0],
            'video_id': result[1],
            'prompt_content': result[2],
            'prompt_content_cn': result[3]
        }
    return None


def translate_to_chinese(text):
    """将英文文本翻译为中文"""
    if not text:
        return None
    
    try:
        print(f"🌐 正在翻译 Prompt 为中文...")
        # 使用 Google 翻译，从英文翻译到简体中文
        translator = GoogleTranslator(source='en', target='zh-CN')
        
        # 如果文本过长，分段翻译（Google Translate 有字符限制）
        max_length = 4500
        if len(text) <= max_length:
            translated = translator.translate(text)
        else:
            # 分段翻译
            segments = []
            sentences = text.split('. ')
            current_segment = ""
            
            for sentence in sentences:
                if len(current_segment) + len(sentence) + 2 <= max_length:
                    current_segment += sentence + '. '
                else:
                    if current_segment:
                        segments.append(current_segment.strip())
                    current_segment = sentence + '. '
            
            if current_segment:
                segments.append(current_segment.strip())
            
            # 翻译每个段落
            translated_segments = []
            for segment in segments:
                translated_segments.append(translator.translate(segment))
            
            translated = ' '.join(translated_segments)
        print(f"✅ 翻译完成")
        return translated
    
    except Exception as e:
        print(f"⚠️  翻译失败: {e}")
        print(f"   将使用原文本")
        return text  # 如果翻译失败，返回原文本


def save_downloaded_video(video_id, prompt_content, prompt_content_cn, file_path):
    """保存已下载的视频信息到 downloaded_videos 表"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO downloaded_videos (video_id, prompt_content, prompt_content_cn, file_path)
            VALUES (?, ?, ?, ?)
        ''', (video_id, prompt_content, prompt_content_cn, file_path))
        conn.commit()
        print(f"✅ 已保存视频记录到数据库: {video_id}")
    except sqlite3.IntegrityError:
        print(f"⚠️  视频 {video_id} 已存在于数据库中")
    finally:
        conn.close()


def update_sequence(video_id, prompt_content, prompt_content_cn):
    """更新序列号，+1，并记录视频ID、Prompt和中文Prompt"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE video_sequence 
        SET current_index = current_index + 1,
            video_id = ?,
            prompt_content = ?,
            prompt_content_cn = ?
        WHERE id = 1
    ''', (video_id, prompt_content, prompt_content_cn))
    conn.commit()
    conn.close()


def load_video_data():
    """从 JSON 文件加载视频数据"""
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ 成功加载 {len(data)} 个视频信息")
        return data
    except FileNotFoundError:
        print(f"❌ 找不到文件: {JSON_FILE}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析错误: {e}")
        sys.exit(1)


def download_video_by_id(video_id, prompt_content):
    """根据视频 ID 下载视频，返回 (成功状态, 文件路径)"""
    video_url = f"https://cdn.midjourney.com/video/{video_id}/0.mp4"
    output_filename = Path(OUTPUT_DIR) / f"{video_id}.mp4"
    
    # 创建输出目录
    Path(OUTPUT_DIR).mkdir(exist_ok=True)
    
    print(f"🚀 正在使用 TLS 伪装 (Chrome) 下载视频 ID: {video_id}")
    print(f"📝 Prompt: {prompt_content[:100]}..." if len(prompt_content) > 100 else f"📝 Prompt: {prompt_content}")
    
    try:
        # 使用 impersonate="chrome120" 来模拟真实浏览器的 TLS 指纹
        response = requests.get(
            video_url,
            headers=headers,
            impersonate="chrome120",
            stream=True,
            timeout=30
        )

        if response.status_code == 403:
            print("❌ 403 Forbidden - 可能该链接已失效或触发了风控")
            return False, None
        
        if response.status_code == 404:
            print("❌ 404 Not Found - 视频不存在")
            return False, None

        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        print(f"✅ 连接成功！文件大小: {total_size / (1024 * 1024):.2f} MB")

        with open(output_filename, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = int(50 * downloaded / total_size)
                        sys.stdout.write(
                            f"\r[{'=' * percent}{' ' * (50 - percent)}] {int(downloaded / total_size * 100)}%")
                        sys.stdout.flush()

        print(f"\n🎉 下载完成!")
        print(f"📁 文件名: {output_filename.name}")
        print(f"📝 Prompt: {prompt_content}")
        print("-" * 80)
        return True, str(output_filename)

    except Exception as e:
        print(f"\n❌ 下载失败: {e}")
        return False, None


def main():
    """主函数 - 一次下载5个视频"""
    print("=" * 80)
    print("🎬 Midjourney 视频批量下载器")
    print("=" * 80)
    
    # 1. 初始化数据库
    init_database()
    
    # 2. 加载视频数据
    video_data = load_video_data()
    
    # 3. 获取当前序列号和上次下载信息
    current_index = get_current_sequence()
    print(f"📊 当前序列号: {current_index}")
    
    # 显示上次下载的视频信息
    last_info = get_last_downloaded_info()
    if last_info and last_info['video_id'] and current_index > 0:
        print(f"📝 上次下载: {last_info['video_id']}")
        
        # 显示英文 Prompt 预览
        prompt_preview = last_info['prompt_content'][:60] + "..." if last_info['prompt_content'] and len(last_info['prompt_content']) > 60 else last_info['prompt_content']
        if prompt_preview:
            print(f"   英文: {prompt_preview}")
        
        # 显示中文 Prompt 预览
        prompt_cn_preview = last_info['prompt_content_cn'][:60] + "..." if last_info.get('prompt_content_cn') and len(last_info['prompt_content_cn']) > 60 else last_info.get('prompt_content_cn')
        if prompt_cn_preview:
            print(f"   中文: {prompt_cn_preview}")
    
    # 4. 检查是否已经下载完所有视频
    if current_index >= len(video_data):
        print(f"✅ 所有视频已下载完成! (共 {len(video_data)} 个)")
        return
    
    # 5. 批量下载5个视频
    batch_size = 5
    total_videos = len(video_data)
    videos_to_download = min(batch_size, total_videos - current_index)
    
    print(f"🎯 准备下载 {videos_to_download} 个视频 (从第 {current_index + 1} 到第 {current_index + videos_to_download})")
    print("=" * 80)
    
    success_count = 0
    failed_count = 0
    
    for i in range(videos_to_download):
        video_index = current_index + i
        video_obj = video_data[video_index]
        video_id = video_obj.get('id')
        prompt_content = video_obj.get('prompt', {}).get('decodedPrompt', [{}])[0].get('content', 'No prompt')
        
        if not video_id:
            print(f"❌ 无法获取视频 {video_index + 1} 的 ID，跳过")
            failed_count += 1
            continue
        
        print(f"\n📹 [{i + 1}/{videos_to_download}] 下载第 {video_index + 1}/{total_videos} 个视频")
        print("=" * 80)
        
        # 下载视频
        success, file_path = download_video_by_id(video_id, prompt_content)
        
        # 如果下载成功，翻译 Prompt 并保存到数据库
        if success:
            # 翻译 Prompt 为中文
            # prompt_content_cn = translate_to_chinese(prompt_content)

            prompt_content_cn = "skip"
            
            # 保存到 downloaded_videos 表
            save_downloaded_video(video_id, prompt_content, prompt_content_cn, file_path)
            
            # 更新序列号（记录最新下载的视频）
            update_sequence(video_id, prompt_content, prompt_content_cn)
            
            # 显示翻译后的中文 Prompt
            print(f"📝 中文 Prompt: {prompt_content_cn}")
            print("-" * 80)
            
            success_count += 1
        else:
            print("⚠️  下载失败，跳过该视频")
            failed_count += 1
            # 即使失败也更新序列号，避免重复尝试同一个视频
            update_sequence(video_id, prompt_content, None)
    
    # 6. 显示下载统计
    print("\n" + "=" * 80)
    print("📊 下载统计:")
    print(f"   ✅ 成功: {success_count} 个")
    print(f"   ❌ 失败: {failed_count} 个")
    
    new_index = get_current_sequence()
    print(f"   📈 总进度: {new_index}/{total_videos} ({int(new_index/total_videos*100)}%)")
    
    if new_index < total_videos:
        print(f"   💡 还有 {total_videos - new_index} 个视频待下载")
    else:
        print("   🎉 所有视频已下载完成！")
    print("=" * 80)


if __name__ == "__main__":
    main()