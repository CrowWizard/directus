<script setup lang="ts">
import { reactive, ref, watch } from 'vue';

type Entity = { id: string; [key: string]: unknown };
type Field = {
	key: string;
	label: string;
	type?: 'text' | 'email' | 'url' | 'tel' | 'number' | 'search' | 'password' | 'date';
	autocomplete?: string;
	inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
};

const props = defineProps<{
	error: string;
	fields: Field[];
	items: Entity[];
	loading: boolean;
	resetKey?: number;
	submitting?: boolean;
	title: string;
}>();

const emit = defineEmits<{
	delete: [id: string];
	submit: [payload: Record<string, unknown>, id: string | null];
}>();

const editingId = ref<string | null>(null);
const form = reactive<Record<string, unknown>>({});
let lastResetKey = props.resetKey ?? 0;

function reset() {
	editingId.value = null;

	for (const field of props.fields) {
		form[field.key] = '';
	}
}

function edit(item: Entity) {
	editingId.value = item.id;

	for (const field of props.fields) {
		form[field.key] = item[field.key] || '';
	}
}

function submit() {
	if (props.submitting) return;
	emit('submit', { ...form }, editingId.value);
}

watch(
	() => props.resetKey ?? 0,
	(key) => {
		if (key !== lastResetKey) {
			lastResetKey = key;
			reset();
		}
	},
);

watch(
	() => props.fields,
	() => reset(),
	{ deep: true },
);

reset();
</script>

<template>
	<section class="crud-layout">
		<form class="entity-form" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="submit">
			<h3>{{ editingId ? '编辑' : '新增' }}{{ title }}</h3>
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
				<button type="submit" :disabled="submitting">{{ submitting ? '保存中...' : (editingId ? '保存修改' : '新增') }}</button>
				<button v-if="editingId" type="button" class="ghost-button" :disabled="submitting" @click="reset">取消</button>
			</div>
		</form>

		<div class="table-card">
			<p v-if="loading" class="muted" role="status" aria-live="polite" aria-busy="true">正在加载...</p>
			<p v-else-if="error" class="error" role="status" aria-live="polite">{{ error }}</p>
			<p v-else-if="items.length === 0" class="muted" role="status" aria-live="polite">尚无数据</p>
			<table v-else>
				<thead>
					<tr>
						<th v-for="field in fields" :key="field.key" scope="col">{{ field.label }}</th>
						<th scope="col">操作</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in items" :key="item.id">
						<td v-for="field in fields" :key="field.key">{{ item[field.key] || '-' }}</td>
						<td class="row-actions">
							<button
								type="button"
								class="ghost-button"
								:data-test="`edit-${item.id}`"
								:disabled="submitting"
								@click="edit(item)"
							>
								编辑
							</button>
							<button
								type="button"
								class="danger-button"
								:data-test="`delete-${item.id}`"
								:disabled="submitting"
								@click="$emit('delete', item.id)"
							>
								删除
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>
</template>
