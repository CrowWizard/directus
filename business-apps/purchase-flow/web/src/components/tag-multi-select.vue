<script setup lang="ts">
type TagOption = {
	id: string;
	tag_name?: string | null;
	enabled?: boolean | null;
};

const model = defineModel<string[]>({ default: () => [] });

defineProps<{
	disabled?: boolean;
	label: string;
	options: TagOption[];
}>();

function optionValue(option: TagOption) {
	return option.tag_name || '';
}
</script>

<template>
	<fieldset class="tag-multi-select" :disabled="disabled">
		<legend>{{ label }}</legend>
		<div v-if="options.length" class="tag-multi-select__options">
			<label v-for="option in options" :key="option.id" class="tag-multi-select__option">
				<input v-model="model" type="checkbox" :value="optionValue(option)" :disabled="disabled || !optionValue(option)" />
				<span>{{ option.tag_name || option.id }}</span>
			</label>
		</div>
		<p v-else class="muted">暂无启用 Tag，请先到 Tag 管理维护。</p>
	</fieldset>
</template>
