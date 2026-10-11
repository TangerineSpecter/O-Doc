"""Ordered author exports; published choices use frozen manuscript metadata."""
from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
from .models import Chapter
from .chapters import revision_for


def plain_text(content):
    soup = BeautifulSoup(MarkdownIt('commonmark').render(content), 'html.parser')
    for element in soup(['script', 'style']):
        element.decompose()
    for element in soup.find_all(['br', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'pre', 'blockquote']):
        if element.name == 'br':
            element.replace_with('\n')
        else:
            element.append('\n\n')
    return soup.get_text().strip()


def export_book(project, choice, format):
    parts = [('# ' if format == 'md' else '') + project.anthology.title]
    previous_volume = None
    for chapter in Chapter.objects.filter(project=project, is_valid=True):
        revision = revision_for(chapter, getattr(chapter, choice + '_id'))
        if not revision:
            continue
        if revision.volume and revision.volume != previous_volume:
            parts.append(('## ' if format == 'md' else '') + revision.volume)
        previous_volume = revision.volume
        parts.append(('### ' if format == 'md' else '') + revision.title)
        parts.append(revision.content if format == 'md' else plain_text(revision.content))
    return '\n\n'.join(parts)
