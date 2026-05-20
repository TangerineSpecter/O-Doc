# utils/web_parser.py
import requests
from bs4 import BeautifulSoup
from markdownify import MarkdownConverter
from readability import Document


REQUEST_TIMEOUT = 15


class WebParserError(Exception):
    """Raised when a page is reachable but cannot be parsed into article content."""


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


def looks_like_login_or_block_page(html):
    html_lower = (html or '').lower()
    markers = [
        'login_redirect',
        'suite/passport',
        'captcha',
        'verify',
        'no_permission',
        '请登录',
        '登录',
    ]
    return any(marker in html_lower for marker in markers)


def parse_web_content(url):
    """
    解析网页并返回 (title, markdown_content)
    """
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()

        if looks_like_login_or_block_page(response.text):
            raise WebParserError("页面需要登录、授权、验证或浏览器动态渲染后才能读取正文内容。")

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

        if not markdown_content.strip():
            raise WebParserError("未能从页面中提取到正文内容，可能是动态渲染页面。")

        return title, markdown_content

    except Exception as e:
        print(f"Error parsing URL {url}: {e}")
        raise e
