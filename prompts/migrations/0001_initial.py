from django.db import migrations, models
import django.db.models.deletion
import utils.id_generator


class Migration(migrations.Migration):
    initial = True

    dependencies = [('assets', '0004_add_prompt_source_type')]

    operations = [
        migrations.CreateModel(
            name='PromptCategory',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_taxonomy_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, default='admin', max_length=50)),
                ('name', models.CharField(max_length=50)), ('description', models.CharField(blank=True, default='', max_length=200)),
                ('color', models.CharField(blank=True, default='orange', max_length=20)), ('sort', models.IntegerField(default=0)),
                ('is_valid', models.BooleanField(default=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ], options={'db_table': 'prompt_categories', 'ordering': ['sort', 'name']},
        ),
        migrations.CreateModel(
            name='PromptTheme',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_taxonomy_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, default='admin', max_length=50)), ('name', models.CharField(max_length=50)),
                ('description', models.CharField(blank=True, default='', max_length=200)), ('color', models.CharField(blank=True, default='orange', max_length=20)),
                ('sort', models.IntegerField(default=0)), ('is_valid', models.BooleanField(default=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ], options={'db_table': 'prompt_themes', 'ordering': ['sort', 'name']},
        ),
        migrations.CreateModel(
            name='PromptTag',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_taxonomy_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, default='admin', max_length=50)), ('name', models.CharField(max_length=50)),
                ('description', models.CharField(blank=True, default='', max_length=200)), ('color', models.CharField(blank=True, default='orange', max_length=20)),
                ('sort', models.IntegerField(default=0)), ('is_valid', models.BooleanField(default=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ], options={'db_table': 'prompt_tags', 'ordering': ['sort', 'name']},
        ),
        migrations.CreateModel(
            name='PromptTemplate',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_template_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, default='admin', max_length=50)), ('title', models.CharField(max_length=120)),
                ('description', models.CharField(blank=True, default='', max_length=500)),
                ('prompt_type', models.CharField(choices=[('image', '生图'), ('html_report', 'HTML 报告'), ('general', '通用提示词')], default='image', max_length=20)),
                ('positive_template', models.TextField()), ('negative_template', models.TextField(blank=True, default='')),
                ('field_schema_version', models.PositiveSmallIntegerField(default=1)), ('field_schema', models.JSONField(blank=True, default=list)),
                ('is_favorite', models.BooleanField(default=False)), ('is_valid', models.BooleanField(default=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='templates', to='prompts.promptcategory')),
            ], options={'db_table': 'prompt_templates', 'ordering': ['-is_favorite', '-updated_at']},
        ),
        migrations.AddIndex(model_name='prompttemplate', index=models.Index(fields=['user_id', 'is_valid', 'updated_at'], name='prompt_temp_user_id_059ed8_idx')),
        migrations.CreateModel(
            name='PromptUsage',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_usage_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('input_values', models.JSONField(blank=True, default=dict)), ('rendered_positive', models.TextField()), ('rendered_negative', models.TextField(blank=True, default='')),
                ('model_name', models.CharField(blank=True, default='', max_length=120)), ('note', models.CharField(blank=True, default='', max_length=500)),
                ('source_url', models.URLField(blank=True, default='', max_length=500)), ('is_valid', models.BooleanField(default=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='usages', to='prompts.prompttemplate')),
            ], options={'db_table': 'prompt_usages', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='PromptTemplateTheme',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_template_theme_id, editable=False, max_length=32, primary_key=True, serialize=False)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='theme_links', to='prompts.prompttemplate')),
                ('theme', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='template_links', to='prompts.prompttheme')),
            ], options={'db_table': 'prompt_template_themes'},
        ),
        migrations.CreateModel(
            name='PromptTemplateTag',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_template_tag_id, editable=False, max_length=32, primary_key=True, serialize=False)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tag', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='template_links', to='prompts.prompttag')),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tag_links', to='prompts.prompttemplate')),
            ], options={'db_table': 'prompt_template_tags'},
        ),
        migrations.CreateModel(
            name='PromptResultImage',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_prompt_result_image_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('caption', models.CharField(blank=True, default='', max_length=300)), ('sort', models.IntegerField(default=0)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='prompt_result_images', to='assets.asset')),
                ('usage', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='result_images', to='prompts.promptusage')),
            ], options={'db_table': 'prompt_result_images', 'ordering': ['sort', 'created_at']},
        ),
        migrations.AddField(model_name='prompttemplate', name='themes', field=models.ManyToManyField(related_name='templates', through='prompts.PromptTemplateTheme', to='prompts.prompttheme')),
        migrations.AddField(model_name='prompttemplate', name='tags', field=models.ManyToManyField(related_name='templates', through='prompts.PromptTemplateTag', to='prompts.prompttag')),
        migrations.AddField(model_name='prompttemplate', name='cover_result_image', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='prompts.promptresultimage')),
        migrations.AddConstraint(model_name='promptcategory', constraint=models.UniqueConstraint(fields=('user_id', 'name'), name='prompt_category_user_name_unique')),
        migrations.AddConstraint(model_name='prompttheme', constraint=models.UniqueConstraint(fields=('user_id', 'name'), name='prompt_theme_user_name_unique')),
        migrations.AddConstraint(model_name='prompttag', constraint=models.UniqueConstraint(fields=('user_id', 'name'), name='prompt_tag_user_name_unique')),
        migrations.AddConstraint(model_name='prompttemplatetheme', constraint=models.UniqueConstraint(fields=('template', 'theme'), name='prompt_template_theme_unique')),
        migrations.AddConstraint(model_name='prompttemplatetag', constraint=models.UniqueConstraint(fields=('template', 'tag'), name='prompt_template_tag_unique')),
        migrations.AddConstraint(model_name='promptresultimage', constraint=models.UniqueConstraint(fields=('usage', 'asset'), name='prompt_usage_asset_unique')),
    ]
