from django.test import SimpleTestCase

from .parsers import split_text


class ChapterDetectionTests(SimpleTestCase):
    def parse(self, text):
        chapters, fallback = split_text(text, {'format': 'txt', 'offset': 0}, '测试书籍')
        self.assertEqual(''.join(c.text for c in chapters), text)
        for chapter in chapters:
            start = chapter.locator['offset']
            self.assertEqual(text[start:start + len(chapter.text)], chapter.text)
        return chapters, fallback

    def test_prose_and_numbered_scenes_are_not_chapters(self):
        body = '人物在旧宅寻找线索。\n' * 15
        text = '第一章\n' + body + '第一部影片结束了，众人离开。\n6   \n' + body + '第二章\n' + body
        chapters, fallback = self.parse(text)
        self.assertFalse(fallback)
        self.assertEqual([c.title for c in chapters], ['第一章', '第二章'])

    def test_number_cannot_consume_following_line(self):
        text = '6\n短发女子走出房间。\n' * 30
        chapters, fallback = self.parse(text)
        self.assertTrue(fallback)
        self.assertEqual(len(chapters), 1)

    def test_part_and_section_do_not_split_chapter_hierarchy(self):
        body = '这是正文。\n' * 30
        text = '第一部\n第一章 起点\n第一节\n' + body + '第二章 转折\n第二节\n' + body
        chapters, _ = self.parse(text)
        self.assertEqual([c.title for c in chapters], ['书前内容', '第一章 起点', '第二章 转折'])

    def test_number_only_chapters_require_consistent_sequence(self):
        body = '这是正文。\n' * 30
        for delimiter in ('\n', '\r\n'):
            text = delimiter.join(str(i) + '   ' + delimiter + body for i in range(1, 4))
            chapters, fallback = self.parse(text)
            self.assertFalse(fallback)
            self.assertEqual([c.title for c in chapters], ['1', '2', '3'])
        _, fallback = self.parse('1\n' + body + '2\n' + body + '1\n' + body)
        self.assertTrue(fallback)

    def test_english_and_numbered_titles_still_work(self):
        body = 'The witness recalled an important event.\n' * 8
        for titles in (['Chapter I: Arrival', 'Chapter II: Evidence'], ['1. 起点', '2. 转折']):
            chapters, fallback = self.parse(''.join(title + '\n' + body for title in titles))
            self.assertFalse(fallback)
            self.assertEqual([c.title for c in chapters], titles)

    def test_contents_and_short_final_chapter_preserve_all_text(self):
        text = '第一章\n第二章\n目录结束\n第一章\n' + '这是正文。\n' * 30 + '第二章\n完。'
        chapters, _ = self.parse(text)
        self.assertEqual([c.title for c in chapters], ['书前内容', '第一章', '第二章'])
