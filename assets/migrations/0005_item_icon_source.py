from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('assets', '0004_add_prompt_source_type')]
    operations = [migrations.AlterField(
        model_name='asset', name='source_type',
        field=models.CharField(max_length=20, default='other', choices=[
            ('attachment', '附件'), ('content', '内容'), ('image', '图片文集'),
            ('prompt', '提示词效果'), ('item_icon', '物品图标'), ('other', '其他')],
            verbose_name='资源来源类型', db_comment='资源来源类型'),
    )]
