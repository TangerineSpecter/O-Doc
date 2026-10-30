from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('quant', '0033_mt4_attachment_note')]
    operations = [
        migrations.AddIndex('entry', models.Index(fields=['anthology', '-updated_at', '-id', 'is_valid'], name='quant_entry_read_idx')),
        migrations.AddIndex('researchreport', models.Index(fields=['entry', '-created_at', '-id'], name='quant_report_read_idx')),
        migrations.AddIndex('reportrevision', models.Index(fields=['report', '-created_at', '-id'], name='quant_revision_read_idx')),
        migrations.AddIndex('codeversion', models.Index(fields=['implementation', '-created_at', '-id'], name='quant_version_read_idx')),
        migrations.AddIndex('airun', models.Index(fields=['entry', 'status', '-created_at', '-id'], name='quant_run_status_idx')),
        migrations.AddIndex('entry', models.Index(fields=['anthology','title','id','is_valid'], name='quant_entry_title_idx')),
        migrations.AddIndex('airun', models.Index(fields=['entry','-created_at','-id'], name='quant_run_history_idx')),
    ]
