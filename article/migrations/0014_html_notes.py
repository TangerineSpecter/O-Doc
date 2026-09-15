from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [('article', '0013_article_agent_post_category_articlepostrating'), ('article', '0010_image_photo_group'), ('assets', '0003_add_image_source_type')]
    operations = [
        migrations.AddField(model_name='article', name='content_format', field=models.CharField(choices=[('markdown', 'Markdown'), ('html', 'HTML')], default='markdown', max_length=10)),
        migrations.CreateModel(name='ArticleAsset', fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('role', models.CharField(choices=[('source', '原文件'), ('preview', '安全预览'), ('material', '正文素材'), ('package', '原始素材包')], max_length=20)),
            ('article', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asset_references', to='article.article')),
            ('asset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='article_references', to='assets.asset')),
        ], options={'constraints': [models.UniqueConstraint(fields=('article', 'asset', 'role'), name='unique_article_asset_role')]}),
    ]
