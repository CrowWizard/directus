<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { createPurchaseTag, deletePurchaseTag, listPurchaseTags, updatePurchaseTag } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import { useAuthStore } from '../stores/auth';
import type { PurchaseTag } from '../types/purchase-flow';

const auth = useAuthStore();
const tags = ref<PurchaseTag[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const editingId = ref('');
const pendingDeleteId = ref('');

const requestController = new AbortController();

const form = reactive({
	tag_name: '',
	enabled: true,
});

const enabledTags = computed(() => tags.value.filter((tag) => tag.enabled !== false));

function reset() {
	editingId.value = '';
	form.tag_name = '';
	form.enabled = true;
}

function edit(tag: PurchaseTag) {
	editingId.value = tag.id;
	pendingDeleteId.value = '';
	form.tag_name = tag.tag_name || '';
	form.enabled = tag.enabled !== false;
}

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		tags.value = await listPurchaseTags(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : 'Tag 加载失败';
	} finally {
		loading.value = false;
	}
}

async function save() {
	if (!auth.isManager || submitting.value || !form.tag_name.trim()) return;

	submitting.value = true;
	error.value = '';

	const payload = {
		enabled: form.enabled,
		tag_name: form.tag_name.trim(),
	};

	try {
		if (editingId.value) {
			await updatePurchaseTag(editingId.value, payload, requestController.signal);
		} else {
			await createPurchaseTag(payload, requestController.signal);
		}

		reset();
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : 'Tag 保存失败';
	} finally {
		submitting.value = false;
	}
}

async function remove(tag: PurchaseTag) {
	if (!auth.isManager || submitting.value) return;

	if (pendingDeleteId.value !== tag.id) {
		pendingDeleteId.value = tag.id;
		return;
	}

	submitting.value = true;
	error.value = '';

	try {
		await deletePurchaseTag(tag.id, requestController.signal);
		pendingDeleteId.value = '';
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : 'Tag 删除失败';
	} finally {
		submitting.value = false;
	}
}

onMounted(() => {
	load(requestController.signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Tags</p>
				<h2>Tag 管理</h2>
			</div>
			<p class="muted">Tag 可设置到询价项 tags 和采购员 tags，用于自动分配询价单。</p>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载 Tag...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else class="management-stack">
			<form class="entity-form" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="save">
				<h3>{{ editingId ? '编辑 Tag' : '新增 Tag' }}</h3>
				<label for="tag-name">Tag 名称<input id="tag-name" v-model="form.tag_name" name="tag_name" autocomplete="off" required :disabled="submitting" placeholder="electronics" /></label>
				<label class="inline-check"><input v-model="form.enabled" name="enabled" type="checkbox" :disabled="submitting" /> 启用</label>
				<div class="form-actions">
					<button type="submit" :disabled="submitting || !auth.isManager">{{ submitting ? '保存中...' : (editingId ? '保存修改' : '新增 Tag') }}</button>
					<button v-if="editingId" type="button" class="ghost-button" :disabled="submitting" @click="reset">取消</button>
				</div>
			</form>

			<div class="table-card">
				<section class="summary-strip" aria-label="Tag 统计">
					<article class="summary-tile"><span>Tag 总数</span><strong>{{ tags.length }}</strong></article>
					<article class="summary-tile"><span>启用 Tag</span><strong>{{ enabledTags.length }}</strong></article>
				</section>
				<table>
					<thead><tr><th scope="col">名称</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
					<tbody>
						<tr v-for="tag in tags" :key="tag.id">
							<td>{{ tag.tag_name || '-' }}</td>
							<td>{{ tag.enabled === false ? '停用' : '启用' }}</td>
							<td class="row-actions">
								<button type="button" class="ghost-button" :disabled="submitting" @click="edit(tag)">编辑</button>
								<button type="button" class="danger-button" :disabled="submitting" @click="remove(tag)">{{ pendingDeleteId === tag.id ? '确认删除' : '删除' }}</button>
								<button v-if="pendingDeleteId === tag.id" type="button" class="ghost-button" :disabled="submitting" @click="pendingDeleteId = ''">取消</button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</AppShell>
</template>
