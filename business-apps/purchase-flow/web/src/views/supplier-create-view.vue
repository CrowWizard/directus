<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createSupplier } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityFormCard from '../components/entity-form-card.vue';
import { supplierFields } from './entity-fields';

const router = useRouter();
const submitting = ref(false);
const error = ref('');
const requestController = new AbortController();

async function save(payload: Record<string, unknown>) {
	submitting.value = true;
	error.value = '';

	try {
		await createSupplier(payload, requestController.signal);
		await router.push('/suppliers');
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商创建失败';
	} finally {
		submitting.value = false;
	}
}

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Suppliers</p>
				<h2>新增供应商</h2>
			</div>
		</section>
		<p v-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div class="form-page">
			<EntityFormCard
				:fields="supplierFields"
				primary-label="创建供应商"
				:submitting="submitting"
				title="供应商信息"
				@cancel="router.push('/suppliers')"
				@submit="save"
			/>
		</div>
	</AppShell>
</template>
