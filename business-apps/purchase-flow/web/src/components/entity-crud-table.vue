<script setup lang="ts">
import { reactive, ref } from 'vue';

type Entity = { id: string; [key: string]: unknown };
type Field = { key: string; label: string; type?: string };

const props = defineProps<{
	error: string;
	fields: Field[];
	items: Entity[];
	loading: boolean;
	title: string;
}>();

const emit = defineEmits<{
	delete: [id: string];
	submit: [payload: Record<string, unknown>, id: string | null];
}>();

const editingId = ref<string | null>(null);
const form = reactive<Record<string, unknown>>({});

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
	emit('submit', { ...form }, editingId.value);
	reset();
}

reset();
</script>

<template>
	<section class="crud-layout">
		<form class="entity-form" @submit.prevent="submit">
			<h3>{{ editingId ? '编辑' : '新增' }}{{ title }}</h3>
			<label v-for="field in fields" :key="field.key">
				{{ field.label }}
				<input v-model="form[field.key]" :name="field.key" :type="field.type || 'text'" />
			</label>
			<div class="form-actions">
				<button type="submit">{{ editingId ? '保存修改' : '新增' }}</button>
				<button v-if="editingId" type="button" class="ghost-button" @click="reset">取消</button>
			</div>
		</form>

		<div class="table-card">
			<p v-if="loading" class="muted">正在加载...</p>
			<p v-else-if="error" class="error">{{ error }}</p>
			<p v-else-if="items.length === 0" class="muted">暂无数据。</p>
			<table v-else>
				<thead>
					<tr>
						<th v-for="field in fields" :key="field.key">{{ field.label }}</th>
						<th>操作</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in items" :key="item.id">
						<td v-for="field in fields" :key="field.key">{{ item[field.key] || '-' }}</td>
						<td class="row-actions">
							<button type="button" class="ghost-button" :data-test="`edit-${item.id}`" @click="edit(item)">
								编辑
							</button>
							<button
								type="button"
								class="danger-button"
								:data-test="`delete-${item.id}`"
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
