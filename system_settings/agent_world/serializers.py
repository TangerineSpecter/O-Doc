from django.db import transaction
from rest_framework import serializers
from .models import WorldCategory, WorldProfession, WorldProfessionCategory, WorldIncomeConfig, WorldLedger, WorldMonthSettlement, WorldIncomeEvent


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldCategory
        fields = '__all__'
        read_only_fields = ['id', 'updated_at']


class BonusSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldProfessionCategory
        fields = ['category', 'percentage']


class ProfessionSerializer(serializers.ModelSerializer):
    bonuses = BonusSerializer(many=True)

    class Meta:
        model = WorldProfession
        fields = ['id', 'name', 'description', 'enabled', 'bonuses']
        read_only_fields = ['id']

    def validate_bonuses(self, value):
        ids = [b['category'].pk for b in value]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError('同一职业不能重复绑定分类')
        return value

    @transaction.atomic
    def create(self, validated_data):
        bonuses = validated_data.pop('bonuses', [])
        profession = super().create(validated_data)
        self._save_bonuses(profession, bonuses)
        return profession

    @transaction.atomic
    def update(self, instance, validated_data):
        bonuses = validated_data.pop('bonuses', None)
        instance = super().update(instance, validated_data)
        if bonuses is not None:
            self._save_bonuses(instance, bonuses)
        return instance

    def _save_bonuses(self, instance, bonuses):
        # Stable mapping identity avoids duplicate offline creations.
        instance.bonuses.exclude(category_id__in=[b['category'].pk for b in bonuses]).delete()
        for bonus in bonuses:
            WorldProfessionCategory.objects.update_or_create(pk=f'{instance.pk}:{bonus["category"].pk}',
                defaults={'profession': instance, **bonus})


class IncomeConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldIncomeConfig
        fields = '__all__'
        read_only_fields = ['id', 'effective_at']


class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldLedger
        fields = '__all__'


class SettlementSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldMonthSettlement
        fields = '__all__'


class IncomeEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldIncomeEvent
        fields = '__all__'
