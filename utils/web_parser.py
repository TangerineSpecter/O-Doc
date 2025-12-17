# utils/web_parser.py
import requests
from bs4 import BeautifulSoup
from markdownify import MarkdownConverter
from readability import Document


class CSDNConverter(MarkdownConverter):
    def convert_pre(self, el, text, convert_as_inline=False, **kwargs):
        lang = ''
        code_tag = el.find('code')
        if code_tag and code_tag.has_attr('class'):
            classes = code_tag['class']
            if isinstance(classes, str):
                classes = [classes]
            for c in classes:
                if c.startswith('language-'):
                    lang = c.replace('language-', '')
                    break
        return f'\n```{lang}\n{text.strip()}\n```\n'


def clean_code_blocks(soup):
    for pre in soup.find_all('pre'):
        code_tag = pre.find('code')
        if code_tag:
            classes = code_tag.get('class', [])
            lang = ''
            for c in classes:
                if c.startswith('language-'):
                    lang = c.replace('language-', '')
                    break
            code_content = code_tag.get_text()
            new_pre = soup.new_tag("pre")
            new_code = soup.new_tag("code")
            if lang:
                new_code['class'] = f"language-{lang}"
            new_code.string = code_content
            new_pre.append(new_code)
            pre.replace_with(new_pre)
    return soup


def parse_web_content(url):
    """
    解析网页并返回 (title, markdown_content)
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        # 提取正文
        doc = Document(response.text)
        title = doc.title()
        summary_html = doc.summary()

        # 清洗
        soup = BeautifulSoup(summary_html, 'html.parser')
        soup = clean_code_blocks(soup)

        # 转换 Markdown
        converter = CSDNConverter(heading_style="ATX")
        markdown_content = converter.convert_soup(soup)

        # 简单的标题清理
        if not title:
            title = "未命名网页"

        return title, markdown_content

    except Exception as e:
        print(f"Error parsing URL {url}: {e}")
        raise e
