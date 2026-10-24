"""结构字段使用驼峰，目录/图鉴字典中的稳定ID保持原样。"""
from djangorestframework_camel_case.render import CamelCaseJSONRenderer


class FishingJSONRenderer(CamelCaseJSONRenderer):
    def render(self, data, *args, **kwargs):
        identifiers = set(self.json_underscoreize.get('ignore_keys') or ())

        def collect(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in ('spots', 'fish', 'baits', 'discovery') and isinstance(child, dict):
                        identifiers.update(child)
                    collect(child)
            elif isinstance(value, (list, tuple)):
                for child in value:
                    collect(child)

        collect(data)
        self.json_underscoreize = {**self.json_underscoreize, 'ignore_keys': tuple(identifiers)}
        return super().render(data, *args, **kwargs)
