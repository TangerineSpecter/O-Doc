"""Explicit HTTP reads for domain round-trip tests that inspect complete fixtures.

This is test support, never a browser/production fallback. Reading contract tests
exercise each bounded response directly without this helper.
"""
def read_fixture(client, url):
    def get(path):
        response=client.get(path)
        assert response.status_code == 200, response.data
        return response.json()['data']
    overview=get(url)
    def all_bodies(resource, body_path=None):
        offset=0
        result=[]
        while True:
            page=get(f'{url}reading/{resource}/?offset={offset}&limit=20')
            result.extend(get(f"{url}{body_path or 'reading/'+resource}/{row['id']}/") for row in page['items'])
            if not page['hasMore']: return result
            offset+=len(page['items'])
    return {**overview, 'reports':all_bodies('reports'), 'sources':all_bodies('sources'), 'runs':all_bodies('runs','runs')}
