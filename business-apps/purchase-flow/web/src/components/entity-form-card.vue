<script setup lang="ts">
import { reactive, watch } from 'vue';

export type EntityFormField = {
	key: string;
	label: string;
	type?: 'text' | 'email' | 'url' | 'tel' | 'number' | 'search' | 'password' | 'date';
	autocomplete?: string;
	inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
};

type Entity = { id?: string; [key: string]: unknown };

const props = defineProps<{
	fields: EntityFormField[];
	initialItem?: Entity | null;
	primaryLabel: string;
	submitting?: boolean;
	title: string;
}>();

const emit = defineEmits<{
	cancel: [];
	submit: [payload: Record<string, unknown>];
}>();

const form = reactive<Record<string, unknown>>({});

function reset() {
	for (const field of props.fields) {
		form[field.key] = props.initialItem?.[field.key] ?? '';
	}
}

function submit() {
	if (props.submitting) return;
	emit('submit', { ...form });
}

watch(() => props.initialItem, reset, { deep: true, immediate: true });
</script>

<template>
	<form class="entity-form entity-form--standalone" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="submit">
		<h3>{{ title }}</h3>
		<label v-for="field in fields" :key="field.key" :for="`field-${field.key}`">
			{{ field.label }}
			<input
				:id="`field-${field.key}`"
				v-model="form[field.key]"
				:name="field.key"
				:type="field.type || 'text'"
				:autocomplete="field.autocomplete"
				:inputmode="field.inputmode"
				:disabled="submitting"
			/>
		</label>
		<div class="form-actions">
			<button type="submit" :disabled="submitting">{{ submitting ? '保存中...' : primaryLabel }}</button>
			<button type="button" class="ghost-button" :disabled="submitting" @click="$emit('cancel')">取消</button>
		</div>
	</form>
</template>
