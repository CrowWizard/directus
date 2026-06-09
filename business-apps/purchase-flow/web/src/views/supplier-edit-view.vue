<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSupplier, updateSupplier } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityFormCard from '../components/entity-form-card.vue';
import type { Supplier } from '../types/purchase-flow';
import { supplierFields } from './entity-fields';

const route = useRoute();
const router = useRouter();
const supplier = ref<Supplier | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const requestController = new AbortController();

function getId() {
	return String(route.params.id || '');
}

async function load() {
	loading.value = true;
	error.value = '';

	try {
		supplier.value = await getSupplier(getId(), requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	} finally {
		loading.value = false;
	}
}

async function save(payload: Record<string, unknown>) {
	submitting.value = true;
	error.value = '';

	try {
		await updateSupplier(getId(), payload, requestController.signal);
		await router.push('/suppliers');
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商保存失败';
	} finally {
		submitting.value = false;
	}
}

onMounted(load);

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Suppliers</p>
				<h2>编辑供应商</h2>
			</div>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载供应商...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else class="form-page">
			<EntityFormCard
				:fields="supplierFields"
				:initial-item="supplier"
				primary-label="保存修改"
				:submitting="submitting"
				title="供应商信息"
				@cancel="router.push('/suppliers')"
				@submit="save"
			/>
		</div>
	</AppShell>
</template>
