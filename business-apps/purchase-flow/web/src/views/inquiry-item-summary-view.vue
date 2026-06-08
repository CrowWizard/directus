<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { get询价项Summary } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import InquiryItemKeyInfo from '../components/inquiry-item-key-info.vue';
import QuoteSummaryTable from '../components/quote-summary-table.vue';
import type { InquiryItem } from '../types/purchase-flow';

const route = useRoute();
const item = ref<InquiryItem | null>(null);
const loading = ref(true);
const error = ref('');

const requestController = new AbortController();

onMounted(async () => {
	try {
		item.value = await get询价项Summary(String(route.params.id), requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '询价项摘要加载失败';
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Summary</p>
				<h2>询价项摘要</h2>
			</div>
			<RouterLink v-if="item" class="text-link" :to="`/inquiry-items/${item.id}/detail`">查看完整详情</RouterLink>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载询价项...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else-if="item" class="detail-grid">
			<InquiryItemKeyInfo :item="item" />
			<QuoteSummaryTable :quotes="item.supplier_quotes || []" />
		</div>
	</AppShell>
</template>
