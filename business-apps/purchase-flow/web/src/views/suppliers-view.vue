<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityCrudTable from '../components/entity-crud-table.vue';
import type { Supplier } from '../types/purchase-flow';

const fields = [
	{ key: 'supplier_code', label: '供应商编码', autocomplete: 'off' },
	{ key: 'supplier_name', label: '供应商名称', autocomplete: 'organization' },
	{ key: 'supplier_type', label: '类型', autocomplete: 'off' },
	{ key: 'country', label: '国家', autocomplete: 'country-name' },
	{ key: 'tax_rate', label: '税率', type: 'number' as const, autocomplete: 'off', inputmode: 'decimal' as const },
	{ key: 'payment_term', label: '付款条件', autocomplete: 'off' },
	{ key: 'website', label: '网站', type: 'url' as const, autocomplete: 'url' },
	{ key: 'status', label: '状态', autocomplete: 'off' },
	{ key: 'remark', label: '备注', autocomplete: 'off' },
];

const suppliers = ref<Supplier[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const formVersion = ref(0);

const requestController = new AbortController();

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		suppliers.value = await listSuppliers(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	} finally {
		loading.value = false;
	}
}

async function save(payload: Record<string, unknown>, id: string | null) {
	submitting.value = true;
	error.value = '';

	try {
		const signal = requestController.signal;
		if (id) await updateSupplier(id, payload, signal);
		else await createSupplier(payload, signal);

		formVersion.value += 1;
		await load(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商保存失败';
	} finally {
		submitting.value = false;
	}
}

async function remove(id: string) {
	submitting.value = true;
	error.value = '';

	try {
		await deleteSupplier(id, requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商删除失败';
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
				<p class="eyebrow">Suppliers</p>
				<h2>供应商管理</h2>
			</div>
		</section>
		<EntityCrudTable
			:error="error"
			:fields="fields"
			:items="suppliers"
			:loading="loading"
			:reset-key="formVersion"
			:submitting="submitting"
			title="供应商"
			@delete="remove"
			@submit="save"
		/>
	</AppShell>
</template>
