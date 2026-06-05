<template>
	<app-shell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Suppliers</p>
				<h2>供应商管理</h2>
			</div>
		</section>
		<entity-crud-table
			:error="error"
			:fields="fields"
			:items="suppliers"
			:loading="loading"
			title="供应商"
			@delete="remove"
			@submit="save"
		/>
	</app-shell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppShell from '../components/app-shell.vue';
import EntityCrudTable from '../components/entity-crud-table.vue';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../api/purchase-flow';
import type { Supplier } from '../types/purchase-flow';

const fields = [
	{ key: 'supplier_code', label: '供应商编码' },
	{ key: 'supplier_name', label: '供应商名称' },
	{ key: 'supplier_type', label: '类型' },
	{ key: 'country', label: '国家' },
	{ key: 'tax_rate', label: '税率', type: 'number' },
	{ key: 'payment_term', label: '付款条件' },
	{ key: 'website', label: '网站' },
	{ key: 'status', label: '状态' },
	{ key: 'remark', label: '备注' },
];

const suppliers = ref<Supplier[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
	loading.value = true;
	error.value = '';

	try {
		suppliers.value = await listSuppliers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	} finally {
		loading.value = false;
	}
}

async function save(payload: Record<string, unknown>, id: string | null) {
	if (id) await updateSupplier(id, payload);
	else await createSupplier(payload);

	await load();
}

async function remove(id: string) {
	await deleteSupplier(id);
	await load();
}

onMounted(load);
</script>
