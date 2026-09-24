from rest_framework import serializers

from article.models import ArticleVersion


class ArticleVersionSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleVersion
        fields = [
            'version_id', 'title', 'source', 'operator_id', 'word_count', 'created_at',
        ]


class ArticleVersionDetailSerializer(serializers.ModelSerializer):
    article_id = serializers.CharField(read_only=True)

    class Meta:
        model = ArticleVersion
        fields = [
            'version_id', 'article_id', 'title', 'content', 'coll_id',
            'category_id', 'tag_ids', 'post_summary', 'word_count',
            'operator_id', 'source', 'created_at',
        ]
