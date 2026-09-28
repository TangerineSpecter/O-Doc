from types import SimpleNamespace
from django.test import SimpleTestCase
from .image_generation_options import COMMON_IMAGE_RATIOS, resolve_image_generation_request, serialize_image_generation_options


class ImageGenerationDimensionsTests(SimpleTestCase):
    def model(self, name):
        return SimpleNamespace(name=name, provider=SimpleNamespace(type='Grsai'))

    def test_gpt_2_fixed_1k_uses_its_own_dimensions(self):
        model = self.model('gpt-image-2')
        self.assertEqual(resolve_image_generation_request(model, {'aspect_ratio': '16:9', 'image_size': '1K'}, scene='generic'), {'aspectRatio': '1672x941', 'quality': 'auto'})
        with self.assertRaises(ValueError):
            resolve_image_generation_request(model, {'aspect_ratio': '16:9', 'image_size': '2K'}, scene='generic')

    def test_gpt_25_uses_pixel_dimensions_at_every_size(self):
        model = self.model('gpt-image-2.5')
        for size, expected in [('1K', '1280x720'), ('2K', '2048x1152'), ('4K', '3840x2160')]:
            self.assertEqual(resolve_image_generation_request(model, {'aspect_ratio': '16:9', 'image_size': size}, scene='generic'), {'aspectRatio': expected, 'quality': 'auto'})

    def test_nano_pro_keeps_separate_ratio_and_size(self):
        model = self.model('nano-banana-pro')
        for size in ['1K', '2K', '4K']:
            self.assertEqual(resolve_image_generation_request(model, {'aspect_ratio': '3:2', 'image_size': size}, scene='generic'), {'aspectRatio': '3:2', 'imageSize': size})

    def test_travel_and_mcp_offer_only_common_ratios(self):
        for name in ['gpt-image-2', 'gpt-image-2.5', 'nano-banana-pro']:
            for scene in ['generic', 'travel_photo']:
                options = serialize_image_generation_options(self.model(name), scene=scene)
                self.assertEqual([option['value'] for option in options['aspect_ratio_options']], list(COMMON_IMAGE_RATIOS))
                self.assertEqual(options['default_aspect_ratio'], '1:1')
                self.assertEqual([option['value'] for option in options['image_size_options']], ['1K'] if name == 'gpt-image-2' else ['1K', '2K', '4K'])
