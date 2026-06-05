<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityCrudTable from '../components/entity-crud-table.vue';
import type { Customer } from '../types/purchase-flow';

const fields = [
	{ key: 'customer_code', label: '客户编码' },
	{ key: 'customer_name', label: '客户名称' },
	{ key: 'country', label: '国家' },
	{ key: 'address', label: '地址' },
	{ key: 'website', label: '网站' },
	{ key: 'status', label: '状态' },
	{ key: 'remark', label: '备注' },
];

const customers = ref<Customer[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
	loading.value = true;
	error.value = '';

	try {
		customers.value = await listCustomers();
	} catch (err) {
		error.value = err instanceof Error ? err.message : '客户加载失败';
	} finally {
		loading.value = false;
	}
}

async function save(payload: Record<string, unknown>, id: string | null) {
	if (id) await updateCustomer(id, payload);
	else await createCustomer(payload);

	await load();
}

async function remove(id: string) {
	await deleteCustomer(id);
	await load();
}

onMounted(load);
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Customers</p>
				<h2>客户管理</h2>
			</div>
		</section>
		<EntityCrudTable
			:error="error"
			:fields="fields"
			:items="customers"
			:loading="loading"
			title="客户"
			@delete="remove"
			@submit="save"
		/>
	</AppShell>
</template>
